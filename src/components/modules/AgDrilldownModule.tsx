import React, { useMemo, useState } from 'react';
import { AgCensusDataset, GeoLevel, GeographyNode } from '../../types/census';
import {
  FAR_NORTH_WILDERNESS_DGUIDS,
  MTM_PALETTES,
  MapCalloutPoint,
  clipGeoJsonFeatureToAgBelt,
  computeQuintileBreaks,
  downloadCsvFile,
  drawNonOverlappingMapCallouts,
  fitCanvasText,
  formatTableGeoSubtitle,
  formatTableGeoTitle,
  getGeoById,
  getQuintileColor
} from '../../utils/analytics';
import { MultiGeographyScopeSlicer } from '../GeographySlicer';
import { InteractiveAgMap, MapItemPoint, loadBoundariesGeoJson } from '../InteractiveAgMap';
import {
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  Info,
  RotateCcw,
  ShieldCheck,
  Table2
} from 'lucide-react';

interface AgDrilldownModuleProps {
  dataset: AgCensusDataset;
  onOpenGeoLocator: () => void;
  onSelectGeoForSnapshot: (geo: GeographyNode) => void;
}

const FILTER1_OPTIONS = [
  { id: 'ALL', label: 'All Farm Types (Total Farms)', charId: 'total_farms' },
  { id: 'naics_oilseed_grain', label: 'Oilseed & Grain Farming [1111]', charId: 'naics_oilseed_grain' },
  { id: 'naics_cattle_total', label: 'Cattle [1121]', charId: 'naics_cattle_total' },
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
  { id: 'rev_500k_plus', label: 'Receipts: $500,000 and over (Commercial Scale)', charId: 'rev_500k_plus' },
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

const CROSSTAB_FARM_TYPES = [
  { key: 'Total - Farm type', shortLabel: 'All Farm Types (Total)' },
  { key: 'Oilseed and grain farming [1111]', shortLabel: 'Oilseed & Grain [1111]' },
  { key: 'Vegetable and melon farming [1112]', shortLabel: 'Vegetable & Melon [1112]' },
  { key: 'Fruit and tree nut farming [1113]', shortLabel: 'Fruit & Tree Nut [1113]' },
  {
    key: 'Greenhouse, nursery and floriculture production [1114]',
    shortLabel: 'Greenhouse, Nursery & Floriculture [1114]'
  },
  { key: 'Other crop farming [1119]', shortLabel: 'Other Crop Farming [1119]' },
  {
    key: 'Beef cattle ranching and farming, including feedlots [112110]',
    shortLabel: 'Beef Cattle & Feedlots [112110]'
  },
  { key: 'Dairy cattle and milk production [112120]', shortLabel: 'Dairy Cattle & Milk [112120]' },
  { key: 'Hog and pig farming [1122]', shortLabel: 'Hog & Pig Farming [1122]' },
  { key: 'Poultry and egg production [1123]', shortLabel: 'Poultry & Egg [1123]' },
  { key: 'Sheep and goat farming [1124]', shortLabel: 'Sheep & Goat [1124]' },
  { key: 'Other animal production [1129]', shortLabel: 'Other Animal Production [1129]' }
];

const CROSSTAB_INCOME_COLS = [
  { key: 'Under $25,000', shortLabel: 'Under $25K' },
  { key: '$25,000 to $49,999', shortLabel: '$25K–$49.9K' },
  { key: '$50,000 to $74,999', shortLabel: '$50K–$74.9K' },
  { key: '$75,000 to $99,999', shortLabel: '$75K–$99.9K' },
  { key: '$100,000 to $249,999', shortLabel: '$100K–$249.9K' },
  { key: '$250,000 and over', shortLabel: '$250K+' }
];

const CROSSTAB_EDU_COLS = [
  { key: 'No certificate, diploma or degree', shortLabel: 'No Cert. / Diploma' },
  {
    key: 'High (secondary) school diploma or equivalency certificate',
    shortLabel: 'High School Diploma'
  },
  { key: 'Apprenticeship or trades certificate or diploma', shortLabel: 'Trades / Apprenticeship' },
  {
    key: 'College, CEGEP or other non-university certificate or diploma',
    shortLabel: 'College / CEGEP'
  },
  {
    key: 'University certificate or diploma below bachelor level',
    shortLabel: 'Univ. Below Bachelor'
  },
  { key: "Bachelor's degree or higher", shortLabel: "Bachelor's or Higher" }
];

interface EmpiricalCell {
  val: number | null;
  status: 'x' | 'F' | 'NA' | null;
}

function readEmpiricalCell(dataset: AgCensusDataset, geoId: string, charId: string): EmpiricalCell {
  const entry = dataset.values[geoId]?.[charId];
  if (!entry) {
    return { val: null, status: 'F' };
  }
  const v = entry[0];
  if (typeof v === 'number' && !Number.isNaN(v)) {
    return { val: v, status: null };
  }
  if (entry[2] === 'x') return { val: null, status: 'x' };
  if (entry[2] === 'NA') return { val: null, status: 'NA' };
  return { val: null, status: 'F' };
}

interface ScreeningRow {
  geo: GeographyNode;
  totalFarms: number;
  isSuppressed: boolean;
  suppressedStatus: 'x' | 'F' | null;
  minCount: number | null;
  maxCount: number | null;
  minPct: number | null;
  maxPct: number | null;
  c1Pct: number | null;
  c2Pct: number | null;
  c3Pct: number | null;
  c1Status: 'x' | 'F' | 'NA' | null;
  c2Status: 'x' | 'F' | 'NA' | null;
  c3Status: 'x' | 'F' | 'NA' | null;
}

export const AgDrilldownModule: React.FC<AgDrilldownModuleProps> = ({
  dataset,
  onOpenGeoLocator,
  onSelectGeoForSnapshot
}) => {
  const [drilldownView, setDrilldownView] = useState<'screening' | 'crosstabs'>('screening');

  const [selectedLevel, setSelectedLevel] = useState<GeoLevel>('Counties / Census Divisions (CD)');
  const [selectedProvince, setSelectedProvince] = useState<string>('35'); // Default Ontario
  const [selectedCarId, setSelectedCarId] = useState<string>('ALL');

  const [filter1, setFilter1] = useState<string>('naics_oilseed_grain');
  const [filter2, setFilter2] = useState<string>('ALL');
  const [filter3, setFilter3] = useState<string>('ALL');

  const [minPct1, setMinPct1] = useState<number>(0);
  const [minPct2, setMinPct2] = useState<number>(0);
  const [minPct3, setMinPct3] = useState<number>(0);

  const [mapMetricMode, setMapMetricMode] = useState<'pct' | 'count'>('pct');
  const [boundSortMode, setBoundSortMode] = useState<'max' | 'min'>('max');
  const [paletteMode, setPaletteMode] = useState<'standard' | 'accessible'>('standard');
  const [activeChartTab, setActiveChartTab] = useState<1 | 2 | 3>(1);
  const [focusedGeoId, setFocusedGeoId] = useState<string | null>(null);
  const [isExportingMap, setIsExportingMap] = useState<boolean>(false);

  // Official Cross-Tabulations state
  const [crosstabTopic, setCrosstabTopic] = useState<'INC' | 'EDU'>('INC');
  const [crosstabGeoDguid, setCrosstabGeoDguid] = useState<string>('2021A000235'); // Ontario default
  const [crosstabDisplayMode, setCrosstabDisplayMode] = useState<'count' | 'rowPct' | 'colPct'>(
    'rowPct'
  );
  const [selectedCrosstabFarmType, setSelectedCrosstabFarmType] = useState<string>(
    'Oilseed and grain farming [1111]'
  );

  // Active filter count (0, 1, 2, or 3)
  const activeFilters = useMemo(() => {
    const list: Array<{ slot: 1 | 2 | 3; charId: string; minPct: number }> = [];
    if (filter1 !== 'ALL') list.push({ slot: 1, charId: filter1, minPct: minPct1 });
    if (filter2 !== 'ALL') list.push({ slot: 2, charId: filter2, minPct: minPct2 });
    if (filter3 !== 'ALL') list.push({ slot: 3, charId: filter3, minPct: minPct3 });
    return list;
  }, [filter1, filter2, filter3, minPct1, minPct2, minPct3]);

  const isMultiCriteria = activeFilters.length >= 2;
  const hasPositiveThreshold = activeFilters.some((f) => f.minPct > 0);

  // Scope geographies
  const scopedGeos = useMemo(() => {
    return dataset.geographies.filter((g) => {
      if (g.level !== selectedLevel) return false;
      if (selectedProvince === 'ALL' && FAR_NORTH_WILDERNESS_DGUIDS.has(g.dguid)) return false;
      if (selectedProvince !== 'ALL' && g.provinceCode !== selectedProvince) return false;
      if (selectedCarId !== 'ALL') {
        if (selectedLevel === 'Counties / Census Divisions (CD)') {
          return g.parentId === selectedCarId;
        }
        if (selectedLevel === 'Townships / Subdivisions (CCS)') {
          const parentCd = getGeoById(dataset, g.parentId);
          return parentCd?.parentId === selectedCarId;
        }
      }
      return true;
    });
  }, [dataset, selectedLevel, selectedProvince, selectedCarId]);

  // Empirical Screening & Exact Fréchet–Hoeffding Mathematical Joint Bounds (Zero synthetic multiplication)
  const screeningResult = useMemo(() => {
    const passingUnsuppressed: ScreeningRow[] = [];
    const suppressedInScope: ScreeningRow[] = [];
    let excludedByThresholdCount = 0;

    for (const geo of scopedGeos) {
      const totalCell = readEmpiricalCell(dataset, geo.id, 'total_farms');
      const totalFarms = totalCell.val ?? 0;

      if (totalFarms <= 0) {
        if (hasPositiveThreshold) {
          excludedByThresholdCount++;
        } else {
          passingUnsuppressed.push({
            geo,
            totalFarms: 0,
            isSuppressed: false,
            suppressedStatus: null,
            minCount: 0,
            maxCount: 0,
            minPct: 0,
            maxPct: 0,
            c1Pct: filter1 !== 'ALL' ? 0 : null,
            c2Pct: filter2 !== 'ALL' ? 0 : null,
            c3Pct: filter3 !== 'ALL' ? 0 : null,
            c1Status: null,
            c2Status: null,
            c3Status: null
          });
        }
        continue;
      }

      const cell1 = filter1 !== 'ALL' ? readEmpiricalCell(dataset, geo.id, filter1) : null;
      const cell2 = filter2 !== 'ALL' ? readEmpiricalCell(dataset, geo.id, filter2) : null;
      const cell3 = filter3 !== 'ALL' ? readEmpiricalCell(dataset, geo.id, filter3) : null;

      const c1Pct =
        cell1 && cell1.val !== null ? Number(((cell1.val / totalFarms) * 100).toFixed(1)) : null;
      const c2Pct =
        cell2 && cell2.val !== null ? Number(((cell2.val / totalFarms) * 100).toFixed(1)) : null;
      const c3Pct =
        cell3 && cell3.val !== null ? Number(((cell3.val / totalFarms) * 100).toFixed(1)) : null;

      // Check if any active filter is suppressed ('x' or 'F') in this geography
      const activeCells = [cell1, cell2, cell3].filter((c): c is EmpiricalCell => c !== null);
      const anySuppressed = activeCells.some((c) => c.val === null && c.status !== 'NA');
      const supStatus: 'x' | 'F' | null = activeCells.some((c) => c.status === 'x')
        ? 'x'
        : anySuppressed
        ? 'F'
        : null;

      // Check if any known (unsuppressed) active filter already fails its minimum threshold
      const failsKnownThreshold =
        (filter1 !== 'ALL' && c1Pct !== null && c1Pct < minPct1) ||
        (filter2 !== 'ALL' && c2Pct !== null && c2Pct < minPct2) ||
        (filter3 !== 'ALL' && c3Pct !== null && c3Pct < minPct3);

      if (failsKnownThreshold) {
        excludedByThresholdCount++;
        continue;
      }

      if (anySuppressed) {
        suppressedInScope.push({
          geo,
          totalFarms,
          isSuppressed: true,
          suppressedStatus: supStatus,
          minCount: null,
          maxCount: null,
          minPct: null,
          maxPct: null,
          c1Pct,
          c2Pct,
          c3Pct,
          c1Status: cell1?.status ?? null,
          c2Status: cell2?.status ?? null,
          c3Status: cell3?.status ?? null
        });
        continue;
      }

      // All active criteria are empirically published in this geography
      if (activeFilters.length === 0) {
        passingUnsuppressed.push({
          geo,
          totalFarms,
          isSuppressed: false,
          suppressedStatus: null,
          minCount: totalFarms,
          maxCount: totalFarms,
          minPct: 100,
          maxPct: 100,
          c1Pct: null,
          c2Pct: null,
          c3Pct: null,
          c1Status: null,
          c2Status: null,
          c3Status: null
        });
      } else if (activeFilters.length === 1) {
        const singleVal = (cell1?.val ?? cell2?.val ?? cell3?.val) || 0;
        const singlePct = Number(((singleVal / totalFarms) * 100).toFixed(1));
        passingUnsuppressed.push({
          geo,
          totalFarms,
          isSuppressed: false,
          suppressedStatus: null,
          minCount: singleVal,
          maxCount: singleVal,
          minPct: singlePct,
          maxPct: singlePct,
          c1Pct,
          c2Pct,
          c3Pct,
          c1Status: null,
          c2Status: null,
          c3Status: null
        });
      } else {
        // Exact Fréchet–Hoeffding Mathematical Joint Bounds across k ∈ {2, 3} empirical marginals
        const counts = activeCells.map((c) => c.val as number);
        const k = counts.length;
        const sumCounts = counts.reduce((a, b) => a + b, 0);
        const minJoint = Math.max(0, sumCounts - (k - 1) * totalFarms);
        const maxJoint = Math.min(...counts);
        const minJointPct = Number(((minJoint / totalFarms) * 100).toFixed(1));
        const maxJointPct = Number(((maxJoint / totalFarms) * 100).toFixed(1));

        passingUnsuppressed.push({
          geo,
          totalFarms,
          isSuppressed: false,
          suppressedStatus: null,
          minCount: minJoint,
          maxCount: maxJoint,
          minPct: minJointPct,
          maxPct: maxJointPct,
          c1Pct,
          c2Pct,
          c3Pct,
          c1Status: null,
          c2Status: null,
          c3Status: null
        });
      }
    }

    const getSortVal = (r: ScreeningRow): number => {
      if (r.isSuppressed) return -1;
      if (mapMetricMode === 'pct') {
        return (boundSortMode === 'min' ? r.minPct : r.maxPct) ?? 0;
      }
      return (boundSortMode === 'min' ? r.minCount : r.maxCount) ?? 0;
    };

    passingUnsuppressed.sort((a, b) => getSortVal(b) - getSortVal(a));
    suppressedInScope.sort((a, b) => b.totalFarms - a.totalFarms);

    // When a positive threshold is set, suppressed cells cannot verify meeting the threshold so they are not included in qualifying rows
    const tableRows = hasPositiveThreshold
      ? passingUnsuppressed
      : [...passingUnsuppressed, ...suppressedInScope];

    return {
      passingUnsuppressed,
      suppressedInScope,
      excludedByThresholdCount,
      tableRows
    };
  }, [
    scopedGeos,
    dataset,
    filter1,
    filter2,
    filter3,
    minPct1,
    minPct2,
    minPct3,
    activeFilters,
    hasPositiveThreshold,
    mapMetricMode,
    boundSortMode
  ]);

  const { passingUnsuppressed, suppressedInScope, excludedByThresholdCount, tableRows } =
    screeningResult;

  // Aggregate summary across unsuppressed qualifying geographies
  const scopeSummary = useMemo(() => {
    const sumMin = passingUnsuppressed.reduce((acc, r) => acc + (r.minCount ?? 0), 0);
    const sumMax = passingUnsuppressed.reduce((acc, r) => acc + (r.maxCount ?? 0), 0);
    const sumTotal = passingUnsuppressed.reduce((acc, r) => acc + r.totalFarms, 0);
    const minSharePct = sumTotal > 0 ? Number(((sumMin / sumTotal) * 100).toFixed(1)) : 0;
    const maxSharePct = sumTotal > 0 ? Number(((sumMax / sumTotal) * 100).toFixed(1)) : 0;
    return {
      sumMin,
      sumMax,
      sumTotal,
      minSharePct,
      maxSharePct
    };
  }, [passingUnsuppressed]);

  const getRowPrimaryVal = (r: ScreeningRow): number => {
    if (r.isSuppressed) return 0;
    if (mapMetricMode === 'pct') {
      return (isMultiCriteria && boundSortMode === 'min' ? r.minPct : r.maxPct) ?? 0;
    }
    return (isMultiCriteria && boundSortMode === 'min' ? r.minCount : r.maxCount) ?? 0;
  };

  // Quintiles computed strictly across unsuppressed qualifying geographies
  const quintileBreaks = useMemo(() => {
    const vals = passingUnsuppressed.map(getRowPrimaryVal);
    return computeQuintileBreaks(vals);
  }, [passingUnsuppressed, mapMetricMode, isMultiCriteria, boundSortMode]);

  const formatRowCountDisplay = (r: ScreeningRow): string => {
    if (r.isSuppressed) return `${r.suppressedStatus || 'x'} (Suppressed)`;
    if (!isMultiCriteria) return (r.maxCount ?? 0).toLocaleString();
    if (r.minCount === r.maxCount) return (r.maxCount ?? 0).toLocaleString();
    return `${(r.minCount ?? 0).toLocaleString()}–${(r.maxCount ?? 0).toLocaleString()}`;
  };

  const formatRowPctDisplay = (r: ScreeningRow): string => {
    if (r.isSuppressed) return r.suppressedStatus || 'x';
    if (!isMultiCriteria) return `${(r.maxPct ?? 0).toFixed(1)}%`;
    if (r.minPct === r.maxPct) return `${(r.maxPct ?? 0).toFixed(1)}%`;
    return `${(r.minPct ?? 0).toFixed(1)}%–${(r.maxPct ?? 0).toFixed(1)}%`;
  };

  const mapItems: MapItemPoint[] = useMemo(() => {
    return tableRows.map((r) => {
      if (r.isSuppressed) {
        return {
          geo: r.geo,
          value: 0,
          formattedValue: `${r.suppressedStatus || 'x'} (Suppressed / Unreliable in StatCan table)`,
          secondaryLabel: `Total Farms: ${r.totalFarms.toLocaleString()}`,
          color: '#CBD5E1',
          radius: 5.5,
          isSelected: r.geo.id === focusedGeoId
        };
      }
      const val = getRowPrimaryVal(r);
      const countLabel = formatRowCountDisplay(r);
      const pctLabel = formatRowPctDisplay(r);
      return {
        geo: r.geo,
        value: val,
        formattedValue: isMultiCriteria
          ? `Joint Bounds: ${pctLabel} (${countLabel} farms)`
          : mapMetricMode === 'pct'
          ? `${pctLabel} (${countLabel} farms)`
          : `${countLabel} farms (${pctLabel})`,
        secondaryLabel: `Total Farms: ${r.totalFarms.toLocaleString()}`,
        color: getQuintileColor(val, quintileBreaks, paletteMode),
        radius: Math.max(5.5, Math.min(13, Math.sqrt((r.maxCount || 1)) * 0.45)),
        isSelected: r.geo.id === focusedGeoId
      };
    });
  }, [tableRows, mapMetricMode, isMultiCriteria, boundSortMode, quintileBreaks, paletteMode, focusedGeoId]);

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
    () =>
      FILTER3_OPTIONS.find((o) => o.id === filter3)?.label || 'All Operating Structures & Practices',
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

  const formatDrilldownScaleVal = (v: number): string =>
    mapMetricMode === 'pct' ? `${v.toFixed(1)}%` : `${Math.round(v).toLocaleString()} farms`;

  const getQuintileLabel = (r: ScreeningRow): string => {
    if (r.isSuppressed) return `Suppressed (${r.suppressedStatus || 'x'})`;
    const val = getRowPrimaryVal(r);
    const [, b1, b2, b3, b4] = quintileBreaks;
    if (val <= b1) return 'Lowest 20% (Bottom Tier)';
    if (val <= b2) return 'Lower-Middle 20%';
    if (val <= b3) return 'Middle 20%';
    if (val <= b4) return 'Upper-Middle 20%';
    return 'Highest 20% (Top Tier)';
  };

  // 1. Download Empirical Screening & Bounds Ranks as CSV
  const handleDownloadRankingCsv = () => {
    if (tableRows.length === 0) return;

    const headers = isMultiCriteria
      ? [
          'Rank',
          'Geography',
          'OFA Federation / Region',
          'Geography Level',
          'DGUID',
          'Filter 1 - Farm Type (NAICS)',
          'Filter 1 Empirical Share (%)',
          'Filter 2 - Revenue Scale',
          'Filter 2 Empirical Share (%)',
          'Filter 3 - Structure & Practice',
          'Filter 3 Empirical Share (%)',
          'Exact Min Joint Farms (Frechet Lower Bound)',
          'Exact Max Joint Farms (Frechet Upper Bound)',
          'Exact Min Joint Share (%)',
          'Exact Max Joint Share (%)',
          'Total Census Farms (2021)',
          'Suppression Flag',
          'Scale Tier'
        ]
      : [
          'Rank',
          'Geography',
          'OFA Federation / Region',
          'Geography Level',
          'DGUID',
          'Active Criterion',
          'Exact Published Farms (2021)',
          'Exact Share of Total Farms (%)',
          'Total Census Farms (2021)',
          'Suppression Flag',
          'Scale Tier'
        ];

    const singleCriterionLabel =
      filter1 !== 'ALL'
        ? filter1Label
        : filter2 !== 'ALL'
        ? filter2Label
        : filter3 !== 'ALL'
        ? filter3Label
        : 'All Census Farms';

    const rows = tableRows.map((r, idx) => {
      if (isMultiCriteria) {
        return [
          r.isSuppressed ? '—' : idx + 1,
          r.geo.name,
          r.geo.ofaFederation || '',
          r.geo.level,
          r.geo.dguid,
          filter1Label,
          filter1 === 'ALL' ? '100.0' : r.c1Pct !== null ? r.c1Pct : r.c1Status || 'x',
          filter2Label,
          filter2 === 'ALL' ? '100.0' : r.c2Pct !== null ? r.c2Pct : r.c2Status || 'x',
          filter3Label,
          filter3 === 'ALL' ? '100.0' : r.c3Pct !== null ? r.c3Pct : r.c3Status || 'x',
          r.isSuppressed ? r.suppressedStatus || 'x' : r.minCount,
          r.isSuppressed ? r.suppressedStatus || 'x' : r.maxCount,
          r.isSuppressed ? r.suppressedStatus || 'x' : r.minPct,
          r.isSuppressed ? r.suppressedStatus || 'x' : r.maxPct,
          r.totalFarms,
          r.suppressedStatus || '',
          getQuintileLabel(r)
        ];
      }
      return [
        r.isSuppressed ? '—' : idx + 1,
        r.geo.name,
        r.geo.ofaFederation || '',
        r.geo.level,
        r.geo.dguid,
        singleCriterionLabel,
        r.isSuppressed ? r.suppressedStatus || 'x' : r.maxCount,
        r.isSuppressed ? r.suppressedStatus || 'x' : r.maxPct,
        r.totalFarms,
        r.suppressedStatus || '',
        getQuintileLabel(r)
      ];
    });

    const slug = `${filter1 !== 'ALL' ? filter1 : 'all_farms'}_${
      filter3 !== 'ALL' ? filter3 : filter2 !== 'ALL' ? filter2 : 'exact'
    }`.replace(/[^a-zA-Z0-9_-]/g, '_');

    downloadCsvFile(`OFA_Drilldown_Empirical_Ranks_${slug}.csv`, headers, rows);
  };

  // 2. Download Publication-Grade Heat Map & Top Ranks Summary Card as High-Res PNG
  const handleDownloadHeatMapPng = async () => {
    if (passingUnsuppressed.length === 0 || isExportingMap) return;
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

      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#0F3D6E';
      ctx.fillRect(0, 0, width, 128);
      ctx.fillStyle = '#328475';
      ctx.fillRect(0, 124, width, 5);

      ctx.fillStyle = '#7DD3FC';
      ctx.font = 'bold 15px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        isMultiCriteria
          ? 'ONTARIO FEDERATION OF AGRICULTURE (OFA)  •  EMPIRICAL MULTI-CRITERIA SCREENING & EXACT BOUNDS'
          : 'ONTARIO FEDERATION OF AGRICULTURE (OFA)  •  AGCENSUS IQ EMPIRICAL HEAT MAP & RANKINGS',
        36,
        34
      );

      const activeFiltersList = [
        filter1 !== 'ALL'
          ? `${filter1Label}${minPct1 > 0 ? ` (≥${minPct1}%)` : ''}`
          : null,
        filter2 !== 'ALL'
          ? `${filter2Label}${minPct2 > 0 ? ` (≥${minPct2}%)` : ''}`
          : null,
        filter3 !== 'ALL'
          ? `${filter3Label}${minPct3 > 0 ? ` (≥${minPct3}%)` : ''}`
          : null
      ].filter(Boolean);
      const mainTitle =
        activeFiltersList.length > 0
          ? activeFiltersList.join('  •  ')
          : 'All Census Farms (2021 Empirical Baseline)';

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 24px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(fitCanvasText(ctx, mainTitle, 1340), 36, 72);

      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 15px Inter, Segoe UI, Arial, sans-serif';
      const modeDesc = isMultiCriteria
        ? `Exact Fréchet–Hoeffding Bounds (${boundSortMode === 'max' ? 'Max Possible Overlap' : 'Guaranteed Min Overlap'})`
        : mapMetricMode === 'pct'
        ? 'Exact Published Share of Farms (%)'
        : 'Exact Published Farm Count (#)';
      ctx.fillText(
        `Scope: ${scopeTitleLabel} (${passingUnsuppressed.length} Qualifying Geographies)  •  Shaded by: ${modeDesc}`,
        36,
        104
      );

      const kpiW = 390;
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
      ctx.font = 'bold 12.5px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        isMultiCriteria ? 'EXACT JOINT BOUNDS IN QUALIFYING SCOPE' : 'EXACT PUBLISHED SHARE IN SCOPE',
        kpiX + 16,
        kpiY + 26
      );

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 26px Inter, Segoe UI, Arial, sans-serif';
      const kpiMainText = isMultiCriteria
        ? `${scopeSummary.minSharePct.toFixed(1)}%–${scopeSummary.maxSharePct.toFixed(1)}%`
        : `${scopeSummary.maxSharePct.toFixed(1)}%`;
      ctx.fillText(kpiMainText, kpiX + 16, kpiY + 62);

      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 13.5px Inter, Segoe UI, Arial, sans-serif';
      const kpiSubText = isMultiCriteria
        ? `(${scopeSummary.sumMin.toLocaleString()}–${scopeSummary.sumMax.toLocaleString()} farms)`
        : `(${scopeSummary.sumMax.toLocaleString()} of ${scopeSummary.sumTotal.toLocaleString()} farms)`;
      ctx.fillText(
        fitCanvasText(ctx, kpiSubText, kpiW - 195),
        kpiX + (isMultiCriteria ? 185 : 118),
        kpiY + 61
      );

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

      const isAllCanada = selectedProvince === 'ALL';

      const matchingFeatures = (
        geoJson?.features?.filter((f: any) => {
          const dguid = String(f.properties?.dguid || '');
          if (!itemByDguid.has(dguid)) return false;
          if (isAllCanada && FAR_NORTH_WILDERNESS_DGUIDS.has(dguid)) return false;
          return true;
        }) || []
      ).map((f: any) => clipGeoJsonFeatureToAgBelt(f, isAllCanada));

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
        labelTopN: number = 8
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
        const padX = 28;
        const padY = labelTopN > 0 ? 74 : 24;
        const availW = rect.w - padX * 2;
        const availH = rect.h - padY * 2;

        const lonSpan = Math.max(0.05, (maxLon - minLon) * cosLat);
        const latSpan = Math.max(0.05, maxLat - minLat);
        const scale = Math.min(availW / lonSpan, availH / latSpan);

        const drawnW = lonSpan * scale;
        const drawnH = latSpan * scale;
        const offsetX = rect.x + padX + (availW - drawnW) / 2;
        const offsetY = rect.y + padY + (availH - drawnH) / 2;

        const project = (lon: number, lat: number): [number, number] => {
          const x = offsetX + (lon - minLon) * cosLat * scale;
          const y = offsetY + (maxLat - lat) * scale;
          return [x, y];
        };

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
        ctx.clip();

        const prBaseFeatures = (
          geoJson?.features?.filter((f: any) => {
            if (f.properties?.level !== 'PR') return false;
            const uid = String(f.properties?.uid || '');
            if (selectedProvince !== 'ALL') return uid === selectedProvince;
            return !['60', '61', '62'].includes(uid);
          }) || []
        ).map((f: any) => clipGeoJsonFeatureToAgBelt(f, isAllCanada));

        for (const pf of prBaseFeatures) {
          const rings = extractRings(pf.geometry);
          ctx.fillStyle = '#DCE5EE';
          ctx.strokeStyle = '#94A3B8';
          ctx.lineWidth = 1.1;
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

        for (const f of featuresToDraw) {
          const dguid = f.properties?.dguid;
          const it = itemByDguid.get(dguid);
          const rings = extractRings(f.geometry);
          if (rings.length === 0) continue;

          ctx.fillStyle = it?.color || '#CBD5E1';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = isAllCanada ? 0.85 : 1.4;

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

        if (selectedLevel !== 'Provinces & Territories') {
          for (const pf of prBaseFeatures) {
            const rings = extractRings(pf.geometry);
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1.3;
            for (const ring of rings) {
              ctx.beginPath();
              ring.forEach(([lon, lat], i) => {
                const [px, py] = project(lon, lat);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
              });
              ctx.closePath();
              ctx.stroke();
            }
          }
        }

        if (labelTopN > 0) {
          const callouts: MapCalloutPoint[] = [];
          for (let i = 0; i < passingUnsuppressed.length && callouts.length < labelTopN; i++) {
            const r = passingUnsuppressed[i];
            if (!r.geo.lon || !r.geo.lat) continue;
            if (isAllCanada && FAR_NORTH_WILDERNESS_DGUIDS.has(r.geo.dguid)) continue;
            if (
              r.geo.lon < minLon ||
              r.geo.lon > maxLon ||
              r.geo.lat < minLat ||
              r.geo.lat > maxLat
            ) {
              continue;
            }
            const [cx, cy] = project(r.geo.lon, r.geo.lat);
            const val = getRowPrimaryVal(r);
            callouts.push({
              rank: i + 1,
              geo: r.geo,
              cx,
              cy,
              valueLabel: `${formatRowPctDisplay(r)} (${formatRowCountDisplay(r)})`,
              swatchColor: getQuintileColor(val, quintileBreaks, paletteMode)
            });
          }
          drawNonOverlappingMapCallouts(ctx, rect, callouts);
        }

        ctx.restore();
      };

      const isAllOntarioCounties =
        selectedProvince === '35' &&
        (selectedLevel === 'Counties / Census Divisions (CD)' ||
          selectedLevel === 'Census Agricultural Regions (CAR)') &&
        selectedCarId === 'ALL' &&
        matchingFeatures.length > 8;

      if (matchingFeatures.length > 0) {
        if (isAllOntarioCounties) {
          drawGeoJsonView(
            matchingFeatures,
            { x: mapBox.x, y: mapBox.y, w: mapBox.w, h: mapBox.h - 72 },
            { minLon: -83.6, maxLon: -74.2, minLat: 41.9, maxLat: 46.7 },
            8
          );

          const insetRect = { x: mapBox.x + 18, y: mapBox.y + 72, w: 345, h: 235 };
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
        } else if (isAllCanada) {
          drawGeoJsonView(
            matchingFeatures,
            { x: mapBox.x, y: mapBox.y, w: mapBox.w, h: mapBox.h - 72 },
            { minLon: -127.5, maxLon: -53.5, minLat: 41.8, maxLat: 56.5 },
            8
          );
        } else {
          drawGeoJsonView(
            matchingFeatures,
            { x: mapBox.x, y: mapBox.y, w: mapBox.w, h: mapBox.h - 72 },
            undefined,
            8
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
      ctx.font = 'bold 13.5px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText('MAP SCALE (LOW → HIGH):', mapBox.x + 18, legY + 35);

      const palette = MTM_PALETTES[paletteMode];
      const [, b1, b2, b3, b4, b5] = quintileBreaks;
      const fmtVal = (v: number) =>
        mapMetricMode === 'pct' ? `${v.toFixed(1)}%` : Math.round(v).toLocaleString();
      const rangeLabels = [
        `Lowest (≤ ${fmtVal(b1)})`,
        `Low–Mid (≤ ${fmtVal(b2)})`,
        `Middle (≤ ${fmtVal(b3)})`,
        `High–Mid (≤ ${fmtVal(b4)})`,
        `Highest (up to ${fmtVal(b5)})`
      ];

      let lx = mapBox.x + 195;
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = palette[i];
        ctx.beginPath();
        ctx.roundRect(lx, legY + 19, 20, 20, 4);
        ctx.fill();

        ctx.fillStyle = '#334155';
        ctx.font = '600 12px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(rangeLabels[i], lx + 25, legY + 34);
        lx += 178;
      }

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
        `TOP QUALIFYING GEOGRAPHIES (OF ${passingUnsuppressed.length})`,
        rankBox.x + 22,
        rankBox.y + 34
      );

      const thY = rankBox.y + 52;
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(rankBox.x + 2, thY, rankBox.w - 4, 34);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 11.5px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText('RANK', rankBox.x + 16, thY + 22);
      ctx.fillText('GEOGRAPHY', rankBox.x + 70, thY + 22);
      ctx.textAlign = 'right';
      ctx.fillText(isMultiCriteria ? 'JOINT FARMS' : 'FARMS', rankBox.x + 402, thY + 22);
      ctx.fillText(isMultiCriteria ? 'BOUNDS %' : '% SHARE', rankBox.x + 502, thY + 22);
      ctx.fillText('ALL FARMS', rankBox.x + 582, thY + 22);
      ctx.textAlign = 'left';

      const maxRows = Math.min(16, passingUnsuppressed.length);
      let ry = thY + 36;
      const rowH = 49;

      for (let i = 0; i < maxRows; i++) {
        const r = passingUnsuppressed[i];
        const val = getRowPrimaryVal(r);
        const swatch = getQuintileColor(val, quintileBreaks, paletteMode);

        if (i % 2 === 1) {
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(rankBox.x + 2, ry, rankBox.w - 4, rowH);
        }

        ctx.fillStyle = '#64748B';
        ctx.font = 'bold 12.5px Consolas, monospace';
        ctx.fillText(`#${i + 1}`, rankBox.x + 16, ry + 29);

        ctx.fillStyle = swatch;
        ctx.beginPath();
        ctx.roundRect(rankBox.x + 50, ry + 16, 12, 16, 3);
        ctx.fill();

        ctx.fillStyle = '#0F3D6E';
        ctx.font = 'bold 13px Inter, Segoe UI, Arial, sans-serif';
        const geoTitle = fitCanvasText(ctx, formatTableGeoTitle(r.geo.cleanName), 240);
        ctx.fillText(geoTitle, rankBox.x + 70, ry + 22);

        ctx.fillStyle = '#64748B';
        ctx.font = '500 10.5px Inter, Segoe UI, Arial, sans-serif';
        const geoSub = fitCanvasText(ctx, formatTableGeoSubtitle(r.geo), 240);
        ctx.fillText(geoSub, rankBox.x + 70, ry + 39);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 12.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(formatRowCountDisplay(r), rankBox.x + 402, ry + 29);

        ctx.fillStyle = '#328475';
        ctx.font = 'bold 12.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(formatRowPctDisplay(r), rankBox.x + 502, ry + 29);

        ctx.fillStyle = '#64748B';
        ctx.font = '500 12px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(r.totalFarms.toLocaleString(), rankBox.x + 582, ry + 29);
        ctx.textAlign = 'left';

        ry += rowH;
      }

      ctx.fillStyle = '#475569';
      ctx.font = '600 12.5px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        isMultiCriteria
          ? 'Source: Statistics Canada 2021 Census of Agriculture. Multi-criteria ranges report exact Fréchet–Hoeffding mathematical bounds (zero synthetic independence assumptions).'
          : 'Source: Statistics Canada — 2021 Census of Agriculture (Tables 32-10-0153-01 to 32-10-0445-01) & 2021 Digital Boundary Files. Generated via AgCensus IQ (OFA Edition).',
        36,
        1088
      );

      const slug = `${filter1 !== 'ALL' ? filter1 : 'all_farms'}_${
        filter3 !== 'ALL' ? filter3 : filter2 !== 'ALL' ? filter2 : 'exact'
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

  // Bottom-left tabbed empirical marginal distribution bars across the active scope
  const activeTabDistribution = useMemo(() => {
    const opts =
      activeChartTab === 1
        ? FILTER1_OPTIONS.slice(1)
        : activeChartTab === 2
        ? FILTER2_OPTIONS.slice(1)
        : FILTER3_OPTIONS.slice(1);

    const activeSel =
      activeChartTab === 1 ? filter1 : activeChartTab === 2 ? filter2 : filter3;

    return opts
      .map((opt) => {
        let sumFarms = 0;
        let pairedTotalFarms = 0;
        let supGeos = 0;

        for (const g of scopedGeos) {
          const totalC = readEmpiricalCell(dataset, g.id, 'total_farms');
          const optC = readEmpiricalCell(dataset, g.id, opt.charId);
          if (optC.val !== null && totalC.val !== null) {
            sumFarms += optC.val;
            pairedTotalFarms += totalC.val;
          } else if (optC.val === null && optC.status !== 'NA') {
            supGeos++;
          }
        }

        const pct =
          pairedTotalFarms > 0 ? Number(((sumFarms / pairedTotalFarms) * 100).toFixed(1)) : 0;
        return {
          ...opt,
          count: sumFarms,
          pct,
          supGeos,
          isSelected: opt.id === activeSel
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [activeChartTab, scopedGeos, dataset, filter1, filter2, filter3]);

  const focusedGeo = useMemo(
    () => dataset.geographies.find((g) => g.id === focusedGeoId) || null,
    [dataset.geographies, focusedGeoId]
  );

  // Available geographies for Official StatCan Empirical Cross-Tabulations (Canada + 10 Provinces)
  const crosstabGeoOptions = useMemo(() => {
    const ecKeys = new Set(Object.keys(dataset.empiricalCrosstabs || {}));
    return dataset.geographies
      .filter((g) => ecKeys.has(g.dguid))
      .sort((a, b) => {
        if (a.dguid === '2021A000235') return -1; // Ontario first
        if (b.dguid === '2021A000235') return 1;
        if (a.level === 'Country') return -1;
        if (b.level === 'Country') return 1;
        return a.cleanName.localeCompare(b.cleanName);
      });
  }, [dataset.geographies, dataset.empiricalCrosstabs]);

  const activeCrosstabGeo = useMemo(
    () =>
      crosstabGeoOptions.find((g) => g.dguid === crosstabGeoDguid) ||
      crosstabGeoOptions[0] ||
      null,
    [crosstabGeoOptions, crosstabGeoDguid]
  );

  const crosstabMatrix = useMemo(() => {
    const map = (activeCrosstabGeo && dataset.empiricalCrosstabs?.[activeCrosstabGeo.dguid]) || {};
    const cols = crosstabTopic === 'INC' ? CROSSTAB_INCOME_COLS : CROSSTAB_EDU_COLS;
    const totalColKey =
      crosstabTopic === 'INC'
        ? 'Total - Household income'
        : 'Total - Highest certificate, diploma or degree';

    const colTotals = cols.map((col) => {
      const k = `${crosstabTopic}|Total - Farm type|${col.key}`;
      return k in map ? map[k] : null;
    });
    const grandTotalKey = `${crosstabTopic}|Total - Farm type|${totalColKey}`;
    const grandTotal = grandTotalKey in map ? map[grandTotalKey] : null;

    const rows = CROSSTAB_FARM_TYPES.map((ft) => {
      const rowTotalKey = `${crosstabTopic}|${ft.key}|${totalColKey}`;
      const rowTotal = rowTotalKey in map ? map[rowTotalKey] : null;

      const cells = cols.map((col, cIdx) => {
        const cellKey = `${crosstabTopic}|${ft.key}|${col.key}`;
        const count = cellKey in map ? map[cellKey] : null;
        const rowPct =
          count !== null && rowTotal !== null && rowTotal > 0
            ? Number(((count / rowTotal) * 100).toFixed(1))
            : null;
        const colTotal = colTotals[cIdx];
        const colPct =
          count !== null && colTotal !== null && colTotal > 0
            ? Number(((count / colTotal) * 100).toFixed(1))
            : null;
        return { col, count, rowPct, colPct, isSuppressed: count === null };
      });

      const shareOfAll =
        rowTotal !== null && grandTotal !== null && grandTotal > 0
          ? Number(((rowTotal / grandTotal) * 100).toFixed(1))
          : null;

      return {
        ft,
        rowTotal,
        shareOfAll,
        cells
      };
    });

    return { cols, rows, grandTotal };
  }, [activeCrosstabGeo, dataset.empiricalCrosstabs, crosstabTopic]);

  const handleDownloadCrosstabCsv = () => {
    if (!activeCrosstabGeo) return;
    const unitLabel = crosstabTopic === 'INC' ? 'Census Farms' : 'Farm Operators';
    const tableCode = crosstabTopic === 'INC' ? '32-10-0401-01' : '32-10-0399-01';
    const headers = [
      'Geography',
      'DGUID',
      'StatCan Table',
      'Unit',
      'Farm Type (NAICS)',
      `Total (${unitLabel})`,
      ...crosstabMatrix.cols.flatMap((c) => [`${c.key} (${unitLabel})`, `${c.key} (Row %)`])
    ];

    const rows = crosstabMatrix.rows.map((r) => [
      activeCrosstabGeo.cleanName,
      activeCrosstabGeo.dguid,
      tableCode,
      unitLabel,
      r.ft.key,
      r.rowTotal !== null ? r.rowTotal : 'x',
      ...r.cells.flatMap((cell) => [
        cell.count !== null ? cell.count : 'x',
        cell.rowPct !== null ? `${cell.rowPct.toFixed(1)}%` : 'x'
      ])
    ]);

    downloadCsvFile(
      `OFA_StatCan_Crosstab_${tableCode}_${activeCrosstabGeo.cleanName.replace(/\s+/g, '_')}.csv`,
      headers,
      rows
    );
  };

  const selectedCrosstabRow = useMemo(
    () =>
      crosstabMatrix.rows.find((r) => r.ft.key === selectedCrosstabFarmType) ||
      crosstabMatrix.rows[0],
    [crosstabMatrix.rows, selectedCrosstabFarmType]
  );

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Top Analytical Mode Bar: Geography Screening & Exact Bounds vs Official StatCan Microdata Cross-Tabulations */}
      <div className="rounded-md bg-white px-3.5 py-2 shadow-xs border border-slate-200/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDrilldownView('screening')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              drilldownView === 'screening'
                ? 'bg-[#0F3D6E] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            <span>1. Multi-Criteria Geography Screening &amp; Exact Joint Bounds</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedProvince === 'ALL') {
                setCrosstabGeoDguid('2021A000011124');
              } else {
                const provMatch = crosstabGeoOptions.find(
                  (g) => g.provinceCode === selectedProvince
                );
                if (provMatch) setCrosstabGeoDguid(provMatch.dguid);
              }
              setDrilldownView('crosstabs');
            }}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              drilldownView === 'crosstabs'
                ? 'bg-[#0F3D6E] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Table2 className="w-3.5 h-3.5 text-[#328475]" />
            <span>
              2. Official StatCan Cross-Tabulations (32-10-0401-01 Income &amp; 32-10-0399-01 Education)
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <Info className="w-3.5 h-3.5 text-[#328475] shrink-0" />
          <span>
            {drilldownView === 'screening'
              ? '100% empirical StatCan counts, thresholds & exact Fréchet–Hoeffding mathematical bounds (`x`/`F` preserved).'
              : 'Official 2021 Census of Agriculture – Census of Population linked microdata cross-tabulations.'}
          </span>
        </div>
      </div>

      {drilldownView === 'crosstabs' ? (
        /* MODE 2: OFFICIAL STATCAN EMPIRICAL CROSS-TABULATIONS */
        <div className="flex-1 flex flex-col gap-2.5 min-h-0">
          {/* Controls Bar */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                  Province / Canada
                </label>
                <select
                  value={activeCrosstabGeo?.dguid || ''}
                  onChange={(e) => setCrosstabGeoDguid(e.target.value)}
                  className="rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-bold text-[#0F3D6E]"
                >
                  {crosstabGeoOptions.map((g) => (
                    <option key={g.dguid} value={g.dguid}>
                      {g.cleanName} ({g.level === 'Country' ? 'Canada' : 'Province'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                  Official Linked Cross-Tabulation Table
                </label>
                <div className="flex items-center rounded bg-slate-100 p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setCrosstabTopic('INC')}
                    className={`px-3 py-1 rounded cursor-pointer transition ${
                      crosstabTopic === 'INC' ? 'bg-[#0F3D6E] text-white' : 'text-slate-700'
                    }`}
                  >
                    Farm Type × Household Income (32-10-0401-01)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrosstabTopic('EDU')}
                    className={`px-3 py-1 rounded cursor-pointer transition ${
                      crosstabTopic === 'EDU' ? 'bg-[#0F3D6E] text-white' : 'text-slate-700'
                    }`}
                  >
                    Farm Type × Operator Education (32-10-0399-01)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                  Cell Metric
                </label>
                <div className="flex items-center rounded bg-slate-100 p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setCrosstabDisplayMode('rowPct')}
                    className={`px-2.5 py-1 rounded cursor-pointer transition ${
                      crosstabDisplayMode === 'rowPct' ? 'bg-[#328475] text-white' : 'text-slate-700'
                    }`}
                  >
                    Row % (Within Farm Type)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrosstabDisplayMode('count')}
                    className={`px-2.5 py-1 rounded cursor-pointer transition ${
                      crosstabDisplayMode === 'count' ? 'bg-[#328475] text-white' : 'text-slate-700'
                    }`}
                  >
                    Exact Counts
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrosstabDisplayMode('colPct')}
                    className={`px-2.5 py-1 rounded cursor-pointer transition ${
                      crosstabDisplayMode === 'colPct' ? 'bg-[#328475] text-white' : 'text-slate-700'
                    }`}
                  >
                    Col % (Within Bracket)
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadCrosstabCsv}
              className="inline-flex items-center gap-1.5 rounded bg-[#0F3D6E] hover:bg-[#164677] px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
              <span>Export Cross-Tab (Excel CSV)</span>
            </button>
          </div>

          {/* Main Cross-Tab Matrix + Selected Farm Type Profile */}
          <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
            <div className="col-span-12 lg:col-span-8 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#0F3D6E]">
                    {activeCrosstabGeo?.cleanName} —{' '}
                    {crosstabTopic === 'INC'
                      ? 'Farm Type (NAICS) × Total Household Income (Number of Census Farms)'
                      : 'Farm Type (NAICS) × Highest Educational Attainment (Number of Farm Operators)'}
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Source: Statistics Canada Table{' '}
                    {crosstabTopic === 'INC' ? '32-10-0401-01' : '32-10-0399-01'} (2021 Agriculture–Population
                    Linkage). Click any row to inspect its distribution on the right.
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-auto border border-slate-200 rounded">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#0F3D6E] text-white sticky top-0 z-10 text-[11px]">
                    <tr>
                      <th className="py-2 px-2.5 min-w-[200px]">Farm Type (NAICS)</th>
                      <th className="py-2 px-2 text-right bg-[#1D6C5E]">
                        Total ({crosstabTopic === 'INC' ? 'Farms' : 'Operators'})
                      </th>
                      {crosstabMatrix.cols.map((col) => (
                        <th key={col.key} className="py-2 px-2 text-right min-w-[96px]">
                          {col.shortLabel}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {crosstabMatrix.rows.map((row, rIdx) => {
                      const isTotalRow = rIdx === 0;
                      const isSelected = row.ft.key === selectedCrosstabRow?.ft.key;
                      return (
                        <tr
                          key={row.ft.key}
                          onClick={() => setSelectedCrosstabFarmType(row.ft.key)}
                          className={`cursor-pointer transition ${
                            isSelected
                              ? 'bg-[#0F3D6E]/10 font-bold'
                              : isTotalRow
                              ? 'bg-slate-50 font-bold'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2 px-2.5 text-[#0F3D6E] font-semibold">
                            {row.ft.shortLabel}
                          </td>
                          <td className="py-2 px-2 text-right font-extrabold text-[#0F3D6E] bg-[#EBF5F3]/60">
                            {row.rowTotal !== null ? row.rowTotal.toLocaleString() : 'x'}
                          </td>
                          {row.cells.map((cell) => {
                            if (cell.isSuppressed) {
                              return (
                                <td
                                  key={cell.col.key}
                                  className="py-2 px-2 text-right font-mono text-amber-700 font-bold"
                                  title="Suppressed by Statistics Canada to meet confidentiality requirements of the Statistics Act"
                                >
                                  x
                                </td>
                              );
                            }
                            const pctForHeat = cell.rowPct ?? 0;
                            const alpha = Math.min(0.28, Math.max(0.02, pctForHeat / 160));
                            return (
                              <td
                                key={cell.col.key}
                                className="py-2 px-2 text-right"
                                style={{
                                  backgroundColor:
                                    crosstabDisplayMode === 'rowPct'
                                      ? `rgba(50, 132, 117, ${alpha})`
                                      : undefined
                                }}
                              >
                                <div className="font-bold text-slate-800">
                                  {crosstabDisplayMode === 'count'
                                    ? (cell.count ?? 0).toLocaleString()
                                    : crosstabDisplayMode === 'rowPct'
                                    ? `${(cell.rowPct ?? 0).toFixed(1)}%`
                                    : `${(cell.colPct ?? 0).toFixed(1)}%`}
                                </div>
                                {crosstabDisplayMode !== 'count' && cell.count !== null && (
                                  <div className="text-[10px] text-slate-500 font-normal">
                                    ({cell.count.toLocaleString()})
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right 4 cols: Selected Farm Type Visual Distribution Breakdown */}
            <div className="col-span-12 lg:col-span-4 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col justify-between min-h-0">
              <div className="overflow-y-auto pr-1">
                <div className="pb-2 mb-3 border-b border-slate-100">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#328475]">
                    Selected Farm Type Breakdown ({activeCrosstabGeo?.cleanName})
                  </div>
                  <h4 className="text-sm font-extrabold text-[#0F3D6E] mt-0.5">
                    {selectedCrosstabRow?.ft.shortLabel}
                  </h4>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Total:{' '}
                    <strong className="text-slate-800">
                      {selectedCrosstabRow?.rowTotal !== null
                        ? selectedCrosstabRow?.rowTotal.toLocaleString()
                        : 'x'}
                    </strong>{' '}
                    {crosstabTopic === 'INC' ? 'linked census farms' : 'linked farm operators'}
                    {selectedCrosstabRow?.shareOfAll !== null &&
                      selectedCrosstabRow?.ft.key !== 'Total - Farm type' && (
                        <span> ({selectedCrosstabRow?.shareOfAll}% of provincial total)</span>
                      )}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {selectedCrosstabRow?.cells.map((cell) => (
                    <div
                      key={cell.col.key}
                      className="rounded bg-[#F8FAFC] p-2.5 border border-slate-200/80"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700">{cell.col.key}</span>
                        <span className="font-extrabold text-[#0F3D6E] shrink-0 ml-2">
                          {cell.isSuppressed
                            ? 'x (Suppressed)'
                            : `${(cell.rowPct ?? 0).toFixed(1)}% (${(cell.count ?? 0).toLocaleString()})`}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-200 rounded-xs overflow-hidden">
                        {!cell.isSuppressed && (
                          <div
                            className="h-full bg-[#328475] transition-all"
                            style={{ width: `${Math.min(100, Math.max(2, cell.rowPct ?? 0))}%` }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 text-[10px] text-slate-500 leading-relaxed">
                <strong>Empirical Linkage Note:</strong> Published directly from Statistics Canada&apos;s
                25% sample Census of Population – Census of Agriculture microdata linkage (random
                rounding to base 5). Sub-provincial county/township cross-tabulations are not
                released publicly by Statistics Canada due to confidentiality rules; use Mode 1 for
                county/township screening &amp; exact mathematical joint bounds.
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* MODE 1: MULTI-CRITERIA GEOGRAPHY SCREENING & EXACT JOINT BOUNDS */
        <>
          {/* Top 4-Filter Slicer Bar */}
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
                matchingCount={passingUnsuppressed.length}
              />
            </div>

            {/* Filter 1: Farm Type (NAICS) */}
            <div className="col-span-12 md:col-span-4 lg:col-span-3 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                    Filter 1 - Farm Type (NAICS)
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setFilter1('ALL');
                      setMinPct1(0);
                    }}
                    className="text-slate-400 hover:text-[#0F3D6E] cursor-pointer"
                    title="Reset Filter 1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mb-1.5">
                  Primary commodity specialization (32-10-0231-01)
                </p>
                <select
                  value={filter1}
                  onChange={(e) => {
                    setFilter1(e.target.value);
                    if (e.target.value === 'ALL') setMinPct1(0);
                  }}
                  className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E]"
                >
                  {FILTER1_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-600 font-medium">Min Share Threshold:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    disabled={filter1 === 'ALL'}
                    value={minPct1}
                    onChange={(e) =>
                      setMinPct1(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                    }
                    className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-right text-xs font-bold text-[#0F3D6E] disabled:opacity-40"
                  />
                  <span className="text-slate-500 font-semibold">%</span>
                </div>
              </div>
            </div>

            {/* Filter 2: Economic Revenue Class */}
            <div className="col-span-12 md:col-span-4 lg:col-span-3 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                    Filter 2 - Revenue Scale
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setFilter2('ALL');
                      setMinPct2(0);
                    }}
                    className="text-slate-400 hover:text-[#0F3D6E] cursor-pointer"
                    title="Reset Filter 2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mb-1.5">
                  Gross farm operating receipts class (32-10-0239-01)
                </p>
                <select
                  value={filter2}
                  onChange={(e) => {
                    setFilter2(e.target.value);
                    if (e.target.value === 'ALL') setMinPct2(0);
                  }}
                  className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E]"
                >
                  {FILTER2_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-600 font-medium">Min Share Threshold:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    disabled={filter2 === 'ALL'}
                    value={minPct2}
                    onChange={(e) =>
                      setMinPct2(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                    }
                    className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-right text-xs font-bold text-[#0F3D6E] disabled:opacity-40"
                  />
                  <span className="text-slate-500 font-semibold">%</span>
                </div>
              </div>
            </div>

            {/* Filter 3: Operating Structure / Practice / Succession */}
            <div className="col-span-12 md:col-span-4 lg:col-span-3 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                    Filter 3 - Structure &amp; Practice
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setFilter3('ALL');
                      setMinPct3(0);
                    }}
                    className="text-slate-400 hover:text-[#0F3D6E] cursor-pointer"
                    title="Reset Filter 3"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mb-1.5">
                  Legal structure, succession, tech &amp; stewardship
                </p>
                <select
                  value={filter3}
                  onChange={(e) => {
                    setFilter3(e.target.value);
                    if (e.target.value === 'ALL') setMinPct3(0);
                  }}
                  className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E]"
                >
                  {FILTER3_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-600 font-medium">Min Share Threshold:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    disabled={filter3 === 'ALL'}
                    value={minPct3}
                    onChange={(e) =>
                      setMinPct3(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                    }
                    className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-right text-xs font-bold text-[#0F3D6E] disabled:opacity-40"
                  />
                  <span className="text-slate-500 font-semibold">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Split Grid */}
          <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
            {/* BOTTOM-LEFT (5 cols): Empirical Marginal Distribution Bars */}
            <div className="col-span-12 lg:col-span-5 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                    Empirical Marginal Distribution
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Exact published counts across unsuppressed geographies in scope
                  </p>
                </div>
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
                      if (activeChartTab === 1) {
                        const next = item.id === filter1 ? 'ALL' : item.id;
                        setFilter1(next);
                        if (next === 'ALL') setMinPct1(0);
                      }
                      if (activeChartTab === 2) {
                        const next = item.id === filter2 ? 'ALL' : item.id;
                        setFilter2(next);
                        if (next === 'ALL') setMinPct2(0);
                      }
                      if (activeChartTab === 3) {
                        const next = item.id === filter3 ? 'ALL' : item.id;
                        setFilter3(next);
                        if (next === 'ALL') setMinPct3(0);
                      }
                    }}
                    className={`rounded p-2 cursor-pointer transition border ${
                      item.isSelected
                        ? 'bg-[#0F3D6E]/10 border-[#0F3D6E]'
                        : 'bg-[#F7F8FA] border-slate-100 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-800 truncate pr-2">
                        {item.label}
                      </span>
                      <span className="font-bold text-[#0F3D6E] shrink-0">
                        {item.pct.toFixed(1)}% ({item.count.toLocaleString()}
                        {item.supGeos > 0 ? ` • ${item.supGeos} sup.` : ''})
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

            {/* RIGHT (7 cols): Top (Summary / Bounds Card + Quintile Map) + Bottom (Ranking Table) */}
            <div className="col-span-12 lg:col-span-7 flex flex-col gap-2.5 min-h-0">
              {/* Top Half: Summary Card + Map */}
              <div className="grid grid-cols-12 gap-2.5 h-64">
                {/* Summary / Exact Joint Bounds Card */}
                <div className="col-span-12 sm:col-span-4 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col items-center justify-between text-center">
                  <div className="w-full text-left">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                      {isMultiCriteria ? 'Exact Joint Farm Bounds' : 'Exact Share of Farms'}
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      {isMultiCriteria
                        ? 'Fréchet–Hoeffding mathematical range'
                        : 'Published Statistics Canada count'}
                    </p>
                  </div>

                  {isMultiCriteria ? (
                    <div className="w-full my-1 rounded-md bg-[#F0FDF4] border border-[#328475]/30 p-2.5 text-left space-y-1.5">
                      <div>
                        <div className="text-[9.5px] font-bold uppercase text-slate-500">
                          Guaranteed Min → Max Possible
                        </div>
                        <div className="text-base font-extrabold text-[#0F3D6E]">
                          {scopeSummary.minSharePct.toFixed(1)}% –{' '}
                          {scopeSummary.maxSharePct.toFixed(1)}%
                        </div>
                        <div className="text-[11px] font-semibold text-[#1D6C5E]">
                          {scopeSummary.sumMin.toLocaleString()} –{' '}
                          {scopeSummary.sumMax.toLocaleString()} farms
                        </div>
                      </div>
                      <div className="text-[9.5px] text-slate-600 leading-snug">
                        Out of <strong>{scopeSummary.sumTotal.toLocaleString()}</strong> farms across{' '}
                        <strong>{passingUnsuppressed.length}</strong> qualifying unsuppressed areas.
                      </div>
                    </div>
                  ) : (
                    <div className="relative w-24 h-24 flex items-center justify-center my-0.5">
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
                          strokeDasharray={`${Math.min(100, scopeSummary.maxSharePct)}, 100`}
                          strokeWidth="4"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-base font-extrabold text-[#0F3D6E]">
                          {scopeSummary.maxSharePct}%
                        </span>
                        <span className="text-[9px] text-slate-400 uppercase font-semibold">
                          Exact
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="w-full rounded bg-[#F7F8FA] p-1.5 border border-slate-100 text-[10.5px] text-slate-600">
                    {!isMultiCriteria && (
                      <div>
                        <strong className="text-[#0F3D6E]">
                          {scopeSummary.sumMax.toLocaleString()}
                        </strong>{' '}
                        of {scopeSummary.sumTotal.toLocaleString()} farms
                      </div>
                    )}
                    <div className="text-[9.5px] text-slate-500">
                      {passingUnsuppressed.length} of {scopedGeos.length} areas qualify
                      {suppressedInScope.length > 0
                        ? ` • ${suppressedInScope.length} 'x'/'F'`
                        : ''}
                      {excludedByThresholdCount > 0
                        ? ` • ${excludedByThresholdCount} below min %`
                        : ''}
                    </div>
                  </div>
                </div>

                {/* Quintile Map Card */}
                <div className="col-span-12 sm:col-span-8 rounded-md bg-white p-2.5 shadow-xs border border-slate-200/90 flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <div className="flex items-center gap-0.5 rounded bg-slate-100 p-0.5 text-[11px] font-semibold">
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
                          % Share
                        </button>
                      </div>

                      {isMultiCriteria && (
                        <div
                          className="flex items-center gap-0.5 rounded bg-emerald-50 border border-emerald-200 p-0.5 text-[10.5px] font-semibold"
                          title="Choose whether map shading & ranking sort by the Fréchet Upper Bound (Max Possible Overlap = bottleneck criterion) or Fréchet Lower Bound (Guaranteed Minimum Overlap)"
                        >
                          <button
                            type="button"
                            onClick={() => setBoundSortMode('max')}
                            className={`px-1.5 py-0.5 rounded cursor-pointer ${
                              boundSortMode === 'max'
                                ? 'bg-[#328475] text-white'
                                : 'text-emerald-900'
                            }`}
                          >
                            Max Bound
                          </button>
                          <button
                            type="button"
                            onClick={() => setBoundSortMode('min')}
                            className={`px-1.5 py-0.5 rounded cursor-pointer ${
                              boundSortMode === 'min'
                                ? 'bg-[#328475] text-white'
                                : 'text-emerald-900'
                            }`}
                          >
                            Min Floor
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-0.5 rounded bg-slate-100 p-0.5 text-[11px] font-semibold">
                        <button
                          type="button"
                          onClick={() => setPaletteMode('standard')}
                          className={`px-2 py-0.5 rounded cursor-pointer ${
                            paletteMode === 'standard'
                              ? 'bg-[#0F3D6E] text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          Standard
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaletteMode('accessible')}
                          className={`px-2 py-0.5 rounded cursor-pointer ${
                            paletteMode === 'accessible'
                              ? 'bg-[#0F3D6E] text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          Accessible
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleDownloadHeatMapPng}
                        disabled={isExportingMap || passingUnsuppressed.length === 0}
                        className="inline-flex items-center gap-1 rounded bg-[#328475] hover:bg-[#276B5E] disabled:opacity-50 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs transition cursor-pointer"
                        title="Download high-resolution Heat Map & Top Rankings PNG"
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
                        <div className="flex flex-col w-full gap-1">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-700">
                            <span>Lowest: {formatDrilldownScaleVal(quintileBreaks[0])}</span>
                            <span className="text-slate-500 font-semibold">
                              Middle:{' '}
                              {formatDrilldownScaleVal(
                                (quintileBreaks[2] + quintileBreaks[3]) / 2
                              )}
                            </span>
                            <span>Highest: {formatDrilldownScaleVal(quintileBreaks[5])}</span>
                          </div>
                          <div className="flex items-center justify-between w-full gap-1.5">
                            {MTM_PALETTES[paletteMode].map((col, idx) => {
                              const tierLabels = [
                                'Lowest',
                                'Low–Mid',
                                'Middle',
                                'High–Mid',
                                'Highest'
                              ];
                              const lo = formatDrilldownScaleVal(quintileBreaks[idx]);
                              const hi = formatDrilldownScaleVal(quintileBreaks[idx + 1]);
                              return (
                                <div
                                  key={col}
                                  className="flex items-center gap-1"
                                  title={`${tierLabels[idx]} 20% of unsuppressed areas: ${lo} to ${hi}`}
                                >
                                  <span
                                    className="inline-block w-3 h-2.5 rounded-xs border border-slate-300/60"
                                    style={{ backgroundColor: col }}
                                  />
                                  <span className="text-[10px] font-medium text-slate-600">
                                    {tierLabels[idx]}
                                  </span>
                                </div>
                              );
                            })}
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
                      {isMultiCriteria
                        ? `Empirical Screening & Joint Bounds (${passingUnsuppressed.length} Qualifying${
                            !hasPositiveThreshold && suppressedInScope.length > 0
                              ? ` + ${suppressedInScope.length} Suppressed`
                              : ''
                          })`
                        : `Empirical Ranking (${passingUnsuppressed.length} Qualifying${
                            !hasPositiveThreshold && suppressedInScope.length > 0
                              ? ` + ${suppressedInScope.length} Suppressed`
                              : ''
                          })`}
                    </h3>
                    <span className="text-[10px] text-slate-500">
                      {isMultiCriteria
                        ? 'Exact Fréchet–Hoeffding joint bounds [Min–Max] + exact individual marginal shares • Double-click row for Snapshot'
                        : 'Click any row to focus map • Double-click to open Snapshot'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleDownloadHeatMapPng}
                      disabled={isExportingMap || passingUnsuppressed.length === 0}
                      className="inline-flex items-center gap-1 rounded border border-[#0F3D6E]/25 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 px-2.5 py-1 text-[11px] font-bold text-[#0F3D6E] transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[#328475]" />
                      <span>Heat Map (PNG)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadRankingCsv}
                      disabled={tableRows.length === 0}
                      className="inline-flex items-center gap-1 rounded bg-[#0F3D6E] hover:bg-[#164677] disabled:opacity-50 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs transition cursor-pointer"
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
                        {isMultiCriteria && (
                          <th className="py-1.5 px-2 text-right">Exact Marginal Shares</th>
                        )}
                        <th className="py-1.5 px-2 text-right">
                          {isMultiCriteria ? 'Joint Farms [Min–Max]' : 'Exact Farms'}
                        </th>
                        <th className="py-1.5 px-2 text-right">
                          {isMultiCriteria ? 'Joint % [Min–Max]' : '% Share'}
                        </th>
                        <th className="py-1.5 px-2.5 text-right">Total Farms</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tableRows.map((row, idx) => {
                        const marginalBadges: string[] = [];
                        if (filter1 !== 'ALL') {
                          marginalBadges.push(
                            `F1: ${row.c1Pct !== null ? `${row.c1Pct.toFixed(1)}%` : row.c1Status || 'x'}`
                          );
                        }
                        if (filter2 !== 'ALL') {
                          marginalBadges.push(
                            `F2: ${row.c2Pct !== null ? `${row.c2Pct.toFixed(1)}%` : row.c2Status || 'x'}`
                          );
                        }
                        if (filter3 !== 'ALL') {
                          marginalBadges.push(
                            `F3: ${row.c3Pct !== null ? `${row.c3Pct.toFixed(1)}%` : row.c3Status || 'x'}`
                          );
                        }

                        return (
                          <tr
                            key={row.geo.id}
                            onClick={() => setFocusedGeoId(row.geo.id)}
                            onDoubleClick={() => onSelectGeoForSnapshot(row.geo)}
                            className={`cursor-pointer transition ${
                              row.geo.id === focusedGeoId
                                ? 'bg-[#0F3D6E]/10 font-bold'
                                : row.isSuppressed
                                ? 'bg-slate-50/70 text-slate-500'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-1.5 px-2.5 font-mono text-slate-400">
                              {row.isSuppressed ? '—' : `#${idx + 1}`}
                            </td>
                            <td className="py-1.5 px-2.5 font-semibold text-[#0F3D6E]">
                              {row.geo.name}
                              {row.geo.ofaFederation && (
                                <span className="ml-1.5 text-[10px] font-normal text-[#328475]">
                                  ({row.geo.ofaFederation})
                                </span>
                              )}
                            </td>
                            {isMultiCriteria && (
                              <td className="py-1.5 px-2 text-right font-mono text-[10.5px] text-slate-600">
                                {marginalBadges.join(' • ')}
                              </td>
                            )}
                            <td className="py-1.5 px-2 text-right font-bold text-slate-800">
                              {row.isSuppressed ? (
                                <span className="text-amber-700 font-mono">
                                  {row.suppressedStatus || 'x'} (Suppressed)
                                </span>
                              ) : (
                                formatRowCountDisplay(row)
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-right font-bold text-[#328475]">
                              {row.isSuppressed ? (
                                <span className="text-amber-700 font-mono">
                                  {row.suppressedStatus || 'x'}
                                </span>
                              ) : (
                                formatRowPctDisplay(row)
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 text-right text-slate-500">
                              {row.totalFarms.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
