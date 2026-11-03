import React, { useMemo, useState } from 'react';
import { AgCensusDataset, CharacteristicMeta, GeoLevel, GeographyNode } from '../types/census';
import { formatDelta, formatMetricValue, getObservation, getRawNumber } from '../utils/analytics';
import { searchGeographiesSmart } from '../utils/laypersonSearch';
import {
  Check,
  CheckSquare,
  FileSpreadsheet,
  FileText,
  Layers,
  ListChecks,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Square,
  Trash2,
  X
} from 'lucide-react';

function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null>>
) {
  const escapeCsv = (val: string | number | null) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(','))
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface MultiAreaReportModalProps {
  dataset: AgCensusDataset;
  initialGeos: GeographyNode[];
  onClose: () => void;
}

interface ReportSection {
  title: string;
  subtitle: string;
  metricIds: string[];
}

export const REPORT_SECTIONS: ReportSection[] = [
  {
    title: '1. Executive Farm Structure, Land Use & Tenure',
    subtitle: 'Statistics Canada Tables 32-10-0231-01, 32-10-0153-01, 32-10-0233-01 & 32-10-0234-01',
    metricIds: [
      'total_farms',
      'land_total_acres',
      'avg_farm_size_acres',
      'land_crops_acres',
      'land_tame_pasture_acres',
      'land_natural_pasture_acres',
      'land_woodland_wetland_acres',
      'tenure_owned_acres',
      'tenure_rented_acres'
    ]
  },
  {
    title: '2. Farm Revenues, Operating Expenses & Capital Value',
    subtitle: 'Statistics Canada Tables 32-10-0237-01, 32-10-0240-01 & 32-10-0241-01',
    metricIds: [
      'rev_total_dollars',
      'avg_rev_per_farm',
      'exp_total_dollars',
      'avg_exp_per_farm',
      'avg_net_income_per_farm',
      'net_operating_margin_pct',
      'cap_total_dollars',
      'avg_capital_per_farm',
      'land_bldg_value_per_acre',
      'cap_machinery',
      'cap_livestock'
    ]
  },
  {
    title: '3. Farms by Industry Classification (NAICS)',
    subtitle: 'Statistics Canada Table 32-10-0231-01 (Number of Farms by Primary Commodity)',
    metricIds: [
      'naics_other_crop',
      'naics_hay',
      'naics_maple',
      'naics_cattle_total',
      'naics_beef',
      'naics_dairy',
      'naics_other_animal',
      'naics_horse',
      'naics_apiculture',
      'naics_oilseed_grain',
      'naics_sheep_goat',
      'naics_poultry_egg',
      'naics_hog',
      'naics_fruit_nut',
      'naics_vegetable',
      'naics_greenhouse'
    ]
  },
  {
    title: '4. Major Field Crops, Hay, Forage & Horticulture',
    subtitle: 'Statistics Canada Tables 32-10-0359-01, 32-10-0360-01 to 32-10-0363-01',
    metricIds: [
      'crop_total_acres',
      'crop_other_hay_acres',
      'crop_alfalfa_acres',
      'crop_corn_silage_acres',
      'crop_oats_acres',
      'crop_barley_acres',
      'crop_wheat_total_acres',
      'crop_soybeans_acres',
      'crop_corn_grain_acres',
      'crop_canola_acres',
      'crop_potatoes_acres',
      'fruit_total_acres',
      'veg_total_acres',
      'gh_total_sqft',
      'maple_total_taps'
    ]
  },
  {
    title: '5. Livestock, Poultry & Apiculture Inventories',
    subtitle: 'Statistics Canada Tables 32-10-0370-01 to 32-10-0378-01',
    metricIds: [
      'cattle_total_head',
      'cattle_beef_cows_head',
      'cattle_dairy_cows_head',
      'sheep_total_head',
      'pigs_total_head',
      'poultry_hens_chickens_birds',
      'bees_colonies'
    ]
  },
  {
    title: '6. Operator Demographics, Succession & Stewardship Practices',
    subtitle: 'Statistics Canada Tables 32-10-0381-01, 32-10-0244-01, 32-10-0367-01 & 32-10-0248-01',
    metricIds: [
      'op_total_operators',
      'op_avg_age',
      'op_age_under_35',
      'op_age_55_plus',
      'op_sex_female',
      'succ_written',
      'till_notill_acres',
      'bmp_cover_crops_farms',
      'bmp_rotational_grazing_farms',
      'energy_solar_farms',
      'ds_total_farms',
      'org_total_farms',
      'labour_total_workers'
    ]
  }
];

function buildDefaultTitle(geos: GeographyNode[]): string {
  if (geos.length === 0) {
    return 'Custom Multi-Area Agricultural Profile Report';
  }
  if (geos.length <= 4) {
    return `${geos.map((g) => g.cleanName).join(', ')} — Combined & Individual Agricultural Profile`;
  }
  return `${geos
    .slice(0, 3)
    .map((g) => g.cleanName)
    .join(', ')} + ${geos.length - 3} More Areas — Combined & Individual Agricultural Profile`;
}

