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
  // Colorblind-safe sequential ramp that progresses intuitively from Light (Lowest) -> Deep Indigo (Highest)
  accessible: ['#E2F0CB', '#7FCDBB', '#1D91C0', '#225EA8', '#1B1F6B'],
  agscore: {
    band0_50: '#E15759',   // Coral red (0-50)
    band50_70: '#F28E2B',  // Amber orange (50-70)
    band70_90: '#4E79A7',  // Steel blue (70-90)
    band90_100: '#59A14F'  // Sage green (90-100)
  }
};

/**
 * Empirical Statistics Canada / Municipal anchor city & region subtitles for numbered
 * Census Divisions ("Division No. X") and numbered Census Agricultural Regions ("CAR X")
 * across Newfoundland & Labrador, PEI, Nova Scotia, New Brunswick, Manitoba, Saskatchewan, and Alberta.
 */
export const NUMBERED_GEO_HUMAN_LABELS: Record<string, string> = {
  // Newfoundland and Labrador CDs (10)
  '2021A00031001': "Division No. 1 (Avalon / St. John's)",
  '2021A00031002': 'Division No. 2 (Burin Peninsula)',
  '2021A00031003': 'Division No. 3 (South Coast)',
  '2021A00031004': "Division No. 4 (St. George's / Codroy Valley)",
  '2021A00031005': 'Division No. 5 (Humber / Corner Brook / Deer Lake)',
  '2021A00031006': 'Division No. 6 (Central / Grand Falls-Windsor)',
  '2021A00031007': 'Division No. 7 (Bonavista / Clarenville)',
  '2021A00031008': 'Division No. 8 (Notre Dame Bay / Lewisporte)',
  '2021A00031009': 'Division No. 9 (Northern Peninsula)',
  '2021A00031010': 'Division No. 10 (Labrador / Happy Valley-Goose Bay)',
  '2021A00031011': 'Division No. 11 (Nunatsiavut / North Labrador)',

  // Manitoba CDs (46)
  '2021A00034601': 'Division No. 1 (Eastern MB / Lac du Bonnet)',
  '2021A00034602': 'Division No. 2 (Steinbach / Hanover / Southeast)',
  '2021A00034603': 'Division No. 3 (Winkler / Morden / Morris)',
  '2021A00034604': 'Division No. 4 (Pembina / Louise / Pilot Mound)',
  '2021A00034605': 'Division No. 5 (Killarney / Boissevain / Southwest)',
  '2021A00034606': 'Division No. 6 (Virden / Pipestone)',
  '2021A00034607': 'Division No. 7 (Brandon / Souris / Carberry)',
  '2021A00034608': 'Division No. 8 (Gladstone / Treherne / Central)',
  '2021A00034609': 'Division No. 9 (Portage la Prairie)',
  '2021A00034610': 'Division No. 10 (Macdonald / Cartier)',
  '2021A00034611': 'Division No. 11 (Winnipeg / Headingley)',
  '2021A00034612': 'Division No. 12 (Beausejour / Springfield)',
  '2021A00034613': 'Division No. 13 (Selkirk / St. Andrews)',
  '2021A00034614': 'Division No. 14 (Stonewall / Rockwood / Woodlands)',
  '2021A00034615': 'Division No. 15 (Minnedosa / Neepawa / Yellowhead)',
  '2021A00034616': 'Division No. 16 (Russell / Roblin / Rossburn)',
  '2021A00034617': 'Division No. 17 (Dauphin / Ste. Rose / Parkland)',
  '2021A00034618': 'Division No. 18 (Interlake / Gimli / Arborg)',
  '2021A00034619': 'Division No. 19 (Northeast Interlake)',
  '2021A00034620': 'Division No. 20 (Swan River Valley)',
  '2021A00034621': 'Division No. 21 (The Pas / Flin Flon)',
  '2021A00034622': 'Division No. 22 (Thompson / North Central)',
  '2021A00034623': 'Division No. 23 (Churchill / Northern MB)',

  // Saskatchewan CDs (47)
  '2021A00034701': 'Division No. 1 (Estevan / Carlyle / Southeast)',
  '2021A00034702': 'Division No. 2 (Weyburn / Radville)',
  '2021A00034703': 'Division No. 3 (Assiniboia / Gravelbourg)',
  '2021A00034704': 'Division No. 4 (Maple Creek / Shaunavon)',
  '2021A00034705': 'Division No. 5 (Melville / Moosomin)',
  '2021A00034706': 'Division No. 6 (Regina / Indian Head / Lumsden)',
  '2021A00034707': 'Division No. 7 (Moose Jaw / Outlook)',
  '2021A00034708': 'Division No. 8 (Swift Current / Gull Lake)',
  '2021A00034709': 'Division No. 9 (Yorkton / Canora / Kamsack)',
  '2021A00034710': 'Division No. 10 (Wynyard / Foam Lake / Watrous)',
  '2021A00034711': 'Division No. 11 (Saskatoon / Outlook North)',
  '2021A00034712': 'Division No. 12 (Rosetown / Biggar)',
  '2021A00034713': 'Division No. 13 (Kindersley / Kerrobert)',
  '2021A00034714': 'Division No. 14 (Melfort / Tisdale / Nipawin)',
  '2021A00034715': 'Division No. 15 (Prince Albert / Humboldt)',
  '2021A00034716': 'Division No. 16 (North Battleford / Blaine Lake)',
  '2021A00034717': 'Division No. 17 (Lloydminster / Meadow Lake)',
  '2021A00034718': 'Division No. 18 (Northern Saskatchewan)',

  // Alberta CDs (48)
  '2021A00034801': 'Division No. 1 (Medicine Hat / Cypress / Forty Mile)',
  '2021A00034802': 'Division No. 2 (Lethbridge / Taber / Brooks)',
  '2021A00034803': 'Division No. 3 (Pincher Creek / Cardston / Claresholm)',
  '2021A00034804': 'Division No. 4 (Hanna / Oyen / Special Areas)',
  '2021A00034805': 'Division No. 5 (Strathmore / Drumheller / Vulcan)',
  '2021A00034806': 'Division No. 6 (Calgary / Rocky View / Foothills)',
  '2021A00034807': 'Division No. 7 (Stettler / Wainwright / Provost)',
  '2021A00034808': 'Division No. 8 (Red Deer / Lacombe / Ponoka)',
  '2021A00034809': 'Division No. 9 (Rocky Mountain House / Clearwater)',
  '2021A00034810': 'Division No. 10 (Camrose / Vermilion / Lloydminster)',
  '2021A00034811': 'Division No. 11 (Edmonton / Leduc / Wetaskiwin / Parkland)',
  '2021A00034812': 'Division No. 12 (St. Paul / Bonnyville / Smoky Lake)',
  '2021A00034813': 'Division No. 13 (Westlock / Barrhead / Athabasca)',
  '2021A00034814': 'Division No. 14 (Edson / Hinton / Yellowhead)',
  '2021A00034815': 'Division No. 15 (Canmore / Banff / Ranchland)',
  '2021A00034816': 'Division No. 16 (Fort McMurray / Wood Buffalo)',
  '2021A00034817': 'Division No. 17 (Mackenzie / High Level / Slave Lake)',
  '2021A00034818': 'Division No. 18 (Greenview / Valleyview)',
  '2021A00034819': 'Division No. 19 (Grande Prairie / Peace River)',

  // Numbered CARs (Agricultural Regions)
  '2021S05011001': "CAR 1 (Avalon / St. John's)",
  '2021S05011002': 'CAR 2 (Central / Gander / Grand Falls)',
  '2021S05011003': 'CAR 3 (Western NL & Labrador)',
  '2021S05011101': 'CAR 1 (Kings County / Eastern PEI)',
  '2021S05011102': 'CAR 2 (Queens County / Central PEI)',
  '2021S05011103': 'CAR 3 (Prince County / Western PEI)',
  '2021S05011201': 'CAR 1 (Southern Nova Scotia)',
  '2021S05011202': 'CAR 2 (Annapolis Valley / Western NS)',
  '2021S05011203': 'CAR 3 (Central / Truro / Halifax)',
  '2021S05011204': 'CAR 4 (Northern / Antigonish / Pictou)',
  '2021S05011205': 'CAR 5 (Cape Breton Island)',
  '2021S05011301': 'CAR 1 (Upper St. John River Valley / Northwest NB)',
  '2021S05011302': 'CAR 2 (Fredericton / Southwest NB)',
  '2021S05011303': 'CAR 3 (Moncton / Southeast NB)',
  '2021S05011304': 'CAR 4 (Miramichi / Northeast NB)',
  '2021S05014601': 'CAR 1 (Southwest MB / Boissevain / Killarney)',
  '2021S05014602': 'CAR 2 (Brandon / Virden / Souris)',
  '2021S05014603': 'CAR 3 (Minnedosa / Neepawa / Shoal Lake)',
  '2021S05014604': 'CAR 4 (Russell / Roblin / Riding Mountain)',
  '2021S05014605': 'CAR 5 (Swan River Valley)',
  '2021S05014606': 'CAR 6 (Dauphin / Ste. Rose / Parkland)',
  '2021S05014607': 'CAR 7 (Portage la Prairie / Central Plains)',
  '2021S05014608': 'CAR 8 (Winkler / Morden / Pembina Valley)',
  '2021S05014609': 'CAR 9 (Steinbach / Southeast / Red River)',
  '2021S05014610': 'CAR 10 (Eastern MB / Lac du Bonnet)',
  '2021S05014611': 'CAR 11 (South Interlake / Stonewall / Selkirk)',
  '2021S05014612': 'CAR 12 (North Interlake / Gimli / Arborg)',
  '2021S05014701': 'CAR 1 (Southeast SK / Estevan / Yorkton)',
  '2021S05014702': 'CAR 2 (Regina / Weyburn Plains)',
  '2021S05014703': 'CAR 3 (Southwest SK / Swift Current / Moose Jaw)',
  '2021S05014704': 'CAR 4 (West Central SK / Saskatoon / Kindersley)',
  '2021S05014705': 'CAR 5 (Northeast SK / Melfort / Tisdale)',
  '2021S05014706': 'CAR 6 (Northwest SK / Prince Albert / Battlefords)',
  '2021S05014707': 'CAR 7 (Northern Saskatchewan)',
  '2021S05014810': 'CAR 1 (Southeast AB / Medicine Hat / Special Areas)',
  '2021S05014820': 'CAR 2 (South Central AB / Lethbridge / Taber / Strathmore)',
  '2021S05014830': 'CAR 3 (Southwest Foothills / Calgary / Pincher Creek)',
  '2021S05014840': 'CAR 4A (East Central AB / Stettler / Wainwright)',
  '2021S05014841': 'CAR 4B (Northeast Central AB / Camrose / Vermilion)',
  '2021S05014850': 'CAR 5 (Central AB / Red Deer / Edmonton / Leduc)',
  '2021S05014860': 'CAR 6 (North Central AB / Westlock / St. Paul / Athabasca)',
  '2021S05014870': 'CAR 7 (Peace River Region / Grande Prairie / Mackenzie)'
};

