import React, { useEffect, useMemo, useState } from 'react';
import { AgCensusDataset, CharacteristicMeta, GeographyNode, UnitType } from '../../types/census';
import {
  cleanCategoryLabel,
  cleanSubTopicLabel,
  downloadCsvFile,
  formatCleanDecimal,
  formatCleanPct,
  formatDelta,
  formatMetricValue,
  formatVisualLabel,
  getCharById,
  getObservation
} from '../../utils/analytics';
import { SingleGeographySlicer } from '../GeographySlicer';
import {
  ArrowDownUp,
  BarChart3,
  Download,
  HelpCircle,
  LineChart,
  PieChart,
  RotateCcw,
  Table2
} from 'lucide-react';

interface AgExplorerModuleProps {
  dataset: AgCensusDataset;
  selectedGeo: GeographyNode;
  onSelectGeo: (geo: GeographyNode) => void;
  initialCategory?: string;
  initialLayer2?: string;
  onOpenGeoLocator: () => void;
}

type TrendSeriesId =
  | 'farms'
  | 'areaAcres'
  | 'croplandAcres'
  | 'avgFarmAcres'
  | 'revenuesDollars'
  | 'capitalDollars';

const TREND_SERIES_DEFS: Array<{
  id: TrendSeriesId;
  label: string;
  unit: UnitType;
}> = [
  { id: 'farms', label: 'Census Farms', unit: 'FARMS' },
  { id: 'areaAcres', label: 'Farmland Acres', unit: 'ACRES' },
  { id: 'croplandAcres', label: 'Cropland Acres', unit: 'ACRES' },
  { id: 'avgFarmAcres', label: 'Avg Farm Size', unit: 'ACRES' },
  { id: 'revenuesDollars', label: 'Gross Receipts ($)', unit: 'DOLLARS' },
  { id: 'capitalDollars', label: 'Total Capital ($)', unit: 'DOLLARS' }
];

interface DisplayDistributionRow {
  id: string;
  visualLabel: string;
  meta: CharacteristicMeta;
  val2021: number | null;
  val2016: number | null;
  status: string | null;
  pctChange: number | null;
  pctOfBase: number | null;
  isConsolidatedTail?: boolean;
  tailItemCount?: number;
}