export function computeCombinedMetric(
  dataset: AgCensusDataset,
  geos: GeographyNode[],
  meta: CharacteristicMeta
): {
  val2021: number | null;
  val2016: number | null;
  pctChange: number | null;
  pctOfBase: number | null;
  suppressedCount: number;
  isPartialSuppression: boolean;
  allSuppressed: boolean;
} {
  if (geos.length === 0) {
    return {
      val2021: null,
      val2016: null,
      pctChange: null,
      pctOfBase: null,
      suppressedCount: 0,
      isPartialSuppression: false,
      allSuppressed: false
    };
  }

  const sumRaw = (cid: string, idx: 0 | 1): { sum: number; validCount: number; supCount: number } => {
    let sum = 0;
    let validCount = 0;
    let supCount = 0;
    for (const g of geos) {
      const entry = dataset.values[g.id]?.[cid];
      const v = entry ? entry[idx] : null;
      if (typeof v === 'number' && !Number.isNaN(v)) {
        sum += v;
        validCount++;
      } else if (idx === 0) {
        // Matches getObservation() in analytics.ts: any null/missing 2021 value in the sparse census map is suppressed ('x')
        supCount++;
      }
    }
    return { sum, validCount, supCount };
  };

  if (meta.id === 'avg_farm_size_acres') {
    const acres21 = sumRaw('land_total_acres', 0);
    const farms21 = sumRaw('total_farms', 0);
    const acres16 = sumRaw('land_total_acres', 1);
    const farms16 = sumRaw('total_farms', 1);
    const val2021 = farms21.sum > 0 ? acres21.sum / farms21.sum : null;
    const val2016 = farms16.sum > 0 ? acres16.sum / farms16.sum : null;
    const pctChange =
      val2021 !== null && val2016 !== null && val2016 > 0
        ? ((val2021 - val2016) / val2016) * 100
        : null;
    return {
      val2021,
      val2016,
      pctChange,
      pctOfBase: null,
      suppressedCount: acres21.supCount,
      isPartialSuppression: acres21.supCount > 0 && acres21.validCount > 0,
      allSuppressed: acres21.supCount > 0 && acres21.validCount === 0
    };
  }

  if (meta.id === 'avg_rev_per_farm') {
    const rev21 = sumRaw('rev_total_dollars', 0);
    const farms21 = sumRaw('total_farms', 0);
    const rev16 = sumRaw('rev_total_dollars', 1);
    const farms16 = sumRaw('total_farms', 1);
    const val2021 = farms21.sum > 0 ? rev21.sum / farms21.sum : null;
    const val2016 = farms16.sum > 0 ? rev16.sum / farms16.sum : null;
    const pctChange =
      val2021 !== null && val2016 !== null && val2016 > 0
        ? ((val2021 - val2016) / val2016) * 100
        : null;
    return {
      val2021,
      val2016,
      pctChange,
      pctOfBase: null,
      suppressedCount: rev21.supCount,
      isPartialSuppression: rev21.supCount > 0 && rev21.validCount > 0,
      allSuppressed: rev21.supCount > 0 && rev21.validCount === 0
    };
  }

  if (meta.id === 'avg_exp_per_farm') {
    const exp21 = sumRaw('exp_total_dollars', 0);
    const farms21 = sumRaw('total_farms', 0);
    const exp16 = sumRaw('exp_total_dollars', 1);
    const farms16 = sumRaw('total_farms', 1);
    const val2021 = farms21.sum > 0 ? exp21.sum / farms21.sum : null;
    const val2016 = farms16.sum > 0 ? exp16.sum / farms16.sum : null;
    const pctChange =
      val2021 !== null && val2016 !== null && val2016 > 0
        ? ((val2021 - val2016) / val2016) * 100
        : null;
    return {
      val2021,
      val2016,
      pctChange,
      pctOfBase: null,
      suppressedCount: exp21.supCount,
      isPartialSuppression: exp21.supCount > 0 && exp21.validCount > 0,
      allSuppressed: exp21.supCount > 0 && exp21.validCount === 0
    };
  }

  if (meta.id === 'avg_net_income_per_farm') {
    const rev21 = sumRaw('rev_total_dollars', 0);
    const exp21 = sumRaw('exp_total_dollars', 0);
    const farms21 = sumRaw('total_farms', 0);
    const rev16 = sumRaw('rev_total_dollars', 1);
    const exp16 = sumRaw('exp_total_dollars', 1);
    const farms16 = sumRaw('total_farms', 1);
    const val2021 = farms21.sum > 0 ? (rev21.sum - exp21.sum) / farms21.sum : null;
    const val2016 = farms16.sum > 0 ? (rev16.sum - exp16.sum) / farms16.sum : null;
    const pctChange =
      val2021 !== null && val2016 !== null && val2016 > 0
        ? ((val2021 - val2016) / val2016) * 100
        : null;
    return {
      val2021,
      val2016,
      pctChange,
      pctOfBase: null,
      suppressedCount: rev21.supCount,
      isPartialSuppression: rev21.supCount > 0 && rev21.validCount > 0,
      allSuppressed: rev21.supCount > 0 && rev21.validCount === 0
    };
  }

  if (meta.id === 'net_operating_margin_pct') {
    const rev21 = sumRaw('rev_total_dollars', 0);
    const exp21 = sumRaw('exp_total_dollars', 0);
    const rev16 = sumRaw('rev_total_dollars', 1);
    const exp16 = sumRaw('exp_total_dollars', 1);
    const val2021 = rev21.sum > 0 ? ((rev21.sum - exp21.sum) / rev21.sum) * 100 : null;
    const val2016 = rev16.sum > 0 ? ((rev16.sum - exp16.sum) / rev16.sum) * 100 : null;
    const pctChange = val2021 !== null && val2016 !== null ? val2021 - val2016 : null;
    return {
      val2021,
      val2016,
      pctChange,
      pctOfBase: null,
      suppressedCount: rev21.supCount,
      isPartialSuppression: rev21.supCount > 0 && rev21.validCount > 0,
      allSuppressed: rev21.supCount > 0 && rev21.validCount === 0
    };
  }

  if (meta.id === 'avg_capital_per_farm') {
    const cap21 = sumRaw('cap_total_dollars', 0);
    const farms21 = sumRaw('total_farms', 0);
    const cap16 = sumRaw('cap_total_dollars', 1);
    const farms16 = sumRaw('total_farms', 1);
    const val2021 = farms21.sum > 0 ? cap21.sum / farms21.sum : null;
    const val2016 = farms16.sum > 0 ? cap16.sum / farms16.sum : null;
    const pctChange =
      val2021 !== null && val2016 !== null && val2016 > 0
        ? ((val2021 - val2016) / val2016) * 100
        : null;
    return {
      val2021,
      val2016,
      pctChange,
      pctOfBase: null,
      suppressedCount: cap21.supCount,
      isPartialSuppression: cap21.supCount > 0 && cap21.validCount > 0,
      allSuppressed: cap21.supCount > 0 && cap21.validCount === 0
    };
  }

  if (meta.id === 'land_bldg_value_per_acre') {
    let weightedSum21 = 0;
    let totalAcres21 = 0;
    let weightedSum16 = 0;
    let totalAcres16 = 0;
    for (const g of geos) {
      const v21 = getRawNumber(dataset, g.id, 'land_bldg_value_per_acre', 0);
      const ac21 = getRawNumber(dataset, g.id, 'land_total_acres', 0);
      if (v21 !== null && ac21 !== null && ac21 > 0) {
        weightedSum21 += v21 * ac21;
        totalAcres21 += ac21;
      }
      const v16 = getRawNumber(dataset, g.id, 'land_bldg_value_per_acre', 1);
      const ac16 = getRawNumber(dataset, g.id, 'land_total_acres', 1);
      if (v16 !== null && ac16 !== null && ac16 > 0) {
        weightedSum16 += v16 * ac16;
        totalAcres16 += ac16;
      }
    }
    const val2021 = totalAcres21 > 0 ? weightedSum21 / totalAcres21 : null;
    const val2016 = totalAcres16 > 0 ? weightedSum16 / totalAcres16 : null;
    const pctChange =
      val2021 !== null && val2016 !== null && val2016 > 0
        ? ((val2021 - val2016) / val2016) * 100
        : null;
    return {
      val2021,
      val2016,
      pctChange,
      pctOfBase: null,
      suppressedCount: 0,
      isPartialSuppression: false,
      allSuppressed: false
    };
  }

  if (meta.id === 'op_avg_age') {
    let weightedAge21 = 0;
    let totalOps21 = 0;
    for (const g of geos) {
      const age = getRawNumber(dataset, g.id, 'op_avg_age', 0);
      const ops =
        getRawNumber(dataset, g.id, 'op_total_operators', 0) ||
        getRawNumber(dataset, g.id, 'total_farms', 0);
      if (age !== null && ops !== null && ops > 0) {
        weightedAge21 += age * ops;
        totalOps21 += ops;
      }
    }
    const val2021 = totalOps21 > 0 ? weightedAge21 / totalOps21 : null;
    return {
      val2021,
      val2016: null,
      pctChange: null,
      pctOfBase: null,
      suppressedCount: 0,
      isPartialSuppression: false,
      allSuppressed: false
    };
  }

  const r21 = sumRaw(meta.id, 0);
  const r16 = sumRaw(meta.id, 1);
  const isPartialSuppression = r21.supCount > 0 && r21.validCount > 0;
  const allSuppressed = r21.supCount > 0 && r21.validCount === 0;
  const val2021 = r21.validCount > 0 ? r21.sum : null;
  const val2016 = r16.validCount > 0 ? r16.sum : null;

  // Only compute combined 2016-2021 % change when 2021 has no suppressed areas to avoid distorted partial deltas
  const pctChange =
    !isPartialSuppression && val2021 !== null && val2016 !== null && val2016 > 0
      ? ((val2021 - val2016) / val2016) * 100
      : null;

  let pctOfBase: number | null = null;
  if (meta.baseId && val2021 !== null) {
    const base21 = sumRaw(meta.baseId, 0);
    if (base21.sum > 0) {
      pctOfBase = (val2021 / base21.sum) * 100;
    }
  }

  return {
    val2021,
    val2016,
    pctChange,
    pctOfBase,
    suppressedCount: r21.supCount,
    isPartialSuppression,
    allSuppressed
  };
}

