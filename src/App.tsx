import React, { useEffect, useMemo, useState } from 'react';
import { ActiveModule, AgCensusDataset, GeographyNode } from './types/census';
import { formatDelta, formatMetricValue, getObservation, getRawNumber } from './utils/analytics';
import { searchCharacteristicsSmart, searchGeographiesSmart } from './utils/laypersonSearch';
import { AgSnapshotModule } from './components/modules/AgSnapshotModule';
import { AgExplorerModule } from './components/modules/AgExplorerModule';
import { AgDrilldownModule } from './components/modules/AgDrilldownModule';
import { AgCompareModule } from './components/modules/AgCompareModule';
import { AgRankerModule } from './components/modules/AgRankerModule';
import { AgBeltsModule } from './components/modules/AgBeltsModule';
import { AgScoreModule } from './components/modules/AgScoreModule';
import {
  AgGeoLocatorModule,
  AiNarrativeDrawer,
  GuidedCoachMarkModal
} from './components/modules/AgGeoLocatorAndOverlays';
import { MultiAreaReportModal } from './components/MultiAreaReportModal';
import {
  Aperture,
  ArrowLeftRight,
  ArrowRight,
  Award,
  BarChartBig,
  Compass,
  FileText,
  Filter,
  HelpCircle,
  Lightbulb,
  Map as MapIcon,
  MessageSquare,
  Printer,
  Search,
  Sparkles,
  Wheat,
  X
} from 'lucide-react';

