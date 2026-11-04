import React, { useEffect, useMemo, useState } from 'react';
import { AgCensusDataset, CharacteristicMeta, GeographyNode } from '../../types/census';
import {
  downloadCsvFile,
  formatDelta,
  formatMetricValue,
  getObservation,
  getRawNumber
} from '../../utils/analytics';
import { SingleGeographySlicer } from '../GeographySlicer';
import { InteractiveAgMap } from '../InteractiveAgMap';
import {
  ArrowLeftRight,
  Compass,
  FileSpreadsheet,
  HelpCircle,
  Image as ImageIcon,
  MapPin,
  Printer,
  Sparkles,
  Trophy
} from 'lucide-react';

interface AgCompareModuleProps {
  dataset: AgCensusDataset;
  geoA: GeographyNode;
  geoB: GeographyNode;
  onSelectGeoA: (geo: GeographyNode) => void;
  onSelectGeoB: (geo: GeographyNode) => void;
  onOpenGeoLocator: () => void;
}

interface TraitAlignmentItem {
  meta: CharacteristicMeta;
  val1: number;
  val2: number;
  formatted1: string;
  formatted2: string;
  zDiff: number;
  rawDiff: number;
}

interface SimilarityPeerMatch {
  geo: GeographyNode;
  similarityPct: number;
  rmsZDistance: number;
  topSharedSummary: string;
  biggestDiffSummary: string;
}