export const MultiAreaReportModal: React.FC<MultiAreaReportModalProps> = ({
  dataset,
  initialGeos,
  onClose
}) => {
  const [selectedGeos, setSelectedGeos] = useState<GeographyNode[]>(() => initialGeos);

  const [customTitleEdited, setCustomTitleEdited] = useState<boolean>(false);
  const [reportTitle, setReportTitle] = useState<string>(() => buildDefaultTitle(initialGeos));
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Interactive Area Checklist Drawer state (automatically shown when 0 areas are selected, or toggled by user)
  const [showAreaPicker, setShowAreaPicker] = useState<boolean>(() => initialGeos.length === 0);
  const [pickerLevel, setPickerLevel] = useState<GeoLevel>('Counties / Census Divisions (CD)');
  const [pickerProvince, setPickerProvince] = useState<string>('35');
  const [pickerRegionFilter, setPickerRegionFilter] = useState<string>('ALL');
  const [pickerFilterText, setPickerFilterText] = useState<string>('');

  // Keep reportTitle automatically synced with selectedGeos unless the user explicitly typed a custom title
  const updateSelectedGeos = (nextGeos: GeographyNode[], explicitTitle?: string) => {
    setSelectedGeos(nextGeos);
    if (explicitTitle) {
      setReportTitle(explicitTitle);
      setCustomTitleEdited(false);
    } else if (!customTitleEdited) {
      setReportTitle(buildDefaultTitle(nextGeos));
    }
  };

  const charById = useMemo(
    () => new Map(dataset.characteristics.map((c) => [c.id, c])),
    [dataset.characteristics]
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchGeographiesSmart(dataset.geographies, searchQuery, {
      provinceFilter: 'ALL',
      levelFilter: 'ALL',
      limit: 20
    });
  }, [dataset.geographies, searchQuery]);

  // Browseable checklist items for the visual Area Picker
  const browsableGeos = useMemo(() => {
    return dataset.geographies
      .filter((g) => {
        if (g.level !== pickerLevel) return false;
        if (pickerProvince !== 'ALL' && g.provinceCode !== pickerProvince) return false;
        if (pickerRegionFilter !== 'ALL' && !g.hierarchyPath.includes(pickerRegionFilter)) {
          return false;
        }
        if (pickerFilterText.trim()) {
          const q = pickerFilterText.toLowerCase();
          return (
            g.name.toLowerCase().includes(q) ||
            g.hierarchyPath.toLowerCase().includes(q) ||
            (g.ofaFederation && g.ofaFederation.toLowerCase().includes(q))
          );
        }
        return true;
      })
      .sort((a, b) => a.cleanName.localeCompare(b.cleanName));
  }, [dataset.geographies, pickerLevel, pickerProvince, pickerRegionFilter, pickerFilterText]);

  const toggleGeoSelection = (geo: GeographyNode) => {
    const exists = selectedGeos.some((g) => g.id === geo.id);
    if (exists) {
      updateSelectedGeos(selectedGeos.filter((g) => g.id !== geo.id));
    } else {
      updateSelectedGeos([...selectedGeos, geo]);
    }
  };

  // Quick Multi-Area Presets for OFA Staff
  const applyPreset = (presetKey: string) => {
    setShowAreaPicker(false);
    if (presetKey === 'nipissing_parry_sound_cd') {
      const ps = dataset.geographies.find((g) => g.dguid === '2021A00033549');
      const nip = dataset.geographies.find((g) => g.dguid === '2021A00033548');
      updateSelectedGeos(
        [ps, nip].filter(Boolean) as GeographyNode[],
        'Parry Sound & Nipissing Districts — Combined & Individual Agricultural Profile'
      );
    } else if (presetKey === 'east_nipissing_parry_sound_exact_ofa') {
      const ps = dataset.geographies.find((g) => g.dguid === '2021A00033549');
      const eastNipTwps = dataset.geographies.filter(
        (g) =>
          g.level === 'Townships / Subdivisions (CCS)' &&
          g.hierarchyPath.includes('Nipissing (CD)') &&
          !g.name.includes('West Nipissing')
      );
      updateSelectedGeos(
        [ps, ...eastNipTwps].filter(Boolean) as GeographyNode[],
        'East Nipissing-Parry Sound OFA Federation (Parry Sound District + East Nipissing Townships)'
      );
    } else if (presetKey === 'nipissing_parry_sound_all_townships') {
      const twps = dataset.geographies.filter(
        (g) =>
          g.level === 'Townships / Subdivisions (CCS)' &&
          (g.hierarchyPath.includes('Parry Sound (CD)') ||
            g.hierarchyPath.includes('Nipissing (CD)'))
      );
      updateSelectedGeos(
        twps,
        'East Nipissing & Parry Sound — Complete Township-by-Township Breakdown'
      );
    } else if (presetKey === 'haldimand_norfolk') {
      const hn = dataset.geographies.filter(
        (g) =>
          g.level === 'Townships / Subdivisions (CCS)' &&
          g.hierarchyPath.includes('Haldimand-Norfolk')
      );
      updateSelectedGeos(
        hn,
        'Haldimand County & Norfolk County — Combined & Individual Agricultural Profile'
      );
    } else if (presetKey === 'sdg') {
      const sdg = dataset.geographies.filter(
        (g) =>
          g.level === 'Townships / Subdivisions (CCS)' &&
          g.hierarchyPath.includes('Stormont, Dundas and Glengarry')
      );
      updateSelectedGeos(
        sdg,
        'Stormont, Dundas & Glengarry — Combined & Township Agricultural Profile'
      );
    } else if (presetKey === 'western_ont_core') {
      const ids = ['2021A00033540', '2021A00033531', '2021A00033523', '2021A00033532'];
      const gs = ids
        .map((id) => dataset.geographies.find((g) => g.dguid === id))
        .filter(Boolean) as GeographyNode[];
      updateSelectedGeos(
        gs,
        'Huron, Perth, Wellington & Oxford — Combined & County Breakdown Profile'
      );
    }
  };

  // Open a dedicated, publication-grade printable HTML/PDF report window and trigger Print/Save as PDF
  const handlePrintPdfReport = () => {
    if (selectedGeos.length === 0) return;
    const w = window.open('', '_blank', 'width=1200,height=900');
    if (!w) {
      window.print();
      return;
    }

    const areaListText = selectedGeos.map((g) => `${g.cleanName} (${g.dguid})`).join(' • ');

    let sectionsHtml = '';
    for (const sec of REPORT_SECTIONS) {
      let rowsHtml = '';
      for (const mid of sec.metricIds) {
        const meta = charById.get(mid);
        if (!meta) continue;
        const comb = computeCombinedMetric(dataset, selectedGeos, meta);
        const combDelta = formatDelta(comb.pctChange, meta.unit);

        let geoCellsHtml = '';
        for (const g of selectedGeos) {
          const obs = getObservation(dataset, g.id, meta);
          const d = formatDelta(obs.pctChange, meta.unit);
          const mainStr = formatMetricValue(obs.val2021, meta.unit, false, obs.status);
          const subStr =
            obs.pctOfBase !== null && meta.unit === 'FARMS'
              ? `${obs.pctOfBase.toFixed(1)}% of farms`
              : obs.pctChange !== null
              ? `${d.text} vs 2016`
              : '';
          geoCellsHtml += `
            <td style="text-align:right;padding:6px 8px;border:1px solid #CBD5E1;vertical-align:top;white-space:nowrap;">
              <div style="font-weight:700;color:#0F172A;font-size:11px;line-height:1.3;">${mainStr}</div>
              <div style="font-size:9.5px;color:#475569;line-height:1.25;margin-top:1px;min-height:12px;">${subStr || '&nbsp;'}</div>
            </td>
          `;
        }

        const rawCombFormatted = formatMetricValue(comb.val2021, meta.unit, false);
        const combMainStr = comb.allSuppressed
          ? 'x (Suppressed)'
          : comb.isPartialSuppression
          ? `≥ ${rawCombFormatted}*`
          : rawCombFormatted;

        const combSubStr = comb.allSuppressed
          ? `All ${selectedGeos.length} areas suppressed`
          : comb.isPartialSuppression
          ? `*Min. total (${comb.suppressedCount} of ${selectedGeos.length} areas suppressed)`
          : comb.pctOfBase !== null && meta.unit === 'FARMS'
          ? `${comb.pctOfBase.toFixed(1)}% of farms`
          : comb.pctChange !== null
          ? `${combDelta.text} vs 2016`
          : '';

        const combSubColor = comb.isPartialSuppression || comb.allSuppressed ? '#B45309' : '#1D6C5E';

        rowsHtml += `
          <tr>
            <td style="padding:6px 8px;border:1px solid #CBD5E1;font-weight:600;color:#1E293B;font-size:11px;vertical-align:top;white-space:nowrap;">
              <div style="line-height:1.3;">${meta.shortName}</div>
              <span style="display:block;font-size:9.5px;color:#334155;font-weight:500;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;margin-top:1px;">StatCan Table ${meta.statcanTable}</span>
            </td>
            <td style="text-align:right;padding:6px 10px;border:1px solid #328475;background:#EBF5F3;border-left:2px solid #328475;border-right:2px solid #328475;vertical-align:top;white-space:nowrap;">
              <div style="font-weight:800;color:#0F3D6E;font-size:11.5px;line-height:1.3;">${combMainStr}</div>
              <div style="font-size:9.5px;color:${combSubColor};font-weight:600;line-height:1.25;margin-top:1px;min-height:12px;">${combSubStr || '&nbsp;'}</div>
            </td>
            ${geoCellsHtml}
          </tr>
        `;
      }

      const geoHeadersHtml = selectedGeos
        .map(
          (g) => `
          <th style="text-align:right;padding:7px 8px;background:#0F3D6E;color:#FFFFFF;font-size:10.5px;font-weight:700;border:1px solid #1E3A8A;">
            ${g.cleanName}
            <span style="display:block;font-size:8.5px;font-weight:400;color:#CBD5E1;">
              ${g.level === 'Counties / Census Divisions (CD)' ? 'County / District (CD)' : 'Township (CCS)'}
            </span>
          </th>
        `
        )
        .join('');

      sectionsHtml += `
        <div class="report-section" style="margin-bottom:18px;">
          <div class="section-header-block" style="background:#F1F5F9;border-left:4px solid #0F3D6E;padding:6px 10px;margin-bottom:6px;">
            <div style="font-size:12.5px;font-weight:800;color:#0F3D6E;text-transform:uppercase;">${sec.title}</div>
            <div style="font-size:9.5px;color:#475569;">${sec.subtitle}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
            <thead>
              <tr>
                <th style="text-align:left;padding:7px 8px;background:#0F3D6E;color:#FFFFFF;font-size:10.5px;width:28%;border:1px solid #1E3A8A;">
                  Agricultural Characteristic
                </th>
                <th style="text-align:right;padding:7px 10px;background:#1D6C5E;color:#FFFFFF;font-size:11px;font-weight:800;border:1px solid #328475;border-left:2px solid #328475;border-right:2px solid #328475;">
                  COMBINED TOTAL (${selectedGeos.length} Areas)
                  <span style="display:block;font-size:8.5px;font-weight:400;color:#D1FAE5;">2021 Total & Change</span>
                </th>
                ${geoHeadersHtml}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${reportTitle}</title>
          <style>
            @page { size: landscape; margin: 10mm; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0F172A;
              margin: 0;
              padding: 16px;
              background: #FFFFFF;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            table { page-break-inside: auto; }
            thead { display: table-header-group; }
            tr, td, th {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .section-header-block {
              page-break-after: avoid !important;
              break-after: avoid !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            @media print {
              .no-print-bar { display: none !important; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="no-print-bar" style="background:#0F3D6E;color:#FFFFFF;padding:10px 16px;border-radius:6px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
            <div>
              <strong>OFA Printable Multi-Area Profile Ready</strong> — Select <em>"Save as PDF"</em> or your printer in the print dialog.
            </div>
            <button onclick="window.print()" style="background:#328475;color:#FFFFFF;border:none;padding:8px 16px;border-radius:4px;font-weight:700;cursor:pointer;">
              🖨️ Print / Save as PDF Now
            </button>
          </div>

          <div style="border-bottom:3px solid #0F3D6E;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end;">
            <div>
              <div style="font-size:10px;font-weight:800;color:#328475;letter-spacing:0.06em;text-transform:uppercase;">
                ONTARIO FEDERATION OF AGRICULTURE (OFA) • AGCENSUS IQ MULTI-AREA REPORT
              </div>
              <h1 style="margin:3px 0 4px 0;font-size:18px;font-weight:900;color:#0F3D6E;">
                ${reportTitle}
              </h1>
              <div style="font-size:10.5px;color:#475569;">
                <strong>Included Geographies (${selectedGeos.length}):</strong> ${areaListText}
              </div>
            </div>
            <div style="text-align:right;font-size:9.5px;color:#64748B;">
              <div><strong>Source:</strong> Statistics Canada Census of Agriculture (2021 & 2016)</div>
              <div>Official Tables 32-10-0153-01 to 32-10-0445-01</div>
            </div>
          </div>

          ${sectionsHtml}

          <div style="margin-top:12px;padding-top:8px;border-top:1px solid #CBD5E1;font-size:9px;color:#475569;display:flex;justify-content:space-between;gap:16px;">
            <span><strong>Methodology & Confidentiality Note:</strong> Combined totals marked with <strong>≥ [Value]*</strong> indicate a minimum unsuppressed floor where one or more constituent geographies are suppressed (<strong>x</strong>) by Statistics Canada under the <em>Statistics Act</em>. Percentage-unit metrics (such as Net Operating Margin %) report 2016–2021 shifts in percentage points (<strong>pts</strong>); all count, acreage, and dollar metrics report relative percentage growth (<strong>%</strong>).</span>
            <span style="white-space:nowrap;">Generated by AgCensus IQ (OFA Edition)</span>
          </div>

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

  // Export CSV for Excel
  const handleExportCsv = () => {
    if (selectedGeos.length === 0) return;
    const headers = [
      'Section',
      'Characteristic',
      'StatCan Table',
      'Unit',
      `COMBINED TOTAL (2021)`,
      `COMBINED TOTAL (2016)`,
      `COMBINED CHANGE`,
      ...selectedGeos.flatMap((g) => [
        `${g.cleanName} (2021)`,
        `${g.cleanName} (2016)`,
        `${g.cleanName} (Change)`
      ])
    ];

    const rows: Array<Array<string | number | null>> = [];
    for (const sec of REPORT_SECTIONS) {
      for (const mid of sec.metricIds) {
        const meta = charById.get(mid);
        if (!meta) continue;
        const comb = computeCombinedMetric(dataset, selectedGeos, meta);
        const deltaUnit = meta.unit === 'PERCENT' ? ' pts' : '%';
        const comb21Cell = comb.allSuppressed
          ? 'x (All Suppressed)'
          : comb.isPartialSuppression && comb.val2021 !== null
          ? `>= ${Math.round(comb.val2021 * 10) / 10} (Min. unsuppressed; ${comb.suppressedCount} area[s] 'x')`
          : comb.val2021 !== null
          ? Math.round(comb.val2021 * 10) / 10
          : 'N/A';

        const row: Array<string | number | null> = [
          sec.title,
          meta.name,
          meta.statcanTable,
          meta.unit,
          comb21Cell,
          comb.val2016 !== null ? Math.round(comb.val2016 * 10) / 10 : 'N/A',
          comb.pctChange !== null ? `${comb.pctChange.toFixed(1)}${deltaUnit}` : 'N/A'
        ];
        for (const g of selectedGeos) {
          const obs = getObservation(dataset, g.id, meta);
          row.push(
            obs.val2021 !== null ? obs.val2021 : obs.status === 'x' ? 'x (Suppressed)' : 'N/A',
            obs.val2016 !== null ? obs.val2016 : 'N/A',
            obs.pctChange !== null ? `${obs.pctChange.toFixed(1)}${deltaUnit}` : 'N/A'
          );
        }
        rows.push(row);
      }
    }

    downloadCsvFile('OFA_Combined_Multi_Area_Farm_Profile.csv', headers, rows);
  };

  const isPickerVisible = showAreaPicker || selectedGeos.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3">
      <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden">
        {/* Top Modal Header */}
        <div className="bg-[#0F3D6E] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#328475]" />
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wide">
                Custom Multi-Area Combined &amp; Individual Breakdown Report Builder
              </h2>
              <p className="text-[11px] text-sky-200">
                Combine any Counties, Districts, or Townships into a single Combined Total column alongside each Individual Area&apos;s breakdown
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedGeos.length === 0}
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded bg-white/15 hover:bg-white/25 disabled:opacity-40 px-3 py-1.5 text-xs font-bold text-white transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Excel (CSV)</span>
            </button>
            <button
              type="button"
              disabled={selectedGeos.length === 0}
              onClick={handlePrintPdfReport}
              className="inline-flex items-center gap-1.5 rounded bg-[#328475] hover:bg-[#276B5E] disabled:opacity-40 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-sm transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save as PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-white/10 hover:bg-white/20 p-1.5 text-white cursor-pointer"
              title="Close Report Builder"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Controls Bar: Presets + Add Area Search + Selected Areas Pills */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-extrabold text-[#0F3D6E] uppercase mr-1">
                1-Click OFA Presets:
              </span>
              <button
                type="button"
                onClick={() => applyPreset('nipissing_parry_sound_cd')}
                className="px-2.5 py-1 rounded bg-[#0F3D6E] text-white text-[11px] font-bold hover:bg-[#164677] cursor-pointer"
              >
                Parry Sound + Nipissing (Districts)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('east_nipissing_parry_sound_exact_ofa')}
                className="px-2.5 py-1 rounded bg-[#328475] text-white text-[11px] font-bold hover:bg-[#276B5E] cursor-pointer"
              >
                East Nipissing Twps + Parry Sound (Exact OFA Federation)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('nipissing_parry_sound_all_townships')}
                className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 text-[11px] font-semibold hover:bg-slate-100 cursor-pointer"
              >
                All 16 Nipissing &amp; Parry Sound Townships
              </button>
              <button
                type="button"
                onClick={() => applyPreset('haldimand_norfolk')}
                className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 text-[11px] font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Haldimand + Norfolk
              </button>
              <button
                type="button"
                onClick={() => applyPreset('sdg')}
                className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 text-[11px] font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Stormont, Dundas &amp; Glengarry
              </button>
              <button
                type="button"
                onClick={() => applyPreset('western_ont_core')}
                className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 text-[11px] font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Huron + Perth + Wellington + Oxford
              </button>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 items-center">
            {/* Report Title Input */}
            <div className="col-span-12 md:col-span-5 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={reportTitle}
                onChange={(e) => {
                  setReportTitle(e.target.value);
                  setCustomTitleEdited(true);
                }}
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-[#0F3D6E]"
                placeholder="Custom Report Title..."
              />
            </div>

            {/* Add Any Area Search Input + Visual Checklist Button */}
            <div className="col-span-12 md:col-span-7 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-[#328475] absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type to add any County, District, Township, or Town..."
                  className="w-full rounded border border-[#328475]/60 bg-white pl-8 pr-7 py-1.5 text-xs font-medium text-slate-800 focus:border-[#0F3D6E] focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {searchQuery.trim() && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-y-auto rounded-md bg-white shadow-xl border border-slate-300 divide-y divide-slate-100">
                    {searchResults.map(({ geo }) => {
                      const alreadyAdded = selectedGeos.some((g) => g.id === geo.id);
                      return (
                        <button
                          key={geo.id}
                          type="button"
                          onClick={() => {
                            if (!alreadyAdded) {
                              updateSelectedGeos([...selectedGeos, geo]);
                            }
                            setSearchQuery('');
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between text-xs cursor-pointer"
                        >
                          <div>
                            <span className="font-bold text-[#0F3D6E]">{geo.name}</span>
                            <span className="ml-2 text-[10px] text-slate-500">
                              {geo.hierarchyPath}
                            </span>
                          </div>
                          {alreadyAdded ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                              <Check className="w-3 h-3" /> Added
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#328475]">
                              <Plus className="w-3 h-3" /> Add to Report
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowAreaPicker((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold border transition cursor-pointer shrink-0 ${
                  isPickerVisible
                    ? 'bg-[#0F3D6E] text-white border-[#0F3D6E]'
                    : 'bg-white text-[#0F3D6E] border-[#0F3D6E]/30 hover:bg-slate-100'
                }`}
              >
                <ListChecks className="w-4 h-4" />
                <span>{isPickerVisible ? 'Hide Area Checklist' : 'Browse & Check Areas'}</span>
              </button>
            </div>
          </div>

          {/* Active Areas Pills + Prominent "Clear All Areas" Button */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-extrabold uppercase text-[#0F3D6E]">
                Areas in Report ({selectedGeos.length}):
              </span>
              {selectedGeos.length === 0 ? (
                <span className="text-xs italic text-amber-700 font-medium">
                  No areas selected — check the boxes below or type an area name above to build your custom report.
                </span>
              ) : (
                selectedGeos.map((g) => (
                  <span
                    key={g.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0F3D6E]/10 border border-[#0F3D6E]/25 px-2.5 py-0.5 text-[11px] font-bold text-[#0F3D6E]"
                  >
                    <span>{g.cleanName}</span>
                    <span className="text-[9px] font-normal text-slate-500">
                      ({g.level === 'Counties / Census Divisions (CD)' ? 'CD' : 'CCS'})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedGeos(selectedGeos.filter((item) => item.id !== g.id))
                      }
                      className="text-slate-500 hover:text-red-600 cursor-pointer ml-0.5"
                      title={`Remove ${g.cleanName}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Clear All Areas Button (Always visible when at least 1 area is selected) */}
            {selectedGeos.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  updateSelectedGeos([], 'Custom Multi-Area Agricultural Profile Report');
                  setShowAreaPicker(true);
                }}
                className="inline-flex items-center gap-1.5 rounded bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1 text-xs font-bold text-red-700 transition cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All Areas &amp; Start Fresh</span>
              </button>
            )}
          </div>

          {/* Interactive Visual Area Checklist Drawer (Makes picking custom Counties or Townships effortless) */}
          {isPickerVisible && (
            <div className="mt-2 rounded-md bg-white border-2 border-[#0F3D6E]/20 p-3 shadow-inner">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold uppercase text-[#0F3D6E]">
                    Check Any Areas Below to Add/Remove Them:
                  </span>
                  <span className="text-[11px] text-slate-500">
                    ({browsableGeos.length} available in current filter)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={pickerLevel}
                    onChange={(e) => setPickerLevel(e.target.value as GeoLevel)}
                    className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-[#0F3D6E]"
                  >
                    <option value="Counties / Census Divisions (CD)">
                      Counties &amp; Districts (CD)
                    </option>
                    <option value="Townships / Subdivisions (CCS)">
                      Townships &amp; Municipalities (CCS)
                    </option>
                    <option value="Census Agricultural Regions (CAR)">
                      Agricultural Regions (CAR)
                    </option>
                    <option value="Provinces & Territories">Provinces</option>
                  </select>

                  <select
                    value={pickerProvince}
                    onChange={(e) => {
                      setPickerProvince(e.target.value);
                      setPickerRegionFilter('ALL');
                    }}
                    className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
                  >
                    <option value="35">Ontario Only</option>
                    <option value="ALL">All Provinces</option>
                  </select>

                  {pickerProvince === '35' && (
                    <select
                      value={pickerRegionFilter}
                      onChange={(e) => setPickerRegionFilter(e.target.value)}
                      className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      <option value="ALL">All 5 Ontario Regions</option>
                      <option value="Northern Ontario">Northern Ontario</option>
                      <option value="Eastern Ontario">Eastern Ontario</option>
                      <option value="Central Ontario">Central Ontario</option>
                      <option value="Western Ontario">Western Ontario</option>
                      <option value="Southern Ontario">Southern Ontario</option>
                    </select>
                  )}

                  <input
                    type="text"
                    value={pickerFilterText}
                    onChange={(e) => setPickerFilterText(e.target.value)}
                    placeholder="Filter checklist..."
                    className="rounded border border-slate-300 px-2 py-1 text-xs w-36"
                  />

                  {selectedGeos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAreaPicker(false)}
                      className="rounded bg-[#328475] px-3 py-1 text-xs font-bold text-white hover:bg-[#276B5E] cursor-pointer"
                    >
                      Done Picking ({selectedGeos.length}) ✓
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 max-h-48 overflow-y-auto p-1">
                {browsableGeos.map((g) => {
                  const isChecked = selectedGeos.some((item) => item.id === g.id);
                  const farms = getRawNumber(dataset, g.id, 'total_farms', 0);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGeoSelection(g)}
                      className={`text-left px-2.5 py-1.5 rounded border text-xs flex items-center justify-between gap-1.5 transition cursor-pointer ${
                        isChecked
                          ? 'bg-[#0F3D6E] text-white border-[#0F3D6E] font-bold shadow-2xs'
                          : 'bg-slate-50/70 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isChecked ? (
                          <CheckSquare className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate" title={g.name}>
                          {g.cleanName}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] shrink-0 ${
                          isChecked ? 'text-sky-200' : 'text-slate-400'
                        }`}
                      >
                        {farms ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Main Scrollable Report Preview Table */}
        <div className="flex-1 overflow-auto p-4 space-y-5 bg-white">
          {selectedGeos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <Layers className="w-10 h-10 text-[#328475] mb-2 opacity-80" />
              <div className="text-base font-extrabold text-[#0F3D6E] mb-1">
                Ready to Build Your Custom Multi-Area Report
              </div>
              <p className="text-xs max-w-md mb-4">
                Check the boxes for any Counties, Districts, or Townships in the checklist above (or type a name in the search box) to generate a side-by-side &amp; combined profile.
              </p>
              <button
                type="button"
                onClick={() => applyPreset('nipissing_parry_sound_cd')}
                className="inline-flex items-center gap-1.5 rounded bg-[#0F3D6E] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#164677] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Parry Sound + Nipissing Example</span>
              </button>
            </div>
          ) : (
            REPORT_SECTIONS.map((sec) => (
              <div
                key={sec.title}
                className="border border-slate-200 rounded-md overflow-hidden shadow-2xs"
              >
                <div className="bg-slate-100 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#0F3D6E]">
                      {sec.title}
                    </h3>
                    <p className="text-[10px] text-slate-500">{sec.subtitle}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0F3D6E] text-white text-[11px]">
                        <th className="py-2 px-3 min-w-[210px] sticky left-0 bg-[#0F3D6E] z-10">
                          Agricultural Metric
                        </th>
                        <th className="py-2 px-3 text-right min-w-[160px] bg-[#1D6C5E] font-extrabold border-x-2 border-[#328475]">
                          <div>COMBINED TOTAL</div>
                          <div className="text-[9px] font-normal text-emerald-100">
                            All {selectedGeos.length} Selected Area{selectedGeos.length > 1 ? 's' : ''}
                          </div>
                        </th>
                        {selectedGeos.map((g) => (
                          <th key={g.id} className="py-2 px-3 text-right min-w-[135px]">
                            <div className="font-bold">{g.cleanName}</div>
                            <div className="text-[9px] font-normal text-sky-200">
                              {g.level === 'Counties / Census Divisions (CD)'
                                ? 'County / District'
                                : 'Township (CCS)'}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sec.metricIds.map((mid) => {
                        const meta = charById.get(mid);
                        if (!meta) return null;
                        const comb = computeCombinedMetric(dataset, selectedGeos, meta);
                        const combDelta = formatDelta(comb.pctChange, meta.unit);
                        const rawCombFormatted = formatMetricValue(comb.val2021, meta.unit, false);
                        const combDisplayStr = comb.allSuppressed
                          ? 'x (Suppressed)'
                          : comb.isPartialSuppression
                          ? `≥ ${rawCombFormatted}*`
                          : rawCombFormatted;

                        return (
                          <tr key={mid} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-semibold text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-100">
                              <div>{meta.shortName}</div>
                              <div className="text-[10px] text-slate-500 font-mono font-normal">
                                StatCan Table {meta.statcanTable}
                              </div>
                            </td>

                            {/* Combined Rollup Cell */}
                            <td className="py-2 px-3 text-right bg-[#EBF5F3]/80 border-x-2 border-[#328475]/40">
                              <div className="font-extrabold text-[#0F3D6E] text-xs">
                                {combDisplayStr}
                              </div>
                              <div className="text-[10px] font-semibold">
                                {comb.allSuppressed ? (
                                  <span className="text-amber-700">
                                    All {selectedGeos.length} areas suppressed
                                  </span>
                                ) : comb.isPartialSuppression ? (
                                  <span
                                    className="text-amber-700"
                                    title="Minimum unsuppressed floor: one or more selected geographies are suppressed ('x') by Statistics Canada for confidentiality."
                                  >
                                    *Min. total ({comb.suppressedCount} of {selectedGeos.length}{' '}
                                    areas suppressed)
                                  </span>
                                ) : comb.pctOfBase !== null && meta.unit === 'FARMS' ? (
                                  <span className="text-[#1D6C5E]">
                                    {comb.pctOfBase.toFixed(1)}% of farms
                                  </span>
                                ) : comb.pctChange !== null ? (
                                  <span className="text-[#1D6C5E]">{combDelta.text} vs 2016</span>
                                ) : null}
                              </div>
                            </td>

                            {/* Individual Area Breakdown Cells */}
                            {selectedGeos.map((g) => {
                              const obs = getObservation(dataset, g.id, meta);
                              const delta = formatDelta(obs.pctChange, meta.unit);
                              return (
                                <td key={g.id} className="py-2 px-3 text-right">
                                  <div className="font-bold text-slate-800">
                                    {formatMetricValue(obs.val2021, meta.unit, false, obs.status)}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {obs.pctOfBase !== null && meta.unit === 'FARMS' ? (
                                      <span className="text-[#328475] font-medium">
                                        {obs.pctOfBase.toFixed(1)}%
                                      </span>
                                    ) : obs.pctChange !== null ? (
                                      <span
                                        className={
                                          delta.isPositive
                                            ? 'text-emerald-700 font-medium'
                                            : !delta.isNeutral
                                            ? 'text-amber-700 font-medium'
                                            : 'text-slate-400'
                                        }
                                      >
                                        {delta.text} vs 16
                                      </span>
                                    ) : null}
                                  </div>
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
            ))
          )}
        </div>
      </div>
    </div>
  );
};
