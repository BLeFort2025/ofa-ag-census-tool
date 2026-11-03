import React, { useMemo, useState } from 'react';
import { ActiveModule, AgCensusDataset, GeoLevel, GeographyNode } from '../../types/census';
import { formatDelta, formatMetricValue, getObservation, getRawNumber } from '../../utils/analytics';
import { searchCharacteristicsSmart, searchGeographiesSmart } from '../../utils/laypersonSearch';
import { InteractiveAgMap, MapItemPoint } from '../InteractiveAgMap';
import {
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  HelpCircle,
  Layers,
  Printer,
  Search,
  Sparkles,
  X
} from 'lucide-react';

interface AgGeoLocatorProps {
  dataset: AgCensusDataset;
  onSelectGeoAndNavigate: (geo: GeographyNode, targetModule: ActiveModule) => void;
  onCompareTwoGeos?: (geoA: GeographyNode, geoB: GeographyNode) => void;
  onJumpToExplorerMetric?: (geo: GeographyNode, categoryId: string, metricId: string) => void;
  onOpenMultiAreaReport?: (geos: GeographyNode[]) => void;
}

export const AgGeoLocatorModule: React.FC<AgGeoLocatorProps> = ({
  dataset,
  onSelectGeoAndNavigate,
  onCompareTwoGeos,
  onJumpToExplorerMetric,
  onOpenMultiAreaReport
}) => {
  const [query, setQuery] = useState<string>('');
  const [provinceFilter, setProvinceFilter] = useState<string>('35'); // Default to Ontario for OFA users
  const [levelFilter, setLevelFilter] = useState<GeoLevel | 'ALL'>('ALL');
  const [focusedGeoId, setFocusedGeoId] = useState<string | null>('2021A00033540');
  const [topicQuery, setTopicQuery] = useState<string>('');

  const provinces = useMemo(
    () =>
      dataset.geographies
        .filter((g) => g.level === 'Provinces & Territories')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [dataset.geographies]
  );

  // Smart Layperson Geography Search (handles multi-word, towns, communities, and OFA Federations)
  const smartMatches = useMemo(() => {
    return searchGeographiesSmart(dataset.geographies, query, {
      provinceFilter,
      levelFilter,
      limit: 150
    });
  }, [dataset.geographies, query, provinceFilter, levelFilter]);

  // Automatically focus the #1 matching geography when the user types a search query
  React.useEffect(() => {
    if (query.trim() && smartMatches.length > 0) {
      const currentStillInTop5 = smartMatches.slice(0, 5).some((m) => m.geo.id === focusedGeoId);
      if (!currentStillInTop5) {
        setFocusedGeoId(smartMatches[0].geo.id);
      }
    }
  }, [query, smartMatches]);

  // Detect if the user searched for a multi-district OFA federation or pair of counties (e.g., "East Nipissing Parry Sound")
  const topMatchedDistricts = useMemo(() => {
    if (!query.trim()) return [];
    const cds = smartMatches
      .filter((m) => m.geo.level === 'Counties / Census Divisions (CD)' && m.score >= 45)
      .slice(0, 3)
      .map((m) => m.geo);
    return cds.length >= 2 ? cds : [];
  }, [query, smartMatches]);

  const combinedRollupStats = useMemo(() => {
    if (topMatchedDistricts.length < 2) return null;
    const geos = topMatchedDistricts.slice(0, 2);
    let totalFarms = 0;
    let totalAcres = 0;
    let totalRev = 0;
    let totalCap = 0;
    for (const g of geos) {
      totalFarms += getRawNumber(dataset, g.id, 'total_farms', 0) || 0;
      totalAcres += getRawNumber(dataset, g.id, 'land_total_acres', 0) || 0;
      totalRev += getRawNumber(dataset, g.id, 'rev_total_dollars', 0) || 0;
      totalCap += getRawNumber(dataset, g.id, 'cap_total_dollars', 0) || 0;
    }
    return {
      geos,
      names: geos.map((g) => g.cleanName).join(' + '),
      totalFarms,
      totalAcres,
      totalRev,
      totalCap
    };
  }, [topMatchedDistricts, dataset]);

  const mapItems: MapItemPoint[] = useMemo(() => {
    return smartMatches.slice(0, 80).map(({ geo: g }) => {
      const farms = getRawNumber(dataset, g.id, 'total_farms', 0);
      return {
        geo: g,
        value: farms,
        formattedValue: `${formatMetricValue(farms, 'FARMS')} farms`,
        secondaryLabel: g.hierarchyPath,
        color: g.id === focusedGeoId ? '#0F3D6E' : '#328475',
        radius: g.id === focusedGeoId ? 9 : 6,
        isSelected: g.id === focusedGeoId
      };
    });
  }, [smartMatches, dataset, focusedGeoId]);

  const focusedGeo = useMemo(
    () =>
      dataset.geographies.find((g) => g.id === focusedGeoId) ||
      smartMatches[0]?.geo ||
      dataset.geographies[0],
    [dataset.geographies, focusedGeoId, smartMatches]
  );

  // Instant data lookup for the focused geography
  const matchingCharacteristics = useMemo(() => {
    if (!topicQuery.trim()) {
      // Show top 8 everyday headline metrics by default so a layperson immediately sees key data
      const defaultIds = [
        'total_farms',
        'land_total_acres',
        'avg_farm_size_acres',
        'rev_total_dollars',
        'land_bldg_value_per_acre',
        'cattle_total_head',
        'crop_other_hay_acres',
        'op_avg_age'
      ];
      return defaultIds
        .map((id) => dataset.characteristics.find((c) => c.id === id))
        .filter(Boolean)
        .map((c) => ({ characteristic: c!, score: 100, matchedSynonym: undefined }));
    }
    return searchCharacteristicsSmart(dataset.characteristics, topicQuery, 15);
  }, [dataset.characteristics, topicQuery]);

  const quickAreaExamples = [
    { label: 'East Nipissing-Parry Sound', q: 'East Nipissing Parry Sound' },
    { label: 'West Nipissing-Sudbury', q: 'West Nipissing Sudbury' },
    { label: 'Temiskaming', q: 'Temiskaming' },
    { label: 'Huron County', q: 'Huron' },
    { label: 'Wellington / Fergus', q: 'Wellington' },
    { label: 'Haldimand-Norfolk', q: 'Haldimand Norfolk' },
    { label: 'Stormont, Dundas & Glengarry', q: 'Stormont Dundas Glengarry' }
  ];

  const quickTopicExamples = [
    { label: 'Beef & Cattle', q: 'cattle beef' },
    { label: 'Dairy & Milk', q: 'dairy milk' },
    { label: 'Hay & Pasture', q: 'hay alfalfa pasture' },
    { label: 'Grain, Corn & Soy', q: 'corn soybeans wheat' },
    { label: 'Maple & Fruit', q: 'maple fruit vegetables' },
    { label: 'Land Price & Rent', q: 'land value rented' },
    { label: 'Farm Income', q: 'revenue expenses margin' },
    { label: 'Young Farmers', q: 'under 35 succession' }
  ];

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2.5 rounded-md border border-slate-200/90 shadow-xs">
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-[#0F3D6E] uppercase">
            EASY AREA & DATA FINDER (GEOLOCATOR)
          </h1>
          <p className="text-[11px] text-slate-500">
            Search by County, District, Township, Local Town/Village (e.g., Powassan, Listowel, Fergus), or OFA Federation — and view instant data on the right
          </p>
        </div>

        <a
          href="https://www12.statcan.gc.ca/census-recensement/2021/geo/maps-cartes/geosearch-georecherche/index2021-eng.cfm"
          target="_blank"
          rel="noreferrer"
          className="
            inline-flex items-center gap-1.5 rounded bg-[#0F3D6E] px-3 py-1.5
            text-xs font-semibold text-white hover:bg-[#164677] transition
          "
        >
          <span>Open Official StatCan GeoSearch</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        {/* Left Column: Step 1 — Find Your Area (7 cols) */}
        <div className="col-span-12 lg:col-span-7 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#0F3D6E]">
              Step 1: Type Any Area, Town, Township, County, or OFA Federation
            </span>
            <span className="text-[11px] font-semibold text-[#328475]">
              {smartMatches.length} matching areas found
            </span>
          </div>

          {/* Search Input + Province + Level Filters */}
          <div className="grid grid-cols-12 gap-2 mb-2">
            <div className="col-span-12 sm:col-span-6 relative">
              <Search className="w-4 h-4 text-[#328475] absolute left-3 top-2.5" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try 'East Nipissing Parry Sound', 'Powassan', 'Huron'..."
                className="w-full rounded border-2 border-[#328475]/60 bg-[#F4FBF9] pl-9 pr-7 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#0F3D6E] focus:bg-white focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="col-span-6 sm:col-span-3">
              <select
                value={provinceFilter}
                onChange={(e) => setProvinceFilter(e.target.value)}
                className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2 py-1.5 text-xs font-semibold text-[#0F3D6E]"
              >
                <option value="ALL">All of Canada</option>
                {provinces.map((p) => (
                  <option key={p.provinceCode} value={p.provinceCode}>
                    {p.cleanName}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-6 sm:col-span-3">
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as GeoLevel | 'ALL')}
                className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">All Area Types</option>
                <option value="Counties / Census Divisions (CD)">Counties / Districts Only</option>
                <option value="Townships / Subdivisions (CCS)">Townships / Towns Only</option>
                <option value="Census Agricultural Regions (CAR)">Ag Regions (CAR) Only</option>
                <option value="Provinces & Territories">Provinces Only</option>
              </select>
            </div>
          </div>

          {/* 1-Click Example Search Pills for Laypersons */}
          <div className="flex flex-wrap items-center gap-1 mb-2.5">
            <span className="text-[10px] font-semibold text-slate-400 mr-1">Try clicking:</span>
            {quickAreaExamples.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  setProvinceFilter('35');
                  setQuery(ex.q);
                }}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition cursor-pointer border ${
                  query.toLowerCase() === ex.q.toLowerCase()
                    ? 'bg-[#0F3D6E] text-white border-[#0F3D6E]'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {ex.label}
              </button>
            ))}
          </div>

          {/* Combined Multi-District Rollup Banner (e.g. when searching "East Nipissing Parry Sound") */}
          {combinedRollupStats && (
            <div className="mb-2.5 rounded-md bg-[#EBF5F3] border border-[#328475]/40 p-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#0F3D6E]">
                  <Layers className="w-4 h-4 text-[#328475]" />
                  <span>
                    Combined Regional Rollup: {combinedRollupStats.names}
                  </span>
                </div>
                <div className="text-[11px] text-slate-700 mt-0.5">
                  Statistics Canada reports these as separate Census Districts. Combined, they total{' '}
                  <strong className="text-[#0F3D6E]">
                    {formatMetricValue(combinedRollupStats.totalFarms, 'FARMS')} farms
                  </strong>
                  ,{' '}
                  <strong className="text-[#0F3D6E]">
                    {formatMetricValue(combinedRollupStats.totalAcres, 'ACRES')} acres
                  </strong>
                  , and{' '}
                  <strong className="text-[#0F3D6E]">
                    {formatMetricValue(combinedRollupStats.totalRev, 'DOLLARS', true)}
                  </strong>{' '}
                  in gross farm receipts.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {onOpenMultiAreaReport && (
                  <button
                    type="button"
                    onClick={() => onOpenMultiAreaReport(combinedRollupStats.geos)}
                    className="inline-flex items-center gap-1.5 rounded bg-[#0F3D6E] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#164677] transition cursor-pointer shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Combined &amp; Individual PDF Report</span>
                  </button>
                )}
                {onCompareTwoGeos && (
                  <button
                    type="button"
                    onClick={() =>
                      onCompareTwoGeos(combinedRollupStats.geos[0], combinedRollupStats.geos[1])
                    }
                    className="inline-flex items-center gap-1.5 rounded bg-[#328475] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#276B5E] transition cursor-pointer shadow-xs"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>Compare Side-by-Side</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Results Table */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded">
            {smartMatches.length === 0 ? (
              <div className="p-6 text-center">
                <div className="text-sm font-bold text-slate-700 mb-1">
                  No exact match for &ldquo;{query}&rdquo;
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Try typing just one word (like a nearby town, county, or district name) or click below to view all Ontario counties.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setProvinceFilter('35');
                    setLevelFilter('Counties / Census Divisions (CD)');
                  }}
                  className="rounded bg-[#0F3D6E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#164677] cursor-pointer"
                >
                  Show All 49 Ontario Counties & Districts
                </button>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 sticky top-0 text-[11px] text-slate-600 z-10">
                  <tr>
                    <th className="py-2 px-2.5">Area Name & Hierarchy Path</th>
                    <th className="py-2 px-2">Type</th>
                    <th className="py-2 px-2 text-right">Farms</th>
                    <th className="py-2 px-2.5 text-right">View Full Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {smartMatches.map(({ geo: g, matchReason }) => {
                    const farms = getRawNumber(dataset, g.id, 'total_farms', 0);
                    const isSelected = g.id === focusedGeo?.id;
                    const shortLevel =
                      g.level === 'Counties / Census Divisions (CD)'
                        ? 'County / District (CD)'
                        : g.level === 'Townships / Subdivisions (CCS)'
                        ? 'Township / Local (CCS)'
                        : g.level === 'Census Agricultural Regions (CAR)'
                        ? 'Ag Region (CAR)'
                        : g.level;

                    return (
                      <tr
                        key={g.id}
                        onClick={() => setFocusedGeoId(g.id)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? 'bg-[#0F3D6E]/10 border-l-4 border-l-[#0F3D6E]'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2 px-2.5">
                          <div className="font-bold text-[#0F3D6E] flex items-center gap-1.5">
                            <span>{g.name}</span>
                            {isSelected && (
                              <span className="rounded bg-[#0F3D6E] px-1.5 py-0.2 text-[9px] font-bold text-white">
                                Selected
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{g.hierarchyPath}</div>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            {g.ofaFederation && (
                              <span className="inline-block rounded bg-[#328475]/15 px-1.5 py-0.2 text-[10px] font-semibold text-[#1D6C5E]">
                                {g.ofaFederation}
                              </span>
                            )}
                            {matchReason && matchReason !== g.ofaFederation && (
                              <span className="inline-block rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-semibold text-amber-900">
                                ★ {matchReason}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-[11px] text-slate-600">{shortLevel}</td>
                        <td className="py-2 px-2 text-right font-bold text-slate-800">
                          {formatMetricValue(farms, 'FARMS')}
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectGeoAndNavigate(g, 'snapshot');
                            }}
                            className="inline-flex items-center gap-1 rounded bg-[#0F3D6E] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#164677] cursor-pointer"
                          >
                            <span>Open Dashboard</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column: Step 2 — Instant Area Data Preview, Topic Search & Map (5 cols) */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-2.5 min-h-0">
          {/* Top Card: Instant Data & Topic Finder for the Selected Area */}
          {focusedGeo && (
            <div className="rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col flex-1 min-h-0">
              <div className="flex items-start justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#328475]">
                    Step 2: Instant Data for Selected Area
                  </div>
                  <h2 className="text-sm font-extrabold text-[#0F3D6E]">{focusedGeo.name}</h2>
                  <div className="text-[10px] text-slate-500">{focusedGeo.hierarchyPath}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectGeoAndNavigate(focusedGeo, 'snapshot')}
                    className="inline-flex items-center gap-1 rounded bg-[#0F3D6E] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#164677] cursor-pointer shadow-xs"
                  >
                    <span>Full Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectGeoAndNavigate(focusedGeo, 'explorer')}
                    className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1.5 text-xs font-semibold text-[#0F3D6E] hover:bg-slate-200 cursor-pointer"
                    title="Open in Ag Explorer Charts"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Charts</span>
                  </button>
                </div>
              </div>

              {/* Search Any Data Topic Box */}
              <div className="relative mb-1.5">
                <Search className="w-3.5 h-3.5 text-[#0F3D6E] absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={topicQuery}
                  onChange={(e) => setTopicQuery(e.target.value)}
                  placeholder={`What data do you want for ${focusedGeo.cleanName}? (e.g., hay, beef, maple, rent, age)...`}
                  className="w-full rounded border border-slate-300 bg-[#F8FAFC] pl-8 pr-7 py-1.5 text-xs font-medium text-slate-800 focus:border-[#0F3D6E] focus:bg-white focus:outline-none"
                />
                {topicQuery && (
                  <button
                    type="button"
                    onClick={() => setTopicQuery('')}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Quick Topic Pills */}
              <div className="flex flex-wrap items-center gap-1 mb-2">
                {quickTopicExamples.map((tp) => (
                  <button
                    key={tp.label}
                    type="button"
                    onClick={() => setTopicQuery(tp.q === topicQuery ? '' : tp.q)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                      topicQuery === tp.q
                        ? 'bg-[#328475] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tp.label}
                  </button>
                ))}
              </div>

              {/* Instant Data Table for Selected Area */}
              <div className="flex-1 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
                {matchingCharacteristics.map(({ characteristic: c }) => {
                  const obs = getObservation(dataset, focusedGeo.id, c);
                  const delta = formatDelta(obs.pctChange);
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        if (onJumpToExplorerMetric) {
                          onJumpToExplorerMetric(focusedGeo, c.category, c.id);
                        } else {
                          onSelectGeoAndNavigate(focusedGeo, 'explorer');
                        }
                      }}
                      className="px-2.5 py-1.5 hover:bg-slate-50 flex items-center justify-between gap-2 cursor-pointer transition"
                      title="Click to open this metric in Ag Explorer charts"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {c.shortName}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {c.category} • StatCan {c.statcanTable}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-extrabold text-[#0F3D6E]">
                          {formatMetricValue(obs.val2021, c.unit, true, obs.status)}
                          {obs.pctOfBase !== null && c.unit === 'FARMS' && (
                            <span className="ml-1 text-[10px] font-semibold text-[#328475]">
                              ({obs.pctOfBase.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          2016: {formatMetricValue(obs.val2016, c.unit, true)}{' '}
                          {obs.pctChange !== null && (
                            <span
                              className={`font-semibold ${
                                delta.isPositive
                                  ? 'text-emerald-700'
                                  : !delta.isNeutral
                                  ? 'text-amber-700'
                                  : 'text-slate-500'
                              }`}
                            >
                              ({delta.text})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom Card: Interactive Map Preview */}
          <div className="rounded-md bg-white p-2.5 shadow-xs border border-slate-200/90 flex flex-col h-56 shrink-0">
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#0F3D6E]">
                Map Location Preview: {focusedGeo?.cleanName}
              </h3>
              {focusedGeo && (
                <span className="text-[10px] font-mono text-slate-400">{focusedGeo.dguid}</span>
              )}
            </div>
            <div className="flex-1 min-h-0">
              <InteractiveAgMap
                items={mapItems}
                selectedGeoId={focusedGeo?.id || null}
                focusGeo={focusedGeo}
                onSelectGeo={(gid) => setFocusedGeoId(gid)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Evidence-Bound AI Policy Narrative Drawer (Replicating & Surpassing MTM's 'A' Smart Narrative Drawer)
interface AiNarrativeDrawerProps {
  dataset: AgCensusDataset;
  selectedGeo: GeographyNode;
  compareGeo: GeographyNode;
  onClose: () => void;
}

export const AiNarrativeDrawer: React.FC<AiNarrativeDrawerProps> = ({
  dataset,
  selectedGeo,
  onClose
}) => {
  const [copied, setCopied] = useState(false);

  const charMap = useMemo(
    () => new Map(dataset.characteristics.map((c) => [c.id, c])),
    [dataset.characteristics]
  );

  const getObs = (cid: string) => {
    const m = charMap.get(cid);
    return m ? getObservation(dataset, selectedGeo.id, m) : null;
  };

  const farms = getObs('total_farms');
  const area = getObs('land_total_acres');
  const avgSize = getObs('avg_farm_size_acres');
  const rev = getObs('rev_total_dollars');
  const avgRev = getObs('avg_rev_per_farm');
  const margin = getObs('net_operating_margin_pct');
  const cap = getObs('cap_total_dollars');
  const landVal = getObs('land_bldg_value_per_acre');
  const rented = getObs('tenure_rented_acres');
  const opAge = getObs('op_avg_age');
  const succ = getObs('succ_written');
  const notill = getObs('till_notill_acres');
  const cover = getObs('bmp_cover_crops_farms');
  const autosteer = getObs('tech_autosteer');

  const bulletPoints = [
    `• Farm Structure & Consolidation: ${selectedGeo.name} (${selectedGeo.dguid}) recorded ${formatMetricValue(
      farms?.val2021,
      'FARMS'
    )} census farms in 2021 (${
      farms?.pctChange !== null ? `${formatDelta(farms?.pctChange).text} vs. 2016` : '2021 baseline'
    }), spanning ${formatMetricValue(
      area?.val2021,
      'ACRES'
    )} acres of agricultural land with an average farm size of ${formatMetricValue(
      avgSize?.val2021,
      'ACRES'
    )} acres (StatCan 32-10-0231-01 & 32-10-0249-01).`,
    `• Economic Output & Operating Margins: Farms in ${
      selectedGeo.cleanName
    } generated ${formatMetricValue(
      rev?.val2021,
      'DOLLARS',
      true
    )} in annual gross farm operating revenues (${
      rev?.pctChange !== null ? `${formatDelta(rev?.pctChange).text} vs. 2016` : '2021'
    }), averaging ${formatMetricValue(
      avgRev?.val2021,
      'DOLLARS'
    )} per operation with an aggregate net operating margin of ${
      margin?.val2021 !== null ? `${margin?.val2021}%` : 'N/A'
    } before depreciation (StatCan 32-10-0240-01 & 32-10-0241-01).`,
    `• Farmland Capital & Land Tenure: Total farm capital reached ${formatMetricValue(
      cap?.val2021,
      'DOLLARS',
      true
    )}, with land and buildings valued at an average of ${formatMetricValue(
      landVal?.val2021,
      'DOLLARS'
    )} per acre. Rented or leased land accounts for ${
      rented?.pctOfBase !== null ? `${rented?.pctOfBase.toFixed(1)}%` : 'N/A'
    } of total farmland area (StatCan 32-10-0237-01 & 32-10-0234-01).`,
    `• Operator Demographics & Succession Readiness: The average farm operator age in ${
      selectedGeo.cleanName
    } is ${opAge?.val2021 ?? 'N/A'} years, and ${
      succ?.pctOfBase !== null ? `${succ?.pctOfBase.toFixed(1)}%` : 'N/A'
    } of operations report having a formal written succession plan (StatCan 32-10-0381-01 & 32-10-0244-01).`,
    `• Precision Technology & Soil Stewardship: No-till or zero-till seeding is practiced on ${
      notill?.pctOfBase !== null ? `${notill?.pctOfBase.toFixed(1)}%` : 'N/A'
    } of prepared cropland, winter cover crops are planted by ${
      cover?.pctOfBase !== null ? `${cover?.pctOfBase.toFixed(1)}%` : 'N/A'
    } of farms, and automated guidance steering (auto-steer) is utilized by ${
      autosteer?.pctOfBase !== null ? `${autosteer?.pctOfBase.toFixed(1)}%` : 'N/A'
    } of operations (StatCan 32-10-0367-01, 32-10-0369-01 & 32-10-0379-01).`
  ];

  const handleCopy = () => {
    const text = `OFA / Statistics Canada Census of Agriculture Executive Briefing — ${selectedGeo.name}\n\n${bulletPoints.join(
      '\n\n'
    )}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-y-0 left-16 z-50 w-full max-w-md bg-white shadow-2xl border-r border-slate-200 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-[#071D49] text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#328475]" />
          <span className="font-bold text-sm">
            AI Executive Policy Summary: {selectedGeo.cleanName}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-300 hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-3 text-xs leading-relaxed text-slate-700">
        <div className="rounded bg-[#0F3D6E]/5 p-2.5 border border-[#0F3D6E]/15 text-[11px] text-[#0F3D6E] font-medium">
          100% Evidence-Grounded Narrative: Every figure below is dynamically synthesized from
          official Statistics Canada Census of Agriculture tables for{' '}
          <span className="font-bold">{selectedGeo.name}</span>.
        </div>

        {bulletPoints.map((b, i) => (
          <p key={i} className="p-2.5 rounded bg-[#F7F8FA] border border-slate-100">
            {b}
          </p>
        ))}
      </div>

      <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
        <span className="text-[10px] text-slate-400">Ready for OFA policy memos & briefs</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded bg-[#0F3D6E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#164677] cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied to Clipboard!' : 'Copy Policy Briefing'}</span>
        </button>
      </div>
    </div>
  );
};

// Interactive Step-by-Step Guided Coach-Mark Overlay (Replicating MTM's '?' Help Bookmarks)
interface GuidedCoachMarkProps {
  activeModule: ActiveModule;
  onClose: () => void;
}

const MODULE_GUIDES: Record<
  ActiveModule,
  Array<{ title: string; body: string }>
> = {
  snapshot: [
    {
      title: 'Step 1: Select Any Canadian or Ontario Geography',
      body: 'Type any town, township, county, or OFA Federation in the green Quick Search box at the top-left (or use the Global Search bar in the top header) to load its profile.'
    },
    {
      title: 'Step 2: Review the 8 Executive Agricultural Cards',
      body: 'Inspect Total Census Farms, Farmland Area & Cropland Share, Gross Operating Revenues & Net Margin, Farm Capital & $/Acre, Top NAICS Farm Types, Top Crops, Livestock Inventories, Land Tenure, and Precision Tech/Succession metrics.'
    },
    {
      title: 'Step 3: Click "+" to Deep-Dive or Open the Peer Distance Map',
      body: 'Click the "+" button on any card to jump directly into Ag Explorer for that topic, or click "Click here to show map" to inspect boundary polygons and nearby counties by distance (km).'
    }
  ],
  explorer: [
    {
      title: 'Step 1: Navigate the 10-Category Agricultural Variable Tree',
      body: 'Choose any of the 10 Statistics Canada Census of Agriculture variable categories on the left and select a specific sub-topic breakdown.'
    },
    {
      title: 'Step 2: Switch Between Bar, Share, Multi-Census Trend & Table Views',
      body: 'Toggle the center visualization between MTM-style horizontal bars, proportional share breakdown, 1976–2021 historical multi-census trajectories, or a downloadable CSV data table.'
    },
    {
      title: 'Step 3: Verify Denominator Base & Aggregate Statistics',
      body: 'Click the "Base" button to see the exact reference denominator used for percentages, and inspect averages, $/acre values, and 2016–2021 deltas on the right panel.'
    }
  ],
  drilldown: [
    {
      title: 'Step 1: Define Your Geographic Scope',
      body: 'Select a Geographic Level (e.g., Counties/CD or Townships/CCS) and filter to Ontario, any other province, or All of Canada.'
    },
    {
      title: 'Step 2: Intersect Up to 4 Agricultural Filters',
      body: 'Combine up to 4 agricultural metrics and set minimum/maximum thresholds to size and locate your target farm segment.'
    },
    {
      title: 'Step 3: Explore Choropleths & Ranked Leaderboard',
      body: 'Toggle the map between Polygons and Bubbles and click any row in the qualifying table.'
    }
  ],
  compare: [
    {
      title: 'Step 1: Pick Geographies to Benchmark',
      body: 'Select up to 10 geographies across Canada (e.g., Nipissing vs. Parry Sound, or Huron vs. Perth) to benchmark side-by-side.'
    },
    {
      title: 'Step 2: Toggle Percentages vs. Counts vs. Aggregate Metrics',
      body: 'Use "Percentages" to normalize comparisons between regions of different sizes (e.g., a county vs. a province), or "Counts" to compare absolute scale.'
    },
    {
      title: 'Step 3: Spot Leaders Instantly with Green Winner Dots (●)',
      body: 'Every row automatically marks whichever geography leads on that metric with a green circle (●).'
    }
  ],
  ranker: [
    {
      title: 'Step 1: Switch Between Counts & Share and Aggregate Statistics',
      body: 'Use the Variable card to rank geographies either by commodity/practice counts & share (%) or by financial/structural averages (such as Land Value $/Acre or Avg Revenue/Farm).'
    },
    {
      title: 'Step 2: Apply Threshold Range Filters',
      body: 'Use the Ranker Filters card at the bottom-left to set minimum Total Census Farms or Percentage Share ranges so small-sample outliers are excluded.'
    },
    {
      title: 'Step 3: Sort & Map Top Agricultural Regions',
      body: 'Click any column header in the leaderboard to sort by Value, %, or 2016–2021 Growth, and click "Map" on any row to zoom directly to that region.'
    }
  ],
  agscore: [
    {
      title: 'AgScore Use Case: Multi-Factor Agricultural Opportunity & Policy Index',
      body: 'AgScore standardizes up to 4 agricultural characteristics across candidate geographies using Z-scores and Normal CDF percentiles (0–100), combining them via your custom weights.'
    },
    {
      title: 'Step 1: Try a 1-Click OFA Policy Preset or Customize Slots 1–4',
      body: 'Click any OFA Preset at the top (e.g., Commercial Scale & Precision Ag, Soil Stewardship & BMPs, Generational Renewal, or Farmland Tenure Pressure) or choose your own 4 characteristics and weights (0.0 to 1.0).'
    },
    {
      title: 'Step 2: Inspect Color-Coded Score Bands (0–50, 50–70, 70–90, 90–100)',
      body: 'Review the ranked scorecard table and hover over any geography on the map to see its individual percentile performance on Characteristics 1 through 4.'
    }
  ],
  geolocator: [
    {
      title: 'Easy Area & Data Finder',
      body: 'Type any town, township, county, agricultural region, or OFA Federation on the left, and immediately search any agricultural statistic for that area on the right.'
    }
  ]
};

export const GuidedCoachMarkModal: React.FC<GuidedCoachMarkProps> = ({
  activeModule,
  onClose
}) => {
  const steps = MODULE_GUIDES[activeModule] || MODULE_GUIDES.snapshot;
  const [stepIdx, setStepIdx] = useState(0);
  const current = steps[stepIdx] || steps[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-[#071D49] text-white rounded-lg shadow-2xl border border-white/15 max-w-lg w-full p-5 relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-300">
            <HelpCircle className="w-4 h-4" />
            <span>
              Guided Walkthrough ({stepIdx + 1} of {steps.length})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[#0D6ABF] px-2.5 py-1 text-xs font-bold text-white hover:bg-sky-500 cursor-pointer"
          >
            Close ✕
          </button>
        </div>

        <h2 className="text-base font-extrabold mb-2 text-white">{current.title}</h2>
        <p className="text-xs leading-relaxed text-slate-200 mb-5">{current.body}</p>

        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <div className="flex items-center gap-1.5">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className={`w-2 h-2 rounded-full ${
                  idx === stepIdx ? 'bg-sky-400' : 'bg-white/25'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((p) => p - 1)}
                className="rounded bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 cursor-pointer"
              >
                ← Back
              </button>
            )}
            {stepIdx < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIdx((p) => p + 1)}
                className="rounded bg-[#0D6ABF] px-3.5 py-1.5 text-xs font-bold hover:bg-sky-500 cursor-pointer"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="rounded bg-[#0F9D58] px-3.5 py-1.5 text-xs font-bold hover:bg-emerald-600 cursor-pointer"
              >
                Finish Tour ✓
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