export const AgExplorerModule: React.FC<AgExplorerModuleProps> = ({
  dataset,
  selectedGeo,
  onSelectGeo,
  initialCategory,
  initialLayer2,
  onOpenGeoLocator
}) => {
  const categories = useMemo(() => {
    const s = new Set<string>();
    dataset.characteristics.forEach((c) => s.add(c.category));
    return Array.from(s);
  }, [dataset.characteristics]);

  const [selectedCategory, setSelectedCategory] = useState<string>(
    initialCategory || categories[0] || '1. Farm Types & Industry (NAICS)'
  );
  const [selectedLayer2, setSelectedLayer2] = useState<string>(initialLayer2 || '');
  const [viewMode, setViewMode] = useState<'bars' | 'pie' | 'trend' | 'table'>('bars');
  const [sortBy, setSortBy] = useState<'count' | 'id' | 'alpha'>('count');
  const [sortDesc, setSortDesc] = useState<boolean>(true);
  const [showBaseTooltip, setShowBaseTooltip] = useState<boolean>(false);
  const [expandMinorTail, setExpandMinorTail] = useState<boolean>(false);
  const [trendMetric, setTrendMetric] = useState<TrendSeriesId>('farms');

  useEffect(() => {
    if (initialCategory) setSelectedCategory(initialCategory);
    if (initialLayer2) setSelectedLayer2(initialLayer2);
  }, [initialCategory, initialLayer2]);

  const layer2Options = useMemo(() => {
    const s = new Set<string>();
    dataset.characteristics
      .filter(
        (c) => c.category === selectedCategory && c.layer1 === 'Characteristic Distribution'
      )
      .forEach((c) => s.add(c.layer2));
    return Array.from(s);
  }, [dataset.characteristics, selectedCategory]);

  useEffect(() => {
    if (layer2Options.length > 0 && !layer2Options.includes(selectedLayer2)) {
      setSelectedLayer2(layer2Options[0]);
    }
    setExpandMinorTail(false);
  }, [layer2Options, selectedLayer2]);

  // Raw empirical distribution rows (used for CSV export & full table view)
  const distributionRows = useMemo(() => {
    const chars = dataset.characteristics.filter(
      (c) =>
        c.category === selectedCategory &&
        c.layer1 === 'Characteristic Distribution' &&
        (!selectedLayer2 || c.layer2 === selectedLayer2)
    );

    const rows = chars.map((meta) => ({
      meta,
      obs: getObservation(dataset, selectedGeo.id, meta)
    }));

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'count') {
        const va = a.obs.val2021 ?? -1;
        const vb = b.obs.val2021 ?? -1;
        cmp = va - vb;
      } else if (sortBy === 'alpha') {
        cmp = formatVisualLabel(a.meta.shortName).localeCompare(
          formatVisualLabel(b.meta.shortName)
        );
      } else {
        cmp = a.meta.codeId - b.meta.codeId;
      }
      return sortDesc ? -cmp : cmp;
    });

    return rows;
  }, [dataset, selectedGeo.id, selectedCategory, selectedLayer2, sortBy, sortDesc]);

  // Reference Base info
  const baseInfo = useMemo(() => {
    const first = distributionRows[0];
    if (!first)
      return {
        desc: 'Total census farms',
        val: null,
        unit: 'FARMS' as const,
        table: '32-10-0231-01'
      };
    const baseMeta = getCharById(dataset, first.meta.baseId);
    return {
      desc: first.meta.baseDescription,
      val: first.obs.baseVal2021,
      unit: baseMeta?.unit ?? ('FARMS' as const),
      table: first.meta.statcanTable
    };
  }, [dataset, distributionRows]);

  const proportionSummary = useMemo(() => {
    const sumPct = distributionRows.reduce(
      (acc, r) => acc + (r.obs.pctOfBase !== null && r.obs.pctOfBase > 0 ? r.obs.pctOfBase : 0),
      0
    );
    const maxPct = Math.max(
      1,
      ...distributionRows.map((r) =>
        r.obs.pctOfBase !== null && r.obs.pctOfBase > 0 ? r.obs.pctOfBase : 0
      )
    );
    return {
      sumPct,
      maxPct,
      isNonAdditive: sumPct > 103
    };
  }, [distributionRows]);

  // Consolidate minor tail rows (<3% beyond top 6) for additive visual charts with 100% reconciliation
  const chartVisualResult = useMemo(() => {
    const mapped: DisplayDistributionRow[] = distributionRows.map((r) => ({
      id: r.meta.id,
      visualLabel: formatVisualLabel(r.meta.shortName),
      meta: r.meta,
      val2021: r.obs.val2021,
      val2016: r.obs.val2016,
      status: r.obs.status,
      pctChange: r.obs.pctChange,
      pctOfBase: r.obs.pctOfBase
    }));

    const canConsolidate =
      !proportionSummary.isNonAdditive &&
      sortBy === 'count' &&
      sortDesc &&
      mapped.filter((m) => (m.val2021 || 0) > 0).length >= 8;

    if (!canConsolidate) {
      return { rows: mapped, hiddenTailCount: 0 };
    }

    const headRows: DisplayDistributionRow[] = [];
    const tailRows: DisplayDistributionRow[] = [];

    mapped.forEach((row, idx) => {
      const pct = row.pctOfBase ?? 0;
      const val = row.val2021 ?? 0;
      if (val <= 0) {
        if (expandMinorTail) headRows.push(row);
        return;
      }
      if (idx < 6 || pct >= 3.0) {
        headRows.push(row);
      } else {
        tailRows.push(row);
      }
    });

    if (tailRows.length < 2) {
      return { rows: mapped, hiddenTailCount: 0 };
    }

    if (expandMinorTail) {
      return { rows: mapped, hiddenTailCount: tailRows.length };
    }

    const sum2021 = tailRows.reduce((acc, r) => acc + (r.val2021 || 0), 0);
    const allHave2016 = tailRows.every((r) => r.val2016 !== null);
    const sum2016 = allHave2016 ? tailRows.reduce((acc, r) => acc + (r.val2016 || 0), 0) : null;
    const sumPct = tailRows.reduce((acc, r) => acc + (r.pctOfBase || 0), 0);
    const tailPctChange =
      sum2016 !== null && sum2016 > 0
        ? Number((((sum2021 - sum2016) / sum2016) * 100).toFixed(1))
        : null;

    const otherRow: DisplayDistributionRow = {
      id: '__consolidated_other__',
      visualLabel: `Other (${tailRows.length} smaller categories)`,
      meta: tailRows[0].meta,
      val2021: sum2021,
      val2016: sum2016,
      status: null,
      pctChange: tailPctChange,
      pctOfBase: Number(sumPct.toFixed(2)),
      isConsolidatedTail: true,
      tailItemCount: tailRows.length
    };

    return {
      rows: [...headRows, otherRow],
      hiddenTailCount: tailRows.length
    };
  }, [distributionRows, proportionSummary.isNonAdditive, sortBy, sortDesc, expandMinorTail]);

  // Aggregate Statistics items for the right panel
  const aggregateStatsRows = useMemo(() => {
    const catAggs = dataset.characteristics.filter(
      (c) => c.category === selectedCategory && c.layer1 === 'Aggregate Statistics'
    );
    const coreIds = [
      'total_farms',
      'land_total_acres',
      'avg_farm_size_acres',
      'cap_total_dollars',
      'land_bldg_value_per_acre',
      'rev_total_dollars',
      'avg_rev_per_farm',
      'net_operating_margin_pct',
      'op_avg_age'
    ];
    const seen = new Set(catAggs.map((c) => c.id));
    const extras = coreIds
      .filter((id) => !seen.has(id))
      .map((id) => dataset.characteristics.find((c) => c.id === id)!)
      .filter(Boolean);

    return [...catAggs, ...extras].map((meta) => ({
      meta,
      obs: getObservation(dataset, selectedGeo.id, meta),
      isCategoryPrimary: seen.has(meta.id)
    }));
  }, [dataset, selectedGeo.id, selectedCategory]);

  // Historical series for Multi-Census Trend view (1976-2021)
  const historyPoints = useMemo(() => {
    return dataset.historical[selectedGeo.id] || [];
  }, [dataset.historical, selectedGeo.id]);

  const activeTrendDef =
    TREND_SERIES_DEFS.find((d) => d.id === trendMetric) || TREND_SERIES_DEFS[0];

  const validTrendPoints = useMemo(() => {
    return historyPoints
      .map((pt) => {
        const raw = (pt as any)[trendMetric];
        return {
          year: pt.year,
          val: typeof raw === 'number' && !Number.isNaN(raw) && raw > 0 ? raw : null
        };
      })
      .filter((p): p is { year: number; val: number } => p.val !== null);
  }, [historyPoints, trendMetric]);

  const maxBarValue = useMemo(() => {
    const vals = chartVisualResult.rows.map((r) => r.val2021 || 0);
    return Math.max(1, ...vals);
  }, [chartVisualResult.rows]);

  // Declarative 8-12 word claim headline for the active visual panel (data-visualization.md §5)
  const explorerClaimHeadline = useMemo(() => {
    if (viewMode === 'trend') {
      if (validTrendPoints.length >= 2) {
        const first = validTrendPoints[0];
        const last = validTrendPoints[validTrendPoints.length - 1];
        const pct = ((last.val - first.val) / first.val) * 100;
        const deltaStr = formatDelta(pct).text;
        return `${selectedGeo.cleanName} ${activeTrendDef.label.toLowerCase()} shifted ${deltaStr} from ${first.year} to ${last.year}`;
      }
      return `${selectedGeo.cleanName} multi-census trajectory across available Census waves`;
    }

    const topPositive = distributionRows
      .filter((r) => r.obs.val2021 !== null && r.obs.val2021 > 0)
      .sort((a, b) => (b.obs.val2021 || 0) - (a.obs.val2021 || 0))[0];

    if (topPositive) {
      const leadName = formatVisualLabel(topPositive.meta.shortName);
      if (topPositive.obs.pctOfBase !== null) {
        return `${leadName} leads ${selectedGeo.cleanName} at ${formatCleanPct(topPositive.obs.pctOfBase)} of reporting base`;
      }
      return `${leadName} leads ${selectedGeo.cleanName} at ${formatMetricValue(topPositive.obs.val2021, topPositive.meta.unit, true)}`;
    }
    return `${cleanSubTopicLabel(selectedLayer2)} distribution in ${selectedGeo.cleanName}`;
  }, [
    viewMode,
    validTrendPoints,
    selectedGeo.cleanName,
    activeTrendDef.label,
    distributionRows,
    selectedLayer2
  ]);

  const handleExportCsv = () => {
    const headers = [
      'Geography',
      'DGUID',
      'Category',
      'Sub-Topic',
      'Characteristic',
      '2021 Value',
      '2016 Value',
      '2016-2021 % Change',
      '% of Reference Base',
      'Unit',
      'StatCan Table'
    ];
    const rows = distributionRows.map((r) => [
      selectedGeo.name,
      selectedGeo.dguid,
      r.meta.category,
      r.meta.layer2,
      r.meta.shortName,
      r.obs.val2021 ?? (r.obs.status || 'NA'),
      r.obs.val2016 ?? '',
      r.obs.pctChange !== null
        ? `${formatCleanDecimal(r.obs.pctChange, 1)}${r.meta.unit === 'PERCENT' ? ' pts' : '%'}`
        : '',
      r.obs.pctOfBase !== null ? formatCleanPct(r.obs.pctOfBase) : '',
      r.meta.unit,
      r.meta.statcanTable
    ]);
    downloadCsvFile(
      `AgExplorer_${selectedGeo.cleanName.replace(/\s+/g, '_')}_${selectedLayer2.replace(/\s+/g, '_')}.csv`,
      headers,
      rows
    );
  };

  // Disciplined OFA + Neutral color helper for proportional shares (zero rainbow confetti!)
  const getSliceColor = (idx: number, isTail?: boolean): string => {
    if (isTail) return '#CBD5E1';
    if (idx === 0) return '#D7182A'; // OFA Crimson primary spotlight
    if (idx === 1) return '#334B58'; // OFA Pickled Bluewood secondary contrast
    if (idx === 2) return '#ECA842'; // OFA Tulip Tree tertiary accent
    const mutedRamp = ['#64748B', '#94A3B8', '#CBD5E1', '#E2E8F0'];
    return mutedRamp[(idx - 3) % mutedRamp.length];
  };

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2 rounded-md border border-slate-200/90 shadow-xs">
        <div>
          <h1 className="text-[15px] font-extrabold tracking-tight text-[#1E293B]">
            {explorerClaimHeadline}
          </h1>
          <p className="text-[11px] text-slate-500">
            {cleanCategoryLabel(selectedCategory)} — {cleanSubTopicLabel(selectedLayer2)} • Source:
            Statistics Canada Table <span className="font-semibold text-[#334B58]">{baseInfo.table}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="
              inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white
              px-2.5 py-1.5 text-xs font-semibold text-[#334B58] hover:bg-slate-50
              transition cursor-pointer
            "
          >
            <Download className="w-3.5 h-3.5 text-[#D7182A]" />
            <span>Export Table (CSV)</span>
          </button>
        </div>
      </div>

      {/* Main 3-Column Layout */}
      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        {/* LEFT COLUMN (3 cols): Geography Slicer + Hierarchical Variable Selector */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2.5">
          <SingleGeographySlicer
            title="Geography"
            geographies={dataset.geographies}
            selectedGeo={selectedGeo}
            onSelectGeo={onSelectGeo}
            onOpenGeoLocator={onOpenGeoLocator}
          />

          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                  Topic Selector
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(categories[0]);
                    setSortBy('count');
                    setSortDesc(true);
                  }}
                  title="Reset Topic Selection"
                  className="text-slate-400 hover:text-[#334B58] transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                1. Agricultural Topic Group
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="
                  mb-3 w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5
                  text-xs font-semibold text-[#334B58] focus:border-[#334B58] focus:outline-none
                "
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cleanCategoryLabel(cat)}
                  </option>
                ))}
              </select>

              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                2. Breakdown View
              </label>
              <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                {layer2Options.map((sub) => {
                  const active = sub === selectedLayer2;
                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setSelectedLayer2(sub)}
                      className={`
                        w-full text-left px-2.5 py-2 rounded text-xs font-medium transition cursor-pointer
                        flex items-center justify-between
                        ${
                          active
                            ? 'bg-[#334B58] text-white font-semibold shadow-xs'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }
                      `}
                    >
                      <span className="truncate">{cleanSubTopicLabel(sub)}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {
                          dataset.characteristics.filter(
                            (c) => c.category === selectedCategory && c.layer2 === sub
                          ).length
                        }
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Denominator Base Card */}
            <div className="mt-3 rounded bg-[#F8FAFC] p-2.5 border border-slate-200 text-[11px]">
              <div className="flex items-center justify-between font-bold text-[#334B58] mb-1">
                <span>Reference Denominator (Base)</span>
                <span className="font-mono text-[10px] text-[#D7182A]">{baseInfo.table}</span>
              </div>
              <p className="text-slate-600 leading-snug mb-1">{baseInfo.desc}</p>
              {baseInfo.val !== null && (
                <div className="font-extrabold text-slate-900">
                  Base = {formatMetricValue(baseInfo.val, baseInfo.unit)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN (6 cols): Visual Evidence Canvas */}
        <div className="col-span-12 lg:col-span-6 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          {/* Top Bar: Sub-Topic + Base Tooltip + Chart Type & Sort Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                  {viewMode === 'trend'
                    ? 'Multi-Census Structural Trajectory (1976–2021)'
                    : cleanSubTopicLabel(selectedLayer2)}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowBaseTooltip((p) => !p)}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  <span>Base</span>
                  <HelpCircle className="w-3 h-3 text-[#334B58]" />
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {viewMode === 'trend'
                  ? `Single-scale historical series for ${selectedGeo.cleanName}`
                  : `${selectedGeo.cleanName} • #1 lead highlighted in OFA Crimson`}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {/* View Mode Switcher */}
              <div className="flex items-center rounded border border-slate-200 bg-slate-50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('bars')}
                  className={`p-1.5 rounded cursor-pointer ${
                    viewMode === 'bars' ? 'bg-[#334B58] text-white' : 'text-slate-600'
                  }`}
                  title="Horizontal Bar Distribution"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('pie')}
                  className={`p-1.5 rounded cursor-pointer ${
                    viewMode === 'pie' ? 'bg-[#334B58] text-white' : 'text-slate-600'
                  }`}
                  title="Proportional Share Breakdown"
                >
                  <PieChart className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('trend')}
                  className={`p-1.5 rounded cursor-pointer ${
                    viewMode === 'trend' ? 'bg-[#334B58] text-white' : 'text-slate-600'
                  }`}
                  title="Multi-Census Historical Time-Series (1976-2021)"
                >
                  <LineChart className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded cursor-pointer ${
                    viewMode === 'table' ? 'bg-[#334B58] text-white' : 'text-slate-600'
                  }`}
                  title="Detailed Data Table with 2016 Deltas"
                >
                  <Table2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {viewMode !== 'trend' && (
                <>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700"
                  >
                    <option value="count">Sort: Count / Value</option>
                    <option value="id">Sort: Census Order</option>
                    <option value="alpha">Sort: Name (A-Z)</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortDesc((p) => !p)}
                    className="rounded border border-slate-200 bg-slate-50 p-1 text-slate-700 hover:bg-slate-100 cursor-pointer"
                    title={sortDesc ? 'Descending (click to toggle)' : 'Ascending (click to toggle)'}
                  >
                    <ArrowDownUp className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {showBaseTooltip && (
            <div className="mb-2.5 rounded bg-[#243640] p-2.5 text-xs text-white flex items-center justify-between">
              <div>
                <span className="font-bold">Denominator Base Definition: </span>
                <span>{baseInfo.desc}. </span>
                {baseInfo.val !== null && (
                  <span className="underline font-semibold">
                    2021 Value = {formatMetricValue(baseInfo.val, baseInfo.unit)}
                  </span>
                )}
              </div>
              <button onClick={() => setShowBaseTooltip(false)} className="text-slate-300 ml-2">
                ✕
              </button>
            </div>
          )}

          {/* VIEW 1: Publication-Grade Horizontal Bar Chart (#1 OFA Crimson spotlight, muted slate context, consolidated minor tail) */}
          {viewMode === 'bars' && (
            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
              {chartVisualResult.rows.map((row, idx) => {
                const val = row.val2021;
                const pct = row.pctOfBase;
                const widthPct =
                  val !== null && val > 0 ? Math.max(2, (val / maxBarValue) * 100) : 0;
                const isLead = idx === 0 && val !== null && val > 0 && !row.isConsolidatedTail;
                const delta = formatDelta(row.pctChange, row.meta.unit);

                return (
                  <div
                    key={row.id}
                    className={`rounded px-2 py-1.5 transition ${
                      row.isConsolidatedTail
                        ? 'bg-slate-50/80 border border-dashed border-slate-200'
                        : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span
                        className={
                          isLead
                            ? 'font-extrabold text-[#1E293B]'
                            : row.isConsolidatedTail
                              ? 'font-medium italic text-slate-600'
                              : 'font-medium text-slate-700'
                        }
                      >
                        {row.visualLabel}
                      </span>
                      <div className="flex items-center gap-2">
                        {row.pctChange !== null && (
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                              delta.isPositive
                                ? 'bg-teal-50 text-[#0F766E]'
                                : 'bg-amber-50 text-[#B45309]'
                            }`}
                          >
                            {delta.text} vs 2016
                          </span>
                        )}
                        <span
                          className={
                            isLead ? 'font-extrabold text-[#D7182A]' : 'font-bold text-[#334B58]'
                          }
                        >
                          {formatMetricValue(val, row.meta.unit, false, row.status)}
                        </span>
                        {pct !== null && (
                          <span className="text-slate-500 font-semibold w-14 text-right">
                            ({formatCleanPct(pct)})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="w-full h-4 bg-slate-100 rounded-xs overflow-hidden relative">
                      <div
                        className="h-full transition-all duration-300 rounded-xs"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: isLead
                            ? '#D7182A'
                            : row.isConsolidatedTail
                              ? '#94A3B8'
                              : '#CBD5E1'
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {chartVisualResult.hiddenTailCount > 0 && (
                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setExpandMinorTail((v) => !v)}
                    className="text-[11px] font-semibold text-[#334B58] hover:text-[#D7182A] underline cursor-pointer"
                  >
                    {expandMinorTail
                      ? `Consolidate ${chartVisualResult.hiddenTailCount} minor (<3%) categories into "Other"`
                      : `Show all ${distributionRows.length} individual categories`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: Disciplined Proportional Share / Multi-Response Gauges (Zero Rainbow Confetti) */}
          {viewMode === 'pie' && (
            <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3">
              {proportionSummary.isNonAdditive ? (
                <div className="rounded-md bg-[#FEF2F2] border border-[#D7182A]/20 px-3 py-2 text-[11px] text-slate-800">
                  <span className="font-bold text-[#D7182A]">
                    Multi-Response Category ({formatCleanPct(proportionSummary.sumPct)} combined):
                  </span>{' '}
                  Operations can report multiple items simultaneously in{' '}
                  <strong>{cleanSubTopicLabel(selectedLayer2)}</strong>. Individual 0–100% adoption
                  gauges are shown below instead of a summed bar.
                </div>
              ) : (
                <div className="w-full h-8 rounded-md overflow-hidden flex border border-slate-200 bg-slate-100">
                  {chartVisualResult.rows
                    .filter((r) => (r.pctOfBase || 0) > 0)
                    .map((r, i) => {
                      const pct = r.pctOfBase || 0;
                      const scaledWidth = (pct / Math.max(100, proportionSummary.sumPct)) * 100;
                      return (
                        <div
                          key={r.id}
                          style={{
                            width: `${scaledWidth}%`,
                            backgroundColor: getSliceColor(i, r.isConsolidatedTail)
                          }}
                          className="h-full border-r border-white/40 last:border-r-0"
                          title={`${r.visualLabel}: ${formatCleanPct(pct)}`}
                        />
                      );
                    })}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {chartVisualResult.rows.map((r, i) => {
                  const pct = r.pctOfBase !== null ? Math.max(0, Math.min(100, r.pctOfBase)) : 0;
                  const barColor = proportionSummary.isNonAdditive
                    ? i === 0
                      ? '#D7182A'
                      : '#94A3B8'
                    : getSliceColor(i, r.isConsolidatedTail);
                  return (
                    <div
                      key={r.id}
                      className="flex flex-col gap-1 p-2 rounded border border-slate-100 bg-[#F8FAFC] text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate pr-2">
                          <span
                            className="w-3 h-3 rounded-xs shrink-0"
                            style={{ backgroundColor: barColor }}
                          />
                          <span
                            className={`truncate ${
                              i === 0 && !r.isConsolidatedTail
                                ? 'font-bold text-slate-900'
                                : 'font-medium text-slate-700'
                            }`}
                          >
                            {r.visualLabel}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 ${
                            i === 0 && !r.isConsolidatedTail
                              ? 'font-extrabold text-[#D7182A]'
                              : 'font-bold text-[#334B58]'
                          }`}
                        >
                          {formatCleanPct(r.pctOfBase)}
                        </span>
                      </div>
                      {proportionSummary.isNonAdditive && (
                        <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: barColor
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 3: Publication-Grade 1976-2021 SVG Line Chart + Reference Table */}
          {viewMode === 'trend' && (
            <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-2.5">
              {/* Single-Scale Metric Switcher (never mixes incompatible units on one axis!) */}
              <div className="flex flex-wrap items-center gap-1">
                {TREND_SERIES_DEFS.map((def) => {
                  const active = def.id === trendMetric;
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => setTrendMetric(def.id)}
                      className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition ${
                        active
                          ? 'bg-[#D7182A] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {def.label}
                    </button>
                  );
                })}
              </div>

              {/* Clean Zero-Junk SVG Trajectory Chart */}
              {validTrendPoints.length >= 2 ? (
                (() => {
                  const svgW = 680;
                  const svgH = 195;
                  const padL = 62;
                  const padR = 98;
                  const padT = 22;
                  const padB = 26;
                  const plotW = svgW - padL - padR;
                  const plotH = svgH - padT - padB;

                  const maxRaw = Math.max(...validTrendPoints.map((p) => p.val));
                  const rawTarget = (maxRaw * 1.08 || 3) / 3;
                  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, rawTarget))));
                  const residual = rawTarget / mag;
                  const niceMult =
                    residual <= 1
                      ? 1
                      : residual <= 1.5
                        ? 1.5
                        : residual <= 2
                          ? 2
                          : residual <= 2.5
                            ? 2.5
                            : residual <= 3
                              ? 3
                              : residual <= 4
                                ? 4
                                : residual <= 5
                                  ? 5
                                  : residual <= 8
                                    ? 8
                                    : 10;
                  const step = niceMult * mag;
                  const yMax = step * 3;
                  const minYear = validTrendPoints[0].year;
                  const maxYear = validTrendPoints[validTrendPoints.length - 1].year;
                  const yearSpan = Math.max(1, maxYear - minYear);

                  const xFor = (yr: number) => padL + ((yr - minYear) / yearSpan) * plotW;
                  const yFor = (v: number) => padT + plotH - (v / yMax) * plotH;

                  const lineD = validTrendPoints
                    .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xFor(p.year).toFixed(1)},${yFor(p.val).toFixed(1)}`)
                    .join(' ');
                  const areaD = `${lineD} L${xFor(maxYear).toFixed(1)},${(padT + plotH).toFixed(1)} L${xFor(minYear).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

                  const firstPt = validTrendPoints[0];
                  const lastPt = validTrendPoints[validTrendPoints.length - 1];
                  const peakPt = validTrendPoints.reduce(
                    (best, cur) => (cur.val > best.val ? cur : best),
                    validTrendPoints[0]
                  );
                  const showPeakMarker =
                    peakPt.year !== firstPt.year && peakPt.year !== lastPt.year;

                  const ticks = [0, step, step * 2, yMax];

                  return (
                    <div className="rounded border border-slate-200 bg-white p-2">
                      <svg
                        viewBox={`0 0 ${svgW} ${svgH}`}
                        className="w-full h-auto block select-none"
                        role="img"
                        aria-label={`${selectedGeo.cleanName} ${activeTrendDef.label} trajectory`}
                      >
                        {/* 4 Minimal Reference Ticks (including crisp 0 baseline) */}
                        {ticks.map((tk, i) => {
                          const y = yFor(tk);
                          return (
                            <g key={i}>
                              <line
                                x1={padL}
                                x2={padL + plotW}
                                y1={y}
                                y2={y}
                                stroke={i === 0 ? '#94A3B8' : '#E2E8F0'}
                                strokeWidth={i === 0 ? 1.25 : 1}
                              />
                              <text
                                x={padL - 8}
                                y={y + 3.5}
                                textAnchor="end"
                                fontSize="10"
                                fill="#64748B"
                                fontFamily="Roboto, Arial, sans-serif"
                              >
                                {tk === 0
                                  ? activeTrendDef.unit === 'DOLLARS'
                                    ? '$0'
                                    : '0'
                                  : formatMetricValue(tk, activeTrendDef.unit, true)}
                              </text>
                            </g>
                          );
                        })}

                        {/* Subtle area fill & Pickled Bluewood trajectory line */}
                        <path d={areaD} fill="rgba(51, 75, 88, 0.07)" />
                        <path
                          d={lineD}
                          fill="none"
                          stroke="#334B58"
                          strokeWidth="2.75"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />

                        {/* X-axis sparse year ticks */}
                        {validTrendPoints.map((p, idx) => {
                          const isEdgeOrMid =
                            idx === 0 ||
                            idx === validTrendPoints.length - 1 ||
                            p.year === 1991 ||
                            p.year === 2006;
                          return (
                            <g key={p.year}>
                              {idx > 0 && idx < validTrendPoints.length - 1 && (
                                <circle
                                  cx={xFor(p.year)}
                                  cy={yFor(p.val)}
                                  r="2.6"
                                  fill="#FFFFFF"
                                  stroke="#334B58"
                                  strokeWidth="1.6"
                                />
                              )}
                              {isEdgeOrMid && (
                                <text
                                  x={xFor(p.year)}
                                  y={padT + plotH + 16}
                                  textAnchor="middle"
                                  fontSize="10.5"
                                  fontWeight={idx === validTrendPoints.length - 1 ? '700' : '500'}
                                  fill={idx === validTrendPoints.length - 1 ? '#1E293B' : '#64748B'}
                                  fontFamily="Roboto, Arial, sans-serif"
                                >
                                  {p.year}
                                </text>
                              )}
                            </g>
                          );
                        })}

                        {/* Start anchor dot + subtle label */}
                        <circle
                          cx={xFor(firstPt.year)}
                          cy={yFor(firstPt.val)}
                          r="4"
                          fill="#64748B"
                        />
                        <text
                          x={xFor(firstPt.year) + 6}
                          y={Math.max(13, yFor(firstPt.val) - 7)}
                          fontSize="10"
                          fontWeight="600"
                          fill="#475569"
                          fontFamily="Roboto, Arial, sans-serif"
                        >
                          {formatMetricValue(firstPt.val, activeTrendDef.unit, true)}
                        </text>

                        {/* Minimal unboxed peak marker when peak occurs mid-series */}
                        {showPeakMarker && (
                          <g>
                            <line
                              x1={xFor(peakPt.year)}
                              x2={xFor(peakPt.year)}
                              y1={yFor(peakPt.val) - 3}
                              y2={Math.max(12, yFor(peakPt.val) - 14)}
                              stroke="#94A3B8"
                              strokeDasharray="2,2"
                            />
                            <circle
                              cx={xFor(peakPt.year)}
                              cy={yFor(peakPt.val)}
                              r="3.8"
                              fill="#ECA842"
                              stroke="#FFFFFF"
                              strokeWidth="1.2"
                            />
                            <text
                              x={xFor(peakPt.year)}
                              y={Math.max(11, yFor(peakPt.val) - 16)}
                              textAnchor="middle"
                              fontSize="9.5"
                              fontWeight="700"
                              fill="#334B58"
                              fontFamily="Roboto, Arial, sans-serif"
                            >
                              Peak {peakPt.year}:{' '}
                              {formatMetricValue(peakPt.val, activeTrendDef.unit, true)}
                            </text>
                          </g>
                        )}

                        {/* 2021 Focal Endpoint Dot (OFA Crimson) + Direct End-of-Line Label */}
                        <circle
                          cx={xFor(lastPt.year)}
                          cy={yFor(lastPt.val)}
                          r="5"
                          fill="#D7182A"
                          stroke="#FFFFFF"
                          strokeWidth="1.8"
                        />
                        <text
                          x={xFor(lastPt.year) + 9}
                          y={yFor(lastPt.val) + 4}
                          fontSize="11.5"
                          fontWeight="800"
                          fill="#D7182A"
                          fontFamily="Roboto, Arial, sans-serif"
                        >
                          {formatMetricValue(lastPt.val, activeTrendDef.unit, true)}
                        </text>
                      </svg>
                    </div>
                  );
                })()
              ) : (
                <div className="rounded bg-slate-50 p-3 border border-slate-200 text-xs text-slate-500">
                  Multi-census historical points are published at Country, Province, CAR, and County
                  levels; select a County or Province to plot 1976–2021 curves.
                </div>
              )}

              {/* Compact Multi-Wave Reference Table */}
              <div className="flex-1 overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#334B58] text-white text-[11px] sticky top-0">
                    <tr>
                      <th className="py-1.5 px-2.5">Census Year</th>
                      <th className="py-1.5 px-2.5 text-right">Farms</th>
                      <th className="py-1.5 px-2.5 text-right">Farmland (Ac)</th>
                      <th className="py-1.5 px-2.5 text-right">Cropland (Ac)</th>
                      <th className="py-1.5 px-2.5 text-right">Avg Size</th>
                      <th className="py-1.5 px-2.5 text-right">Capital ($)</th>
                      <th className="py-1.5 px-2.5 text-right">Receipts ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyPoints.map((pt) => (
                      <tr key={pt.year} className="hover:bg-slate-50">
                        <td className="py-1.5 px-2.5 font-extrabold text-[#334B58]">{pt.year}</td>
                        <td className="py-1.5 px-2.5 text-right font-semibold">
                          {formatMetricValue(pt.farms, 'FARMS')}
                        </td>
                        <td className="py-1.5 px-2.5 text-right">
                          {formatMetricValue(pt.areaAcres, 'ACRES', true)}
                        </td>
                        <td className="py-1.5 px-2.5 text-right">
                          {formatMetricValue(pt.croplandAcres, 'ACRES', true)}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-medium text-slate-700">
                          {pt.avgFarmAcres ? `${formatCleanDecimal(pt.avgFarmAcres, 1)} ac` : '—'}
                        </td>
                        <td className="py-1.5 px-2.5 text-right">
                          {formatMetricValue(pt.capitalDollars, 'DOLLARS', true)}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-semibold text-[#D7182A]">
                          {formatMetricValue(pt.revenuesDollars, 'DOLLARS', true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW 4: Structured Data Table with 2021, 2016, Delta & Base Share */}
          {viewMode === 'table' && (
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 sticky top-0 text-[11px] text-slate-600">
                  <tr>
                    <th className="py-2 px-2.5">Characteristic</th>
                    <th className="py-2 px-2 text-right">2021 Value</th>
                    <th className="py-2 px-2 text-right">% of Base</th>
                    <th className="py-2 px-2 text-right">2016 Value</th>
                    <th className="py-2 px-2.5 text-right">2016–2021 Δ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {distributionRows.map((r) => {
                    const d = formatDelta(r.obs.pctChange, r.meta.unit);
                    return (
                      <tr key={r.meta.id} className="hover:bg-slate-50">
                        <td className="py-1.5 px-2.5 font-medium text-slate-800">
                          {formatVisualLabel(r.meta.shortName)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-bold text-[#334B58]">
                          {formatMetricValue(r.obs.val2021, r.meta.unit, false, r.obs.status)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-semibold text-slate-600">
                          {formatCleanPct(r.obs.pctOfBase)}
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-500">
                          {r.obs.val2016 !== null
                            ? formatMetricValue(r.obs.val2016, r.meta.unit)
                            : '—'}
                        </td>
                        <td
                          className={`py-1.5 px-2.5 text-right font-bold ${
                            r.obs.pctChange === null
                              ? 'text-slate-400'
                              : d.isPositive
                                ? 'text-[#0F766E]'
                                : 'text-[#B45309]'
                          }`}
                        >
                          {d.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (3 cols): Companion Aggregate Statistics */}
        <div className="col-span-12 lg:col-span-3 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="pb-2.5 mb-2.5 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
              Companion Benchmarks
            </h3>
            <p className="text-[11px] text-slate-400">
              Totals & per-farm averages for {selectedGeo.cleanName}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {aggregateStatsRows.map((item) => {
              const delta = formatDelta(item.obs.pctChange, item.meta.unit);
              return (
                <div
                  key={item.meta.id}
                  className={`rounded p-2.5 border ${
                    item.isCategoryPrimary
                      ? 'bg-[#FEF2F2] border-[#D7182A]/20'
                      : 'bg-[#F8FAFC] border-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-600">
                      {formatVisualLabel(item.meta.shortName)}
                    </span>
                    {item.isCategoryPrimary && (
                      <span className="rounded bg-[#D7182A] px-1.5 py-0.2 text-[9px] font-bold text-white uppercase">
                        Focus
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-base font-extrabold text-[#1E293B]">
                      {formatMetricValue(
                        item.obs.val2021,
                        item.meta.unit,
                        false,
                        item.obs.status
                      )}
                    </span>
                    {item.obs.pctChange !== null && (
                      <span
                        className={`text-[11px] font-bold ${
                          delta.isPositive ? 'text-[#0F766E]' : 'text-[#B45309]'
                        }`}
                      >
                        {delta.isPositive ? '▲' : '▼'} {delta.text} vs 2016
                      </span>
                    )}
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