interface SimilarityPairMatch {
  geoA: GeographyNode;
  geoB: GeographyNode;
  similarityPct: number;
  rmsZDistance: number;
  topSharedSummary: string;
  biggestDiffSummary: string;
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
  const [isExportingPng, setIsExportingPng] = useState<boolean>(false);

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
        currentPairSimilarityPct: null as number | null,
        currentPairSharedTraits: [] as TraitAlignmentItem[],
        currentPairDifferences: [] as TraitAlignmentItem[]
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
    const means = new Array(numF).fill(0);
    const stdDevs = new Array(numF).fill(1);
    for (let fi = 0; fi < numF; fi++) {
      let sum = 0;
      for (let ci = 0; ci < numC; ci++) sum += rawMatrix[ci][fi];
      const mean = sum / numC;
      means[fi] = mean;
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

    const fmtFeatureVal = (val: number, meta: CharacteristicMeta): string =>
      metricMode === 'pct' ? `${val.toFixed(1)}%` : formatMetricValue(val, meta.unit, true);

    const explainPairTraits = (
      idx1: number,
      idx2: number
    ): {
      shared: TraitAlignmentItem[];
      diffs: TraitAlignmentItem[];
      topSharedSummary: string;
      biggestDiffSummary: string;
    } => {
      const items: TraitAlignmentItem[] = [];
      for (let fi = 0; fi < numF; fi++) {
        const meta = featureChars[fi];
        const val1 = rawMatrix[idx1][fi];
        const val2 = rawMatrix[idx2][fi];
        const zDiff = Math.abs(zMatrix[idx1][fi] - zMatrix[idx2][fi]);
        const rawDiff = Math.abs(val1 - val2);
        items.push({
          meta,
          val1,
          val2,
          formatted1: fmtFeatureVal(val1, meta),
          formatted2: fmtFeatureVal(val2, meta),
          zDiff,
          rawDiff
        });
      }

      // Meaningful shared traits: both areas have real activity and close standardized values
      const activeTraits = items.filter((it, fi) => {
        const minThreshold = metricMode === 'pct' ? 2.0 : Math.max(1, means[fi] * 0.25);
        return Math.max(it.val1, it.val2) >= minThreshold && it.val1 > 0 && it.val2 > 0;
      });

      const sharedPool = activeTraits.length >= 2 ? activeTraits : items.filter((it) => it.val1 > 0 || it.val2 > 0);

      // Rank shared traits by high combined prominence AND low Z-difference
      const shared = [...sharedPool]
        .sort((a, b) => {
          const scoreA = (a.val1 + a.val2) / Math.pow(1 + a.zDiff * 1.6, 2);
          const scoreB = (b.val1 + b.val2) / Math.pow(1 + b.zDiff * 1.6, 2);
          return scoreB - scoreA;
        })
        .slice(0, 4);

      const diffs = [...items]
        .filter((it) => it.val1 > 0 || it.val2 > 0)
        .sort((a, b) => b.zDiff - a.zDiff)
        .slice(0, 3);

      const topSharedSummary = shared
        .slice(0, 3)
        .map((s) => `${s.meta.shortName} (${s.formatted1} vs ${s.formatted2})`)
        .join(' • ');

      const biggestDiffSummary = diffs[0]
        ? `${diffs[0].meta.shortName} (${diffs[0].formatted1} vs ${diffs[0].formatted2})`
        : 'Closely aligned across all active metrics';

      return { shared, diffs, topSharedSummary, biggestDiffSummary };
    };

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
    const rawMatchesForA: Array<{ ci: number; rms: number; pct: number }> = [];
    if (idxA !== -1) {
      for (let ci = 0; ci < numC; ci++) {
        if (ci === idxA) continue;
        const { rms, pct } = calcSimilarity(idxA, ci);
        rawMatchesForA.push({ ci, rms, pct });
      }
      rawMatchesForA.sort((a, b) => a.rms - b.rms);
    }

    const topMatchesForA: SimilarityPeerMatch[] = rawMatchesForA.slice(0, 8).map((m) => {
      const explained = explainPairTraits(idxA, m.ci);
      return {
        geo: candidates[m.ci],
        similarityPct: m.pct,
        rmsZDistance: m.rms,
        topSharedSummary: explained.topSharedSummary,
        biggestDiffSummary: explained.biggestDiffSummary
      };
    });

    // 2. Top Most Alike Pairs across the entire Scope (e.g., which 2 Ontario Counties are most alike)
    const rawPairs: Array<{ i: number; j: number; rms: number; pct: number }> = [];
    const maxPairCandidates = Math.min(numC, 320);
    for (let i = 0; i < maxPairCandidates; i++) {
      for (let j = i + 1; j < maxPairCandidates; j++) {
        const { rms, pct } = calcSimilarity(i, j);
        rawPairs.push({ i, j, rms, pct });
      }
    }
    rawPairs.sort((a, b) => a.rms - b.rms);

    const topPairsInScope: SimilarityPairMatch[] = rawPairs.slice(0, 8).map((p) => {
      const explained = explainPairTraits(p.i, p.j);
      return {
        geoA: candidates[p.i],
        geoB: candidates[p.j],
        similarityPct: p.pct,
        rmsZDistance: p.rms,
        topSharedSummary: explained.topSharedSummary,
        biggestDiffSummary: explained.biggestDiffSummary
      };
    });

    const currentPairSimilarityPct =
      idxA !== -1 && idxB !== -1 && idxA !== idxB ? calcSimilarity(idxA, idxB).pct : null;

    const currentExplained =
      idxA !== -1 && idxB !== -1 && idxA !== idxB
        ? explainPairTraits(idxA, idxB)
        : { shared: [], diffs: [], topSharedSummary: '', biggestDiffSummary: '' };

    return {
      candidates,
      topMatchesForA,
      topPairsInScope,
      currentPairSimilarityPct,
      currentPairSharedTraits: currentExplained.shared,
      currentPairDifferences: currentExplained.diffs
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

  // 1. Export Side-by-Side Comparison + Similarity Leaderboard as an Excel-ready CSV
  const handleExportCompareCsv = () => {
    const headers = [
      'Section',
      'Item / Rank',
      'Category / Scope',
      'StatCan Table / DGUID',
      'Unit',
      `${geoA.cleanName} (2021)`,
      `${geoA.cleanName} (% of Base)`,
      `${geoA.cleanName} (2016-2021 Change)`,
      `${geoB.cleanName} (2021)`,
      `${geoB.cleanName} (% of Base)`,
      `${geoB.cleanName} (2016-2021 Change)`,
      'Higher / Leader Geography',
      'Similarity / Shared Traits Notes'
    ];

    const csvRows: Array<Array<string | number>> = [];

    // Summary row for current pair similarity
    if (similarityEngine.currentPairSimilarityPct !== null) {
      const sharedText = similarityEngine.currentPairSharedTraits
        .slice(0, 3)
        .map((s) => `${s.meta.shortName} (${s.formatted1} vs ${s.formatted2})`)
        .join(' | ');
      const diffText = similarityEngine.currentPairDifferences[0]
        ? `${similarityEngine.currentPairDifferences[0].meta.shortName} (${similarityEngine.currentPairDifferences[0].formatted1} vs ${similarityEngine.currentPairDifferences[0].formatted2})`
        : '';
      csvRows.push([
        'Pair Similarity Summary',
        `${geoA.cleanName} vs. ${geoB.cleanName}`,
        simBasis === 'segment' ? `${selectedCategory} (${selectedLayer2})` : 'Full Ag Profile (All Topics)',
        `${geoA.dguid} vs ${geoB.dguid}`,
        'PERCENT',
        similarityEngine.currentPairSimilarityPct,
        `${similarityEngine.currentPairSimilarityPct}% Profile Match`,
        '',
        similarityEngine.currentPairSimilarityPct,
        `${similarityEngine.currentPairSimilarityPct}% Profile Match`,
        '',
        'Pair Match Score',
        `Top Shared Traits: ${sharedText || 'N/A'} | Biggest Difference: ${diffText || 'N/A'}`
      ]);
    }

    // Section A: Characteristic Distribution rows
    for (const r of compareRows) {
      const dA = formatDelta(r.obsA.pctChange, r.meta.unit);
      const dB = formatDelta(r.obsB.pctChange, r.meta.unit);
      const leader = r.isMaxA ? geoA.cleanName : r.isMaxB ? geoB.cleanName : 'Tie / N/A';
      const isShared = similarityEngine.currentPairSharedTraits.some((s) => s.meta.id === r.meta.id);
      const isDiff =
        similarityEngine.currentPairDifferences[0]?.meta.id === r.meta.id;

      csvRows.push([
        'Characteristic Distribution',
        r.meta.name,
        `${r.meta.category} - ${r.meta.layer2}`,
        r.meta.statcanTable,
        r.meta.unit,
        r.obsA.val2021 ?? '',
        r.obsA.pctOfBase !== null ? Number(r.obsA.pctOfBase.toFixed(1)) : '',
        r.obsA.pctChange !== null ? dA.text : '',
        r.obsB.val2021 ?? '',
        r.obsB.pctOfBase !== null ? Number(r.obsB.pctOfBase.toFixed(1)) : '',
        r.obsB.pctChange !== null ? dB.text : '',
        leader,
        isShared
          ? 'Top Shared Defining Trait'
          : isDiff
          ? 'Largest Distinguishing Difference'
          : ''
      ]);
    }

    // Section B: Aggregate Statistics rows
    for (const item of aggCompareRows) {
      const dA = formatDelta(item.obsA.pctChange, item.meta.unit);
      const dB = formatDelta(item.obsB.pctChange, item.meta.unit);
      const leader = item.isMaxA ? geoA.cleanName : item.isMaxB ? geoB.cleanName : 'Tie / N/A';
      csvRows.push([
        'Aggregate Statistics',
        item.meta.name,
        item.meta.category,
        item.meta.statcanTable,
        item.meta.unit,
        item.obsA.val2021 ?? '',
        '',
        item.obsA.pctChange !== null ? dA.text : '',
        item.obsB.val2021 ?? '',
        '',
        item.obsB.pctChange !== null ? dB.text : '',
        leader,
        ''
      ]);
    }

    // Section C: Closest Peer Matches to Geography A
    similarityEngine.topMatchesForA.forEach((m, idx) => {
      csvRows.push([
        `Closest Matches to ${geoA.cleanName}`,
        `#${idx + 1} ${m.geo.cleanName}`,
        simScope === 'province' ? `Within ${provinceNameForA}` : 'All of Canada',
        m.geo.dguid,
        'PERCENT',
        m.similarityPct,
        `${m.similarityPct}% Match`,
        '',
        '',
        '',
        '',
        m.geo.cleanName,
        `Shared Traits: ${m.topSharedSummary} | Biggest Diff: ${m.biggestDiffSummary}`
      ]);
    });

    // Section D: Most Alike Pairs in Scope
    similarityEngine.topPairsInScope.forEach((pair, idx) => {
      csvRows.push([
        `Most Alike Pairs (${simScope === 'province' ? provinceNameForA : 'All Canada'})`,
        `#${idx + 1} ${pair.geoA.cleanName} <-> ${pair.geoB.cleanName}`,
        simBasis === 'segment' ? `${selectedCategory} (${selectedLayer2})` : 'Full Ag Profile',
        `${pair.geoA.dguid} / ${pair.geoB.dguid}`,
        'PERCENT',
        pair.similarityPct,
        `${pair.similarityPct}% Match`,
        '',
        '',
        '',
        '',
        `${pair.geoA.cleanName} & ${pair.geoB.cleanName}`,
        `Shared Traits: ${pair.topSharedSummary} | Biggest Diff: ${pair.biggestDiffSummary}`
      ]);
    });

    const slugA = geoA.cleanName.replace(/[^a-z0-9]+/gi, '_');
    const slugB = geoB.cleanName.replace(/[^a-z0-9]+/gi, '_');
    downloadCsvFile(`OFA_Compare_${slugA}_vs_${slugB}.csv`, headers, csvRows);
  };

  // 2. Download High-Res Social Media / Report Visual Card (PNG — 1800x1125)
  const handleDownloadComparePng = () => {
    if (isExportingPng) return;
    setIsExportingPng(true);
    try {
      const width = 1800;
      const height = 1125;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, width, height);

      // Top OFA Navy Banner
      ctx.fillStyle = '#0F3D6E';
      ctx.fillRect(0, 0, width, 128);
      ctx.fillStyle = '#328475';
      ctx.fillRect(0, 124, width, 6);

      ctx.fillStyle = '#93C5FD';
      ctx.font = 'bold 14px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        'ONTARIO FEDERATION OF AGRICULTURE (OFA) • AGCENSUS IQ REGIONAL BENCHMARK & SIMILARITY BRIEF',
        34,
        34
      );

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 28px Inter, Segoe UI, Arial, sans-serif';
      const titleText = `COMPARE: ${geoA.cleanName.toUpperCase()} VS. ${geoB.cleanName.toUpperCase()}`;
      ctx.fillText(titleText, 34, 72);

      // Similarity Badge next to Title
      if (similarityEngine.currentPairSimilarityPct !== null) {
        const badgeText = `${similarityEngine.currentPairSimilarityPct}% PROFILE MATCH`;
        ctx.font = '800 15px Inter, Segoe UI, Arial, sans-serif';
        const bw = ctx.measureText(badgeText).width + 32;
        const bx = Math.min(width - bw - 34, 34 + ctx.measureText(titleText).width + 30);
        ctx.fillStyle = '#065F46';
        ctx.beginPath();
        ctx.roundRect(bx, 47, bw, 32, 16);
        ctx.fill();
        ctx.strokeStyle = '#34D399';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ECFDF5';
        ctx.fillText(badgeText, bx + 16, 68);
      }

      const subScope = `${selectedCategory} (${selectedLayer2}) • Mode: ${
        metricMode === 'pct' ? 'Percentages (% of Base)' : 'Farm / Unit Counts'
      } • Similarity Scope: ${simScope === 'province' ? `Within ${provinceNameForA}` : 'All of Canada'}`;
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 15px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(subScope, 34, 104);

      // LEFT/CENTER CARD: Butterfly Comparison Chart + "Why They Match" Callout Box
      const leftBox = { x: 32, y: 148, w: 1064, h: 896 };
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(leftBox.x, leftBox.y, leftBox.w, leftBox.h, 10);
      ctx.fill();
      ctx.stroke();

      // Why They Match & Key Differences Callout Box at top of Left Card
      const calloutBox = { x: leftBox.x + 20, y: leftBox.y + 18, w: leftBox.w - 40, h: 106 };
      ctx.fillStyle = '#F0FDF4';
      ctx.strokeStyle = '#BBF7D0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(calloutBox.x, calloutBox.y, calloutBox.w, calloutBox.h, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#065F46';
      ctx.font = '800 14px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `WHY ${geoA.cleanName.toUpperCase()} & ${geoB.cleanName.toUpperCase()} MATCH (${
          similarityEngine.currentPairSimilarityPct ?? '—'
        }% SIMILARITY):`,
        calloutBox.x + 16,
        calloutBox.y + 26
      );

      const sharedStr =
        similarityEngine.currentPairSharedTraits.length > 0
          ? similarityEngine.currentPairSharedTraits
              .slice(0, 3)
              .map((s) => `${s.meta.shortName} (${s.formatted1} vs. ${s.formatted2})`)
              .join('  •  ')
          : 'Select two distinct geographies to inspect shared defining traits.';
      ctx.fillStyle = '#0F172A';
      ctx.font = '700 14px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `• Shared Defining Strengths: ${sharedStr.slice(0, 108)}`,
        calloutBox.x + 16,
        calloutBox.y + 56
      );

      const diffItem = similarityEngine.currentPairDifferences[0];
      const diffStr = diffItem
        ? `${diffItem.meta.shortName} (${geoA.cleanName}: ${diffItem.formatted1} vs. ${geoB.cleanName}: ${diffItem.formatted2})`
        : 'Closely aligned across all active characteristics';
      ctx.fillStyle = '#475569';
      ctx.font = '600 13.5px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `• Biggest Distinguishing Difference: ${diffStr.slice(0, 108)}`,
        calloutBox.x + 16,
        calloutBox.y + 84
      );

      // Butterfly Chart Header
      const chartHeaderY = calloutBox.y + calloutBox.h + 32;
      ctx.fillStyle = '#0F3D6E';
      ctx.font = '800 16px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText('SIDE-BY-SIDE CHARACTERISTIC DISTRIBUTION', leftBox.x + 22, chartHeaderY);

      // Legend for A vs B on right of header
      ctx.fillStyle = '#64748B';
      ctx.fillRect(leftBox.x + leftBox.w - 380, chartHeaderY - 13, 14, 14);
      ctx.fillStyle = '#334155';
      ctx.font = '700 13.5px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `A: ${geoA.cleanName.slice(0, 18)}`,
        leftBox.x + leftBox.w - 360,
        chartHeaderY - 1
      );

      ctx.fillStyle = '#0F3D6E';
      ctx.fillRect(leftBox.x + leftBox.w - 190, chartHeaderY - 13, 14, 14);
      ctx.fillStyle = '#0F3D6E';
      ctx.fillText(
        `B: ${geoB.cleanName.slice(0, 18)}`,
        leftBox.x + leftBox.w - 170,
        chartHeaderY - 1
      );

      // Render up to 11 Butterfly Rows
      const maxButterflyRows = Math.min(11, compareRows.length);
      const rowStartY = chartHeaderY + 20;
      const rowHeight = 64;
      const centerAxisX = leftBox.x + leftBox.w / 2;
      const maxBarTrackW = 445;

      for (let i = 0; i < maxButterflyRows; i++) {
        const r = compareRows[i];
        const ry = rowStartY + i * rowHeight;

        // Alternating row card background
        ctx.fillStyle = i % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(leftBox.x + 20, ry, leftBox.w - 40, rowHeight - 8, 6);
        ctx.fill();
        ctx.stroke();

        const fmtA =
          metricMode === 'pct'
            ? r.valA !== null
              ? `${r.valA.toFixed(1)}%`
              : '—'
            : formatMetricValue(r.obsA.val2021, r.meta.unit, true, r.obsA.status);
        const fmtB =
          metricMode === 'pct'
            ? r.valB !== null
              ? `${r.valB.toFixed(1)}%`
              : '—'
            : formatMetricValue(r.obsB.val2021, r.meta.unit, true, r.obsB.status);

        // Left Value (Geo A)
        ctx.textAlign = 'left';
        ctx.fillStyle = '#334155';
        ctx.font = '800 14px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(fmtA, leftBox.x + 34, ry + 22);
        if (r.isMaxA) {
          const aw = ctx.measureText(fmtA).width;
          ctx.fillStyle = '#0F9D58';
          ctx.fillText('●', leftBox.x + 42 + aw, ry + 22);
        }

        // Center Characteristic Title
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0F172A';
        ctx.font = '700 14px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(r.meta.shortName.slice(0, 46), centerAxisX, ry + 22);

        // Right Value (Geo B)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F3D6E';
        ctx.font = '800 14px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(fmtB, leftBox.x + leftBox.w - 34, ry + 22);
        if (r.isMaxB) {
          const bw = ctx.measureText(fmtB).width;
          ctx.fillStyle = '#0F9D58';
          ctx.fillText('●', leftBox.x + leftBox.w - 42 - bw, ry + 22);
        }

        // Diverging Butterfly Bars
        const barY = ry + 32;
        const barH = 14;
        // Left track (A grows right-to-left from centerAxisX - 6)
        ctx.fillStyle = '#E2E8F0';
        ctx.fillRect(centerAxisX - 6 - maxBarTrackW, barY, maxBarTrackW, barH);
        const wA =
          r.valA !== null && r.valA > 0
            ? Math.min(maxBarTrackW, Math.max(6, (r.valA / maxAxisVal) * maxBarTrackW))
            : 0;
        if (wA > 0) {
          ctx.fillStyle = '#64748B';
          ctx.fillRect(centerAxisX - 6 - wA, barY, wA, barH);
        }

        // Right track (B grows left-to-right from centerAxisX + 6)
        ctx.fillStyle = '#E2E8F0';
        ctx.fillRect(centerAxisX + 6, barY, maxBarTrackW, barH);
        const wB =
          r.valB !== null && r.valB > 0
            ? Math.min(maxBarTrackW, Math.max(6, (r.valB / maxAxisVal) * maxBarTrackW))
            : 0;
        if (wB > 0) {
          ctx.fillStyle = '#0F3D6E';
          ctx.fillRect(centerAxisX + 6, barY, wB, barH);
        }
      }
      ctx.textAlign = 'left';

      // TOP-RIGHT CARD: Closest Agricultural Peers / Most Alike Pairs Visual Bar Chart
      const simBox = { x: 1114, y: 148, w: 654, h: 446 };
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(simBox.x, simBox.y, simBox.w, simBox.h, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0F3D6E';
      ctx.font = '800 16px Inter, Segoe UI, Arial, sans-serif';
      const simTitle =
        simMode === 'matchA'
          ? `TOP 5 CLOSEST MATCHES TO ${geoA.cleanName.toUpperCase()} (${
              simScope === 'province' ? provinceNameForA.toUpperCase() : 'CANADA'
            })`
          : `TOP 5 MOST ALIKE PAIRS IN ${
              simScope === 'province' ? provinceNameForA.toUpperCase() : 'ALL CANADA'
            }`;
      ctx.fillText(simTitle.slice(0, 56), simBox.x + 20, simBox.y + 32);

      ctx.fillStyle = '#64748B';
      ctx.font = '600 12px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        simBasis === 'segment'
          ? `Ranked by similarity across ${selectedCategory} (${selectedLayer2})`
          : 'Ranked by similarity across full Census of Agriculture profile',
        simBox.x + 20,
        simBox.y + 52
      );

      const simItems =
        simMode === 'matchA'
          ? similarityEngine.topMatchesForA.slice(0, 5).map((m, idx) => ({
              rank: idx + 1,
              label: m.geo.cleanName,
              pct: m.similarityPct,
              shared: m.topSharedSummary,
              isHighlighted: m.geo.id === geoB.id
            }))
          : similarityEngine.topPairsInScope.slice(0, 5).map((p, idx) => ({
              rank: idx + 1,
              label: `${p.geoA.cleanName} ↔ ${p.geoB.cleanName}`,
              pct: p.similarityPct,
              shared: p.topSharedSummary,
              isHighlighted:
                (p.geoA.id === geoA.id && p.geoB.id === geoB.id) ||
                (p.geoA.id === geoB.id && p.geoB.id === geoA.id)
            }));

      simItems.forEach((item, idx) => {
        const iy = simBox.y + 70 + idx * 72;
        ctx.fillStyle = item.isHighlighted ? '#EFF6FF' : '#F8FAFC';
        ctx.strokeStyle = item.isHighlighted ? '#3B82F6' : '#E2E8F0';
        ctx.lineWidth = item.isHighlighted ? 1.5 : 1;
        ctx.beginPath();
        ctx.roundRect(simBox.x + 18, iy, simBox.w - 36, 62, 6);
        ctx.fill();
        ctx.stroke();

        // Rank + Geography Name
        ctx.fillStyle = '#0F3D6E';
        ctx.font = '800 14px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(`#${item.rank}  ${item.label}`, simBox.x + 30, iy + 22);

