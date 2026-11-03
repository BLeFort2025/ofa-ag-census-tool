export type GeoLevel =
  | 'Country'
  | 'Provinces & Territories'
  | 'Census Agricultural Regions (CAR)'
  | 'Counties / Census Divisions (CD)'
  | 'Townships / Subdivisions (CCS)';

export interface GeographyNode {
  id: string;             // Unique StatCan code e.g. "00", "35", "3510", "3540", "3540020"
  dguid: string;          // Official StatCan DGUID e.g. "2021A000011124"
  name: string;           // Display name e.g. "Huron, County (CD)"
  cleanName: string;      // Clean name e.g. "Huron"
  level: GeoLevel;
  provinceCode: string;   // "35" for Ontario, "00" for Canada, etc.
  provinceName: string;   // "Ontario", "Canada", etc.
  parentId: string | null;
  hierarchyPath: string;  // Full GeoLocator path: "Ontario > Western Ontario (CAR 2) > Huron (CD) > Ashfield-Colborne-Wawanosh (CCS)"
  lat: number;
  lon: number;
  landAreaSqKm?: number | null;
  ofaFederation?: string; // OFA County/Regional Federation name for Ontario geographies
  omafaRegion?: string;   // OMAFA Region (Southern, Western, Central, Eastern, Northern)
}

export type UnitType = 'FARMS' | 'ACRES' | 'DOLLARS' | 'HEAD' | 'PERCENT' | 'RATIO' | 'AGE' | 'SQFT' | 'TAPS' | 'COLONIES' | 'WORKERS';

export interface CharacteristicMeta {
  id: string;                 // Unique characteristic ID e.g. "naics_dairy", "crop_soybeans_acres"
  codeId: number;             // Numeric sort order (like MTM's Census Profile ID)
  name: string;               // Display name
  shortName: string;          // Compact label for charts/tables
  statcanTable: string;       // e.g. "32-10-0231-01"
  category: string;           // Top-level group (like MTM EN_Var_Groups)
  layer1: 'Characteristic Distribution' | 'Aggregate Statistics';
  layer2: string;             // Sub-topic e.g. "Farms by Industry (NAICS)", "Major Field Crops (Acres)"
  layer3: string;             // Granular group
  unit: UnitType;
  baseId: string | null;      // Reference characteristic ID for computing % (like MTM Population - Reference)
  baseDescription: string;    // Explicit denominator description for Base tooltip
  isRankerCount: boolean;     // Eligible for Ranker (Counts & Share)
  isRankerAgg: boolean;       // Eligible for Ranker (Aggregate Statistics)
  isScoreCandidate: boolean;  // Eligible for AgScore weighted index
}

export interface GeoObservation {
  val: number | null;         // 2021 empirical value (null if suppressed)
  val2016?: number | null;    // 2016 empirical value when available from StatCan historical series
  pctChange?: number | null;  // 2016-2021 % change
  status?: string | null;     // StatCan status flag: 'x' (suppressed), 'F', '..', or null
}

export interface CrosstabCell {
  geoId: string;
  dim1: string;               // Category 1 (e.g. Farm Type / NAICS)
  dim2: string;               // Category 2 (e.g. Revenue Class or Farm Area Size Class)
  dim3: string;               // Category 3 (e.g. Operating Arrangement / Tenure / Succession / Tech)
  farms: number;
  sharePct: number;           // % of total farms in geography
}

export interface HistoricalSeriesPoint {
  year: number;
  farms?: number | null;
  areaAcres?: number | null;
  croplandAcres?: number | null;
  capitalDollars?: number | null;
  revenuesDollars?: number | null;
  expensesDollars?: number | null;
  avgFarmAcres?: number | null;
  avgOperatorAge?: number | null;
}

export interface AgCensusDataset {
  generatedAt: string;
  sourceCitation: string;
  geographies: GeographyNode[];
  characteristics: CharacteristicMeta[];
  // Map of geoId -> Map of charId -> [val2021, val2016?, statusFlag?]
  values: Record<string, Record<string, Array<number | string | null>>>;
  // Historical multi-census series (1976-2021) for Country & Provinces + 2016/2021 for sub-provincial
  historical: Record<string, HistoricalSeriesPoint[]>;
  // Empirical cross-tabulation data from StatCan Ag-Population Linkage (32-10-0401-01 & 32-10-0399-01)
  empiricalCrosstabs?: Record<string, Record<string, number>>;
}

export type ActiveModule =
  | 'snapshot'
  | 'explorer'
  | 'drilldown'
  | 'compare'
  | 'ranker'
  | 'agscore'
  | 'geolocator';

export interface AgScoreSlot {
  slotIndex: number;
  characteristicId: string;
  weight: number;      // 0.0 to 1.0
  minPct: number;      // 0.0 to 100.0
  maxPct: number;      // 0.0 to 100.0
  invert?: boolean;    // If true, lower values score higher
}
