import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { GeographyNode } from '../types/census';

export interface MapItemPoint {
  geo: GeographyNode;
  value?: number | null;
  formattedValue?: string;
  secondaryLabel?: string;
  color: string;
  radius?: number;
  isSelected?: boolean;
  tooltipHtml?: string;
}

interface InteractiveAgMapProps {
  items: MapItemPoint[];
  selectedGeoId?: string | null;
  onSelectGeo?: (geoId: string) => void;
  height?: string;
  focusGeo?: GeographyNode | null;
  legendElement?: React.ReactNode;
  preferPolygons?: boolean;
}

type CanadaSubRegion = 'auto' | 'west' | 'central' | 'atlantic' | 'full_on';

// Cache GeoJSON boundaries in memory once loaded so map switches are instantaneous
let cachedGeoJson: any = null;
let geoJsonPromise: Promise<any> | null = null;

export function loadBoundariesGeoJson(): Promise<any> {
  if (cachedGeoJson) return Promise.resolve(cachedGeoJson);
  if (!geoJsonPromise) {
    geoJsonPromise = fetch('/data/ag_boundaries.geojson')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        cachedGeoJson = data;
        return data;
      })
      .catch(() => null);
  }
  return geoJsonPromise;
}

function extractPolygonRings(geom: any): number[][][] {
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') {
    const all: number[][][] = [];
    for (const poly of geom.coordinates) {
      for (const ring of poly) all.push(ring);
    }
    return all;
  }
  return [];
}

// Far-northern unorganized wilderness CDs with negligible or suppressed agriculture that stretch to 60°N–63°N
const FAR_NORTH_WILDERNESS_DGUIDS = new Set<string>([
  '2021A00031010', // Labrador
  '2021A00031011', // Nunatsiavut
  '2021A00032499', // Nord-du-Québec
  '2021A00032496', // Côte-Nord (far eastern/northern)
  '2021A00033560', // Kenora (far northern Hudson Bay portion when in national belt view)
  '2021A00034619', // Division No. 19, MB
  '2021A00034621', // Division No. 21, MB
  '2021A00034622', // Division No. 22, MB
  '2021A00034623', // Division No. 23, MB
  '2021A00034718', // Division No. 18, SK
  '2021A00034816', // Division No. 16 (Wood Buffalo), AB
  '2021A00035957', // Stikine, BC
  '2021A00035959'  // Northern Rockies, BC
]);

const CANADIAN_PROVINCE_ANCHORS: Array<{
  uid: string;
  abbr: string;
  name: string;
  lat: number;
  lon: number;
}> = [
  { uid: '59', abbr: 'BC', name: 'British Columbia', lat: 51.8, lon: -122.5 },
  { uid: '48', abbr: 'AB', name: 'Alberta', lat: 52.8, lon: -114.2 },
  { uid: '47', abbr: 'SK', name: 'Saskatchewan', lat: 51.6, lon: -106.0 },
  { uid: '46', abbr: 'MB', name: 'Manitoba', lat: 50.6, lon: -98.2 },
  { uid: '35', abbr: 'ON', name: 'Ontario', lat: 44.3, lon: -79.8 },
  { uid: '24', abbr: 'QC', name: 'Quebec', lat: 46.8, lon: -71.8 },
  { uid: '13', abbr: 'NB', name: 'New Brunswick', lat: 46.6, lon: -66.2 },
  { uid: '12', abbr: 'NS', name: 'Nova Scotia', lat: 45.1, lon: -63.3 },
  { uid: '11', abbr: 'PE', name: 'PEI', lat: 46.4, lon: -63.2 },
  { uid: '10', abbr: 'NL', name: 'Newfoundland', lat: 48.6, lon: -56.0 }
];

/**
 * Clamps northern wilderness vertices of background provincial polygons so Web Mercator
 * does not stretch 60°N–70°N tundra across the top 60% of the map viewport.
 */
function clipFeatureToAgriculturalBelt(feature: any, isAllCanada: boolean): any {
  if (!isAllCanada || !feature?.geometry) return feature;
  const maxLatForLon = (lon: number) => {
    if (lon < -114) return 56.8; // BC Peace River
    if (lon < -95) return 56.2;  // Prairies (AB, SK, MB)
    if (lon < -79) return 50.2;  // Northern Ontario agricultural belt
    return 50.5;                 // Quebec & Atlantic agricultural belt
  };

  const clipRing = (ring: number[][]) =>
    ring.map(([lon, lat]) => [lon, Math.min(lat, maxLatForLon(lon))]);

  if (feature.geometry.type === 'Polygon') {
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: feature.geometry.coordinates.map(clipRing)
      }
    };
  }
  if (feature.geometry.type === 'MultiPolygon') {
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: feature.geometry.coordinates.map((poly: number[][][]) =>
          poly.map(clipRing)
        )
      }
    };
  }
  return feature;
}