        // Match % on right
        ctx.textAlign = 'right';
        ctx.fillStyle = '#047857';
        ctx.font = '800 14px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(`${item.pct.toFixed(1)}% Match`, simBox.x + simBox.w - 30, iy + 22);
        ctx.textAlign = 'left';

        // Similarity progress bar
        const barX = simBox.x + 30;
        const barW = simBox.w - 60;
        ctx.fillStyle = '#E2E8F0';
        ctx.fillRect(barX, iy + 29, barW, 8);
        ctx.fillStyle = item.isHighlighted ? '#0F3D6E' : '#328475';
        ctx.fillRect(barX, iy + 29, Math.max(12, (item.pct / 100) * barW), 8);

        // Shared traits caption
        ctx.fillStyle = '#475569';
        ctx.font = '600 11.5px Inter, Segoe UI, Arial, sans-serif';
        const sharedLine = item.shared ? `Shared: ${item.shared}` : '';
        ctx.fillText(sharedLine.slice(0, 78), barX, iy + 53);
      });

      // BOTTOM-RIGHT CARD: Key Aggregate Benchmarks
      const aggBox = { x: 1114, y: 612, w: 654, h: 432 };
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(aggBox.x, aggBox.y, aggBox.w, aggBox.h, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0F3D6E';
      ctx.font = '800 16px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText('KEY AGGREGATE BENCHMARKS (2021)', aggBox.x + 20, aggBox.y + 32);

      // Column headers
      ctx.fillStyle = '#64748B';
      ctx.font = '700 12.5px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText('BENCHMARK METRIC', aggBox.x + 22, aggBox.y + 58);
      ctx.textAlign = 'right';
      ctx.fillText(`A: ${geoA.cleanName.slice(0, 15)}`, aggBox.x + 455, aggBox.y + 58);
      ctx.fillStyle = '#0F3D6E';
      ctx.fillText(`B: ${geoB.cleanName.slice(0, 15)}`, aggBox.x + aggBox.w - 24, aggBox.y + 58);
      ctx.textAlign = 'left';

      const topAggs = aggCompareRows.slice(0, 8);
      topAggs.forEach((ag, idx) => {
        const ay = aggBox.y + 70 + idx * 43;
        ctx.fillStyle = idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
        ctx.fillRect(aggBox.x + 16, ay, aggBox.w - 32, 38);

        ctx.fillStyle = '#1E293B';
        ctx.font = '600 13px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(ag.meta.shortName.slice(0, 34), aggBox.x + 24, ay + 24);

        const vA = formatMetricValue(ag.obsA.val2021, ag.meta.unit, true, ag.obsA.status);
        const vB = formatMetricValue(ag.obsB.val2021, ag.meta.unit, true, ag.obsB.status);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#334155';
        ctx.font = '700 13.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(ag.isMaxA ? `● ${vA}` : vA, aggBox.x + 455, ay + 24);

        ctx.fillStyle = '#0F3D6E';
        ctx.font = '800 13.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(ag.isMaxB ? `● ${vB}` : vB, aggBox.x + aggBox.w - 24, ay + 24);
        ctx.textAlign = 'left';
      });

      // Footer Attribution
      ctx.fillStyle = '#475569';
      ctx.font = '600 13px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        'Source: Statistics Canada — Census of Agriculture (2021 & 2016) • Prepared with AgCensus IQ (Ontario Federation of Agriculture)',
        34,
        1088
      );

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const slugA = geoA.cleanName.replace(/[^a-z0-9]+/gi, '_');
      const slugB = geoB.cleanName.replace(/[^a-z0-9]+/gi, '_');
      a.href = url;
      a.download = `OFA_Compare_${slugA}_vs_${slugB}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setIsExportingPng(false);
    }
  };

  // 3. Print / Save as PDF Executive Comparison & Similarity Report
  const handlePrintComparePdf = () => {
    const w = window.open('', '_blank', 'width=1100,height=850');
    if (!w) return;

    const sharedBadgesHtml = similarityEngine.currentPairSharedTraits
      .slice(0, 4)
      .map(
        (s) =>
          `<span style="display:inline-block;background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;padding:3px 8px;border-radius:999px;font-size:10.5px;font-weight:700;margin-right:6px;margin-bottom:4px;">${s.meta.shortName}: ${s.formatted1} vs. ${s.formatted2}</span>`
      )
      .join('');

    const diffBadgesHtml = similarityEngine.currentPairDifferences
      .slice(0, 2)
      .map(
        (d) =>
          `<span style="display:inline-block;background:#FEF3C7;border:1px solid #FDE68A;color:#92400E;padding:3px 8px;border-radius:999px;font-size:10.5px;font-weight:700;margin-right:6px;margin-bottom:4px;">${d.meta.shortName}: ${d.formatted1} vs. ${d.formatted2}</span>`
      )
      .join('');

    const peerRowsHtml = (
      simMode === 'matchA'
        ? similarityEngine.topMatchesForA.slice(0, 5).map((m, idx) => ({
            rank: idx + 1,
            name: `${m.geo.cleanName} (${m.geo.provinceName || ''})`,
            pct: m.similarityPct,
            shared: m.topSharedSummary,
            diff: m.biggestDiffSummary
          }))
        : similarityEngine.topPairsInScope.slice(0, 5).map((p, idx) => ({
            rank: idx + 1,
            name: `${p.geoA.cleanName} ↔ ${p.geoB.cleanName}`,
            pct: p.similarityPct,
            shared: p.topSharedSummary,
            diff: p.biggestDiffSummary
          }))
    )
      .map(
        (item) => `
        <tr>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;font-weight:700;color:#475569;">#${item.rank}</td>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;font-weight:800;color:#0F3D6E;">${item.name}</td>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;font-weight:800;color:#047857;text-align:right;">${item.pct.toFixed(1)}%</td>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;color:#1E293B;font-size:10px;">${item.shared}</td>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;color:#64748B;font-size:10px;">${item.diff}</td>
        </tr>
      `
      )
      .join('');

    const butterflyHtml = compareRows
      .map((r) => {
        const wA =
          r.valA !== null && r.valA > 0
            ? Math.min(100, Math.max(3, (r.valA / maxAxisVal) * 100))
            : 0;
        const wB =
          r.valB !== null && r.valB > 0
            ? Math.min(100, Math.max(3, (r.valB / maxAxisVal) * 100))
            : 0;
        const fmtA =
          metricMode === 'pct'
            ? r.valA !== null
              ? `${r.valA.toFixed(1)}%`
              : '—'
            : formatMetricValue(r.obsA.val2021, r.meta.unit, true, r.obsA.status);
        const fmtB =
          metricMode === 'pct'
            ? r.valB !== null
              ? `${r.valB.toFixed(1)}%`
              : '—'
            : formatMetricValue(r.obsB.val2021, r.meta.unit, true, r.obsB.status);

        return `
        <tr>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;text-align:right;font-weight:700;color:#334155;width:110px;">
            ${r.isMaxA ? '<span style="color:#0F9D58;">●</span> ' : ''}${fmtA}
          </td>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;width:140px;">
            <div style="width:100%;height:9px;background:#E2E8F0;display:flex;justify-content:flex-end;border-radius:2px;overflow:hidden;">
              <div style="width:${wA.toFixed(1)}%;height:100%;background:#64748B;"></div>
            </div>
          </td>
          <td style="padding:5px 10px;border:1px solid #CBD5E1;text-align:center;font-weight:700;color:#0F172A;">
            ${r.meta.shortName}
          </td>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;width:140px;">
            <div style="width:100%;height:9px;background:#E2E8F0;display:flex;justify-content:flex-start;border-radius:2px;overflow:hidden;">
              <div style="width:${wB.toFixed(1)}%;height:100%;background:#0F3D6E;"></div>
            </div>
          </td>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;text-align:left;font-weight:800;color:#0F3D6E;width:110px;">
            ${fmtB}${r.isMaxB ? ' <span style="color:#0F9D58;">●</span>' : ''}
          </td>
        </tr>
      `;
      })
      .join('');

    const aggHtml = aggCompareRows
      .map((ag) => {
        const vA = formatMetricValue(ag.obsA.val2021, ag.meta.unit, false, ag.obsA.status);
        const vB = formatMetricValue(ag.obsB.val2021, ag.meta.unit, false, ag.obsB.status);
        const dA = formatDelta(ag.obsA.pctChange, ag.meta.unit);
        const dB = formatDelta(ag.obsB.pctChange, ag.meta.unit);
        return `
        <tr>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;font-weight:700;color:#1E293B;">${ag.meta.name}</td>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;text-align:right;font-weight:700;color:#334155;">
            ${ag.isMaxA ? '<span style="color:#0F9D58;">●</span> ' : ''}${vA}
          </td>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;text-align:right;color:#64748B;">${dA.text}</td>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;text-align:right;font-weight:800;color:#0F3D6E;">
            ${ag.isMaxB ? '<span style="color:#0F9D58;">●</span> ' : ''}${vB}
          </td>
          <td style="padding:5px 8px;border:1px solid #CBD5E1;text-align:right;color:#64748B;">${dB.text}</td>
        </tr>
      `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>OFA Compare Report — ${geoA.cleanName} vs. ${geoB.cleanName}</title>
          <style>
            @page { size: portrait; margin: 10mm; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0F172A;
              margin: 0;
              padding: 16px;
              background: #FFFFFF;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 14px; }
            tr, td, th { page-break-inside: avoid !important; break-inside: avoid !important; }
            h2 { font-size: 13px; color: #0F3D6E; text-transform: uppercase; margin: 12px 0 6px 0; }
            @media print {
              .no-print-bar { display: none !important; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="no-print-bar" style="background:#0F3D6E;color:#FFFFFF;padding:10px 16px;border-radius:6px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;">
            <div>
              <strong>OFA Printable Regional Comparison & Similarity Brief Ready</strong> — Choose <em>"Save as PDF"</em> or your printer.
            </div>
            <button onclick="window.print()" style="background:#328475;color:#FFFFFF;border:none;padding:8px 16px;border-radius:4px;font-weight:700;cursor:pointer;">
              🖨️ Print / Save as PDF Now
            </button>
          </div>

          <div style="border-bottom:3px solid #0F3D6E;padding-bottom:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end;">
            <div>
              <div style="font-size:10px;font-weight:800;color:#328475;letter-spacing:0.06em;text-transform:uppercase;">
                ONTARIO FEDERATION OF AGRICULTURE (OFA) • AGCENSUS IQ REGIONAL COMPARISON & SIMILARITY BRIEF
              </div>
              <h1 style="margin:3px 0;font-size:18px;font-weight:900;color:#0F3D6E;">
                COMPARE: ${geoA.name} VS. ${geoB.name}
                ${
                  similarityEngine.currentPairSimilarityPct !== null
                    ? `<span style="background:#ECFDF5;border:1px solid #34D399;color:#065F46;font-size:12px;padding:2px 10px;border-radius:999px;margin-left:8px;vertical-align:middle;">${similarityEngine.currentPairSimilarityPct}% Profile Match</span>`
                    : ''
                }
              </h1>
              <div style="font-size:10.5px;color:#475569;">
                <strong>Active Category:</strong> ${selectedCategory} (${selectedLayer2}) • <strong>Similarity Scope:</strong> ${
      simScope === 'province' ? `Within ${provinceNameForA}` : 'All of Canada'
    }
              </div>
            </div>
            <div style="text-align:right;font-size:9.5px;color:#64748B;">
              <div><strong>Source:</strong> Statistics Canada Census of Agriculture (2021 & 2016)</div>
              <div>DGUIDs: ${geoA.dguid} & ${geoB.dguid}</div>
            </div>
          </div>

          <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:6px;padding:10px 12px;margin-bottom:12px;">
            <div style="font-size:11px;font-weight:800;color:#0F3D6E;margin-bottom:5px;">
              HOW ${geoA.cleanName.toUpperCase()} & ${geoB.cleanName.toUpperCase()} ALIGN & DIFFER:
            </div>
            <div style="margin-bottom:4px;">
              <strong style="font-size:10.5px;color:#065F46;margin-right:6px;">Top Shared Strengths:</strong>
              ${sharedBadgesHtml || '<span style="font-size:10.5px;color:#64748B;">N/A</span>'}
            </div>
            <div>
              <strong style="font-size:10.5px;color:#92400E;margin-right:6px;">Key Distinguishing Differences:</strong>
              ${diffBadgesHtml || '<span style="font-size:10.5px;color:#64748B;">N/A</span>'}
            </div>
          </div>

          <h2>1. ${
            simMode === 'matchA'
              ? `Top 5 Closest Agricultural Peers to ${geoA.cleanName} (${
                  simScope === 'province' ? provinceNameForA : 'Canada'
                })`
              : `Top 5 Most Alike Pairs in ${simScope === 'province' ? provinceNameForA : 'All Canada'}`
          }</h2>
          <table>
            <thead>
              <tr style="background:#0F3D6E;color:#FFFFFF;">
                <th style="padding:6px 8px;text-align:left;width:44px;">Rank</th>
                <th style="padding:6px 8px;text-align:left;width:190px;">Geography / Pair</th>
                <th style="padding:6px 8px;text-align:right;width:75px;">Match %</th>
                <th style="padding:6px 8px;text-align:left;">Top Shared Defining Traits (Why They Match)</th>
                <th style="padding:6px 8px;text-align:left;width:210px;">Biggest Difference</th>
              </tr>
            </thead>
            <tbody>
              ${peerRowsHtml}
            </tbody>
          </table>

          <h2>2. Side-by-Side Characteristic Distribution (${selectedCategory} — ${selectedLayer2})</h2>
          <table>
            <thead>
              <tr style="background:#0F3D6E;color:#FFFFFF;">
                <th style="padding:6px 8px;text-align:right;">A: ${geoA.cleanName}</th>
                <th style="padding:6px 8px;text-align:right;">A Bar</th>
                <th style="padding:6px 10px;text-align:center;">Characteristic</th>
                <th style="padding:6px 8px;text-align:left;">B Bar</th>
                <th style="padding:6px 8px;text-align:left;">B: ${geoB.cleanName}</th>
              </tr>
            </thead>
            <tbody>
              ${butterflyHtml}
            </tbody>
          </table>

          <h2>3. Aggregate Economic & Structural Benchmarks (2021 vs. 2016)</h2>
          <table>
            <thead>
              <tr style="background:#0F3D6E;color:#FFFFFF;">
                <th style="padding:6px 8px;text-align:left;">Benchmark Metric</th>
                <th style="padding:6px 8px;text-align:right;">A: ${geoA.cleanName} (2021)</th>
                <th style="padding:6px 8px;text-align:right;">A (16–21 Δ)</th>
                <th style="padding:6px 8px;text-align:right;">B: ${geoB.cleanName} (2021)</th>
                <th style="padding:6px 8px;text-align:right;">B (16–21 Δ)</th>
              </tr>
            </thead>
            <tbody>
              ${aggHtml}
            </tbody>
          </table>

          <script>
            setTimeout(() => { window.print(); }, 350);
          </script>
        </body>
      </html>
    `;

    w.document.open();
    w.document.write(html);
    w.document.close();
  };

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

            {/* Export Buttons: Visual PNG, Print/PDF, Excel CSV */}
            <button
              type="button"
              onClick={handleDownloadComparePng}
              disabled={isExportingPng}
              className="inline-flex items-center gap-1.5 rounded border border-[#328475]/40 bg-[#EBF5F3] hover:bg-[#DDF0EC] px-2.5 py-1.5 text-xs font-bold text-[#0F3D6E] transition cursor-pointer"
              title="Download high-resolution Comparison & Similarity Chart (PNG) for social media, emails, or slides"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#328475]" />
              <span>{isExportingPng ? 'Rendering...' : 'Download Visual (PNG)'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintComparePdf}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E] transition cursor-pointer"
              title="Print or Save 1-page Executive Comparison & Similarity Report as PDF"
            >
              <Printer className="w-3.5 h-3.5 text-[#0F3D6E]" />
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              onClick={handleExportCompareCsv}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E] transition cursor-pointer"
              title="Download Comparison & Similarity Leaderboard data as an Excel-ready CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#328475]" />
              <span>CSV</span>
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
                      title={`Click to compare ${geoA.cleanName} vs. ${m.geo.name} (${m.similarityPct}% match)\nShared Strengths: ${m.topSharedSummary}\nBiggest Difference: ${m.biggestDiffSummary}`}
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
                      title={`Click to compare ${pair.geoA.name} ↔ ${pair.geoB.name} (${pair.similarityPct}% match)\nShared Strengths: ${pair.topSharedSummary}\nBiggest Difference: ${pair.biggestDiffSummary}`}
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

        {/* Why They Match & Key Difference Summary Strip */}
        {similarityEngine.currentPairSimilarityPct !== null &&
          similarityEngine.currentPairSharedTraits.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#F0FDF4] border border-emerald-200/80 px-2.5 py-1.5 text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-extrabold text-emerald-900">
                  Why {geoA.cleanName} & {geoB.cleanName} Match:
                </span>
                {similarityEngine.currentPairSharedTraits.slice(0, 3).map((s) => (
                  <span
                    key={s.meta.id}
                    className="inline-flex items-center gap-1 rounded bg-white border border-emerald-200 px-2 py-0.5 font-semibold text-slate-700"
                  >
                    <span className="font-bold text-[#0F3D6E]">{s.meta.shortName}:</span>
                    <span>
                      {s.formatted1} vs. {s.formatted2}
                    </span>
                  </span>
                ))}
              </div>

              {similarityEngine.currentPairDifferences[0] && (
                <div className="flex items-center gap-1.5 text-slate-600">
                  <span className="font-bold text-amber-800">Biggest Gap:</span>
                  <span className="rounded bg-amber-50 border border-amber-200/80 px-2 py-0.5 font-semibold text-amber-900">
                    {similarityEngine.currentPairDifferences[0].meta.shortName} (
                    {similarityEngine.currentPairDifferences[0].formatted1} vs.{' '}
                    {similarityEngine.currentPairDifferences[0].formatted2})
                  </span>
                </div>
              )}
            </div>
          )}
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
