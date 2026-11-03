import React, { useEffect, useMemo, useState } from 'react';
import { AgCensusDataset, GeoLevel, GeographyNode } from '../../types/census';
import {
  MTM_PALETTES,
  computeQuintileBreaks,
  formatDelta,
  formatMetricValue,
  getObservation,
  getQuintileColor,
  getRawNumber
} from '../../utils/analytics';
import { MultiGeographyScopeSlicer } from '../GeographySlicer';
import { InteractiveAgMap, MapItemPoint } from '../InteractiveAgMap';
import { Download, HelpCircle, MapPin, RotateCcw } from 'lucide-react';

interface AgRankerModuleProps {
  dataset: AgCensusDataset;
  onOpenGeoLocator: () => void;
  onSelectGeoForSnapshot: (geo: GeographyNode) => void;
}

export const AgRankerModule: React.FC<AgRankerModuleProps> = ({
  dataset,
  onOpenGeoLocator,
  onSelectGeoForSnapshot
}) => {
  const [rankerMode, setRankerMode] = useState<'counts' | 'agg'>('counts');
  const [selectedLevel, setSelectedLevel] = useState<GeoLevel>('Counties / Census Divisions (CD)');
  const [selectedProvince, setSelectedProvince] = useState<string>('35'); // Default Ontario
  const [selectedCarId, setSelectedCarId] = useState<string>('ALL');

  const categories = useMemo(() => {
    const s = new Set<string>();
    dataset.characteristics.forEach((c) => s.add(c.category));
    return Array.from(s);
  }, [dataset.characteristics]);

  const [selectedCategory, setSelectedCategory] = useState<string>(
    categories[0] || '1. Farm Types & Industry (NAICS)'
  );
  const [selectedCharId, setSelectedCharId] = useState<string>('naics_dairy');

  // Ranker range filters (matching MTM Ranker Filters card at bottom-left)
  const [minFarms, setMinFarms] = useState<number>(10);
  const [maxFarms, setMaxFarms] = useState<number>(250000);
  const [minPct, setMinPct] = useState<number>(0);
  const [maxPct, setMaxPct] = useState<number>(100);

  const [sortCol, setSortCol] = useState<'val' | 'pct' | 'delta' | 'farms'>('val');
  const [mapColorMode, setMapColorMode] = useState<'val' | 'pct'>('pct');
  const [paletteMode, setPaletteMode] = useState<'standard' | 'accessible'>('standard');
  const [focusedGeoId, setFocusedGeoId] = useState<string | null>(null);
  const [showBaseTooltip, setShowBaseTooltip] = useState<boolean>(false);

  // Eligible characteristics for the current mode & category
  const availableChars = useMemo(() => {
    return dataset.characteristics.filter((c) => {
      if (c.category !== selectedCategory) return false;
      if (rankerMode === 'counts') return c.layer1 === 'Characteristic Distribution';
      return c.layer1 === 'Aggregate Statistics';
    });
  }, [dataset.characteristics, selectedCategory, rankerMode]);

  useEffect(() => {
    if (availableChars.length > 0 && !availableChars.some((c) => c.id === selectedCharId)) {
      setSelectedCharId(availableChars[0].id);
    }
  }, [availableChars, selectedCharId]);

  const activeCharMeta = useMemo(
    () =>
      dataset.characteristics.find((c) => c.id === selectedCharId) ||
      dataset.characteristics[0],
    [dataset.characteristics, selectedCharId]
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

  // Compute and filter leaderboard rows
  const leaderboardRows = useMemo(() => {
    const rows = scopedGeos
      .map((geo) => {
        const obs = getObservation(dataset, geo.id, activeCharMeta);
        const totalFarms = getRawNumber(dataset, geo.id, 'total_farms', 0) || 0;
        return {
          geo,
          obs,
          totalFarms
        };
      })
      .filter((r) => {
        if (r.obs.val2021 === null) return false;
        if (r.totalFarms < minFarms || r.totalFarms > maxFarms) return false;
        if (rankerMode === 'counts' && r.obs.pctOfBase !== null) {
          if (r.obs.pctOfBase < minPct || r.obs.pctOfBase > maxPct) return false;
        }
        return true;
      });

    rows.sort((a, b) => {
      if (sortCol === 'pct') return (b.obs.pctOfBase ?? -1) - (a.obs.pctOfBase ?? -1);
      if (sortCol === 'delta') return (b.obs.pctChange ?? -999) - (a.obs.pctChange ?? -999);
      if (sortCol === 'farms') return b.totalFarms - a.totalFarms;
      return (b.obs.val2021 ?? -1) - (a.obs.val2021 ?? -1);
    });

    return rows;
  }, [scopedGeos, dataset, activeCharMeta, minFarms, maxFarms, minPct, maxPct, rankerMode, sortCol]);

  const maxVal = useMemo(
    () => Math.max(1, ...leaderboardRows.map((r) => r.obs.val2021 || 0)),
    [leaderboardRows]
  );
  const maxPctBar = useMemo(
    () => Math.max(1, ...leaderboardRows.map((r) => r.obs.pctOfBase || 0)),
    [leaderboardRows]
  );

  // Quintiles for Map
  const quintileBreaks = useMemo(() => {
    const vals = leaderboardRows.map((r) =>
      rankerMode === 'counts' && mapColorMode === 'pct' && r.obs.pctOfBase !== null
        ? r.obs.pctOfBase
        : r.obs.val2021 || 0
    );
    return computeQuintileBreaks(vals);
  }, [leaderboardRows, rankerMode, mapColorMode]);

  const mapItems: MapItemPoint[] = useMemo(() => {
    return leaderboardRows.map((r, idx) => {
      const mVal =
        rankerMode === 'counts' && mapColorMode === 'pct' && r.obs.pctOfBase !== null
          ? r.obs.pctOfBase
          : r.obs.val2021 || 0;
      return {
        geo: r.geo,
        value: mVal,
        formattedValue: `#${idx + 1}: ${formatMetricValue(r.obs.val2021, activeCharMeta.unit)}`,
        secondaryLabel:
          r.obs.pctOfBase !== null
            ? `${r.obs.pctOfBase.toFixed(1)}% of Base | ${r.totalFarms.toLocaleString()} farms`
            : `${r.totalFarms.toLocaleString()} total farms`,
        color: getQuintileColor(mVal, quintileBreaks, paletteMode),
        radius: 7,
        isSelected: r.geo.id === focusedGeoId
      };
    });
  }, [leaderboardRows, rankerMode, mapColorMode, activeCharMeta.unit, quintileBreaks, paletteMode, focusedGeoId]);

  const focusedGeo = useMemo(
    () => dataset.geographies.find((g) => g.id === focusedGeoId) || null,
    [dataset.geographies, focusedGeoId]
  );

  const exportRankerCsv = () => {
    const headers = [
      'Rank',
      'Geography',
      'DGUID',
      'OFA Federation',
      'Characteristic',
      '2021 Value',
      '% of Base',
      '2016 Value',
      '2016-2021 % Change',
      'Total Farms'
    ];
    const lines = [headers.join(',')];
    leaderboardRows.forEach((r, idx) => {
      lines.push(
        [
          idx + 1,
          `"${r.geo.name}"`,
          r.geo.dguid,
          `"${r.geo.ofaFederation || ''}"`,
          `"${activeCharMeta.shortName}"`,
          r.obs.val2021 ?? '',
          r.obs.pctOfBase !== null ? `${r.obs.pctOfBase}%` : '',
          r.obs.val2016 ?? '',
          r.obs.pctChange !== null ? `${r.obs.pctChange}%` : '',
          r.totalFarms
        ].join(',')
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AgRanker_${activeCharMeta.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2 rounded-md border border-slate-200/90 shadow-xs">
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-[#0F3D6E] uppercase">
            RANKER: {activeCharMeta.shortName}
          </h1>
          <p className="text-[11px] text-slate-500">
            Regional Leaderboard with Inline Data Bars, Range Filters & Quintile Choropleth •{' '}
            <span className="font-semibold text-[#0F3D6E]">{activeCharMeta.statcanTable}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={exportRankerCsv}
          className="
            inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white
            px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E] hover:bg-slate-50
            transition cursor-pointer
          "
        >
          <Download className="w-3.5 h-3.5 text-[#328475]" />
          <span>Export Leaderboard (CSV)</span>
        </button>
      </div>

      {/* Main 3-Column Grid matching MTM Ranker */}
      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        {/* LEFT COLUMN (3 cols): Geographies + Variable + Ranker Filters */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2 overflow-y-auto pr-0.5">
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
            matchingCount={leaderboardRows.length}
          />

          {/* Variable Slicer with Counts vs Aggregate Statistics Mode Switcher */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E] mb-2">
              Variable
            </h3>

            {/* Seamless Switch between Ranker Counts and Ranker Agg */}
            <div className="grid grid-cols-2 gap-1 rounded bg-slate-100 p-1 text-[11px] font-semibold mb-2.5">
              <button
                type="button"
                onClick={() => setRankerMode('counts')}
                className={`py-1 rounded cursor-pointer transition ${
                  rankerMode === 'counts'
                    ? 'bg-[#0F3D6E] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Counts & Share
              </button>
              <button
                type="button"
                onClick={() => setRankerMode('agg')}
                className={`py-1 rounded cursor-pointer transition ${
                  rankerMode === 'agg'
                    ? 'bg-[#0F3D6E] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Aggregate Stats
              </button>
            </div>

            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
              Variable Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="mb-2 w-full rounded border border-slate-300 bg-[#F8FAFC] px-2 py-1.5 text-xs font-semibold text-[#0F3D6E]"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
              Specific Metric to Rank
            </label>
            <select
              value={selectedCharId}
              onChange={(e) => setSelectedCharId(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800"
            >
              {availableChars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.shortName}
                </option>
              ))}
            </select>
          </div>

          {/* Ranker Filters Card matching MTM Ranker bottom-left */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Ranker Filters
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setMinFarms(0);
                    setMaxFarms(250000);
                    setMinPct(0);
                    setMaxPct(100);
                  }}
                  title="Reset Ranker Filters"
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
                      placeholder="Min farms"
                    />
                    <input
                      type="number"
                      value={maxFarms}
                      onChange={(e) => setMaxFarms(Number(e.target.value) || 250000)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      placeholder="Max farms"
                    />
                  </div>
                </div>

                {rankerMode === 'counts' && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1">
                      <span>Percentage Share Filter (%)</span>
                      <span className="text-[#0F3D6E]">
                        {minPct}% – {maxPct}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={minPct}
                        onChange={(e) => setMinPct(Number(e.target.value) || 0)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={maxPct}
                        onChange={(e) => setMaxPct(Number(e.target.value) || 100)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
              Showing <span className="font-bold text-[#0F3D6E]">{leaderboardRows.length}</span> of{' '}
              {scopedGeos.length} geographies matching criteria.
            </div>
          </div>
        </div>

        {/* CENTER COLUMN (5 cols): Leaderboard Table with Inline Data Bars */}
        <div className="col-span-12 lg:col-span-5 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                {activeCharMeta.shortName}
              </h3>
              <p className="text-[10px] text-slate-400">
                Click column headers to sort • Click &apos;Map&apos; to zoom
              </p>
            </div>

            {rankerMode === 'counts' && (
              <button
                type="button"
                onClick={() => setShowBaseTooltip((p) => !p)}
                className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                <span>Base</span>
                <HelpCircle className="w-3 h-3 text-[#4E79A7]" />
              </button>
            )}
          </div>

          {showBaseTooltip && (
            <div className="mb-2 rounded bg-[#071D49] p-2 text-xs text-white flex items-center justify-between">
              <span>Denominator Base: {activeCharMeta.baseDescription}</span>
              <button onClick={() => setShowBaseTooltip(false)}>✕</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto border border-slate-200 rounded">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 sticky top-0 text-[11px] text-slate-600 z-10">
                <tr>
                  <th className="py-2 px-2">Geography</th>
                  <th
                    onClick={() => setSortCol('val')}
                    className="py-2 px-2 text-right cursor-pointer hover:text-[#0F3D6E]"
                  >
                    {rankerMode === 'counts' ? 'Count / Value' : 'Value'} {sortCol === 'val' && '▼'}
                  </th>
                  {rankerMode === 'counts' && (
                    <th
                      onClick={() => setSortCol('pct')}
                      className="py-2 px-2 text-right cursor-pointer hover:text-[#0F3D6E]"
                    >
                      % {sortCol === 'pct' && '▼'}
                    </th>
                  )}
                  <th
                    onClick={() => setSortCol('delta')}
                    className="py-2 px-2 text-right cursor-pointer hover:text-[#0F3D6E]"
                  >
                    16–21 Δ {sortCol === 'delta' && '▼'}
                  </th>
                  <th
                    onClick={() => setSortCol('farms')}
                    className="py-2 px-2 text-right cursor-pointer hover:text-[#0F3D6E]"
                  >
                    Farms {sortCol === 'farms' && '▼'}
                  </th>
                  <th className="py-2 px-1.5 text-center">Map</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaderboardRows.map((row, idx) => {
                  const val = row.obs.val2021 || 0;
                  const pct = row.obs.pctOfBase;
                  const barW = Math.min(100, Math.max(2, (val / maxVal) * 100));
                  const pctBarW =
                    pct !== null ? Math.min(100, Math.max(2, (pct / maxPctBar) * 100)) : 0;
                  const delta = formatDelta(row.obs.pctChange);

                  return (
                    <tr
                      key={row.geo.id}
                      onClick={() => setFocusedGeoId(row.geo.id)}
                      onDoubleClick={() => onSelectGeoForSnapshot(row.geo)}
                      className={`cursor-pointer transition ${
                        row.geo.id === focusedGeoId ? 'bg-[#0F3D6E]/10' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-1.5 px-2 font-medium text-slate-800 max-w-[140px]">
                        <div className="truncate font-semibold text-[#0F3D6E]" title={row.geo.name}>
                          <span className="text-slate-400 font-mono mr-1">#{idx + 1}</span>
                          {row.geo.cleanName}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {row.geo.provinceName}
                        </div>
                      </td>

                      {/* Value cell with inline proportional data bar (matching MTM Ranker) */}
                      <td className="py-1.5 px-2 text-right align-middle">
                        <div className="font-bold text-slate-900">
                          {formatMetricValue(row.obs.val2021, activeCharMeta.unit, true)}
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-xs overflow-hidden mt-0.5">
                          <div
                            className="h-full bg-[#0F3D6E]"
                            style={{ width: `${barW}%` }}
                          />
                        </div>
                      </td>

                      {/* Percentage cell with inline proportional data bar */}
                      {rankerMode === 'counts' && (
                        <td className="py-1.5 px-2 text-right align-middle">
                          <div className="font-bold text-[#0F3D6E]">
                            {pct !== null ? `${pct.toFixed(1)}%` : '—'}
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-xs overflow-hidden mt-0.5">
                            <div
                              className="h-full bg-[#328475]"
                              style={{ width: `${pctBarW}%` }}
                            />
                          </div>
                        </td>
                      )}

                      <td
                        className={`py-1.5 px-2 text-right font-semibold ${
                          row.obs.pctChange === null
                            ? 'text-slate-300'
                            : delta.isPositive
                            ? 'text-[#0F9D58]'
                            : 'text-amber-600'
                        }`}
                      >
                        {delta.text}
                      </td>

                      <td className="py-1.5 px-2 text-right text-slate-500">
                        {row.totalFarms.toLocaleString()}
                      </td>

                      <td className="py-1.5 px-1.5 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocusedGeoId(row.geo.id);
                          }}
                          className="text-[11px] font-semibold text-[#0F3D6E] underline hover:text-[#328475] cursor-pointer"
                        >
                          Map
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN (4 cols): Synchronized Quintile Map */}
        <div className="col-span-12 lg:col-span-4 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
            {rankerMode === 'counts' ? (
              <div className="flex items-center gap-1 rounded bg-slate-100 p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setMapColorMode('val')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    mapColorMode === 'val' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                  }`}
                >
                  Counts
                </button>
                <button
                  type="button"
                  onClick={() => setMapColorMode('pct')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    mapColorMode === 'pct' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                  }`}
                >
                  Percentages
                </button>
              </div>
            ) : (
              <span className="text-xs font-bold uppercase text-[#0F3D6E]">
                Quintile Map ({activeCharMeta.shortName})
              </span>
            )}

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
                <div className="flex flex-col w-full gap-1">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                    <span>P0 ({quintileBreaks[0].toFixed(1)})</span>
                    <span>P50</span>
                    <span>P100 ({quintileBreaks[5].toFixed(1)})</span>
                  </div>
                  <div className="grid grid-cols-5 h-2.5 w-full rounded-xs overflow-hidden">
                    {MTM_PALETTES[paletteMode].map((col) => (
                      <div key={col} style={{ backgroundColor: col }} />
                    ))}
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};