export function enrichNumberedGeographyNames(geographies: GeographyNode[]): void {
  for (const g of geographies) {
    const label = NUMBERED_GEO_HUMAN_LABELS[g.dguid];
    if (label) {
      g.cleanName = label;
      g.name = `${label} (${g.level === 'Counties / Census Divisions (CD)' ? 'CD' : 'CAR'})`;
    }
  }
}

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

/**
 * Far-northern unorganized wilderness CDs with < 20 farms total that stretch to 60°N–63°N.
 * Excluded from national agricultural belt views so tiny sample sizes don't distort national maps.
 */
export const FAR_NORTH_WILDERNESS_DGUIDS = new Set<string>([
  '2021A00031010', // Labrador (10 farms)
  '2021A00031011', // Nunatsiavut (0 farms)
  '2021A00032497', // Sept-Rivières--Caniapiscau (18 farms)
  '2021A00032498', // Minganie--Le Golfe-du-Saint-Laurent (6 farms)
  '2021A00032499', // Nord-du-Québec (6 farms)
  '2021A00034619', // Division No. 19, MB
  '2021A00034621', // Division No. 21, MB
  '2021A00034622', // Division No. 22, MB (2 farms)
  '2021A00034623', // Division No. 23, MB (0 farms)
  '2021A00034718', // Division No. 18, Northern SK (19 farms)
  '2021A00034816', // Division No. 16, Wood Buffalo, AB (1 farm)
  '2021A00035957', // Stikine, BC (1 farm)
  '2021A00035959'  // Northern Rockies, BC (10 farms)
]);

