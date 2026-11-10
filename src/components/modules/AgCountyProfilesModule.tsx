import React, { useEffect, useMemo, useState } from 'react';
import { GeographyNode } from '../../types/census';
import { resolveAppAssetUrl } from '../../utils/analytics';
import {
  AlertTriangle,
  Archive,
  Building2,
  FileDown,
  FileSpreadsheet,
  Landmark,
  Layers,
  MapPin,
  Printer,
  Search,
  Sprout,
  TrendingUp,
  Users,
  Wifi
} from 'lucide-react';

interface CommodityFcrRow {
  id: string;
  label: string;
  isTotal: boolean;
  val2021: number;
  val2023: number;
  val2024: number;
  val2025: number;
  shareOfGeo2024Pct: number | null;
  ontShare2024Pct: number | null;
  series: Record<string, number>;
}

interface FieldCropRow {
  cropId: string;
  cropName: string;
  latestYear: number;
  seededAcres: number | null;
  harvestedAcres: number | null;
  yield: number | null;
  yield5YrAvg: number | null;
  yieldUom: string;
  productionTonnes: number | null;
  productionImperial: number | null;
  ontProductionSharePct: number | null;
  harvestedSeries: Record<string, number>;
  yieldSeries: Record<string, number>;
}

interface BusinessCountRow {
  id: string;
  label: string;
  isRollup: boolean;
  net2016: number | null;
  net2021: number | null;
  net2022: number | null;
  net2023: number | null;
  withoutEmp2023: number | null;
  withEmp2023: number | null;
  change2016To2023Pct: number | null;
}

interface WorkforceDayNightRow {
  label: string;
  day2016: number | null;
  night2016: number | null;
  day2021: number | null;
  night2021: number | null;
  netInflow2021: number | null;
  changeDayPct: number | null;
}

interface TownshipRow {
  code: string;
  name: string;
  cdCode: string;
  zoneId: string;
  farms2021: number | null;
  farms2016: number | null;
  farmsChangePct: number | null;
  farmlandAcres2021: number | null;
  croplandAcres2021: number | null;
  grossReceipts2020: number | null;
  operatingExpenses2020: number | null;
  netMarginPct2020: number | null;
  totalCapital2021: number | null;
  operators2021: number | null;
  avgOperatorAge2021: number | null;
  successionPct2021: number | null;
  directSalesPct2021: number | null;
  broadband50_10Pct: number | null;
  broadbandWired50_10Pct: number | null;
  greenbeltAcres: number | null;
  farmlandCva2024: number | null;
  farmlandTax2024: number | null;
  population2021: number | null;
  agrifoodJobsDay2021: number | null;
  agrifoodBiz2023: number | null;
}

interface AgCensusSeriesRow {
  id: string;
  label: string;
  uom: string;
  v2006: number | null;
  f2006: string;
  v2011: number | null;
  f2011: string;
  v2016: number | null;
  f2016: string;
  v2021: number | null;
  f2021: string;
  chg16To21Pct: number | null;
  chg06To21Pct: number | null;
  ontShare2021Pct: number | null;
}

interface LocalFoodItemRow {
  id: string;
  item: string;
  unit: string;
  estConsumptionKg2021: number | null;
  requiredBase2021: number | null;
  actualLocalBase2021: number | null;
  localFlag: string;
  selfSufficiencyPct2021: number | null;
}

interface HouseholdExpRow {
  id: string;
  label: string;
  dollarsPerHousehold2021: number | null;
}

interface ProfileExecutiveSummary {
  farms2021: number | null;
  farms2016: number | null;
  farmsChangePct: number | null;
  farmsRank: number | null;
  farmsRankOutOf: number | null;
  farmsOntSharePct: number | null;
  farmlandAcres2021: number | null;
  farmlandAcres2016: number | null;
  farmlandChangePct: number | null;
  croplandAcres2021: number | null;
  croplandShareOfFarmlandPct: number | null;
  avgFarmSizeAcres2021: number | null;
  ownedAcres2021: number | null;
  rentedAcres2021: number | null;
  ownedSharePct2021: number | null;
  censusGrossReceipts2020: number | null;
  censusGrossReceipts2015: number | null;
  censusReceiptsChangePct: number | null;
  censusReceiptsRank: number | null;
  censusReceiptsOntSharePct: number | null;
  censusOperatingExpenses2020: number | null;
  censusOperatingExpenses2015: number | null;
  censusNetCashIncome2020: number | null;
  censusNetMarginPct2020: number | null;
  censusExpenseToRevenueRatioPct: number | null;
  avgReceiptsPerFarm2020: number | null;
  omafaFcr2021: number | null;
  omafaFcr2024: number | null;
  omafaFcr2025: number | null;
  omafaFcrRank2024: number | null;
  omafaFcrOntSharePct2024: number | null;
  totalFarmCapital2021: number | null;
  totalFarmCapital2016: number | null;
  capitalPerFarm2021: number | null;
  capitalPerAcre2021: number | null;
  totalOperators2021: number | null;
  avgOperatorAge2021: number | null;
  operatorsUnder35Pct2021: number | null;
  operators55PlusPct2021: number | null;
  femaleOperatorsPct2021: number | null;
  writtenSuccessionPlanFarms2021: number | null;
  writtenSuccessionPlanPct2021: number | null;
  directSalesFarms2021: number | null;
  directSalesPct2021: number | null;
  renewableEnergyFarms2021: number | null;
  renewableEnergyPct2021: number | null;
  solarFarms2021: number | null;
  windFarms2021: number | null;
  bioenergyFarms2021: number | null;
  autosteerFarms2021: number | null;
  roboticMilkerFarms2021: number | null;
  paidLabourFarms2021: number | null;
  paidWorkersTotal2021: number | null;
  noTillSharePct2021: number | null;
  coverCropsFarms2021: number | null;
  population2021: number | null;
  population2016: number | null;
  population2011: number | null;
  populationChange2016To2021Pct: number | null;
  avgHouseholdIncome2021: number | null;
  agrifoodJobsDay2021: number | null;
  agrifoodJobsNight2021: number | null;
  agrifoodShareOfDayJobsPct2021: number | null;
  agrifoodShareOfNightJobsPct2021: number | null;
  agrifoodBizLocations2023: number | null;
  primaryAgBizLocations2023: number | null;
  foodBevMfgBizLocations2023: number | null;
  firYear: number;
  farmlandCvaDollars: number | null;
  farmlandTotalTaxDollars: number | null;
  farmlandMunicipalTaxDollars: number | null;
  farmlandEducationTaxDollars: number | null;
  farmlandShareOfTotalCvaPct: number | null;
  farmlandShareOfTotalTaxPct: number | null;
  effectiveFarmlandTaxRatePer1000Cva: number | null;
  primeSoilClass1To3Acres: number | null;
  primeSoilSharePct: number | null;
  cliClass1Acres: number | null;
  cliClass2Acres: number | null;
  cliClass3Acres: number | null;
  cliClass4To7Acres: number | null;
  cliOrganicAcres: number | null;
  greenbeltAcres: number | null;
  greenbeltShareLandPct: number | null;
  greenbeltSpecialtyCropAcres: number | null;
  broadbandEvaluatedHouseholds: number | null;
  broadband50_10Pct: number | null;
  broadbandWired50_10Pct: number | null;
  broadbandWithGovProjects50_10Pct: number | null;
  broadbandUnderservedHouseholds: number | null;
  broadbandLteMobilePct: number | null;
  topCommoditiesFcr2024: CommodityFcrRow[];
}

type CompactAcoTuple = [
  number,
  number | null,
  string,
  number | null,
  string,
  number | null,
  string,
  number | null,
  string,
  number | null,
  number | null,
  number | null
];