export const App: React.FC = () => {
  const [dataset, setDataset] = useState<AgCensusDataset | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [activeModule, setActiveModule] = useState<ActiveModule>('snapshot');
  const [selectedGeo, setSelectedGeo] = useState<GeographyNode | null>(null);
  const [compareGeoA, setCompareGeoA] = useState<GeographyNode | null>(null);
  const [compareGeoB, setCompareGeoB] = useState<GeographyNode | null>(null);

  // Deep-link state when jumping from Snapshot '+' button or Global Search into Ag Explorer
  const [explorerJumpCategory, setExplorerJumpCategory] = useState<string | undefined>(undefined);
  const [explorerJumpLayer2, setExplorerJumpLayer2] = useState<string | undefined>(undefined);

  // Global Omnibox Search state ("Find Any Area or Data Topic")
  const [omniboxQuery, setOmniboxQuery] = useState<string>('');
  const [omniboxOpen, setOmniboxOpen] = useState<boolean>(false);

  // Overlays ('?' coach-marks, 'A' AI summary drawer, Disclaimer modal, Multi-Area Report Builder)
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showAiDrawer, setShowAiDrawer] = useState<boolean>(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState<boolean>(false);
  const [multiAreaReportGeos, setMultiAreaReportGeos] = useState<GeographyNode[] | null>(null);

  useEffect(() => {
    fetch('/data/ag_census_data.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading ag_census_data.json`);
        return res.json();
      })
      .then((data: AgCensusDataset) => {
        data.characteristics.forEach((c) => {
          if (c.id === 'naics_cattle_total') {
            c.shortName = 'Cattle';
            c.name = 'Cattle [1121]';
          } else {
            c.shortName = c.shortName.replace(/Cattle Ranching(\s*&\s*Farming)?/gi, 'Cattle');
            c.name = c.name.replace(/ranching and farming/gi, 'farming');
          }
        });
        setDataset(data);
        const ontario =
          data.geographies.find((g) => g.dguid === '2021A000235') || data.geographies[0];
        const huron =
          data.geographies.find((g) => g.dguid === '2021A00033540') ||
          data.geographies.find((g) => g.level === 'Counties / Census Divisions (CD)') ||
          ontario;
        const perth =
          data.geographies.find((g) => g.dguid === '2021A00033531') || ontario;

        setSelectedGeo(ontario);
        setCompareGeoA(perth);
        setCompareGeoB(huron);
      })
      .catch((err) => {
        setLoadingError(String(err));
      });
  }, []);

  // Global Omnibox matching areas & metrics
  const omniboxGeoMatches = useMemo(() => {
    if (!dataset || !omniboxQuery.trim()) return [];
    return searchGeographiesSmart(dataset.geographies, omniboxQuery, {
      provinceFilter: 'ALL',
      levelFilter: 'ALL',
      limit: 12
    });
  }, [dataset, omniboxQuery]);

  const omniboxMetricMatches = useMemo(() => {
    if (!dataset || !omniboxQuery.trim()) return [];
    return searchCharacteristicsSmart(dataset.characteristics, omniboxQuery, 10);
  }, [dataset, omniboxQuery]);

  // Detect if the omnibox query matched two related Counties/Districts (e.g. "East Nipissing Parry Sound")
  const omniboxTopDistricts = useMemo(() => {
    if (!omniboxQuery.trim()) return [];
    return omniboxGeoMatches
      .filter((m) => m.geo.level === 'Counties / Census Divisions (CD)' && m.score >= 45)
      .slice(0, 2)
      .map((m) => m.geo);
  }, [omniboxQuery, omniboxGeoMatches]);

  if (loadingError) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="bg-white p-6 rounded-lg shadow-md border border-red-200 max-w-md text-center">
          <h2 className="text-base font-bold text-red-700 mb-2">Error Loading Empirical Dataset</h2>
          <p className="text-xs text-slate-600">{loadingError}</p>
        </div>
      </div>
    );
  }

  if (!dataset || !selectedGeo || !compareGeoA || !compareGeoB) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#EEF0F4]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-[#0F3D6E] flex items-center justify-center text-white shadow-md animate-pulse">
            <Wheat className="w-6 h-6" />
          </div>
          <div>
            <div className="text-base font-extrabold text-[#0F3D6E] tracking-tight">
              AGCENSUS IQ • OFA INTELLIGENCE PLATFORM
            </div>
            <div className="text-xs text-slate-500">
              Loading 2,113 Canadian Geographies & 239 Empirical StatCan Census of Agriculture Metrics...
            </div>
          </div>
        </div>
      </div>
    );
  }

  const quickGeos = [
    { label: 'Canada', dguid: '2021A000011124' },
    { label: 'Ontario', dguid: '2021A000235' },
    { label: 'Huron', dguid: '2021A00033540' },
    { label: 'Wellington', dguid: '2021A00033523' },
    { label: 'Perth', dguid: '2021A00033531' },
    { label: 'Chatham-Kent', dguid: '2021A00033536' },
    { label: 'Oxford', dguid: '2021A00033532' }
  ];

  const navItems: Array<{
    id: ActiveModule;
    label: string;
    shortTitle: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'snapshot',
      label: '01 Ag Snapshot (Executive Portrait)',
      shortTitle: 'Snapshot',
      icon: <Aperture className="w-5 h-5" />
    },
    {
      id: 'explorer',
      label: '02 Ag Explorer (Commodity & Practice Deep-Dive)',
      shortTitle: 'Explorer',
      icon: <Lightbulb className="w-5 h-5" />
    },
    {
      id: 'drilldown',
      label: '03 Ag Drilldown (Multi-Criteria Screening)',
      shortTitle: 'Drilldown',
      icon: <Filter className="w-5 h-5" />
    },
    {
      id: 'compare',
      label: '04 Ag Compare (Side-by-Side Benchmarking)',
      shortTitle: 'Compare',
      icon: <ArrowLeftRight className="w-5 h-5" />
    },
    {
      id: 'ranker',
      label: '05 Ag Ranker (Regional Leaderboard)',
      shortTitle: 'Ranker',
      icon: <BarChartBig className="w-5 h-5" />
    },
    {
      id: 'belts',
      label: '06 Ag Belts & Cluster Maps Studio (National & Provincial Social Posters)',
      shortTitle: 'Ag Belts',
      icon: <MapIcon className="w-5 h-5" />
    },
    {
      id: 'agscore',
      label: '07 AgScore (Multi-Factor Weighted Index)',
      shortTitle: 'AgScore',
      icon: <Award className="w-5 h-5" />
    },
    {
      id: 'geolocator',
      label: '08 Easy Area & Data Finder (GeoSearch)',
      shortTitle: 'GeoSearch',
      icon: <Compass className="w-5 h-5" />
    }
  ];

  return (
    <div className="min-h-screen lg:h-screen w-screen flex bg-[#EEF0F4] overflow-x-hidden lg:overflow-hidden">
      {/* Persistent Left Navigation Rail matching MTM Census Tool */}
      <aside className="no-print w-16 shrink-0 bg-[#E2E6EC] border-r border-slate-300/80 flex flex-col items-center justify-between py-3 z-30 select-none">
        {/* Top Brand Emblem */}
        <div className="flex flex-col items-center gap-3 w-full">
          <div
            onClick={() => setActiveModule('snapshot')}
            className="flex flex-col items-center cursor-pointer group"
            title="AgCensus IQ — Canadian Census of Agriculture SaaS Platform (OFA)"
          >
            <span className="text-[10px] font-black tracking-tighter text-[#0F3D6E]">OFA</span>
            <div className="w-10 h-10 rounded-lg bg-[#0F3D6E] text-white flex items-center justify-center shadow-sm group-hover:bg-[#328475] transition">
              <Wheat className="w-5 h-5" />
            </div>
          </div>

          <div className="w-8 h-px bg-slate-300" />

          {/* 6 Core Modules + GeoLocator */}
          <nav className="flex flex-col items-center gap-1.5 w-full px-1.5">
            {navItems.map((item) => {
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveModule(item.id)}
                  title={item.label}
                  className={`
                    w-full py-2 rounded-lg flex flex-col items-center justify-center gap-0.5
                    transition cursor-pointer
                    ${
                      isActive
                        ? 'bg-white text-[#0F3D6E] shadow-xs font-bold border border-slate-200/80'
                        : 'text-slate-600 hover:bg-white/60 hover:text-[#0F3D6E]'
                    }
                  `}
                >
                  {item.icon}
                  <span className="text-[9px] tracking-tight leading-none mt-0.5">
                    {item.shortTitle}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom 3 Global Utility Icons matching MTM ('?', 'A', Disclaimer/Info) */}
        <div className="flex flex-col items-center gap-2 w-full px-2 pt-2 border-t border-slate-300/80">
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            title="Guided Module Walkthrough (?)"
            className={`w-10 h-9 rounded-lg flex items-center justify-center transition cursor-pointer ${
              showHelpModal
                ? 'bg-[#071D49] text-white'
                : 'text-slate-600 hover:bg-white hover:text-[#0F3D6E]'
            }`}
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowAiDrawer((p) => !p)}
            title="AI Executive Policy Summary Drawer (A)"
            className={`w-10 h-9 rounded-lg flex items-center justify-center font-serif font-extrabold text-sm border transition cursor-pointer ${
              showAiDrawer
                ? 'bg-[#071D49] text-white border-[#071D49]'
                : 'border-slate-400 text-slate-700 hover:bg-white hover:text-[#0F3D6E]'
            }`}
          >
            A
          </button>

          <button
            type="button"
            onClick={() => setShowDisclaimerModal(true)}
            title="Statistics Canada Data Sources, Methodology & Suppression Notes"
            className="w-10 h-9 rounded-lg flex items-center justify-center text-slate-600 hover:bg-white hover:text-[#0F3D6E] transition cursor-pointer"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Content Canvas */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto lg:overflow-hidden p-2.5 gap-2">
        {/* Top Bar with Global Omnibox Search ("Search any Area or Data Topic") + Quick Benchmarks */}
        <div className="no-print relative flex flex-wrap items-center justify-between gap-2 bg-[#0F3D6E] text-white px-3 py-1.5 rounded-md text-xs shadow-xs z-40">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-extrabold tracking-wide uppercase text-[11px] text-sky-200">
              AgCensus IQ (OFA Edition)
            </span>
            <span className="text-white/30 hidden sm:inline">|</span>
            <div className="flex flex-wrap items-center gap-1">
              {quickGeos.map((qg) => {
                const isCurrent = selectedGeo.dguid === qg.dguid;
                return (
                  <button
                    key={qg.dguid}
                    type="button"
                    onClick={() => {
                      const found = dataset.geographies.find((g) => g.dguid === qg.dguid);
                      if (found) setSelectedGeo(found);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                      isCurrent
                        ? 'bg-[#328475] text-white font-bold shadow-xs'
                        : 'bg-white/10 text-slate-200 hover:bg-white/20'
                    }`}
                  >
                    {qg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Global Layperson Omnibox: Search Any Area OR Any Data Topic from Anywhere */}
          <div className="relative flex-1 max-w-md min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-sky-200 absolute left-2.5 top-1.5 pointer-events-none" />
            <input
              type="text"
              value={omniboxQuery}
              onFocus={() => setOmniboxOpen(true)}
              onChange={(e) => {
                setOmniboxQuery(e.target.value);
                setOmniboxOpen(true);
              }}
              placeholder="Find any Area (e.g. East Nipissing, Powassan) or Data (e.g. Beef, Hay)..."
              className="w-full rounded bg-white/15 hover:bg-white/20 focus:bg-white text-white focus:text-slate-900 placeholder:text-sky-100/80 focus:placeholder:text-slate-400 pl-8 pr-7 py-1 text-[11px] font-medium border border-white/20 focus:border-white focus:outline-none transition"
            />
            {omniboxQuery && (
              <button
                type="button"
                onClick={() => {
                  setOmniboxQuery('');
                  setOmniboxOpen(false);
                }}
                className="absolute right-2 top-1 text-slate-300 hover:text-white focus:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Instant Global Omnibox Results Popover */}
            {omniboxOpen && omniboxQuery.trim() && (
              <div className="absolute right-0 left-0 sm:left-auto sm:w-[640px] top-full mt-1.5 rounded-lg bg-white text-slate-800 shadow-2xl border border-slate-300 overflow-hidden z-50">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px]">
                  <span className="font-bold text-[#0F3D6E]">
                    Instant Search Results for &ldquo;{omniboxQuery}&rdquo;
                  </span>
                  <button
                    type="button"
                    onClick={() => setOmniboxOpen(false)}
                    className="text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                  >
                    Close ✕
                  </button>
                </div>

                {/* Multi-district comparison shortcut if query matches 2 districts (e.g., East Nipissing Parry Sound) */}
                {omniboxTopDistricts.length === 2 && (
                  <div className="bg-[#EBF5F3] px-3 py-2 border-b border-[#328475]/30 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#0F3D6E]">
                      Combined Region Match:{' '}
                      <strong>
                        {omniboxTopDistricts[0].cleanName} + {omniboxTopDistricts[1].cleanName}
                      </strong>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMultiAreaReportGeos(omniboxTopDistricts);
                          setOmniboxOpen(false);
                        }}
                        className="rounded bg-[#0F3D6E] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#164677] cursor-pointer shrink-0"
                      >
                        🖨️ Combined + Individual PDF Report
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCompareGeoA(omniboxTopDistricts[0]);
                          setCompareGeoB(omniboxTopDistricts[1]);
                          setSelectedGeo(omniboxTopDistricts[0]);
                          setActiveModule('compare');
                          setOmniboxOpen(false);
                        }}
                        className="rounded bg-[#328475] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#276B5E] cursor-pointer shrink-0"
                      >
                        Compare Side-by-Side →
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-12 divide-x divide-slate-200 max-h-80 overflow-y-auto">
                  {/* Column 1: Matching Geographies */}
                  <div className="col-span-12 sm:col-span-6 p-2">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-1.5 mb-1">
                      Matching Areas ({omniboxGeoMatches.length})
                    </div>
                    {omniboxGeoMatches.length === 0 ? (
                      <div className="px-1.5 py-2 text-[11px] text-slate-400">
                        No areas matched &ldquo;{omniboxQuery}&rdquo;
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {omniboxGeoMatches.map(({ geo, matchReason }) => {
                          const farms = getRawNumber(dataset, geo.id, 'total_farms', 0);
                          return (
                            <button
                              key={geo.id}
                              type="button"
                              onClick={() => {
                                setSelectedGeo(geo);
                                if (activeModule === 'geolocator') {
                                  setActiveModule('snapshot');
                                }
                                setOmniboxOpen(false);
                                setOmniboxQuery('');
                              }}
                              className="w-full text-left px-2 py-1.5 rounded hover:bg-[#0F3D6E]/10 transition flex items-start justify-between gap-1 cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-[#0F3D6E] truncate">
                                  {geo.name}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate">
                                  {geo.hierarchyPath}
                                </div>
                                {(matchReason || geo.ofaFederation) && (
                                  <div className="text-[10px] font-semibold text-[#1D6C5E] truncate flex items-center gap-1">
                                    <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                    <span className="truncate">
                                      {matchReason || geo.ofaFederation}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                                {formatMetricValue(farms, 'FARMS')} farms
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Column 2: Matching Data Topics (showing live numbers for current area) */}
                  <div className="col-span-12 sm:col-span-6 p-2 bg-slate-50/50">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#328475] px-1.5 mb-1">
                      Data Topics in {selectedGeo.cleanName} ({omniboxMetricMatches.length})
                    </div>
                    {omniboxMetricMatches.length === 0 ? (
                      <div className="px-1.5 py-2 text-[11px] text-slate-400">
                        No data topics matched &ldquo;{omniboxQuery}&rdquo;
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {omniboxMetricMatches.map(({ characteristic: c }) => {
                          const obs = getObservation(dataset, selectedGeo.id, c);
                          const delta = formatDelta(obs.pctChange);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setExplorerJumpCategory(c.category);
                                setExplorerJumpLayer2(c.layer2);
                                setActiveModule('explorer');
                                setOmniboxOpen(false);
                                setOmniboxQuery('');
                              }}
                              className="w-full text-left px-2 py-1.5 rounded hover:bg-[#328475]/10 transition flex items-center justify-between gap-2 cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-800 truncate">
                                  {c.shortName}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate">
                                  {c.category}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs font-extrabold text-[#0F3D6E]">
                                  {formatMetricValue(obs.val2021, c.unit, true, obs.status)}
                                </div>
                                {obs.pctChange !== null && (
                                  <div className="text-[10px] font-semibold text-slate-500">
                                    {delta.text} vs 2016
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 px-3 py-1.5 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
                  <span>
                    Tip: Click any Area on the left to switch region, or click any Data Topic on the right to open its chart.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModule('geolocator');
                      setOmniboxOpen(false);
                    }}
                    className="font-bold text-[#0F3D6E] hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Open Full Area & Data Finder</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setMultiAreaReportGeos([]);
              }}
              className="inline-flex items-center gap-1 rounded bg-[#328475] hover:bg-[#276B5E] px-2.5 py-0.5 font-bold text-white cursor-pointer transition shadow-2xs"
              title="Build and print a Combined + Individual Breakdown PDF report for multiple areas"
            >
              <Printer className="w-3 h-3" />
              <span>Multi-Area PDF Report</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAiDrawer((p) => !p)}
              className="rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 font-semibold cursor-pointer transition"
            >
              ✦ AI Policy Brief
            </button>
            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 font-semibold cursor-pointer transition"
            >
              ? Guide
            </button>
          </div>
        </div>

        {/* Active Module Workspace */}
        <div className="flex-1 min-h-0" onClick={() => omniboxOpen && setOmniboxOpen(false)}>
          {activeModule === 'snapshot' && (
            <AgSnapshotModule
              dataset={dataset}
              selectedGeo={selectedGeo}
              onSelectGeo={setSelectedGeo}
              onJumpToExplorer={(category, _layer1, layer2) => {
                setExplorerJumpCategory(category);
                setExplorerJumpLayer2(layer2);
                setActiveModule('explorer');
              }}
              onOpenGeoLocator={() => setActiveModule('geolocator')}
              onPrintFactsheet={() => window.print()}
            />
          )}

          {activeModule === 'explorer' && (
            <AgExplorerModule
              dataset={dataset}
              selectedGeo={selectedGeo}
              onSelectGeo={setSelectedGeo}
              initialCategory={explorerJumpCategory}
              initialLayer2={explorerJumpLayer2}
              onOpenGeoLocator={() => setActiveModule('geolocator')}
            />
          )}

          {activeModule === 'drilldown' && (
            <AgDrilldownModule
              dataset={dataset}
              onOpenGeoLocator={() => setActiveModule('geolocator')}
              onSelectGeoForSnapshot={(geo) => {
                setSelectedGeo(geo);
                setActiveModule('snapshot');
              }}
            />
          )}

          {activeModule === 'compare' && (
            <AgCompareModule
              dataset={dataset}
              geoA={compareGeoA}
              geoB={compareGeoB}
              onSelectGeoA={setCompareGeoA}
              onSelectGeoB={setCompareGeoB}
              onOpenGeoLocator={() => setActiveModule('geolocator')}
            />
          )}

          {activeModule === 'ranker' && (
            <AgRankerModule
              dataset={dataset}
              onOpenGeoLocator={() => setActiveModule('geolocator')}
              onSelectGeoForSnapshot={(geo) => {
                setSelectedGeo(geo);
                setActiveModule('snapshot');
              }}
            />
          )}

          {activeModule === 'belts' && (
            <AgBeltsModule
              dataset={dataset}
              onOpenGeoLocator={() => setActiveModule('geolocator')}
              onSelectGeoForSnapshot={(geo) => {
                setSelectedGeo(geo);
                setActiveModule('snapshot');
              }}
            />
          )}

          {activeModule === 'agscore' && (
            <AgScoreModule
              dataset={dataset}
              onOpenGeoLocator={() => setActiveModule('geolocator')}
              onSelectGeoForSnapshot={(geo) => {
                setSelectedGeo(geo);
                setActiveModule('snapshot');
              }}
            />
          )}

          {activeModule === 'geolocator' && (
            <AgGeoLocatorModule
              dataset={dataset}
              onSelectGeoAndNavigate={(geo, mod) => {
                setSelectedGeo(geo);
                setActiveModule(mod);
              }}
              onCompareTwoGeos={(gA, gB) => {
                setCompareGeoA(gA);
                setCompareGeoB(gB);
                setSelectedGeo(gA);
                setActiveModule('compare');
              }}
              onJumpToExplorerMetric={(geo, categoryId, _metricId) => {
                setSelectedGeo(geo);
                setExplorerJumpCategory(categoryId);
                setActiveModule('explorer');
              }}
              onOpenMultiAreaReport={(geos) => setMultiAreaReportGeos(geos)}
            />
          )}
        </div>

        {/* Footer Citation Bar matching MTM Census Tool */}
        <footer className="no-print flex flex-wrap items-center justify-between text-[10px] text-slate-500 px-1 pt-0.5">
          <span>
            Source: Statistics Canada — Census of Agriculture 2021 & 2016 (Tables 32-10-0153 to
            32-10-0445) & 2021 Digital Boundary Files. Some values are suppressed (&apos;x&apos;) by
            Statistics Canada to meet confidentiality requirements of the Statistics Act.
          </span>
          <span className="font-semibold text-[#0F3D6E]">
            Ontario Federation of Agriculture (OFA) • AgCensus IQ v1.0
          </span>
        </footer>
      </main>

      {/* Global Overlays */}
      {showAiDrawer && (
        <AiNarrativeDrawer
          dataset={dataset}
          selectedGeo={selectedGeo}
          compareGeo={compareGeoB}
          onClose={() => setShowAiDrawer(false)}
        />
      )}

      {showHelpModal && (
        <GuidedCoachMarkModal
          activeModule={activeModule}
          onClose={() => setShowHelpModal(false)}
        />
      )}

      {multiAreaReportGeos && (
        <MultiAreaReportModal
          dataset={dataset}
          initialGeos={multiAreaReportGeos}
          onClose={() => setMultiAreaReportGeos(null)}
        />
      )}

      {showDisclaimerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 max-w-xl w-full p-5">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
              <div className="flex items-center gap-2 text-[#0F3D6E] font-extrabold text-sm uppercase">
                <FileText className="w-4 h-4 text-[#328475]" />
                <span>Empirical Data Sources & Methodology</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDisclaimerModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
              <p>
                <strong>1. Authoritative Statistics Canada Data Cubes:</strong> All metrics in this
                platform are compiled directly from Statistics Canada&apos;s official Web Data Service
                (WDS) Census of Agriculture tables: <code className="text-[#0F3D6E]">32-10-0231-01</code>{' '}
                through <code className="text-[#0F3D6E]">32-10-0382-01</code> (2021),{' '}
                <code className="text-[#0F3D6E]">32-10-0403-01</code> through{' '}
                <code className="text-[#0F3D6E]">32-10-0445-01</code> (2016/2011 sub-provincial
                benchmarks), and <code className="text-[#0F3D6E]">32-10-0153-01</code> through{' '}
                <code className="text-[#0F3D6E]">32-10-0230-01</code> (1976–2021 historical series).
              </p>
              <p>
                <strong>2. Geographic Hierarchy & Boundaries:</strong> Covers all 2,113 Census of
                Agriculture geographies across Canada: Country (1), Provinces & Territories (10),
                Census Agricultural Regions / CAR (72), Counties / Census Divisions / CD (282), and
                Townships / Census Consolidated Subdivisions / CCS (1,748). Boundary polygons and
                centroids are sourced from Statistics Canada&apos;s 2021 Digital Boundary MapServer (
                <code className="text-[#0F3D6E]">EPSG:4326</code>).
              </p>
              <p>
                <strong>3. Confidentiality Suppression (&apos;x&apos;):</strong> Where Statistics Canada
                suppresses a cell to protect individual farm confidentiality under the Statistics
                Act, the platform explicitly displays <code className="text-amber-700">x (Suppressed)</code>{' '}
                and never substitutes synthetic or guessed figures.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDisclaimerModal(false)}
                className="rounded bg-[#0F3D6E] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#164677] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