function getShortBadgeName(cleanName: string): string {
  // If formatted like "Division No. 8 (Swift Current / Gull Lake)", extract "Div 8 (Swift Current)"
  const divMatch = cleanName.match(/^Division No\.\s*(\d+)\s*\(([^/)]+)/i);
  if (divMatch) {
    return `Div ${divMatch[1]} (${divMatch[2].trim()})`;
  }
  const carMatch = cleanName.match(/^CAR\s*([0-9A-Z]+)\s*\(([^/)]+)/i);
  if (carMatch) {
    return `CAR ${carMatch[1]} (${carMatch[2].trim()})`;
  }
  return cleanName.length > 18 ? `${cleanName.slice(0, 17)}…` : cleanName;
}

export const InteractiveAgMap: React.FC<InteractiveAgMapProps> = ({
  items,
  selectedGeoId,
  onSelectGeo,
  height = '100%',
  focusGeo,
  legendElement,
  preferPolygons = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseTileGroupRef = useRef<L.LayerGroup | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [boundariesLoaded, setBoundariesLoaded] = useState<boolean>(!!cachedGeoJson);
  const [renderMode, setRenderMode] = useState<'choropleth' | 'bubbles'>(
    preferPolygons ? 'choropleth' : 'bubbles'
  );
  const [showWorldBasemap, setShowWorldBasemap] = useState<boolean>(false);
  const [showTopBadges, setShowTopBadges] = useState<boolean>(true);
  const [subRegion, setSubRegion] = useState<CanadaSubRegion>('auto');
  const [ignoreFocusGeo, setIgnoreFocusGeo] = useState<boolean>(false);
  const [hoveredItem, setHoveredItem] = useState<MapItemPoint | null>(null);
  const [hoveredInsetItem, setHoveredInsetItem] = useState<MapItemPoint | null>(null);

  useEffect(() => {
    if (!cachedGeoJson) {
      loadBoundariesGeoJson().then(() => setBoundariesLoaded(true));
    }
  }, []);

  // Whenever focusGeo changes from parent (e.g. user clicked a row in the table), re-enable focus
  useEffect(() => {
    if (focusGeo) {
      setIgnoreFocusGeo(false);
    }
  }, [focusGeo?.id]);

  // Detect whether current items represent All of Canada or Ontario
  const scopeInfo = useMemo(() => {
    const provSet = new Set<string>();
    for (const it of items) {
      if (it.geo.provinceCode && !['60', '61', '62'].includes(it.geo.provinceCode)) {
        provSet.add(it.geo.provinceCode);
      }
    }
    const isAllCanada = provSet.size > 1;
    const isOntarioOnly = provSet.size === 1 && provSet.has('35') && items.length > 8;
    const singleProvCode = provSet.size === 1 ? Array.from(provSet)[0] : null;
    return { isAllCanada, isOntarioOnly, singleProvCode, provSet };
  }, [items]);

  // Reset regional sub-view if scope switches between Canada and a single Province
  useEffect(() => {
    setSubRegion('auto');
  }, [scopeInfo.isAllCanada, scopeInfo.singleProvCode]);

  // Initialize Leaflet map once with fractional zoom so Canada fills the container cleanly
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [49.5, -94.0],
      zoom: 3.6,
      zoomSnap: 0.1,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      minZoom: 2.5,
      maxZoom: 14,
      zoomControl: false,
      attributionControl: false
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    const tileGroup = L.layerGroup().addTo(map);
    const dataGroup = L.layerGroup().addTo(map);

    baseTileGroupRef.current = tileGroup;
    layerGroupRef.current = dataGroup;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      baseTileGroupRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Toggle optional Esri reference street/town tiles only when requested
  useEffect(() => {
    const tileGroup = baseTileGroupRef.current;
    if (!tileGroup) return;
    tileGroup.clearLayers();

    if (showWorldBasemap) {
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 16 }
      ).addTo(tileGroup);
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 16, opacity: 0.7 }
      ).addTo(tileGroup);
    }
  }, [showWorldBasemap]);

  // Render Canada-only base silhouettes, active polygons/bubbles, provincial borders, and #1-#5 rank badges
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    map.invalidateSize();
    group.clearLayers();
    if (items.length === 0) return;

    const itemByDguid = new Map<string, MapItemPoint>();
    const rankByDguid = new Map<string, number>();
    items.forEach((it, idx) => {
      itemByDguid.set(it.geo.dguid, it);
      rankByDguid.set(it.geo.dguid, idx + 1);
    });

    const sampleLevel = items[0]?.geo.level;
    const targetGeoJsonLevel =
      sampleLevel === 'Provinces & Territories'
        ? 'PR'
        : sampleLevel === 'Census Agricultural Regions (CAR)'
        ? 'CAR'
        : sampleLevel === 'Counties / Census Divisions (CD)'
        ? 'CD'
        : null;

    // 1. In Canada-Only mode (default), draw Canadian Provincial Base Silhouettes clipped to the agricultural belt
    if (!showWorldBasemap && cachedGeoJson && cachedGeoJson.features) {
      const prFeatures = cachedGeoJson.features
        .filter((f: any) => {
          if (f.properties?.level !== 'PR') return false;
          const uid = String(f.properties?.uid || '');
          // Never draw northern territories (60, 61, 62) in national/provincial views
          if (['60', '61', '62'].includes(uid)) return false;
          if (!scopeInfo.isAllCanada && scopeInfo.singleProvCode && uid !== scopeInfo.singleProvCode) {
            return false;
          }
          return true;
        })
        .map((f: any) => clipFeatureToAgriculturalBelt(f, scopeInfo.isAllCanada));

      if (prFeatures.length > 0) {
        L.geoJSON({ type: 'FeatureCollection', features: prFeatures } as any, {
          interactive: false,
          style: () => ({
            fillColor: '#DDE6F0',
            fillOpacity: 1,
            color: '#94A3B8',
            weight: 1.0
          })
        }).addTo(group);
      }

      // Render sibling CDs or CARs in the active scope that were filtered out (excluding far-north tundra in national view)
      if (targetGeoJsonLevel === 'CD' || targetGeoJsonLevel === 'CAR') {
        const backgroundSiblings = cachedGeoJson.features.filter((f: any) => {
          if (f.properties?.level !== targetGeoJsonLevel) return false;
          const dguid = String(f.properties?.dguid || '');
          if (itemByDguid.has(dguid)) return false;
          const uid = String(f.properties?.uid || '');
          const provUid = uid.slice(0, 2);
          if (['60', '61', '62'].includes(provUid)) return false;
          if (scopeInfo.isAllCanada && FAR_NORTH_WILDERNESS_DGUIDS.has(dguid)) return false;
          return scopeInfo.isAllCanada || scopeInfo.singleProvCode === provUid;
        });

        if (backgroundSiblings.length > 0) {
          L.geoJSON({ type: 'FeatureCollection', features: backgroundSiblings } as any, {
            interactive: false,
            style: () => ({
              fillColor: '#E2E8F0',
              fillOpacity: 0.9,
              color: '#FFFFFF',
              weight: 0.65
            })
          }).addTo(group);
        }
      }
    }

    const boundsPts: [number, number][] = [];
    let renderedPolygons = 0;

    // 2. Render active Choropleth Polygons (excluding far-northern tundra polygons in All-Canada belt view unless they are in the top 50)
    if (renderMode === 'choropleth' && cachedGeoJson && cachedGeoJson.features) {
      const matchingFeatures = cachedGeoJson.features
        .filter((f: any) => {
          const dguid = String(f.properties?.dguid || '');
          if (!itemByDguid.has(dguid)) return false;
          if (
            scopeInfo.isAllCanada &&
            subRegion === 'auto' &&
            FAR_NORTH_WILDERNESS_DGUIDS.has(dguid) &&
            (rankByDguid.get(dguid) || 999) > 30
          ) {
            return false;
          }
          return true;
        })
        .map((f: any) => clipFeatureToAgriculturalBelt(f, scopeInfo.isAllCanada));

      if (matchingFeatures.length > 0) {
        renderedPolygons = matchingFeatures.length;
        const geoJsonLayer = L.geoJSON(
          { type: 'FeatureCollection', features: matchingFeatures } as any,
          {
            style: (feature) => {
              const dguid = feature?.properties?.dguid;
              const it = itemByDguid.get(dguid);
              const isSel = it?.isSelected || it?.geo.id === selectedGeoId || dguid === selectedGeoId;
              return {
                fillColor: it?.color || '#0F3D6E',
                fillOpacity: isSel ? 0.96 : 0.88,
                color: isSel ? '#071D49' : '#FFFFFF',
                weight: isSel ? 2.6 : scopeInfo.isAllCanada ? 0.7 : 1.15
              };
            },
            onEachFeature: (feature, layer) => {
              const dguid = feature?.properties?.dguid;
              const it = itemByDguid.get(dguid);
              if (!it) return;
              const html =
                it.tooltipHtml ||
                `<div style="font-family:Inter,sans-serif;padding:5px 7px;min-width:175px">
                  <div style="font-weight:800;color:#0F3D6E;font-size:12.5px">${it.geo.cleanName}</div>
                  <div style="font-size:11px;color:#475569;margin-top:1px">${it.geo.provinceName} • ${it.geo.level}</div>
                  ${
                    it.formattedValue
                      ? `<div style="font-weight:800;color:#0F172A;font-size:13.5px;margin-top:4px">${it.formattedValue}</div>`
                      : ''
                  }
                  ${
                    it.secondaryLabel
                      ? `<div style="font-size:11px;font-weight:600;color:#328475;margin-top:2px">${it.secondaryLabel}</div>`
                      : ''
                  }
                </div>`;
              layer.bindTooltip(html, { sticky: true, direction: 'top', opacity: 0.97 });
              layer.on('mouseover', () => setHoveredItem(it));
              layer.on('mouseout', () => setHoveredItem(null));
              layer.on('click', () => {
                if (onSelectGeo) onSelectGeo(it.geo.id);
              });
            }
          }
        );
        geoJsonLayer.addTo(group);
      }
    }

    // 3. Crisp Canadian Provincial Boundary Overlay on top of CD/CAR polygons
    if (
      renderMode === 'choropleth' &&
      cachedGeoJson &&
      cachedGeoJson.features &&
      (targetGeoJsonLevel === 'CD' || targetGeoJsonLevel === 'CAR')
    ) {
      const prOverlayFeatures = cachedGeoJson.features
        .filter((f: any) => {
          if (f.properties?.level !== 'PR') return false;
          const uid = String(f.properties?.uid || '');
          return scopeInfo.isAllCanada
            ? !['60', '61', '62'].includes(uid)
            : scopeInfo.singleProvCode === uid;
        })
        .map((f: any) => clipFeatureToAgriculturalBelt(f, scopeInfo.isAllCanada));

      if (prOverlayFeatures.length > 0) {
        L.geoJSON({ type: 'FeatureCollection', features: prOverlayFeatures } as any, {
          interactive: false,
          style: () => ({
            fill: false,
            color: '#334155',
            weight: scopeInfo.isAllCanada ? 1.2 : 1.5,
            opacity: 0.65
          })
        }).addTo(group);
      }
    }

    // 4. For any item not covered by a polygon (e.g. CCS townships or when in bubbles mode), draw circleMarkers
    for (const it of items) {
      if (it.geo.lat && it.geo.lon && !['60', '61', '62'].includes(it.geo.provinceCode)) {
        boundsPts.push([it.geo.lat, it.geo.lon]);
      }
      if (
        renderMode === 'choropleth' &&
        renderedPolygons > 0 &&
        it.geo.level !== 'Townships / Subdivisions (CCS)'
      ) {
        continue;
      }
      if (!it.geo.lat || !it.geo.lon) continue;

      const isSel = it.isSelected || it.geo.id === selectedGeoId;
      const marker = L.circleMarker([it.geo.lat, it.geo.lon], {
        radius: isSel ? (it.radius || 8) + 3 : it.radius || 6.5,
        fillColor: it.color,
        fillOpacity: isSel ? 0.95 : 0.85,
        color: isSel ? '#071D49' : '#FFFFFF',
        weight: isSel ? 2.5 : 1.2
      });

      const html =
        it.tooltipHtml ||
        `<div style="font-family:Inter,sans-serif;padding:5px 7px;min-width:175px">
          <div style="font-weight:800;color:#0F3D6E;font-size:12.5px">${it.geo.cleanName}</div>
          <div style="font-size:11px;color:#475569;margin-top:1px">${it.geo.provinceName} • ${it.geo.level}</div>
          ${
            it.formattedValue
              ? `<div style="font-weight:800;color:#0F172A;font-size:13.5px;margin-top:4px">${it.formattedValue}</div>`
              : ''
          }
          ${
            it.secondaryLabel
              ? `<div style="font-size:11px;font-weight:600;color:#328475;margin-top:2px">${it.secondaryLabel}</div>`
              : ''
          }
        </div>`;

      marker.bindTooltip(html, { direction: 'top', opacity: 0.97 });
      marker.on('mouseover', () => setHoveredItem(it));
      marker.on('mouseout', () => setHoveredItem(null));
      marker.on('click', () => {
        if (onSelectGeo) onSelectGeo(it.geo.id);
      });
      marker.addTo(group);
    }

    // 5. Add Canadian Province Abbreviation Labels & Top-3 Ranked Badges directly onto the map
    if (showTopBadges) {
      if (scopeInfo.isAllCanada && !showWorldBasemap) {
        for (const p of CANADIAN_PROVINCE_ANCHORS) {
          const provIcon = L.divIcon({
            className: 'ag-prov-label-icon',
            html: `<div style="font-family:Inter,sans-serif;font-size:10px;font-weight:800;color:#334155;background:rgba(255,255,255,0.72);padding:1px 4px;border-radius:3px;border:1px solid rgba(148,163,184,0.5);white-space:nowrap;pointer-events:none;box-shadow:0 1px 2px rgba(0,0,0,0.06);">${p.abbr}</div>`,
            iconSize: [26, 16],
            iconAnchor: [13, 8]
          });
          L.marker([p.lat, p.lon], { icon: provIcon, interactive: false }).addTo(group);
        }
      }

      // Place #1, #2, #3 badges on the top 3 ranked regions
      const badgeCount = items.length > 5 ? 3 : Math.min(2, items.length);
      for (let i = 0; i < badgeCount; i++) {
        const it = items[i];
        if (!it?.geo.lat || !it?.geo.lon) continue;
        // If viewing South ON + Inset, skip placing main-map badge on a Northern Ontario district
        if (
          scopeInfo.isOntarioOnly &&
          subRegion !== 'full_on' &&
          Number(it.geo.id) >= 3548
        ) {
          continue;
        }
        const badgeText = `#${i + 1} ${getShortBadgeName(it.geo.cleanName)}`;
        const badgeIcon = L.divIcon({
          className: 'ag-top-rank-badge',
          html: `<div style="font-family:Inter,sans-serif;font-size:10px;font-weight:800;color:#FFFFFF;background:#0F3D6E;padding:2px 6px;border-radius:999px;border:1.5px solid #FFFFFF;white-space:nowrap;box-shadow:0 2px 5px rgba(15,23,42,0.35);cursor:pointer;transform:translate(-50%,-115%);">${badgeText}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        });
        const m = L.marker([it.geo.lat, it.geo.lon], { icon: badgeIcon });
        m.on('click', () => {
          if (onSelectGeo) onSelectGeo(it.geo.id);
        });
        m.addTo(group);
      }
    }

    // 6. Smart Camera Framing Focused on Canada's Agricultural Geography
    const activeFocus = !ignoreFocusGeo ? focusGeo : null;

    if (activeFocus && activeFocus.lat && activeFocus.lon) {
      const z =
        activeFocus.level === 'Country'
          ? 3.7
          : activeFocus.level === 'Provinces & Territories'
          ? 5.0
          : activeFocus.level === 'Census Agricultural Regions (CAR)'
          ? 6.3
          : activeFocus.level === 'Counties / Census Divisions (CD)'
          ? 7.5
          : 9.5;
      map.setView([activeFocus.lat, activeFocus.lon], z, { animate: true });
    } else if (scopeInfo.isAllCanada) {
      if (subRegion === 'west') {
        map.fitBounds(
          [
            [49.0, -124.5],
            [55.8, -95.5]
          ],
          { padding: [10, 10], animate: true }
        );
      } else if (subRegion === 'central') {
        map.fitBounds(
          [
            [42.0, -83.5],
            [48.5, -64.5]
          ],
          { padding: [10, 10], animate: true }
        );
      } else if (subRegion === 'atlantic') {
        map.fitBounds(
          [
            [43.5, -67.5],
            [49.2, -52.8]
          ],
          { padding: [10, 10], animate: true }
        );
      } else {
        // Full Canadian Agricultural Belt centered tightly on farmed regions (42.5°N to 55.2°N)
        map.fitBounds(
          [
            [42.5, -125.5],
            [55.2, -55.0]
          ],
          { padding: [6, 6], animate: true }
        );
      }
    } else if (scopeInfo.isOntarioOnly) {
      if (subRegion === 'full_on') {
        map.fitBounds(
          [
            [41.9, -95.2],
            [56.5, -74.2]
          ],
          { padding: [10, 10], animate: true }
        );
      } else {
        // Default for Ontario: Frame Southern, Western, Central & Eastern Ontario tightly so 40 counties fill the canvas
        map.fitBounds(
          [
            [41.9, -83.5],
            [46.3, -74.2]
          ],
          { padding: [8, 8], animate: true }
        );
      }
    } else if (boundsPts.length === 1) {
      const g = items[0].geo;
      const z = g.level === 'Country' ? 3.7 : g.level === 'Provinces & Territories' ? 5.2 : 7.2;
      map.setView(boundsPts[0], z);
    } else if (boundsPts.length > 1) {
      const latLngBounds = L.latLngBounds(boundsPts);
      map.fitBounds(latLngBounds, { padding: [14, 14], maxZoom: 8.8 });
    }
  }, [
    items,
    selectedGeoId,
    boundariesLoaded,
    renderMode,
    focusGeo,
    ignoreFocusGeo,
    showWorldBasemap,
    showTopBadges,
    subRegion,
    scopeInfo
  ]);

  // Compute interactive SVG paths for Northern Ontario Inset when viewing Ontario in South-ON focus mode
  const northernOntarioInsetPaths = useMemo(() => {
    if (
      !scopeInfo.isOntarioOnly ||
      subRegion === 'full_on' ||
      !boundariesLoaded ||
      !cachedGeoJson?.features
    ) {
      return [];
    }

    const itemByDguid = new Map<string, MapItemPoint>();
    for (const it of items) {
      itemByDguid.set(it.geo.dguid, it);
    }

    const sampleLevel = items[0]?.geo.level;
    const isCarLevel = sampleLevel === 'Census Agricultural Regions (CAR)';

    const northFeatures = cachedGeoJson.features.filter((f: any) => {
      const dguid = String(f.properties?.dguid || '');
      const uid = String(f.properties?.uid || '');
      if (isCarLevel) {
        return f.properties?.level === 'CAR' && uid === '355';
      }
      return (
        f.properties?.level === 'CD' &&
        dguid.startsWith('2021A000335') &&
        Number(uid) >= 3548
      );
    });

    if (northFeatures.length === 0) return [];

    const minLon = -95.2,
      maxLon = -79.0,
      minLat = 45.8,
      maxLat = 56.9;
    const width = 148,
      heightPx = 104,
      pad = 5;
    const cosLat = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const lonSpan = (maxLon - minLon) * cosLat;
    const latSpan = maxLat - minLat;
    const scale = Math.min((width - pad * 2) / lonSpan, (heightPx - pad * 2) / latSpan);
    const offsetX = pad + (width - pad * 2 - lonSpan * scale) / 2;
    const offsetY = pad + (heightPx - pad * 2 - latSpan * scale) / 2;

    const project = (lon: number, lat: number): [number, number] => [
      offsetX + (lon - minLon) * cosLat * scale,
      offsetY + (maxLat - lat) * scale
    ];

    return northFeatures.map((f: any) => {
      const dguid = String(f.properties?.dguid || '');
      const it = itemByDguid.get(dguid) || null;
      const rings = extractPolygonRings(f.geometry);
      const dParts: string[] = [];
      for (const ring of rings) {
        ring.forEach(([lon, lat], idx) => {
          const [px, py] = project(lon, lat);
          dParts.push(`${idx === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`);
        });
        dParts.push('Z');
      }
      return {
        dguid,
        name: it?.geo.cleanName || f.properties?.name || 'Northern District',
        pathData: dParts.join(' '),
        item: it,
        color: it?.color || '#CBD5E1',
        isSelected: !!(it && (it.isSelected || it.geo.id === selectedGeoId))
      };
    });
  }, [scopeInfo.isOntarioOnly, subRegion, boundariesLoaded, items, selectedGeoId]);

  // Active spotlight item (hovered item, or selected item, or #1 ranked item)
  const spotlightItem = useMemo(() => {
    if (hoveredItem) return hoveredItem;
    if (hoveredInsetItem) return hoveredInsetItem;
    if (selectedGeoId) {
      const found = items.find((it) => it.geo.id === selectedGeoId || it.geo.dguid === selectedGeoId);
      if (found) return found;
    }
    return items[0] || null;
  }, [hoveredItem, hoveredInsetItem, selectedGeoId, items]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border border-slate-200"
      style={{
        height,
        backgroundColor: showWorldBasemap ? '#E6EEF4' : '#E3ECF5'
      }}
    >
      {/* Hide Leaflet default grey background so Canada-Only vector ocean slate shows cleanly */}
      <style>{`
        .leaflet-container {
          background-color: ${showWorldBasemap ? '#E6EEF4' : '#E3ECF5'} !important;
          font-family: Inter, system-ui, sans-serif;
        }
        .ag-prov-label-icon, .ag-top-rank-badge {
          background: transparent !important;
          border: none !important;
        }
      `}</style>

      <div ref={containerRef} className="h-full w-full" />

      {/* Top-Left Control Bar: Polygons/Bubbles + Canada-Only Regional Framing Pills */}
      <div className="absolute top-2 left-2 right-12 z-[400] flex flex-wrap items-center gap-1 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded bg-white/95 p-0.5 shadow-sm border border-slate-200 text-[10.5px]">
          <button
            type="button"
            onClick={() => setRenderMode('choropleth')}
            className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
              renderMode === 'choropleth'
                ? 'bg-[#0F3D6E] text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Render official Statistics Canada boundary polygons (PR, CAR, CD)"
          >
            Polygons
          </button>
          <button
            type="button"
            onClick={() => setRenderMode('bubbles')}
            className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
              renderMode === 'bubbles'
                ? 'bg-[#0F3D6E] text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Render centroid bubbles"
          >
            Bubbles
          </button>
        </div>

        {/* Regional Quick-Focus Pills when viewing All of Canada */}
        {scopeInfo.isAllCanada && (
          <div className="pointer-events-auto flex items-center gap-0.5 rounded bg-white/95 p-0.5 shadow-sm border border-slate-200 text-[10px]">
            {(
              [
                { id: 'auto', label: 'All Canada' },
                { id: 'west', label: 'West / Prairies' },
                { id: 'central', label: 'ON / QC' },
                { id: 'atlantic', label: 'Atlantic' }
              ] as Array<{ id: CanadaSubRegion; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setIgnoreFocusGeo(true);
                  setSubRegion(tab.id);
                }}
                className={`px-1.5 py-0.5 rounded font-bold transition cursor-pointer ${
                  subRegion === tab.id && (!focusGeo || ignoreFocusGeo)
                    ? 'bg-[#328475] text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title={`Focus map on ${tab.label}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Southern Ontario Focus vs Full Ontario Toggle when viewing Ontario */}
        {scopeInfo.isOntarioOnly && (
          <div className="pointer-events-auto flex items-center gap-0.5 rounded bg-white/95 p-0.5 shadow-sm border border-slate-200 text-[10px]">
            <button
              type="button"
              onClick={() => {
                setIgnoreFocusGeo(true);
                setSubRegion('auto');
              }}
              className={`px-1.5 py-0.5 rounded font-bold transition cursor-pointer ${
                subRegion !== 'full_on' && (!focusGeo || ignoreFocusGeo)
                  ? 'bg-[#328475] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Focus main map on Southern & Eastern Ontario with a Northern Ontario Inset"
            >
              South ON + Inset
            </button>
            <button
              type="button"
              onClick={() => {
                setIgnoreFocusGeo(true);
                setSubRegion('full_on');
              }}
              className={`px-1.5 py-0.5 rounded font-bold transition cursor-pointer ${
                subRegion === 'full_on' && (!focusGeo || ignoreFocusGeo)
                  ? 'bg-[#328475] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Show entire province of Ontario in a single frame"
            >
              Full ON
            </button>
          </div>
        )}

        {/* Toggle Top-3 Rank Badges & Province Labels */}
        <button
          type="button"
          onClick={() => setShowTopBadges((v) => !v)}
          className={`pointer-events-auto rounded px-1.5 py-0.5 text-[10px] font-semibold shadow-sm border transition cursor-pointer ${
            showTopBadges
              ? 'bg-[#0F3D6E] text-white border-[#0F3D6E]'
              : 'bg-white/95 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
          title="Show or hide #1–#3 rank callout badges and province labels on the map"
        >
          {showTopBadges ? 'Labels: On' : 'Labels: Off'}
        </button>

        {/* Reset Zoom Button when focused on a single clicked geography */}
        {focusGeo && !ignoreFocusGeo && items.length > 1 && (
          <button
            type="button"
            onClick={() => setIgnoreFocusGeo(true)}
            className="pointer-events-auto rounded bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 text-[10px] font-bold shadow-sm cursor-pointer transition"
            title="Zoom back out to full regional map"
          >
            ↺ Full Map
          </button>
        )}

        {/* Optional Reference Basemap Toggle (defaults to Canada-Only clean vector view) */}
        <button
          type="button"
          onClick={() => setShowWorldBasemap((v) => !v)}
          className={`pointer-events-auto rounded px-1.5 py-0.5 text-[10px] font-semibold shadow-sm border transition cursor-pointer ${
            showWorldBasemap
              ? 'bg-[#0F3D6E] text-white border-[#0F3D6E]'
              : 'bg-white/95 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
          title="Toggle between clean Canada-Only vector map and reference street/city tiles"
        >
          {showWorldBasemap ? 'Streets: On' : 'Canada Only'}
        </button>
      </div>

      {/* Interactive Northern Ontario Districts Inset when viewing Ontario in South-ON Focus Mode */}
      {northernOntarioInsetPaths.length > 0 && (
        <div className="absolute top-12 left-2 z-[400] rounded bg-white/95 border border-[#0F3D6E]/40 shadow-md p-1.5 select-none">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#0F3D6E]">
              Northern Ontario Inset
            </span>
            <button
              type="button"
              onClick={() => {
                setIgnoreFocusGeo(true);
                setSubRegion('full_on');
              }}
              className="text-[9px] font-semibold text-[#328475] hover:underline cursor-pointer"
              title="Expand full Ontario map"
            >
              Expand
            </button>
          </div>
          <svg
            width={148}
            height={104}
            viewBox="0 0 148 104"
            className="rounded-xs bg-[#E3ECF5] border border-slate-200"
          >
            {northernOntarioInsetPaths.map((p: any) => (
              <path
                key={p.dguid}
                d={p.pathData}
                fill={p.color}
                stroke={p.isSelected ? '#071D49' : '#FFFFFF'}
                strokeWidth={p.isSelected ? 1.8 : 0.7}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onMouseEnter={() => setHoveredInsetItem(p.item)}
                onMouseLeave={() => setHoveredInsetItem(null)}
                onClick={() => {
                  if (p.item && onSelectGeo) {
                    onSelectGeo(p.item.geo.id);
                  }
                }}
              >
                <title>
                  {p.name}
                  {p.item?.formattedValue ? `: ${p.item.formattedValue}` : ''}
                  {p.item?.secondaryLabel ? ` (${p.item.secondaryLabel})` : ''}
                </title>
              </path>
            ))}
          </svg>
        </div>
      )}

      {/* Bottom Spotlight + Legend Overlay */}
      <div className="absolute bottom-2 left-2 right-2 z-[400] flex flex-col gap-1.5 pointer-events-none">
        {spotlightItem && (
          <div className="pointer-events-auto flex items-center justify-between gap-2 rounded bg-[#071D49]/95 text-white px-2.5 py-1.5 shadow-sm border border-slate-700 text-[11px]">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-3 h-3 rounded-xs shrink-0 border border-white/80"
                style={{ backgroundColor: spotlightItem.color }}
              />
              <div className="truncate">
                <span className="font-extrabold text-white">
                  {spotlightItem.geo.cleanName}
                </span>
                <span className="text-slate-300 ml-1 text-[10px]">
                  ({spotlightItem.geo.provinceName})
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              {spotlightItem.formattedValue && (
                <span className="font-extrabold text-emerald-300">
                  {spotlightItem.formattedValue}
                </span>
              )}
              {spotlightItem.secondaryLabel && (
                <span className="hidden sm:inline text-[10px] text-slate-300 ml-1.5">
                  • {spotlightItem.secondaryLabel}
                </span>
              )}
            </div>
          </div>
        )}

        {legendElement && (
          <div className="pointer-events-auto flex items-center justify-between rounded bg-white/95 px-2.5 py-1.5 shadow-sm border border-slate-200 text-[11px]">
            {legendElement}
          </div>
        )}
      </div>
    </div>
  );
};
