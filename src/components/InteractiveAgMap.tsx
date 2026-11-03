import React, { useEffect, useRef, useState } from 'react';
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
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [boundariesLoaded, setBoundariesLoaded] = useState<boolean>(!!cachedGeoJson);
  const [renderMode, setRenderMode] = useState<'choropleth' | 'bubbles'>(preferPolygons ? 'choropleth' : 'bubbles');

  useEffect(() => {
    if (!cachedGeoJson) {
      loadBoundariesGeoJson().then(() => setBoundariesLoaded(true));
    }
  }, []);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [50.5, -86.0],
      zoom: 4,
      zoomControl: false,
      attributionControl: false
    });

    // Clean light gray canvas basemap + reference labels (watermark-free Esri ArcGIS Online tiles)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 16
      }
    ).addTo(map);
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 16,
        opacity: 0.75
      }
    ).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Render polygons & markers whenever items, selectedGeoId, or renderMode changes
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

    const boundsPts: [number, number][] = [];
    let renderedPolygons = 0;

    // If choropleth mode is active and we have boundary polygons for these DGUIDs, render polygons!
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
              const isSel = it?.isSelected || dguid === selectedGeoId;
              return {
                fillColor: it?.color || '#0F3D6E',
                fillOpacity: isSel ? 0.88 : 0.72,
                color: isSel ? '#071D49' : '#FFFFFF',
                weight: isSel ? 2.5 : 1.0
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

    // For any item not covered by a polygon (e.g. CCS townships or when in bubbles mode), draw circleMarkers
    for (const it of items) {
      if (it.geo.lat && it.geo.lon) {
        boundsPts.push([it.geo.lat, it.geo.lon]);
      }
      if (renderMode === 'choropleth' && renderedPolygons > 0 && it.geo.level !== 'Townships / Subdivisions (CCS)') {
        continue;
      }
      if (!it.geo.lat || !it.geo.lon) continue;

      const isSel = it.isSelected || it.geo.id === selectedGeoId;
      const marker = L.circleMarker([it.geo.lat, it.geo.lon], {
        radius: isSel ? (it.radius || 8) + 3 : it.radius || 6.5,
        fillColor: it.color,
        fillOpacity: isSel ? 0.95 : 0.82,
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

    // Adjust viewport bounds
    if (focusGeo && focusGeo.lat && focusGeo.lon) {
      const z =
        focusGeo.level === 'Country'
          ? 3
          : focusGeo.level === 'Provinces & Territories'
          ? 5
          : focusGeo.level === 'Census Agricultural Regions (CAR)'
          ? 6
          : focusGeo.level === 'Counties / Census Divisions (CD)'
          ? 8
          : 10;
      map.setView([focusGeo.lat, focusGeo.lon], z, { animate: true });
    } else if (boundsPts.length === 1) {
      const g = items[0].geo;
      const z = g.level === 'Country' ? 3 : g.level === 'Provinces & Territories' ? 5 : 7;
      map.setView(boundsPts[0], z);
    } else if (boundsPts.length > 1) {
      const latLngBounds = L.latLngBounds(boundsPts);
      map.fitBounds(latLngBounds, { padding: [24, 24], maxZoom: 9 });
    }
  }, [items, selectedGeoId, boundariesLoaded, renderMode, focusGeo]);

  return (
    <div className="relative w-full overflow-hidden rounded-md border border-slate-200 bg-[#E6EEF4]" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />

      {/* Top-left Choropleth vs. Bubbles toggle (surpassing MTM's bubble-only limitation) */}
      <div className="
        absolute top-2 left-2 z-[400] flex items-center gap-1 rounded bg-white/95 p-1
        shadow-sm border border-slate-200 text-[11px]
      ">
        <button
          type="button"
          onClick={() => setRenderMode('choropleth')}
          className={`px-2 py-0.5 rounded font-medium transition ${
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
          className={`px-2 py-0.5 rounded font-medium transition ${
            renderMode === 'bubbles'
              ? 'bg-[#0F3D6E] text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          title="Render centroid bubbles (like MTM Azure Maps)"
        >
          Bubbles
        </button>
      </div>

      {/* Bottom Legend Overlay */}
      {legendElement && (
        <div className="
          absolute bottom-2 left-2 right-2 z-[400] flex items-center justify-between
          rounded bg-white/95 px-2.5 py-1.5 shadow-sm border border-slate-200 text-[11px]
        ">
          {legendElement}
        </div>
      )}
    </div>
  );
};
