import React, { useEffect, useMemo, useState } from 'react';
import { AgCensusDataset, GeographyNode } from '../../types/census';
import { formatDelta, formatMetricValue, getObservation } from '../../utils/analytics';
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

  // Sync if user jumped from Snapshot '+' drawer
  useEffect(() => {
    if (initialCategory) setSelectedCategory(initialCategory);
    if (initialLayer2) setSelectedLayer2(initialLayer2);
  }, [initialCategory, initialLayer2]);

  // Available sub-topics (layer2) within the selected category for Characteristic Distribution
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
  }, [layer2Options, selectedLayer2]);

  // Distribution items for the center panel
  const distributionRows = useMemo(() => {
    const chars = dataset.characteristics.filter(
      (c) =>
        c.category === selectedCategory &&
        c.layer1 === 'Characteristic Distribution' &&
        (!selectedLayer2 || c.layer2 === selectedLayer2)
    );

    const rows = chars.map((meta) => {
      const obs = getObservation(dataset, selectedGeo.id, meta);
      return {
        meta,
        obs
      };
    });

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'count') {
        const va = a.obs.val2021 ?? -1;
        const vb = b.obs.val2021 ?? -1;
        cmp = va - vb;
      } else if (sortBy === 'alpha') {
        cmp = a.meta.shortName.localeCompare(b.meta.shortName);
      } else {
        cmp = a.meta.codeId - b.meta.codeId;
      }
      return sortDesc ? -cmp : cmp;
    });

    return rows;
  }, [dataset, selectedGeo.id, selectedCategory, selectedLayer2, sortBy, sortDesc]);

  // Aggregate Statistics items for the right panel
  const aggregateStatsRows = useMemo(() => {
    const catAggs = dataset.characteristics.filter(
      (c) => c.category === selectedCategory && c.layer1 === 'Aggregate Statistics'
    );
    // Always include core macro benchmarks below the category-specific aggregate stats
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

  // Reference Base info for the currently selected distribution group
  const baseInfo = useMemo(() => {
    const first = distributionRows[0];
    if (!first) return { desc: 'Total census farms', val: null, table: '32-10-0231-01' };
    return {
      desc: first.meta.baseDescription,
      val: first.obs.baseVal2021,
      unit:
        first.meta.baseId === 'land_total_acres' ||
        first.meta.baseId === 'crop_total_acres' ||
        first.meta.baseId === 'fruit_total_acres' ||
        first.meta.baseId === 'veg_total_acres' ||
        first.meta.baseId === 'tillage_prepared_acres'
          ? ('ACRES' as const)
          : first.meta.baseId === 'cap_total_dollars'
          ? ('DOLLARS' as const)
          : first.meta.baseId === 'cattle_total_head'
          ? ('HEAD' as const)
          : ('FARMS' as const),
      table: first.meta.statcanTable
    };
  }, [distributionRows]);

  // Historical series for Multi-Census Trend view
  const historyPoints = useMemo(() => {
    return dataset.historical[selectedGeo.id] || [];
  }, [dataset.historical, selectedGeo.id]);

  const maxBarValue = useMemo(() => {
    const vals = distributionRows.map((r) => r.obs.val2021 || 0);
    return Math.max(1, ...vals);
  }, [distributionRows]);

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
    const lines = [headers.join(',')];
    for (const r of distributionRows) {
      lines.push(
        [
          `"${selectedGeo.name}"`,
          selectedGeo.dguid,
          `"${r.meta.category}"`,
          `"${r.meta.layer2}"`,
          `"${r.meta.shortName}"`,
          r.obs.val2021 ?? 'x',
          r.obs.val2016 ?? '',
          r.obs.pctChange !== null ? `${r.obs.pctChange}%` : '',
          r.obs.pctOfBase !== null ? `${r.obs.pctOfBase}%` : '',
          r.meta.unit,
          r.meta.statcanTable
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AgExplorer_${selectedGeo.cleanName.replace(/\s+/g, '_')}_${selectedLayer2.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2 rounded-md border border-slate-200/90 shadow-xs">
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-[#0F3D6E] uppercase">
            AGRICULTURAL EXPLORER: {selectedGeo.name}
          </h1>
          <p className="text-[11px] text-slate-500">
            Deep-Dive Variable Distribution, Denominator Base & Aggregate Statistics • StatCan Table{' '}
            <span className="font-semibold text-[#0F3D6E]">{baseInfo.table}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="
              inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white
              px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E] hover:bg-slate-50
              transition cursor-pointer
            "
          >
            <Download className="w-3.5 h-3.5 text-[#328475]" />
            <span>Export Table (CSV)</span>
          </button>
        </div>
      </div>

      {/* Main 3-Column Layout matching MTM Demographic Explorer */}
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

          {/* Variable Hierarchy Slicer Card */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Variable Hierarchy
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(categories[0]);
                    setSortBy('count');
                    setSortDesc(true);
                  }}
                  title="Reset Variable Selection"
                  className="text-slate-400 hover:text-[#0F3D6E] transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Layer 0: Variable Group / Category */}
              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                1. Census Variable Group
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="
                  mb-3 w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5
                  text-xs font-semibold text-[#0F3D6E] focus:border-[#0F3D6E] focus:outline-none
                "
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              {/* Layer 2: Sub-Topic Breakdown */}
              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                2. Characteristic Breakdown
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
                            ? 'bg-[#0F3D6E] text-white font-semibold shadow-xs'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }
                      `}
                    >
                      <span className="truncate">{sub}</span>
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
            <div className="mt-3 rounded bg-[#F7F8FA] p-2.5 border border-slate-200 text-[11px]">
              <div className="flex items-center justify-between font-bold text-[#0F3D6E] mb-1">
                <span>Reference Denominator (Base)</span>
                <span className="font-mono text-[10px] text-[#328475]">{baseInfo.table}</span>
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

        {/* CENTER COLUMN (6 cols): Characteristic Distribution Panel */}
        <div className="col-span-12 lg:col-span-6 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          {/* Top Bar: Title + Base Tooltip + Chart Type & Sort Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Characteristic Distribution
                </h3>
                <button
                  type="button"
                  onClick={() => setShowBaseTooltip((p) => !p)}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  <span>Base</span>
                  <HelpCircle className="w-3 h-3 text-[#4E79A7]" />
                </button>
              </div>
              <p className="text-[11px] font-semibold text-[#328475] mt-0.5">{selectedLayer2}</p>
            </div>

            <div className="flex items-center gap-1.5">
              {/* View Mode Switcher */}
              <div className="flex items-center rounded border border-slate-200 bg-slate-50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('bars')}
                  className={`p-1.5 rounded cursor-pointer ${
                    viewMode === 'bars' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                  }`}
                  title="Horizontal Bar Distribution"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('pie')}
                  className={`p-1.5 rounded cursor-pointer ${
                    viewMode === 'pie' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                  }`}
                  title="Proportional Share Breakdown"
                >
                  <PieChart className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('trend')}
                  className={`p-1.5 rounded cursor-pointer ${
                    viewMode === 'trend' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                  }`}
                  title="Multi-Census Historical Time-Series (1976-2021)"
                >
                  <LineChart className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded cursor-pointer ${
                    viewMode === 'table' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                  }`}
                  title="Detailed Data Table with 2016 Deltas"
                >
                  <Table2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Sort Controls matching MTM Demographic Explorer */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700"
              >
                <option value="count">Sort: Count / Value</option>
                <option value="id">Sort: Census ID</option>
                <option value="alpha">Sort: Characteristic (A-Z)</option>
              </select>
              <button
                type="button"
                onClick={() => setSortDesc((p) => !p)}
                className="rounded border border-slate-200 bg-slate-50 p-1 text-slate-700 hover:bg-slate-100 cursor-pointer"
                title={sortDesc ? 'Descending (click to toggle)' : 'Ascending (click to toggle)'}
              >
                <ArrowDownUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {showBaseTooltip && (
            <div className="mb-2.5 rounded bg-[#071D49] p-2.5 text-xs text-white flex items-center justify-between">
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

          {/* VIEW 1: Horizontal Bar Chart matching MTM's exact Navy (#0F3D6E) & Warm Stone (#D7D7CB) bars */}
          {viewMode === 'bars' && (
            <div className="flex-1 overflow-y-auto pr-2 space-y-2.5">
              {distributionRows.map((row, idx) => {
                const val = row.obs.val2021;
                const pct = row.obs.pctOfBase;
                const widthPct = val !== null && val > 0 ? Math.max(2, (val / maxBarValue) * 100) : 0;
                const isTop3 = idx < 3 && val !== null && val > 0;
                const delta = formatDelta(row.obs.pctChange);

                return (
                  <div
                    key={row.meta.id}
                    className="group rounded p-1.5 hover:bg-slate-50 transition border border-transparent hover:border-slate-100"
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-800">{row.meta.shortName}</span>
                      <div className="flex items-center gap-2">
                        {row.obs.pctChange !== null && (
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                              delta.isPositive
                                ? 'bg-emerald-50 text-[#0F9D58]'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {delta.text} vs 2016
                          </span>
                        )}
                        <span className="font-extrabold text-[#0F3D6E]">
                          {formatMetricValue(val, row.meta.unit, false, row.obs.status)}
                        </span>
                        {pct !== null && (
                          <span className="text-slate-500 font-semibold w-14 text-right">
                            ({pct.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="w-full h-4 bg-slate-100 rounded-xs overflow-hidden relative">
                      <div
                        className="h-full transition-all duration-300 rounded-xs"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: isTop3 ? '#0F3D6E' : '#D7D7CB'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 2: Proportional Share / Donut Summary View */}
          {viewMode === 'pie' && (
            <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3">
              <div className="w-full h-8 rounded-md overflow-hidden flex border border-slate-200">
                {distributionRows
                  .filter((r) => (r.obs.pctOfBase || 0) > 0)
                  .map((r, i) => {
                    const colors = [
                      '#0F3D6E',
                      '#328475',
                      '#4E79A7',
                      '#F28E2B',
                      '#59A14F',
                      '#E15759',
                      '#76B7B2',
                      '#EDC948',
                      '#B07AA1',
                      '#D7D7CB'
                    ];
                    return (
                      <div
                        key={r.meta.id}
                        style={{
                          width: `${r.obs.pctOfBase}%`,
                          backgroundColor: colors[i % colors.length]
                        }}
                        className="h-full"
                        title={`${r.meta.shortName}: ${r.obs.pctOfBase?.toFixed(1)}%`}
                      />
                    );
                  })}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {distributionRows.map((r, i) => {
                  const colors = [
                    '#0F3D6E',
                    '#328475',
                    '#4E79A7',
                    '#F28E2B',
                    '#59A14F',
                    '#E15759',
                    '#76B7B2',
                    '#EDC948',
                    '#B07AA1',
                    '#D7D7CB'
                  ];
                  return (
                    <div
                      key={r.meta.id}
                      className="flex items-center justify-between p-2 rounded border border-slate-100 bg-[#F7F8FA] text-xs"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span
                          className="w-3 h-3 rounded-xs shrink-0"
                          style={{ backgroundColor: colors[i % colors.length] }}
                        />
                        <span className="truncate font-medium text-slate-700">
                          {r.meta.shortName}
                        </span>
                      </div>
                      <span className="font-bold text-[#0F3D6E] shrink-0">
                        {r.obs.pctOfBase !== null ? `${r.obs.pctOfBase.toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 3: Multi-Census Historical Time-Series (1976-2021) */}
          {viewMode === 'trend' && (
            <div className="flex-1 overflow-y-auto pr-2 flex flex-col justify-between">
              <div className="mb-2 rounded bg-slate-50 p-2.5 border border-slate-200 text-xs text-slate-600">
                <span className="font-bold text-[#0F3D6E]">
                  Multi-Census Structural Trajectory ({selectedGeo.name}):
                </span>{' '}
                Empirical Statistics Canada historical series tracking farm consolidation, total farmland area, cropland expansion, and capital growth across Census cycles.
              </div>

              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#0F3D6E] text-white text-[11px]">
                    <tr>
                      <th className="py-2 px-2.5">Census Year</th>
                      <th className="py-2 px-2.5 text-right">Total Farms</th>
                      <th className="py-2 px-2.5 text-right">Total Area (Acres)</th>
                      <th className="py-2 px-2.5 text-right">Cropland (Acres)</th>
                      <th className="py-2 px-2.5 text-right">Avg Farm Size</th>
                      <th className="py-2 px-2.5 text-right">Total Capital ($)</th>
                      <th className="py-2 px-2.5 text-right">Gross Receipts ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyPoints.map((pt) => (
                      <tr key={pt.year} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5 font-extrabold text-[#0F3D6E]">{pt.year}</td>
                        <td className="py-2 px-2.5 text-right font-semibold">
                          {formatMetricValue(pt.farms, 'FARMS')}
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          {formatMetricValue(pt.areaAcres, 'ACRES', true)}
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          {formatMetricValue(pt.croplandAcres, 'ACRES', true)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-medium text-[#328475]">
                          {pt.avgFarmAcres ? `${pt.avgFarmAcres} ac` : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          {formatMetricValue(pt.capitalDollars, 'DOLLARS', true)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-semibold text-slate-800">
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
                    const d = formatDelta(r.obs.pctChange);
                    return (
                      <tr key={r.meta.id} className="hover:bg-slate-50">
                        <td className="py-1.5 px-2.5 font-medium text-slate-800">
                          {r.meta.shortName}
                        </td>
                        <td className="py-1.5 px-2 text-right font-bold text-[#0F3D6E]">
                          {formatMetricValue(r.obs.val2021, r.meta.unit, false, r.obs.status)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-semibold text-slate-600">
                          {r.obs.pctOfBase !== null ? `${r.obs.pctOfBase.toFixed(1)}%` : '—'}
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
                              ? 'text-[#0F9D58]'
                              : 'text-amber-600'
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

        {/* RIGHT COLUMN (3 cols): Aggregate Statistics Panel matching MTM Demographic Explorer */}
        <div className="col-span-12 lg:col-span-3 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="pb-2.5 mb-2.5 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
              Aggregate Statistics
            </h3>
            <p className="text-[11px] text-slate-400">
              Averages, medians & totals for {selectedGeo.cleanName}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {aggregateStatsRows.map((item) => {
              const delta = formatDelta(item.obs.pctChange);
              return (
                <div
                  key={item.meta.id}
                  className={`rounded p-2.5 border ${
                    item.isCategoryPrimary
                      ? 'bg-[#0F3D6E]/5 border-[#0F3D6E]/20'
                      : 'bg-[#F7F8FA] border-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-600">
                      {item.meta.shortName}
                    </span>
                    {item.isCategoryPrimary && (
                      <span className="rounded bg-[#0F3D6E] px-1.5 py-0.2 text-[9px] font-bold text-white uppercase">
                        Active Group
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-base font-extrabold text-[#0F3D6E]">
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
                          delta.isPositive ? 'text-[#0F9D58]' : 'text-amber-600'
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