interface OfaProfile2 {
  id: string;
  type: 'CD' | 'OFA_ZONE' | 'PROVINCE';
  code: string;
  dguid: string;
  name: string;
  zoneId: string;
  zoneName: string;
  federations: string[];
  footnote: string | null;
  excelFilename: string;
  excelDownloadUrl: string;
  executiveSummary: ProfileExecutiveSummary;
  townships: TownshipRow[];
  agCensusOverTime: Array<AgCensusSeriesRow | CompactAcoTuple>;
  fcrCommodities: CommodityFcrRow[];
  fieldCrops: FieldCropRow[];
  businessCounts: BusinessCountRow[];
  workforceDayNight: WorkforceDayNightRow[];
  firHistory: Record<string, Record<string, number>>;
  localFoodAndSpendingEst: {
    householdFoodExp2021: HouseholdExpRow[];
    localFoodSelfSufficiency2021: LocalFoodItemRow[];
  };
}

interface MasterProfilesPayload {
  generatedAt: string;
  version: string;
  ontarioId: string;
  cdOrder: string[];
  zoneOrder: string[];
  acoCatalog?: Array<[string, string, string]>;
  profiles: Record<string, OfaProfile2>;
}

type ProfileTab =
  | 'summary'
  | 'townships'
  | 'fcr'
  | 'crops'
  | 'biz_workforce'
  | 'tax_land_broadband'
  | 'ag_history'
  | 'food_est';

function fmtInt(v: number | null | undefined, fallback = '—'): string {
  if (v === null || v === undefined || Number.isNaN(v)) return fallback;
  return Math.round(v).toLocaleString('en-CA');
}

function fmtHistoryVal(v: number | null | undefined, flag: string, uom: string): string {
  if (v === null || v === undefined || Number.isNaN(v)) return flag || '—';
  if (uom === 'dollars') return `$${Math.round(v).toLocaleString('en-CA')}`;
  if (uom === 'years') return v.toFixed(1);
  return Math.round(v).toLocaleString('en-CA');
}

function fmtCurrencyCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs).toLocaleString('en-CA')}`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtDollarsFull(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `$${Math.round(v).toLocaleString('en-CA')}`;
}

function fmtPct(v: number | null | undefined, decimals = 1, signed = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const prefix = signed && v > 0 ? '+' : '';
  return `${prefix}${v.toFixed(decimals)}%`;
}

interface AgCountyProfilesModuleProps {
  selectedGeo: GeographyNode;
}

export const AgCountyProfilesModule: React.FC<AgCountyProfilesModuleProps> = ({ selectedGeo }) => {
  const [payload, setPayload] = useState<MasterProfilesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string>('CD_3540');
  const [activeTab, setActiveTab] = useState<ProfileTab>('summary');
  const [scopeFilter, setScopeFilter] = useState<'CD' | 'OFA_ZONE' | 'PROVINCE'>('CD');
  const [searchText, setSearchText] = useState<string>('');
  const [historyFilter, setHistoryFilter] = useState<string>('');
  const [showAllHistory, setShowAllHistory] = useState<boolean>(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(resolveAppAssetUrl('/data/ofa_county_profiles_2_0.json'), { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} loading ofa_county_profiles_2_0.json`);
        return r.json();
      })
      .then((data: MasterProfilesPayload) => {
        setPayload(data);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setError(String(err));
      });
    return () => controller.abort();
  }, []);

  // Sync when global selectedGeo changes to an Ontario County, Township, or Province
  useEffect(() => {
    if (!payload || !selectedGeo) return;
    if (selectedGeo.provinceCode !== '35') return;
    if (selectedGeo.level === 'Provinces & Territories') {
      setScopeFilter('PROVINCE');
      setActiveProfileId('PROVINCE_35');
    } else if (selectedGeo.level === 'Counties / Census Divisions (CD)') {
      const cdCode = selectedGeo.id.slice(-4);
      if (payload.profiles[`CD_${cdCode}`]) {
        setScopeFilter('CD');
        setActiveProfileId(`CD_${cdCode}`);
      }
    } else if (selectedGeo.level === 'Townships / Subdivisions (CCS)') {
      const cdCode = selectedGeo.id.slice(-7, -3);
      if (payload.profiles[`CD_${cdCode}`]) {
        setScopeFilter('CD');
        setActiveProfileId(`CD_${cdCode}`);
      }
    }
  }, [payload, selectedGeo]);

  const filteredProfileIds = useMemo(() => {
    if (!payload) return [];
    const baseIds =
      scopeFilter === 'CD'
        ? payload.cdOrder
        : scopeFilter === 'OFA_ZONE'
          ? payload.zoneOrder
          : [payload.ontarioId];
    const q = searchText.trim().toLowerCase();
    if (!q) return baseIds;
    return Object.keys(payload.profiles).filter((pid) => {
      const p = payload.profiles[pid];
      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.federations.some((f) => f.toLowerCase().includes(q)) ||
        p.townships.some((t) => t.name.toLowerCase().includes(q))
      );
    });
  }, [payload, scopeFilter, searchText]);

  const profile: OfaProfile2 | null = useMemo(() => {
    if (!payload) return null;
    return payload.profiles[activeProfileId] || payload.profiles['CD_3540'] || null;
  }, [payload, activeProfileId]);

  const hydratedHistory: AgCensusSeriesRow[] = useMemo(() => {
    if (!profile) return [];
    const catalog = payload?.acoCatalog;
    return profile.agCensusOverTime.map((item) => {
      if (!Array.isArray(item)) return item;
      const meta = catalog?.[item[0]] || [`aco_${item[0]}`, `Indicator #${item[0]}`, 'farms'];
      return {
        id: meta[0],
        label: meta[1],
        uom: meta[2],
        v2006: item[1],
        f2006: item[2],
        v2011: item[3],
        f2011: item[4],
        v2016: item[5],
        f2016: item[6],
        v2021: item[7],
        f2021: item[8],
        chg16To21Pct: item[9],
        chg06To21Pct: item[10],
        ontShare2021Pct: item[11]
      };
    });
  }, [profile, payload]);

  const filteredHistory = useMemo(() => {
    const q = historyFilter.trim().toLowerCase();
    if (!q) return hydratedHistory;
    return hydratedHistory.filter(
      (r) => r.label.toLowerCase().includes(q) || r.uom.toLowerCase().includes(q)
    );
  }, [hydratedHistory, historyFilter]);

  const visibleHistory = useMemo(() => {
    if (showAllHistory || historyFilter.trim().length > 0) return filteredHistory;
    return filteredHistory.slice(0, 250);
  }, [filteredHistory, showAllHistory, historyFilter]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-lg p-5 max-w-md text-center shadow-sm">
          <div className="text-sm font-bold text-red-700 mb-1">
            Unable to Load OFA County & Zone Profiles 2.0
          </div>
          <div className="text-xs text-slate-600">{error}</div>
        </div>
      </div>
    );
  }

  if (!payload || !profile) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xs font-semibold text-[#0F3D6E] animate-pulse">
          Loading OFA County & Zone Profiles 2.0 (49 Counties, 15 OFA Zones & 273 Townships)...
        </div>
      </div>
    );
  }

  const es = profile.executiveSummary;
  const maxTopComm = Math.max(1, ...(es.topCommoditiesFcr2024.map((c) => c.val2024) || [1]));
  const fir24 = profile.firHistory['2024'] || {};
  const fir23 = profile.firHistory['2023'] || {};
  const fir21 = profile.firHistory['2021'] || {};

  const subTabs: Array<{ id: ProfileTab; label: string; badge?: string }> = [
    { id: 'summary', label: '1. Executive Summary' },
    { id: 'townships', label: `2. Townships (${profile.townships.length})` },
    { id: 'fcr', label: '3. Farm Cash Receipts (2018–25)' },
    { id: 'crops', label: `4. Field Crop Yields (${profile.fieldCrops.length})` },
    { id: 'biz_workforce', label: '5. Businesses & Day/Night Jobs' },
    { id: 'tax_land_broadband', label: '6. Tax, Prime Soil & Broadband' },
    { id: 'ag_history', label: '7. Ag Census (2006–2021)' },
    { id: 'food_est', label: '8. Local Food Est.', badge: 'Estimate' }
  ];

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      {/* Interactive Screen View */}
      <div className="no-print h-full flex flex-col lg:flex-row gap-2.5 min-h-0">
        {/* Left Geography / Zone Selector Rail */}
        <div className="w-full lg:w-68 shrink-0 bg-white rounded-lg border border-slate-200/90 shadow-2xs flex flex-col overflow-hidden max-h-64 lg:max-h-none">
          <div className="p-2.5 bg-[#0F3D6E] text-white">
            <div className="text-[11px] font-extrabold uppercase tracking-wide flex items-center justify-between">
              <span>OFA Profiles 2.0</span>
              <span className="text-[10px] bg-white/15 px-1.5 py-0.5 rounded font-semibold">
                65 Workbooks
              </span>
            </div>
            <div className="text-[10px] text-slate-200 mt-0.5">
              Zero-error County, OFA Zone & Township Intelligence
            </div>

            <div className="grid grid-cols-3 gap-1 mt-2">
              <button
                type="button"
                onClick={() => {
                  setScopeFilter('CD');
                  setSearchText('');
                  if (!activeProfileId.startsWith('CD_')) setActiveProfileId('CD_3540');
                }}
                className={`py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                  scopeFilter === 'CD'
                    ? 'bg-white text-[#0F3D6E]'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                Counties (49)
              </button>
              <button
                type="button"
                onClick={() => {
                  setScopeFilter('OFA_ZONE');
                  setSearchText('');
                  if (!activeProfileId.startsWith('OFA_ZONE_')) {
                    const targetZone =
                      profile.zoneId && profile.zoneId.startsWith('OFA_Z')
                        ? `OFA_ZONE_${profile.zoneId}`
                        : 'OFA_ZONE_OFA_Z07';
                    setActiveProfileId(targetZone);
                  }
                }}
                className={`py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                  scopeFilter === 'OFA_ZONE'
                    ? 'bg-white text-[#0F3D6E]'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                OFA Zones (15)
              </button>
              <button
                type="button"
                onClick={() => {
                  setScopeFilter('PROVINCE');
                  setSearchText('');
                  setActiveProfileId('PROVINCE_35');
                }}
                className={`py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                  scopeFilter === 'PROVINCE'
                    ? 'bg-white text-[#0F3D6E]'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                Ontario
              </button>
            </div>

            <div className="relative mt-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search county, zone, township..."
                className="w-full rounded bg-white text-slate-800 placeholder-slate-400 pl-7 pr-2 py-1 text-[11px] focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-1">
            {filteredProfileIds.map((pid) => {
              const item = payload.profiles[pid];
              if (!item) return null;
              const isSelected = item.id === profile.id;
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setActiveProfileId(pid)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md transition cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#0F3D6E]/10 text-[#0F3D6E] font-bold border border-[#0F3D6E]/25'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs truncate">{item.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {item.type === 'CD'
                        ? `CD ${item.code} • ${item.zoneName}`
                        : item.type === 'OFA_ZONE'
                          ? `${item.federations.join(', ')}`
                          : 'Provincial Benchmark'}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                    {fmtInt(item.executiveSummary.farms2021)} farms
                  </span>
                </button>
              );
            })}
          </div>

          <div className="p-2 border-t border-slate-200 bg-slate-50 space-y-1">
            <a
              href={resolveAppAssetUrl('/downloads/county_profiles_2_0/OFA_County_and_Zone_Profiles_2_0_All_65_Workbooks.zip')}
              download
              className="w-full inline-flex items-center justify-center gap-1.5 rounded bg-[#1E6B5E] hover:bg-[#175449] text-white text-[11px] font-bold py-1.5 px-2.5 transition shadow-2xs"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>All 65 Excel Workbooks (.zip)</span>
            </a>
            <a
              href={resolveAppAssetUrl('/downloads/county_profiles_2_0/OFA_County_and_Zone_Profiles_2_0_All_65_FactSheets_PDF.zip')}
              download
              className="w-full inline-flex items-center justify-center gap-1.5 rounded bg-[#0F3D6E] hover:bg-[#164B84] text-white text-[11px] font-bold py-1.5 px-2.5 transition shadow-2xs"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>All 65 PDF Fact Sheets (.zip)</span>
            </a>
          </div>
        </div>

        {/* Main Profile Content Area */}
        <div className="flex-1 min-w-0 flex flex-col gap-2 min-h-0 overflow-hidden">
          {/* Executive Profile Header Card */}
          <div className="bg-white rounded-lg border border-slate-200/90 shadow-2xs p-3 shrink-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#0F3D6E] text-white text-[10px] font-extrabold uppercase tracking-wider">
                    {profile.type === 'CD'
                      ? `Census Division ${profile.code}`
                      : profile.type === 'OFA_ZONE'
                        ? 'OFA Regional Zone'
                        : 'Province of Ontario'}
                  </span>
                  {profile.type === 'CD' && profile.zoneId.startsWith('OFA_Z') && (
                    <button
                      type="button"
                      onClick={() => {
                        if (payload.profiles[`OFA_ZONE_${profile.zoneId}`]) {
                          setScopeFilter('OFA_ZONE');
                          setActiveProfileId(`OFA_ZONE_${profile.zoneId}`);
                        }
                      }}
                      className="px-2 py-0.5 rounded bg-[#1E6B5E]/10 text-[#1E6B5E] hover:bg-[#1E6B5E]/20 text-[10px] font-bold cursor-pointer transition"
                      title="Click to open parent OFA Zone profile"
                    >
                      {profile.zoneName} →
                    </button>
                  )}
                  <span className="text-[11px] text-slate-500 font-medium">
                    Federation(s):{' '}
                    <strong className="text-slate-700">{profile.federations.join(' • ')}</strong>
                  </span>
                </div>
                <h1 className="text-lg font-extrabold text-[#0F3D6E] tracking-tight mt-1">
                  {profile.name} — OFA Agri-Food & Rural Profile 2.0
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <a
                  href={resolveAppAssetUrl(`/${profile.excelDownloadUrl}`)}
                  download={profile.excelFilename}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#1E6B5E] hover:bg-[#175449] text-white px-3 py-1.5 text-xs font-bold shadow-2xs transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Download Excel (.xlsx)</span>
                </a>
                <a
                  href={resolveAppAssetUrl(`/downloads/county_profiles_2_0/pdf/${profile.excelFilename.replace('.xlsx', '.pdf')}`)}
                  download={profile.excelFilename.replace('.xlsx', '.pdf')}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#0F3D6E] hover:bg-[#164B84] text-white px-3 py-1.5 text-xs font-bold shadow-2xs transition"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download PDF Fact Sheet</span>
                </a>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-bold shadow-2xs cursor-pointer transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
              </div>
            </div>

            {profile.footnote && (
              <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>OFA Zone Boundary Note:</strong> {profile.footnote}
                </span>
              </div>
            )}

            {/* 8 Sub-Tabs */}
            <div className="flex flex-wrap items-center gap-1 mt-2.5 pt-2 border-t border-slate-100">
              {subTabs.map((t) => {
                const isAct = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition flex items-center gap-1 ${
                      isAct
                        ? 'bg-[#0F3D6E] text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    <span>{t.label}</span>
                    {t.badge && (
                      <span
                        className={`text-[9px] px-1 rounded ${
                          isAct ? 'bg-amber-300 text-slate-900' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Sub-Tab Body */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 space-y-2.5">
            {activeTab === 'summary' && (
              <>
                {/* 12 Headline KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                  <KpiCard
                    icon={<Sprout className="w-4 h-4 text-[#1E6B5E]" />}
                    title="Census Farms (2021)"
                    value={fmtInt(es.farms2021)}
                    sub1={`${fmtPct(es.farmsChangePct, 1, true)} vs 2016 (${fmtInt(es.farms2016)})`}
                    sub2={
                      es.farmsRank
                        ? `Rank #${es.farmsRank} of ${es.farmsRankOutOf} • ${fmtPct(es.farmsOntSharePct, 2)} of ON`
                        : `${fmtPct(es.farmsOntSharePct, 1)} of Ontario`
                    }
                  />
                  <KpiCard
                    icon={<Layers className="w-4 h-4 text-[#0F3D6E]" />}
                    title="Farmland & Cropland (2021)"
                    value={`${fmtInt(es.farmlandAcres2021)} ac`}
                    sub1={`Cropland: ${fmtInt(es.croplandAcres2021)} ac (${fmtPct(es.croplandShareOfFarmlandPct)})`}
                    sub2={`Avg Farm: ${es.avgFarmSizeAcres2021 ?? '—'} ac • Owned: ${fmtPct(es.ownedSharePct2021)}`}
                  />
                  <KpiCard
                    icon={<TrendingUp className="w-4 h-4 text-[#1E6B5E]" />}
                    title="Census Gross Receipts (2020)"
                    value={fmtCurrencyCompact(es.censusGrossReceipts2020)}
                    sub1={`${fmtPct(es.censusReceiptsChangePct, 1, true)} vs 2015 • Net Margin: ${fmtPct(es.censusNetMarginPct2020)}`}
                    sub2={
                      es.censusReceiptsRank
                        ? `Rank #${es.censusReceiptsRank} of ${es.farmsRankOutOf} • Avg ${fmtCurrencyCompact(es.avgReceiptsPerFarm2020)}/farm`
                        : `Expenses: ${fmtCurrencyCompact(es.censusOperatingExpenses2020)}`
                    }
                  />
                  <KpiCard
                    icon={<TrendingUp className="w-4 h-4 text-amber-600" />}
                    title="OMAFA Farm Cash Receipts (2024)"
                    value={fmtCurrencyCompact(es.omafaFcr2024)}
                    sub1={`2025 Prelim: ${fmtCurrencyCompact(es.omafaFcr2025)}`}
                    sub2={
                      es.omafaFcrRank2024
                        ? `Rank #${es.omafaFcrRank2024} of ${es.farmsRankOutOf} • ${fmtPct(es.omafaFcrOntSharePct2024, 2)} of ON`
                        : 'OMAFA 36-Commodity Allocation Series'
                    }
                  />
                  <KpiCard
                    icon={<Landmark className="w-4 h-4 text-[#0F3D6E]" />}
                    title={`Farmland Property Tax (FIR ${es.firYear})`}
                    value={fmtCurrencyCompact(es.farmlandTotalTaxDollars)}
                    sub1={`Farmland CVA: ${fmtCurrencyCompact(es.farmlandCvaDollars)}`}
                    sub2={`${fmtPct(es.farmlandShareOfTotalTaxPct, 2)} of total municipal tax levy`}
                  />
                  <KpiCard
                    icon={<MapPin className="w-4 h-4 text-[#1E6B5E]" />}
                    title="CLI Prime Soil (Class 1–3)"
                    value={
                      es.primeSoilClass1To3Acres !== null
                        ? `${fmtInt(es.primeSoilClass1To3Acres)} ac`
                        : 'Unmapped (Northern Shield)'
                    }
                    sub1={`Prime Share: ${fmtPct(es.primeSoilSharePct)} of surveyed soil`}
                    sub2={`Greenbelt Area: ${fmtInt(es.greenbeltAcres)} ac (${fmtPct(es.greenbeltShareLandPct)})`}
                  />
                  <KpiCard
                    icon={<Wifi className="w-4 h-4 text-[#0F3D6E]" />}
                    title="Rural Broadband (50/10 Mbps)"
                    value={fmtPct(es.broadband50_10Pct, 1)}
                    sub1={`Wired 50/10: ${fmtPct(es.broadbandWired50_10Pct)} • LTE: ${fmtPct(es.broadbandLteMobilePct)}`}
                    sub2={`Underserved Households: ${fmtInt(es.broadbandUnderservedHouseholds)}`}
                  />
                  <KpiCard
                    icon={<Building2 className="w-4 h-4 text-[#1E6B5E]" />}
                    title="Agri-Food Businesses & Jobs"
                    value={`${fmtInt(es.agrifoodBizLocations2023)} biz`}
                    sub1={`Day Jobs (Place of Work): ${fmtInt(es.agrifoodJobsDay2021)} (${fmtPct(es.agrifoodShareOfDayJobsPct2021)})`}
                    sub2={`Food & Bev Mfg Locations: ${fmtInt(es.foodBevMfgBizLocations2023)}`}
                  />
                  <KpiCard
                    icon={<Users className="w-4 h-4 text-[#0F3D6E]" />}
                    title="Operators & Succession (2021)"
                    value={`${fmtInt(es.totalOperators2021)} ops`}
                    sub1={`Avg Age: ${es.avgOperatorAge2021 ?? '—'} yrs • Under 35: ${fmtPct(es.operatorsUnder35Pct2021)}`}
                    sub2={`Written Succession Plan: ${fmtInt(es.writtenSuccessionPlanFarms2021)} farms (${fmtPct(es.writtenSuccessionPlanPct2021)})`}
                  />
                  <KpiCard
                    icon={<Landmark className="w-4 h-4 text-[#1E6B5E]" />}
                    title="Total Farm Capital (2021)"
                    value={fmtCurrencyCompact(es.totalFarmCapital2021)}
                    sub1={`Per Farm: ${fmtCurrencyCompact(es.capitalPerFarm2021)}`}
                    sub2={`Per Farmland Acre: ${fmtDollarsFull(es.capitalPerAcre2021)}/ac`}
                  />
                  <KpiCard
                    icon={<Sprout className="w-4 h-4 text-[#0F3D6E]" />}
                    title="Soil Health & Tech Adoption"
                    value={`${fmtPct(es.noTillSharePct2021)} No-Till`}
                    sub1={`Cover Crops: ${fmtInt(es.coverCropsFarms2021)} farms • Autosteer: ${fmtInt(es.autosteerFarms2021)}`}
                    sub2={`Robotic Milkers: ${fmtInt(es.roboticMilkerFarms2021)} • Renewable Energy: ${fmtInt(es.renewableEnergyFarms2021)}`}
                  />
                  <KpiCard
                    icon={<Users className="w-4 h-4 text-[#1E6B5E]" />}
                    title="Direct-to-Consumer & Paid Labour"
                    value={`${fmtInt(es.directSalesFarms2021)} direct`}
                    sub1={`${fmtPct(es.directSalesPct2021)} of farms sell direct to consumers`}
                    sub2={`Paid Farm Workers: ${fmtInt(es.paidWorkersTotal2021)} across ${fmtInt(es.paidLabourFarms2021)} farms`}
                  />
                </div>

                {/* Top Commodities by 2024 OMAFA Farm Cash Receipts */}
                <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <h2 className="text-xs font-extrabold text-[#0F3D6E] uppercase tracking-wide">
                        Top Commodities by 2024 OMAFA Farm Cash Receipts
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        OMAFA county allocation of Statistics Canada provincial Farm Cash Receipts (fcrcty_en.xlsx)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('fcr')}
                      className="text-[11px] font-bold text-[#1E6B5E] hover:underline cursor-pointer"
                    >
                      View All 36 Commodities (2018–2025) →
                    </button>
                  </div>

                  {es.topCommoditiesFcr2024.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3">
                      County-level OMAFA Farm Cash Receipts are not published separately for this urban Census Division; see Census Gross Farm Receipts above.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                            <th className="text-left py-1.5 px-2 font-bold">Commodity</th>
                            <th className="text-right py-1.5 px-2 font-bold">2021 ($)</th>
                            <th className="text-right py-1.5 px-2 font-bold">2024 ($)</th>
                            <th className="text-right py-1.5 px-2 font-bold">2025 Prelim ($)</th>
                            <th className="text-right py-1.5 px-2 font-bold">% of Local FCR</th>
                            <th className="text-right py-1.5 px-2 font-bold">% of Ontario</th>
                            <th className="w-36 py-1.5 px-2 font-bold text-left">Relative Scale</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {es.topCommoditiesFcr2024.map((c) => {
                            const barPct = Math.min(100, Math.max(2, (c.val2024 / maxTopComm) * 100));
                            return (
                              <tr key={c.id} className="hover:bg-slate-50">
                                <td className="py-1.5 px-2 font-semibold text-slate-800">
                                  {c.label.replace('Farm cash receipts: ', '')}
                                </td>
                                <td className="py-1.5 px-2 text-right text-slate-600">
                                  {fmtCurrencyCompact(c.val2021)}
                                </td>
                                <td className="py-1.5 px-2 text-right font-bold text-[#0F3D6E]">
                                  {fmtCurrencyCompact(c.val2024)}
                                </td>
                                <td className="py-1.5 px-2 text-right text-slate-700">
                                  {fmtCurrencyCompact(c.val2025)}
                                </td>
                                <td className="py-1.5 px-2 text-right font-semibold">
                                  {fmtPct(c.shareOfGeo2024Pct)}
                                </td>
                                <td className="py-1.5 px-2 text-right text-slate-600">
                                  {fmtPct(c.ontShare2024Pct, 2)}
                                </td>
                                <td className="py-1.5 px-2">
                                  <div className="h-2.5 bg-slate-100 rounded overflow-hidden">
                                    <div
                                      className="h-full bg-[#1E6B5E] rounded"
                                      style={{ width: `${barPct}%` }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'townships' && (
              <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs">
                <div className="mb-2">
                  <h2 className="text-xs font-extrabold text-[#0F3D6E] uppercase tracking-wide">
                    Townships / Consolidated Subdivisions Side-by-Side ({profile.townships.length})
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Combines 2021 Census of Agriculture, 2024 MMAH FIR Schedule 26A Farmland Property Tax, ISED 50/10 Broadband & Dec 2023 Agri-Food Businesses
                  </p>
                </div>
                {profile.townships.length === 0 ? (
                  <div className="text-xs text-slate-500 py-4">
                    Select a County / District or OFA Zone to compare its constituent Townships side-by-side.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                          <th className="text-left py-1.5 px-2 font-bold">Township (CCS)</th>
                          <th className="text-right py-1.5 px-2 font-bold">Farms (2021)</th>
                          <th className="text-right py-1.5 px-2 font-bold">16–21 Δ</th>
                          <th className="text-right py-1.5 px-2 font-bold">Farmland (ac)</th>
                          <th className="text-right py-1.5 px-2 font-bold">Cropland (ac)</th>
                          <th className="text-right py-1.5 px-2 font-bold">Gross Receipts (2020)</th>
                          <th className="text-right py-1.5 px-2 font-bold">Net Margin</th>
                          <th className="text-right py-1.5 px-2 font-bold">Avg Age</th>
                          <th className="text-right py-1.5 px-2 font-bold">Succession</th>
                          <th className="text-right py-1.5 px-2 font-bold">Farmland Tax (2024)</th>
                          <th className="text-right py-1.5 px-2 font-bold">50/10 Broadband</th>
                          <th className="text-right py-1.5 px-2 font-bold">Agri-Food Biz</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {profile.townships.map((t) => (
                          <tr key={t.code} className="hover:bg-slate-50">
                            <td className="py-1.5 px-2 font-bold text-slate-800">
                              {t.name}
                              <span className="ml-1 text-[10px] font-normal text-slate-400">
                                ({t.code})
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-right font-semibold">
                              {fmtInt(t.farms2021, 'x')}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {fmtPct(t.farmsChangePct, 1, true)}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {fmtInt(t.farmlandAcres2021, 'x')}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {fmtInt(t.croplandAcres2021, 'x')}
                            </td>
                            <td className="py-1.5 px-2 text-right font-semibold text-[#0F3D6E]">
                              {t.grossReceipts2020 !== null ? fmtCurrencyCompact(t.grossReceipts2020) : 'x'}
                            </td>
                            <td className="py-1.5 px-2 text-right">{fmtPct(t.netMarginPct2020)}</td>
                            <td className="py-1.5 px-2 text-right">
                              {t.avgOperatorAge2021 ?? '—'}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {fmtPct(t.successionPct2021)}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {fmtCurrencyCompact(t.farmlandTax2024)}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {fmtPct(t.broadband50_10Pct)}
                            </td>
                            <td className="py-1.5 px-2 text-right">{fmtInt(t.agrifoodBiz2023)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'fcr' && (
              <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-extrabold text-[#0F3D6E] uppercase tracking-wide">
                      Census Gross Farm Receipts vs. OMAFA Annual Farm Cash Receipts (2018–2025)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Displays both empirical StatCan Census Gross Farm Receipts (2015 & 2020) and OMAFA&apos;s annual 36-commodity County Farm Cash Receipts series
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    OMAFA County FCR = Modelled County Allocation
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-500">StatCan Census Gross Farm Receipts (2020):</span>{' '}
                    <strong className="text-[#0F3D6E]">
                      {fmtDollarsFull(es.censusGrossReceipts2020)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">OMAFA Total Farm Cash Receipts (2024):</span>{' '}
                    <strong className="text-[#1E6B5E]">{fmtDollarsFull(es.omafaFcr2024)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">OMAFA Preliminary FCR (2025):</span>{' '}
                    <strong className="text-slate-800">{fmtDollarsFull(es.omafaFcr2025)}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <th className="text-left py-1.5 px-2 font-bold">Commodity</th>
                        <th className="text-right py-1.5 px-2 font-bold">2018</th>
                        <th className="text-right py-1.5 px-2 font-bold">2020</th>
                        <th className="text-right py-1.5 px-2 font-bold">2021</th>
                        <th className="text-right py-1.5 px-2 font-bold">2022</th>
                        <th className="text-right py-1.5 px-2 font-bold">2023</th>
                        <th className="text-right py-1.5 px-2 font-bold">2024</th>
                        <th className="text-right py-1.5 px-2 font-bold">2025 Prelim</th>
                        <th className="text-right py-1.5 px-2 font-bold">% Local (24)</th>
                        <th className="text-right py-1.5 px-2 font-bold">% ON (24)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {profile.fcrCommodities.map((c) => (
                        <tr
                          key={c.id}
                          className={
                            c.isTotal ? 'bg-blue-50/70 font-bold text-[#0F3D6E]' : 'hover:bg-slate-50'
                          }
                        >
                          <td className="py-1.5 px-2">
                            {c.label.replace('Farm cash receipts: ', '')}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtCurrencyCompact(c.series['2018'])}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtCurrencyCompact(c.series['2020'])}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtCurrencyCompact(c.series['2021'])}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtCurrencyCompact(c.series['2022'])}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtCurrencyCompact(c.series['2023'])}
                          </td>
                          <td className="py-1.5 px-2 text-right font-semibold">
                            {fmtCurrencyCompact(c.series['2024'])}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtCurrencyCompact(c.series['2025'])}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtPct(c.shareOfGeo2024Pct)}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtPct(c.ontShare2024Pct, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'crops' && (
              <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <h2 className="text-xs font-extrabold text-[#0F3D6E] uppercase tracking-wide">
                      OMAFA Annual Field Crop Area, Yield & Production (12 Major Field Crops)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Source: Ontario Data Catalogue County Field Crop Series (2011–2025) • Includes 5-Year Rolling Average Yield
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    Survey / Modelled County Crop Estimates
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <th className="text-left py-1.5 px-2 font-bold">Field Crop</th>
                        <th className="text-right py-1.5 px-2 font-bold">Year</th>
                        <th className="text-right py-1.5 px-2 font-bold">Seeded (ac)</th>
                        <th className="text-right py-1.5 px-2 font-bold">Harvested (ac)</th>
                        <th className="text-right py-1.5 px-2 font-bold">Latest Yield</th>
                        <th className="text-right py-1.5 px-2 font-bold">5-Yr Avg Yield</th>
                        <th className="text-left py-1.5 px-2 font-bold">Yield Unit</th>
                        <th className="text-right py-1.5 px-2 font-bold">Production (Tonnes)</th>
                        <th className="text-right py-1.5 px-2 font-bold">% of Ontario</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {profile.fieldCrops.map((cr) => (
                        <tr key={cr.cropId} className="hover:bg-slate-50">
                          <td className="py-1.5 px-2 font-bold text-slate-800">{cr.cropName}</td>
                          <td className="py-1.5 px-2 text-right text-slate-500">{cr.latestYear}</td>
                          <td className="py-1.5 px-2 text-right">{fmtInt(cr.seededAcres)}</td>
                          <td className="py-1.5 px-2 text-right font-semibold">
                            {fmtInt(cr.harvestedAcres)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold text-[#1E6B5E]">
                            {cr.yield ?? '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-600">
                            {cr.yield5YrAvg ?? '—'}
                          </td>
                          <td className="py-1.5 px-2 text-slate-500">{cr.yieldUom}</td>
                          <td className="py-1.5 px-2 text-right font-semibold text-[#0F3D6E]">
                            {fmtInt(cr.productionTonnes)} t
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtPct(cr.ontProductionSharePct, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'biz_workforce' && (
              <div className="space-y-2.5">
                <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs">
                  <h2 className="text-xs font-extrabold text-[#0F3D6E] uppercase tracking-wide">
                    Agri-Food Business Location Counts (Dec 2016 – Dec 2023, Repaired Series)
                  </h2>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Source: Statistics Canada Canadian Business Counts (Reconciled from Community Profile, fixing legacy row-shift errors in Huron, Peel, Hamilton, Halton & Peterborough)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                          <th className="text-left py-1.5 px-2 font-bold">NAICS Sector</th>
                          <th className="text-right py-1.5 px-2 font-bold">Dec 2016</th>
                          <th className="text-right py-1.5 px-2 font-bold">Dec 2021</th>
                          <th className="text-right py-1.5 px-2 font-bold">Dec 2022</th>
                          <th className="text-right py-1.5 px-2 font-bold">Dec 2023 Total</th>
                          <th className="text-right py-1.5 px-2 font-bold">2023 Indeterminate (No Emp)</th>
                          <th className="text-right py-1.5 px-2 font-bold">2023 With Employees</th>
                          <th className="text-right py-1.5 px-2 font-bold">16–23 % Chg</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {profile.businessCounts.map((b) => (
                          <tr
                            key={b.id}
                            className={
                              b.isRollup
                                ? 'bg-blue-50/60 font-bold text-[#0F3D6E]'
                                : 'hover:bg-slate-50'
                            }
                          >
                            <td className="py-1.5 px-2">{b.label}</td>
                            <td className="py-1.5 px-2 text-right">{fmtInt(b.net2016)}</td>
                            <td className="py-1.5 px-2 text-right">{fmtInt(b.net2021)}</td>
                            <td className="py-1.5 px-2 text-right">{fmtInt(b.net2022)}</td>
                            <td className="py-1.5 px-2 text-right font-semibold">
                              {fmtInt(b.net2023)}
                            </td>
                            <td className="py-1.5 px-2 text-right">{fmtInt(b.withoutEmp2023)}</td>
                            <td className="py-1.5 px-2 text-right">{fmtInt(b.withEmp2023)}</td>
                            <td className="py-1.5 px-2 text-right">
                              {fmtPct(b.change2016To2023Pct, 1, true)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs">
                  <h2 className="text-xs font-extrabold text-[#0F3D6E] uppercase tracking-wide">
                    Day (Place of Work) vs. Night (Resident) Agri-Food Workforce (2016 & 2021 Census)
                  </h2>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Positive Net Inflow (Day − Night) indicates net workers commuting into the region for agri-food jobs
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                          <th className="text-left py-1.5 px-2 font-bold">Workforce Sector</th>
                          <th className="text-right py-1.5 px-2 font-bold">2016 Day</th>
                          <th className="text-right py-1.5 px-2 font-bold">2016 Night</th>
                          <th className="text-right py-1.5 px-2 font-bold">2021 Day (Jobs Here)</th>
                          <th className="text-right py-1.5 px-2 font-bold">2021 Night (Residents)</th>
                          <th className="text-right py-1.5 px-2 font-bold">2021 Net Inflow</th>
                          <th className="text-right py-1.5 px-2 font-bold">Day Jobs % Chg</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {profile.workforceDayNight.map((w, i) => (
                          <tr
                            key={w.label}
                            className={
                              i <= 1 ? 'bg-blue-50/60 font-bold text-[#0F3D6E]' : 'hover:bg-slate-50'
                            }
                          >
                            <td className="py-1.5 px-2 whitespace-pre">{w.label}</td>
                            <td className="py-1.5 px-2 text-right">{fmtInt(w.day2016)}</td>
                            <td className="py-1.5 px-2 text-right">{fmtInt(w.night2016)}</td>
                            <td className="py-1.5 px-2 text-right font-semibold">
                              {fmtInt(w.day2021)}
                            </td>
                            <td className="py-1.5 px-2 text-right">{fmtInt(w.night2021)}</td>
                            <td className="py-1.5 px-2 text-right">
                              {w.netInflow2021 !== null
                                ? `${w.netInflow2021 > 0 ? '+' : ''}${fmtInt(w.netInflow2021)}`
                                : '—'}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {fmtPct(w.changeDayPct, 1, true)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tax_land_broadband' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs">
                  <h2 className="text-xs font-extrabold text-[#0F3D6E] uppercase tracking-wide mb-1">
                    Municipal Farmland Assessment (CVA) & Property Taxes (MMAH FIR Schedule 26A)
                  </h2>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Property Class FT (Farmland) taxed at up to 25% of residential rate across Lower-Tier, Upper-Tier & Education levies
                  </p>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <th className="text-left py-1.5 px-2 font-bold">FIR Schedule 26A Metric</th>
                        <th className="text-right py-1.5 px-2 font-bold">2021</th>
                        <th className="text-right py-1.5 px-2 font-bold">2023</th>
                        <th className="text-right py-1.5 px-2 font-bold">2024</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-1.5 px-2 font-bold">Farmland Assessment (CVA)</td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir21.fir_farmland_cva)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir23.fir_farmland_cva)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-bold text-[#0F3D6E]">
                          {fmtCurrencyCompact(fir24.fir_farmland_cva)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2">Farmland Share of Total Municipal CVA</td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtPct(fir21.fir_farmland_share_cva_pct, 2)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtPct(fir23.fir_farmland_share_cva_pct, 2)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-semibold">
                          {fmtPct(fir24.fir_farmland_share_cva_pct, 2)}
                        </td>
                      </tr>
                      <tr className="bg-blue-50/50">
                        <td className="py-1.5 px-2 font-bold text-[#0F3D6E]">
                          Total Farmland Property Tax Levy
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir21.fir_farmland_tax_total)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir23.fir_farmland_tax_total)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-bold text-[#0F3D6E]">
                          {fmtCurrencyCompact(fir24.fir_farmland_tax_total)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2 pl-4 text-slate-600">
                          Lower / Single-Tier Municipal Tax
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir21.fir_farmland_tax_lt)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir23.fir_farmland_tax_lt)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir24.fir_farmland_tax_lt)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2 pl-4 text-slate-600">
                          Upper-Tier County / Region Tax
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir21.fir_farmland_tax_ut)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir23.fir_farmland_tax_ut)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir24.fir_farmland_tax_ut)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2 pl-4 text-slate-600">Education Tax</td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir21.fir_farmland_tax_edu)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir23.fir_farmland_tax_edu)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtCurrencyCompact(fir24.fir_farmland_tax_edu)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2 font-semibold">
                          Farmland Share of Total Tax Levy
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtPct(fir21.fir_farmland_share_tax_pct, 2)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtPct(fir23.fir_farmland_share_tax_pct, 2)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-bold text-[#1E6B5E]">
                          {fmtPct(fir24.fir_farmland_share_tax_pct, 2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs">
                  <h2 className="text-xs font-extrabold text-[#0F3D6E] uppercase tracking-wide mb-1">
                    CLI Agricultural Soil Capability, Greenbelt & ISED Rural Broadband
                  </h2>
                  <p className="text-[11px] text-slate-500 mb-2">
                    LIO Soil Survey Complex (component-weighted CLI; Sudbury split in EPSG:3161), EPSG:3161 Greenbelt clipping &amp; ISED Broadband
                  </p>
                  <table className="w-full text-xs border-collapse">
                    <tbody className="divide-y divide-slate-100">
                      <tr className="bg-emerald-50/50">
                        <td className="py-1.5 px-2 font-bold text-[#1E6B5E]">
                          Prime Agricultural Soil (CLI Classes 1–3)
                        </td>
                        <td className="py-1.5 px-2 text-right font-bold text-[#1E6B5E]">
                          {fmtInt(es.primeSoilClass1To3Acres)} ac ({fmtPct(es.primeSoilSharePct)})
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2 pl-4 text-slate-600">
                          CLI Class 1 / Class 2 / Class 3 Breakdown
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtInt(es.cliClass1Acres)} / {fmtInt(es.cliClass2Acres)} /{' '}
                          {fmtInt(es.cliClass3Acres)} ac
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2 pl-4 text-slate-600">
                          CLI Classes 4–7 & Organic Soils
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtInt(es.cliClass4To7Acres)} ac (4–7) • {fmtInt(es.cliOrganicAcres)} ac (Organic)
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2 font-semibold">
                          Ontario Greenbelt Outer Boundary Area
                        </td>
                        <td className="py-1.5 px-2 text-right font-semibold">
                          {fmtInt(es.greenbeltAcres)} ac ({fmtPct(es.greenbeltShareLandPct)} of land)
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2 pl-4 text-slate-600">
                          Greenbelt Specialty Crop Area (Niagara / Holland Marsh)
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtInt(es.greenbeltSpecialtyCropAcres)} ac
                        </td>
                      </tr>
                      <tr className="bg-blue-50/50">
                        <td className="py-1.5 px-2 font-bold text-[#0F3D6E]">
                          ISED 50/10 Mbps Broadband Availability
                        </td>
                        <td className="py-1.5 px-2 text-right font-bold text-[#0F3D6E]">
                          {fmtPct(es.broadband50_10Pct)} (Wired: {fmtPct(es.broadbandWired50_10Pct)})
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2 pl-4 text-slate-600">
                          50/10 Mbps With Funded Gov. Projects • Underserved HHs
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {fmtPct(es.broadbandWithGovProjects50_10Pct)} •{' '}
                          {fmtInt(es.broadbandUnderservedHouseholds)} HHs underserved
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2">
                          Population (2021 Census) & Avg Household Income
                        </td>
                        <td className="py-1.5 px-2 text-right font-semibold">
                          {fmtInt(es.population2021)} residents •{' '}
                          {fmtDollarsFull(es.avgHouseholdIncome2021)}/HH
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'ag_history' && (
              <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <h2 className="text-xs font-extrabold text-[#0F3D6E] uppercase tracking-wide">
                      4-Census Historical Agriculture Series (2006, 2011, 2016 & 2021)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Cleaned of all 280,239 legacy spreadsheet formula errors + reconciled 2021 StatCan series • Showing{' '}
                      <strong className="text-slate-700">{visibleHistory.length}</strong> of{' '}
                      <strong className="text-slate-700">{filteredHistory.length}</strong> indicators
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!historyFilter.trim() && filteredHistory.length > 250 && (
                      <button
                        type="button"
                        onClick={() => setShowAllHistory((v) => !v)}
                        className="rounded border border-[#0F3D6E]/30 bg-[#0F3D6E]/5 hover:bg-[#0F3D6E]/10 text-[#0F3D6E] px-2.5 py-1 text-[11px] font-bold cursor-pointer transition"
                      >
                        {showAllHistory
                          ? 'Show First 250 Rows'
                          : `Show All ${filteredHistory.length} Rows`}
                      </button>
                    )}
                    <input
                      type="text"
                      value={historyFilter}
                      onChange={(e) => setHistoryFilter(e.target.value)}
                      placeholder={`Filter ${hydratedHistory.length} historical metrics (e.g. dairy, corn, solar)...`}
                      className="w-72 rounded border border-slate-300 px-2.5 py-1 text-xs focus:outline-hidden focus:border-[#0F3D6E]"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[520px]">
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="sticky top-0 bg-slate-100 z-10">
                      <tr className="text-slate-700 border-b border-slate-200">
                        <th className="text-left py-1.5 px-2 font-bold">Indicator</th>
                        <th className="text-left py-1.5 px-2 font-bold">Unit</th>
                        <th className="text-right py-1.5 px-2 font-bold">2006</th>
                        <th className="text-right py-1.5 px-2 font-bold">2011</th>
                        <th className="text-right py-1.5 px-2 font-bold">2016</th>
                        <th className="text-right py-1.5 px-2 font-bold">2021</th>
                        <th className="text-right py-1.5 px-2 font-bold">16–21 % Chg</th>
                        <th className="text-right py-1.5 px-2 font-bold">% of ON (21)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleHistory.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="py-1.5 px-2 font-medium text-slate-800">{r.label}</td>
                          <td className="py-1.5 px-2 text-slate-500">{r.uom}</td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtHistoryVal(r.v2006, r.f2006, r.uom)}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtHistoryVal(r.v2011, r.f2011, r.uom)}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtHistoryVal(r.v2016, r.f2016, r.uom)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold text-[#0F3D6E]">
                            {fmtHistoryVal(r.v2021, r.f2021, r.uom)}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtPct(r.chg16To21Pct, 1, true)}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fmtPct(r.ontShare2021Pct, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'food_est' && (
              <div className="space-y-2.5">
                <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 text-xs text-amber-950 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-extrabold uppercase tracking-wide text-amber-900">
                      Illustrative Estimate — Methodological Disclosure
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed">
                      Following OMAFA&apos;s County Profiles convention, these two tables scale provincial Statistics Canada Per-Capita Food Availability and Rural Ontario Survey of Household Spending (SHS) averages by local population and household income. They are <strong>illustrative demand benchmarks</strong>, not empirical local retail point-of-sale measurements. Unlike OMAFA&apos;s legacy sheets, OFA 2.0 keeps crop area (<code>acres</code>) and livestock inventory (<code>head</code>) strictly separate and never sums mixed units.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                  <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs">
                    <h3 className="text-xs font-extrabold text-[#0F3D6E] uppercase mb-2">
                      Illustrative Local Food Demand vs. 2021 Census Production Base
                    </h3>
                    <div className="overflow-x-auto max-h-[420px]">
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="sticky top-0 bg-slate-100">
                          <tr className="text-slate-700 border-b border-slate-200">
                            <th className="text-left py-1.5 px-2 font-bold">Commodity</th>
                            <th className="text-left py-1.5 px-2 font-bold">Base Unit</th>
                            <th className="text-right py-1.5 px-2 font-bold">Est. Demand (kg)</th>
                            <th className="text-right py-1.5 px-2 font-bold">Required Base</th>
                            <th className="text-right py-1.5 px-2 font-bold">Local 2021 Base</th>
                            <th className="text-right py-1.5 px-2 font-bold">Self-Sufficiency</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {profile.localFoodAndSpendingEst.localFoodSelfSufficiency2021.map(
                            (it) => (
                              <tr key={it.id} className="hover:bg-slate-50">
                                <td className="py-1.5 px-2 font-semibold">{it.item}</td>
                                <td className="py-1.5 px-2 text-slate-500">{it.unit}</td>
                                <td className="py-1.5 px-2 text-right">
                                  {fmtInt(it.estConsumptionKg2021)}
                                </td>
                                <td className="py-1.5 px-2 text-right">
                                  {it.requiredBase2021?.toLocaleString('en-CA') ?? '—'}
                                </td>
                                <td className="py-1.5 px-2 text-right font-semibold">
                                  {it.actualLocalBase2021 !== null
                                    ? it.actualLocalBase2021.toLocaleString('en-CA')
                                    : it.localFlag || 'x'}
                                </td>
                                <td className="py-1.5 px-2 text-right font-bold text-[#1E6B5E]">
                                  {fmtPct(it.selfSufficiencyPct2021, 0)}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs">
                    <h3 className="text-xs font-extrabold text-[#0F3D6E] uppercase mb-2">
                      Illustrative Per-Household Food Expenditure (2021 SHS Scaling)
                    </h3>
                    <div className="overflow-x-auto max-h-[420px]">
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="sticky top-0 bg-slate-100">
                          <tr className="text-slate-700 border-b border-slate-200">
                            <th className="text-left py-1.5 px-2 font-bold">
                              Household Spending Category
                            </th>
                            <th className="text-right py-1.5 px-2 font-bold">
                              Est. $/Household (2021)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {profile.localFoodAndSpendingEst.householdFoodExp2021.map((h) => (
                            <tr key={h.id} className="hover:bg-slate-50">
                              <td className="py-1.5 px-2">{h.label}</td>
                              <td className="py-1.5 px-2 text-right font-semibold">
                                {fmtDollarsFull(h.dollarsPerHousehold2021)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dedicated Printable Executive PDF Fact Sheet Layout */}
      <div className="hidden print:block bg-white text-slate-900 p-4 space-y-3 text-[11px]">
        <div className="border-b-2 border-[#0F3D6E] pb-2 flex items-start justify-between">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#1E6B5E]">
              Ontario Federation of Agriculture (OFA) • County & Zone Profiles 2.0 Fact Sheet
            </div>
            <h1 className="text-xl font-black text-[#0F3D6E]">{profile.name}</h1>
            <div className="text-xs text-slate-600">
              Federation(s): {profile.federations.join(', ')} • {profile.zoneName}
            </div>
          </div>
          <div className="text-right text-[10px] text-slate-500">
            <div>AgCensus IQ Empirical Pipeline</div>
            <div>Data Vintages: 2006–2025</div>
          </div>
        </div>

        {profile.footnote && (
          <div className="border border-amber-400 bg-amber-50 px-2.5 py-1.5 rounded text-[10px]">
            <strong>OFA Zone Boundary Note:</strong> {profile.footnote}
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          <div className="border border-slate-300 rounded p-2">
            <div className="text-[10px] text-slate-500 font-bold">CENSUS FARMS (2021)</div>
            <div className="text-base font-extrabold text-[#0F3D6E]">{fmtInt(es.farms2021)}</div>
            <div className="text-[10px]">{fmtPct(es.farmsChangePct, 1, true)} vs 2016</div>
          </div>
          <div className="border border-slate-300 rounded p-2">
            <div className="text-[10px] text-slate-500 font-bold">FARMLAND & CROPLAND</div>
            <div className="text-base font-extrabold text-[#0F3D6E]">
              {fmtInt(es.farmlandAcres2021)} ac
            </div>
            <div className="text-[10px]">Cropland: {fmtInt(es.croplandAcres2021)} ac</div>
          </div>
          <div className="border border-slate-300 rounded p-2">
            <div className="text-[10px] text-slate-500 font-bold">CENSUS GROSS RECEIPTS</div>
            <div className="text-base font-extrabold text-[#0F3D6E]">
              {fmtCurrencyCompact(es.censusGrossReceipts2020)}
            </div>
            <div className="text-[10px]">OMAFA 2024 FCR: {fmtCurrencyCompact(es.omafaFcr2024)}</div>
          </div>
          <div className="border border-slate-300 rounded p-2">
            <div className="text-[10px] text-slate-500 font-bold">FARMLAND TAX & BROADBAND</div>
            <div className="text-base font-extrabold text-[#0F3D6E]">
              {fmtCurrencyCompact(es.farmlandTotalTaxDollars)}
            </div>
            <div className="text-[10px]">
              Prime Soil: {fmtInt(es.primeSoilClass1To3Acres)} ac • 50/10: {fmtPct(es.broadband50_10Pct)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <h2 className="font-extrabold text-[#0F3D6E] uppercase text-[10px] mb-1">
              Top Commodities by 2024 OMAFA Farm Cash Receipts
            </h2>
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1">Commodity</th>
                  <th className="text-right py-1">2024 ($)</th>
                  <th className="text-right py-1">% Local</th>
                  <th className="text-right py-1">% ON</th>
                </tr>
              </thead>
              <tbody>
                {es.topCommoditiesFcr2024.slice(0, 6).map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-0.5">{c.label.replace('Farm cash receipts: ', '')}</td>
                    <td className="py-0.5 text-right font-semibold">
                      {fmtCurrencyCompact(c.val2024)}
                    </td>
                    <td className="py-0.5 text-right">{fmtPct(c.shareOfGeo2024Pct)}</td>
                    <td className="py-0.5 text-right">{fmtPct(c.ontShare2024Pct, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="font-extrabold text-[#0F3D6E] uppercase text-[10px] mb-1">
              Major Field Crops (OMAFA Yield & Production)
            </h2>
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1">Crop</th>
                  <th className="text-right py-1">Harvested (ac)</th>
                  <th className="text-right py-1">Yield</th>
                  <th className="text-right py-1">Tonnes</th>
                </tr>
              </thead>
              <tbody>
                {profile.fieldCrops.slice(0, 6).map((cr) => (
                  <tr key={cr.cropId} className="border-b border-slate-100">
                    <td className="py-0.5">{cr.cropName}</td>
                    <td className="py-0.5 text-right">{fmtInt(cr.harvestedAcres)}</td>
                    <td className="py-0.5 text-right">
                      {cr.yield ?? '—'} {cr.yieldUom}
                    </td>
                    <td className="py-0.5 text-right font-semibold">
                      {fmtInt(cr.productionTonnes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {profile.townships.length > 0 && (
          <div>
            <h2 className="font-extrabold text-[#0F3D6E] uppercase text-[10px] mb-1">
              Constituent Townships / Subdivisions ({profile.townships.length})
            </h2>
            <table className="w-full border-collapse text-[9.5px]">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-0.5">Township</th>
                  <th className="text-right py-0.5">Farms (21)</th>
                  <th className="text-right py-0.5">Farmland (ac)</th>
                  <th className="text-right py-0.5">Gross Receipts (20)</th>
                  <th className="text-right py-0.5">Farmland Tax (24)</th>
                  <th className="text-right py-0.5">50/10 Broadband</th>
                  <th className="text-right py-0.5">Agri-Food Biz (23)</th>
                </tr>
              </thead>
              <tbody>
                {profile.townships.map((t) => (
                  <tr key={t.code} className="border-b border-slate-100">
                    <td className="py-0.5 font-medium">{t.name}</td>
                    <td className="py-0.5 text-right">{fmtInt(t.farms2021, 'x')}</td>
                    <td className="py-0.5 text-right">{fmtInt(t.farmlandAcres2021, 'x')}</td>
                    <td className="py-0.5 text-right">
                      {t.grossReceipts2020 !== null ? fmtCurrencyCompact(t.grossReceipts2020) : 'x'}
                    </td>
                    <td className="py-0.5 text-right">{fmtCurrencyCompact(t.farmlandTax2024)}</td>
                    <td className="py-0.5 text-right">{fmtPct(t.broadband50_10Pct)}</td>
                    <td className="py-0.5 text-right">{fmtInt(t.agrifoodBiz2023)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-200">
          Sources: Statistics Canada Census of Agriculture (2006–2021), Census of Population (2011–2021), Canadian Business Counts (2016–2023); OMAFA County Farm Cash Receipts & Field Crop Series (2011–2025); MMAH Municipal FIR Schedule 26A (2021–2024); LIO Soil Survey Complex & Greenbelt; ISED National Broadband Data.
        </div>
      </div>
    </div>
  );
};

interface KpiCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub1: string;
  sub2: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, title, value, sub1, sub2 }) => (
  <div className="bg-white rounded-lg border border-slate-200/90 p-2.5 shadow-2xs flex flex-col justify-between">
    <div className="flex items-center justify-between gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-tight text-slate-500 truncate">
        {title}
      </span>
      {icon}
    </div>
    <div className="text-base font-extrabold text-[#0F3D6E] my-0.5">{value}</div>
    <div className="text-[10px] text-slate-700 font-medium truncate">{sub1}</div>
    <div className="text-[10px] text-slate-500 truncate">{sub2}</div>
  </div>
);
