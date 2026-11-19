import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActiveModule, AgCensusDataset, GeographyNode } from '../../types/census';
import {
  cleanGeoLevelLabel,
  computeEmpiricalPeerContext,
  formatCleanDecimal,
  formatCleanPct,
  formatDelta,
  formatMetricValue,
  formatVisualLabel,
  getCharMap,
  getGeoById,
  getNearbyGeographies,
  getObservation,
  getParentCountyForTownship,
  getRawNumber,
  getWithholdingTooltip
} from '../../utils/analytics';
import { SingleGeographySlicer } from '../GeographySlicer';
import { InteractiveAgMap, MapItemPoint } from '../InteractiveAgMap';
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BarChartBig,
  Compass,
  FileDown,
  FileSpreadsheet,
  Info,
  MapPin,
  Plus,
  Sparkles,
  Tractor,
  X
} from 'lucide-react';

interface AgSnapshotModuleProps {
  dataset: AgCensusDataset;
  selectedGeo: GeographyNode;
  onSelectGeo: (geo: GeographyNode) => void;
  onJumpToExplorer: (
    category: string,
    layer1: 'Characteristic Distribution' | 'Aggregate Statistics',
    layer2?: string
  ) => void;
  onOpenGeoLocator: () => void;
  onPrintFactsheet: () => void;
  onOpenCountyProfile?: (options?: {
    profileId?: string;
    tab?: 'summary' | 'townships';
  }) => void;
  onNavigateModule?: (mod: ActiveModule) => void;
}

