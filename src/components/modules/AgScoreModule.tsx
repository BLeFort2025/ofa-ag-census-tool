import React, { useMemo, useState } from 'react';
import { AgCensusDataset, AgScoreSlot, GeoLevel, GeographyNode } from '../../types/census';
import {
  MTM_PALETTES,
  computeAgScoreRanking,
  formatDelta,
  formatMetricValue
} from '../../utils/analytics';
import { MultiGeographyScopeSlicer } from '../GeographySlicer';
import { InteractiveAgMap, MapItemPoint } from '../InteractiveAgMap';
import { Download, RotateCcw, Sparkles } from 'lucide-react';

interface AgScoreModuleProps {
  dataset: AgCensusDataset;
  onOpenGeoLocator: () => void;
  onSelectGeoForSnapshot: (geo: GeographyNode) => void;
}

interface OfaPreset {
  id: string;
  name: string;
  description: string;
  slots: AgScoreSlot[];
}

const OFA_POLICY_PRESETS: OfaPreset[] = [
  {
    id: 'agtech_commercial',
    name: 'Commercial Scale & Precision Ag Readiness',
    description:
      'Ranks counties/regions by high-revenue commercial operations ($500k+), Auto-Steer guidance adoption, GIS mapping, and Soil Sample testing.',
    slots: [
      { slotIndex: 1, characteristicId: 'tech_autosteer', weight: 1.0, minPct: 0, maxPct: 100 },
      { slotIndex: 2, characteristicId: 'rev_500k_1m', weight: 0.8, minPct: 0, maxPct: 100 },
      { slotIndex: 3, characteristicId: 'tech_soil_test', weight: 0.8, minPct: 0, maxPct: 100 },
      { slotIndex: 4, characteristicId: 'tech_gis', weight: 0.6, minPct: 0, maxPct: 100 }
    ]
  },
  {
    id: 'bmp_stewardship',
    name: 'Soil Stewardship & Climate BMP Leadership',
    description:
      'Combines No-Till seeding share, Winter Cover Crops adoption, Shelterbelts/Windbreaks, and On-Farm Solar/Renewable Energy.',
    slots: [
      { slotIndex: 1, characteristicId: 'till_notill_acres', weight: 1.0, minPct: 0, maxPct: 100 },
      { slotIndex: 2, characteristicId: 'bmp_cover_crops_farms', weight: 1.0, minPct: 0, maxPct: 100 },
      { slotIndex: 3, characteristicId: 'bmp_windbreaks_farms', weight: 0.7, minPct: 0, maxPct: 100 },
      { slotIndex: 4, characteristicId: 'energy_total_farms', weight: 0.7, minPct: 0, maxPct: 100 }
    ]
  },
  {
    id: 'succession_renewal',
    name: 'Generational Renewal & Young Farmer Vitality',
    description:
      'Highlights regions with strong Young Operator (<35 yrs) representation, Written Succession Plans, Family Corporations, and Direct Sales.',
    slots: [
      { slotIndex: 1, characteristicId: 'op_age_under_35', weight: 1.0, minPct: 0, maxPct: 100 },
      { slotIndex: 2, characteristicId: 'succ_written', weight: 1.0, minPct: 0, maxPct: 100 },
      { slotIndex: 3, characteristicId: 'op_family_corp', weight: 0.7, minPct: 0, maxPct: 100 },
      { slotIndex: 4, characteristicId: 'ds_total_farms', weight: 0.6, minPct: 0, maxPct: 100 }
    ]
  },
  {
    id: 'farmland_pressure',
    name: 'Farmland Capital Intensity & Tenure Pressure',
    description:
      'Identifies counties facing high Land & Building values ($/Acre), high Rented Farmland dependency, and high $3.5M+ Capital thresholds.',
    slots: [
      { slotIndex: 1, characteristicId: 'land_bldg_value_per_acre', weight: 1.0, minPct: 0, maxPct: 100 },
      { slotIndex: 2, characteristicId: 'tenure_rented_acres', weight: 0.9, minPct: 0, maxPct: 100 },
      { slotIndex: 3, characteristicId: 'cap_3_5m_plus', weight: 0.8, minPct: 0, maxPct: 100 },
      { slotIndex: 4, characteristicId: 'land_crops_acres', weight: 0.6, minPct: 0, maxPct: 100 }
    ]
  }
];

function getScoreBandColor(score: number): string {
  if (score >= 90) return MTM_PALETTES.agscore.band90_100;
  if (score >= 70) return MTM_PALETTES.agscore.band70_90;
  if (score >= 50) return MTM_PALETTES.agscore.band50_70;
  return MTM_PALETTES.agscore.band0_50;
}

