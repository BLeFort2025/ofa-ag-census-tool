import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AgCensusDataset, GeoLevel, GeographyNode } from '../../types/census';
import {
  cleanCategoryLabel,
  cleanGeoLevelLabel,
  computeQuintileBreaks,
  downloadCsvFile,
  fitCanvasText,
  formatCleanPct,
  formatMetricValue,
  formatVisualLabel,
  getObservation,
  getRawNumber
} from '../../utils/analytics';
import { loadBoundariesGeoJson } from '../InteractiveAgMap';
import {
  Compass,
  FileSpreadsheet,
  Flame,
  Image as ImageIcon,
  Layers,
  MapPin,
  Moon,
  Sparkles,
  Sun
} from 'lucide-react';

interface AgBeltsModuleProps {
  dataset: AgCensusDataset;
  onOpenGeoLocator: () => void;
  onSelectGeoForSnapshot: (geo: GeographyNode) => void;
}

type StudioMode = 'belts' | 'heatmap' | 'cluster';
type PosterTheme = 'dark' | 'light';
type BeltPresetId =
  | 'crop_belts'
  | 'crop_detailed'
  | 'farm_type_belts'
  | 'livestock_belts'
  | 'tillage_belts';
type ClusterRampId = 'thermal_full' | 'gold_fire' | 'emerald_teal' | 'viridis';

interface QuickFootprintPreset {
  id: string;
  label: string;
  category: string;
  charId: string;
}

const QUICK_FOOTPRINT_PRESETS: QuickFootprintPreset[] = [
  {
    id: 'all_cropland',
    label: 'All Field Crops & Hay (Acres)',
    category: '5. Field Crops, Grains & Oilseeds',
    charId: 'crop_total_acres'
  },
  {
    id: 'total_farmland',
    label: 'Total Farmland Area (Acres)',
    category: '2. Land Use & Farm Area Size',
    charId: 'land_total_acres'
  },
  {
    id: 'total_revenues',
    label: 'Gross Farm Revenues ($)',
    category: '4. Farm Capital, Revenues & Expenses',
    charId: 'rev_total_dollars'
  },
  {
    id: 'total_farms',
    label: 'Total Census Farms',
    category: '1. Farm Types & Industry (NAICS)',
    charId: 'total_farms'
  },
  {
    id: 'soybeans',
    label: 'Soybeans (Acres)',
    category: '5. Field Crops, Grains & Oilseeds',
    charId: 'crop_soybeans_acres'
  },
  {
    id: 'corn_grain',
    label: 'Corn for Grain (Acres)',
    category: '5. Field Crops, Grains & Oilseeds',
    charId: 'crop_corn_grain_acres'
  },
  {
    id: 'wheat',
    label: 'Wheat Total (Acres)',
    category: '5. Field Crops, Grains & Oilseeds',
    charId: 'crop_wheat_total_acres'
  },
  {
    id: 'canola',
    label: 'Canola (Acres)',
    category: '5. Field Crops, Grains & Oilseeds',
    charId: 'crop_canola_acres'
  },
  {
    id: 'cattle_head',
    label: 'All Cattle & Calves (Head)',
    category: '7. Livestock, Poultry & Apiculture',
    charId: 'cattle_total_head'
  },
  {
    id: 'dairy_cows',
    label: 'Dairy Cows (Head)',
    category: '7. Livestock, Poultry & Apiculture',
    charId: 'cattle_dairy_cows_head'
  }
];

interface BeltCandidateDef {
  id: string;
  label: string;
  color: string;
  charIds: string[];
}

interface BeltPresetDef {
  id: BeltPresetId;
  shortLabel: string;
  posterTitleCanada: string;
  posterTitleProvince: (prov: string) => string;
  posterSubtitle: string;
  unitLabel: string;
  minActivityThreshold: number;
  emptyLabel: string;
  candidates: BeltCandidateDef[];
}

