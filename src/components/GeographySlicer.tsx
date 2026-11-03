import React, { useMemo, useState } from 'react';
import { GeoLevel, GeographyNode } from '../types/census';
import { searchGeographiesSmart } from '../utils/laypersonSearch';
import { HelpCircle, MapPin, RotateCcw, Search, Sparkles, X } from 'lucide-react';

export const GEO_LEVELS: GeoLevel[] = [
  'Country',
  'Provinces & Territories',
  'Census Agricultural Regions (CAR)',
  'Counties / Census Divisions (CD)',
  'Townships / Subdivisions (CCS)'
];

export const GEO_LEVEL_DEFINITIONS: Record<GeoLevel, string> = {
  Country:
    'National aggregate across all 10 provinces and 3 territories in the Statistics Canada Census of Agriculture.',
  'Provinces & Territories':
    'The 10 provinces and territories of Canada. Enables inter-provincial benchmarking of farm structure, commodities, and economics.',
  'Census Agricultural Regions (CAR)':
    'Sub-provincial agricultural regions (72 across Canada; 5 in Ontario: Southern, Western, Central, Eastern, and Northern Ontario) composed of groups of adjacent Census Divisions.',
  'Counties / Census Divisions (CD)':
    'Counties, regional municipalities, and districts (282 agricultural CDs across Canada; 49 in Ontario aligned with OFA County & Regional Federations).',
  'Townships / Subdivisions (CCS)':
    'Census Consolidated Subdivisions (1,748 active agricultural townships/municipalities across Canada; 414 in Ontario) used for fine-grained municipal and official plan analysis.'
};

interface SingleGeoSlicerProps {
  title?: string;
  geographies: GeographyNode[];
  selectedGeo: GeographyNode;
  onSelectGeo: (geo: GeographyNode) => void;
  onOpenGeoLocator?: () => void;
  accentColor?: string;
  onShowMapModal?: () => void;
}

