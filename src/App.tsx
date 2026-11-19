import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { ActiveModule, AgCensusDataset, GeographyNode } from './types/census';
import {
  enrichNumberedGeographyNames,
  formatDelta,
  formatMetricValue,
  getObservation,
  getRawNumber,
  resolveAppAssetUrl
} from './utils/analytics';
import {
  ProfileJumpTabId,
  searchCharacteristicsSmart,
  searchGeographiesSmart,
  searchOfaProfileShortcuts
} from './utils/laypersonSearch';
import type { ProfileJumpRequest } from './components/modules/AgCountyProfilesModule';
import { AgSnapshotModule } from './components/modules/AgSnapshotModule';
import {
  Aperture,
  ArrowLeftRight,
  ArrowRight,
  Award,
  BarChartBig,
  Compass,
  FileSpreadsheet,
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

const AgExplorerModule = lazy(() =>
  import('./components/modules/AgExplorerModule').then((m) => ({ default: m.AgExplorerModule }))
);
const AgDrilldownModule = lazy(() =>
  import('./components/modules/AgDrilldownModule').then((m) => ({ default: m.AgDrilldownModule }))
);
const AgCompareModule = lazy(() =>
  import('./components/modules/AgCompareModule').then((m) => ({ default: m.AgCompareModule }))
);
const AgRankerModule = lazy(() =>
  import('./components/modules/AgRankerModule').then((m) => ({ default: m.AgRankerModule }))
);
const AgBeltsModule = lazy(() =>
  import('./components/modules/AgBeltsModule').then((m) => ({ default: m.AgBeltsModule }))
);
const AgScoreModule = lazy(() =>
  import('./components/modules/AgScoreModule').then((m) => ({ default: m.AgScoreModule }))
);
const AgCountyProfilesModule = lazy(() =>
  import('./components/modules/AgCountyProfilesModule').then((m) => ({
    default: m.AgCountyProfilesModule
  }))
);
const AgGeoLocatorModule = lazy(() =>
  import('./components/modules/AgGeoLocatorAndOverlays').then((m) => ({
    default: m.AgGeoLocatorModule
  }))
);
const AiNarrativeDrawer = lazy(() =>
  import('./components/modules/AgGeoLocatorAndOverlays').then((m) => ({
    default: m.AiNarrativeDrawer
  }))
);
const GuidedCoachMarkModal = lazy(() =>
  import('./components/modules/AgGeoLocatorAndOverlays').then((m) => ({
    default: m.GuidedCoachMarkModal
  }))
);
const MultiAreaReportModal = lazy(() =>
  import('./components/MultiAreaReportModal').then((m) => ({ default: m.MultiAreaReportModal }))
);

export const App: React.FC = () => {
  const [dataset, setDataset] = useState<AgCensusDataset | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [activeModule, setActiveModule] = useState<ActiveModule>('snapshot');
  const [selectedGeo, setSelectedGeo] = useState<GeographyNode | null>(null);
  const [compareGeoA, setCompareGeoA] = useState<GeographyNode | null>(null);
  const [compareGeoB, setCompareGeoB] = useState<GeographyNode | null>(null);

  // Deep-link state when jumping from Snapshot '+' button or Global Search into Ag Explorer or OFA Profiles
  const [explorerJumpCategory, setExplorerJumpCategory] = useState<string | undefined>(undefined);
  const [explorerJumpLayer2, setExplorerJumpLayer2] = useState<string | undefined>(undefined);
  const [profileJumpRequest, setProfileJumpRequest] = useState<ProfileJumpRequest | null>(null);

  const openOfaProfile = (options?: {
    profileId?: string;
    tab?: ProfileJumpTabId;
    historyQuery?: string;
  }) => {
    setProfileJumpRequest({
      profileId: options?.profileId,
      tab: options?.tab,
      historyQuery: options?.historyQuery,
      ts: Date.now()
    });
    setActiveModule('profiles');
  };

  // Global Omnibox Search state ("Find Any Area or Data Topic")
  const [omniboxQuery, setOmniboxQuery] = useState<string>('');
  const [omniboxOpen, setOmniboxOpen] = useState<boolean>(false);

  // Overlays ('?' coach-marks, 'A' AI summary drawer, Disclaimer modal, Multi-Area Report Builder)
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showAiDrawer, setShowAiDrawer] = useState<boolean>(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState<boolean>(false);
  const [multiAreaReportGeos, setMultiAreaReportGeos] = useState<GeographyNode[] | null>(null);

  useEffect(() => {
    if (!showDisclaimerModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDisclaimerModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showDisclaimerModal]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(resolveAppAssetUrl('/data/ag_census_data.json'), { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading ag_census_data.json`);
        return res.json();
      })
      .then((data: AgCensusDataset) => {
        if (controller.signal.aborted) return;
        enrichNumberedGeographyNames(data.geographies);
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
        if (controller.signal.aborted) return;
        setLoadingError(String(err));
      });
    return () => controller.abort();
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

  const omniboxProfileShortcuts = useMemo(() => {
    if (!omniboxQuery.trim()) return [];
    return searchOfaProfileShortcuts(omniboxQuery, 4);
  }, [omniboxQuery]);

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
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F4F5F7]">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 bg-[#D7182A] flex items-center justify-center text-white shadow-md animate-pulse"
            style={{ borderRadius: '25%' }}
          >
            <Wheat className="w-6 h-6" />
          </div>
          <div>
            <div className="text-base font-extrabold text-[#334B58] tracking-tight">
              AGCENSUS IQ • OFA INTELLIGENCE PLATFORM
            </div>
            <div className="text-xs text-slate-500">
              Loading 2,113 Canadian Geographies &amp; 244 Empirical StatCan Census of Agriculture Metrics...
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
      label: 'Overview — At-a-glance agricultural summary, provincial ranks & 1-page factsheet',
      shortTitle: 'Overview',
      icon: <Aperture className="w-5 h-5" />
    },
    {
      id: 'profiles',
      label: 'OFA Profiles — Full 8-tab Ontario County & OFA Zone profiles, Townships, Tax, Soil, Broadband & Excel (.xlsx)',
      shortTitle: 'OFA Profiles',
      icon: <FileSpreadsheet className="w-5 h-5" />
    },
    {
      id: 'geolocator',
      label: 'Area Finder — Look up any town, village, township, county, OFA area, or commodity',
      shortTitle: 'Area Finder',
      icon: <Compass className="w-5 h-5" />
    },
    {
      id: 'explorer',
      label: 'Topic Charts — Detailed breakdowns & 1976–2021 historical trends across 10 farm topics',
      shortTitle: 'Topic Charts',
      icon: <Lightbulb className="w-5 h-5" />
    },
    {
      id: 'compare',
      label: 'Compare 2 — Head-to-head comparison of any two counties, townships, or provinces',
      shortTitle: 'Compare 2',
      icon: <ArrowLeftRight className="w-5 h-5" />
    },
    {
      id: 'ranker',
      label: 'Rankings — Rank counties or townships from #1 to #49 on any crop, livestock, or financial metric',
      shortTitle: 'Rankings',
      icon: <BarChartBig className="w-5 h-5" />
    },
    {
      id: 'belts',
      label: 'Crop Maps — Publication-ready dominant crop, livestock & regional heat maps',
      shortTitle: 'Crop Maps',
      icon: <MapIcon className="w-5 h-5" />
    },
    {
      id: 'drilldown',
      label: 'Multi-Filter — Find areas matching 2–3 farm traits + official income & education tables',
      shortTitle: 'Multi-Filter',
      icon: <Filter className="w-5 h-5" />
    },
    {
      id: 'agscore',
      label: 'Scorecard — Build a custom 0–100 county scorecard combining up to 4 farm traits',
      shortTitle: 'Scorecard',
      icon: <Award className="w-5 h-5" />
    }
  ];

  return (
    <div className="min-h-screen md:h-screen w-screen flex bg-[#F3F1EC] overflow-x-hidden md:overflow-hidden">
      {/* Desktop/Tablet Left Navigation Rail — 2025-26 OFA Brand Identity (hidden on small mobile phones so charts get 100% width) */}
      <aside className="no-print hidden md:flex md:w-[74px] shrink-0 bg-[#EDE6DE] border-r border-slate-300/80 flex-col items-center justify-between py-2.5 z-30 select-none overflow-y-auto">
        {/* Top Brand Emblem (OFA Crimson Squircle: radius = 25% of width) */}
        <div className="flex flex-col items-center gap-2.5 w-full">
          <div
            onClick={() => setActiveModule('snapshot')}
            className="flex flex-col items-center cursor-pointer group"
            title="AgCensus IQ — Ontario Federation of Agriculture (OFA) Data Intelligence"
          >
            <span className="font-display text-[10.5px] font-extrabold tracking-tight text-[#D7182A]">
              OFA
            </span>
            <div className="w-10 h-10 rounded-[10px] bg-[#D7182A] text-white flex items-center justify-center shadow-sm group-hover:bg-[#B51222] transition">
              <Wheat className="w-5 h-5" />
            </div>
          </div>

          <div className="w-8 h-px bg-slate-300" />

          {/* 9 Plain-English Modules */}
          <nav className="flex flex-col items-center gap-1 w-full px-1">
            {navItems.map((item) => {
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveModule(item.id)}
                  title={item.label}
                  className={`
                    w-full py-1.5 px-0.5 rounded-lg flex flex-col items-center justify-center gap-0.5
                    transition cursor-pointer relative
                    ${
                      isActive
                        ? 'bg-white text-[#334B58] shadow-xs font-bold border border-slate-300/80 ring-1 ring-[#D7182A]/20'
                        : 'text-slate-600 hover:bg-white/70 hover:text-[#334B58]'
                    }
                  `}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-[#D7182A]" />
                  )}
                  <span className={isActive ? 'text-[#D7182A]' : ''}>{item.icon}</span>
                  <span className="text-[9.5px] tracking-tight leading-tight mt-0.5 text-center">
                    {item.shortTitle}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom 3 Global Utility Icons ('?', 'A', Disclaimer/Info) */}
        <div className="flex flex-col items-center gap-1.5 w-full px-2 pt-2 border-t border-slate-300/80">
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            title="Guided Module Walkthrough (?)"
            className={`w-10 h-8 rounded-lg flex items-center justify-center transition cursor-pointer ${
              showHelpModal
                ? 'bg-[#334B58] text-white'
                : 'text-slate-600 hover:bg-white hover:text-[#334B58]'
            }`}
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowAiDrawer((p) => !p)}
            title="AI Executive Policy Summary Drawer (A)"
            className={`w-10 h-8 rounded-lg flex items-center justify-center font-serif font-extrabold text-sm border transition cursor-pointer ${
              showAiDrawer
                ? 'bg-[#334B58] text-white border-[#334B58]'
                : 'border-slate-400 text-slate-700 hover:bg-white hover:text-[#334B58]'
            }`}
          >
            A
          </button>

          <button
            type="button"
            onClick={() => setShowDisclaimerModal(true)}
            title="Statistics Canada Data Sources, Methodology & Withholding Notes"
            className="w-10 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-white hover:text-[#334B58] transition cursor-pointer"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Mobile Sticky Bottom Navigation Bar (<768px) — Frees 100% of Phone Width for Content */}
      <nav
        aria-label="Mobile Navigation"
        className="no-print md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#334B58] text-white border-t-2 border-[#D7182A] flex items-center overflow-x-auto px-1.5 py-1 gap-1 shadow-2xl"
      >
        {navItems.map((item) => {
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveModule(item.id)}
              className={`shrink-0 px-2.5 py-1 rounded flex flex-col items-center justify-center gap-0.5 cursor-pointer transition ${
                isActive ? 'bg-[#D7182A] text-white font-bold' : 'text-[#EDE6DE] hover:bg-white/10'
              }`}
            >
              <span className="scale-90">{item.icon}</span>
              <span className="text-[10px] leading-none whitespace-nowrap">{item.shortTitle}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Content Canvas — Smooth vertical scroll on all laptop heights (fixes 1280×720 150%-scaling clipping) */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto p-2.5 pb-16 md:pb-2.5 gap-2">
        {/* Top Bar with OFA Pickled Bluewood Chrome + Crimson Accent */}
        <div className="no-print relative flex flex-wrap items-center justify-between gap-2 bg-[#334B58] text-white px-3 py-1.5 rounded-md text-xs shadow-xs z-40 border-b-2 border-[#D7182A]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-extrabold tracking-wide uppercase text-[11px] text-[#EDE6DE]">
              AgCensus IQ • OFA
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
                        ? 'bg-[#D7182A] text-white font-bold shadow-xs'
                        : 'bg-white/10 text-slate-100 hover:bg-white/20'
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
            <Search className="w-3.5 h-3.5 text-[#EDE6DE] absolute left-2.5 top-1.5 pointer-events-none" />
            <input
              type="text"
              value={omniboxQuery}
              onFocus={() => setOmniboxOpen(true)}
              onChange={(e) => {
                setOmniboxQuery(e.target.value);
                setOmniboxOpen(true);
              }}
              placeholder="Find any Area (e.g. East Nipissing, Powassan) or Data (e.g. Beef, Hay)..."
              className="w-full rounded bg-white/15 hover:bg-white/20 focus:bg-white text-white focus:text-slate-900 placeholder:text-slate-200/85 focus:placeholder:text-slate-400 pl-8 pr-7 py-1 text-[11px] font-medium border border-white/25 focus:border-white focus:outline-none transition"
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
                  <span className="font-bold text-[#334B58]">
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
                  <div className="bg-[#FEF2F2] px-3 py-2 border-b border-[#D7182A]/25 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#334B58]">
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
                        className="rounded bg-[#334B58] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#243640] cursor-pointer shrink-0"
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
                        className="rounded bg-[#D7182A] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#B51222] cursor-pointer shrink-0"
                      >
                        Compare Side-by-Side →
                      </button>
                    </div>
                  </div>
                )}

                {/* 1-Click OFA Zone & Deep Profile Topic Shortcuts (e.g., "OFA Zone 7", "Tile Drainage", "Broadband", "Property Tax") */}
                {omniboxProfileShortcuts.length > 0 && (
                  <div className="bg-[#EDE6DE]/60 px-3 py-2 border-b border-slate-200 space-y-1">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#334B58]">
                      OFA Profiles &amp; Deep Data Shortcuts
                    </div>
                    {omniboxProfileShortcuts.map((sc) => (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => {
                          let targetProfileId = sc.profileId;
                          if (!targetProfileId && selectedGeo.provinceCode === '35') {
                            if (selectedGeo.level === 'Counties / Census Divisions (CD)') {
                              targetProfileId = `CD_${selectedGeo.id.slice(-4)}`;
                            } else if (selectedGeo.level === 'Townships / Subdivisions (CCS)') {
                              targetProfileId = `CD_${selectedGeo.id.slice(-7, -3)}`;
                            }
                          }
                          openOfaProfile({
                            profileId: targetProfileId,
                            tab: sc.tab,
                            historyQuery: sc.historyQuery
                          });
                          setOmniboxOpen(false);
                          setOmniboxQuery('');
                        }}
                        className="w-full text-left rounded bg-white hover:bg-[#FEF2F2] border border-slate-200 hover:border-[#D7182A]/40 px-2.5 py-1.5 transition flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#334B58] truncate">{sc.title}</div>
                          <div className="text-[10.5px] text-slate-500 truncate">{sc.subtitle}</div>
                        </div>
                        <span className="shrink-0 rounded bg-[#D7182A] px-2 py-0.5 text-[10px] font-bold text-white">
                          {sc.badge} →
                        </span>
                      </button>
                    ))}
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
                              className="w-full text-left px-2 py-1.5 rounded hover:bg-[#334B58]/10 transition flex items-start justify-between gap-1 cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-[#334B58] truncate">
                                  {geo.name}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate">
                                  {geo.hierarchyPath}
                                </div>
                                {(matchReason || geo.ofaFederation) && (
                                  <div className="text-[10px] font-semibold text-[#D7182A] truncate flex items-center gap-1">
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
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#D7182A] px-1.5 mb-1">
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
                          const delta = formatDelta(obs.pctChange, c.unit);
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
                              className="w-full text-left px-2 py-1.5 rounded hover:bg-[#D7182A]/10 transition flex items-center justify-between gap-2 cursor-pointer"
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
                                <div className="text-xs font-extrabold text-[#334B58]">
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
                    className="font-bold text-[#334B58] hover:underline flex items-center gap-0.5 cursor-pointer"
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
              className="inline-flex items-center gap-1 rounded bg-[#D7182A] hover:bg-[#B51222] px-2.5 py-0.5 font-bold text-white cursor-pointer transition shadow-2xs"
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
        <div className="flex-1" onClick={() => omniboxOpen && setOmniboxOpen(false)}>
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
              onOpenCountyProfile={(opts) => openOfaProfile(opts)}
              onNavigateModule={(mod) => setActiveModule(mod)}
            />
          )}

          {activeModule !== 'snapshot' && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center min-h-[320px] rounded-md bg-white border border-slate-200/90 text-xs font-semibold text-[#334B58]">
                  Loading module…
                </div>
              }
            >
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

              {activeModule === 'profiles' && (
                <AgCountyProfilesModule
                  selectedGeo={selectedGeo}
                  jumpRequest={profileJumpRequest}
                />
              )}
            </Suspense>
          )}
        </div>

        {/* Footer Citation Bar — OFA Brand Identity */}
        <footer className="no-print flex flex-wrap items-center justify-between text-[10.5px] text-slate-500 px-1 pt-1 shrink-0">
          <span>
            Source: Statistics Canada — Census of Agriculture 2021 &amp; 2016 (Tables 32-10-0153 to
            32-10-0445) &amp; 2021 Digital Boundary Files. Withheld cells are marked &apos;x&apos; or &apos;F&apos;.
          </span>
          <span className="font-bold text-[#334B58]">
            Ontario Federation of Agriculture (OFA) • <span className="text-[#D7182A]">Farms and Food Forever</span>
          </span>
        </footer>
      </main>

      {/* Global Overlays */}
      {showAiDrawer && (
        <Suspense fallback={null}>
          <AiNarrativeDrawer
            dataset={dataset}
            selectedGeo={selectedGeo}
            onClose={() => setShowAiDrawer(false)}
          />
        </Suspense>
      )}

      {showHelpModal && (
        <Suspense fallback={null}>
          <GuidedCoachMarkModal
            activeModule={activeModule}
            onClose={() => setShowHelpModal(false)}
          />
        </Suspense>
      )}

      {multiAreaReportGeos && (
        <Suspense fallback={null}>
          <MultiAreaReportModal
            dataset={dataset}
            initialGeos={multiAreaReportGeos}
            onClose={() => setMultiAreaReportGeos(null)}
          />
        </Suspense>
      )}

      {showDisclaimerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 max-w-xl w-full p-5">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
              <div className="flex items-center gap-2 text-[#334B58] font-extrabold text-sm uppercase">
                <FileText className="w-4 h-4 text-[#D7182A]" />
                <span>Empirical Data Sources &amp; Methodology</span>
              </div>
              <button
                type="button"
                aria-label="Close methodology modal"
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
                (WDS) Census of Agriculture tables: <code className="text-[#334B58]">32-10-0231-01</code>{' '}
                through <code className="text-[#334B58]">32-10-0382-01</code> (2021),{' '}
                <code className="text-[#334B58]">32-10-0403-01</code> through{' '}
                <code className="text-[#334B58]">32-10-0445-01</code> (2016/2011 sub-provincial
                benchmarks), and <code className="text-[#334B58]">32-10-0153-01</code> through{' '}
                <code className="text-[#334B58]">32-10-0230-01</code> (1976–2021 historical series).
              </p>
              <p>
                <strong>2. Geographic Hierarchy &amp; Boundaries:</strong> Covers all 2,113 Census of
                Agriculture geographies across Canada: Country (1), Provinces &amp; Territories (10),
                Census Agricultural Regions / CAR (72), Counties / Census Divisions / CD (282), and
                Townships / Census Consolidated Subdivisions / CCS (1,748). Boundary polygons and
                centroids are sourced from Statistics Canada&apos;s 2021 Digital Boundary MapServer (
                <code className="text-[#334B58]">EPSG:4326</code>).
              </p>
              <p>
                <strong>3. Confidentiality &amp; Quality Withholding (&apos;x&apos; / &apos;F&apos;):</strong>{' '}
                Where Statistics Canada withholds a cell under the Statistics Act (&apos;x&apos;) or due
                to small-area sample variability (&apos;F&apos;), the platform explicitly displays{' '}
                <code className="text-amber-700">Withheld (x)</code> or{' '}
                <code className="text-amber-700">Withheld (F)</code> and never substitutes synthetic
                or guessed figures.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDisclaimerModal(false)}
                className="rounded bg-[#334B58] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#243640] cursor-pointer"
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
