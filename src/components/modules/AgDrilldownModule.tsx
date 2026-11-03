import React, { useMemo, useState } from 'react';
import { AgCensusDataset, GeoLevel, GeographyNode } from '../../types/census';
import {
  MTM_PALETTES,
  computeQuintileBreaks,
  formatMetricValue,
  getObservation,
  getQuintileColor,
  getRawNumber
} from '../../utils/analytics';
import { MultiGeographyScopeSlicer } from '../GeographySlicer';
import { InteractiveAgMap, MapItemPoint } from '../InteractiveAgMap';
import { Download, Filter, RotateCcw } from 'lucide-react';

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

  const charMap = useMemo(
    () => new Map(dataset.characteristics.map((c) => [c.id, c])),
    [dataset.characteristics]
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
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                Ranking ({rankedRows.length} Geographies)
              </h3>
              <span className="text-[11px] text-slate-400">
                Click any row to focus map • Double-click to open Snapshot
              </span>
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