export const SingleGeographySlicer: React.FC<SingleGeoSlicerProps> = ({
  title = 'Geography',
  geographies,
  selectedGeo,
  onSelectGeo,
  onOpenGeoLocator,
  accentColor = '#0F3D6E',
  onShowMapModal
}) => {
  const [selectedLevel, setSelectedLevel] = useState<GeoLevel>(selectedGeo.level);
  const [provinceFilter, setProvinceFilter] = useState<string>('ALL');
  const [quickSearchQuery, setQuickSearchQuery] = useState<string>('');
  const [showDefTooltip, setShowDefTooltip] = useState<boolean>(false);

  // Sync level if selectedGeo changes externally (e.g. from GeoLocator or Map click)
  React.useEffect(() => {
    setSelectedLevel(selectedGeo.level);
  }, [selectedGeo.id, selectedGeo.level]);

  const provinces = useMemo(() => {
    return geographies
      .filter((g) => g.level === 'Provinces & Territories')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [geographies]);

  // All-level smart search results when the user types in the Quick Find box
  const globalSmartMatches = useMemo(() => {
    if (!quickSearchQuery.trim()) return [];
    return searchGeographiesSmart(geographies, quickSearchQuery, {
      provinceFilter: 'ALL',
      levelFilter: 'ALL',
      limit: 25
    });
  }, [geographies, quickSearchQuery]);

  // Level-scoped dropdown options
  const matchingGeos = useMemo(() => {
    return geographies
      .filter((g) => {
        if (g.level !== selectedLevel) return false;
        if (selectedLevel !== 'Country' && selectedLevel !== 'Provinces & Territories') {
          if (provinceFilter !== 'ALL' && g.provinceCode !== provinceFilter) return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [geographies, selectedLevel, provinceFilter]);

  const handleLevelChange = (newLevel: GeoLevel) => {
    setSelectedLevel(newLevel);
    const candidates = geographies.filter((g) => {
      if (g.level !== newLevel) return false;
      if (newLevel !== 'Country' && newLevel !== 'Provinces & Territories' && provinceFilter !== 'ALL') {
        return g.provinceCode === provinceFilter;
      }
      return true;
    });
    // Prefer Ontario or Huron County when switching levels for instant OFA relevance
    const defaultPick =
      candidates.find((c) => c.provinceCode === '35' && c.cleanName.includes('Huron')) ||
      candidates.find((c) => c.provinceCode === '35') ||
      candidates[0];
    if (defaultPick) {
      onSelectGeo(defaultPick);
    }
  };

  return (
    <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 relative">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {onOpenGeoLocator && (
            <button
              type="button"
              onClick={onOpenGeoLocator}
              className="text-[11px] font-semibold text-[#328475] underline hover:text-[#0F3D6E] cursor-pointer"
            >
              Full Area Finder
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setProvinceFilter('ALL');
              setQuickSearchQuery('');
              const ont = geographies.find((g) => g.dguid === '2021A000235');
              if (ont) onSelectGeo(ont);
            }}
            title="Reset geography selection to Ontario"
            className="text-slate-400 hover:text-[#0F3D6E] transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Layperson All-Level Quick Search Box (searches Counties, Townships, Towns & OFA Federations at once) */}
      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 text-[#328475] absolute left-2.5 top-2" />
        <input
          type="text"
          value={quickSearchQuery}
          onChange={(e) => setQuickSearchQuery(e.target.value)}
          placeholder="Type any County, Township, Town, or OFA Area..."
          className="
            w-full rounded border border-[#328475]/50 bg-[#F4FBF9] pl-8 pr-6 py-1.5
            text-[11px] font-medium text-slate-800 placeholder:text-slate-500
            focus:border-[#0F3D6E] focus:bg-white focus:outline-none
          "
        />
        {quickSearchQuery && (
          <button
            type="button"
            onClick={() => setQuickSearchQuery('')}
            className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Instant All-Level Search Dropdown */}
        {quickSearchQuery.trim() && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-64 overflow-y-auto rounded-md bg-white shadow-xl border border-slate-300 divide-y divide-slate-100">
            {globalSmartMatches.length === 0 ? (
              <div className="p-2.5 text-[11px] text-slate-500">
                No matching area found. Try a nearby town or county name.
              </div>
            ) : (
              globalSmartMatches.map(({ geo, matchReason }) => (
                <button
                  key={geo.id}
                  type="button"
                  onClick={() => {
                    onSelectGeo(geo);
                    setSelectedLevel(geo.level);
                    setQuickSearchQuery('');
                  }}
                  className="w-full text-left px-2.5 py-2 hover:bg-[#0F3D6E]/5 transition flex flex-col gap-0.5 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-[#0F3D6E]">{geo.name}</span>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                      {geo.level === 'Counties / Census Divisions (CD)'
                        ? 'County / District'
                        : geo.level === 'Townships / Subdivisions (CCS)'
                        ? 'Township'
                        : geo.level === 'Census Agricultural Regions (CAR)'
                        ? 'Ag Region'
                        : geo.level}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">{geo.hierarchyPath}</div>
                  {(matchReason || geo.ofaFederation) && (
                    <div className="text-[10px] font-semibold text-[#1D6C5E] flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{matchReason || geo.ofaFederation}</span>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Stage 1: Geographic Level Selector + 'i' definition button */}
      <div className="relative mb-1.5 flex items-center gap-1">
        <select
          value={selectedLevel}
          onChange={(e) => handleLevelChange(e.target.value as GeoLevel)}
          className="
            w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5
            text-xs font-medium text-slate-800 focus:border-[#0F3D6E] focus:outline-none
          "
        >
          {GEO_LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowDefTooltip((prev) => !prev)}
          className="
            shrink-0 rounded bg-[#4E79A7] p-1.5 text-white hover:bg-[#0F3D6E]
            transition cursor-pointer
          "
          title="Geographic Level Definition"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>

      {showDefTooltip && (
        <div className="mb-2 rounded bg-[#071D49] p-2.5 text-[11px] text-white shadow-md">
          <div className="font-bold mb-1 flex items-center justify-between">
            <span>{selectedLevel}</span>
            <button
              type="button"
              onClick={() => setShowDefTooltip(false)}
              className="text-xs text-slate-300 hover:text-white"
            >
              ✕
            </button>
          </div>
          <p className="leading-relaxed text-slate-200">{GEO_LEVEL_DEFINITIONS[selectedLevel]}</p>
        </div>
      )}

      {/* Optional Province Filter when CAR, CD, or CCS is active */}
      {selectedLevel !== 'Country' && selectedLevel !== 'Provinces & Territories' && (
        <div className="mb-1.5">
          <select
            value={provinceFilter}
            onChange={(e) => {
              const pCode = e.target.value;
              setProvinceFilter(pCode);
              const firstMatch = geographies.find(
                (g) => g.level === selectedLevel && (pCode === 'ALL' || g.provinceCode === pCode)
              );
              if (firstMatch) onSelectGeo(firstMatch);
            }}
            className="
              w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px]
              font-medium text-slate-700 focus:border-[#0F3D6E] focus:outline-none
            "
          >
            <option value="ALL">All Provinces ({matchingGeos.length})</option>
            {provinces.map((p) => (
              <option key={p.provinceCode} value={p.provinceCode}>
                {p.cleanName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stage 2: Specific Geography Dropdown */}
      <select
        value={selectedGeo.id}
        onChange={(e) => {
          const found = geographies.find((g) => g.id === e.target.value);
          if (found) onSelectGeo(found);
        }}
        className="
          w-full rounded border border-slate-300 bg-white px-2.5 py-1.5
          text-xs font-semibold text-[#0F3D6E] focus:border-[#0F3D6E] focus:outline-none
        "
      >
        {matchingGeos.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      {/* Sub-caption showing Hierarchy Path & OFA Federation Badge */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500">
        <span className="truncate max-w-full" title={selectedGeo.hierarchyPath}>
          {selectedGeo.hierarchyPath}
        </span>
        {selectedGeo.ofaFederation && (
          <span className="inline-flex items-center rounded bg-[#328475]/15 px-1.5 py-0.5 font-semibold text-[#1D6C5E]">
            OFA: {selectedGeo.ofaFederation}
          </span>
        )}
      </div>

      {onShowMapModal && (
        <button
          type="button"
          onClick={onShowMapModal}
          className="
            mt-2 w-full flex items-center justify-center gap-1.5 rounded border border-slate-200
            bg-[#F8FAFC] py-1 text-[11px] font-medium text-[#0F3D6E] hover:bg-slate-100
            transition cursor-pointer
          "
        >
          <MapPin className="w-3.5 h-3.5 text-[#328475]" />
          <span>Click here to show map & nearby regions</span>
        </button>
      )}
    </div>
  );
};

interface MultiGeoScopeSlicerProps {
  title?: string;
  geographies: GeographyNode[];
  selectedLevel: GeoLevel;
  onChangeLevel: (lvl: GeoLevel) => void;
  selectedProvince: string;
  onChangeProvince: (provCode: string) => void;
  selectedParentCarId: string;
  onChangeParentCarId: (carId: string) => void;
  onOpenGeoLocator?: () => void;
  matchingCount: number;
}

export const MultiGeographyScopeSlicer: React.FC<MultiGeoScopeSlicerProps> = ({
  title = 'Geographies',
  geographies,
  selectedLevel,
  onChangeLevel,
  selectedProvince,
  onChangeProvince,
  selectedParentCarId,
  onChangeParentCarId,
  onOpenGeoLocator,
  matchingCount
}) => {
  const [showDefTooltip, setShowDefTooltip] = useState(false);

  const provinces = useMemo(
    () =>
      geographies
        .filter((g) => g.level === 'Provinces & Territories')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [geographies]
  );

  const availableCars = useMemo(() => {
    if (selectedProvince === 'ALL') return [];
    return geographies
      .filter(
        (g) =>
          g.level === 'Census Agricultural Regions (CAR)' && g.provinceCode === selectedProvince
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [geographies, selectedProvince]);

  return (
    <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">{title}</h3>
        <div className="flex items-center gap-2">
          {onOpenGeoLocator && (
            <button
              type="button"
              onClick={onOpenGeoLocator}
              className="text-[11px] font-semibold text-[#328475] underline hover:text-[#0F3D6E] cursor-pointer"
            >
              Full Area Finder
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onChangeLevel('Counties / Census Divisions (CD)');
              onChangeProvince('35');
              onChangeParentCarId('ALL');
            }}
            title="Reset scope to Ontario Counties (CD)"
            className="text-slate-400 hover:text-[#0F3D6E] transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Geographic Level */}
      <div className="flex items-center gap-1 mb-2">
        <select
          value={selectedLevel}
          onChange={(e) => {
            onChangeLevel(e.target.value as GeoLevel);
            onChangeParentCarId('ALL');
          }}
          className="
            w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5
            text-xs font-medium text-slate-800 focus:border-[#0F3D6E] focus:outline-none
          "
        >
          {GEO_LEVELS.filter((l) => l !== 'Country').map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowDefTooltip((prev) => !prev)}
          className="shrink-0 rounded bg-[#4E79A7] p-1.5 text-white hover:bg-[#0F3D6E] transition cursor-pointer"
          title="Geographic Level Definition"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>

      {showDefTooltip && (
        <div className="mb-2 rounded bg-[#071D49] p-2.5 text-[11px] text-white shadow-md">
          <div className="font-bold mb-1 flex items-center justify-between">
            <span>{selectedLevel}</span>
            <button
              type="button"
              onClick={() => setShowDefTooltip(false)}
              className="text-xs text-slate-300 hover:text-white"
            >
              ✕
            </button>
          </div>
          <p className="leading-relaxed text-slate-200">{GEO_LEVEL_DEFINITIONS[selectedLevel]}</p>
        </div>
      )}

      {/* Province / Scope Selector */}
      <select
        value={selectedProvince}
        onChange={(e) => {
          onChangeProvince(e.target.value);
          onChangeParentCarId('ALL');
        }}
        className="
          w-full rounded border border-slate-300 bg-white px-2.5 py-1.5
          text-xs font-semibold text-[#0F3D6E] focus:border-[#0F3D6E] focus:outline-none
        "
      >
        <option value="ALL">All of Canada</option>
        {provinces.map((p) => (
          <option key={p.provinceCode} value={p.provinceCode}>
            {p.cleanName}
          </option>
        ))}
      </select>

      {/* Sub-provincial CAR / OMAFA Region filter when a province is selected and level is CD or CCS */}
      {availableCars.length > 0 &&
        (selectedLevel === 'Counties / Census Divisions (CD)' ||
          selectedLevel === 'Townships / Subdivisions (CCS)') && (
          <select
            value={selectedParentCarId}
            onChange={(e) => onChangeParentCarId(e.target.value)}
            className="
              mt-1.5 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1
              text-[11px] font-medium text-slate-700 focus:border-[#0F3D6E] focus:outline-none
            "
          >
            <option value="ALL">All Agricultural Regions in Province</option>
            {availableCars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.cleanName}
              </option>
            ))}
          </select>
        )}

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
        <span>Active scope:</span>
        <span className="font-semibold text-[#0F3D6E]">{matchingCount} geographies</span>
      </div>
    </div>
  );
};