export const AgScoreModule: React.FC<AgScoreModuleProps> = ({
  dataset,
  onOpenGeoLocator,
  onSelectGeoForSnapshot
}) => {
  const [selectedLevel, setSelectedLevel] = useState<GeoLevel>('Counties / Census Divisions (CD)');
  const [selectedProvince, setSelectedProvince] = useState<string>('35'); // Default Ontario
  const [selectedCarId, setSelectedCarId] = useState<string>('ALL');

  // Global pre-filters (matching MTM CanadaScore Filters card)
  const [minFarms, setMinFarms] = useState<number>(20);
  const [maxFarms, setMaxFarms] = useState<number>(250000);
  const [minGrowthPct, setMinGrowthPct] = useState<number>(-100);
  const [minAvgRev, setMinAvgRev] = useState<number>(0);
  const [maxAvgRev, setMaxAvgRev] = useState<number>(10000000);

  // 4 Characteristic Slots matching MTM CanadaScore
  const [slots, setSlots] = useState<AgScoreSlot[]>(OFA_POLICY_PRESETS[0].slots);
  const [activePresetId, setActivePresetId] = useState<string>(OFA_POLICY_PRESETS[0].id);
  const [focusedGeoId, setFocusedGeoId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const s = new Set<string>();
    dataset.characteristics.forEach((c) => s.add(c.category));
    return Array.from(s);
  }, [dataset.characteristics]);

  const charMap = useMemo(
    () => new Map(dataset.characteristics.map((c) => [c.id, c])),
    [dataset.characteristics]
  );

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

  const scoredRows = useMemo(() => {
    return computeAgScoreRanking(
      dataset,
      scopedGeos,
      slots,
      minFarms,
      maxFarms,
      minGrowthPct,
      minAvgRev,
      maxAvgRev
    );
  }, [dataset, scopedGeos, slots, minFarms, maxFarms, minGrowthPct, minAvgRev, maxAvgRev]);

  const mapItems: MapItemPoint[] = useMemo(() => {
    return scoredRows.map((row, idx) => {
      const slotBreakdownHtml = row.slotMetrics
        .map((sm) => {
          const cMeta = charMap.get(slots[sm.slotIndex - 1]?.characteristicId || '');
          if (!cMeta) return '';
          return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#334155">
            <span>Char ${sm.slotIndex} (${cMeta.shortName}):</span>
            <b>P${sm.percentile.toFixed(0)} (${sm.pctOrVal !== null ? sm.pctOrVal.toFixed(1) : '—'})</b>
          </div>`;
        })
        .join('');

      const tooltipHtml = `<div style="font-family:Inter,sans-serif;padding:5px 7px;min-width:210px">
        <div style="font-weight:800;color:#0F3D6E;font-size:12px">#${idx + 1} ${row.geo.name}</div>
        <div style="font-weight:800;color:${getScoreBandColor(row.compositeScore)};font-size:14px;margin:3px 0">
          AgScore: ${row.compositeScore.toFixed(1)} / 100
        </div>
        <div style="border-top:1px solid #E2E8F0;padding-top:4px;margin-top:3px">
          ${slotBreakdownHtml}
        </div>
      </div>`;

      return {
        geo: row.geo,
        value: row.compositeScore,
        color: getScoreBandColor(row.compositeScore),
        radius: 7.5,
        isSelected: row.geo.id === focusedGeoId,
        tooltipHtml
      };
    });
  }, [scoredRows, charMap, slots, focusedGeoId]);

  const updateSlot = (slotIndex: number, patch: Partial<AgScoreSlot>) => {
    setActivePresetId('custom');
    setSlots((prev) =>
      prev.map((s) => (s.slotIndex === slotIndex ? { ...s, ...patch } : s))
    );
  };

  const applyPreset = (preset: OfaPreset) => {
    setActivePresetId(preset.id);
    setSlots(preset.slots.map((s) => ({ ...s })));
  };

  const focusedGeo = useMemo(
    () => dataset.geographies.find((g) => g.id === focusedGeoId) || null,
    [dataset.geographies, focusedGeoId]
  );

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Top Bar: Title + 1-Click OFA Policy Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2 rounded-md border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-extrabold tracking-tight text-[#0F3D6E] uppercase">
            AGSCORE (MULTI-FACTOR WEIGHTED INDEX)
          </h1>
          <span className="rounded bg-[#0F3D6E]/10 px-2 py-0.5 text-[11px] font-bold text-[#0F3D6E]">
            Z-Score & Normal CDF Percentile Engine (0–100)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 mr-1">
            <Sparkles className="w-3.5 h-3.5 text-[#328475]" />
            OFA Presets:
          </span>
          {OFA_POLICY_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              title={p.description}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                activePresetId === p.id
                  ? 'bg-[#0F3D6E] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid matching MTM CanadaScore */}
      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        {/* LEFT COLUMN (3 cols): Geography Slicer + Global Pre-Filters */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2.5">
          <MultiGeographyScopeSlicer
            title="Geography"
            geographies={dataset.geographies}
            selectedLevel={selectedLevel}
            onChangeLevel={setSelectedLevel}
            selectedProvince={selectedProvince}
            onChangeProvince={setSelectedProvince}
            selectedParentCarId={selectedCarId}
            onChangeParentCarId={setSelectedCarId}
            onOpenGeoLocator={onOpenGeoLocator}
            matchingCount={scoredRows.length}
          />

          {/* Global Pre-Filters matching MTM CanadaScore 'Filters' Card */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Filters
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setMinFarms(20);
                    setMaxFarms(250000);
                    setMinGrowthPct(-100);
                    setMinAvgRev(0);
                    setMaxAvgRev(10000000);
                  }}
                  title="Reset Global Filters"
                  className="text-slate-400 hover:text-[#0F3D6E] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Total Census Farms (Min / Max)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="number"
                      value={minFarms}
                      onChange={(e) => setMinFarms(Number(e.target.value) || 0)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <input
                      type="number"
                      value={maxFarms}
                      onChange={(e) => setMaxFarms(Number(e.target.value) || 250000)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Farm Count Change 2016–2021: At least (%)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={minGrowthPct}
                      onChange={(e) => setMinGrowthPct(Number(e.target.value))}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <span className="text-slate-500 font-bold">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Avg Gross Revenue / Farm ($)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="number"
                      value={minAvgRev}
                      onChange={(e) => setMinAvgRev(Number(e.target.value) || 0)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <input
                      type="number"
                      value={maxAvgRev}
                      onChange={(e) => setMaxAvgRev(Number(e.target.value) || 10000000)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 rounded bg-[#F7F8FA] p-2 border border-slate-100 text-[10px] text-slate-500">
              Each characteristic is standardized across the {scoredRows.length} qualifying
              geographies into a Z-score and normal percentile (0–100), then combined using your
              custom weights.
            </div>
          </div>
        </div>

        {/* RIGHT 9 COLUMNS: Top (4 Characteristic Cards) + Bottom (Map + Scorecard Table) */}
        <div className="col-span-12 lg:col-span-9 flex flex-col gap-2.5 min-h-0">
          {/* Top Row: Characteristic 1, Characteristic 2, Characteristic 3, Characteristic 4 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {slots.map((slot) => {
              const cMeta = charMap.get(slot.characteristicId);
              const totalWeight = slots.reduce((acc, s) => acc + s.weight, 0) || 1;
              const normWeightPct = ((slot.weight / totalWeight) * 100).toFixed(1);

              return (
                <div
                  key={slot.slotIndex}
                  className="rounded-md bg-white p-2.5 shadow-xs border border-slate-200/90 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                        Characteristic {slot.slotIndex}
                      </h3>
                      <button
                        type="button"
                        onClick={() =>
                          updateSlot(slot.slotIndex, { weight: 0, minPct: 0, maxPct: 100 })
                        }
                        title="Clear / Zero Weight"
                        className="text-slate-400 hover:text-[#0F3D6E] cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Characteristic Dropdown grouped by Category */}
                    <select
                      value={slot.characteristicId}
                      onChange={(e) =>
                        updateSlot(slot.slotIndex, { characteristicId: e.target.value })
                      }
                      className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2 py-1 text-[11px] font-semibold text-[#0F3D6E] mb-1.5"
                    >
                      {categories.map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {dataset.characteristics
                            .filter((c) => c.category === cat)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.shortName}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>

                    <div className="text-[10px] text-slate-500 truncate mb-2" title={cMeta?.name}>
                      {cMeta?.shortName || 'No Selection'} ({normWeightPct}% effective weight)
                    </div>
                  </div>

                  {/* Weight (0.0-1.0) & Filter (%) Min/Max inputs matching MTM CanadaScore */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-slate-100 text-[10px]">
                    <div>
                      <label className="block font-semibold text-slate-500 mb-0.5">Weight</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={slot.weight}
                        onChange={(e) =>
                          updateSlot(slot.slotIndex, {
                            weight: Math.max(0, Math.min(1, Number(e.target.value) || 0))
                          })
                        }
                        className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs font-bold text-[#0F3D6E]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-500 mb-0.5">Min (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={slot.minPct}
                        onChange={(e) =>
                          updateSlot(slot.slotIndex, { minPct: Number(e.target.value) || 0 })
                        }
                        className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-500 mb-0.5">Max (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={slot.maxPct}
                        onChange={(e) =>
                          updateSlot(slot.slotIndex, { maxPct: Number(e.target.value) || 100 })
                        }
                        className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Row: AgScore Results Map (Left) + Scorecard Table (Right) */}
          <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
            {/* AgScore Map */}
            <div className="col-span-12 lg:col-span-5 rounded-md bg-white p-2.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  AgScore Results Map
                </h3>
                <span className="text-[10px] text-slate-400">Hover region for Char 1–4 breakdown</span>
              </div>

              <div className="flex-1 min-h-0">
                <InteractiveAgMap
                  items={mapItems}
                  selectedGeoId={focusedGeoId}
                  focusGeo={focusedGeo}
                  onSelectGeo={(gid) => setFocusedGeoId(gid)}
                  legendElement={
                    <div className="flex items-center justify-between w-full text-[10px] font-semibold">
                      <span className="text-slate-600">AgScore</span>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-2.5 rounded-xs bg-[#E15759]" /> 0–50
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-2.5 rounded-xs bg-[#F28E2B]" /> 50–70
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-2.5 rounded-xs bg-[#4E79A7]" /> 70–90
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-2.5 rounded-xs bg-[#59A14F]" /> 90–100
                        </span>
                      </div>
                    </div>
                  }
                />
              </div>
            </div>

            {/* AgScore Multi-Factor Scorecard Table */}
            <div className="col-span-12 lg:col-span-7 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Ranked Geographies ({scoredRows.length})
                </h3>
                <span className="text-[10px] text-slate-400">
                  Char 1–4 columns display raw % or value and (percentile score)
                </span>
              </div>

              <div className="flex-1 overflow-y-auto border border-slate-200 rounded">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 sticky top-0 text-[10px] text-slate-600 z-10">
                    <tr>
                      <th className="py-2 px-2">Geography</th>
                      <th className="py-2 px-1.5 text-right">Farms</th>
                      <th className="py-2 px-1.5 text-right">Growth</th>
                      <th className="py-2 px-1.5 text-right">Avg Rev</th>
                      <th className="py-2 px-2 text-center bg-[#0F3D6E]/5 font-bold text-[#0F3D6E]">
                        Score ▼
                      </th>
                      <th className="py-2 px-1.5 text-right">Char 1</th>
                      <th className="py-2 px-1.5 text-right">Char 2</th>
                      <th className="py-2 px-1.5 text-right">Char 3</th>
                      <th className="py-2 px-1.5 text-right">Char 4</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {scoredRows.map((row, idx) => {
                      const d = formatDelta(row.farmGrowthPct);
                      const badgeColor = getScoreBandColor(row.compositeScore);
                      return (
                        <tr
                          key={row.geo.id}
                          onClick={() => setFocusedGeoId(row.geo.id)}
                          onDoubleClick={() => onSelectGeoForSnapshot(row.geo)}
                          className={`cursor-pointer transition ${
                            row.geo.id === focusedGeoId ? 'bg-[#0F3D6E]/10' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-1.5 px-2 font-semibold text-[#0F3D6E] max-w-[140px] truncate">
                            <span className="text-slate-400 font-mono mr-1">#{idx + 1}</span>
                            {row.geo.cleanName}
                          </td>
                          <td className="py-1.5 px-1.5 text-right font-medium">
                            {row.totalFarms.toLocaleString()}
                          </td>
                          <td
                            className={`py-1.5 px-1.5 text-right font-semibold ${
                              row.farmGrowthPct === null
                                ? 'text-slate-300'
                                : d.isPositive
                                ? 'text-[#0F9D58]'
                                : 'text-amber-600'
                            }`}
                          >
                            {d.text}
                          </td>
                          <td className="py-1.5 px-1.5 text-right text-slate-600">
                            {formatMetricValue(row.avgRevPerFarm, 'DOLLARS', true)}
                          </td>
                          <td className="py-1.5 px-2 text-center bg-[#0F3D6E]/5">
                            <span
                              className="inline-block rounded px-1.5 py-0.5 text-white font-extrabold text-[11px]"
                              style={{ backgroundColor: badgeColor }}
                            >
                              {row.compositeScore.toFixed(1)}
                            </span>
                          </td>
                          {row.slotMetrics.map((sm) => {
                            const cMeta = charMap.get(
                              slots[sm.slotIndex - 1]?.characteristicId || ''
                            );
                            const displayMetric =
                              sm.pctOrVal !== null
                                ? cMeta?.baseId
                                  ? `${sm.pctOrVal.toFixed(1)}%`
                                  : formatMetricValue(sm.pctOrVal, cMeta?.unit || 'FARMS', true)
                                : '—';
                            return (
                              <td
                                key={sm.slotIndex}
                                className="py-1.5 px-1.5 text-right text-slate-700"
                              >
                                <div className="font-semibold">{displayMetric}</div>
                                <div className="text-[9px] text-slate-400">
                                  P{sm.percentile.toFixed(0)}
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
          </div>
        </div>
      </div>
    </div>
  );
};
