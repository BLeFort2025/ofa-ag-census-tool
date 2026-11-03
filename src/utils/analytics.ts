import { AgCensusDataset, AgScoreSlot, CharacteristicMeta, GeographyNode, UnitType } from '../types/census';

export function formatMetricValue(val: number | null | undefined, unit: UnitType, compact = false, status?: string | null): string {
  if (val === null || val === undefined || Number.isNaN(val)) {
    if (status === 'x') return 'x (Suppressed)';
    if (status === 'F') return 'F (Unreliable)';
    return 'N/A';
  }

  if (unit === 'DOLLARS') {
    if (compact) {
      if (Math.abs(val) >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
      if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
      if (Math.abs(val) >= 10_000) return `$${(val / 1_000).toFixed(1)}K`;
    }
    return `$${Math.round(val).toLocaleString('en-CA')}`;
  }

  if (unit === 'PERCENT') {
    return `${val.toFixed(1)}%`;
  }

  if (unit === 'AGE') {
    return `${val.toFixed(1)} yrs`;
  }

  if (compact) {
    if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
    if (Math.abs(val) >= 100_000) return `${(val / 1_000).toFixed(1)}K`;
  }

  if (Number.isInteger(val)) {
    return val.toLocaleString('en-CA');
  }
  return val.toLocaleString('en-CA', { maximumFractionDigits: 1 });
}

export function formatDelta(
  pctChange: number | null | undefined,
  unit?: UnitType
): { text: string; isPositive: boolean; isNeutral: boolean } {
  if (pctChange === null || pctChange === undefined || Number.isNaN(pctChange)) {
    return { text: '—', isPositive: false, isNeutral: true };
  }
  const sign = pctChange > 0 ? '+' : '';
  const suffix = unit === 'PERCENT' ? ' pts' : '%';
  return {
    text: `${sign}${pctChange.toFixed(1)}${suffix}`,
    isPositive: pctChange > 0,
    isNeutral: Math.abs(pctChange) < 0.05
  };
}

export interface EnrichedObservation {
  val2021: number | null;
  val2016: number | null;
  status: string | null;
  pctChange: number | null;
  baseVal2021: number | null;
  pctOfBase: number | null;
  pctOfBase2016: number | null;
}

export function getObservation(
  dataset: AgCensusDataset,
  geoId: string,
  charMeta: CharacteristicMeta
): EnrichedObservation {
  const geoMap = dataset.values[geoId] || {};
  const raw = geoMap[charMeta.id];
  const val2021 = raw && typeof raw[0] === 'number' ? raw[0] : null;
  const val2016 = raw && raw.length > 1 && typeof raw[1] === 'number' ? raw[1] : null;
  const status = val2021 === null ? ((raw && typeof raw[2] === 'string' ? raw[2] : 'x') as string) : null;

  let pctChange: number | null = null;
  if (val2021 !== null && val2016 !== null) {
    if (charMeta.unit === 'PERCENT') {
      pctChange = Number((val2021 - val2016).toFixed(1));
    } else if (val2016 > 0) {
      pctChange = Number((((val2021 - val2016) / val2016) * 100).toFixed(1));
    }
  }

  let baseVal2021: number | null = null;
  let pctOfBase: number | null = null;
  let pctOfBase2016: number | null = null;

  if (charMeta.baseId) {
    const baseRaw = geoMap[charMeta.baseId];
    baseVal2021 = baseRaw && typeof baseRaw[0] === 'number' ? baseRaw[0] : null;
    const baseVal2016 = baseRaw && baseRaw.length > 1 && typeof baseRaw[1] === 'number' ? baseRaw[1] : null;
    if (val2021 !== null && baseVal2021 !== null && baseVal2021 > 0) {
      pctOfBase = Number(((val2021 / baseVal2021) * 100).toFixed(2));
    }
    if (val2016 !== null && baseVal2016 !== null && baseVal2016 > 0) {
      pctOfBase2016 = Number(((val2016 / baseVal2016) * 100).toFixed(2));
    }
  } else if (charMeta.unit === 'PERCENT' && val2021 !== null) {
    pctOfBase = val2021;
    pctOfBase2016 = val2016;
  }

  return {
    val2021,
    val2016,
    status,
    pctChange,
    baseVal2021,
    pctOfBase,
    pctOfBase2016
  };
}

export function getRawNumber(
  dataset: AgCensusDataset,
  geoId: string,
  charId: string,
  idx: 0 | 1 = 0
): number | null {
  const arr = dataset.values[geoId]?.[charId];
  if (!arr || arr.length <= idx) return null;
  const v = arr[idx];
  return typeof v === 'number' ? v : null;
}

// Haversine distance in km between two WGS84 coordinates
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function getNearbyGeographies(
  dataset: AgCensusDataset,
  targetGeo: GeographyNode,
  limit = 12
): Array<{ geo: GeographyNode; distanceKm: number; farms: number | null; areaAcres: number | null }> {
  const peers = dataset.geographies.filter(
    (g) => g.level === targetGeo.level && g.id !== targetGeo.id
  );
  const withDist = peers.map((g) => {
    const distanceKm = haversineKm(targetGeo.lat, targetGeo.lon, g.lat, g.lon);
    const farms = getRawNumber(dataset, g.id, 'total_farms', 0);
    const areaAcres = getRawNumber(dataset, g.id, 'land_total_acres', 0);
    return { geo: g, distanceKm, farms, areaAcres };
  });
  withDist.sort((a, b) => a.distanceKm - b.distanceKm);
  return withDist.slice(0, limit);
}

// Quintile calculation matching MTM Drilldown & Ranker (P0, P20, P40, P60, P80, P100)
export function computeQuintileBreaks(values: number[]): [number, number, number, number, number, number] {
  const clean = values.filter((v) => v !== null && !Number.isNaN(v)).sort((a, b) => a - b);
  if (clean.length === 0) return [0, 0, 0, 0, 0, 0];
  const quantile = (p: number) => {
    const idx = (clean.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const w = idx - lo;
    return clean[lo] * (1 - w) + clean[hi] * w;
  };
  return [
    clean[0],
    quantile(0.2),
    quantile(0.4),
    quantile(0.6),
    quantile(0.8),
    clean[clean.length - 1]
  ];
}

export const MTM_PALETTES = {
  standard: ['#D9E6F2', '#94B8D7', '#4E89AE', '#1F5F8B', '#0F3D6E'],
  accessible: ['#FDE725', '#5EC962', '#21918C', '#3B528B', '#440154'],
  agscore: {
    band0_50: '#E15759',   // Coral red (0-50)
    band50_70: '#F28E2B',  // Amber orange (50-70)
    band70_90: '#4E79A7',  // Steel blue (70-90)
    band90_100: '#59A14F'  // Sage green (90-100)
  }
};

export function getQuintileColor(
  val: number | null,
  breaks: [number, number, number, number, number, number],
  palette: 'standard' | 'accessible' = 'standard'
): string {
  if (val === null || Number.isNaN(val)) return '#CBD5E1';
  const colors = MTM_PALETTES[palette];
  if (val <= breaks[1]) return colors[0];
  if (val <= breaks[2]) return colors[1];
  if (val <= breaks[3]) return colors[2];
  if (val <= breaks[4]) return colors[3];
  return colors[4];
}

// Standard Normal CDF approximation (Abramowitz & Stegun) matching Excel/DAX NORM.S.DIST(z, TRUE)
export function normSDist(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const b1 = 0.31938153;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;

  if (z >= 0.0) {
    const t = 1.0 / (1.0 + p * z);
    return 1.0 - c * Math.exp((-z * z) / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  } else {
    const t = 1.0 / (1.0 - p * z);
    return c * Math.exp((-z * z) / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  }
}

export interface AgScoreRow {
  geo: GeographyNode;
  totalFarms: number;
  farmGrowthPct: number | null;
  avgRevPerFarm: number | null;
  landValuePerAcre: number | null;
  compositeScore: number;
  slotMetrics: Array<{
    slotIndex: number;
    rawVal: number | null;
    pctOrVal: number | null;
    zScore: number;
    percentile: number;
  }>;
}

export function computeAgScoreRanking(
  dataset: AgCensusDataset,
  candidateGeos: GeographyNode[],
  slots: AgScoreSlot[],
  minFarms: number,
  maxFarms: number,
  minFarmGrowthPct: number,
  minAvgRev: number,
  maxAvgRev: number
): AgScoreRow[] {
  const charMap = new Map(dataset.characteristics.map((c) => [c.id, c]));
  const activeSlots = slots.filter((s) => s.characteristicId && s.weight > 0);

  // Step 1: Filter candidate geographies by global pre-filters and slot % range filters
  const filteredGeos = candidateGeos.filter((g) => {
    const farms21 = getRawNumber(dataset, g.id, 'total_farms', 0);
    if (farms21 === null || farms21 < minFarms || farms21 > maxFarms) return false;

    const farms16 = getRawNumber(dataset, g.id, 'total_farms', 1);
    const growth =
      farms21 !== null && farms16 !== null && farms16 > 0
        ? ((farms21 - farms16) / farms16) * 100
        : 0;
    if (growth < minFarmGrowthPct) return false;

    const avgRev = getRawNumber(dataset, g.id, 'avg_rev_per_farm', 0) ?? 0;
    if (avgRev < minAvgRev || avgRev > maxAvgRev) return false;

    // Check slot % filters when characteristic has a percentage
    for (const s of activeSlots) {
      const cMeta = charMap.get(s.characteristicId);
      if (!cMeta) continue;
      const obs = getObservation(dataset, g.id, cMeta);
      const checkPct = obs.pctOfBase !== null ? obs.pctOfBase : null;
      if (checkPct !== null) {
        if (checkPct < s.minPct || checkPct > s.maxPct) return false;
      } else if (obs.val2021 === null) {
        return false;
      }
    }
    return true;
  });

  if (filteredGeos.length === 0) return [];

  // Step 2: Compute Mean and StdDev across filteredGeos for each active slot (matching MTM Avg Pct 1..4 & StdDev Pct 1..4)
  const slotStats = new Map<number, { mean: number; stdDev: number }>();
  for (const s of activeSlots) {
    const cMeta = charMap.get(s.characteristicId);
    if (!cMeta) continue;
    const vals: number[] = [];
    for (const g of filteredGeos) {
      const obs = getObservation(dataset, g.id, cMeta);
      const metric = obs.pctOfBase !== null ? obs.pctOfBase : obs.val2021;
      if (metric !== null && !Number.isNaN(metric)) {
        vals.push(metric);
      }
    }
    if (vals.length === 0) {
      slotStats.set(s.slotIndex, { mean: 0, stdDev: 1 });
    } else {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / Math.max(1, vals.length - 1);
      const stdDev = Math.sqrt(variance) || 1;
      slotStats.set(s.slotIndex, { mean, stdDev });
    }
  }

  const totalWeight = activeSlots.reduce((acc, s) => acc + s.weight, 0) || 1;

  // Step 3: Score each geography
  const rows: AgScoreRow[] = filteredGeos.map((g) => {
    const farms21 = getRawNumber(dataset, g.id, 'total_farms', 0) ?? 0;
    const farms16 = getRawNumber(dataset, g.id, 'total_farms', 1);
    const farmGrowthPct =
      farms16 !== null && farms16 > 0 ? Number((((farms21 - farms16) / farms16) * 100).toFixed(1)) : null;
    const avgRevPerFarm = getRawNumber(dataset, g.id, 'avg_rev_per_farm', 0);
    const landValuePerAcre = getRawNumber(dataset, g.id, 'land_bldg_value_per_acre', 0);

    let weightedSum = 0;
    const slotMetrics = slots.map((s) => {
      const cMeta = charMap.get(s.characteristicId);
      if (!cMeta || s.weight <= 0) {
        return { slotIndex: s.slotIndex, rawVal: null, pctOrVal: null, zScore: 0, percentile: 50 };
      }
      const obs = getObservation(dataset, g.id, cMeta);
      const metric = obs.pctOfBase !== null ? obs.pctOfBase : obs.val2021;
      const st = slotStats.get(s.slotIndex) || { mean: 0, stdDev: 1 };
      let z = metric !== null ? (metric - st.mean) / st.stdDev : 0;
      if (s.invert) z = -z;
      const percentile = Number((normSDist(z) * 100).toFixed(1));
      weightedSum += percentile * s.weight;
      return {
        slotIndex: s.slotIndex,
        rawVal: obs.val2021,
        pctOrVal: metric,
        zScore: Number(z.toFixed(2)),
        percentile
      };
    });

    const compositeScore = activeSlots.length > 0 ? Number((weightedSum / totalWeight).toFixed(1)) : 50.0;

    return {
      geo: g,
      totalFarms: farms21,
      farmGrowthPct,
      avgRevPerFarm,
      landValuePerAcre,
      compositeScore,
      slotMetrics
    };
  });

  rows.sort((a, b) => b.compositeScore - a.compositeScore);
  return rows;
}

export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): void {
  const escapeCsvCell = (cell: string | number | null | undefined): string => {
    if (cell === null || cell === undefined) return '';
    const s = String(cell);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(','))
  ];
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
