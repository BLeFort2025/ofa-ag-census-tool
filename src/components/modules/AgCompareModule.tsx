import React, { useEffect, useMemo, useState } from 'react';
import { AgCensusDataset, GeographyNode } from '../../types/census';
import { formatMetricValue, getObservation, getRawNumber } from '../../utils/analytics';
import { SingleGeographySlicer } from '../GeographySlicer';
import { InteractiveAgMap } from '../InteractiveAgMap';
import { ArrowLeftRight, Compass, HelpCircle, MapPin, Sparkles, Trophy } from 'lucide-react';

interface AgCompareModuleProps {
  dataset: AgCensusDataset;
  geoA: GeographyNode;
  geoB: GeographyNode;
  onSelectGeoA: (geo: GeographyNode) => void;
  onSelectGeoB: (geo: GeographyNode) => void;
  onOpenGeoLocator: () => void;
}

interface SimilarityPeerMatch {
  geo: GeographyNode;
  similarityPct: number;
  rmsZDistance: number;
}

interface SimilarityPairMatch {
  geoA: GeographyNode;
  geoB: GeographyNode;
  similarityPct: number;
  rmsZDistance: number;
}

export const AgCompareModule: React.FC<AgCompareModuleProps> = ({
  dataset,
  geoA,
  geoB,
  onSelectGeoA,
  onSelectGeoB,
  onOpenGeoLocator
}) => {
  const categories = useMemo(() => {
    const s = new Set<string>();
    dataset.characteristics.forEach((c) => s.add(c.category));
    return Array.from(s);
  }, [dataset.characteristics]);

  const [selectedCategory, setSelectedCategory] = useState<string>(
    categories[0] || '1. Farm Types & Industry (NAICS)'
  );
  const [selectedLayer2, setSelectedLayer2] = useState<string>('');
  const [metricMode, setMetricMode] = useState<'pct' | 'count'>('pct');
  const [sortBy, setSortBy] = useState<'id' | 'alpha' | 'geoA' | 'geoB'>('geoB');
  const [showMapModal, setShowMapModal] = useState<'A' | 'B' | null>(null);
  const [showBaseTooltip, setShowBaseTooltip] = useState<boolean>(false);

  // Similarity & Twin Finder state
  const [simScope, setSimScope] = useState<'province' | 'canada'>('province');
  const [simBasis, setSimBasis] = useState<'segment' | 'overall'>('segment');
  const [simMode, setSimMode] = useState<'matchA' | 'topPairs'>('matchA');

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

  // Distribution rows comparing Geography A and Geography B
  const compareRows = useMemo(() => {
    const chars = dataset.characteristics.filter(
      (c) =>
        c.category === selectedCategory &&
        c.layer1 === 'Characteristic Distribution' &&
        (!selectedLayer2 || c.layer2 === selectedLayer2)
    );

    const rows = chars.map((meta) => {
      const obsA = getObservation(dataset, geoA.id, meta);
      const obsB = getObservation(dataset, geoB.id, meta);
      const valA = metricMode === 'pct' ? obsA.pctOfBase : obsA.val2021;
      const valB = metricMode === 'pct' ? obsB.pctOfBase : obsB.val2021;

      const isMaxA = valA !== null && valB !== null ? valA > valB : valA !== null;
      const isMaxB = valA !== null && valB !== null ? valB > valA : valB !== null;

      return {
        meta,
        obsA,
        obsB,
        valA,
        valB,
        isMaxA,
        isMaxB
      };
    });

    rows.sort((a, b) => {
      if (sortBy === 'geoA') return (b.valA ?? -1) - (a.valA ?? -1);
      if (sortBy === 'geoB') return (b.valB ?? -1) - (a.valB ?? -1);
      if (sortBy === 'alpha') return a.meta.shortName.localeCompare(b.meta.shortName);
      return a.meta.codeId - b.meta.codeId;
    });

    return rows;
  }, [dataset, geoA.id, geoB.id, selectedCategory, selectedLayer2, metricMode, sortBy]);

  // Build standardized feature vectors across the active candidate pool for Similarity Matching
  const similarityEngine = useMemo(() => {
    // Candidate pool: same geographic level as Geography A, within province or across Canada
    // Require at least 15 census farms so tiny urban/unorganized 1-farm areas don't distort pairs
    const candidates = dataset.geographies.filter((g) => {
      if (g.level !== geoA.level) return false;
      if (simScope === 'province' && geoA.provinceCode && g.provinceCode !== geoA.provinceCode) {
        return false;
      }
      const farms = getRawNumber(dataset, g.id, 'total_farms', 0) || 0;
      return farms >= 15 || g.id === geoA.id || g.id === geoB.id;
    });

    // Characteristics used to evaluate similarity:
    // - 'segment': uses the exact active Compare By filter (Category + Sub-Topic + Percentages/Counts mode)
    // - 'overall': uses all Characteristic Distribution items across all 6 categories + core economic benchmarks
    const featureChars =
      simBasis === 'segment'
        ? dataset.characteristics.filter(
            (c) =>
              c.category === selectedCategory &&
              c.layer1 === 'Characteristic Distribution' &&
              (!selectedLayer2 || c.layer2 === selectedLayer2)
          )
        : dataset.characteristics.filter((c) => c.layer1 === 'Characteristic Distribution');

    if (candidates.length < 2 || featureChars.length === 0) {
      return {
        candidates,
        topMatchesForA: [] as SimilarityPeerMatch[],
        topPairsInScope: [] as SimilarityPairMatch[],
        currentPairSimilarityPct: null as number | null
      };
    }

    // Extract raw feature matrix [candidateIdx][featureIdx]
    const numC = candidates.length;
    const numF = featureChars.length;
    const rawMatrix: number[][] = Array.from({ length: numC }, () => new Array(numF).fill(0));

    for (let ci = 0; ci < numC; ci++) {
      const g = candidates[ci];
      for (let fi = 0; fi < numF; fi++) {
        const meta = featureChars[fi];
        const obs = getObservation(dataset, g.id, meta);
        const val = metricMode === 'pct' ? obs.pctOfBase : obs.val2021;
        rawMatrix[ci][fi] = val !== null && !Number.isNaN(val) ? val : 0;
      }
    }

    // Compute mean and standard deviation per feature across the candidate pool
    const stdDevs = new Array(numF).fill(1);
    for (let fi = 0; fi < numF; fi++) {
      let sum = 0;
      for (let ci = 0; ci < numC; ci++) sum += rawMatrix[ci][fi];
      const mean = sum / numC;
      let sq = 0;
      for (let ci = 0; ci < numC; ci++) {
        const diff = rawMatrix[ci][fi] - mean;
        sq += diff * diff;
      }
      const sd = Math.sqrt(sq / Math.max(1, numC - 1));
      // Floor SD so near-zero niche variables don't dominate percentage profiles
      stdDevs[fi] = metricMode === 'pct' ? Math.max(1.25, sd) : Math.max(1, sd);
    }

    // Pre-standardize feature vectors
    const zMatrix: number[][] = Array.from({ length: numC }, (_, ci) =>
      rawMatrix[ci].map((val, fi) => val / stdDevs[fi])
    );

    const calcSimilarity = (idx1: number, idx2: number): { rms: number; pct: number } => {
      const v1 = zMatrix[idx1];
      const v2 = zMatrix[idx2];
      let sumSq = 0;
      for (let fi = 0; fi < numF; fi++) {
        const d = v1[fi] - v2[fi];
        sumSq += d * d;
      }
      const rms = Math.sqrt(sumSq / numF);
      const pct = Number((100 * Math.exp(-0.45 * rms)).toFixed(1));
      return { rms, pct };
    };

    const idxA = candidates.findIndex((c) => c.id === geoA.id);
    const idxB = candidates.findIndex((c) => c.id === geoB.id);

    // 1. Top Matches for currently selected Geography A
    const topMatchesForA: SimilarityPeerMatch[] = [];
    if (idxA !== -1) {
      for (let ci = 0; ci < numC; ci++) {
        if (ci === idxA) continue;
        const { rms, pct } = calcSimilarity(idxA, ci);
        topMatchesForA.push({
          geo: candidates[ci],
          similarityPct: pct,
          rmsZDistance: rms
        });
      }
      topMatchesForA.sort((a, b) => a.rmsZDistance - b.rmsZDistance);
    }

    // 2. Top Most Alike Pairs across the entire Scope (e.g., which 2 Ontario Counties are most alike)
    const allPairs: SimilarityPairMatch[] = [];
    const maxPairCandidates = Math.min(numC, 320);
    for (let i = 0; i < maxPairCandidates; i++) {
      for (let j = i + 1; j < maxPairCandidates; j++) {
        const { rms, pct } = calcSimilarity(i, j);
        allPairs.push({
          geoA: candidates[i],
          geoB: candidates[j],
          similarityPct: pct,
          rmsZDistance: rms
        });
      }
    }
    allPairs.sort((a, b) => a.rmsZDistance - b.rmsZDistance);

    const currentPairSimilarityPct =
      idxA !== -1 && idxB !== -1 && idxA !== idxB ? calcSimilarity(idxA, idxB).pct : null;

    return {
      candidates,
      topMatchesForA: topMatchesForA.slice(0, 6),
      topPairsInScope: allPairs.slice(0, 6),
      currentPairSimilarityPct
    };
  }, [
    dataset,
    geoA.id,
    geoA.level,
    geoA.provinceCode,
    geoB.id,
    simScope,
    simBasis,
    selectedCategory,
    selectedLayer2,
    metricMode
  ]);

  const maxAxisVal = useMemo(() => {
    const allVals: number[] = [];
    for (const r of compareRows) {
      if (r.valA !== null) allVals.push(r.valA);
      if (r.valB !== null) allVals.push(r.valB);
    }
    return Math.max(1, ...allVals);
  }, [compareRows]);

  // Side-by-side Aggregate Statistics rows
  const aggCompareRows = useMemo(() => {
    const catAggs = dataset.characteristics.filter(
      (c) => c.category === selectedCategory && c.layer1 === 'Aggregate Statistics'
    );
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

    return [...catAggs, ...extras].map((meta) => {
      const obsA = getObservation(dataset, geoA.id, meta);
      const obsB = getObservation(dataset, geoB.id, meta);
      const va = obsA.val2021;
      const vb = obsB.val2021;
      return {
        meta,
        obsA,
        obsB,
        isMaxA: va !== null && vb !== null ? va > vb : false,
        isMaxB: va !== null && vb !== null ? vb > va : false
      };
    });
  }, [dataset, geoA.id, geoB.id, selectedCategory]);

  const swapGeographies = () => {
    const temp = geoA;
    onSelectGeoA(geoB);
    onSelectGeoB(temp);
  };

  const provinceNameForA = useMemo(() => {
    if (!geoA.provinceCode) return 'Same Province';
    const p = dataset.geographies.find(
      (g) => g.level === 'Provinces & Territories' && g.provinceCode === geoA.provinceCode
    );
    return p?.cleanName || 'Same Province';
  }, [dataset.geographies, geoA.provinceCode]);

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Top Header Bar + Agricultural Twin / Similarity Finder */}
      <div className="bg-white px-3.5 py-2.5 rounded-md border border-slate-200/90 shadow-xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-[#0F3D6E] uppercase">
                  COMPARE: {geoA.cleanName} VS. {geoB.cleanName}
                </h1>
                {similarityEngine.currentPairSimilarityPct !== null && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800"
                    title="Statistical similarity score between Geography A and Geography B across the active filter criteria"
                  >
                    <Sparkles className="w-3 h-3 text-[#328475]" />
                    <span>{similarityEngine.currentPairSimilarityPct}% Profile Match</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Side-by-Side Benchmarking with Automated Leader Indicators (
                <span className="text-[#0F9D58] font-bold">●</span> marks the higher value on each row)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* 1-Click Auto-Match Most Similar to Geo A */}
            <button
              type="button"
              disabled={similarityEngine.topMatchesForA.length === 0}
              onClick={() => {
                setSimMode('matchA');
                if (similarityEngine.topMatchesForA[0]) {
                  onSelectGeoB(similarityEngine.topMatchesForA[0].geo);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded bg-[#328475] hover:bg-[#276B5E] disabled:opacity-40 px-2.5 py-1.5 text-xs font-bold text-white shadow-2xs transition cursor-pointer"
              title={`Automatically set Geography B to the #1 most similar geography to ${geoA.cleanName}`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>
                Find Closest Match to {geoA.cleanName} (
                {simScope === 'province' ? provinceNameForA : 'Canada'})
              </span>
            </button>

            {/* 1-Click Discover #1 Most Alike Pair in Province / Canada */}
            <button
              type="button"
              disabled={similarityEngine.topPairsInScope.length === 0}
              onClick={() => {
                setSimMode('topPairs');
                if (similarityEngine.topPairsInScope[0]) {
                  onSelectGeoA(similarityEngine.topPairsInScope[0].geoA);
                  onSelectGeoB(similarityEngine.topPairsInScope[0].geoB);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded bg-[#0F3D6E] hover:bg-[#164677] disabled:opacity-40 px-2.5 py-1.5 text-xs font-bold text-white shadow-2xs transition cursor-pointer"
              title="Automatically find and load the two most similar geographies in the active scope"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-300" />
              <span>
                Most Alike Pair in {simScope === 'province' ? provinceNameForA : 'All Canada'}
              </span>
            </button>

            <button
              type="button"
              onClick={swapGeographies}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E] hover:bg-slate-50 transition cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[#328475]" />
              <span>Swap A ↔ B</span>
            </button>
          </div>
        </div>

        {/* Interactive Similarity Controls & Top Matches Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px]">
          {/* Left: Mode + Scope (Province vs Canada) + Criteria (Active Filter vs Full Profile) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded bg-slate-100 p-0.5 font-semibold">
              <button
                type="button"
                onClick={() => setSimMode('matchA')}
                className={`px-2 py-0.5 rounded cursor-pointer transition ${
                  simMode === 'matchA' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                }`}
              >
                Closest to {geoA.cleanName}
              </button>
              <button
                type="button"
                onClick={() => setSimMode('topPairs')}
                className={`px-2 py-0.5 rounded cursor-pointer transition ${
                  simMode === 'topPairs' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                }`}
              >
                Closest Pairs (A ↔ B)
              </button>
            </div>

            <div className="inline-flex rounded bg-slate-100 p-0.5 font-semibold">
              <button
                type="button"
                onClick={() => setSimScope('province')}
                className={`px-2 py-0.5 rounded cursor-pointer transition ${
                  simScope === 'province' ? 'bg-[#328475] text-white' : 'text-slate-600'
                }`}
              >
                Within {provinceNameForA}
              </button>
              <button
                type="button"
                onClick={() => setSimScope('canada')}
                className={`px-2 py-0.5 rounded cursor-pointer transition ${
                  simScope === 'canada' ? 'bg-[#328475] text-white' : 'text-slate-600'
                }`}
              >
                All of Canada
              </button>
            </div>

            <div className="inline-flex rounded bg-slate-100 p-0.5 font-semibold">
              <button
                type="button"
                onClick={() => setSimBasis('segment')}
                className={`px-2 py-0.5 rounded cursor-pointer transition ${
                  simBasis === 'segment' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                }`}
                title="Rank similarity using the active Compare By category, sub-topic, and %/Counts mode on the left"
              >
                Match by: Active Segment Filter
              </button>
              <button
                type="button"
                onClick={() => setSimBasis('overall')}
                className={`px-2 py-0.5 rounded cursor-pointer transition ${
                  simBasis === 'overall' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                }`}
                title="Rank similarity across all 6 Census categories combined"
              >
                Match by: Full Ag Profile (All Topics)
              </button>
            </div>
          </div>

          {/* Right: Clickable Top 5 Similar Geographies or Top 5 Most Alike Pairs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {simMode === 'matchA' ? (
              <>
                <span className="font-bold text-slate-500">
                  Top Matches for {geoA.cleanName}:
                </span>
                {similarityEngine.topMatchesForA.slice(0, 5).map((m, idx) => {
                  const isActiveB = m.geo.id === geoB.id;
                  return (
                    <button
                      key={m.geo.id}
                      type="button"
                      onClick={() => onSelectGeoB(m.geo)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold border transition cursor-pointer ${
                        isActiveB
                          ? 'bg-[#0F3D6E] text-white border-[#0F3D6E]'
                          : 'bg-slate-50 hover:bg-slate-100 text-[#0F3D6E] border-slate-200'
                      }`}
                      title={`Click to compare ${geoA.cleanName} vs. ${m.geo.name} (${m.similarityPct}% similarity)`}
                    >
                      <span className="opacity-70">#{idx + 1}</span>
                      <span>{m.geo.cleanName}</span>
                      <span
                        className={`text-[10px] ${
                          isActiveB ? 'text-emerald-300' : 'text-[#328475]'
                        }`}
                      >
                        {m.similarityPct}%
                      </span>
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                <span className="font-bold text-slate-500">
                  Most Alike Pairs ({simScope === 'province' ? provinceNameForA : 'Canada'}):
                </span>
                {similarityEngine.topPairsInScope.slice(0, 4).map((pair, idx) => {
                  const isCurrentPair =
                    (pair.geoA.id === geoA.id && pair.geoB.id === geoB.id) ||
                    (pair.geoA.id === geoB.id && pair.geoB.id === geoA.id);
                  return (
                    <button
                      key={`${pair.geoA.id}_${pair.geoB.id}`}
                      type="button"
                      onClick={() => {
                        onSelectGeoA(pair.geoA);
                        onSelectGeoB(pair.geoB);
                      }}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold border transition cursor-pointer ${
                        isCurrentPair
                          ? 'bg-[#0F3D6E] text-white border-[#0F3D6E]'
                          : 'bg-slate-50 hover:bg-slate-100 text-[#0F3D6E] border-slate-200'
                      }`}
                      title={`Click to compare ${pair.geoA.name} ↔ ${pair.geoB.name} (${pair.similarityPct}% similarity)`}
                    >
                      <span className="opacity-70">#{idx + 1}</span>
                      <span>
                        {pair.geoA.cleanName} ↔ {pair.geoB.cleanName}
                      </span>
                      <span
                        className={`text-[10px] ${
                          isCurrentPair ? 'text-emerald-300' : 'text-[#328475]'
                        }`}
                      >
                        {pair.similarityPct}%
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main 3-Column Grid matching MTM Compare */}
      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        {/* LEFT COLUMN (3 cols): Geography A + Geography B + Compare By Slicer */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2 overflow-y-auto pr-0.5">
          <SingleGeographySlicer
            title="Geography A"
            geographies={dataset.geographies}
            selectedGeo={geoA}
            onSelectGeo={onSelectGeoA}
            onOpenGeoLocator={onOpenGeoLocator}
            accentColor="#94A3B8"
            onShowMapModal={() => setShowMapModal('A')}
          />

          <SingleGeographySlicer
            title="Geography B"
            geographies={dataset.geographies}
            selectedGeo={geoB}
            onSelectGeo={onSelectGeoB}
            onOpenGeoLocator={onOpenGeoLocator}
            accentColor="#0F3D6E"
            onShowMapModal={() => setShowMapModal('B')}
          />

          {/* Compare By Variable Selector */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E] mb-2">
                Compare by
              </h3>

              {/* Percentages vs Counts Toggle matching MTM Compare */}
              <div className="grid grid-cols-2 gap-1 rounded bg-slate-100 p-1 text-xs font-semibold mb-2.5">
                <button
                  type="button"
                  onClick={() => setMetricMode('pct')}
                  className={`py-1 rounded cursor-pointer transition ${
                    metricMode === 'pct'
                      ? 'bg-[#0F3D6E] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Percentages
                </button>
                <button
                  type="button"
                  onClick={() => setMetricMode('count')}
                  className={`py-1 rounded cursor-pointer transition ${
                    metricMode === 'count'
                      ? 'bg-[#0F3D6E] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Counts
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
                Sub-Topic Breakdown
              </label>
              <select
                value={selectedLayer2}
                onChange={(e) => setSelectedLayer2(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-800"
              >
                {layer2Options.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* CENTER COLUMN (6 cols): Diverging / Butterfly Bar Chart */}
        <div className="col-span-12 lg:col-span-6 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2 border-b border-slate-100">
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
              <div className="mt-1 flex items-center gap-4 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-3 h-3 rounded-xs bg-[#94A3B8] inline-block" />
                  A: {geoA.cleanName}
                </span>
                <span className="flex items-center gap-1.5 text-[#0F3D6E]">
                  <span className="w-3 h-3 rounded-xs bg-[#0F3D6E] inline-block" />
                  B: {geoB.cleanName}
                </span>
              </div>
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700"
            >
              <option value="geoB">Sort: Geography B (High-Low)</option>
              <option value="geoA">Sort: Geography A (High-Low)</option>
              <option value="id">Sort: Census ID</option>
              <option value="alpha">Sort: Characteristic (A-Z)</option>
            </select>
          </div>

          {showBaseTooltip && compareRows[0] && (
            <div className="mb-2.5 rounded bg-[#071D49] p-2.5 text-xs text-white flex items-center justify-between">
              <div>
                <span className="font-bold">Denominator Base: </span>
                <span>{compareRows[0].meta.baseDescription}. </span>
                <span className="ml-2 font-semibold">
                  {geoA.cleanName} Base = {compareRows[0].obsA.baseVal2021?.toLocaleString() ?? 'N/A'}{' '}
                  | {geoB.cleanName} Base ={' '}
                  {compareRows[0].obsB.baseVal2021?.toLocaleString() ?? 'N/A'}
                </span>
              </div>
              <button onClick={() => setShowBaseTooltip(false)} className="text-slate-300 ml-2">
                ✕
              </button>
            </div>
          )}

          {/* Butterfly Rows */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
            {compareRows.map((row) => {
              const wA =
                row.valA !== null && row.valA > 0
                  ? Math.min(100, Math.max(3, (row.valA / maxAxisVal) * 100))
                  : 0;
              const wB =
                row.valB !== null && row.valB > 0
                  ? Math.min(100, Math.max(3, (row.valB / maxAxisVal) * 100))
                  : 0;

              const fmtA =
                metricMode === 'pct'
                  ? row.valA !== null
                    ? `${row.valA.toFixed(1)}%`
                    : '—'
                  : formatMetricValue(row.obsA.val2021, row.meta.unit, true, row.obsA.status);

              const fmtB =
                metricMode === 'pct'
                  ? row.valB !== null
                    ? `${row.valB.toFixed(1)}%`
                    : '—'
                  : formatMetricValue(row.obsB.val2021, row.meta.unit, true, row.obsB.status);

              return (
                <div
                  key={row.meta.id}
                  className="rounded p-2 bg-[#F7F8FA] border border-slate-100 hover:border-slate-200 transition"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    {/* Left Value (Geo A) with Green Winner Dot */}
                    <div className="flex items-center gap-1.5 w-28">
                      <span className="font-bold text-slate-700">{fmtA}</span>
                      {row.isMaxA && (
                        <span
                          className="text-[#0F9D58] text-xs font-black"
                          title={`${geoA.cleanName} leads on this metric`}
                        >
                          ●
                        </span>
                      )}
                    </div>

                    {/* Center Label */}
                    <span className="font-semibold text-slate-800 text-center flex-1 truncate px-2">
                      {row.meta.shortName}
                    </span>

                    {/* Right Value (Geo B) with Green Winner Dot */}
                    <div className="flex items-center justify-end gap-1.5 w-28">
                      {row.isMaxB && (
                        <span
                          className="text-[#0F9D58] text-xs font-black"
                          title={`${geoB.cleanName} leads on this metric`}
                        >
                          ●
                        </span>
                      )}
                      <span className="font-extrabold text-[#0F3D6E]">{fmtB}</span>
                    </div>
                  </div>

                  {/* Diverging Butterfly Bar Track */}
                  <div className="grid grid-cols-2 gap-1 items-center">
                    {/* Left Bar (Geography A grows right-to-left) */}
                    <div className="w-full h-3.5 bg-slate-200/70 rounded-l-xs flex justify-end overflow-hidden">
                      <div
                        className="h-full bg-[#94A3B8] transition-all duration-300"
                        style={{ width: `${wA}%` }}
                      />
                    </div>
                    {/* Right Bar (Geography B grows left-to-right) */}
                    <div className="w-full h-3.5 bg-slate-200/70 rounded-r-xs flex justify-start overflow-hidden">
                      <div
                        className="h-full bg-[#0F3D6E] transition-all duration-300"
                        style={{ width: `${wB}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN (3 cols): Side-by-Side Aggregate Statistics with Green Winner Dots */}
        <div className="col-span-12 lg:col-span-3 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="pb-2.5 mb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
              Aggregate Statistics
            </h3>
            <div className="mt-1 grid grid-cols-2 text-[11px] font-bold">
              <span className="text-slate-500 truncate pr-1">A: {geoA.cleanName}</span>
              <span className="text-[#0F3D6E] truncate pl-1 text-right">B: {geoB.cleanName}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {aggCompareRows.map((item) => (
              <div
                key={item.meta.id}
                className="rounded p-2.5 bg-[#F7F8FA] border border-slate-100"
              >
                <div className="text-[11px] font-semibold text-slate-600 mb-1.5">
                  {item.meta.shortName}
                </div>
                <div className="grid grid-cols-2 gap-2 items-baseline">
                  {/* Geo A Value */}
                  <div className="flex items-center gap-1 rounded bg-white px-2 py-1 border border-slate-200/70">
                    <span className="text-xs font-bold text-slate-700 truncate">
                      {formatMetricValue(
                        item.obsA.val2021,
                        item.meta.unit,
                        true,
                        item.obsA.status
                      )}
                    </span>
                    {item.isMaxA && (
                      <span className="text-[#0F9D58] text-xs font-black ml-auto">●</span>
                    )}
                  </div>

                  {/* Geo B Value */}
                  <div className="flex items-center justify-end gap-1 rounded bg-[#0F3D6E]/5 px-2 py-1 border border-[#0F3D6E]/20">
                    {item.isMaxB && (
                      <span className="text-[#0F9D58] text-xs font-black mr-auto">●</span>
                    )}
                    <span className="text-xs font-extrabold text-[#0F3D6E] truncate">
                      {formatMetricValue(
                        item.obsB.val2021,
                        item.meta.unit,
                        true,
                        item.obsB.status
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Popup Map Modal for Geography A or B */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-4xl h-[480px] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-[#0F3D6E] text-white">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#328475]" />
                <span className="font-bold text-sm">
                  Comparison Map: A ({geoA.cleanName}) vs. B ({geoB.cleanName})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowMapModal(null)}
                className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20 cursor-pointer"
              >
                Click here to hide map ✕
              </button>
            </div>
            <div className="flex-1 p-3">
              <InteractiveAgMap
                items={[
                  {
                    geo: geoA,
                    formattedValue: `Geography A: ${geoA.name}`,
                    color: '#94A3B8',
                    radius: 10,
                    isSelected: showMapModal === 'A'
                  },
                  {
                    geo: geoB,
                    formattedValue: `Geography B: ${geoB.name}`,
                    color: '#0F3D6E',
                    radius: 10,
                    isSelected: showMapModal === 'B'
                  }
                ]}
                focusGeo={showMapModal === 'A' ? geoA : geoB}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