export function clipGeoJsonFeatureToAgBelt(feature: any, isAllCanada: boolean): any {
  if (!isAllCanada || !feature?.geometry) return feature;
  const maxLatForLon = (lon: number) => {
    if (lon < -114) return 56.8; // BC & Northern AB Peace River
    if (lon < -95) return 55.8;  // Prairies (AB, SK, MB)
    if (lon < -79) return 50.2;  // Northern Ontario agricultural belt
    return 50.4;                 // Quebec & Atlantic agricultural belt
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

const PROV_CODE_ABBR: Record<string, string> = {
  '10': 'NL',
  '11': 'PE',
  '12': 'NS',
  '13': 'NB',
  '24': 'QC',
  '35': 'ON',
  '46': 'MB',
  '47': 'SK',
  '48': 'AB',
  '59': 'BC',
  '60': 'YT',
  '61': 'NT',
  '62': 'NU'
};

export function formatTableGeoTitle(cleanName: string): string {
  return cleanName.replace(/^Division No\.\s*/i, 'Div. ');
}

export function formatTableGeoSubtitle(geo: GeographyNode): string {
  if (geo.ofaFederation) {
    const cleanFed = geo.ofaFederation.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return geo.provinceName && geo.provinceCode !== '35'
      ? `${geo.provinceName} • ${cleanFed}`
      : cleanFed;
  }
  if (geo.provinceName) {
    return geo.provinceName;
  }
  return geo.hierarchyPath || '';
}

export function fitCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidthPx: number
): string {
  if (ctx.measureText(text).width <= maxWidthPx) return text;

  // If text has parenthetical cities like "Div. 10 (Wynyard / Foam Lake / Watrous)", try dropping trailing slash segments first
  const parenMatch = text.match(/^([^(]+\()([^)]+)(\).*)$/);
  if (parenMatch) {
    const [, prefix, inside, suffix] = parenMatch;
    const parts = inside.split(/\s*\/\s*/);
    while (parts.length > 1) {
      parts.pop();
      const candidate = `${prefix}${parts.join(' / ')}${suffix}`;
      if (ctx.measureText(candidate).width <= maxWidthPx) {
        return candidate;
      }
    }
  }

  let trimmed = text;
  while (trimmed.length > 4 && ctx.measureText(`${trimmed}…`).width > maxWidthPx) {
    trimmed = trimmed.slice(0, -1).replace(/[\s/,(-]+$/, '');
  }
  const hasOpenParen = trimmed.includes('(') && !trimmed.includes(')');
  return hasOpenParen ? `${trimmed}…)` : `${trimmed}…`;
}

export interface MapCalloutPoint {
  rank: number;
  geo: GeographyNode;
  cx: number;
  cy: number;
  valueLabel: string;
  swatchColor: string;
}

/**
 * Draws non-overlapping top-ranked callouts in the top and bottom bands of a map canvas,
 * sorted West-to-East so leader lines never cross and polygons are never covered by text boxes.
 */
export function drawNonOverlappingMapCallouts(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  callouts: MapCalloutPoint[]
): void {
  if (callouts.length === 0) return;

  const topCount = Math.min(4, Math.ceil(callouts.length / 2));
  const sortedByLatDesc = [...callouts].sort((a, b) => a.cy - b.cy);
  const topBandItems = sortedByLatDesc.slice(0, topCount).sort((a, b) => a.cx - b.cx);
  const bottomBandItems = sortedByLatDesc.slice(topCount, 8).sort((a, b) => a.cx - b.cx);

  const renderBand = (items: MapCalloutPoint[], isTop: boolean) => {
    if (items.length === 0) return;
    const cardW = Math.min(242, Math.floor((rect.w - 32 - (items.length - 1) * 10) / items.length));
    const cardH = 44;
    const totalW = items.length * cardW + (items.length - 1) * 10;
    const startX = rect.x + Math.floor((rect.w - totalW) / 2);
    const cardY = isTop ? rect.y + 12 : rect.y + rect.h - cardH - 12;

    items.forEach((item, idx) => {
      const cardX = startX + idx * (cardW + 10);
      const anchorX = Math.max(cardX + 18, Math.min(cardX + cardW - 18, item.cx));
      const anchorY = isTop ? cardY + cardH : cardY;

      // Leader line from callout card to polygon centroid
      ctx.save();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY);
      ctx.lineTo(item.cx, item.cy);
      ctx.stroke();

      // Numbered pin dot at polygon centroid
      ctx.fillStyle = '#0F172A';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(item.cx, item.cy, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px Inter, Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(item.rank), item.cx, item.cy + 3.5);

      // Callout card box
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 6);
      ctx.fill();
      ctx.stroke();

      // Left color accent bar inside callout card
      ctx.fillStyle = item.swatchColor;
      ctx.beginPath();
      ctx.roundRect(cardX + 4, cardY + 5, 5, cardH - 10, 2);
      ctx.fill();

      // Line 1: #Rank + Concise Geography Name + Province Abbr
      const provAbbr = PROV_CODE_ABBR[item.geo.provinceCode] || '';
      const shortGeo = formatTableGeoTitle(item.geo.cleanName);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11.5px Inter, Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'left';
      const titleLine = fitCanvasText(
        ctx,
        `#${item.rank} ${shortGeo}${provAbbr ? `, ${provAbbr}` : ''}`,
        cardW - 18
      );
      ctx.fillText(titleLine, cardX + 14, cardY + 18);

      // Line 2: Metric Value Label
      ctx.fillStyle = '#6EE7B7';
      ctx.font = 'bold 11px Inter, Segoe UI, Arial, sans-serif';
      const valLine = fitCanvasText(ctx, item.valueLabel, cardW - 18);
      ctx.fillText(valLine, cardX + 14, cardY + 35);
      ctx.restore();
    });
  };

  renderBand(topBandItems, true);
  renderBand(bottomBandItems, false);
}
