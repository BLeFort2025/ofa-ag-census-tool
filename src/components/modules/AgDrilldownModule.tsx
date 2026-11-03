import React, { useMemo, useState } from 'react';
import { AgCensusDataset, GeoLevel, GeographyNode } from '../../types/census';
import {
  MTM_PALETTES,
  computeQuintileBreaks,
  downloadCsvFile,
  getQuintileColor,
  getRawNumber
} from '../../utils/analytics';
import { MultiGeographyScopeSlicer } from '../GeographySlicer';
import { InteractiveAgMap, MapItemPoint, loadBoundariesGeoJson } from '../InteractiveAgMap';
import { Download, FileSpreadsheet, Image as ImageIcon, RotateCcw } from 'lucide-react';

interface AgDrilldownModuleProps {
  dataset: AgCensusDataset;
  onOpenGeoLocator: () => void;
  onSelectGeoForSnapshot: (geo: GeographyNode) => void;
}

const FILTER1_OPTIONS = [
  { id: 'ALL', label: 'All Farm Types (Total Farms)', charId: 'total_farms' },
  { id: 'naics_oilseed_grain', label: 'Oilseed & Grain Farming [1111]', charId: 'naics_oilseed_grain' },
  { id: 'naics_cattle_total', label: 'Cattle Ranching & Farming [1121]', charId: 'naics_cattle_total' },
  { id: 'naics_dairy', label: 'Dairy Cattle & Milk Production [112120]', charId: 'naics_dairy' },
  { id: 'naics_beef', label: 'Beef Cattle & Feedlots [112110]', charId: 'naics_beef' },
  { id: 'naics_other_crop', label: 'Other Crop Farming (Hay/Maple) [1119]', charId: 'naics_other_crop' },
  { id: 'naics_other_animal', label: 'Other Animal Production [1129]', charId: 'naics_other_animal' },
  { id: 'naics_greenhouse', label: 'Greenhouse, Nursery & Floriculture [1114]', charId: 'naics_greenhouse' },
  { id: 'naics_fruit_nut', label: 'Fruit & Tree Nut Farming [1113]', charId: 'naics_fruit_nut' },
  { id: 'naics_vegetable', label: 'Vegetable & Melon Farming [1112]', charId: 'naics_vegetable' },
  { id: 'naics_poultry_egg', label: 'Poultry & Egg Production [1123]', charId: 'naics_poultry_egg' },
  { id: 'naics_hog', label: 'Hog & Pig Farming [1122]', charId: 'naics_hog' },
  { id: 'naics_sheep_goat', label: 'Sheep & Goat Farming [1124]', charId: 'naics_sheep_goat' }
];

const FILTER2_OPTIONS = [
  { id: 'ALL', label: 'All Gross Farm Revenue Classes', charId: 'total_farms' },
  { id: 'rev_under_10k', label: 'Receipts: $1 to $9,999', charId: 'rev_under_10k' },
  { id: 'rev_10k_25k', label: 'Receipts: $10,000 to $24,999', charId: 'rev_10k_25k' },
  { id: 'rev_25k_50k', label: 'Receipts: $25,000 to $49,999', charId: 'rev_25k_50k' },
  { id: 'rev_50k_100k', label: 'Receipts: $50,000 to $99,999', charId: 'rev_50k_100k' },
  { id: 'rev_100k_250k', label: 'Receipts: $100,000 to $249,999', charId: 'rev_100k_250k' },
  { id: 'rev_250k_500k', label: 'Receipts: $250,000 to $499,999', charId: 'rev_250k_500k' },
  { id: 'rev_500k_1m', label: 'Receipts: $500,000 to $999,999', charId: 'rev_500k_1m' },
  { id: 'rev_1m_2m', label: 'Receipts: $1,000,000 to $1,999,999', charId: 'rev_1m_2m' },
  { id: 'rev_2m_plus', label: 'Receipts: $2,000,000 and over', charId: 'rev_2m_plus' }
];

const FILTER3_OPTIONS = [
  { id: 'ALL', label: 'All Operating Structures & Practices', charId: 'total_farms' },
  { id: 'op_sole_prop', label: 'Structure: Sole Proprietorship', charId: 'op_sole_prop' },
  { id: 'op_partnership', label: 'Structure: Partnership', charId: 'op_partnership' },
  { id: 'op_family_corp', label: 'Structure: Family Corporation', charId: 'op_family_corp' },
  { id: 'op_nonfamily_corp', label: 'Structure: Non-Family Corporation', charId: 'op_nonfamily_corp' },
  { id: 'succ_written', label: 'Succession: Written Succession Plan', charId: 'succ_written' },
  { id: 'tech_autosteer', label: 'Tech: Auto-Steer Guidance Used', charId: 'tech_autosteer' },
  { id: 'bmp_cover_crops_farms', label: 'BMP: Winter Cover Crops Planted', charId: 'bmp_cover_crops_farms' },
  { id: 'ds_total_farms', label: 'Marketing: Direct-to-Consumer Sales', charId: 'ds_total_farms' },
  { id: 'energy_total_farms', label: 'Energy: On-Farm Renewable Energy', charId: 'energy_total_farms' }
];

