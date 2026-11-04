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
  const [subRegion, setSubRegion] = useState<CanadaSubRegion>('auto');
  const [ignoreFocusGeo, setIgnoreFocusGeo] = useState<boolean>(false);
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
      if (it.geo.provinceCode) provSet.add(it.geo.provinceCode);
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
      center: [50.0, -92.0],
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

  // Render Canada-only base silhouettes, active polygons/bubbles, and provincial borders
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    if (items.length === 0) return;

    const itemByDguid = new Map<string, MapItemPoint>();
    for (const it of items) {
      itemByDguid.set(it.geo.dguid, it);
    }

    const sampleLevel = items[0]?.geo.level;
    const targetGeoJsonLevel =
      sampleLevel === 'Provinces & Territories'
        ? 'PR'
        : sampleLevel === 'Census Agricultural Regions (CAR)'
        ? 'CAR'
        : sampleLevel === 'Counties / Census Divisions (CD)'
        ? 'CD'
        : null;

    // 1. In Canada-Only mode (default), draw Canadian Provincial Base Silhouettes so only Canada is shown
    if (!showWorldBasemap && cachedGeoJson && cachedGeoJson.features) {
      const prFeatures = cachedGeoJson.features.filter((f: any) => {
        if (f.properties?.level !== 'PR') return false;
        const uid = String(f.properties?.uid || '');
        // Include the 10 provinces by default (plus territories if present in items)
        if (['60', '61', '62'].includes(uid) && !scopeInfo.provSet.has(uid)) {
          return false;
        }
        return true;
      });

      if (prFeatures.length > 0) {
        L.geoJSON({ type: 'FeatureCollection', features: prFeatures } as any, {
          interactive: false,
          style: (feature) => {
            const uid = String(feature?.properties?.uid || '');
            const isInActiveScope =
              scopeInfo.isAllCanada || scopeInfo.singleProvCode === uid;
            return {
              fillColor: isInActiveScope ? '#DCE5EE' : '#EBF0F5',
              fillOpacity: 1,
              color: isInActiveScope ? '#94A3B8' : '#CBD5E1',
              weight: isInActiveScope ? 1.1 : 0.7
            };
          }
        }).addTo(group);
      }

      // Also render any filtered-out / suppressed sibling CDs or CARs in the active scope so there are no holes
      if (targetGeoJsonLevel === 'CD' || targetGeoJsonLevel === 'CAR') {
        const backgroundSiblings = cachedGeoJson.features.filter((f: any) => {
          if (f.properties?.level !== targetGeoJsonLevel) return false;
          if (itemByDguid.has(f.properties?.dguid)) return false;
          const uid = String(f.properties?.uid || '');
          const provUid = uid.slice(0, 2);
          return scopeInfo.isAllCanada || scopeInfo.singleProvCode === provUid;
        });

        if (backgroundSiblings.length > 0) {
          L.geoJSON({ type: 'FeatureCollection', features: backgroundSiblings } as any, {
            style: () => ({
              fillColor: '#E2E8F0',
              fillOpacity: 0.9,
              color: '#FFFFFF',
              weight: 0.7
            }),
            onEachFeature: (feature, layer) => {
              const name = feature?.properties?.name || 'Region';
              layer.bindTooltip(
                `<div style="font-family:Inter,sans-serif;padding:3px 5px;font-size:11px;color:#475569">
                  <strong style="color:#0F3D6E">${name}</strong><br/>
                  <span>Outside current filter or suppressed</span>
                </div>`,
                { sticky: true, direction: 'top', opacity: 0.95 }
              );
            }
          }).addTo(group);
        }
      }
    }

    const boundsPts: [number, number][] = [];
    let renderedPolygons = 0;

    // 2. Render active Choropleth Polygons
    if (renderMode === 'choropleth' && cachedGeoJson && cachedGeoJson.features) {
      const matchingFeatures = cachedGeoJson.features.filter((f: any) =>
        itemByDguid.has(f.properties?.dguid)
      );

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
                fillOpacity: isSel ? 0.95 : 0.86,
                color: isSel ? '#071D49' : '#FFFFFF',
                weight: isSel ? 2.6 : scopeInfo.isAllCanada ? 0.65 : 1.1
              };
            },
            onEachFeature: (feature, layer) => {
              const dguid = feature?.properties?.dguid;
              const it = itemByDguid.get(dguid);
              if (!it) return;
              const html =
                it.tooltipHtml ||
                `<div style="font-family:Inter,sans-serif;padding:4px 6px;min-width:160px">
                  <div style="font-weight:700;color:#0F3D6E;font-size:12px">${it.geo.name}</div>
                  <div style="font-size:11px;color:#475569;margin-top:2px">${it.geo.level}</div>
                  ${
                    it.formattedValue
                      ? `<div style="font-weight:700;color:#0F172A;font-size:13px;margin-top:4px">${it.formattedValue}</div>`
                      : ''
                  }
                  ${
                    it.secondaryLabel
                      ? `<div style="font-size:11px;color:#328475">${it.secondaryLabel}</div>`
                      : ''
                  }
                </div>`;
              layer.bindTooltip(html, { sticky: true, direction: 'top', opacity: 0.97 });
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
      const prOverlayFeatures = cachedGeoJson.features.filter((f: any) => {
        if (f.properties?.level !== 'PR') return false;
        const uid = String(f.properties?.uid || '');
        return scopeInfo.isAllCanada
          ? !['60', '61', '62'].includes(uid)
          : scopeInfo.singleProvCode === uid;
      });
      if (prOverlayFeatures.length > 0) {
        L.geoJSON({ type: 'FeatureCollection', features: prOverlayFeatures } as any, {
          interactive: false,
          style: () => ({
            fill: false,
            color: '#334155',
            weight: scopeInfo.isAllCanada ? 1.25 : 1.6,
            opacity: 0.65
          })
        }).addTo(group);
      }
    }

    // 4. For any item not covered by a polygon (e.g. CCS townships or when in bubbles mode), draw circleMarkers
    for (const it of items) {
      if (it.geo.lat && it.geo.lon) {
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
        `<div style="font-family:Inter,sans-serif;padding:4px 6px;min-width:160px">
          <div style="font-weight:700;color:#0F3D6E;font-size:12px">${it.geo.name}</div>
          <div style="font-size:11px;color:#475569;margin-top:2px">${it.geo.level}</div>
          ${
            it.formattedValue
              ? `<div style="font-weight:700;color:#0F172A;font-size:13px;margin-top:4px">${it.formattedValue}</div>`
              : ''
          }
          ${
            it.secondaryLabel
              ? `<div style="font-size:11px;color:#328475">${it.secondaryLabel}</div>`
              : ''
          }
        </div>`;

      marker.bindTooltip(html, { direction: 'top', opacity: 0.97 });
      marker.on('click', () => {
        if (onSelectGeo) onSelectGeo(it.geo.id);
      });
      marker.addTo(group);
    }

    // 5. Smart Camera Framing Focused on Canada's Agricultural Geography
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
          ? 7.6
          : 9.5;
      map.setView([activeFocus.lat, activeFocus.lon], z, { animate: true });
    } else if (scopeInfo.isAllCanada) {
      // Regional sub-focus or Tight Canadian Agricultural Belt bounds (excludes Arctic ocean/South America)
      if (subRegion === 'west') {
        map.fitBounds(
          [
            [48.8, -125.5],
            [56.8, -95.2]
          ],
          { padding: [8, 8], animate: true }
        );
      } else if (subRegion === 'central') {
        map.fitBounds(
          [
            [41.9, -83.8],
            [49.0, -64.2]
          ],
          { padding: [8, 8], animate: true }
        );
      } else if (subRegion === 'atlantic') {
        map.fitBounds(
          [
            [43.4, -67.6],
            [49.4, -52.6]
          ],
          { padding: [8, 8], animate: true }
        );
      } else {
        // Full Canadian Agricultural Belt cropped tightly to farmed regions
        map.fitBounds(
          [
            [42.0, -128.5],
            [57.2, -53.0]
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
        name: f.properties?.name || 'Northern District',
        pathData: dParts.join(' '),
        item: it,
        color: it?.color || '#CBD5E1',
        isSelected: !!(it && (it.isSelected || it.geo.id === selectedGeoId))
      };
    });
  }, [scopeInfo.isOntarioOnly, subRegion, boundariesLoaded, items, selectedGeoId]);

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
                { id: 'west', label: 'West' },
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
        <div className="absolute top-11 left-2 z-[400] rounded bg-white/95 border border-[#0F3D6E]/40 shadow-md p-1.5 select-none">
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
            {northernOntarioInsetPaths.map((p) => (
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
          {hoveredInsetItem && (
            <div className="mt-1 rounded bg-[#071D49] px-1.5 py-1 text-[10px] text-white leading-tight max-w-[148px]">
              <div className="font-bold truncate">{hoveredInsetItem.geo.cleanName}</div>
              {hoveredInsetItem.formattedValue && (
                <div className="font-semibold text-emerald-300">
                  {hoveredInsetItem.formattedValue}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom Legend Overlay */}
      {legendElement && (
        <div
          className="
            absolute bottom-2 left-2 right-2 z-[400] flex items-center justify-between
            rounded bg-white/95 px-2.5 py-1.5 shadow-sm border border-slate-200 text-[11px]
          "
        >
          {legendElement}
        </div>
      )}
    </div>
  );
};
