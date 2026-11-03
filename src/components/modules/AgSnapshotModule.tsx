import React, { useMemo, useState } from 'react';
import { AgCensusDataset, GeographyNode } from '../../types/census';
import {
  formatDelta,
  formatMetricValue,
  getNearbyGeographies,
  getObservation,
  getRawNumber
} from '../../utils/analytics';
import { SingleGeographySlicer } from '../GeographySlicer';
import { InteractiveAgMap, MapItemPoint } from '../InteractiveAgMap';
import {
  ArrowUpRight,
  FileDown,
  MapPin,
  Plus,
  Sprout,
  Tractor,
  TrendingUp,
  Users,
  X
} from 'lucide-react';

interface AgSnapshotModuleProps {
  dataset: AgCensusDataset;
  selectedGeo: GeographyNode;
  onSelectGeo: (geo: GeographyNode) => void;
  onJumpToExplorer: (category: string, layer1: 'Characteristic Distribution' | 'Aggregate Statistics', layer2?: string) => void;
  onOpenGeoLocator: () => void;
  onPrintFactsheet: () => void;
}

export const AgSnapshotModule: React.FC<AgSnapshotModuleProps> = ({
  dataset,
  selectedGeo,
  onSelectGeo,
  onJumpToExplorer,
  onOpenGeoLocator,
  onPrintFactsheet
}) => {
  const [showMapModal, setShowMapModal] = useState(false);
  const [activeDrawerCard, setActiveDrawerCard] = useState<string | null>(null);

  const charMap = useMemo(
    () => new Map(dataset.characteristics.map((c) => [c.id, c])),
    [dataset.characteristics]
  );

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
  const totalOps = getObs('op_total_operators');
  const avgOpAge = getObs('op_avg_age');
  const femaleOps = getObs('op_sex_female');
  const opsUnder35 = getObs('op_age_under_35');
  const ops55Plus = getObs('op_age_55_plus');
  const writtenSucc = getObs('succ_written');

  // Top 5 NAICS Farm Types (4-digit major groups)
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
        return { id, label: meta?.shortName || id, val: obs.val2021 || 0, pct: obs.pctOfBase || 0 };
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
          label: (meta?.shortName || id).replace(' (Acres)', ''),
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
        return { id, label: meta?.shortName || id, val: obs.val2021 || 0, pct: obs.pctOfBase || 0 };
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
        color: '#0F3D6E',
        radius: 10,
        isSelected: true
      }
    ];
    for (const p of nearbyPeers) {
      pts.push({
        geo: p.geo,
        value: p.farms,
        formattedValue: `${formatMetricValue(p.farms, 'FARMS')} farms`,
        secondaryLabel: `${p.distanceKm} km from ${selectedGeo.cleanName}`,
        color: '#328475',
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

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Top Header Bar matching MTM Snapshot */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2 rounded-md border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded bg-[#0F3D6E] text-white">
            <Tractor className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight text-[#0F3D6E] uppercase">
                SNAPSHOT: {selectedGeo.name}
              </h1>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {selectedGeo.level}
              </span>
              {selectedGeo.ofaFederation && (
                <span className="rounded bg-[#328475]/15 px-2 py-0.5 text-[11px] font-bold text-[#1D6C5E]">
                  {selectedGeo.ofaFederation}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Executive Census of Agriculture Portrait (2021 with 2016 Benchmark Deltas) • DGUID:{' '}
              <span className="font-mono">{selectedGeo.dguid}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMapModal(true)}
            className="
              inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white
              px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E] hover:bg-slate-50
              transition cursor-pointer
            "
          >
            <MapPin className="w-3.5 h-3.5 text-[#328475]" />
            <span>Click here to show map</span>
          </button>
          <button
            type="button"
            onClick={onPrintFactsheet}
            className="
              inline-flex items-center gap-1.5 rounded bg-[#0F3D6E] px-3 py-1.5
              text-xs font-semibold text-white hover:bg-[#164677] transition cursor-pointer
            "
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Export OFA County Factsheet</span>
          </button>
        </div>
      </div>

      {/* Main 4-Column Bento Grid matching MTM Snapshot 1280x720 Layout */}
      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        {/* LEFT COLUMN (3 cols): Geography Slicer + Total Farms & Area + Operators */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2.5">
          <SingleGeographySlicer
            title="Geography"
            geographies={dataset.geographies}
            selectedGeo={selectedGeo}
            onSelectGeo={onSelectGeo}
            onOpenGeoLocator={onOpenGeoLocator}
            onShowMapModal={() => setShowMapModal(true)}
          />

          {/* Card 1: Total Census Farms & Land Use */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between relative">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Census Farms & Farmland
                </h3>
                <p className="text-[10px] text-slate-400">StatCan 32-10-0231-01 & 32-10-0249-01</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setActiveDrawerCard(activeDrawerCard === 'farms' ? null : 'farms')
                }
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#0F3D6E] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Farm Size & Land Use in Ag Explorer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeDrawerCard === 'farms' && (
              <div className="my-1.5 rounded bg-[#071D49] p-2.5 text-white text-xs shadow-lg z-20">
                <div className="font-bold mb-1.5 flex items-center justify-between text-[11px] text-slate-300">
                  <span>Explore in Ag Explorer:</span>
                  <button onClick={() => setActiveDrawerCard(null)}>✕</button>
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
              <div className="rounded bg-[#F7F8FA] p-2 border border-slate-100">
                <div className="text-xl font-extrabold text-[#0F3D6E]">
                  {formatMetricValue(totalFarms.val2021, 'FARMS')}
                </div>
                <div className="text-[10px] font-medium text-slate-500">Total Census Farms</div>
                {totalFarms.pctChange !== null && (
                  <div
                    className={`mt-1 text-[11px] font-bold ${
                      farmDelta.isPositive ? 'text-[#0F9D58]' : 'text-amber-600'
                    }`}
                  >
                    {farmDelta.isPositive ? '▲' : '▼'} {farmDelta.text}{' '}
                    <span className="font-normal text-slate-400">vs 2016</span>
                  </div>
                )}
              </div>

              <div className="rounded bg-[#F7F8FA] p-2 border border-slate-100">
                <div className="text-xl font-extrabold text-[#0F3D6E]">
                  {formatMetricValue(totalArea.val2021, 'ACRES', true)}
                </div>
                <div className="text-[10px] font-medium text-slate-500">Total Farm Acres</div>
                {totalArea.pctChange !== null && (
                  <div
                    className={`mt-1 text-[11px] font-bold ${
                      areaDelta.isPositive ? 'text-[#0F9D58]' : 'text-amber-600'
                    }`}
                  >
                    {areaDelta.isPositive ? '▲' : '▼'} {areaDelta.text}{' '}
                    <span className="font-normal text-slate-400">vs 2016</span>
                  </div>
                )}
              </div>
            </div>

            {/* Land Use Stacked Share Bar */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-slate-600">Avg Farm Size:</span>
                <span className="font-bold text-[#0F3D6E]">
                  {formatMetricValue(avgFarmSize.val2021, 'ACRES')} acres
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
                <div
                  style={{ width: `${croplandPct}%` }}
                  className="bg-[#0F3D6E] h-full"
                  title={`Cropland: ${croplandPct}%`}
                />
                <div
                  style={{ width: `${pasturePct}%` }}
                  className="bg-[#328475] h-full"
                  title={`Pasture: ${pasturePct}%`}
                />
                <div
                  style={{ width: `${woodlandPct}%` }}
                  className="bg-[#D7D7CB] h-full"
                  title={`Woodlands & Wetlands: ${woodlandPct}%`}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-600">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#0F3D6E]" />
                  Crops {croplandPct}%
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#328475]" />
                  Pasture {pasturePct}%
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#D7D7CB]" />
                  Wood/Wet {woodlandPct}%
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Farm Operators & Succession */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Operators & Succession
                </h3>
                <p className="text-[10px] text-slate-400">StatCan 32-10-0381-01 & 32-10-0244-01</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onJumpToExplorer(
                    '10. Farm Operators, Succession & Labour',
                    'Characteristic Distribution',
                    'Operators by Age Group'
                  )
                }
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#0F3D6E] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Operator Demographics & Succession"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-center my-1">
              <div className="rounded bg-[#F7F8FA] p-1.5 border border-slate-100">
                <div className="text-base font-extrabold text-[#0F3D6E]">
                  {avgOpAge.val2021 ? `${avgOpAge.val2021}y` : 'N/A'}
                </div>
                <div className="text-[10px] text-slate-500">Avg Age</div>
              </div>
              <div className="rounded bg-[#F7F8FA] p-1.5 border border-slate-100">
                <div className="text-base font-extrabold text-[#0F3D6E]">
                  {femaleOps.pctOfBase !== null ? `${femaleOps.pctOfBase.toFixed(1)}%` : 'N/A'}
                </div>
                <div className="text-[10px] text-slate-500">Female Ops</div>
              </div>
              <div className="rounded bg-[#F7F8FA] p-1.5 border border-slate-100">
                <div className="text-base font-extrabold text-[#328475]">
                  {writtenSucc.pctOfBase !== null ? `${writtenSucc.pctOfBase.toFixed(1)}%` : 'N/A'}
                </div>
                <div className="text-[10px] text-slate-500">Written Plan</div>
              </div>
            </div>

            <div className="mt-1.5 space-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Operators Under 35 yrs:</span>
                <span className="font-bold text-slate-800">
                  {opsUnder35.pctOfBase !== null ? `${opsUnder35.pctOfBase.toFixed(1)}%` : '—'} (
                  {formatMetricValue(opsUnder35.val2021, 'WORKERS')})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Operators 55+ yrs:</span>
                <span className="font-bold text-[#0F3D6E]">
                  {ops55Plus.pctOfBase !== null ? `${ops55Plus.pctOfBase.toFixed(1)}%` : '—'} (
                  {formatMetricValue(ops55Plus.val2021, 'WORKERS')})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER-LEFT COLUMN (3 cols): Top Farm Types (NAICS) + Land Tenure & Legal Structure */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2.5">
          {/* Card 3: Top Farm Types (NAICS) */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Top Farm Types (NAICS)
                </h3>
                <p className="text-[10px] text-slate-400">Share of total census farms (32-10-0231-01)</p>
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
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#0F3D6E] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore All Farm Types (NAICS)"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2 my-auto">
              {topNaics.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  Suppressed or no farms reported
                </div>
              ) : (
                topNaics.map((item, idx) => (
                  <div key={item.id} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-700 truncate pr-2" title={item.label}>
                        {item.label}
                      </span>
                      <span className="font-bold text-[#0F3D6E] shrink-0">
                        {item.pct.toFixed(1)}%{' '}
                        <span className="font-normal text-slate-400">
                          ({item.val.toLocaleString()})
                        </span>
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-xs overflow-hidden">
                      <div
                        className="h-full rounded-xs transition-all"
                        style={{
                          width: `${Math.min(100, Math.max(4, item.pct))}%`,
                          backgroundColor: idx === 0 ? '#0F3D6E' : idx === 1 ? '#164677' : '#D7D7CB'
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
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Land Tenure & Legal Structure
                </h3>
                <p className="text-[10px] text-slate-400">Owned vs. Rented Acres & Operating Structure</p>
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
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#0F3D6E] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Land Tenure & Operating Arrangements"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Owned vs Rented Highlight */}
            <div className="rounded bg-[#F7F8FA] p-2 border border-slate-100 mb-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-[#0F3D6E]">
                  Owned: {ownedAcres.pctOfBase !== null ? `${ownedAcres.pctOfBase.toFixed(1)}%` : '—'}
                </span>
                <span className="font-bold text-[#328475]">
                  Rented:{' '}
                  {rentedAcres.pctOfBase !== null ? `${rentedAcres.pctOfBase.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden flex">
                <div
                  style={{ width: `${ownedAcres.pctOfBase || 0}%` }}
                  className="bg-[#0F3D6E] h-full"
                />
                <div
                  style={{ width: `${rentedAcres.pctOfBase || 0}%` }}
                  className="bg-[#328475] h-full"
                />
              </div>
            </div>

            {/* Operating Arrangements Bars */}
            <div className="space-y-1.5">
              {opStructures.map((op, i) => (
                <div key={op.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600 truncate w-36">{op.label}</span>
                  <div className="flex-1 mx-2 h-2 bg-slate-100 rounded-xs overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.min(100, op.pct)}%`,
                        backgroundColor: i === 0 ? '#0F3D6E' : '#94A3B8'
                      }}
                    />
                  </div>
                  <span className="font-bold text-slate-800 w-11 text-right">
                    {op.pct.toFixed(1)}%
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
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Top Field Crops & Horticulture
                </h3>
                <p className="text-[10px] text-slate-400">
                  Total Crop Area: {formatMetricValue(cropAcres.val2021, 'ACRES', true)} acres
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
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#0F3D6E] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Field Crops, Fruits, Vegetables & Greenhouse"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2 my-auto">
              {topCrops.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  Suppressed or no field crops reported
                </div>
              ) : (
                topCrops.map((crop, idx) => (
                  <div key={crop.id} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-700 truncate pr-2">{crop.label}</span>
                      <span className="font-bold text-[#0F3D6E] shrink-0">
                        {formatMetricValue(crop.val, 'ACRES', true)} ac{' '}
                        <span className="font-normal text-slate-400">({crop.pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-xs overflow-hidden">
                      <div
                        className="h-full rounded-xs"
                        style={{
                          width: `${Math.min(100, Math.max(4, crop.pct))}%`,
                          backgroundColor: idx === 0 ? '#0F3D6E' : idx === 1 ? '#328475' : '#D7D7CB'
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-3 gap-1 text-center text-[10px]">
              <div>
                <div className="font-bold text-[#0F3D6E]">
                  {formatMetricValue(getObs('fruit_total_acres').val2021, 'ACRES', true)}
                </div>
                <div className="text-slate-400">Fruit Acres</div>
              </div>
              <div>
                <div className="font-bold text-[#0F3D6E]">
                  {formatMetricValue(getObs('veg_total_acres').val2021, 'ACRES', true)}
                </div>
                <div className="text-slate-400">Veg Acres</div>
              </div>
              <div>
                <div className="font-bold text-[#328475]">
                  {formatMetricValue(getObs('gh_total_sqft').val2021, 'SQFT', true)}
                </div>
                <div className="text-slate-400">Greenhouse ft²</div>
              </div>
            </div>
          </div>

          {/* Card 6: Livestock, Poultry & Apiculture */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Livestock, Poultry & Bees
                </h3>
                <p className="text-[10px] text-slate-400">Inventories on Census Day (32-10-0370 to 0378)</p>
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
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#0F3D6E] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Livestock, Poultry & Bees"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 my-auto">
              <div className="rounded bg-[#F7F8FA] p-2 border border-slate-100">
                <div className="text-sm font-extrabold text-[#0F3D6E]">
                  {formatMetricValue(getObs('cattle_total_head').val2021, 'HEAD', true)}
                </div>
                <div className="text-[10px] font-medium text-slate-600">Total Cattle & Calves</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Dairy: {formatMetricValue(getObs('cattle_dairy_cows_head').val2021, 'HEAD', true)} | Beef:{' '}
                  {formatMetricValue(getObs('cattle_beef_cows_head').val2021, 'HEAD', true)}
                </div>
              </div>

              <div className="rounded bg-[#F7F8FA] p-2 border border-slate-100">
                <div className="text-sm font-extrabold text-[#0F3D6E]">
                  {formatMetricValue(getObs('pigs_total_head').val2021, 'HEAD', true)}
                </div>
                <div className="text-[10px] font-medium text-slate-600">Total Pigs</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Avg/Farm: {formatMetricValue(getObs('avg_pigs_per_farm').val2021, 'HEAD')}
                </div>
              </div>

              <div className="rounded bg-[#F7F8FA] p-2 border border-slate-100">
                <div className="text-sm font-extrabold text-[#0F3D6E]">
                  {formatMetricValue(getObs('poultry_hens_chickens_birds').val2021, 'HEAD', true)}
                </div>
                <div className="text-[10px] font-medium text-slate-600">Hens & Chickens</div>
              </div>

              <div className="rounded bg-[#F7F8FA] p-2 border border-slate-100">
                <div className="text-sm font-extrabold text-[#328475]">
                  {formatMetricValue(getObs('sheep_total_head').val2021, 'HEAD', true)}
                </div>
                <div className="text-[10px] font-medium text-slate-600">
                  Sheep ({formatMetricValue(getObs('bees_colonies').val2021, 'COLONIES', true)} Bee Colonies)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (3 cols): Farm Revenues/Expenses + Farm Capital ($/Acre) + Tech & BMPs */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2.5">
          {/* Card 7: Farm Operating Revenues, Expenses & Margin */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Farm Revenues & Expenses
                </h3>
                <p className="text-[10px] text-slate-400">StatCan 32-10-0240-01 & 32-10-0241-01</p>
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
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#0F3D6E] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Operating Revenues & Expenses"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="rounded bg-[#F7F8FA] p-2 border border-slate-100 mb-1.5 flex items-center justify-between">
              <div>
                <div className="text-lg font-extrabold text-[#0F3D6E]">
                  {formatMetricValue(totalRev.val2021, 'DOLLARS', true)}
                </div>
                <div className="text-[10px] text-slate-500">Total Gross Farm Receipts</div>
              </div>
              {totalRev.pctChange !== null && (
                <div className="text-right">
                  <div
                    className={`text-xs font-bold ${
                      revDelta.isPositive ? 'text-[#0F9D58]' : 'text-amber-600'
                    }`}
                  >
                    {revDelta.isPositive ? '▲' : '▼'} {revDelta.text}
                  </div>
                  <div className="text-[10px] text-slate-400">vs 2016</div>
                </div>
              )}
            </div>

            <div className="space-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Avg Revenue / Farm:</span>
                <span className="font-bold text-[#0F3D6E]">
                  {formatMetricValue(avgRev.val2021, 'DOLLARS')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Avg Expenses / Farm:</span>
                <span className="font-semibold text-slate-700">
                  {formatMetricValue(avgExp.val2021, 'DOLLARS')}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <span className="font-medium text-slate-700">Avg Net Operating Income:</span>
                <span className="font-extrabold text-[#0F9D58]">
                  {formatMetricValue(avgNetInc.val2021, 'DOLLARS')} (
                  {netMargin.val2021 !== null ? `${netMargin.val2021}%` : '—'} margin)
                </span>
              </div>
            </div>
          </div>

          {/* Card 8: Farm Capital & Farmland Value ($/Acre) */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
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
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#0F3D6E] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Farm Capital Breakdown"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
              <div className="rounded bg-[#F7F8FA] p-2 border border-slate-100">
                <div className="text-base font-extrabold text-[#0F3D6E]">
                  {formatMetricValue(totalCap.val2021, 'DOLLARS', true)}
                </div>
                <div className="text-[10px] text-slate-500">Total Farm Capital</div>
                {totalCap.pctChange !== null && (
                  <div className="text-[10px] font-bold text-[#0F9D58] mt-0.5">
                    ▲ {capDelta.text} vs 2016
                  </div>
                )}
              </div>

              <div className="rounded bg-[#F7F8FA] p-2 border border-slate-100">
                <div className="text-base font-extrabold text-[#328475]">
                  {formatMetricValue(landValPerAcre.val2021, 'DOLLARS')}
                </div>
                <div className="text-[10px] text-slate-500">Land & Bldg / Acre</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Avg Cap/Farm: {formatMetricValue(avgCap.val2021, 'DOLLARS', true)}
                </div>
              </div>
            </div>
          </div>

          {/* Card 9: Precision Ag Tech, Stewardship & Direct Sales */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Tech, Sustainability & Direct Sales
                </h3>
                <p className="text-[10px] text-slate-400">Adoption rates across operation practices</p>
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
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#0F3D6E] hover:text-white flex items-center justify-center text-slate-600 transition cursor-pointer"
                title="Explore Precision Ag, BMPs & Direct Marketing"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 my-auto text-[11px]">
              {[
                {
                  label: 'No-Till / Zero-Till Seeding (% Prep. Land)',
                  pct: getObs('till_notill_acres').pctOfBase
                },
                {
                  label: 'Winter Cover Crops (% of Farms)',
                  pct: getObs('bmp_cover_crops_farms').pctOfBase
                },
                {
                  label: 'Auto-Steer Guidance (% of Farms)',
                  pct: getObs('tech_autosteer').pctOfBase
                },
                {
                  label: 'Renewable Energy Systems (% of Farms)',
                  pct: getObs('energy_total_farms').pctOfBase
                },
                {
                  label: 'Direct-to-Consumer Sales (% of Farms)',
                  pct: getObs('ds_total_farms').pctOfBase
                }
              ].map((row, idx) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <span className="text-slate-600 truncate">{row.label}</span>
                  <span className="font-bold text-[#0F3D6E] shrink-0">
                    {row.pct !== null ? `${row.pct.toFixed(1)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Map & Nearby Geographies Distance Modal (Replicating MTM Snapshot Map Overlay) */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-5xl h-[560px] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-[#0F3D6E] text-white">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#328475]" />
                <span className="font-bold text-sm">
                  Geographic Context & Nearby Peers: {selectedGeo.name} ({selectedGeo.level})
                </span>
              </div>
              <button
                type="button"
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
                    const found = dataset.geographies.find((g) => g.id === gid);
                    if (found) onSelectGeo(found);
                  }}
                />
              </div>

              <div className="col-span-12 md:col-span-5 flex flex-col h-full border border-slate-200 rounded-md overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-bold text-[#0F3D6E]">
                  Nearby {selectedGeo.level} by Distance (km)
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
                      <tr className="bg-[#0F3D6E]/10 font-bold text-[#0F3D6E]">
                        <td className="py-1.5 px-2.5">{selectedGeo.cleanName} (Selected)</td>
                        <td className="py-1.5 px-2 text-right">0.0 km</td>
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
                            {peer.distanceKm.toFixed(1)} km
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-semibold text-[#0F3D6E]">
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