export const AgSnapshotModule: React.FC<AgSnapshotModuleProps> = ({
  dataset,
  selectedGeo,
  onSelectGeo,
  onJumpToExplorer,
  onOpenGeoLocator,
  onPrintFactsheet,
  onOpenCountyProfile,
  onNavigateModule
}) => {
  const [showMapModal, setShowMapModal] = useState(false);
  const [activeDrawerCard, setActiveDrawerCard] = useState<string | null>(null);
  const [showQuickStart, setShowQuickStart] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ofa_hide_quickstart_v1') !== '1';
    } catch {
      return true;
    }
  });
  const geoSearchInputRef = useRef<HTMLInputElement | null>(null);

  const toggleQuickStart = (next: boolean) => {
    setShowQuickStart(next);
    try {
      localStorage.setItem('ofa_hide_quickstart_v1', next ? '0' : '1');
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    if (!showMapModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMapModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showMapModal]);

  const charMap = getCharMap(dataset);

  const getObs = (cid: string) => {
    const meta = charMap.get(cid);
    if (!meta) {
      return {
        val2021: null,
        val2016: null,
        status: 'x',
        pctChange: null,
        baseVal2021: null,
        pctOfBase: null,
        pctOfBase2016: null
      };
    }
    return getObservation(dataset, selectedGeo.id, meta);
  };

  // Core KPIs
  const totalFarms = getObs('total_farms');
  const totalArea = getObs('land_total_acres');
  const avgFarmSize = getObs('avg_farm_size_acres');
  const cropAcres = getObs('land_crops_acres');
  const pastureAcres =
    (getRawNumber(dataset, selectedGeo.id, 'land_tame_pasture_acres') || 0) +
    (getRawNumber(dataset, selectedGeo.id, 'land_natural_pasture_acres') || 0);
  const woodlandAcres = getRawNumber(dataset, selectedGeo.id, 'land_woodland_wetland_acres') || 0;

  // Economics & Capital
  const totalRev = getObs('rev_total_dollars');
  const avgRev = getObs('avg_rev_per_farm');
  const avgExp = getObs('avg_exp_per_farm');
  const avgNetInc = getObs('avg_net_income_per_farm');
  const netMargin = getObs('net_operating_margin_pct');

  const totalCap = getObs('cap_total_dollars');
  const avgCap = getObs('avg_capital_per_farm');
  const landValPerAcre = getObs('land_bldg_value_per_acre');

  // Operators & Succession
  const avgOpAge = getObs('op_avg_age');
  const femaleOps = getObs('op_sex_female');
  const opsUnder35 = getObs('op_age_under_35');
  const ops55Plus = getObs('op_age_55_plus');
  const writtenSucc = getObs('succ_written');

  // Top 5 Primary Farm Specializations (plain-English, zero NAICS codes on visual bars)
  const topNaics = useMemo(() => {
    const ids = [
      'naics_oilseed_grain',
      'naics_cattle_total',
      'naics_other_crop',
      'naics_other_animal',
      'naics_greenhouse',
      'naics_fruit_nut',
      'naics_poultry_egg',
      'naics_vegetable',
      'naics_hog',
      'naics_sheep_goat'
    ];
    return ids
      .map((id) => {
        const meta = charMap.get(id)!;
        const obs = getObservation(dataset, selectedGeo.id, meta);
        return {
          id,
          label: formatVisualLabel(meta?.shortName || id),
          val: obs.val2021 || 0,
          pct: obs.pctOfBase || 0
        };
      })
      .filter((x) => x.val > 0)
      .sort((a, b) => b.val - a.val)
      .slice(0, 5);
  }, [dataset, selectedGeo.id, charMap]);

  // Top 5 Field Crops by Acreage
  const topCrops = useMemo(() => {
    const ids = [
      'crop_soybeans_acres',
      'crop_corn_grain_acres',
      'crop_wheat_total_acres',
      'crop_canola_acres',
      'crop_alfalfa_acres',
      'crop_other_hay_acres',
      'crop_barley_acres',
      'crop_oats_acres',
      'crop_corn_silage_acres',
      'crop_dry_peas_acres',
      'crop_lentils_acres',
      'crop_potatoes_acres'
    ];
    return ids
      .map((id) => {
        const meta = charMap.get(id)!;
        const obs = getObservation(dataset, selectedGeo.id, meta);
        return {
          id,
          label: formatVisualLabel(meta?.shortName || id),
          val: obs.val2021 || 0,
          pct: obs.pctOfBase || 0
        };
      })
      .filter((x) => x.val > 0)
      .sort((a, b) => b.val - a.val)
      .slice(0, 5);
  }, [dataset, selectedGeo.id, charMap]);

  // Land Tenure & Operating Structure
  const ownedAcres = getObs('tenure_owned_acres');
  const rentedAcres = getObs('tenure_rented_acres');
  const opStructures = useMemo(() => {
    const ids = ['op_sole_prop', 'op_family_corp', 'op_partnership', 'op_nonfamily_corp'];
    return ids
      .map((id) => {
        const meta = charMap.get(id)!;
        const obs = getObservation(dataset, selectedGeo.id, meta);
        return {
          id,
          label: formatVisualLabel(meta?.shortName || id),
          val: obs.val2021 || 0,
          pct: obs.pctOfBase || 0
        };
      })
      .sort((a, b) => b.val - a.val);
  }, [dataset, selectedGeo.id, charMap]);

  // Nearby Geographies for Map Modal
  const nearbyPeers = useMemo(
    () => getNearbyGeographies(dataset, selectedGeo, 15),
    [dataset, selectedGeo]
  );

  const mapModalItems: MapItemPoint[] = useMemo(() => {
    const pts: MapItemPoint[] = [
      {
        geo: selectedGeo,
        value: totalFarms.val2021,
        formattedValue: `${formatMetricValue(totalFarms.val2021, 'FARMS')} farms`,
        secondaryLabel: `${formatMetricValue(totalArea.val2021, 'ACRES', true)} acres`,
        color: '#D7182A',
        radius: 10,
        isSelected: true
      }
    ];
    for (const p of nearbyPeers) {
      pts.push({
        geo: p.geo,
        value: p.farms,
        formattedValue: `${formatMetricValue(p.farms, 'FARMS')} farms`,
        secondaryLabel: `${formatCleanDecimal(p.distanceKm, 1)} km from ${selectedGeo.cleanName}`,
        color: '#334B58',
        radius: 6.5,
        isSelected: false
      });
    }
    return pts;
  }, [selectedGeo, nearbyPeers, totalFarms.val2021, totalArea.val2021]);

  const farmDelta = formatDelta(totalFarms.pctChange);
  const areaDelta = formatDelta(totalArea.pctChange);
  const revDelta = formatDelta(totalRev.pctChange);
  const capDelta = formatDelta(totalCap.pctChange);

  const croplandPct =
    totalArea.val2021 && cropAcres.val2021
      ? Math.round((cropAcres.val2021 / totalArea.val2021) * 100)
      : 0;
  const pasturePct =
    totalArea.val2021 && pastureAcres
      ? Math.round((pastureAcres / totalArea.val2021) * 100)
      : 0;
  const woodlandPct =
    totalArea.val2021 && woodlandAcres
      ? Math.round((woodlandAcres / totalArea.val2021) * 100)
      : 0;

  // Declarative 8-12 word claim headline (data-visualization.md §5)
  const snapshotClaimHeadline = useMemo(() => {
    if (topNaics.length > 0 && totalFarms.val2021) {
      return `${topNaics[0].label} leads ${selectedGeo.cleanName} at ${formatCleanPct(topNaics[0].pct)} of farms`;
    }
    return `${selectedGeo.cleanName} agricultural profile across 2021 Census benchmarks`;
  }, [topNaics, totalFarms.val2021, selectedGeo.cleanName]);

  // Net-Score Bridge geometry for Card 7 (Revenues - Expenses = Net Cash Income, 100% reconciled)
  const hasPublishedFinancialBridge =
    avgRev.val2021 !== null && avgRev.val2021 > 0 && avgExp.val2021 !== null;
  const expRatioPct = hasPublishedFinancialBridge
    ? Math.min(100, Math.max(0, (avgExp.val2021! / avgRev.val2021!) * 100))
    : null;
  const reconciledNetPerFarm =
    avgRev.val2021 !== null && avgExp.val2021 !== null
      ? Math.round(avgRev.val2021) - Math.round(avgExp.val2021)
      : avgNetInc.val2021;

  // Empirical Provincial / National Peer Rankings & Benchmarks ("What does this number mean?")
  const farmsPeer = useMemo(
    () =>
      computeEmpiricalPeerContext(dataset, selectedGeo, 'total_farms', {
        isAdditiveTotal: true
      }),
    [dataset, selectedGeo]
  );
  const areaPeer = useMemo(
    () =>
      computeEmpiricalPeerContext(dataset, selectedGeo, 'land_total_acres', {
        isAdditiveTotal: true
      }),
    [dataset, selectedGeo]
  );
  const avgSizePeer = useMemo(
    () => computeEmpiricalPeerContext(dataset, selectedGeo, 'avg_farm_size_acres'),
    [dataset, selectedGeo]
  );
  const revPeer = useMemo(
    () =>
      computeEmpiricalPeerContext(dataset, selectedGeo, 'rev_total_dollars', {
        isAdditiveTotal: true
      }),
    [dataset, selectedGeo]
  );
  const marginPeer = useMemo(
    () => computeEmpiricalPeerContext(dataset, selectedGeo, 'net_operating_margin_pct'),
    [dataset, selectedGeo]
  );
  const landValPeer = useMemo(
    () => computeEmpiricalPeerContext(dataset, selectedGeo, 'land_bldg_value_per_acre'),
    [dataset, selectedGeo]
  );
  const succPeer = useMemo(
    () =>
      computeEmpiricalPeerContext(dataset, selectedGeo, 'succ_written', {
        usePctOfBase: true
      }),
    [dataset, selectedGeo]
  );
  const agePeer = useMemo(
    () => computeEmpiricalPeerContext(dataset, selectedGeo, 'op_avg_age'),
    [dataset, selectedGeo]
  );

  // Parent county lookup for Townships (used for 1-click suppression recovery & OFA Profiles jump)
  const parentCounty = useMemo(
    () => getParentCountyForTownship(dataset, selectedGeo),
    [dataset, selectedGeo]
  );
  const parentCountyFarms = useMemo(
    () => (parentCounty ? getRawNumber(dataset, parentCounty.id, 'total_farms', 0) : null),
    [dataset, parentCounty]
  );

  const withheldCoreCount = useMemo(() => {
    const coreVals = [
      totalRev.val2021,
      avgRev.val2021,
      avgExp.val2021,
      landValPerAcre.val2021,
      getObs('cattle_total_head').val2021,
      getObs('pigs_total_head').val2021
    ];
    return coreVals.filter((v) => v === null).length;
  }, [selectedGeo.id, totalRev.val2021, avgRev.val2021, avgExp.val2021, landValPerAcre.val2021]);

  // Target OFA Profile 2.0 ID when viewing an Ontario Geography
  const matchingOfaProfileTarget = useMemo(() => {
    if (selectedGeo.provinceCode !== '35') return null;
    if (selectedGeo.level === 'Provinces & Territories') {
      return { profileId: 'PROVINCE_35', tab: 'summary' as const, label: 'Full Ontario Profile & Excel (.xlsx)' };
    }
    if (selectedGeo.level === 'Counties / Census Divisions (CD)') {
      const cdCode = selectedGeo.id.slice(-4);
      return {
        profileId: `CD_${cdCode}`,
        tab: 'summary' as const,
        label: `Full ${selectedGeo.cleanName} Profile & Excel (.xlsx)`
      };
    }
    if (selectedGeo.level === 'Townships / Subdivisions (CCS)' && parentCounty) {
      const cdCode = parentCounty.id.slice(-4);
      return {
        profileId: `CD_${cdCode}`,
        tab: 'townships' as const,
        label: `${parentCounty.cleanName} Townships & Excel (.xlsx)`
      };
    }
    return { profileId: undefined, tab: 'summary' as const, label: 'Open OFA County Profiles & Excel (.xlsx)' };
  }, [selectedGeo, parentCounty]);

  // Plain-English 1-Line Takeaway Sentence (100% empirical, zero guesswork)
  const plainEnglishTakeaway = useMemo(() => {
    const parts: string[] = [];
    if (totalFarms.val2021 !== null) {
      const rankTxt =
        farmsPeer.rank !== null
          ? ` (#${farmsPeer.rank} of ${farmsPeer.totalPeersInScope} in ${farmsPeer.scopeShortLabel})`
          : '';
      parts.push(
        `${selectedGeo.cleanName} has ${totalFarms.val2021.toLocaleString()} census farms${rankTxt}`
      );
    }
    if (totalRev.val2021 !== null) {
      const revRankTxt =
        revPeer.rank !== null
          ? `, ranking #${revPeer.rank} in ${revPeer.scopeShortLabel} for gross farm receipts (${formatMetricValue(totalRev.val2021, 'DOLLARS', true)}${
              revPeer.shareOfBenchmarkPct !== null && revPeer.shareOfBenchmarkPct >= 0.5
                ? `, ${formatCleanDecimal(revPeer.shareOfBenchmarkPct, 1)}% of ${revPeer.benchmarkGeoName}`
                : ''
            })`
          : ` generating ${formatMetricValue(totalRev.val2021, 'DOLLARS', true)} in gross farm receipts`;
      parts.push(revRankTxt);
    }
    if (avgFarmSize.val2021 !== null) {
      const benchSize =
        avgSizePeer.benchmarkVal !== null && selectedGeo.level !== 'Provinces & Territories'
          ? ` (vs. ${formatMetricValue(avgSizePeer.benchmarkVal, 'ACRES')} ac ${avgSizePeer.scopeShortLabel} avg)`
          : '';
      parts.push(
        ` with an average farm size of ${formatMetricValue(avgFarmSize.val2021, 'ACRES')} acres${benchSize}`
      );
    }
    if (landValPerAcre.val2021 !== null) {
      const benchLand =
        landValPeer.benchmarkVal !== null && selectedGeo.level !== 'Provinces & Territories'
          ? ` (vs. ${formatMetricValue(landValPeer.benchmarkVal, 'DOLLARS')} ${landValPeer.scopeShortLabel} avg)`
          : '';
      parts.push(
        ` and farmland valued at ${formatMetricValue(landValPerAcre.val2021, 'DOLLARS')}/acre${benchLand}.`
      );
    } else if (parts.length > 0) {
      parts.push('.');
    }
    return parts.join('');
  }, [
    selectedGeo.cleanName,
    selectedGeo.level,
    totalFarms.val2021,
    farmsPeer,
    totalRev.val2021,
    revPeer,
    avgFarmSize.val2021,
    avgSizePeer,
    landValPerAcre.val2021,
    landValPeer
  ]);

  return (
    <div className="flex flex-col gap-2 min-h-full">
      {/* Dismissible Everyday Layperson Quick-Start Strip ("What would you like to do today?") */}
      {showQuickStart && (
        <div className="no-print rounded-md bg-white px-3 py-2 border border-[#D7182A]/25 shadow-2xs flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#334B58]">
              <Sparkles className="w-3.5 h-3.5 text-[#D7182A]" />
              <span>Quick Start — What would you like to do today?</span>
            </div>
            <button
              type="button"
              onClick={() => toggleQuickStart(false)}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 inline-flex items-center gap-1 cursor-pointer"
              title="Hide Quick Start bar (you can reopen it anytime from the header)"
            >
              <span>Hide</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => {
                if (geoSearchInputRef.current) {
                  geoSearchInputRef.current.focus();
                  geoSearchInputRef.current.select();
                } else {
                  onOpenGeoLocator();
                }
              }}
              className="text-left rounded border border-slate-200 bg-[#F8FAFC] hover:bg-[#EDE6DE]/50 hover:border-[#334B58]/40 px-2.5 py-1.5 transition cursor-pointer flex items-center justify-between gap-2"
            >
              <div>
                <div className="text-xs font-bold text-[#334B58]">1. Look Up Any Town or County</div>
                <div className="text-[10.5px] text-slate-500">Type a town, township, county, or OFA area</div>
              </div>
              <Compass className="w-4 h-4 text-[#D7182A] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (onOpenCountyProfile) {
                  onOpenCountyProfile(
                    matchingOfaProfileTarget
                      ? {
                          profileId: matchingOfaProfileTarget.profileId,
                          tab: matchingOfaProfileTarget.tab
                        }
                      : undefined
                  );
                } else if (onNavigateModule) {
                  onNavigateModule('profiles');
                }
              }}
              className="text-left rounded border border-[#D7182A]/25 bg-[#FEF2F2]/60 hover:bg-[#FEF2F2] px-2.5 py-1.5 transition cursor-pointer flex items-center justify-between gap-2"
            >
              <div>
                <div className="text-xs font-bold text-[#D7182A]">
                  2. County &amp; Zone Excel / PDF Profiles
                </div>
                <div className="text-[10.5px] text-slate-600">
                  8-tab profiles, 2025 receipts, tax, soil &amp; .xlsx
                </div>
              </div>
              <FileSpreadsheet className="w-4 h-4 text-[#D7182A] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onNavigateModule && onNavigateModule('compare')}
              className="text-left rounded border border-slate-200 bg-[#F8FAFC] hover:bg-[#EDE6DE]/50 hover:border-[#334B58]/40 px-2.5 py-1.5 transition cursor-pointer flex items-center justify-between gap-2"
            >
              <div>
                <div className="text-xs font-bold text-[#334B58]">3. Compare Two Areas Side-by-Side</div>
                <div className="text-[10.5px] text-slate-500">Head-to-head county or township benchmarks</div>
              </div>
              <ArrowLeftRight className="w-4 h-4 text-[#334B58] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onNavigateModule && onNavigateModule('ranker')}
              className="text-left rounded border border-slate-200 bg-[#F8FAFC] hover:bg-[#EDE6DE]/50 hover:border-[#334B58]/40 px-2.5 py-1.5 transition cursor-pointer flex items-center justify-between gap-2"
            >
              <div>
                <div className="text-xs font-bold text-[#334B58]">4. Rank Areas on a Crop or Livestock</div>
                <div className="text-[10.5px] text-slate-500">See #1 to #49 county leaderboards &amp; maps</div>
              </div>
              <BarChartBig className="w-4 h-4 text-[#334B58] shrink-0" />
            </button>
          </div>
        </div>
      )}

      {/* Top Executive Claim Header Bar + Plain-English Takeaway */}
      <div className="flex flex-col gap-1.5 bg-white px-3.5 py-2.5 rounded-md border border-slate-200/90 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-[7px] bg-[#D7182A] text-white shrink-0">
              <Tractor className="w-4 h-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[15px] font-extrabold tracking-tight text-[#1E293B]">
                  {snapshotClaimHeadline}
                </h1>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-[#334B58]">
                  {cleanGeoLevelLabel(selectedGeo.level)}
                </span>
                {selectedGeo.ofaFederation && (
                  <span className="rounded bg-[#FEF2F2] px-2 py-0.5 text-[11px] font-bold text-[#D7182A]">
                    {selectedGeo.ofaFederation}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                2021 Census of Agriculture portrait with 2016 changes &amp; provincial benchmarks across{' '}
                {selectedGeo.cleanName}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {!showQuickStart && (
              <button
                type="button"
                onClick={() => toggleQuickStart(true)}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-[#D7182A]" />
                <span>Quick Start</span>
              </button>
            )}

            {matchingOfaProfileTarget && onOpenCountyProfile && (
              <button
                type="button"
                onClick={() =>
                  onOpenCountyProfile({
                    profileId: matchingOfaProfileTarget.profileId,
                    tab: matchingOfaProfileTarget.tab
                  })
                }
                className="inline-flex items-center gap-1.5 rounded bg-[#D7182A] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#B51222] shadow-2xs transition cursor-pointer"
                title="Open 8-tab OFA Profile (2025 Farm Cash Receipts, Townships, Tax, Prime Soil, Broadband & 9-tab Excel Workbook)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{matchingOfaProfileTarget.label}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowMapModal(true)}
              className="
                inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white
                px-2.5 py-1.5 text-xs font-semibold text-[#334B58] hover:bg-slate-50
                transition cursor-pointer
              "
            >
              <MapPin className="w-3.5 h-3.5 text-[#D7182A]" />
              <span>Show Map</span>
            </button>
            <button
              type="button"
              onClick={onPrintFactsheet}
              className="
                inline-flex items-center gap-1.5 rounded bg-[#334B58] px-3 py-1.5
                text-xs font-semibold text-white hover:bg-[#243640] transition cursor-pointer
              "
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Print 1-Page Factsheet</span>
            </button>
          </div>
        </div>

        {/* Plain-English Takeaway Bar ("What does this output mean for an everyday reader?") */}
        {plainEnglishTakeaway && (
          <div className="rounded bg-[#F8FAFC] border border-slate-200/80 px-2.5 py-1.5 text-[11.5px] text-slate-700 flex items-center gap-2">
            <span className="shrink-0 rounded bg-[#334B58] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#EDE6DE]">
              Key Takeaway
            </span>
            <span className="leading-snug">{plainEnglishTakeaway}</span>
          </div>
        )}
      </div>

      {/* Helpful 1-Click Parent-County Recovery Banner when a Township has Withheld ('x'/'F') Figures */}
      {selectedGeo.level === 'Townships / Subdivisions (CCS)' &&
        withheldCoreCount >= 2 &&
        parentCounty && (
          <div className="no-print rounded-md bg-[#EDE6DE]/75 border border-[#D7182A]/30 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-[#334B58]">
              <Info className="w-4 h-4 text-[#D7182A] shrink-0" />
              <span>
                <strong>Why do some cards say &ldquo;Withheld&rdquo;?</strong> Statistics Canada
                withholds financial or livestock figures in smaller townships like{' '}
                <strong>{selectedGeo.cleanName}</strong> (
                {formatMetricValue(totalFarms.val2021, 'FARMS')} farms) to protect individual farmer
                privacy and small-sample quality.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectGeo(parentCounty)}
              className="inline-flex items-center gap-1.5 rounded bg-[#334B58] hover:bg-[#243640] px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition cursor-pointer shrink-0"
            >
              <span>
                View Complete Data for {parentCounty.cleanName} (
                {parentCountyFarms ? `${parentCountyFarms.toLocaleString()} farms` : 'County'})
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[#ECA842]" />
            </button>
          </div>
        )}

      {/* Main 4-Column Bento Grid */}
      <div className="grid grid-cols-12 gap-2.5 flex-1">
        {/* LEFT COLUMN (3 cols): Geography Slicer + Total Farms & Area + Operators */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2.5">
          <SingleGeographySlicer
            title="Geography"
            geographies={dataset.geographies}
            selectedGeo={selectedGeo}
            onSelectGeo={onSelectGeo}
            onOpenGeoLocator={onOpenGeoLocator}
            onShowMapModal={() => setShowMapModal(true)}
            searchInputRef={geoSearchInputRef}
          />

          {/* Card 1: Total Census Farms & Land Use */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between relative">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                  Census Farms & Farmland
                </h3>
                <p className="text-[10px] text-slate-400">2021 vs. 2016 farmland base</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setActiveDrawerCard(activeDrawerCard === 'farms' ? null : 'farms')
                }
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#334B58] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Farm Size & Land Use in Ag Explorer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeDrawerCard === 'farms' && (
              <div className="my-1.5 rounded bg-[#243640] p-2.5 text-white text-xs shadow-lg z-20">
                <div className="font-bold mb-1.5 flex items-center justify-between text-[11px] text-slate-300">
                  <span>Explore in Ag Explorer:</span>
                  <button
                    type="button"
                    aria-label="Close explore menu"
                    onClick={() => setActiveDrawerCard(null)}
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() =>
                      onJumpToExplorer(
                        '2. Land Use & Farm Area Size',
                        'Characteristic Distribution',
                        'Land Use Breakdown (Acres)'
                      )
                    }
                    className="text-left py-1 px-2 rounded hover:bg-white/10 flex items-center justify-between"
                  >
                    <span>+ Explore: Land Use Breakdown</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      onJumpToExplorer(
                        '2. Land Use & Farm Area Size',
                        'Characteristic Distribution',
                        'Farms by Total Area Class'
                      )
                    }
                    className="text-left py-1 px-2 rounded hover:bg-white/10 flex items-center justify-between"
                  >
                    <span>+ Explore: Farm Area Size Classes</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 my-2">
              <div className="rounded bg-[#F8FAFC] p-2 border border-slate-100">
                <div className="flex items-center justify-between gap-1">
                  <div className="text-xl font-extrabold text-[#1E293B]">
                    {formatMetricValue(totalFarms.val2021, 'FARMS', false, totalFarms.status)}
                  </div>
                  {farmsPeer.rank !== null && (
                    <span className="rounded bg-[#334B58]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#334B58]">
                      #{farmsPeer.rank}/{farmsPeer.totalPeersInScope}
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] font-medium text-slate-500">Total Census Farms</div>
                {totalFarms.pctChange !== null && (
                  <div
                    className={`mt-1 text-[11px] font-bold ${
                      farmDelta.isPositive ? 'text-[#0F766E]' : 'text-[#B45309]'
                    }`}
                  >
                    {farmDelta.isPositive ? '▲' : '▼'} {farmDelta.text}{' '}
                    <span className="font-normal text-slate-400">vs 2016</span>
                  </div>
                )}
              </div>

              <div className="rounded bg-[#F8FAFC] p-2 border border-slate-100">
                <div className="flex items-center justify-between gap-1">
                  <div className="text-xl font-extrabold text-[#334B58]">
                    {formatMetricValue(totalArea.val2021, 'ACRES', true, totalArea.status)}
                  </div>
                  {areaPeer.rank !== null && (
                    <span className="rounded bg-[#334B58]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#334B58]">
                      #{areaPeer.rank}/{areaPeer.totalPeersInScope}
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] font-medium text-slate-500">Farmland Acres</div>
                {totalArea.pctChange !== null && (
                  <div
                    className={`mt-1 text-[11px] font-bold ${
                      areaDelta.isPositive ? 'text-[#0F766E]' : 'text-[#B45309]'
                    }`}
                  >
                    {areaDelta.isPositive ? '▲' : '▼'} {areaDelta.text}{' '}
                    <span className="font-normal text-slate-400">vs 2016</span>
                  </div>
                )}
              </div>
            </div>

            <div className="text-[11px] flex flex-wrap items-center justify-between gap-1 mb-1.5">
              <span className="text-slate-600">Average Farm Size:</span>
              <span className="font-bold text-[#1E293B]">
                {avgFarmSize.val2021 !== null
                  ? `${formatMetricValue(avgFarmSize.val2021, 'ACRES')} acres`
                  : formatMetricValue(null, 'ACRES', false, avgFarmSize.status)}
                {avgSizePeer.benchmarkVal !== null &&
                  selectedGeo.level !== 'Provinces & Territories' &&
                  selectedGeo.level !== 'Country' && (
                    <span className="ml-1 font-normal text-[10.5px] text-slate-500">
                      ({avgSizePeer.scopeShortLabel} avg:{' '}
                      {formatMetricValue(avgSizePeer.benchmarkVal, 'ACRES')} ac)
                    </span>
                  )}
              </span>
            </div>

            {/* Land Use Share Bar: Spotlight Cropland (#D7182A) vs Muted Pasture/Woodland */}
            <div>
              <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                <span>
                  <strong className="text-[#D7182A]">Cropland {croplandPct}%</strong>
                </span>
                <span>Pasture {pasturePct}%</span>
                <span>Wood/Wetland {woodlandPct}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${croplandPct}%` }}
                  className="bg-[#D7182A] h-full"
                  title={`Land in Crops: ${croplandPct}%`}
                />
                <div
                  style={{ width: `${pasturePct}%` }}
                  className="bg-[#94A3B8] h-full"
                  title={`Tame & Natural Pasture: ${pasturePct}%`}
                />
                <div
                  style={{ width: `${woodlandPct}%` }}
                  className="bg-[#CBD5E1] h-full"
                  title={`Woodlands & Wetlands: ${woodlandPct}%`}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Farm Operators & Succession */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                  Operators & Succession
                </h3>
                <p className="text-[10px] text-slate-400">Demographics & formal transition plans</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onJumpToExplorer(
                    '8. Operator Demographics & Labour',
                    'Characteristic Distribution',
                    'Operators by Age Group'
                  )
                }
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#334B58] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Operator Demographics & Succession"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-center my-1">
              <div className="rounded bg-[#F8FAFC] p-1.5 border border-slate-100">
                <div className="text-base font-extrabold text-[#1E293B]">
                  {avgOpAge.val2021 !== null ? `${formatCleanDecimal(avgOpAge.val2021, 1)}y` : 'N/A'}
                </div>
                <div className="text-[10.5px] text-slate-500">Avg Age</div>
                {agePeer.benchmarkVal !== null &&
                  selectedGeo.level !== 'Provinces & Territories' &&
                  selectedGeo.level !== 'Country' && (
                    <div className="text-[9.5px] text-slate-400">
                      {agePeer.scopeShortLabel}: {formatCleanDecimal(agePeer.benchmarkVal, 1)}y
                    </div>
                  )}
              </div>
              <div className="rounded bg-[#F8FAFC] p-1.5 border border-slate-100">
                <div className="text-base font-extrabold text-[#334B58]">
                  {formatCleanPct(femaleOps.pctOfBase)}
                </div>
                <div className="text-[10.5px] text-slate-500">Female Ops</div>
              </div>
              <div className="rounded bg-[#FEF2F2] p-1.5 border border-[#D7182A]/15">
                <div className="text-base font-extrabold text-[#D7182A]">
                  {formatCleanPct(writtenSucc.pctOfBase)}
                </div>
                <div className="text-[10.5px] text-slate-600">Written Plan</div>
                {succPeer.benchmarkPctOfBase !== null &&
                  selectedGeo.level !== 'Provinces & Territories' &&
                  selectedGeo.level !== 'Country' && (
                    <div className="text-[9.5px] text-slate-500">
                      {succPeer.scopeShortLabel}: {formatCleanPct(succPeer.benchmarkPctOfBase)}
                    </div>
                  )}
              </div>
            </div>

            <div className="mt-1.5 space-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Operators Under 35 yrs:</span>
                <span className="font-bold text-slate-800">
                  {formatCleanPct(opsUnder35.pctOfBase)} (
                  {formatMetricValue(opsUnder35.val2021, 'WORKERS', false, opsUnder35.status)})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Operators 55+ yrs:</span>
                <span className="font-bold text-[#334B58]">
                  {formatCleanPct(ops55Plus.pctOfBase)} (
                  {formatMetricValue(ops55Plus.val2021, 'WORKERS', false, ops55Plus.status)})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER-LEFT COLUMN (3 cols): Leading Farm Specializations + Land Tenure & Legal Structure */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2.5">
          {/* Card 3: Leading Farm Specializations (Zero NAICS jargon on visual header/bars) */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                  Leading Farm Specializations
                </h3>
                <p className="text-[10px] text-slate-400">Share of census farms by primary commodity</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onJumpToExplorer(
                    '1. Farm Types & Industry (NAICS)',
                    'Characteristic Distribution',
                    'Major Farm Types (4-Digit NAICS)'
                  )
                }
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#334B58] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore All Primary Farm Specializations"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5 my-auto">
              {topNaics.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  Suppressed or no farms reported
                </div>
              ) : (
                topNaics.map((item, idx) => (
                  <div key={item.id} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span
                        className={`truncate pr-2 ${
                          idx === 0 ? 'font-bold text-[#1E293B]' : 'font-medium text-slate-600'
                        }`}
                        title={item.label}
                      >
                        {item.label}
                      </span>
                      <span
                        className={`shrink-0 ${
                          idx === 0 ? 'font-extrabold text-[#D7182A]' : 'font-semibold text-slate-700'
                        }`}
                      >
                        {formatCleanPct(item.pct)}{' '}
                        <span className="font-normal text-slate-400">
                          ({item.val.toLocaleString()})
                        </span>
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-xs overflow-hidden">
                      <div
                        className="h-full rounded-xs transition-all"
                        style={{
                          width: `${Math.min(100, Math.max(4, item.pct))}%`,
                          backgroundColor: idx === 0 ? '#D7182A' : '#CBD5E1'
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card 4: Land Tenure & Operating Arrangements */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                  Land Tenure & Legal Structure
                </h3>
                <p className="text-[10px] text-slate-400">Owned vs. rented acres & farm structure</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onJumpToExplorer(
                    '3. Land Tenure & Operating Structure',
                    'Characteristic Distribution',
                    'Land Tenure (Acres)'
                  )
                }
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#334B58] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Land Tenure & Operating Arrangements"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Owned vs Rented Highlight */}
            <div className="rounded bg-[#F8FAFC] p-2 border border-slate-100 mb-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-[#334B58]">
                  Owned: {formatCleanPct(ownedAcres.pctOfBase)}
                </span>
                <span className="font-bold text-[#B45309]">
                  Rented: {formatCleanPct(rentedAcres.pctOfBase)}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden flex">
                <div
                  style={{ width: `${Math.min(100, Math.max(0, ownedAcres.pctOfBase || 0))}%` }}
                  className="bg-[#334B58] h-full"
                />
                <div
                  style={{ width: `${Math.min(100, Math.max(0, rentedAcres.pctOfBase || 0))}%` }}
                  className="bg-[#ECA842] h-full"
                />
              </div>
              {(ownedAcres.pctOfBase || 0) > 100 && (
                <div className="mt-1 text-[10px] text-slate-500 leading-tight">
                  Note: Exceeds 100% when owned acres include farmland leased out or StatCan base-5 rounding.
                </div>
              )}
            </div>

            {/* Operating Arrangements Bars: #1 spotlight in OFA Crimson, context in neutral slate */}
            <div className="space-y-1.5">
              {opStructures.map((op, i) => (
                <div key={op.id} className="flex items-center justify-between text-[11px]">
                  <span className={`truncate w-36 ${i === 0 ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                    {op.label}
                  </span>
                  <div className="flex-1 mx-2 h-2.5 bg-slate-100 rounded-xs overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.min(100, op.pct)}%`,
                        backgroundColor: i === 0 ? '#D7182A' : '#CBD5E1'
                      }}
                    />
                  </div>
                  <span className={`w-11 text-right ${i === 0 ? 'font-extrabold text-[#D7182A]' : 'font-semibold text-slate-700'}`}>
                    {formatCleanPct(op.pct)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER-RIGHT COLUMN (3 cols): Top Field Crops & Horticulture + Livestock & Poultry */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2.5">
          {/* Card 5: Top Crops & Horticulture */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                  Top Field Crops & Horticulture
                </h3>
                <p className="text-[10px] text-slate-400">
                  Cropland Base:{' '}
                  {cropAcres.val2021 !== null
                    ? `${formatMetricValue(cropAcres.val2021, 'ACRES', true)} acres`
                    : formatMetricValue(null, 'ACRES', true, cropAcres.status)}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onJumpToExplorer(
                    '5. Field Crops, Grains & Oilseeds',
                    'Characteristic Distribution',
                    'Field Crops by Acreage (Acres)'
                  )
                }
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#334B58] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Field Crops, Fruits, Vegetables & Greenhouse"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5 my-auto">
              {topCrops.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  Suppressed or no field crops reported
                </div>
              ) : (
                topCrops.map((crop, idx) => (
                  <div key={crop.id} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={`truncate pr-2 ${idx === 0 ? 'font-bold text-[#1E293B]' : 'font-medium text-slate-600'}`}>
                        {crop.label}
                      </span>
                      <span className={`shrink-0 ${idx === 0 ? 'font-extrabold text-[#D7182A]' : 'font-semibold text-slate-700'}`}>
                        {formatMetricValue(crop.val, 'ACRES', true)} ac{' '}
                        <span className="font-normal text-slate-400">({formatCleanPct(crop.pct)})</span>
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-xs overflow-hidden">
                      <div
                        className="h-full rounded-xs"
                        style={{
                          width: `${Math.min(100, Math.max(4, crop.pct))}%`,
                          backgroundColor: idx === 0 ? '#D7182A' : '#CBD5E1'
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-3 gap-1 text-center text-[10px]">
              <div>
                <div className="font-bold text-[#334B58]">
                  {formatMetricValue(getObs('fruit_total_acres').val2021, 'ACRES', true, getObs('fruit_total_acres').status)}
                </div>
                <div className="text-slate-400">Fruit Acres</div>
              </div>
              <div>
                <div className="font-bold text-[#334B58]">
                  {formatMetricValue(getObs('veg_total_acres').val2021, 'ACRES', true, getObs('veg_total_acres').status)}
                </div>
                <div className="text-slate-400">Veg Acres</div>
              </div>
              <div>
                <div className="font-bold text-[#334B58]">
                  {formatMetricValue(getObs('gh_total_sqft').val2021, 'SQFT', true, getObs('gh_total_sqft').status)}
                </div>
                <div className="text-slate-400">Greenhouse ft²</div>
              </div>
            </div>
          </div>

          {/* Card 6: Livestock, Poultry & Apiculture */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                  Livestock, Poultry & Bees
                </h3>
                <p className="text-[10px] text-slate-400">Census Day herd & flock inventories</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onJumpToExplorer(
                    '7. Livestock, Poultry & Apiculture',
                    'Characteristic Distribution',
                    'Cattle Herd Breakdown (Head)'
                  )
                }
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#334B58] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Livestock, Poultry & Bees"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 my-auto">
              <div className="rounded bg-[#F8FAFC] p-2 border border-slate-100">
                <div className="text-sm font-extrabold text-[#1E293B]">
                  {formatMetricValue(getObs('cattle_total_head').val2021, 'HEAD', true, getObs('cattle_total_head').status)}
                </div>
                <div className="text-[10px] font-medium text-slate-600">Cattle & Calves</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Dairy: {formatMetricValue(getObs('cattle_dairy_cows_head').val2021, 'HEAD', true, getObs('cattle_dairy_cows_head').status)} • Beef:{' '}
                  {formatMetricValue(getObs('cattle_beef_cows_head').val2021, 'HEAD', true, getObs('cattle_beef_cows_head').status)}
                </div>
              </div>

              <div className="rounded bg-[#F8FAFC] p-2 border border-slate-100">
                <div className="text-sm font-extrabold text-[#1E293B]">
                  {formatMetricValue(getObs('pigs_total_head').val2021, 'HEAD', true, getObs('pigs_total_head').status)}
                </div>
                <div className="text-[10px] font-medium text-slate-600">Hogs & Pigs</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Avg/Farm: {formatMetricValue(getObs('avg_pigs_per_farm').val2021, 'HEAD', false, getObs('avg_pigs_per_farm').status)}
                </div>
              </div>

              <div className="rounded bg-[#F8FAFC] p-2 border border-slate-100">
                <div className="text-sm font-extrabold text-[#1E293B]">
                  {formatMetricValue(getObs('poultry_hens_chickens_birds').val2021, 'HEAD', true, getObs('poultry_hens_chickens_birds').status)}
                </div>
                <div className="text-[10px] font-medium text-slate-600">Hens & Chickens</div>
              </div>

              <div className="rounded bg-[#F8FAFC] p-2 border border-slate-100">
                <div
                  className="text-sm font-extrabold text-[#334B58]"
                  title={
                    getObs('sheep_total_head').val2021 === null
                      ? getWithholdingTooltip(getObs('sheep_total_head').status)
                      : undefined
                  }
                >
                  {formatMetricValue(
                    getObs('sheep_total_head').val2021,
                    'HEAD',
                    true,
                    getObs('sheep_total_head').status
                  )}
                </div>
                <div className="text-[10.5px] font-medium text-slate-600">Sheep &amp; Lambs</div>
                <div
                  className="text-[10px] text-slate-400 mt-0.5"
                  title={
                    getObs('bees_colonies').val2021 === null
                      ? getWithholdingTooltip(getObs('bees_colonies').status)
                      : undefined
                  }
                >
                  Bee Colonies:{' '}
                  {formatMetricValue(
                    getObs('bees_colonies').val2021,
                    'COLONIES',
                    true,
                    getObs('bees_colonies').status
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (3 cols): Net-Score Financial Bridge + Farm Capital ($/Acre) + Tech & BMPs */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2.5">
          {/* Card 7: Farm Revenues vs. Expenses Net-Score Bridge (data-visualization.md §4) */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                  Receipts, Expenses & Net Bridge
                </h3>
                <p className="text-[10px] text-slate-400">Gross receipts minus operating costs</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onJumpToExplorer(
                    '4. Farm Capital, Revenues & Expenses',
                    'Characteristic Distribution',
                    'Farms by Gross Revenue Class'
                  )
                }
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-[#334B58] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Operating Revenues & Expenses"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="rounded bg-[#F8FAFC] p-2 border border-slate-100 mb-1.5 flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className="text-lg font-extrabold text-[#1E293B]"
                    title={
                      totalRev.val2021 === null ? getWithholdingTooltip(totalRev.status) : undefined
                    }
                  >
                    {formatMetricValue(totalRev.val2021, 'DOLLARS', true, totalRev.status)}
                  </span>
                  {revPeer.rank !== null && (
                    <span className="rounded bg-[#FEF2F2] border border-[#D7182A]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#D7182A]">
                      #{revPeer.rank}/{revPeer.totalPeersInScope} in {revPeer.scopeShortLabel}
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] text-slate-500">
                  Total Gross Farm Receipts
                  {revPeer.shareOfBenchmarkPct !== null && revPeer.shareOfBenchmarkPct >= 0.3 && (
                    <span className="text-slate-400">
                      {' '}
                      • {formatCleanDecimal(revPeer.shareOfBenchmarkPct, 1)}% of{' '}
                      {revPeer.scopeShortLabel}
                    </span>
                  )}
                </div>
              </div>
              {totalRev.pctChange !== null && (
                <div className="text-right shrink-0">
                  <div
                    className={`text-xs font-bold ${
                      revDelta.isPositive ? 'text-[#0F766E]' : 'text-[#B45309]'
                    }`}
                  >
                    {revDelta.isPositive ? '▲' : '▼'} {revDelta.text}
                  </div>
                  <div className="text-[10px] text-slate-400">vs 2016</div>
                </div>
              )}
            </div>

            {/* Visual Net-Score Bridge (only draws bars when empirical receipts & expenses are published; zero phantom bars) */}
            {hasPublishedFinancialBridge ? (
              <div className="space-y-1 text-[11px]">
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-slate-600">Avg Gross Receipts / Farm</span>
                    <span className="font-bold text-[#334B58]">
                      {formatMetricValue(avgRev.val2021, 'DOLLARS', false, avgRev.status)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-xs overflow-hidden">
                    <div className="h-full bg-[#334B58] w-full rounded-xs" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-slate-600">Less Avg Operating Expenses</span>
                    <span className="font-semibold text-slate-600">
                      -{formatMetricValue(avgExp.val2021, 'DOLLARS', false)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-xs overflow-hidden">
                    <div
                      className="h-full bg-[#94A3B8] rounded-xs"
                      style={{ width: `${expRatioPct ?? 0}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-slate-200">
                  <span className="font-bold text-[#1E293B]">= Net Cash Operating Income</span>
                  <span
                    className={`font-extrabold ${
                      reconciledNetPerFarm !== null && reconciledNetPerFarm < 0
                        ? 'text-[#B45309]'
                        : 'text-[#D7182A]'
                    }`}
                  >
                    {formatMetricValue(reconciledNetPerFarm, 'DOLLARS', false, avgNetInc.status)} (
                    {formatCleanPct(netMargin.val2021)})
                  </span>
                </div>
                {marginPeer.benchmarkVal !== null &&
                  selectedGeo.level !== 'Provinces & Territories' &&
                  selectedGeo.level !== 'Country' && (
                    <div className="text-[10px] text-slate-400 text-right">
                      {marginPeer.scopeShortLabel} avg net margin:{' '}
                      {formatCleanPct(marginPeer.benchmarkVal)}
                    </div>
                  )}
              </div>
            ) : (
              <div className="rounded bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] text-slate-600 leading-snug">
                Financial receipts &amp; operating expense averages are withheld by Statistics Canada
                for this small geography to protect individual farm confidentiality.
              </div>
            )}
          </div>

          {/* Card 8: Farm Capital & Farmland Value ($/Acre) */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                  Farm Capital & Farmland Value
                </h3>
                <p className="text-[10px] text-slate-400">Market value of land, buildings & machinery</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onJumpToExplorer(
                    '4. Farm Capital, Revenues & Expenses',
                    'Characteristic Distribution',
                    'Farm Capital Breakdown ($)'
                  )
                }
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-[#334B58] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Farm Capital Breakdown"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 mb-0.5">
              <div className="rounded bg-[#F8FAFC] p-2 border border-slate-100">
                <div className="text-base font-extrabold text-[#1E293B]">
                  {formatMetricValue(totalCap.val2021, 'DOLLARS', true, totalCap.status)}
                </div>
                <div className="text-[10.5px] text-slate-500">Total Farm Capital</div>
                {totalCap.pctChange !== null && (
                  <div
                    className={`text-[10px] font-bold mt-0.5 ${
                      capDelta.isPositive ? 'text-[#0F766E]' : 'text-[#B45309]'
                    }`}
                  >
                    {capDelta.isPositive ? '▲' : '▼'} {capDelta.text} vs 2016
                  </div>
                )}
              </div>

              <div className="rounded bg-[#FEF2F2] p-2 border border-[#D7182A]/15">
                <div className="flex items-center justify-between gap-1">
                  <div className="text-base font-extrabold text-[#D7182A]">
                    {formatMetricValue(
                      landValPerAcre.val2021,
                      'DOLLARS',
                      false,
                      landValPerAcre.status
                    )}
                  </div>
                  {landValPeer.rank !== null && (
                    <span className="rounded bg-white/80 px-1 py-0.5 text-[9.5px] font-bold text-[#334B58]">
                      #{landValPeer.rank}/{landValPeer.totalPeersInScope}
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] text-slate-600">Land & Bldg / Acre</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {landValPeer.benchmarkVal !== null &&
                  selectedGeo.level !== 'Provinces & Territories' &&
                  selectedGeo.level !== 'Country'
                    ? `${landValPeer.scopeShortLabel} avg: ${formatMetricValue(
                        landValPeer.benchmarkVal,
                        'DOLLARS'
                      )}`
                    : `Avg/Farm: ${formatMetricValue(avgCap.val2021, 'DOLLARS', true, avgCap.status)}`}
                </div>
              </div>
            </div>
          </div>

          {/* Card 9: Precision Ag Tech, Stewardship & Direct Sales */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#334B58]">
                  Tech, Stewardship & Direct Sales
                </h3>
                <p className="text-[10px] text-slate-400">Adoption share across reporting operations</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onJumpToExplorer(
                    '9. Precision Ag Tech & Renewable Energy',
                    'Characteristic Distribution',
                    'Precision Agriculture Technologies'
                  )
                }
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#334B58] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Precision Ag, BMPs & Direct Marketing"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 my-auto text-[11px]">
              {[
                {
                  label: 'No-Till Seeding (% Prepared Land)',
                  pct: getObs('till_notill_acres').pctOfBase
                },
                {
                  label: 'Winter Cover Crops (% of Farms)',
                  pct: getObs('bmp_cover_crops_farms').pctOfBase
                },
                {
                  label: 'Auto-Steer GPS (% of Farms)',
                  pct: getObs('tech_autosteer').pctOfBase
                },
                {
                  label: 'Renewable Energy (% of Farms)',
                  pct: getObs('energy_total_farms').pctOfBase
                },
                {
                  label: 'Direct-to-Consumer Sales (% of Farms)',
                  pct: getObs('ds_total_farms').pctOfBase
                }
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <span className="text-slate-600 truncate">{row.label}</span>
                  <span className="font-bold text-[#334B58] shrink-0">
                    {formatCleanPct(row.pct)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Map & Nearby Geographies Distance Modal */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-5xl h-[560px] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-[#334B58] text-white border-b-2 border-[#D7182A]">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#ECA842]" />
                <span className="font-bold text-sm">
                  Geographic Context & Nearby Peers: {selectedGeo.cleanName} (
                  {cleanGeoLevelLabel(selectedGeo.level)})
                </span>
              </div>
              <button
                type="button"
                aria-label="Close geographic context map"
                onClick={() => setShowMapModal(false)}
                className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20 transition cursor-pointer"
              >
                Click here to hide map ✕
              </button>
            </div>

            <div className="grid grid-cols-12 flex-1 min-h-0 p-3 gap-3">
              <div className="col-span-12 md:col-span-7 h-full">
                <InteractiveAgMap
                  items={mapModalItems}
                  selectedGeoId={selectedGeo.id}
                  focusGeo={selectedGeo}
                  onSelectGeo={(gid) => {
                    const found = getGeoById(dataset, gid);
                    if (found) onSelectGeo(found);
                  }}
                />
              </div>

              <div className="col-span-12 md:col-span-5 flex flex-col h-full border border-slate-200 rounded-md overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-bold text-[#334B58]">
                  Nearby {cleanGeoLevelLabel(selectedGeo.level)} by Distance (km)
                </div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 sticky top-0 text-[11px] text-slate-600">
                      <tr>
                        <th className="py-1.5 px-2.5">Geography</th>
                        <th className="py-1.5 px-2 text-right">Distance (km)</th>
                        <th className="py-1.5 px-2.5 text-right">Farms</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="bg-[#FEF2F2] font-bold text-[#D7182A]">
                        <td className="py-1.5 px-2.5">{selectedGeo.cleanName} (Selected)</td>
                        <td className="py-1.5 px-2 text-right">0 km</td>
                        <td className="py-1.5 px-2.5 text-right">
                          {formatMetricValue(totalFarms.val2021, 'FARMS')}
                        </td>
                      </tr>
                      {nearbyPeers.map((peer) => (
                        <tr
                          key={peer.geo.id}
                          onClick={() => onSelectGeo(peer.geo)}
                          className="hover:bg-slate-50 cursor-pointer transition"
                        >
                          <td className="py-1.5 px-2.5 font-medium text-slate-700">
                            {peer.geo.cleanName}
                            <span className="block text-[10px] text-slate-400">
                              {peer.geo.provinceName}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-600">
                            {formatCleanDecimal(peer.distanceKm, 1)} km
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-semibold text-[#334B58]">
                            {formatMetricValue(peer.farms, 'FARMS')}
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
      )}
    </div>
  );
};