export const AgDrilldownModule: React.FC<AgDrilldownModuleProps> = ({
  dataset,
  onOpenGeoLocator,
  onSelectGeoForSnapshot
}) => {
  const [selectedLevel, setSelectedLevel] = useState<GeoLevel>('Counties / Census Divisions (CD)');
  const [selectedProvince, setSelectedProvince] = useState<string>('35'); // Default Ontario
  const [selectedCarId, setSelectedCarId] = useState<string>('ALL');

  const [filter1, setFilter1] = useState<string>('naics_oilseed_grain');
  const [filter2, setFilter2] = useState<string>('ALL');
  const [filter3, setFilter3] = useState<string>('ALL');

  const [mapMetricMode, setMapMetricMode] = useState<'pct' | 'count'>('pct');
  const [paletteMode, setPaletteMode] = useState<'standard' | 'accessible'>('standard');
  const [activeChartTab, setActiveChartTab] = useState<1 | 2 | 3>(1);
  const [focusedGeoId, setFocusedGeoId] = useState<string | null>(null);
  const [isExportingMap, setIsExportingMap] = useState<boolean>(false);

  // Scope geographies
  const scopedGeos = useMemo(() => {
    return dataset.geographies.filter((g) => {
      if (g.level !== selectedLevel) return false;
      if (selectedProvince !== 'ALL' && g.provinceCode !== selectedProvince) return false;
      if (selectedCarId !== 'ALL') {
        if (selectedLevel === 'Counties / Census Divisions (CD)') {
          return g.parentId === selectedCarId;
        }
        if (selectedLevel === 'Townships / Subdivisions (CCS)') {
          const parentCd = dataset.geographies.find((p) => p.id === g.parentId);
          return parentCd?.parentId === selectedCarId;
        }
      }
      return true;
    });
  }, [dataset.geographies, selectedLevel, selectedProvince, selectedCarId]);

  // Compute intersected farm estimate & share for each geography in scope
  // Uses joint probability / IPF scaling over the exact empirical marginal counts in each geography
  const rankedRows = useMemo(() => {
    return scopedGeos
      .map((geo) => {
        const totalFarms = getRawNumber(dataset, geo.id, 'total_farms', 0) || 0;
        if (totalFarms <= 0) {
          return { geo, count: 0, pct: 0, totalFarms: 0 };
        }

        const c1 =
          filter1 === 'ALL' ? totalFarms : getRawNumber(dataset, geo.id, filter1, 0) ?? 0;
        const c2 =
          filter2 === 'ALL' ? totalFarms : getRawNumber(dataset, geo.id, filter2, 0) ?? 0;
        const c3 =
          filter3 === 'ALL' ? totalFarms : getRawNumber(dataset, geo.id, filter3, 0) ?? 0;

        const p1 = c1 / totalFarms;
        const p2 = c2 / totalFarms;
        const p3 = c3 / totalFarms;

        const estCount = Math.round(totalFarms * p1 * p2 * p3);
        const estPct = Number(((estCount / totalFarms) * 100).toFixed(1));

        return {
          geo,
          count: estCount,
          pct: estPct,
          totalFarms
        };
      })
      .sort((a, b) => (mapMetricMode === 'pct' ? b.pct - a.pct : b.count - a.count));
  }, [scopedGeos, dataset, filter1, filter2, filter3, mapMetricMode]);

  // Aggregate summary across all geographies in scope (for Share of Census Farms donut card)
  const scopeSummary = useMemo(() => {
    const sumCount = rankedRows.reduce((acc, r) => acc + r.count, 0);
    const sumTotal = rankedRows.reduce((acc, r) => acc + r.totalFarms, 0);
    const sharePct = sumTotal > 0 ? Number(((sumCount / sumTotal) * 100).toFixed(1)) : 0;
    return { sumCount, sumTotal, sharePct };
  }, [rankedRows]);

  // Quintiles for Map
  const quintileBreaks = useMemo(() => {
    const vals = rankedRows.map((r) => (mapMetricMode === 'pct' ? r.pct : r.count));
    return computeQuintileBreaks(vals);
  }, [rankedRows, mapMetricMode]);

  const mapItems: MapItemPoint[] = useMemo(() => {
    return rankedRows.map((r) => {
      const val = mapMetricMode === 'pct' ? r.pct : r.count;
      return {
        geo: r.geo,
        value: val,
        formattedValue:
          mapMetricMode === 'pct'
            ? `${r.pct.toFixed(1)}% (${r.count.toLocaleString()} farms)`
            : `${r.count.toLocaleString()} farms (${r.pct.toFixed(1)}%)`,
        secondaryLabel: `Total Farms: ${r.totalFarms.toLocaleString()}`,
        color: getQuintileColor(val, quintileBreaks, paletteMode),
        radius: Math.max(5.5, Math.min(13, Math.sqrt(r.count || 1) * 0.45)),
        isSelected: r.geo.id === focusedGeoId
      };
    });
  }, [rankedRows, mapMetricMode, quintileBreaks, paletteMode, focusedGeoId]);

  // Human-readable active filter labels
  const filter1Label = useMemo(
    () => FILTER1_OPTIONS.find((o) => o.id === filter1)?.label || 'All Farm Types',
    [filter1]
  );
  const filter2Label = useMemo(
    () => FILTER2_OPTIONS.find((o) => o.id === filter2)?.label || 'All Gross Farm Revenue Classes',
    [filter2]
  );
  const filter3Label = useMemo(
    () => FILTER3_OPTIONS.find((o) => o.id === filter3)?.label || 'All Operating Structures & Practices',
    [filter3]
  );

  const scopeTitleLabel = useMemo(() => {
    const provGeo = dataset.geographies.find(
      (g) => g.level === 'Provinces & Territories' && g.provinceCode === selectedProvince
    );
    const carGeo =
      selectedCarId !== 'ALL' ? dataset.geographies.find((g) => g.id === selectedCarId) : null;
    const provName = selectedProvince === 'ALL' ? 'All Canada' : provGeo?.cleanName || 'Ontario';
    return carGeo
      ? `${provName} (${carGeo.cleanName}) • ${selectedLevel}`
      : `${provName} • ${selectedLevel}`;
  }, [dataset.geographies, selectedProvince, selectedCarId, selectedLevel]);

  // Helper to get Quintile label (P0-P20 ... P80-P100) for a value
  const getQuintileLabel = (val: number): string => {
    const [b1, b2, b3, b4] = quintileBreaks;
    if (val <= b1) return 'P0-P20 (Lowest 20%)';
    if (val <= b2) return 'P20-P40';
    if (val <= b3) return 'P40-P60 (Middle 20%)';
    if (val <= b4) return 'P60-P80';
    return 'P80-P100 (Top 20%)';
  };

  // 1. Download Data Ranks as an Excel-ready CSV Spreadsheet
  const handleDownloadRankingCsv = () => {
    if (rankedRows.length === 0) return;

    const headers = [
      'Rank',
      'Geography',
      'OFA Federation / Region',
      'Geography Level',
      'DGUID',
      'Filter 1 - Farm Type (NAICS)',
      'Filter 2 - Revenue Scale',
      'Filter 3 - Structure & Practice',
      'Matching Farms (2021)',
      'Share of Total Farms (%)',
      'Total Census Farms (2021)',
      'Quintile Tier',
      'Scope Overall Share (%)',
      'Scope Total Matching Farms'
    ];

    const rows = rankedRows.map((r, idx) => {
      const val = mapMetricMode === 'pct' ? r.pct : r.count;
      return [
        idx + 1,
        r.geo.name,
        r.geo.ofaFederation || '',
        r.geo.level,
        r.geo.dguid,
        filter1Label,
        filter2Label,
        filter3Label,
        r.count,
        r.pct,
        r.totalFarms,
        getQuintileLabel(val),
        scopeSummary.sharePct,
        scopeSummary.sumCount
      ];
    });

    const slug = `${filter1 !== 'ALL' ? filter1 : 'all_farms'}_${
      filter3 !== 'ALL' ? filter3 : filter2 !== 'ALL' ? filter2 : 'all'
    }`.replace(/[^a-zA-Z0-9_-]/g, '_');

    downloadCsvFile(`OFA_Drilldown_Data_Ranks_${slug}.csv`, headers, rows);
  };

  // 2. Download Publication-Grade Heat Map & Top Ranks Summary Card as High-Res PNG
  const handleDownloadHeatMapPng = async () => {
    if (rankedRows.length === 0 || isExportingMap) return;
    setIsExportingMap(true);
    try {
      const geoJson = await loadBoundariesGeoJson();
      const width = 1800;
      const height = 1125;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, width, height);

      // Top OFA Navy Header Banner
      ctx.fillStyle = '#0F3D6E';
      ctx.fillRect(0, 0, width, 128);
      ctx.fillStyle = '#328475';
      ctx.fillRect(0, 124, width, 5);

      // Header Eyebrow
      ctx.fillStyle = '#7DD3FC';
      ctx.font = 'bold 15px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        'ONTARIO FEDERATION OF AGRICULTURE (OFA)  •  AGCENSUS IQ DRILLDOWN HEAT MAP & RANKINGS',
        36,
        34
      );

      // Main Filter Title
      const activeFiltersList = [
        filter1 !== 'ALL' ? filter1Label : null,
        filter2 !== 'ALL' ? filter2Label : null,
        filter3 !== 'ALL' ? filter3Label : null
      ].filter(Boolean);
      const mainTitle =
        activeFiltersList.length > 0
          ? activeFiltersList.join('  ×  ')
          : 'All Census Farms (2021 Baseline)';

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 26px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(mainTitle.slice(0, 95), 36, 72);

      // Subtitle (Scope + Metric Mode)
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 16px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `Scope: ${scopeTitleLabel} (${rankedRows.length} Geographies)  •  Heat Map Shaded by: ${
          mapMetricMode === 'pct' ? 'Percentage Share of Farms (%)' : 'Matching Farm Count (#)'
        }`,
        36,
        104
      );

      // Right Header Callout Pill (Overall Share & Farm Count)
      const kpiW = 360;
      const kpiH = 84;
      const kpiX = width - kpiW - 36;
      const kpiY = 20;
      ctx.fillStyle = '#164E63';
      ctx.strokeStyle = '#328475';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(kpiX, kpiY, kpiW, kpiH, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#A7F3D0';
      ctx.font = 'bold 13px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText('OVERALL MATCHING SHARE IN SCOPE', kpiX + 18, kpiY + 26);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 30px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(`${scopeSummary.sharePct.toFixed(1)}%`, kpiX + 18, kpiY + 64);

      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 15px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `(${scopeSummary.sumCount.toLocaleString()} of ${scopeSummary.sumTotal.toLocaleString()} farms)`,
        kpiX + 128,
        kpiY + 62
      );

      // Map Card Container (Left 1130px)
      const mapBox = { x: 32, y: 150, w: 1120, h: 895 };
      ctx.fillStyle = '#E6EEF4';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(mapBox.x, mapBox.y, mapBox.w, mapBox.h, 10);
      ctx.fill();
      ctx.stroke();

      const itemByDguid = new Map<string, MapItemPoint>();
      for (const it of mapItems) {
        itemByDguid.set(it.geo.dguid, it);
      }

      const matchingFeatures =
        geoJson?.features?.filter((f: any) => itemByDguid.has(f.properties?.dguid)) || [];

      // Helper to extract outer rings of Polygon / MultiPolygon features
      const extractRings = (geom: any): number[][][] => {
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
      };

      // Helper to draw a set of GeoJSON features inside a target rectangle
      const drawGeoJsonView = (
        featuresToDraw: any[],
        rect: { x: number; y: number; w: number; h: number },
        bboxOverride?: { minLon: number; maxLon: number; minLat: number; maxLat: number },
        labelTopN: number = 10
      ) => {
        let minLon = Infinity;
        let maxLon = -Infinity;
        let minLat = Infinity;
        let maxLat = -Infinity;

        if (bboxOverride) {
          ({ minLon, maxLon, minLat, maxLat } = bboxOverride);
        } else {
          for (const f of featuresToDraw) {
            for (const ring of extractRings(f.geometry)) {
              for (const [lon, lat] of ring) {
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
              }
            }
          }
        }

        if (!isFinite(minLon) || !isFinite(minLat)) return;

        const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
        const cosLat = Math.max(0.35, Math.cos(midLatRad));
        const pad = 28;
        const availW = rect.w - pad * 2;
        const availH = rect.h - pad * 2;

        const lonSpan = Math.max(0.05, (maxLon - minLon) * cosLat);
        const latSpan = Math.max(0.05, maxLat - minLat);
        const scale = Math.min(availW / lonSpan, availH / latSpan);

        const drawnW = lonSpan * scale;
        const drawnH = latSpan * scale;
        const offsetX = rect.x + pad + (availW - drawnW) / 2;
        const offsetY = rect.y + pad + (availH - drawnH) / 2;

        const project = (lon: number, lat: number): [number, number] => {
          const x = offsetX + (lon - minLon) * cosLat * scale;
          const y = offsetY + (maxLat - lat) * scale;
          return [x, y];
        };

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
        ctx.clip();

        // Draw all polygons
        for (const f of featuresToDraw) {
          const dguid = f.properties?.dguid;
          const it = itemByDguid.get(dguid);
          const rings = extractRings(f.geometry);
          if (rings.length === 0) continue;

          ctx.fillStyle = it?.color || '#CBD5E1';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.4;

          for (const ring of rings) {
            ctx.beginPath();
            ring.forEach(([lon, lat], i) => {
              const [px, py] = project(lon, lat);
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }

        // Label top-ranked geographies within this view
        if (labelTopN > 0) {
          const topSlice = rankedRows.slice(0, labelTopN);
          ctx.font = 'bold 12.5px Inter, Segoe UI, Arial, sans-serif';
          ctx.textAlign = 'center';
          for (let i = 0; i < topSlice.length; i++) {
            const r = topSlice[i];
            if (!r.geo.lon || !r.geo.lat) continue;
            if (
              r.geo.lon < minLon ||
              r.geo.lon > maxLon ||
              r.geo.lat < minLat ||
              r.geo.lat > maxLat
            ) {
              continue;
            }
            const [cx, cy] = project(r.geo.lon, r.geo.lat);
            const tag = `#${i + 1} ${r.geo.cleanName} (${
              mapMetricMode === 'pct' ? `${r.pct.toFixed(1)}%` : r.count.toLocaleString()
            })`;
            const tw = ctx.measureText(tag).width + 12;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
            ctx.beginPath();
            ctx.roundRect(cx - tw / 2, cy - 11, tw, 22, 5);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(tag, cx, cy + 4);
          }
          ctx.textAlign = 'left';
        }

        ctx.restore();
      };

      const isAllOntarioCounties =
        selectedProvince === '35' &&
        selectedLevel === 'Counties / Census Divisions (CD)' &&
        selectedCarId === 'ALL' &&
        matchingFeatures.length > 20;

      if (matchingFeatures.length > 0) {
        if (isAllOntarioCounties) {
          // Focus main map on Southern, Central, Eastern & Near-North Ontario (41.9N to 46.8N) so all 40+ southern/eastern counties are large and crisp
          drawGeoJsonView(
            matchingFeatures,
            { x: mapBox.x, y: mapBox.y, w: mapBox.w, h: mapBox.h - 72 },
            { minLon: -83.6, maxLon: -74.2, minLat: 41.9, maxLat: 46.7 },
            10
          );

          // Draw Northern Ontario Inset Box in the top-left corner of the map
          const insetRect = { x: mapBox.x + 18, y: mapBox.y + 18, w: 365, h: 255 };
          ctx.fillStyle = '#DCE7F0';
          ctx.strokeStyle = '#0F3D6E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(insetRect.x, insetRect.y, insetRect.w, insetRect.h, 8);
          ctx.fill();
          ctx.stroke();

          drawGeoJsonView(
            matchingFeatures,
            { x: insetRect.x, y: insetRect.y + 24, w: insetRect.w, h: insetRect.h - 24 },
            { minLon: -95.2, maxLon: -79.0, minLat: 46.0, maxLat: 56.9 },
            0
          );

          ctx.fillStyle = '#0F3D6E';
          ctx.font = 'bold 12px Inter, Segoe UI, Arial, sans-serif';
          ctx.fillText('NORTHERN ONTARIO DISTRICTS INSET', insetRect.x + 12, insetRect.y + 18);
        } else {
          drawGeoJsonView(
            matchingFeatures,
            { x: mapBox.x, y: mapBox.y, w: mapBox.w, h: mapBox.h - 72 },
            undefined,
            10
          );
        }
      } else {
        // Centroid bubble map fallback (e.g. for Townships / CCS)
        const pts = mapItems.filter((it) => it.geo.lat && it.geo.lon);
        if (pts.length > 0) {
          let minLon = Infinity,
            maxLon = -Infinity,
            minLat = Infinity,
            maxLat = -Infinity;
          for (const p of pts) {
            minLon = Math.min(minLon, p.geo.lon!);
            maxLon = Math.max(maxLon, p.geo.lon!);
            minLat = Math.min(minLat, p.geo.lat!);
            maxLat = Math.max(maxLat, p.geo.lat!);
          }
          const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
          const cosLat = Math.max(0.35, Math.cos(midLatRad));
          const pad = 45;
          const availW = mapBox.w - pad * 2;
          const availH = mapBox.h - 72 - pad * 2;
          const lonSpan = Math.max(0.08, (maxLon - minLon) * cosLat);
          const latSpan = Math.max(0.08, maxLat - minLat);
          const scale = Math.min(availW / lonSpan, availH / latSpan);
          const offsetX = mapBox.x + pad + (availW - lonSpan * scale) / 2;
          const offsetY = mapBox.y + pad + (availH - latSpan * scale) / 2;

          for (const it of pts) {
            const cx = offsetX + (it.geo.lon! - minLon) * cosLat * scale;
            const cy = offsetY + (maxLat - it.geo.lat!) * scale;
            const r = Math.max(7, (it.radius || 7) * 1.4);
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = it.color;
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }

      // Bottom Quintile Legend Bar inside Map Card
      const legY = mapBox.y + mapBox.h - 62;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(mapBox.x + 2, legY, mapBox.w - 4, 60);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mapBox.x, legY);
      ctx.lineTo(mapBox.x + mapBox.w, legY);
      ctx.stroke();

      ctx.fillStyle = '#0F3D6E';
      ctx.font = 'bold 14px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText('QUINTILE LEGEND:', mapBox.x + 20, legY + 35);

      const palette = MTM_PALETTES[paletteMode];
      const [b1, b2, b3, b4] = quintileBreaks;
      const fmtVal = (v: number) =>
        mapMetricMode === 'pct' ? `${v.toFixed(1)}%` : Math.round(v).toLocaleString();
      const rangeLabels = [
        `P0–P20 (≤ ${fmtVal(b1)})`,
        `P20–P40 (≤ ${fmtVal(b2)})`,
        `P40–P60 (≤ ${fmtVal(b3)})`,
        `P60–P80 (≤ ${fmtVal(b4)})`,
        `P80–P100 (> ${fmtVal(b4)})`
      ];

      let lx = mapBox.x + 175;
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = palette[i];
        ctx.beginPath();
        ctx.roundRect(lx, legY + 19, 22, 22, 4);
        ctx.fill();

        ctx.fillStyle = '#334155';
        ctx.font = '600 13px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(rangeLabels[i], lx + 28, legY + 35);
        lx += 184;
      }

      // Right-Side Top 15 Ranked Geographies Leaderboard Card
      const rankBox = { x: 1172, y: 150, w: 596, h: 895 };
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(rankBox.x, rankBox.y, rankBox.w, rankBox.h, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0F3D6E';
      ctx.font = '800 17px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `TOP RANKED GEOGRAPHIES (OF ${rankedRows.length})`,
        rankBox.x + 22,
        rankBox.y + 34
      );

      // Table Column Headers
      const thY = rankBox.y + 52;
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(rankBox.x + 2, thY, rankBox.w - 4, 34);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 12.5px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText('RANK', rankBox.x + 18, thY + 22);
      ctx.fillText('GEOGRAPHY', rankBox.x + 74, thY + 22);
      ctx.textAlign = 'right';
      ctx.fillText('MATCHING FARMS', rankBox.x + 410, thY + 22);
      ctx.fillText('% SHARE', rankBox.x + 495, thY + 22);
      ctx.fillText('TOTAL FARMS', rankBox.x + 578, thY + 22);
      ctx.textAlign = 'left';

      const maxRows = Math.min(16, rankedRows.length);
      let ry = thY + 36;
      const rowH = 49;

      for (let i = 0; i < maxRows; i++) {
        const r = rankedRows[i];
        const val = mapMetricMode === 'pct' ? r.pct : r.count;
        const swatch = getQuintileColor(val, quintileBreaks, paletteMode);

        if (i % 2 === 1) {
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(rankBox.x + 2, ry, rankBox.w - 4, rowH);
        }

        // Rank badge
        ctx.fillStyle = '#64748B';
        ctx.font = 'bold 13px Consolas, monospace';
        ctx.fillText(`#${i + 1}`, rankBox.x + 18, ry + 29);

        // Quintile color dot
        ctx.fillStyle = swatch;
        ctx.beginPath();
        ctx.roundRect(rankBox.x + 54, ry + 16, 12, 16, 3);
        ctx.fill();

        // Geography name & OFA Federation subtitle
        ctx.fillStyle = '#0F3D6E';
        ctx.font = 'bold 14px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(r.geo.cleanName.slice(0, 26), rankBox.x + 74, ry + 22);

        ctx.fillStyle = '#64748B';
        ctx.font = '500 11px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(
          (r.geo.ofaFederation || r.geo.hierarchyPath || '').slice(0, 38),
          rankBox.x + 74,
          ry + 39
        );

        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 14px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(r.count.toLocaleString(), rankBox.x + 410, ry + 29);

        ctx.fillStyle = '#328475';
        ctx.font = 'bold 14px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(`${r.pct.toFixed(1)}%`, rankBox.x + 495, ry + 29);

        ctx.fillStyle = '#64748B';
        ctx.font = '500 13px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(r.totalFarms.toLocaleString(), rankBox.x + 578, ry + 29);
        ctx.textAlign = 'left';

        ry += rowH;
      }

      // Bottom Footer Citation
      ctx.fillStyle = '#475569';
      ctx.font = '600 13px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        'Source: Statistics Canada — 2021 Census of Agriculture (Tables 32-10-0153-01 to 32-10-0445-01) & 2021 Digital Boundary Files. Generated via AgCensus IQ (OFA Edition).',
        36,
        1088
      );

      // Trigger PNG download
      const slug = `${filter1 !== 'ALL' ? filter1 : 'all_farms'}_${
        filter3 !== 'ALL' ? filter3 : filter2 !== 'ALL' ? filter2 : 'all'
      }`.replace(/[^a-zA-Z0-9_-]/g, '_');

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `OFA_Drilldown_HeatMap_${slug}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsExportingMap(false);
    }
  };

  // Bottom-left tabbed distribution bars across the active scope
  const activeTabDistribution = useMemo(() => {
    const opts =
      activeChartTab === 1
        ? FILTER1_OPTIONS.slice(1)
        : activeChartTab === 2
        ? FILTER2_OPTIONS.slice(1)
        : FILTER3_OPTIONS.slice(1);

    const activeSel =
      activeChartTab === 1 ? filter1 : activeChartTab === 2 ? filter2 : filter3;

    const totalScopeFarms = Math.max(
      1,
      scopedGeos.reduce((acc, g) => acc + (getRawNumber(dataset, g.id, 'total_farms', 0) || 0), 0)
    );

    return opts
      .map((opt) => {
        const sumFarms = scopedGeos.reduce(
          (acc, g) => acc + (getRawNumber(dataset, g.id, opt.charId, 0) || 0),
          0
        );
        const pct = Number(((sumFarms / totalScopeFarms) * 100).toFixed(1));
        return {
          ...opt,
          count: sumFarms,
          pct,
          isSelected: opt.id === activeSel
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [activeChartTab, scopedGeos, dataset, filter1, filter2, filter3]);

  const focusedGeo = useMemo(
    () => dataset.geographies.find((g) => g.id === focusedGeoId) || null,
    [dataset.geographies, focusedGeoId]
  );

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Top 4-Filter Slicer Bar matching MTM Drilldown */}
      <div className="grid grid-cols-12 gap-2.5">
        <div className="col-span-12 lg:col-span-3">
          <MultiGeographyScopeSlicer
            title="Geographies"
            geographies={dataset.geographies}
            selectedLevel={selectedLevel}
            onChangeLevel={setSelectedLevel}
            selectedProvince={selectedProvince}
            onChangeProvince={setSelectedProvince}
            selectedParentCarId={selectedCarId}
            onChangeParentCarId={setSelectedCarId}
            onOpenGeoLocator={onOpenGeoLocator}
            matchingCount={scopedGeos.length}
          />
        </div>

        {/* Filter 1: Farm Type (NAICS) */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                Filter 1 - Farm Type (NAICS)
              </h3>
              <button
                type="button"
                onClick={() => setFilter1('ALL')}
                className="text-slate-400 hover:text-[#0F3D6E] cursor-pointer"
                title="Reset Filter 1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mb-2">
              Primary commodity specialization (32-10-0231-01)
            </p>
            <select
              value={filter1}
              onChange={(e) => setFilter1(e.target.value)}
              className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E]"
            >
              {FILTER1_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-[10px] text-[#328475] font-medium">
            Click bar in tab below or select from dropdown
          </div>
        </div>

        {/* Filter 2: Economic Revenue Class */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                Filter 2 - Revenue Scale
              </h3>
              <button
                type="button"
                onClick={() => setFilter2('ALL')}
                className="text-slate-400 hover:text-[#0F3D6E] cursor-pointer"
                title="Reset Filter 2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mb-2">
              Gross farm operating receipts class (32-10-0239-01)
            </p>
            <select
              value={filter2}
              onChange={(e) => setFilter2(e.target.value)}
              className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E]"
            >
              {FILTER2_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            Intersects farm type with gross revenue bracket
          </div>
        </div>

        {/* Filter 3: Operating Structure / Practice / Succession */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                Filter 3 - Structure & Practice
              </h3>
              <button
                type="button"
                onClick={() => setFilter3('ALL')}
                className="text-slate-400 hover:text-[#0F3D6E] cursor-pointer"
                title="Reset Filter 3"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mb-2">
              Legal structure, succession, tech & stewardship
            </p>
            <select
              value={filter3}
              onChange={(e) => setFilter3(e.target.value)}
              className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E]"
            >
              {FILTER3_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            3-way segment targeting across {scopedGeos.length} regions
          </div>
        </div>
      </div>

      {/* Main Split Grid: Left (Tabbed Distribution Bars) + Right (Donut Card + Map + Ranking Table) */}
      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        {/* BOTTOM-LEFT (5 cols): Characteristics Distribution with Filter 1 / 2 / 3 Tabs */}
        <div className="col-span-12 lg:col-span-5 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
              Characteristics Distribution
            </h3>
            <div className="flex items-center rounded bg-slate-100 p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setActiveChartTab(1)}
                className={`px-2.5 py-1 rounded cursor-pointer transition ${
                  activeChartTab === 1 ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                }`}
              >
                Filter 1
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab(2)}
                className={`px-2.5 py-1 rounded cursor-pointer transition ${
                  activeChartTab === 2 ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                }`}
              >
                Filter 2
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab(3)}
                className={`px-2.5 py-1 rounded cursor-pointer transition ${
                  activeChartTab === 3 ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                }`}
              >
                Filter 3
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {activeTabDistribution.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  if (activeChartTab === 1) setFilter1(item.id === filter1 ? 'ALL' : item.id);
                  if (activeChartTab === 2) setFilter2(item.id === filter2 ? 'ALL' : item.id);
                  if (activeChartTab === 3) setFilter3(item.id === filter3 ? 'ALL' : item.id);
                }}
                className={`rounded p-2 cursor-pointer transition border ${
                  item.isSelected
                    ? 'bg-[#0F3D6E]/10 border-[#0F3D6E]'
                    : 'bg-[#F7F8FA] border-slate-100 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-800 truncate pr-2">{item.label}</span>
                  <span className="font-bold text-[#0F3D6E] shrink-0">
                    {item.pct.toFixed(1)}% ({item.count.toLocaleString()})
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-200 rounded-xs overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(3, item.pct))}%`,
                      backgroundColor: item.isSelected ? '#0F3D6E' : '#328475'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT (7 cols): Top (Share of Farms Donut + Quintile Map) + Bottom (Ranking Table) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-2.5 min-h-0">
          {/* Top Half: Share of Farms Card + Map */}
          <div className="grid grid-cols-12 gap-2.5 h-64">
            {/* Share of Census Farms Donut Card */}
            <div className="col-span-12 sm:col-span-4 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col items-center justify-between text-center">
              <div className="w-full text-left">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Share of Census Farms
                </h3>
                <p className="text-[10px] text-slate-400">Matching 3-way target criteria</p>
              </div>

              {/* SVG Donut Chart */}
              <div className="relative w-28 h-28 flex items-center justify-center my-1">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-200"
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-[#0F3D6E]"
                    strokeDasharray={`${scopeSummary.sharePct}, 100`}
                    strokeWidth="4"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-extrabold text-[#0F3D6E]">
                    {scopeSummary.sharePct}%
                  </span>
                  <span className="text-[9px] text-slate-400 uppercase font-semibold">Share</span>
                </div>
              </div>

              <div className="w-full rounded bg-[#F7F8FA] p-1.5 border border-slate-100 text-[11px]">
                <span className="font-extrabold text-[#0F3D6E]">
                  {scopeSummary.sumCount.toLocaleString()}
                </span>{' '}
                <span className="text-slate-500">
                  of {scopeSummary.sumTotal.toLocaleString()} farms
                </span>
              </div>
            </div>

            {/* Quintile Map Card */}
            <div className="col-span-12 sm:col-span-8 rounded-md bg-white p-2.5 shadow-xs border border-slate-200/90 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
                <div className="flex items-center gap-1 rounded bg-slate-100 p-0.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setMapMetricMode('count')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      mapMetricMode === 'count' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                    }`}
                  >
                    Counts
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapMetricMode('pct')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      mapMetricMode === 'pct' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                    }`}
                  >
                    Percentages
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 rounded bg-slate-100 p-0.5 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setPaletteMode('standard')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        paletteMode === 'standard' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                      }`}
                    >
                      Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaletteMode('accessible')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        paletteMode === 'accessible' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                      }`}
                    >
                      Accessible
                    </button>
                  </div>

                  {/* Download High-Res Heat Map PNG Button */}
                  <button
                    type="button"
                    onClick={handleDownloadHeatMapPng}
                    disabled={isExportingMap || rankedRows.length === 0}
                    className="inline-flex items-center gap-1 rounded bg-[#328475] hover:bg-[#276B5E] disabled:opacity-50 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs transition cursor-pointer"
                    title="Download high-resolution Heat Map & Top Rankings PNG for emails, reports, or social media"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{isExportingMap ? 'Rendering...' : 'Download Map (PNG)'}</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0">
                <InteractiveAgMap
                  items={mapItems}
                  selectedGeoId={focusedGeoId}
                  focusGeo={focusedGeo}
                  onSelectGeo={(gid) => setFocusedGeoId(gid)}
                  legendElement={
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="font-semibold text-slate-600">Quintiles:</span>
                      <div className="flex items-center gap-1">
                        {MTM_PALETTES[paletteMode].map((col, idx) => (
                          <div key={col} className="flex items-center gap-1">
                            <span
                              className="inline-block w-3 h-2.5 rounded-xs"
                              style={{ backgroundColor: col }}
                            />
                            <span className="text-[10px] text-slate-600">
                              P{idx * 20}–P{(idx + 1) * 20}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  }
                />
              </div>
            </div>
          </div>

          {/* Bottom Half: Ranking Table */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col min-h-0">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Ranking ({rankedRows.length} Geographies)
                </h3>
                <span className="text-[10px] text-slate-400">
                  Click any row to focus map • Double-click to open Snapshot
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleDownloadHeatMapPng}
                  disabled={isExportingMap || rankedRows.length === 0}
                  className="inline-flex items-center gap-1 rounded border border-[#0F3D6E]/25 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-[#0F3D6E] transition cursor-pointer"
                  title="Download publication-ready Heat Map & Top Rankings PNG image"
                >
                  <Download className="w-3.5 h-3.5 text-[#328475]" />
                  <span>Heat Map (PNG)</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadRankingCsv}
                  disabled={rankedRows.length === 0}
                  className="inline-flex items-center gap-1 rounded bg-[#0F3D6E] hover:bg-[#164677] disabled:opacity-50 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs transition cursor-pointer"
                  title="Download full Data Ranks table as an Excel-ready CSV spreadsheet"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Download Ranks (Excel CSV)</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 rounded">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 sticky top-0 text-[11px] text-slate-600">
                  <tr>
                    <th className="py-1.5 px-2.5">Rank</th>
                    <th className="py-1.5 px-2.5">Geography</th>
                    <th className="py-1.5 px-2 text-right">Matching Farms</th>
                    <th className="py-1.5 px-2 text-right">% Share</th>
                    <th className="py-1.5 px-2.5 text-right">Total Census Farms</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rankedRows.map((row, idx) => (
                    <tr
                      key={row.geo.id}
                      onClick={() => setFocusedGeoId(row.geo.id)}
                      onDoubleClick={() => onSelectGeoForSnapshot(row.geo)}
                      className={`cursor-pointer transition ${
                        row.geo.id === focusedGeoId
                          ? 'bg-[#0F3D6E]/10 font-bold'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-1.5 px-2.5 font-mono text-slate-400">#{idx + 1}</td>
                      <td className="py-1.5 px-2.5 font-semibold text-[#0F3D6E]">
                        {row.geo.name}
                        {row.geo.ofaFederation && (
                          <span className="ml-1.5 text-[10px] font-normal text-[#328475]">
                            ({row.geo.ofaFederation})
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right font-bold text-slate-800">
                        {row.count.toLocaleString()}
                      </td>
                      <td className="py-1.5 px-2 text-right font-bold text-[#328475]">
                        {row.pct.toFixed(1)}%
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-slate-500">
                        {row.totalFarms.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