const BELT_PRESETS: BeltPresetDef[] = [
  {
    id: 'crop_belts',
    shortLabel: '1. Crop Belts (Largest Crop by Acreage)',
    posterTitleCanada: "Canada's crop belts",
    posterTitleProvince: (prov) => `${prov}'s crop belts`,
    posterSubtitle: 'Largest mapped crop group by Census Division | 2021 Census of Agriculture (Acres)',
    unitLabel: 'acres',
    minActivityThreshold: 250,
    emptyLabel: 'Too few or no crop acres to display',
    candidates: [
      {
        id: 'corn',
        label: 'Corn (Grain & Silage)',
        color: '#FACC15', // Warm Corn Gold (matching "America's crop belts")
        charIds: ['crop_corn_grain_acres', 'crop_corn_silage_acres']
      },
      {
        id: 'soybeans',
        label: 'Soybeans',
        color: '#EA580C', // Vibrant Soybean Orange
        charIds: ['crop_soybeans_acres']
      },
      {
        id: 'hay_alfalfa',
        label: 'Hay & Alfalfa',
        color: '#A78BFA', // Lavender Purple
        charIds: ['crop_alfalfa_acres', 'crop_other_hay_acres']
      },
      {
        id: 'wheat',
        label: 'Wheat',
        color: '#D6B370', // Warm Wheat Tan
        charIds: ['crop_wheat_total_acres']
      },
      {
        id: 'canola',
        label: 'Canola',
        color: '#84CC16', // Canola Lime-Green
        charIds: ['crop_canola_acres']
      },
      {
        id: 'barley_oats',
        label: 'Barley, Oats & Mixed Grains',
        color: '#38BDF8', // Sky Teal
        charIds: ['crop_barley_acres', 'crop_oats_acres', 'crop_mixed_grains_acres']
      },
      {
        id: 'pulses',
        label: 'Pulses (Lentils, Peas & Beans)',
        color: '#F472B6', // Rose Pink
        charIds: [
          'crop_lentils_acres',
          'crop_dry_peas_acres',
          'crop_white_beans_acres',
          'crop_other_beans_acres'
        ]
      },
      {
        id: 'hort_potatoes',
        label: 'Potatoes, Fruit & Vegetables',
        color: '#10B981', // Emerald Green
        charIds: ['crop_potatoes_acres', 'fruit_total_acres', 'veg_total_acres']
      }
    ]
  },
  {
    id: 'crop_detailed',
    shortLabel: '2. Detailed Field Crops (Unmerged Individual Crops)',
    posterTitleCanada: "Canada's top field crops by county",
    posterTitleProvince: (prov) => `${prov}'s top field crops by county`,
    posterSubtitle: 'Single largest individual crop by acreage | 2021 Census of Agriculture',
    unitLabel: 'acres',
    minActivityThreshold: 200,
    emptyLabel: 'Too few or no crop acres to display',
    candidates: [
      {
        id: 'soybeans',
        label: 'Soybeans',
        color: '#EA580C',
        charIds: ['crop_soybeans_acres']
      },
      {
        id: 'corn_grain',
        label: 'Corn for Grain',
        color: '#FACC15',
        charIds: ['crop_corn_grain_acres']
      },
      {
        id: 'alfalfa',
        label: 'Alfalfa & Mixtures',
        color: '#A78BFA',
        charIds: ['crop_alfalfa_acres']
      },
      {
        id: 'tame_hay',
        label: 'Other Tame Hay & Fodder',
        color: '#818CF8',
        charIds: ['crop_other_hay_acres']
      },
      {
        id: 'wheat',
        label: 'Wheat (Winter & Spring)',
        color: '#D6B370',
        charIds: ['crop_wheat_total_acres']
      },
      {
        id: 'canola',
        label: 'Canola',
        color: '#84CC16',
        charIds: ['crop_canola_acres']
      },
      {
        id: 'barley',
        label: 'Barley',
        color: '#38BDF8',
        charIds: ['crop_barley_acres']
      },
      {
        id: 'oats',
        label: 'Oats',
        color: '#2DD4BF',
        charIds: ['crop_oats_acres']
      },
      {
        id: 'pulses',
        label: 'Lentils, Peas & Dry Beans',
        color: '#F472B6',
        charIds: [
          'crop_lentils_acres',
          'crop_dry_peas_acres',
          'crop_white_beans_acres',
          'crop_other_beans_acres'
        ]
      },
      {
        id: 'hort_potatoes',
        label: 'Potatoes, Fruit & Vegetables',
        color: '#10B981',
        charIds: ['crop_potatoes_acres', 'fruit_total_acres', 'veg_total_acres']
      }
    ]
  },
  {
    id: 'farm_type_belts',
    shortLabel: '3. Farm Specialization Belts (#1 Primary Farm Sector)',
    posterTitleCanada: "Canada's primary farm belts",
    posterTitleProvince: (prov) => `${prov}'s primary farm belts`,
    posterSubtitle: 'Leading primary farm specialization by county | 2021 Census of Agriculture',
    unitLabel: 'farms',
    minActivityThreshold: 10,
    emptyLabel: 'Too few farms to display',
    candidates: [
      {
        id: 'soy_oilseed',
        label: 'Soybean & Oilseed Farming',
        color: '#EA580C',
        charIds: ['naics_soybean', 'naics_oilseed_other']
      },
      {
        id: 'corn_grain',
        label: 'Corn & Grain Farming',
        color: '#FACC15',
        charIds: ['naics_corn', 'naics_wheat', 'naics_other_grain']
      },
      {
        id: 'beef_cattle',
        label: 'Beef Cattle & Feedlots',
        color: '#EF4444',
        charIds: ['naics_beef']
      },
      {
        id: 'dairy_cattle',
        label: 'Dairy Cattle & Milk',
        color: '#38BDF8',
        charIds: ['naics_dairy']
      },
      {
        id: 'hay_farming',
        label: 'Hay & Forage Farming',
        color: '#A78BFA',
        charIds: ['naics_hay']
      },
      {
        id: 'horticulture',
        label: 'Fruit, Veg & Greenhouse',
        color: '#10B981',
        charIds: ['naics_fruit_nut', 'naics_vegetable', 'naics_greenhouse', 'naics_potato']
      },
      {
        id: 'hog_pig',
        label: 'Hog & Pig Farming',
        color: '#F472B6',
        charIds: ['naics_hog']
      },
      {
        id: 'poultry_egg',
        label: 'Poultry & Egg Production',
        color: '#FB923C',
        charIds: ['naics_poultry_egg']
      },
      {
        id: 'equine_other',
        label: 'Horse, Bees & Other Animal',
        color: '#2DD4BF',
        charIds: ['naics_other_animal']
      },
      {
        id: 'maple',
        label: 'Maple Syrup Production',
        color: '#D97706',
        charIds: ['naics_maple']
      }
    ]
  },
  {
    id: 'livestock_belts',
    shortLabel: '4. Livestock & Dairy Belts (#1 Livestock Group)',
    posterTitleCanada: "Canada's livestock & dairy belts",
    posterTitleProvince: (prov) => `${prov}'s livestock & dairy belts`,
    posterSubtitle: 'Most common livestock operation type by Census Division | 2021 Census (Farms)',
    unitLabel: 'farms',
    minActivityThreshold: 8,
    emptyLabel: 'Too few livestock farms to display',
    candidates: [
      {
        id: 'beef_cows',
        label: 'Beef Cow-Calf Operations',
        color: '#EF4444',
        charIds: ['cattle_beef_cows_farms']
      },
      {
        id: 'dairy_cows',
        label: 'Dairy Cattle Farms',
        color: '#38BDF8',
        charIds: ['cattle_dairy_cows_farms']
      },
      {
        id: 'poultry',
        label: 'Chicken & Egg Farms',
        color: '#FACC15',
        charIds: ['poultry_hens_chickens_farms']
      },
      {
        id: 'sheep_goat',
        label: 'Sheep & Lamb Farms',
        color: '#A78BFA',
        charIds: ['sheep_total_farms']
      },
      {
        id: 'hogs',
        label: 'Pig & Hog Farms',
        color: '#F472B6',
        charIds: ['pigs_total_farms']
      },
      {
        id: 'bees',
        label: 'Beekeeping & Honey Farms',
        color: '#10B981',
        charIds: ['bees_farms']
      }
    ]
  },
  {
    id: 'tillage_belts',
    shortLabel: '5. Soil Tillage Belts (No-Till vs. Conventional)',
    posterTitleCanada: "Canada's cropland tillage belts",
    posterTitleProvince: (prov) => `${prov}'s cropland tillage belts`,
    posterSubtitle: 'Dominant seedbed tillage practice by Census Division | 2021 Census (Acres)',
    unitLabel: 'acres',
    minActivityThreshold: 200,
    emptyLabel: 'Too few prepared cropland acres to display',
    candidates: [
      {
        id: 'notill',
        label: 'No-Till / Zero-Till Seeding',
        color: '#10B981',
        charIds: ['till_notill_acres']
      },
      {
        id: 'conservation',
        label: 'Conservation Tillage (Residue Retained)',
        color: '#38BDF8',
        charIds: ['till_conservation_acres']
      },
      {
        id: 'conventional',
        label: 'Conventional Tillage',
        color: '#F59E0B',
        charIds: ['till_conventional_acres']
      }
    ]
  }
];

const CLUSTER_RAMPS: Record<
  ClusterRampId,
  {
    label: string;
    colors: [string, string, string, string, string];
    colors6: [string, string, string, string, string, string];
  }
> = {
  thermal_full: {
    label: 'Full-Spectrum Heat Map (Sky → Teal → Emerald → Gold → Flame)',
    colors: ['#0284C7', '#10B981', '#84CC16', '#F59E0B', '#EF4444'],
    colors6: ['#0284C7', '#06B6D4', '#10B981', '#84CC16', '#F59E0B', '#FACC15']
  },
  gold_fire: {
    label: 'Warm Bronze → Amber → Gold (Editorial)',
    colors: ['#7C2D12', '#B45309', '#D97706', '#F59E0B', '#FACC15'],
    colors6: ['#7C2D12', '#9A3412', '#B45309', '#D97706', '#F59E0B', '#FACC15']
  },
  emerald_teal: {
    label: 'Slate → Pickled Bluewood → OFA Crimson (OFA Brand)',
    colors: ['#CBD5E1', '#7893A4', '#334B58', '#ECA842', '#D7182A'],
    colors6: ['#E2E8F0', '#94A3B8', '#526D7C', '#334B58', '#ECA842', '#D7182A']
  },
  viridis: {
    label: 'Indigo → Teal → Lime → Gold (Viridis)',
    colors: ['#440154', '#3B528B', '#21918C', '#5EC962', '#FDE725'],
    colors6: ['#482878', '#3E4989', '#26828E', '#35B779', '#8FD744', '#FDE725']
  }
};

function computeSixTierBreaks(
  values: number[]
): [number, number, number, number, number, number, number] {
  const sorted = [...values].filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0, 0, 0, 0, 0, 0];
  const pick = (p: number) => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
    return sorted[idx];
  };
  return [
    sorted[0],
    pick(0.16),
    pick(0.33),
    pick(0.5),
    pick(0.68),
    pick(0.85),
    sorted[sorted.length - 1]
  ];
}

interface EvaluatedGeoItem {
  geo: GeographyNode;
  winnerId: string | null;
  winnerLabel: string;
  winnerColor: string;
  winnerValue: number;
  totalCategorySum: number;
  winnerSharePct: number;
  runnerUpLabel: string | null;
  runnerUpValue: number;
  clusterValue: number | null;
  clusterPctOfBase: number | null;
}

