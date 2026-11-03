import React, { useEffect, useMemo, useState } from 'react';
import { AgCensusDataset, GeoLevel, GeographyNode } from '../../types/census';
import {
  MTM_PALETTES,
  computeQuintileBreaks,
  downloadCsvFile,
  formatDelta,
  formatMetricValue,
  getObservation,
  getQuintileColor,
  getRawNumber
} from '../../utils/analytics';
import { MultiGeographyScopeSlicer } from '../GeographySlicer';
import { InteractiveAgMap, MapItemPoint, loadBoundariesGeoJson } from '../InteractiveAgMap';
import {
  Download,
  FileSpreadsheet,
  HelpCircle,
  Image as ImageIcon,
  Printer,
  RotateCcw
} from 'lucide-react';

interface AgRankerModuleProps {
  dataset: AgCensusDataset;
  onOpenGeoLocator: () => void;
  onSelectGeoForSnapshot: (geo: GeographyNode) => void;
}

export const AgRankerModule: React.FC<AgRankerModuleProps> = ({
  dataset,
  onOpenGeoLocator,
  onSelectGeoForSnapshot
}) => {
  const [rankerMode, setRankerMode] = useState<'counts' | 'agg'>('counts');
  const [selectedLevel, setSelectedLevel] = useState<GeoLevel>('Counties / Census Divisions (CD)');
  const [selectedProvince, setSelectedProvince] = useState<string>('35'); // Default Ontario
  const [selectedCarId, setSelectedCarId] = useState<string>('ALL');

  const categories = useMemo(() => {
    const s = new Set<string>();
    dataset.characteristics.forEach((c) => s.add(c.category));
    return Array.from(s);
  }, [dataset.characteristics]);

  const [selectedCategory, setSelectedCategory] = useState<string>(
    categories[0] || '1. Farm Types & Industry (NAICS)'
  );
  const [selectedCharId, setSelectedCharId] = useState<string>('naics_dairy');

  // Ranker range filters (matching MTM Ranker Filters card at bottom-left)
  const [minFarms, setMinFarms] = useState<number>(10);
  const [maxFarms, setMaxFarms] = useState<number>(250000);
  const [minPct, setMinPct] = useState<number>(0);
  const [maxPct, setMaxPct] = useState<number>(100);

  const [sortCol, setSortCol] = useState<'val' | 'pct' | 'delta' | 'farms'>('val');
  const [mapColorMode, setMapColorMode] = useState<'val' | 'pct'>('pct');
  const [paletteMode, setPaletteMode] = useState<'standard' | 'accessible'>('standard');
  const [focusedGeoId, setFocusedGeoId] = useState<string | null>(null);
  const [showBaseTooltip, setShowBaseTooltip] = useState<boolean>(false);
  const [isExportingMap, setIsExportingMap] = useState<boolean>(false);

  // Eligible characteristics for the current mode & category
  const availableChars = useMemo(() => {
    return dataset.characteristics.filter((c) => {
      if (c.category !== selectedCategory) return false;
      if (rankerMode === 'counts') return c.layer1 === 'Characteristic Distribution';
      return c.layer1 === 'Aggregate Statistics';
    });
  }, [dataset.characteristics, selectedCategory, rankerMode]);

  useEffect(() => {
    if (availableChars.length > 0 && !availableChars.some((c) => c.id === selectedCharId)) {
      setSelectedCharId(availableChars[0].id);
    }
  }, [availableChars, selectedCharId]);

  const activeCharMeta = useMemo(
    () =>
      dataset.characteristics.find((c) => c.id === selectedCharId) ||
      dataset.characteristics[0],
    [dataset.characteristics, selectedCharId]
  );

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

  // Compute and filter leaderboard rows
  const leaderboardRows = useMemo(() => {
    const rows = scopedGeos
      .map((geo) => {
        const obs = getObservation(dataset, geo.id, activeCharMeta);
        const totalFarms = getRawNumber(dataset, geo.id, 'total_farms', 0) || 0;
        return {
          geo,
          obs,
          totalFarms
        };
      })
      .filter((r) => {
        if (r.obs.val2021 === null) return false;
        if (r.totalFarms < minFarms || r.totalFarms > maxFarms) return false;
        if (rankerMode === 'counts' && r.obs.pctOfBase !== null) {
          if (r.obs.pctOfBase < minPct || r.obs.pctOfBase > maxPct) return false;
        }
        return true;
      });

    rows.sort((a, b) => {
      if (sortCol === 'pct') return (b.obs.pctOfBase ?? -1) - (a.obs.pctOfBase ?? -1);
      if (sortCol === 'delta') return (b.obs.pctChange ?? -999) - (a.obs.pctChange ?? -999);
      if (sortCol === 'farms') return b.totalFarms - a.totalFarms;
      return (b.obs.val2021 ?? -1) - (a.obs.val2021 ?? -1);
    });

    return rows;
  }, [scopedGeos, dataset, activeCharMeta, minFarms, maxFarms, minPct, maxPct, rankerMode, sortCol]);

  const maxVal = useMemo(
    () => Math.max(1, ...leaderboardRows.map((r) => r.obs.val2021 || 0)),
    [leaderboardRows]
  );
  const maxPctBar = useMemo(
    () => Math.max(1, ...leaderboardRows.map((r) => r.obs.pctOfBase || 0)),
    [leaderboardRows]
  );

  // Quintiles for Map
  const quintileBreaks = useMemo(() => {
    const vals = leaderboardRows.map((r) =>
      rankerMode === 'counts' && mapColorMode === 'pct' && r.obs.pctOfBase !== null
        ? r.obs.pctOfBase
        : r.obs.val2021 || 0
    );
    return computeQuintileBreaks(vals);
  }, [leaderboardRows, rankerMode, mapColorMode]);

  const getQuintileLabel = (val: number): string => {
    const [b1, b2, b3, b4] = quintileBreaks;
    if (val <= b1) return 'P0-P20 (Lowest 20%)';
    if (val <= b2) return 'P20-P40';
    if (val <= b3) return 'P40-P60 (Middle 20%)';
    if (val <= b4) return 'P60-P80';
    return 'P80-P100 (Top 20%)';
  };

  const mapItems: MapItemPoint[] = useMemo(() => {
    return leaderboardRows.map((r, idx) => {
      const mVal =
        rankerMode === 'counts' && mapColorMode === 'pct' && r.obs.pctOfBase !== null
          ? r.obs.pctOfBase
          : r.obs.val2021 || 0;
      return {
        geo: r.geo,
        value: mVal,
        formattedValue: `#${idx + 1}: ${formatMetricValue(r.obs.val2021, activeCharMeta.unit)}`,
        secondaryLabel:
          r.obs.pctOfBase !== null
            ? `${r.obs.pctOfBase.toFixed(1)}% of Base | ${r.totalFarms.toLocaleString()} farms`
            : `${r.totalFarms.toLocaleString()} total farms`,
        color: getQuintileColor(mVal, quintileBreaks, paletteMode),
        radius: 7,
        isSelected: r.geo.id === focusedGeoId
      };
    });
  }, [leaderboardRows, rankerMode, mapColorMode, activeCharMeta.unit, quintileBreaks, paletteMode, focusedGeoId]);

  const focusedGeo = useMemo(
    () => dataset.geographies.find((g) => g.id === focusedGeoId) || null,
    [dataset.geographies, focusedGeoId]
  );

  // 1. Export Leaderboard Data as Excel-Ready CSV
  const exportRankerCsv = () => {
    if (leaderboardRows.length === 0) return;
    const headers = [
      'Rank',
      'Geography',
      'Province / Region',
      'OFA Federation',
      'Geography Level',
      'DGUID',
      'Characteristic',
      'StatCan Table',
      'Unit',
      '2021 Value',
      '% of Base (2021)',
      '2016 Value',
      '2016-2021 Change',
      'Quintile Tier',
      'Total Census Farms (2021)'
    ];
    const deltaSuffix = activeCharMeta.unit === 'PERCENT' ? ' pts' : '%';
    const rows = leaderboardRows.map((r, idx) => {
      const mVal =
        rankerMode === 'counts' && mapColorMode === 'pct' && r.obs.pctOfBase !== null
          ? r.obs.pctOfBase
          : r.obs.val2021 || 0;
      return [
        idx + 1,
        r.geo.cleanName,
        r.geo.provinceName || '',
        r.geo.ofaFederation || '',
        r.geo.level,
        r.geo.dguid,
        activeCharMeta.name,
        activeCharMeta.statcanTable,
        activeCharMeta.unit,
        r.obs.val2021 ?? '',
        r.obs.pctOfBase !== null ? Number(r.obs.pctOfBase.toFixed(1)) : '',
        r.obs.val2016 ?? '',
        r.obs.pctChange !== null ? `${r.obs.pctChange.toFixed(1)}${deltaSuffix}` : '',
        getQuintileLabel(mVal),
        r.totalFarms
      ];
    });
    downloadCsvFile(`OFA_Ranker_Leaderboard_${activeCharMeta.id}.csv`, headers, rows);
  };

  // 2. Download Publication-Grade Heat Map & Leaderboard Graphic (PNG)
  const handleDownloadRankerMapPng = async () => {
    if (leaderboardRows.length === 0 || isExportingMap) return;
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
        `ONTARIO FEDERATION OF AGRICULTURE (OFA)  •  AGCENSUS IQ REGIONAL RANKER (${activeCharMeta.statcanTable})`,
        36,
        34
      );

      // Main Metric Title
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 28px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(`RANKER: ${activeCharMeta.shortName.toUpperCase()}`.slice(0, 75), 36, 72);

      // Subtitle
      const isShadedByPct = rankerMode === 'counts' && mapColorMode === 'pct';
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 16px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `Scope: ${scopeTitleLabel} (${leaderboardRows.length} Geographies)  •  Map Shaded by: ${
          isShadedByPct ? '% Share of Base' : '2021 Value / Count'
        }`,
        36,
        104
      );

      // Right Header Callout Pill (#1 Ranked Leader)
      const topRow = leaderboardRows[0];
      if (topRow) {
        const kpiW = 410;
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
        ctx.fillText('#1 RANKED LEADER IN ACTIVE SCOPE', kpiX + 18, kpiY + 26);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 22px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(topRow.geo.cleanName.slice(0, 24), kpiX + 18, kpiY + 58);

        const topValStr = formatMetricValue(topRow.obs.val2021, activeCharMeta.unit, true);
        const topPctStr =
          topRow.obs.pctOfBase !== null ? ` (${topRow.obs.pctOfBase.toFixed(1)}%)` : '';
        ctx.fillStyle = '#7DD3FC';
        ctx.font = 'bold 17px Inter, Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${topValStr}${topPctStr}`, kpiX + kpiW - 18, kpiY + 58);
        ctx.textAlign = 'left';
      }

      // Map Card Container (Left 1090px)
      const mapBox = { x: 32, y: 150, w: 1090, h: 895 };
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

      const drawGeoJsonView = (
        featuresToDraw: any[],
        rect: { x: number; y: number; w: number; h: number },
        bboxOverride?: { minLon: number; maxLon: number; minLat: number; maxLat: number },
        labelTopN: number = 10
      ) => {
        let minLon = Infinity,
          maxLon = -Infinity,
          minLat = Infinity,
          maxLat = -Infinity;

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

        const project = (lon: number, lat: number): [number, number] => [
          offsetX + (lon - minLon) * cosLat * scale,
          offsetY + (maxLat - lat) * scale
        ];

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
        ctx.clip();

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

        if (labelTopN > 0) {
          const topSlice = leaderboardRows.slice(0, labelTopN);
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
            const valLabel = isShadedByPct && r.obs.pctOfBase !== null
              ? `${r.obs.pctOfBase.toFixed(1)}%`
              : formatMetricValue(r.obs.val2021, activeCharMeta.unit, true);
            const tag = `#${i + 1} ${r.geo.cleanName} (${valLabel})`;
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
          drawGeoJsonView(
            matchingFeatures,
            { x: mapBox.x, y: mapBox.y, w: mapBox.w, h: mapBox.h - 72 },
            { minLon: -83.6, maxLon: -74.2, minLat: 41.9, maxLat: 46.7 },
            10
          );

          const insetRect = { x: mapBox.x + 18, y: mapBox.y + 18, w: 355, h: 250 };
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
            ctx.beginPath();
            ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
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
      const fmtBreak = (v: number) =>
        isShadedByPct
          ? `${v.toFixed(1)}%`
          : formatMetricValue(v, activeCharMeta.unit, true);
      const rangeLabels = [
        `P0–P20 (≤ ${fmtBreak(b1)})`,
        `P20–P40 (≤ ${fmtBreak(b2)})`,
        `P40–P60 (≤ ${fmtBreak(b3)})`,
        `P60–P80 (≤ ${fmtBreak(b4)})`,
        `P80–P100 (> ${fmtBreak(b4)})`
      ];

      let lx = mapBox.x + 170;
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = palette[i];
        ctx.beginPath();
        ctx.roundRect(lx, legY + 19, 22, 22, 4);
        ctx.fill();

        ctx.fillStyle = '#334155';
        ctx.font = '600 12.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(rangeLabels[i], lx + 27, legY + 35);
        lx += 180;
      }

      // Right-Side Top 16 Ranked Leaderboard Card (with Inline Visual Bars)
      const rankBox = { x: 1140, y: 150, w: 628, h: 895 };
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
        `LEADERBOARD: TOP ${Math.min(16, leaderboardRows.length)} OF ${leaderboardRows.length} GEOGRAPHIES`,
        rankBox.x + 20,
        rankBox.y + 34
      );

      // Table Column Headers
      const thY = rankBox.y + 52;
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(rankBox.x + 2, thY, rankBox.w - 4, 34);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 12px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText('RANK', rankBox.x + 16, thY + 22);
      ctx.fillText('GEOGRAPHY', rankBox.x + 68, thY + 22);
      ctx.textAlign = 'right';
      ctx.fillText('2021 VALUE', rankBox.x + 395, thY + 22);
      ctx.fillText('% BASE', rankBox.x + 478, thY + 22);
      ctx.fillText('16–21 Δ', rankBox.x + 548, thY + 22);
      ctx.fillText('FARMS', rankBox.x + 612, thY + 22);
      ctx.textAlign = 'left';

      const maxRows = Math.min(16, leaderboardRows.length);
      let ry = thY + 36;
      const rowH = 49;

      for (let i = 0; i < maxRows; i++) {
        const r = leaderboardRows[i];
        const val = r.obs.val2021 || 0;
        const mVal = isShadedByPct && r.obs.pctOfBase !== null ? r.obs.pctOfBase : val;
        const swatch = getQuintileColor(mVal, quintileBreaks, paletteMode);
        const barW = Math.min(95, Math.max(4, (val / maxVal) * 95));
        const delta = formatDelta(r.obs.pctChange, activeCharMeta.unit);

        if (i % 2 === 1) {
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(rankBox.x + 2, ry, rankBox.w - 4, rowH);
        }

        // Rank #
        ctx.fillStyle = '#64748B';
        ctx.font = 'bold 12.5px Consolas, monospace';
        ctx.fillText(`#${i + 1}`, rankBox.x + 16, ry + 28);

        // Quintile Swatch
        ctx.fillStyle = swatch;
        ctx.beginPath();
        ctx.roundRect(rankBox.x + 50, ry + 15, 11, 17, 3);
        ctx.fill();

        // Geography Name & Province/OFA Subtitle
        ctx.fillStyle = '#0F3D6E';
        ctx.font = 'bold 13.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(r.geo.cleanName.slice(0, 24), rankBox.x + 68, ry + 21);

        ctx.fillStyle = '#64748B';
        ctx.font = '500 10.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(
          (r.geo.ofaFederation || r.geo.provinceName || '').slice(0, 34),
          rankBox.x + 68,
          ry + 38
        );

        // 2021 Value + Inline proportional bar
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 13.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(
          formatMetricValue(r.obs.val2021, activeCharMeta.unit, true),
          rankBox.x + 395,
          ry + 22
        );

        // Mini bar track under value
        ctx.fillStyle = '#E2E8F0';
        ctx.fillRect(rankBox.x + 300, ry + 29, 95, 6);
        ctx.fillStyle = '#0F3D6E';
        ctx.fillRect(rankBox.x + 395 - barW, ry + 29, barW, 6);

        // % of Base
        ctx.fillStyle = '#328475';
        ctx.font = 'bold 13px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(
          r.obs.pctOfBase !== null ? `${r.obs.pctOfBase.toFixed(1)}%` : '—',
          rankBox.x + 478,
          ry + 28
        );

        // 2016-2021 Delta
        ctx.fillStyle =
          r.obs.pctChange === null
            ? '#94A3B8'
            : delta.isPositive
            ? '#0F9D58'
            : '#D97706';
        ctx.font = 'bold 12.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(delta.text, rankBox.x + 548, ry + 28);

        // Total Farms
        ctx.fillStyle = '#64748B';
        ctx.font = '500 12.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(r.totalFarms.toLocaleString(), rankBox.x + 612, ry + 28);
        ctx.textAlign = 'left';

        ry += rowH;
      }

      // Bottom Footer Citation
      ctx.fillStyle = '#475569';
      ctx.font = '600 13px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `Source: Statistics Canada — 2021 & 2016 Census of Agriculture (${activeCharMeta.statcanTable}) & 2021 Digital Boundary Files. Generated via AgCensus IQ (OFA Edition).`,
        36,
        1088
      );

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `OFA_Ranker_HeatMap_${activeCharMeta.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsExportingMap(false);
    }
  };

  // 3. Print / Save as PDF Full Leaderboard Report
  const handlePrintRankerPdf = () => {
    if (leaderboardRows.length === 0) return;
    const w = window.open('', '_blank', 'width=1150,height=880');
    if (!w) {
      window.print();
      return;
    }

    const rowsHtml = leaderboardRows
      .map((r, idx) => {
        const val = r.obs.val2021 || 0;
        const barW = Math.min(100, Math.max(2, (val / maxVal) * 100));
        const pctBarW =
          r.obs.pctOfBase !== null
            ? Math.min(100, Math.max(2, (r.obs.pctOfBase / maxPctBar) * 100))
            : 0;
        const delta = formatDelta(r.obs.pctChange, activeCharMeta.unit);
        const deltaColor =
          r.obs.pctChange === null
            ? '#64748B'
            : delta.isPositive
            ? '#0F9D58'
            : '#B45309';

        return `
          <tr>
            <td style="padding:6px 8px;border:1px solid #CBD5E1;font-family:Consolas,monospace;color:#475569;font-weight:700;">#${idx + 1}</td>
            <td style="padding:6px 8px;border:1px solid #CBD5E1;font-weight:700;color:#0F3D6E;">
              ${r.geo.cleanName}
              <span style="display:block;font-size:9.5px;font-weight:500;color:#475569;">${
                r.geo.ofaFederation || r.geo.provinceName || ''
              }</span>
            </td>
            <td style="padding:6px 10px;border:1px solid #CBD5E1;text-align:right;">
              <div style="font-weight:800;color:#0F172A;font-size:11.5px;">${formatMetricValue(
                r.obs.val2021,
                activeCharMeta.unit,
                false
              )}</div>
              <div style="width:100%;height:5px;background:#E2E8F0;border-radius:2px;margin-top:3px;overflow:hidden;">
                <div style="width:${barW}%;height:100%;background:#0F3D6E;"></div>
              </div>
            </td>
            ${
              rankerMode === 'counts'
                ? `<td style="padding:6px 10px;border:1px solid #CBD5E1;text-align:right;">
                    <div style="font-weight:700;color:#1D6C5E;font-size:11px;">${
                      r.obs.pctOfBase !== null ? `${r.obs.pctOfBase.toFixed(1)}%` : '—'
                    }</div>
                    <div style="width:100%;height:5px;background:#E2E8F0;border-radius:2px;margin-top:3px;overflow:hidden;">
                      <div style="width:${pctBarW}%;height:100%;background:#328475;"></div>
                    </div>
                  </td>`
                : ''
            }
            <td style="padding:6px 8px;border:1px solid #CBD5E1;text-align:right;color:#475569;">
              ${formatMetricValue(r.obs.val2016, activeCharMeta.unit, false)}
            </td>
            <td style="padding:6px 8px;border:1px solid #CBD5E1;text-align:right;font-weight:700;color:${deltaColor};">
              ${delta.text}
            </td>
            <td style="padding:6px 8px;border:1px solid #CBD5E1;text-align:right;color:#475569;">
              ${r.totalFarms.toLocaleString()}
            </td>
          </tr>
        `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>OFA Ranker Report — ${activeCharMeta.shortName}</title>
          <style>
            @page { size: portrait; margin: 10mm; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0F172A;
              margin: 0;
              padding: 16px;
              background: #FFFFFF;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            thead { display: table-header-group; }
            tr, td, th { page-break-inside: avoid !important; break-inside: avoid !important; }
            @media print {
              .no-print-bar { display: none !important; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="no-print-bar" style="background:#0F3D6E;color:#FFFFFF;padding:10px 16px;border-radius:6px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
            <div>
              <strong>OFA Printable Ranker Leaderboard Ready</strong> — Select <em>"Save as PDF"</em> or your printer in the print dialog.
            </div>
            <button onclick="window.print()" style="background:#328475;color:#FFFFFF;border:none;padding:8px 16px;border-radius:4px;font-weight:700;cursor:pointer;">
              🖨️ Print / Save as PDF Now
            </button>
          </div>

          <div style="border-bottom:3px solid #0F3D6E;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end;">
            <div>
              <div style="font-size:10px;font-weight:800;color:#328475;letter-spacing:0.06em;text-transform:uppercase;">
                ONTARIO FEDERATION OF AGRICULTURE (OFA) • AGCENSUS IQ REGIONAL LEADERBOARD REPORT
              </div>
              <h1 style="margin:3px 0 4px 0;font-size:18px;font-weight:900;color:#0F3D6E;">
                RANKER: ${activeCharMeta.name}
              </h1>
              <div style="font-size:10.5px;color:#475569;">
                <strong>Scope:</strong> ${scopeTitleLabel} (${leaderboardRows.length} Geographies) • <strong>Denominator Base:</strong> ${activeCharMeta.baseDescription}
              </div>
            </div>
            <div style="text-align:right;font-size:9.5px;color:#64748B;">
              <div><strong>Source:</strong> Statistics Canada Census of Agriculture (2021 & 2016)</div>
              <div>Official Table ${activeCharMeta.statcanTable}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr style="background:#0F3D6E;color:#FFFFFF;">
                <th style="padding:7px 8px;text-align:left;width:48px;border:1px solid #1E3A8A;">Rank</th>
                <th style="padding:7px 8px;text-align:left;border:1px solid #1E3A8A;">Geography</th>
                <th style="padding:7px 10px;text-align:right;width:150px;border:1px solid #1E3A8A;">2021 Value</th>
                ${
                  rankerMode === 'counts'
                    ? `<th style="padding:7px 10px;text-align:right;width:110px;border:1px solid #1E3A8A;">% of Base</th>`
                    : ''
                }
                <th style="padding:7px 8px;text-align:right;width:110px;border:1px solid #1E3A8A;">2016 Value</th>
                <th style="padding:7px 8px;text-align:right;width:90px;border:1px solid #1E3A8A;">16–21 Δ</th>
                <th style="padding:7px 8px;text-align:right;width:95px;border:1px solid #1E3A8A;">Total Farms</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <script>
            setTimeout(() => { window.print(); }, 350);
          </script>
        </body>
      </html>
    `;

    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2 rounded-md border border-slate-200/90 shadow-xs">
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-[#0F3D6E] uppercase">
            RANKER: {activeCharMeta.shortName}
          </h1>
          <p className="text-[11px] text-slate-500">
            Regional Leaderboard with Inline Data Bars, Range Filters & Quintile Choropleth •{' '}
            <span className="font-semibold text-[#0F3D6E]">{activeCharMeta.statcanTable}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownloadRankerMapPng}
            disabled={isExportingMap || leaderboardRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded bg-[#328475] hover:bg-[#276B5E] disabled:opacity-50 px-2.5 py-1.5 text-xs font-bold text-white shadow-2xs transition cursor-pointer"
            title="Download high-resolution Heat Map & Top 16 Leaderboard PNG for emails, reports, or social media"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>{isExportingMap ? 'Rendering...' : 'Download Map & Graph (PNG)'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrintRankerPdf}
            disabled={leaderboardRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded bg-[#0F3D6E] hover:bg-[#164677] disabled:opacity-50 px-2.5 py-1.5 text-xs font-bold text-white shadow-2xs transition cursor-pointer"
            title="Print or Save full Leaderboard with inline bars as a PDF report"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save PDF</span>
          </button>

          <button
            type="button"
            onClick={exportRankerCsv}
            disabled={leaderboardRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E] hover:bg-slate-50 transition cursor-pointer"
            title="Download complete Leaderboard data as an Excel-ready CSV spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#328475]" />
            <span>Download Data (Excel CSV)</span>
          </button>
        </div>
      </div>

      {/* Main 3-Column Grid matching MTM Ranker */}
      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        {/* LEFT COLUMN (3 cols): Geographies + Variable + Ranker Filters */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2 overflow-y-auto pr-0.5">
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
            matchingCount={leaderboardRows.length}
          />

          {/* Variable Slicer with Counts vs Aggregate Statistics Mode Switcher */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E] mb-2">
              Variable
            </h3>

            {/* Seamless Switch between Ranker Counts and Ranker Agg */}
            <div className="grid grid-cols-2 gap-1 rounded bg-slate-100 p-1 text-[11px] font-semibold mb-2.5">
              <button
                type="button"
                onClick={() => setRankerMode('counts')}
                className={`py-1 rounded cursor-pointer transition ${
                  rankerMode === 'counts'
                    ? 'bg-[#0F3D6E] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Counts & Share
              </button>
              <button
                type="button"
                onClick={() => setRankerMode('agg')}
                className={`py-1 rounded cursor-pointer transition ${
                  rankerMode === 'agg'
                    ? 'bg-[#0F3D6E] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Aggregate Stats
              </button>
            </div>

            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
              Variable Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="mb-2 w-full rounded border border-slate-300 bg-[#F8FAFC] px-2 py-1.5 text-xs font-semibold text-[#0F3D6E]"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
              Specific Metric to Rank
            </label>
            <select
              value={selectedCharId}
              onChange={(e) => setSelectedCharId(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800"
            >
              {availableChars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.shortName}
                </option>
              ))}
            </select>
          </div>

          {/* Ranker Filters Card matching MTM Ranker bottom-left */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Ranker Filters
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setMinFarms(0);
                    setMaxFarms(250000);
                    setMinPct(0);
                    setMaxPct(100);
                  }}
                  title="Reset Ranker Filters"
                  className="text-slate-400 hover:text-[#0F3D6E] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Total Census Farms (Min / Max)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="number"
                      value={minFarms}
                      onChange={(e) => setMinFarms(Number(e.target.value) || 0)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      placeholder="Min farms"
                    />
                    <input
                      type="number"
                      value={maxFarms}
                      onChange={(e) => setMaxFarms(Number(e.target.value) || 250000)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      placeholder="Max farms"
                    />
                  </div>
                </div>

                {rankerMode === 'counts' && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1">
                      <span>Percentage Share Filter (%)</span>
                      <span className="text-[#0F3D6E]">
                        {minPct}% – {maxPct}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={minPct}
                        onChange={(e) => setMinPct(Number(e.target.value) || 0)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={maxPct}
                        onChange={(e) => setMaxPct(Number(e.target.value) || 100)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
              Showing <span className="font-bold text-[#0F3D6E]">{leaderboardRows.length}</span> of{' '}
              {scopedGeos.length} geographies matching criteria.
            </div>
          </div>
        </div>

        {/* CENTER COLUMN (5 cols): Leaderboard Table with Inline Data Bars */}
        <div className="col-span-12 lg:col-span-5 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                {activeCharMeta.shortName}
              </h3>
              <p className="text-[10px] text-slate-400">
                Click column headers to sort • Click &apos;Map&apos; to zoom
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {rankerMode === 'counts' && (
                <button
                  type="button"
                  onClick={() => setShowBaseTooltip((p) => !p)}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  <span>Base</span>
                  <HelpCircle className="w-3 h-3 text-[#4E79A7]" />
                </button>
              )}

              <button
                type="button"
                onClick={handlePrintRankerPdf}
                disabled={leaderboardRows.length === 0}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-[#0F3D6E] cursor-pointer"
                title="Print or Save Leaderboard as PDF"
              >
                <Printer className="w-3 h-3 text-[#328475]" />
                <span>PDF</span>
              </button>

              <button
                type="button"
                onClick={exportRankerCsv}
                disabled={leaderboardRows.length === 0}
                className="inline-flex items-center gap-1 rounded bg-[#0F3D6E] hover:bg-[#164677] px-2 py-0.5 text-[11px] font-bold text-white cursor-pointer"
                title="Download Leaderboard as Excel CSV"
              >
                <Download className="w-3 h-3 text-emerald-300" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {showBaseTooltip && (
            <div className="mb-2 rounded bg-[#071D49] p-2 text-xs text-white flex items-center justify-between">
              <span>Denominator Base: {activeCharMeta.baseDescription}</span>
              <button onClick={() => setShowBaseTooltip(false)}>✕</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto border border-slate-200 rounded">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 sticky top-0 text-[11px] text-slate-600 z-10">
                <tr>
                  <th className="py-2 px-2">Geography</th>
                  <th
                    onClick={() => setSortCol('val')}
                    className="py-2 px-2 text-right cursor-pointer hover:text-[#0F3D6E]"
                  >
                    {rankerMode === 'counts' ? 'Count / Value' : 'Value'} {sortCol === 'val' && '▼'}
                  </th>
                  {rankerMode === 'counts' && (
                    <th
                      onClick={() => setSortCol('pct')}
                      className="py-2 px-2 text-right cursor-pointer hover:text-[#0F3D6E]"
                    >
                      % {sortCol === 'pct' && '▼'}
                    </th>
                  )}
                  <th
                    onClick={() => setSortCol('delta')}
                    className="py-2 px-2 text-right cursor-pointer hover:text-[#0F3D6E]"
                  >
                    16–21 Δ {sortCol === 'delta' && '▼'}
                  </th>
                  <th
                    onClick={() => setSortCol('farms')}
                    className="py-2 px-2 text-right cursor-pointer hover:text-[#0F3D6E]"
                  >
                    Farms {sortCol === 'farms' && '▼'}
                  </th>
                  <th className="py-2 px-1.5 text-center">Map</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaderboardRows.map((row, idx) => {
                  const val = row.obs.val2021 || 0;
                  const pct = row.obs.pctOfBase;
                  const barW = Math.min(100, Math.max(2, (val / maxVal) * 100));
                  const pctBarW =
                    pct !== null ? Math.min(100, Math.max(2, (pct / maxPctBar) * 100)) : 0;
                  const delta = formatDelta(row.obs.pctChange, activeCharMeta.unit);

                  return (
                    <tr
                      key={row.geo.id}
                      onClick={() => setFocusedGeoId(row.geo.id)}
                      onDoubleClick={() => onSelectGeoForSnapshot(row.geo)}
                      className={`cursor-pointer transition ${
                        row.geo.id === focusedGeoId ? 'bg-[#0F3D6E]/10' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-1.5 px-2 font-medium text-slate-800 max-w-[140px]">
                        <div className="truncate font-semibold text-[#0F3D6E]" title={row.geo.name}>
                          <span className="text-slate-400 font-mono mr-1">#{idx + 1}</span>
                          {row.geo.cleanName}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {row.geo.provinceName}
                        </div>
                      </td>

                      {/* Value cell with inline proportional data bar (matching MTM Ranker) */}
                      <td className="py-1.5 px-2 text-right align-middle">
                        <div className="font-bold text-slate-900">
                          {formatMetricValue(row.obs.val2021, activeCharMeta.unit, true)}
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-xs overflow-hidden mt-0.5">
                          <div
                            className="h-full bg-[#0F3D6E]"
                            style={{ width: `${barW}%` }}
                          />
                        </div>
                      </td>

                      {/* Percentage cell with inline proportional data bar */}
                      {rankerMode === 'counts' && (
                        <td className="py-1.5 px-2 text-right align-middle">
                          <div className="font-bold text-[#0F3D6E]">
                            {pct !== null ? `${pct.toFixed(1)}%` : '—'}
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-xs overflow-hidden mt-0.5">
                            <div
                              className="h-full bg-[#328475]"
                              style={{ width: `${pctBarW}%` }}
                            />
                          </div>
                        </td>
                      )}

                      <td
                        className={`py-1.5 px-2 text-right font-semibold ${
                          row.obs.pctChange === null
                            ? 'text-slate-300'
                            : delta.isPositive
                            ? 'text-[#0F9D58]'
                            : 'text-amber-600'
                        }`}
                      >
                        {delta.text}
                      </td>

                      <td className="py-1.5 px-2 text-right text-slate-500">
                        {row.totalFarms.toLocaleString()}
                      </td>

                      <td className="py-1.5 px-1.5 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocusedGeoId(row.geo.id);
                          }}
                          className="text-[11px] font-semibold text-[#0F3D6E] underline hover:text-[#328475] cursor-pointer"
                        >
                          Map
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN (4 cols): Synchronized Quintile Map */}
        <div className="col-span-12 lg:col-span-4 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
            {rankerMode === 'counts' ? (
              <div className="flex items-center gap-1 rounded bg-slate-100 p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setMapColorMode('val')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    mapColorMode === 'val' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                  }`}
                >
                  Counts
                </button>
                <button
                  type="button"
                  onClick={() => setMapColorMode('pct')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    mapColorMode === 'pct' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                  }`}
                >
                  Percentages
                </button>
              </div>
            ) : (
              <span className="text-xs font-bold uppercase text-[#0F3D6E]">
                Quintile Map ({activeCharMeta.shortName})
              </span>
            )}

            <div className="flex items-center gap-1">
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

              <button
                type="button"
                onClick={handleDownloadRankerMapPng}
                disabled={isExportingMap || leaderboardRows.length === 0}
                className="inline-flex items-center gap-1 rounded bg-[#328475] hover:bg-[#276B5E] disabled:opacity-50 px-2 py-1 text-[11px] font-bold text-white shadow-2xs transition cursor-pointer"
                title="Download Heat Map & Top 16 Leaderboard as high-res PNG"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>PNG</span>
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
                <div className="flex flex-col w-full gap-1">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                    <span>P0 ({quintileBreaks[0].toFixed(1)})</span>
                    <span>P50</span>
                    <span>P100 ({quintileBreaks[5].toFixed(1)})</span>
                  </div>
                  <div className="grid grid-cols-5 h-2.5 w-full rounded-xs overflow-hidden">
                    {MTM_PALETTES[paletteMode].map((col) => (
                      <div key={col} style={{ backgroundColor: col }} />
                    ))}
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};