export const AgBeltsModule: React.FC<AgBeltsModuleProps> = ({
  dataset,
  onOpenGeoLocator,
  onSelectGeoForSnapshot
}) => {
  const [studioMode, setStudioMode] = useState<StudioMode>('belts');
  const [posterTheme, setPosterTheme] = useState<PosterTheme>('dark');
  const [showCallouts, setShowCallouts] = useState<boolean>(true);
  const [showNorthernInset, setShowNorthernInset] = useState<boolean>(true);

  // Geographic Scope: '35' (Ontario default) or 'ALL' (All of Canada) or any Province
  const [selectedProvince, setSelectedProvince] = useState<string>('35');
  const [selectedLevel, setSelectedLevel] = useState<GeoLevel>('Counties / Census Divisions (CD)');

  // Mode 1: Belt Preset state
  const [activeBeltPresetId, setActiveBeltPresetId] = useState<BeltPresetId>('crop_belts');

  // Mode 2: Single-Stat Cluster Heat Map state
  const categories = useMemo(() => {
    const s = new Set<string>();
    dataset.characteristics.forEach((c) => s.add(c.category));
    return Array.from(s);
  }, [dataset.characteristics]);

  const [clusterCategory, setClusterCategory] = useState<string>(
    '5. Field Crops, Grains & Oilseeds'
  );
  const [clusterCharId, setClusterCharId] = useState<string>('crop_soybeans_acres');
  const [clusterMetricMode, setClusterMetricMode] = useState<'val' | 'pct'>('val');
  const [clusterRampId, setClusterRampId] = useState<ClusterRampId>('thermal_full');

  const [focusedGeoId, setFocusedGeoId] = useState<string | null>(null);
  const [geoJsonData, setGeoJsonData] = useState<any | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    loadBoundariesGeoJson()
      .then((gj) => setGeoJsonData(gj))
      .catch(() => {});
  }, []);

  const provinces = useMemo(
    () =>
      dataset.geographies
        .filter((g) => g.level === 'Provinces & Territories')
        .sort((a, b) => a.cleanName.localeCompare(b.cleanName)),
    [dataset.geographies]
  );

  const activeProvinceName = useMemo(() => {
    if (selectedProvince === 'ALL') return 'Canada';
    const found = provinces.find((p) => p.provinceCode === selectedProvince);
    return found?.cleanName || 'Ontario';
  }, [provinces, selectedProvince]);

  const activeBeltPreset = useMemo(
    () => BELT_PRESETS.find((p) => p.id === activeBeltPresetId) || BELT_PRESETS[0],
    [activeBeltPresetId]
  );

  const clusterCategoryChars = useMemo(
    () => dataset.characteristics.filter((c) => c.category === clusterCategory),
    [dataset.characteristics, clusterCategory]
  );

  useEffect(() => {
    if (
      clusterCategoryChars.length > 0 &&
      !clusterCategoryChars.some((c) => c.id === clusterCharId)
    ) {
      setClusterCharId(clusterCategoryChars[0].id);
    }
  }, [clusterCategoryChars, clusterCharId]);

  const activeClusterChar = useMemo(
    () =>
      dataset.characteristics.find((c) => c.id === clusterCharId) ||
      dataset.characteristics[0],
    [dataset.characteristics, clusterCharId]
  );

  // Scoped Geographies
  const scopedGeos = useMemo(() => {
    return dataset.geographies.filter((g) => {
      if (g.level !== selectedLevel) return false;
      if (selectedProvince !== 'ALL' && g.provinceCode !== selectedProvince) return false;
      return true;
    });
  }, [dataset.geographies, selectedLevel, selectedProvince]);

  // Evaluate every geography in scope for both Belt Mode and Single-Stat Cluster Mode
  const evaluatedItems: EvaluatedGeoItem[] = useMemo(() => {
    return scopedGeos.map((geo) => {
      // 1. Belt evaluation
      const scores = activeBeltPreset.candidates.map((cand) => {
        const sumVal = cand.charIds.reduce((acc, cid) => {
          const v = getRawNumber(dataset, geo.id, cid, 0);
          return acc + (v !== null && v > 0 ? v : 0);
        }, 0);
        return {
          cand,
          val: sumVal
        };
      });

      const totalCategorySum = scores.reduce((acc, s) => acc + s.val, 0);
      scores.sort((a, b) => b.val - a.val);

      const top = scores[0];
      const second = scores[1];
      const hasEnough =
        top &&
        top.val > 0 &&
        totalCategorySum >= activeBeltPreset.minActivityThreshold;

      // 2. Single-Stat Cluster evaluation
      const obs = getObservation(dataset, geo.id, activeClusterChar);
      const clusterValue = obs.val2021;
      const clusterPctOfBase = obs.pctOfBase;

      return {
        geo,
        winnerId: hasEnough ? top.cand.id : null,
        winnerLabel: hasEnough ? top.cand.label : activeBeltPreset.emptyLabel,
        winnerColor: hasEnough
          ? top.cand.color
          : posterTheme === 'dark'
          ? '#334155'
          : '#CBD5E1',
        winnerValue: hasEnough ? top.val : 0,
        totalCategorySum,
        winnerSharePct:
          hasEnough && totalCategorySum > 0
            ? Number(((top.val / totalCategorySum) * 100).toFixed(1))
            : 0,
        runnerUpLabel: second && second.val > 0 ? second.cand.label : null,
        runnerUpValue: second && second.val > 0 ? second.val : 0,
        clusterValue,
        clusterPctOfBase
      };
    });
  }, [scopedGeos, activeBeltPreset, dataset, activeClusterChar, posterTheme]);

  // Quintile & 6-Tier breaks for Single-Stat Cluster / All-CD Heat Map Modes
  const activeNumericValues = useMemo(() => {
    return evaluatedItems
      .map((it) =>
        clusterMetricMode === 'pct' && activeClusterChar.baseId
          ? it.clusterPctOfBase
          : it.clusterValue
      )
      .filter((v): v is number => v !== null && v > 0);
  }, [evaluatedItems, clusterMetricMode, activeClusterChar.baseId]);

  const clusterBreaks = useMemo(
    () => computeQuintileBreaks(activeNumericValues),
    [activeNumericValues]
  );

  const sixTierBreaks = useMemo(
    () => computeSixTierBreaks(activeNumericValues),
    [activeNumericValues]
  );

  const activeProducingCount = activeNumericValues.length;

  const getClusterColor = (it: EvaluatedGeoItem): string => {
    const val =
      clusterMetricMode === 'pct' && activeClusterChar.baseId
        ? it.clusterPctOfBase
        : it.clusterValue;
    if (val === null || val <= 0) {
      return posterTheme === 'dark' ? '#1E293B' : '#E2E8F0';
    }
    if (studioMode === 'heatmap') {
      const ramp6 = CLUSTER_RAMPS[clusterRampId].colors6;
      const [, t1, t2, t3, t4, t5] = sixTierBreaks;
      if (val <= t1) return ramp6[0];
      if (val <= t2) return ramp6[1];
      if (val <= t3) return ramp6[2];
      if (val <= t4) return ramp6[3];
      if (val <= t5) return ramp6[4];
      return ramp6[5];
    }
    const ramp = CLUSTER_RAMPS[clusterRampId].colors;
    const [, b1, b2, b3, b4] = clusterBreaks;
    if (val <= b1) return ramp[0];
    if (val <= b2) return ramp[1];
    if (val <= b3) return ramp[2];
    if (val <= b4) return ramp[3];
    return ramp[4];
  };

  // Belt Summary Counts (how many counties belong to each Belt + total volume)
  const beltBreakdownSummary = useMemo(() => {
    return activeBeltPreset.candidates
      .map((cand) => {
        const matching = evaluatedItems.filter((it) => it.winnerId === cand.id);
        const totalWinningVal = matching.reduce((acc, m) => acc + m.winnerValue, 0);
        const topCounty = [...matching].sort((a, b) => b.winnerValue - a.winnerValue)[0] || null;
        return {
          cand,
          countyCount: matching.length,
          totalWinningVal,
          topCounty
        };
      })
      .filter((b) => b.countyCount > 0)
      .sort((a, b) => b.countyCount - a.countyCount || b.totalWinningVal - a.totalWinningVal);
  }, [activeBeltPreset.candidates, evaluatedItems]);

  // Sorted Leaderboard for Right Sidebar
  const sortedDisplayRows = useMemo(() => {
    if (studioMode === 'belts') {
      return [...evaluatedItems].sort((a, b) => b.winnerValue - a.winnerValue);
    }
    return [...evaluatedItems].sort((a, b) => {
      const va =
        clusterMetricMode === 'pct' && activeClusterChar.baseId
          ? a.clusterPctOfBase ?? -1
          : a.clusterValue ?? -1;
      const vb =
        clusterMetricMode === 'pct' && activeClusterChar.baseId
          ? b.clusterPctOfBase ?? -1
          : b.clusterValue ?? -1;
      return vb - va;
    });
  }, [evaluatedItems, studioMode, clusterMetricMode, activeClusterChar.baseId]);

  // Draw the High-Resolution 1800 x 1125 Social Media Poster on the Canvas (scheduled via rAF)
  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas || !geoJsonData) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = 1800;
      const height = 1125;
      const isDark = posterTheme === 'dark';

    // 1. Background Fill (matching "America's crop belts" deep charcoal-navy or crisp light report)
    ctx.fillStyle = isDark ? '#0D1520' : '#F8FAFC';
    ctx.fillRect(0, 0, width, height);

    // 2. Editorial Poster Header with Declarative Claim Headline (data-visualization.md §5)
    const cleanMetricShort = formatVisualLabel(activeClusterChar.shortName).toLowerCase();
    const cleanLvl = cleanGeoLevelLabel(selectedLevel).toLowerCase();
    const topBelt = beltBreakdownSummary[0];
    const topClusterRow = sortedDisplayRows[0];

    const posterMainTitle =
      studioMode === 'belts'
        ? topBelt
          ? `${topBelt.cand.label} leads ${selectedProvince === 'ALL' ? 'Canada' : activeProvinceName} across ${topBelt.countyCount} ${cleanLvl}`
          : selectedProvince === 'ALL'
          ? activeBeltPreset.posterTitleCanada
          : activeBeltPreset.posterTitleProvince(activeProvinceName)
        : topClusterRow && (topClusterRow.clusterValue ?? 0) > 0
        ? `${topClusterRow.geo.cleanName} leads ${selectedProvince === 'ALL' ? 'Canadian' : activeProvinceName} ${cleanMetricShort}`
        : `${selectedProvince === 'ALL' ? 'Canada' : activeProvinceName} ${cleanMetricShort} production footprint`;

    const posterSubTitle =
      studioMode === 'belts'
        ? activeBeltPreset.posterSubtitle.replace(/Census Division/g, 'county or district')
        : `${formatVisualLabel(activeClusterChar.name)} across ${evaluatedItems.length} ${cleanLvl} | 2021 Census of Agriculture`;

    ctx.fillStyle = isDark ? '#F8FAFC' : '#1E293B';
    ctx.font = '800 38px Arial, sans-serif';
    ctx.fillText(fitCanvasText(ctx, posterMainTitle, width - 480), 58, 74);

    ctx.fillStyle = isDark ? '#94A3B8' : '#475569';
    ctx.font = '500 20px Arial, sans-serif';
    ctx.fillText(fitCanvasText(ctx, posterSubTitle, width - 480), 58, 110);

    // Top-Right Scope Pill Badge
    const coveragePct =
      evaluatedItems.length > 0
        ? Math.round((activeProducingCount / evaluatedItems.length) * 100)
        : 0;
    const scopeBadgeText =
      studioMode === 'belts'
        ? `${
            selectedProvince === 'ALL'
              ? 'NATIONAL BELTS'
              : `${activeProvinceName.toUpperCase()} BELTS`
          } • ${evaluatedItems.length} AREAS`
        : `${
            selectedProvince === 'ALL'
              ? 'NATIONAL FOOTPRINT'
              : `${activeProvinceName.toUpperCase()} FOOTPRINT`
          } • ${activeProducingCount}/${evaluatedItems.length} ACTIVE (${coveragePct}%)`;
    ctx.font = '700 13.5px Arial, sans-serif';
    const sbw = ctx.measureText(scopeBadgeText).width + 36;
    ctx.fillStyle = isDark ? '#1E293B' : '#334B58';
    ctx.beginPath();
    ctx.roundRect(width - sbw - 58, 42, sbw, 36, 18);
    ctx.fill();
    ctx.strokeStyle = '#D7182A';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(scopeBadgeText, width - sbw - 40, 65);

    // 3. Match GeoJSON features to evaluatedItems by DGUID
    const itemByDguid = new Map<string, EvaluatedGeoItem>();
    evaluatedItems.forEach((it) => itemByDguid.set(it.geo.dguid, it));

    const features = (geoJsonData.features || []).filter((f: any) => {
      const dguid = f.properties?.dguid || f.properties?.DGUID || '';
      return itemByDguid.has(dguid);
    });

    const isOntarioSplit =
      selectedProvince === '35' &&
      showNorthernInset &&
      (selectedLevel === 'Counties / Census Divisions (CD)' ||
        selectedLevel === 'Census Agricultural Regions (CAR)');

    const mainFeatures = isOntarioSplit
      ? features.filter((f: any) => {
          const dguid = f.properties?.dguid || f.properties?.DGUID || '';
          const it = itemByDguid.get(dguid);
          return it ? it.geo.lat <= 46.55 : true;
        })
      : features;

    const northFeatures = isOntarioSplit
      ? features.filter((f: any) => {
          const dguid = f.properties?.dguid || f.properties?.DGUID || '';
          const it = itemByDguid.get(dguid);
          return it ? it.geo.lat > 46.55 : false;
        })
      : [];

    // Helper to render a set of GeoJSON features into a target box with aspect-ratio correction
    const drawPolygonLayer = (
      layerFeatures: any[],
      box: { x: number; y: number; w: number; h: number },
      customBounds?: { minLon: number; maxLon: number; minLat: number; maxLat: number },
      pad = 24
    ) => {
      let minLon = Infinity;
      let maxLon = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;

      if (customBounds) {
        ({ minLon, maxLon, minLat, maxLat } = customBounds);
      } else {
        const visitCoords = (coords: any) => {
          if (!Array.isArray(coords) || coords.length === 0) return;
          if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
            const lon = coords[0];
            const lat = coords[1];
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          } else {
            for (const c of coords) visitCoords(c);
          }
        };
        for (const f of layerFeatures) {
          if (f.geometry?.coordinates) visitCoords(f.geometry.coordinates);
        }
        // Clip extreme Arctic islands if viewing a province with far-north territories
        if (maxLat > 60.5 && minLat < 55) {
          maxLat = 60.2;
        }
      }

      if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;

      // Cosine latitude aspect ratio correction so counties are never vertically squished
      const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
      const cosLat = Math.max(0.45, Math.cos(midLatRad));

      const lonSpan = Math.max(0.01, (maxLon - minLon) * cosLat);
      const latSpan = Math.max(0.01, maxLat - minLat);

      const scaleX = (box.w - pad * 2) / lonSpan;
      const scaleY = (box.h - pad * 2) / latSpan;
      const scale = Math.min(scaleX, scaleY);

      const drawnW = lonSpan * scale;
      const drawnH = latSpan * scale;
      const offsetX = box.x + (box.w - drawnW) / 2;
      const offsetY = box.y + (box.h - drawnH) / 2;

      const project = (lon: number, lat: number): [number, number] => [
        offsetX + (lon - minLon) * cosLat * scale,
        offsetY + (maxLat - lat) * scale
      ];

      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();

      for (const f of layerFeatures) {
        const dguid = f.properties?.dguid || f.properties?.DGUID || '';
        const item = itemByDguid.get(dguid);
        if (!item) continue;

        const fillColor =
          studioMode === 'belts' ? item.winnerColor : getClusterColor(item);
        const isFocused = item.geo.id === focusedGeoId;

        const geom = f.geometry;
        if (!geom) continue;
        const polys =
          geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates || [];

        ctx.fillStyle = fillColor;
        ctx.strokeStyle = isFocused
          ? '#D7182A'
          : isDark
          ? '#0D1520'
          : '#FFFFFF';
        ctx.lineWidth = isFocused ? 2.6 : selectedProvince === 'ALL' ? 0.55 : 1.1;

        for (const poly of polys) {
          ctx.beginPath();
          for (const ring of poly) {
            ring.forEach((pt: number[], idx: number) => {
              const [px, py] = project(pt[0], pt[1]);
              if (idx === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.closePath();
          }
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore();
      return { project, minLon, maxLon, minLat, maxLat };
    };

    // Frame Canada's agricultural heartland cleanly when in National mode
    const nationalBounds =
      selectedProvince === 'ALL'
        ? { minLon: -131.5, maxLon: -52.5, minLat: 41.7, maxLat: 59.5 }
        : undefined;

    const mainDrawBox = isOntarioSplit
      ? { x: 180, y: 140, w: 1120, h: 700 }
      : { x: 140, y: 135, w: 1520, h: 710 };

    const mainProj = drawPolygonLayer(
      mainFeatures.length > 0 ? mainFeatures : features,
      mainDrawBox,
      nationalBounds,
      30
    );

    // Draw Northern Ontario Inset Box when viewing Ontario Counties / CARs
    if (isOntarioSplit && northFeatures.length > 0) {
      const insetBox = { x: 1295, y: 155, w: 435, h: 315 };
      ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = isDark ? '#334155' : '#CBD5E1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(insetBox.x, insetBox.y, insetBox.w, insetBox.h, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isDark ? '#94A3B8' : '#334B58';
      ctx.font = '700 13px Arial, sans-serif';
      ctx.fillText('NORTHERN ONTARIO DISTRICTS', insetBox.x + 14, insetBox.y + 22);

      drawPolygonLayer(
        northFeatures,
        { x: insetBox.x + 8, y: insetBox.y + 28, w: insetBox.w - 16, h: insetBox.h - 34 },
        undefined,
        12
      );
    }

    // 4. Automatic Leader Callout Pointers
    if (showCallouts && mainProj) {
      const mainGeoIds = new Set(
        (mainFeatures.length > 0 ? mainFeatures : features).map(
          (f: any) => itemByDguid.get(f.properties?.dguid || f.properties?.DGUID || '')?.geo.id
        )
      );

      const calloutCandidates: Array<{
        geo: GeographyNode;
        headline: string;
        subline: string;
        color: string;
      }> = [];

      if (studioMode === 'belts') {
        for (const b of beltBreakdownSummary) {
          const bestInMain = evaluatedItems
            .filter((it) => it.winnerId === b.cand.id && mainGeoIds.has(it.geo.id))
            .sort((x, y) => y.winnerValue - x.winnerValue)[0];
          if (bestInMain && calloutCandidates.length < 4) {
            const valFmt =
              activeBeltPreset.unitLabel === 'acres'
                ? `${formatMetricValue(bestInMain.winnerValue, 'ACRES', true)} ac`
                : `${formatMetricValue(bestInMain.winnerValue, 'FARMS', true)} farms`;
            calloutCandidates.push({
              geo: bestInMain.geo,
              headline: `${bestInMain.geo.cleanName}${
                selectedProvince === 'ALL' && bestInMain.geo.provinceName
                  ? `, ${bestInMain.geo.provinceName}`
                  : ''
              }`,
              subline: `${b.cand.label} (${valFmt})`,
              color: b.cand.color
            });
          }
        }
      } else {
        for (const it of sortedDisplayRows) {
          if (!mainGeoIds.has(it.geo.id)) continue;
          const rawV =
            clusterMetricMode === 'pct' && activeClusterChar.baseId
              ? it.clusterPctOfBase
              : it.clusterValue;
          if (!rawV || rawV <= 0) continue;

          const tooClose = calloutCandidates.some(
            (existing) =>
              Math.hypot(existing.geo.lon - it.geo.lon, existing.geo.lat - it.geo.lat) <
              (selectedProvince === 'ALL' ? 3.5 : 0.75)
          );
          if (tooClose && calloutCandidates.length >= 2) continue;

          const fmtV =
            clusterMetricMode === 'pct' && activeClusterChar.baseId
              ? formatCleanPct(rawV)
              : formatMetricValue(rawV, activeClusterChar.unit, true);

          calloutCandidates.push({
            geo: it.geo,
            headline: `${it.geo.cleanName}${
              selectedProvince === 'ALL' && it.geo.provinceName
                ? `, ${it.geo.provinceName}`
                : ''
            }`,
            subline: `${formatVisualLabel(activeClusterChar.shortName)}: ${fmtV}`,
            color: isDark ? '#ECA842' : '#D7182A'
          });
          if (calloutCandidates.length >= 4) break;
        }
      }

      const anchors = isOntarioSplit
        ? [
            { x: 75, y: 245, align: 'left' as const },
            { x: 75, y: 680, align: 'left' as const },
            { x: 1320, y: 555, align: 'left' as const },
            { x: 1320, y: 735, align: 'left' as const }
          ]
        : [
            { x: 70, y: 230, align: 'left' as const },
            { x: 70, y: 710, align: 'left' as const },
            { x: width - 70, y: 230, align: 'right' as const },
            { x: width - 70, y: 710, align: 'right' as const }
          ];

      const projectedCallouts = calloutCandidates
        .map((c) => {
          const [tx, ty] = mainProj.project(c.geo.lon, c.geo.lat);
          return { ...c, tx, ty };
        })
        .sort((a, b) => a.tx - b.tx);

      const leftCount = Math.min(2, Math.ceil(projectedCallouts.length / 2));
      const leftGroup = projectedCallouts.slice(0, leftCount).sort((a, b) => a.ty - b.ty);
      const rightGroup = projectedCallouts.slice(leftCount, 4).sort((a, b) => a.ty - b.ty);

      const assignedPairs: Array<{
        c: (typeof projectedCallouts)[number];
        anc: (typeof anchors)[number];
      }> = [];
      leftGroup.forEach((c, idx) => {
        assignedPairs.push({ c, anc: anchors[idx] });
      });
      rightGroup.forEach((c, idx) => {
        assignedPairs.push({ c, anc: anchors[2 + idx] });
      });

      assignedPairs.forEach(({ c, anc }, idx) => {
        const { tx, ty } = c;

        // Measure exact callout text bounds so pointer line starts cleanly outside text
        ctx.font = '800 19px Arial, sans-serif';
        const hw = ctx.measureText(c.headline).width;
        ctx.font = '700 15.5px Arial, sans-serif';
        const sw = ctx.measureText(c.subline).width;
        const blockW = Math.max(hw, sw);
        const textLeft = anc.align === 'left' ? anc.x : anc.x - blockW;
        const textRight = anc.align === 'left' ? anc.x + blockW : anc.x;
        const lineStartX = tx < (textLeft + textRight) / 2 ? textLeft - 12 : textRight + 12;
        const lineStartY = anc.y - 2;

        // Subtle dotted leader line (data-visualization.md §3)
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = isDark ? 'rgba(226, 232, 240, 0.72)' : 'rgba(51, 75, 88, 0.65)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(lineStartX, lineStartY);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();

        // Target dot on county centroid
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(tx, ty, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isDark ? '#0D1520' : '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Callout text block with guaranteed light/dark contrast safety
        ctx.textAlign = anc.align;
        ctx.fillStyle = isDark ? '#FFFFFF' : '#1E293B';
        ctx.font = '800 19px Arial, sans-serif';
        ctx.fillText(c.headline, anc.x, anc.y - 10);

        ctx.fillStyle = isDark ? c.color : idx === 0 ? '#D7182A' : '#334B58';
        ctx.font = '700 15.5px Arial, sans-serif';
        ctx.fillText(c.subline, anc.x, anc.y + 13);
        ctx.textAlign = 'left';
      });
    }

    // 5. Bottom Legend Grid
    const legendTopY = 875;
    ctx.strokeStyle = isDark ? '#1E293B' : '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(58, legendTopY - 16);
    ctx.lineTo(width - 58, legendTopY - 16);
    ctx.stroke();

    if (studioMode === 'belts') {
      const candidateSwatches = activeBeltPreset.candidates
        .map((c) => {
          const count = evaluatedItems.filter((it) => it.winnerId === c.id).length;
          return {
            count,
            label: `${c.label} (${count})`,
            color: c.color
          };
        })
        .filter((s) => selectedProvince === 'ALL' || s.count > 0);

      const emptyCount = evaluatedItems.filter((it) => it.winnerId === null).length;
      const legendItems = [
        ...candidateSwatches,
        ...(emptyCount > 0 || selectedProvince === 'ALL'
          ? [
              {
                count: emptyCount,
                label:
                  emptyCount > 0
                    ? `${activeBeltPreset.emptyLabel} (${emptyCount})`
                    : activeBeltPreset.emptyLabel,
                color: isDark ? '#334155' : '#CBD5E1'
              }
            ]
          : [])
      ];

      const cols = 4;
      const colW = (width - 116) / cols;
      legendItems.forEach((li, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const lx = 58 + col * colW;
        const ly = legendTopY + row * 36;

        ctx.fillStyle = li.color;
        ctx.beginPath();
        ctx.roundRect(lx, ly, 21, 21, 3);
        ctx.fill();

        ctx.fillStyle = isDark ? '#E2E8F0' : '#1E293B';
        ctx.font = '600 17px Arial, sans-serif';
        ctx.fillText(li.label, lx + 30, ly + 17);
      });
    } else if (studioMode === 'heatmap') {
      const ramp6 = CLUSTER_RAMPS[clusterRampId].colors6;
      const [t0, t1, t2, t3, t4, t5, t6] = sixTierBreaks;
      const fmtT = (v: number) =>
        clusterMetricMode === 'pct' && activeClusterChar.baseId
          ? formatCleanPct(v)
          : formatMetricValue(v, activeClusterChar.unit, true);

      const barX = 58;
      const barY = legendTopY - 4;
      const barW = 1080;
      const barH = 15;
      const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
      ramp6.forEach((col, i) => {
        grad.addColorStop(i / (ramp6.length - 1), col);
      });
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 8);
      ctx.fill();

      ctx.fillStyle = isDark ? '#94A3B8' : '#475569';
      ctx.font = '700 13px Arial, sans-serif';
      ctx.fillText(
        `PRODUCTION SCALE: ${fmtT(t0)} (Lowest Active) ───► ${fmtT(t3)} (Median) ───► ${fmtT(t6)} (Peak)`,
        barX + barW + 22,
        barY + 12
      );

      const steps6 = [
        { label: `Emerging (${fmtT(t0)} – ${fmtT(t1)})`, color: ramp6[0] },
        { label: `Low–Mid (≤ ${fmtT(t2)})`, color: ramp6[1] },
        { label: `Moderate (≤ ${fmtT(t3)})`, color: ramp6[2] },
        { label: `High (≤ ${fmtT(t4)})`, color: ramp6[3] },
        { label: `Very High (≤ ${fmtT(t5)})`, color: ramp6[4] },
        { label: `Peak Core (up to ${fmtT(t6)})`, color: ramp6[5] }
      ];

      const cols = 3;
      const colW = (width - 116) / cols;
      steps6.forEach((st, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const lx = 58 + col * colW;
        const ly = legendTopY + 22 + row * 34;

        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.roundRect(lx, ly, 21, 21, 4);
        ctx.fill();

        ctx.fillStyle = isDark ? '#E2E8F0' : '#1E293B';
        ctx.font = '600 16.5px Arial, sans-serif';
        ctx.fillText(st.label, lx + 30, ly + 16);
      });
    } else {
      const ramp = CLUSTER_RAMPS[clusterRampId].colors;
      const [b0, b1, b2, b3, b4, b5] = clusterBreaks;
      const fmtB = (v: number) =>
        clusterMetricMode === 'pct' && activeClusterChar.baseId
          ? formatCleanPct(v)
          : formatMetricValue(v, activeClusterChar.unit, true);

      const steps = [
        { label: `Lowest (${fmtB(b0)} – ${fmtB(b1)})`, color: ramp[0] },
        { label: `Low–Mid (≤ ${fmtB(b2)})`, color: ramp[1] },
        { label: `Middle (≤ ${fmtB(b3)})`, color: ramp[2] },
        { label: `High–Mid (≤ ${fmtB(b4)})`, color: ramp[3] },
        { label: `Highest (up to ${fmtB(b5)})`, color: ramp[4] },
        {
          label: 'Suppressed / No Reported Activity',
          color: isDark ? '#1E293B' : '#E2E8F0'
        }
      ];

      const cols = 3;
      const colW = (width - 116) / cols;
      steps.forEach((st, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const lx = 58 + col * colW;
        const ly = legendTopY + row * 38;

        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.roundRect(lx, ly, 22, 22, 4);
        ctx.fill();

        ctx.fillStyle = isDark ? '#E2E8F0' : '#1E293B';
        ctx.font = '600 17.5px Arial, sans-serif';
        ctx.fillText(st.label, lx + 32, ly + 18);
      });
    }

    // 6. Institutional "Bottom Line" Takeaway Strip + Clean Source Line (data-visualization.md §5)
    const blY = 1030;
    ctx.fillStyle = isDark ? '#162232' : '#EDE6DE';
    ctx.beginPath();
    ctx.roundRect(58, blY, width - 116, 40, 6);
    ctx.fill();
    ctx.fillStyle = '#D7182A';
    ctx.fillRect(58, blY, 5, 40);

    const secondBelt = beltBreakdownSummary[1];
    const bottomLineMsg =
      studioMode === 'belts' && topBelt
        ? `Bottom Line: ${topBelt.cand.label} is the #1 belt in ${topBelt.countyCount} of ${evaluatedItems.length} ${cleanLvl}${
            secondBelt ? `, followed by ${secondBelt.cand.label} (${secondBelt.countyCount} areas)` : ''
          }.`
        : topClusterRow && (topClusterRow.clusterValue ?? 0) > 0
        ? `Bottom Line: ${topClusterRow.geo.cleanName} leads at ${formatMetricValue(
            topClusterRow.clusterValue,
            activeClusterChar.unit,
            true
          )}, with active reporting across ${activeProducingCount} of ${evaluatedItems.length} ${cleanLvl} (${coveragePct}%).`
        : `Bottom Line: Regional agricultural distribution mapped across ${evaluatedItems.length} ${cleanLvl}.`;

    ctx.fillStyle = isDark ? '#F8FAFC' : '#1E293B';
    ctx.font = '700 15.5px Arial, sans-serif';
    ctx.fillText(fitCanvasText(ctx, bottomLineMsg, width - 150), 76, blY + 25);

    const footerY = 1096;
    ctx.fillStyle = isDark ? '#94A3B8' : '#64748B';
    ctx.font = '500 14px Arial, sans-serif';
    ctx.fillText(
      'Source: Statistics Canada — Census of Agriculture (2021) & Digital Boundary Files',
      58,
      footerY
    );

    ctx.textAlign = 'right';
    ctx.fillStyle = isDark ? '#EDE6DE' : '#334B58';
    ctx.font = '800 15px Arial, sans-serif';
    ctx.fillText(
      'Ontario Federation of Agriculture (OFA)  •  Farms and Food Forever',
      width - 58,
      footerY
    );
    ctx.textAlign = 'left';
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [
    geoJsonData,
    studioMode,
    posterTheme,
    showCallouts,
    showNorthernInset,
    selectedProvince,
    selectedLevel,
    activeProvinceName,
    activeBeltPreset,
    activeClusterChar,
    clusterMetricMode,
    clusterRampId,
    evaluatedItems,
    clusterBreaks,
    sixTierBreaks,
    activeProducingCount,
    beltBreakdownSummary,
    sortedDisplayRows,
    focusedGeoId
  ]);

  const handleDownloadPosterPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    const scopeSlug = activeProvinceName.replace(/[^a-z0-9]+/gi, '_');
    const topicSlug =
      studioMode === 'belts' ? activeBeltPreset.id : activeClusterChar.id;
    const modeSlug =
      studioMode === 'belts' ? 'Belts' : studioMode === 'heatmap' ? 'HeatMap' : 'Clusters';
    a.href = url;
    a.download = `OFA_${scopeSlug}_${topicSlug}_${modeSlug}_Poster.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadBeltsCsv = () => {
    if (studioMode === 'belts') {
      const headers = [
        'Geography',
        'Province',
        'OFA Federation',
        'Geography Level',
        'DGUID',
        '#1 Dominant Belt / Category',
        `#1 Category Value (${activeBeltPreset.unitLabel})`,
        '% Share of Tracked Categories',
        '#2 Runner-Up Category',
        `#2 Category Value (${activeBeltPreset.unitLabel})`,
        `Total Tracked (${activeBeltPreset.unitLabel})`
      ];
      const rows = sortedDisplayRows.map((it) => [
        it.geo.cleanName,
        it.geo.provinceName || '',
        it.geo.ofaFederation || '',
        it.geo.level,
        it.geo.dguid,
        it.winnerLabel,
        Math.round(it.winnerValue),
        it.winnerSharePct,
        it.runnerUpLabel || '',
        Math.round(it.runnerUpValue),
        Math.round(it.totalCategorySum)
      ]);
      downloadCsvFile(
        `OFA_${activeProvinceName}_${activeBeltPreset.id}_Belts.csv`,
        headers,
        rows
      );
    } else {
      const headers = [
        'Rank',
        'Geography',
        'Province',
        'OFA Federation',
        'DGUID',
        'Characteristic',
        '2021 Value',
        '% Share of Base'
      ];
      const rows = sortedDisplayRows.map((it, idx) => [
        idx + 1,
        it.geo.cleanName,
        it.geo.provinceName || '',
        it.geo.ofaFederation || '',
        it.geo.dguid,
        activeClusterChar.name,
        it.clusterValue ?? '',
        it.clusterPctOfBase !== null ? Number(it.clusterPctOfBase.toFixed(1)) : ''
      ]);
      downloadCsvFile(
        `OFA_${activeProvinceName}_${activeClusterChar.id}_Clusters.csv`,
        headers,
        rows
      );
    }
  };

  const topBeltUi = beltBreakdownSummary[0];
  const topClusterUi = sortedDisplayRows[0];
  const beltsClaimHeadline =
    studioMode === 'belts' && topBeltUi
      ? `${topBeltUi.cand.label} leads ${selectedProvince === 'ALL' ? 'Canada' : activeProvinceName} across ${topBeltUi.countyCount} ${cleanGeoLevelLabel(selectedLevel).toLowerCase()}`
      : topClusterUi && (topClusterUi.clusterValue ?? 0) > 0
      ? `${topClusterUi.geo.cleanName} leads ${selectedProvince === 'ALL' ? 'Canadian' : activeProvinceName} ${formatVisualLabel(activeClusterChar.shortName).toLowerCase()}`
      : `Agricultural Belts & Regional Production Footprint Studio`;

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Top Studio Bar with Declarative Claim Headline */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2 rounded-md border border-slate-200/90 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight text-[#1E293B]">
                {beltsClaimHeadline}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EDE6DE] border border-[#D7182A]/25 px-2.5 py-0.5 text-[11px] font-bold text-[#334B58]">
                <Sparkles className="w-3 h-3 text-[#D7182A]" />
                <span>OFA Poster Studio</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Generate publication-grade Crop Belt, Production Heat Map, and Cluster Graphics across all 282 Canadian Counties &amp; Districts or any Province
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Dark Editorial vs Light Report Theme Toggle */}
          <div className="inline-flex rounded bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPosterTheme('dark')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded cursor-pointer transition ${
                posterTheme === 'dark'
                  ? 'bg-[#0D1520] text-[#ECA842] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Dark Editorial Poster Theme"
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Dark Editorial</span>
            </button>
            <button
              type="button"
              onClick={() => setPosterTheme('light')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded cursor-pointer transition ${
                posterTheme === 'light'
                  ? 'bg-[#334B58] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Light OFA Report Poster Theme"
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light Report</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownloadPosterPng}
            className="inline-flex items-center gap-1.5 rounded bg-[#D7182A] hover:bg-[#B81423] px-3 py-1.5 text-xs font-extrabold text-white shadow-2xs transition cursor-pointer"
            title="Download full 1800x1125 high-resolution Poster PNG for social media, slides, or reports"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Download Social Poster (PNG)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadBeltsCsv}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-[#334B58] transition cursor-pointer"
            title="Download regional belt & cluster assignments as an Excel-ready CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#D7182A]" />
            <span>Download Data (CSV)</span>
          </button>
        </div>
      </div>

      {/* Main 3-Column Studio Grid */}
      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        {/* LEFT COLUMN (3 cols): Mode Switcher + Scope + Belt Presets / Cluster Variable Selector */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2 overflow-y-auto pr-0.5">
          {/* 1. Studio Mode Card */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58] mb-2">
              1. Visual Map Mode
            </h3>
            <div className="grid grid-cols-3 gap-1 rounded bg-slate-100 p-1 text-[11px] font-bold mb-2">
              <button
                type="button"
                onClick={() => setStudioMode('belts')}
                className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded cursor-pointer transition ${
                  studioMode === 'belts'
                    ? 'bg-[#334B58] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3 h-3 shrink-0" />
                <span className="truncate">Dominant Belts</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStudioMode('heatmap');
                  setClusterRampId('thermal_full');
                }}
                className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded cursor-pointer transition ${
                  studioMode === 'heatmap'
                    ? 'bg-[#D7182A] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">All-CD Heat Map</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStudioMode('cluster');
                  setClusterRampId('gold_fire');
                }}
                className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded cursor-pointer transition ${
                  studioMode === 'cluster'
                    ? 'bg-[#334B58] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Flame className="w-3 h-3 shrink-0" />
                <span className="truncate">Cluster Focus</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">
              {studioMode === 'belts'
                ? 'Colors each county by its #1 largest crop, farm specialization, livestock group, or tillage practice.'
                : studioMode === 'heatmap'
                ? 'Full Production Footprint: shades every active county or district on a 6-tier continuous heat map.'
                : 'Highlights top high-density regional production clusters for any selected commodity or statistic.'}
            </p>
          </div>

          {/* 2. Geographic Scope (National vs Provincial) */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                2. National or Provincial Scope
              </h3>
              <button
                type="button"
                onClick={onOpenGeoLocator}
                className="text-[11px] font-semibold text-[#D7182A] hover:underline cursor-pointer"
              >
                Area Finder
              </button>
            </div>

            {/* Quick 1-Click National vs Ontario Toggle */}
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => setSelectedProvince('35')}
                className={`py-1.5 px-2 rounded text-xs font-bold border cursor-pointer transition ${
                  selectedProvince === '35'
                    ? 'bg-[#D7182A] text-white border-[#D7182A]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Ontario (Provincial)
              </button>
              <button
                type="button"
                onClick={() => setSelectedProvince('ALL')}
                className={`py-1.5 px-2 rounded text-xs font-bold border cursor-pointer transition ${
                  selectedProvince === 'ALL'
                    ? 'bg-[#334B58] text-white border-[#334B58]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                All of Canada (National)
              </button>
            </div>

            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
              Province / Territory Filter
            </label>
            <select
              value={selectedProvince}
              onChange={(e) => setSelectedProvince(e.target.value)}
              className="mb-2 w-full rounded border border-slate-300 bg-[#F8FAFC] px-2 py-1.5 text-xs font-semibold text-[#334B58]"
            >
              <option value="ALL">All of Canada (National — 282 Counties &amp; Districts)</option>
              {provinces.map((p) => (
                <option key={p.provinceCode} value={p.provinceCode}>
                  {p.cleanName}
                </option>
              ))}
            </select>

            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
              Boundary Level
            </label>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value as GeoLevel)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="Counties / Census Divisions (CD)">
                Counties &amp; Districts
              </option>
              <option value="Census Agricultural Regions (CAR)">
                Agricultural Regions
              </option>
              {selectedProvince === 'ALL' && (
                <option value="Provinces & Territories">Provinces &amp; Territories</option>
              )}
            </select>
          </div>

          {/* 3. Belt Presets OR Single-Stat Variable Selector */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            {studioMode === 'belts' ? (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58] mb-2">
                  3. Select Agricultural Belt Map
                </h3>
                <div className="space-y-1.5">
                  {BELT_PRESETS.map((preset) => {
                    const active = preset.id === activeBeltPresetId;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setActiveBeltPresetId(preset.id)}
                        className={`w-full text-left px-2.5 py-2 rounded border text-xs font-bold transition cursor-pointer ${
                          active
                            ? 'bg-[#334B58] text-white border-[#334B58] shadow-xs'
                            : 'bg-[#F8FAFC] hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {preset.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58] mb-1.5">
                  3. Select Production Footprint or Stat
                </h3>

                {/* 1-Click Production Footprint Quick-Picks */}
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  1-Click Footprint Presets
                </label>
                <div className="flex flex-wrap gap-1 mb-2.5">
                  {QUICK_FOOTPRINT_PRESETS.map((qp) => {
                    const isActive = clusterCharId === qp.charId;
                    return (
                      <button
                        key={qp.id}
                        type="button"
                        onClick={() => {
                          setClusterCategory(qp.category);
                          setClusterCharId(qp.charId);
                        }}
                        className={`px-2 py-1 rounded text-[10.5px] font-bold border cursor-pointer transition ${
                          isActive
                            ? 'bg-[#D7182A] text-white border-[#D7182A]'
                            : 'bg-[#F8FAFC] text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {qp.label}
                      </button>
                    );
                  })}
                </div>

                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Or Browse All {dataset.characteristics.length} Census Variables by Category
                </label>
                <select
                  value={clusterCategory}
                  onChange={(e) => setClusterCategory(e.target.value)}
                  className="mb-2 w-full rounded border border-slate-300 bg-[#F8FAFC] px-2 py-1.5 text-xs font-semibold text-[#334B58]"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cleanCategoryLabel(cat)}
                    </option>
                  ))}
                </select>

                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Specific Metric
                </label>
                <select
                  value={clusterCharId}
                  onChange={(e) => setClusterCharId(e.target.value)}
                  className="mb-2.5 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800"
                >
                  {clusterCategoryChars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatVisualLabel(c.shortName)}
                    </option>
                  ))}
                </select>

                {activeClusterChar.baseId && (
                  <>
                    <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                      Color Map By
                    </label>
                    <div className="grid grid-cols-2 gap-1 rounded bg-slate-100 p-1 text-[11px] font-semibold mb-2.5">
                      <button
                        type="button"
                        onClick={() => setClusterMetricMode('val')}
                        className={`py-1 rounded cursor-pointer ${
                          clusterMetricMode === 'val'
                            ? 'bg-[#334B58] text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        Total ({activeClusterChar.unit})
                      </button>
                      <button
                        type="button"
                        onClick={() => setClusterMetricMode('pct')}
                        className={`py-1 rounded cursor-pointer ${
                          clusterMetricMode === 'pct'
                            ? 'bg-[#334B58] text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        % Share of Base
                      </button>
                    </div>
                  </>
                )}

                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Color Palette
                </label>
                <select
                  value={clusterRampId}
                  onChange={(e) => setClusterRampId(e.target.value as ClusterRampId)}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700"
                >
                  {Object.entries(CLUSTER_RAMPS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Poster Overlay Options */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={showCallouts}
                  onChange={(e) => setShowCallouts(e.target.checked)}
                  className="rounded text-[#334B58]"
                />
                <span>Show Leader Callout Pointers</span>
              </label>

              {selectedProvince === '35' && (
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={showNorthernInset}
                    onChange={(e) => setShowNorthernInset(e.target.checked)}
                    className="rounded text-[#334B58]"
                  />
                  <span>Zoom Southern ON + Northern ON Inset</span>
                </label>
              )}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN (6 cols): Live High-Resolution Social Media Poster Canvas */}
        <div className="col-span-12 lg:col-span-6 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#D7182A]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                Live Poster Preview (1800 × 1125 High-DPI Canvas)
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              Click "Download Social Poster (PNG)" at top-right to save image
            </span>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-900/5 rounded-lg p-2 overflow-hidden">
            <canvas
              ref={canvasRef}
              width={1800}
              height={1125}
              className="max-w-full max-h-full w-auto h-auto rounded shadow-lg border border-slate-300"
            />
          </div>
        </div>

        {/* RIGHT COLUMN (3 cols): Belt Summary Breakdown + Regional Leaderboard */}
        <div className="col-span-12 lg:col-span-3 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          {studioMode === 'belts' ? (
            <div className="mb-3 pb-2.5 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58] mb-2">
                Belt Summary ({activeProvinceName})
              </h3>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {beltBreakdownSummary.map((b) => (
                  <div
                    key={b.cand.id}
                    className="flex items-center justify-between gap-2 rounded bg-[#F8FAFC] px-2 py-1.5 border border-slate-100 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-xs shrink-0"
                        style={{ backgroundColor: b.cand.color }}
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate">{b.cand.label}</div>
                        {b.topCounty && (
                          <div className="text-[10px] text-slate-500 truncate">
                            Leader: {b.topCounty.geo.cleanName}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-extrabold text-[#334B58]">
                        {b.countyCount} {b.countyCount === 1 ? 'area' : 'areas'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {activeBeltPreset.unitLabel === 'acres'
                          ? `${formatMetricValue(b.totalWinningVal, 'ACRES', true)} ac`
                          : `${formatMetricValue(b.totalWinningVal, 'FARMS', true)} farms`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-2.5 pb-2 border-b border-slate-100">
              <div className="rounded bg-[#F8FAFC] border border-slate-200/80 px-2.5 py-2 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Active Production Coverage
                  </div>
                  <div className="text-xs font-extrabold text-[#334B58]">
                    {activeProducingCount} of {evaluatedItems.length} {cleanGeoLevelLabel(selectedLevel)}
                  </div>
                </div>
                <span className="rounded-full bg-[#EDE6DE] text-[#D7182A] px-2.5 py-0.5 text-xs font-extrabold">
                  {evaluatedItems.length > 0
                    ? `${Math.round((activeProducingCount / evaluatedItems.length) * 100)}% Active`
                    : '0%'}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
              {studioMode === 'belts'
                ? `Regions by #1 Belt (${sortedDisplayRows.length})`
                : studioMode === 'heatmap'
                ? `All Regions Heat Map (${sortedDisplayRows.length})`
                : `Top Clustered Regions (${sortedDisplayRows.length})`}
            </h3>
            <span className="text-[10px] text-slate-400">Click to highlight • Dbl-click Snapshot</span>
          </div>

          <div className="flex-1 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100 text-xs">
            {sortedDisplayRows.map((it, idx) => {
              const isSelected = it.geo.id === focusedGeoId;
              const badgeColor =
                studioMode === 'belts' ? it.winnerColor : getClusterColor(it);

              const valDisplay =
                studioMode === 'belts'
                  ? activeBeltPreset.unitLabel === 'acres'
                    ? `${formatMetricValue(it.winnerValue, 'ACRES', true)} ac (${formatCleanPct(it.winnerSharePct)})`
                    : `${formatMetricValue(it.winnerValue, 'FARMS', true)} farms (${formatCleanPct(it.winnerSharePct)})`
                  : clusterMetricMode === 'pct' && activeClusterChar.baseId
                  ? it.clusterPctOfBase !== null
                    ? `${formatCleanPct(it.clusterPctOfBase)} (${formatMetricValue(
                        it.clusterValue,
                        activeClusterChar.unit,
                        true
                      )})`
                    : '—'
                  : formatMetricValue(it.clusterValue, activeClusterChar.unit, true);

              return (
                <div
                  key={it.geo.id}
                  onClick={() =>
                    setFocusedGeoId(it.geo.id === focusedGeoId ? null : it.geo.id)
                  }
                  onDoubleClick={() => onSelectGeoForSnapshot(it.geo)}
                  className={`px-2.5 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition ${
                    isSelected ? 'bg-[#EDE6DE]/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-xs shrink-0 border border-slate-300/60"
                      style={{ backgroundColor: badgeColor }}
                    />
                    <div className="min-w-0">
                      <div
                        className={`font-bold truncate ${
                          idx === 0 ? 'text-[#D7182A]' : 'text-[#334B58]'
                        }`}
                      >
                        <span className="text-slate-400 font-mono mr-1">#{idx + 1}</span>
                        {it.geo.cleanName}
                        {selectedProvince === 'ALL' && it.geo.provinceName && (
                          <span className="text-[10px] font-normal text-slate-400 ml-1">
                            ({it.geo.provinceName})
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {studioMode === 'belts' ? (
                          <>
                            <span className="font-semibold text-slate-700">{it.winnerLabel}</span>
                            {it.runnerUpLabel && ` • #2: ${it.runnerUpLabel}`}
                          </>
                        ) : (
                          <span>{formatVisualLabel(activeClusterChar.shortName)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 font-bold text-slate-800 text-[11px]">
                    {valDisplay}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
