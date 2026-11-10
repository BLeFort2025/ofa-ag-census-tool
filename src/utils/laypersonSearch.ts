import { CharacteristicMeta, GeoLevel, GeographyNode } from '../types/census';

/**
 * Maps everyday Ontario towns, villages, communities, colloquial names, and OFA Federation
 * names to the Statistics Canada County/District (CD) or Township (CCS) names they belong to.
 */
export const ONTARIO_COMMUNITY_AND_ALIAS_INDEX: Array<{
  keywords: string[];
  targetNames: string[];
  reasonLabel: string;
}> = [
  {
    keywords: [
      'east nipissing',
      'parry sound',
      'east nipissing parry sound',
      'east nipissing-parry sound',
      'north bay',
      'powassan',
      'sundridge',
      'burks falls',
      "burk's falls",
      'south river',
      'trout creek',
      'magnetawan',
      'sprucedale',
      'callander',
      'corbeil',
      'astorville',
      'east ferris',
      'bonfield',
      'chisholm',
      'mattawa',
      'calvin',
      'papineau',
      'cameron',
      'algonquin',
      'whitestone',
      'mcdougall',
      'seguin',
      'carling',
      'mckellar',
      'machar',
      'strong',
      'joly',
      'perry',
      'armour',
      'ryerson',
      'mcmurrich',
      'monteith',
      'humphrey',
      'himsworth'
    ],
    targetNames: [
      'Nipissing',
      'Parry Sound',
      'East Ferris',
      'Bonfield',
      'Chisholm',
      'Papineau-Cameron',
      'Calvin',
      'Mattawan',
      'South Algonquin',
      'Nipissing, Unorganized',
      'Parry Sound, Unorganized',
      'Armour',
      'Perry',
      'McKellar',
      'Seguin',
      'Whitestone',
      'Magnetawan',
      'Machar',
      'Strong',
      'Ryerson',
      'McMurrich/Monteith',
      'Joly',
      'Callander',
      'Powassan'
    ],
    reasonLabel: 'East Nipissing-Parry Sound Federation of Agriculture'
  },
  {
    keywords: [
      'west nipissing',
      'sudbury east',
      'west nipissing-sudbury east',
      'sturgeon falls',
      'verner',
      'cache bay',
      'field nipissing',
      'lavigne',
      'river valley',
      'warren',
      'markstay',
      'markstay-warren',
      'st-charles',
      'st charles',
      'noelville',
      'noëlville',
      'alban',
      'monetville',
      'french river',
      'killarney',
      'sudbury',
      'chelmsford',
      'azilda',
      'blezard',
      'val caron',
      'lively',
      'massey',
      'espanola',
      'sables-spanish',
      'webbwood'
    ],
    targetNames: [
      'West Nipissing',
      'Sudbury',
      'Greater Sudbury / Grand Sudbury',
      'French River / Rivière des Français',
      'Markstay-Warren',
      'St.-Charles',
      'Sables-Spanish Rivers',
      'Sudbury, Unorganized'
    ],
    reasonLabel: 'West Nipissing-Sudbury East Federation of Agriculture'
  },
  {
    keywords: [
      'temiskaming',
      'timiskaming',
      'new liskeard',
      'haileybury',
      'cobalt',
      'temiskaming shores',
      'englehart',
      'earlton',
      'thornloe',
      'kerns',
      'harley',
      'dymond',
      'hilliard',
      'armstrong',
      'brethour',
      'casey',
      'evanturel',
      'harris',
      'hudson',
      'charlton',
      'dares',
      'kirkland lake',
      'larder lake',
      'matachewan'
    ],
    targetNames: [
      'Timiskaming',
      'Temiskaming Shores',
      'Armstrong',
      'Casey',
      'Harley',
      'Hudson',
      'Kerns',
      'Evanturel',
      'Hilliard',
      'Brethour',
      'Harris',
      'Chamberlain',
      'Charlton and Dack',
      'Timiskaming, Unorganized'
    ],
    reasonLabel: 'Temiskaming Federation of Agriculture (Timiskaming)'
  },
  {
    keywords: [
      'cochrane',
      'kapuskasing',
      'hearst',
      'timmins',
      'iroquois falls',
      'matheson',
      'black river-matheson',
      'smooth rock falls',
      'val rita',
      'moonbeam',
      'fauquier',
      'strickland',
      'mattice'
    ],
    targetNames: ['Cochrane', 'Timmins', 'Black River-Matheson', 'Iroquois Falls', 'Kapuskasing', 'Cochrane, Unorganized'],
    reasonLabel: 'Cochrane District Federation of Agriculture'
  },
  {
    keywords: [
      'algoma',
      'sault ste marie',
      'sault ste. marie',
      'bruce mines',
      'thessalon',
      'iron bridge',
      'blind river',
      'elliot lake',
      'st joseph island',
      'st. joseph',
      'echo bay',
      'desbarats',
      'richards landing',
      'hilton beach',
      'laird',
      'tarbutt',
      'macdonald',
      'meredith',
      'aberdeen',
      'plummer',
      'johnson',
      'huron shores'
    ],
    targetNames: [
      'Algoma',
      'Macdonald, Meredith and Aberdeen Additional',
      'Johnson',
      'Laird',
      'Plummer Additional',
      'St. Joseph',
      'Huron Shores',
      'Tarbutt',
      'Thessalon',
      'Algoma, Unorganized'
    ],
    reasonLabel: 'Algoma Federation of Agriculture'
  },
  {
    keywords: [
      'thunder bay',
      'slate river',
      'murillo',
      'kakabeka falls',
      'oliver paipoonge',
      'neebing',
      'conmee',
      'oconnor',
      "o'connor",
      'gillies',
      'shuniah',
      'nipigon',
      'red rock',
      'dorion',
      'upsala'
    ],
    targetNames: [
      'Thunder Bay',
      'Oliver Paipoonge',
      'Neebing',
      'Gillies',
      "O'Connor",
      'Conmee',
      'Shuniah',
      'Thunder Bay, Unorganized'
    ],
    reasonLabel: 'Thunder Bay Federation of Agriculture'
  },
  {
    keywords: [
      'rainy river',
      'fort frances',
      'emo',
      'chapple',
      'barwick',
      'alberton',
      'lavallee',
      'devlin',
      'stratton',
      'morley',
      'dawson',
      'pinewood',
      'sleeman',
      'atikokan'
    ],
    targetNames: [
      'Rainy River',
      'Chapple',
      'Emo',
      'LaVallee',
      'Morley',
      'Alberton',
      'Dawson',
      'Rainy River, Unorganized'
    ],
    reasonLabel: 'Rainy River Federation of Agriculture'
  },
  {
    keywords: [
      'kenora',
      'dryden',
      'vermilion bay',
      'oxdrift',
      'machin',
      'sioux lookout',
      'red lake',
      'ignace',
      'wainwright',
      'eton',
      'sanford'
    ],
    targetNames: ['Kenora', 'Machin', 'Dryden', 'Kenora, Unorganized'],
    reasonLabel: 'Kenora District Federation of Agriculture'
  },
  {
    keywords: [
      'manitoulin',
      'gore bay',
      'little current',
      'mindemoya',
      'manitowaning',
      'providence bay',
      'kagawong',
      'spring bay',
      'tehkummah',
      'assiginack',
      'billings',
      'burpee',
      'gordon',
      'barrie island',
      'silver water',
      'meldrum bay'
    ],
    targetNames: [
      'Manitoulin',
      'Central Manitoulin',
      'Assiginack',
      'Northeastern Manitoulin and the Islands',
      'Gordon/Barrie Island',
      'Burpee and Mills',
      'Tehkummah',
      'Billings',
      'Manitoulin, Unorganized'
    ],
    reasonLabel: 'Manitoulin Island Federation of Agriculture'
  },
  {
    keywords: [
      'goderich',
      'exeter',
      'seaforth',
      'clinton',
      'wingham',
      'blyth',
      'brussels',
      'zurich',
      'bayfield',
      'hensall',
      'dashwood',
      'kippen',
      'brucefield',
      'varn',
      'varna',
      'dungannon',
      'auburn',
      'belgrave',
      'gorrie',
      'wroxeter',
      'fordwich'
    ],
    targetNames: [
      'Huron',
      'South Huron',
      'Central Huron',
      'Huron East',
      'Bluewater',
      'North Huron',
      'Morris-Turnberry',
      'Howick',
      'Ashfield-Colborne-Wawanosh'
    ],
    reasonLabel: 'Huron County Federation of Agriculture'
  },
  {
    keywords: [
      'stratford',
      'listowel',
      'mitchell',
      'st marys',
      'st. marys',
      'milverton',
      'monkton',
      'shakespeare',
      'atwood',
      'sebringville',
      'millbank',
      'newton',
      'gowanstown',
      'fullarton',
      'logan',
      'hibbert',
      'ellice',
      'downie',
      'blanshard',
      'mornington',
      'elma',
      'wallace'
    ],
    targetNames: ['Perth', 'Perth East', 'West Perth', 'North Perth', 'Perth South'],
    reasonLabel: 'Perth County Federation of Agriculture'
  },
  {
    keywords: [
      'guelph',
      'fergus',
      'elora',
      'mount forest',
      'arthur',
      'harriston',
      'palmerston',
      'drayton',
      'moorefield',
      'erin',
      'rockwood',
      'puslinch',
      'mapleton',
      'minto',
      'centre wellington',
      'guelph/eramosa',
      'wellington north',
      'alma',
      'belwood',
      'clifford',
      'conn',
      'holstein',
      'kenilworth',
      'hillsburgh',
      'morriston',
      'aberfoil'
    ],
    targetNames: [
      'Wellington',
      'Mapleton',
      'Wellington North',
      'Centre Wellington',
      'Minto',
      'Guelph/Eramosa',
      'Erin',
      'Puslinch'
    ],
    reasonLabel: 'Wellington Federation of Agriculture'
  },
  {
    keywords: [
      'kitchener',
      'waterloo',
      'cambridge',
      'elmira',
      'st jacobs',
      'st. jacobs',
      'new hamburg',
      'baden',
      'wellesley',
      'linwood',
      'st clements',
      'st. clements',
      'heidelberg',
      'conestogo',
      'breslau',
      'maryhill',
      'ayr',
      'new dundee',
      'roseville',
      'plattsville',
      'woolwich',
      'wilmot',
      'north dumfries'
    ],
    targetNames: ['Waterloo', 'Woolwich', 'Wellesley', 'Wilmot', 'North Dumfries'],
    reasonLabel: 'Waterloo Region Federation of Agriculture'
  },
  {
    keywords: [
      'woodstock',
      'ingersoll',
      'tillsonburg',
      'tavistock',
      'norwich',
      'thamesford',
      'embo',
      'embro',
      'princeton',
      'drumbo',
      'innerkip',
      'bright',
      'hickson',
      'burgessville',
      'otterville',
      'springford',
      'sweaburg',
      'mount elgin',
      'beachville',
      'zorra',
      'east zorra-tavistock',
      'blandford-blenheim',
      'south-west oxford'
    ],
    targetNames: [
      'Oxford',
      'Norwich',
      'Zorra',
      'South-West Oxford',
      'Blandford-Blenheim',
      'East Zorra-Tavistock'
    ],
    reasonLabel: 'Oxford County Federation of Agriculture'
  },
  {
    keywords: [
      'simcoe',
      'delhi',
      'waterford',
      'port dover',
      'port rowan',
      'langton',
      'courtland',
      'st williams',
      'st. williams',
      'vittoria',
      'teeterville',
      'windham',
      'charlotteville',
      'walsingham',
      'houghton',
      'middleton',
      'woodhouse',
      'townsend',
      'norfolk',
      'caledonia',
      'dunnville',
      'cayuga',
      'hagersville',
      'jarvis',
      'selkirk',
      'fisherville',
      'nanticoke',
      'canborough',
      'rainham',
      'walpole',
      'seneca',
      'oneida',
      'haldimand'
    ],
    targetNames: ['Haldimand-Norfolk', 'Norfolk County', 'Haldimand County'],
    reasonLabel: 'Haldimand & Norfolk Federations of Agriculture'
  },
  {
    keywords: [
      'chatham',
      'chatham-kent',
      'kent',
      'wallaceburg',
      'blenheim',
      'ridgetown',
      'tilbury',
      'dresden',
      'wheatley',
      'bothwell',
      'thamesville',
      'merlin',
      'pain court',
      'grande pointe',
      'highgate',
      'morpeth',
      'erieau',
      'mitchells bay',
      'tupperville',
      'harwich',
      'raleigh',
      'howard',
      'orford',
      'camden',
      'zone township',
      'chatham township',
      'dover',
      'romney'
    ],
    targetNames: ['Chatham-Kent'],
    reasonLabel: 'Kent Federation of Agriculture (Chatham-Kent)'
  },
  {
    keywords: [
      'windsor',
      'leamington',
      'kingsville',
      'essex',
      'amherstburg',
      'lakeshore',
      'lasalle',
      'tecumseh',
      'harrow',
      'belle river',
      'comber',
      'cottam',
      'mcgregor',
      'staples',
      'stoney point',
      'woodslee',
      'pelee',
      'pelee island',
      'mersea',
      'gosfield',
      'colchester',
      'malden',
      'maidstone',
      'rochester',
      'tilbury north',
      'tilbury west'
    ],
    targetNames: ['Essex', 'Kingsville', 'Lakeshore', 'Leamington', 'Amherstburg', 'LaSalle', 'Tecumseh', 'Pelee'],
    reasonLabel: 'Essex County Federation of Agriculture'
  },
  {
    keywords: [
      'sarnia',
      'petrolia',
      'forest',
      'watford',
      'wyoming',
      'alvinston',
      'oil springs',
      'corunna',
      'brigden',
      'arkona',
      'thetford',
      'grand bend',
      'camlach',
      'camlachie',
      'inwood',
      'florence',
      'sombra',
      'courtright',
      'mooretown',
      'wilkesport',
      'plympton-wyoming',
      'brooke-alvinston',
      'st clair',
      'st. clair',
      'dawn-euphemia',
      'enniskillen',
      'warwick',
      'lambton shores',
      'bosanquet'
    ],
    targetNames: [
      'Lambton',
      'St. Clair',
      'Plympton-Wyoming',
      'Lambton Shores',
      'Dawn-Euphemia',
      'Brooke-Alvinston',
      'Warwick',
      'Enniskillen'
    ],
    reasonLabel: 'Lambton County Federation of Agriculture'
  },
  {
    keywords: [
      'st thomas',
      'st. thomas',
      'aylmer',
      'port stanley',
      'belmont',
      'dutton',
      'dutton/dunwich',
      'west lorne',
      'rodney',
      'strathfordville',
      'straffordville',
      'vienna',
      'port burwell',
      'shedden',
      'fingal',
      'iona',
      'sparta',
      'springfield',
      'malahide',
      'central elgin',
      'west elgin',
      'southwold',
      'bayham',
      'yarmouth',
      'aldborough',
      'dunwich'
    ],
    targetNames: [
      'Elgin',
      'Malahide',
      'Bayham',
      'Central Elgin',
      'Southwold',
      'Dutton/Dunwich',
      'West Elgin'
    ],
    reasonLabel: 'Elgin Federation of Agriculture'
  },
  {
    keywords: [
      'london',
      'strathroy',
      'strathroy-caradoc',
      'parkhill',
      'glencoe',
      'lucan',
      'lucan biddulph',
      'ilderton',
      'ailsa craig',
      'komoka',
      'mount brydges',
      'dorchester',
      'thorndale',
      'melbourne',
      'newbury',
      'wardeville',
      'wardsville',
      'appin',
      'kerwood',
      'nairn',
      'denfield',
      'arva',
      'bryanston',
      'granton',
      'putnam',
      'harrietsville',
      'belmont',
      'thames centre',
      'middlesex centre',
      'north middlesex',
      'southwest middlesex',
      'adelaide metcalfe'
    ],
    targetNames: [
      'Middlesex',
      'Thames Centre',
      'Middlesex Centre',
      'North Middlesex',
      'Strathroy-Caradoc',
      'Southwest Middlesex',
      'Adelaide Metcalfe',
      'Lucan Biddulph',
      'London'
    ],
    reasonLabel: 'Middlesex Federation of Agriculture'
  },
  {
    keywords: [
      'st catharines',
      'st. catharines',
      'niagara falls',
      'welland',
      'grimsby',
      'beamsville',
      'vineland',
      'jordan',
      'campden',
      'smithville',
      'st anns',
      'st. anns',
      'caistor',
      'gainsborough',
      'fenwick',
      'fonthill',
      'pelham',
      'wainfleet',
      'port colborne',
      'fort erie',
      'niagara-on-the-lake',
      'virgil',
      'st davids',
      'st. davids',
      'queenston',
      'thorold',
      'lincoln',
      'west lincoln'
    ],
    targetNames: [
      'Niagara',
      'West Lincoln',
      'Lincoln',
      'Niagara-on-the-Lake',
      'Wainfleet',
      'Pelham',
      'Grimsby',
      'St. Catharines',
      'Port Colborne',
      'Thorold',
      'Niagara Falls',
      'Fort Erie',
      'Welland'
    ],
    reasonLabel: 'Niagara Federation of Agriculture'
  },
  {
    keywords: [
      'hamilton',
      'wentworth',
      'hamilton-wentworth',
      'flamborough',
      'ancaster',
      'dundas',
      'stoney creek',
      'glanbrook',
      'binbrook',
      'waterdown',
      'rockton',
      'copetown',
      'lynden',
      'sheffield',
      'millgrove',
      'freelton',
      'carlisle',
      'strabane',
      'greensville',
      'jerseyville',
      'alberton',
      'mount hope',
      'troy',
      'winona'
    ],
    targetNames: ['Hamilton'],
    reasonLabel: 'Hamilton-Wentworth Federation of Agriculture'
  },
  {
    keywords: [
      'walkerton',
      'kincardine',
      'port elgin',
      'southampton',
      'saugeen shores',
      'paisley',
      'chesley',
      'tara',
      'allenford',
      'wiarton',
      'ripley',
      'lucknow',
      'teeswater',
      'mildmay',
      'formosa',
      'hepworth',
      'lions head',
      "lion's head",
      'tobermory',
      'tiverton',
      'underwood',
      'cargill',
      'chepstow',
      'elmwood',
      'arran-elderslie',
      'huron-kinloss',
      'brockton',
      'south bruce',
      'northern bruce peninsula',
      'south bruce peninsula'
    ],
    targetNames: [
      'Bruce',
      'Brockton',
      'Huron-Kinloss',
      'South Bruce',
      'Arran-Elderslie',
      'Kincardine',
      'Saugeen Shores',
      'South Bruce Peninsula',
      'Northern Bruce Peninsula'
    ],
    reasonLabel: 'Bruce County Federation of Agriculture'
  },
  {
    keywords: [
      'owen sound',
      'hanover',
      'meaford',
      'thornbury',
      'clarksburg',
      'blue mountains',
      'markdale',
      'flesherton',
      'dundalk',
      'durham',
      'neustadt',
      'ayton',
      'chatsworth',
      'desboro',
      'williamsford',
      'holland centre',
      'walter falls',
      "walter's falls",
      'bogner',
      'bognor',
      'feversham',
      'maxwell',
      'singhampton',
      'kimberley',
      'rocklyn',
      'shallow lake',
      'kemble',
      'annam',
      'annan',
      'grey highlands',
      'west grey',
      'southgate',
      'georgian bluffs'
    ],
    targetNames: [
      'Grey',
      'Grey Highlands',
      'West Grey',
      'Southgate',
      'Chatsworth',
      'Georgian Bluffs',
      'Meaford',
      'The Blue Mountains'
    ],
    reasonLabel: 'Grey County Federation of Agriculture'
  },
  {
    keywords: [
      'lindsay',
      'kawartha lakes',
      'victoria county',
      'fenelon falls',
      'bobcaygeon',
      'omemee',
      'woodville',
      'little britain',
      'oakwood',
      'mariposa',
      'ops',
      'emily',
      'elldon',
      'eldon',
      'fenelon',
      'verulam',
      'somerville',
      'bexley',
      'carden',
      'dalton',
      'laxton',
      'digby',
      'longford',
      'coboconk',
      'kirkfield',
      'kinmount',
      'cambray',
      'janetville',
      'pontypool',
      'duffuns',
      'manvers'
    ],
    targetNames: ['Kawartha Lakes'],
    reasonLabel: 'Victoria (Kawartha Lakes) Federation of Agriculture'
  },
  {
    keywords: [
      'cornwall',
      'alexandria',
      'winchester',
      'chesterville',
      'morrisburg',
      'iroquois',
      'ingleside',
      'long sault',
      'lancaster',
      'williamstown',
      'martintown',
      'st andrews',
      'st. andrews',
      'monkland',
      'avonmore',
      'finch',
      'crysler',
      'berwick',
      'morewood',
      'brinston',
      'williamsburg',
      'maxville',
      'dalkeith',
      'apple hill',
      'green valley',
      'glengarry',
      'stormont',
      'dundas',
      'sdg'
    ],
    targetNames: [
      'Stormont, Dundas and Glengarry',
      'North Dundas',
      'South Dundas',
      'North Glengarry',
      'South Glengarry',
      'North Stormont',
      'South Stormont'
    ],
    reasonLabel: 'Stormont, Dundas & Glengarry Federations of Agriculture'
  },
  {
    keywords: [
      'hawkesbury',
      'rockland',
      'clarence-rockland',
      'casselman',
      'embrun',
      'russell',
      'st-isidore',
      'st. isidore',
      'st isidore',
      'plantagenet',
      'alfred',
      'vankleek hill',
      'lorignal',
      "l'orignal",
      'st-eugene',
      'st-albert',
      'st. albert',
      'bourget',
      'hammond',
      'curran',
      'fournier',
      'wendover',
      'limoges',
      'the nation',
      'la nation',
      'champlain',
      'east hawkesbury',
      'prescott'
    ],
    targetNames: [
      'Prescott and Russell',
      'The Nation / La Nation',
      'Alfred and Plantagenet',
      'Champlain',
      'Clarence-Rockland',
      'Russell',
      'East Hawkesbury'
    ],
    reasonLabel: 'Prescott & Russell Federations of Agriculture'
  },
  // Official OFA Regional Zones 1 through 15 (OFA Directory Dec 2025)
  {
    keywords: ['ofa zone 1', 'zone 1', 'ofa z01', 'z01'],
    targetNames: ['Essex', 'Chatham-Kent'],
    reasonLabel: 'OFA Zone 1 — Essex & Kent'
  },
  {
    keywords: ['ofa zone 2', 'zone 2', 'ofa z02', 'z02'],
    targetNames: ['Bruce', 'Grey'],
    reasonLabel: 'OFA Zone 2 — Bruce & Grey'
  },
  {
    keywords: ['ofa zone 3', 'zone 3', 'ofa z03', 'z03'],
    targetNames: ['Brant', 'Haldimand-Norfolk', 'Haldimand County', 'Norfolk County'],
    reasonLabel: 'OFA Zone 3 — Brant, Haldimand & Norfolk'
  },
  {
    keywords: ['ofa zone 4', 'zone 4', 'ofa z04', 'z04'],
    targetNames: ['Elgin', 'Oxford'],
    reasonLabel: 'OFA Zone 4 — Elgin & Oxford'
  },
  {
    keywords: ['ofa zone 5', 'zone 5', 'ofa z05', 'z05'],
    targetNames: ['Halton', 'Hamilton', 'Niagara'],
    reasonLabel: 'OFA Zone 5 — Halton, Hamilton-Wentworth & Niagara'
  },
  {
    keywords: ['ofa zone 6', 'zone 6', 'ofa z06', 'z06'],
    targetNames: ['Lambton', 'Middlesex'],
    reasonLabel: 'OFA Zone 6 — Lambton & Middlesex'
  },
  {
    keywords: ['ofa zone 7', 'zone 7', 'ofa z07', 'z07'],
    targetNames: ['Huron', 'Perth'],
    reasonLabel: 'OFA Zone 7 — Huron & Perth'
  },
  {
    keywords: ['ofa zone 8', 'zone 8', 'ofa z08', 'z08'],
    targetNames: ['Lanark', 'Ottawa', 'Renfrew'],
    reasonLabel: 'OFA Zone 8 — Arnprior, Lanark, Ottawa & Renfrew'
  },
  {
    keywords: ['ofa zone 9', 'zone 9', 'ofa z09', 'z09'],
    targetNames: ['Dufferin', 'Waterloo', 'Wellington'],
    reasonLabel: 'OFA Zone 9 — Dufferin, Waterloo & Wellington'
  },
  {
    keywords: ['ofa zone 10', 'zone 10', 'ofa z10', 'z10'],
    targetNames: ['Durham', 'Peterborough', 'Kawartha Lakes', 'Haliburton'],
    reasonLabel: 'OFA Zone 10 — Durham, Peterborough, Kawartha Lakes & Haliburton'
  },
  {
    keywords: ['ofa zone 11', 'zone 11', 'ofa z11', 'z11'],
    targetNames: ['Frontenac', 'Leeds and Grenville', 'North Dundas', 'South Dundas', 'Stormont, Dundas and Glengarry'],
    reasonLabel: 'OFA Zone 11 — Dundas, Frontenac, Grenville & Leeds'
  },
  {
    keywords: ['ofa zone 12', 'zone 12', 'ofa z12', 'z12'],
    targetNames: ['Hastings', 'Lennox and Addington', 'Northumberland', 'Prince Edward'],
    reasonLabel: 'OFA Zone 12 — Hastings, Lennox & Addington, Northumberland & Prince Edward'
  },
  {
    keywords: ['ofa zone 13', 'zone 13', 'ofa z13', 'z13'],
    targetNames: ['Peel', 'Simcoe', 'York'],
    reasonLabel: 'OFA Zone 13 — Peel, Simcoe & York'
  },
  {
    keywords: ['ofa zone 14', 'zone 14', 'ofa z14', 'z14'],
    targetNames: [
      'Prescott and Russell',
      'Stormont, Dundas and Glengarry',
      'North Stormont',
      'South Stormont',
      'North Glengarry',
      'South Glengarry'
    ],
    reasonLabel: 'OFA Zone 14 — Glengarry, Prescott, Russell & Stormont'
  },
  {
    keywords: ['ofa zone 15', 'zone 15', 'ofa z15', 'z15'],
    targetNames: [
      'Algoma',
      'Cochrane',
      'Kenora',
      'Manitoulin',
      'Muskoka',
      'Nipissing',
      'Parry Sound',
      'Rainy River',
      'Sudbury',
      'Greater Sudbury / Grand Sudbury',
      'Timiskaming',
      'Thunder Bay'
    ],
    reasonLabel: 'OFA Zone 15 — Northern Ontario'
  }
];

/**
 * Plain-language keyword synonyms for finding agricultural metrics without needing to know
 * Statistics Canada terminology or which of the 10 categories holds the metric.
 */
export const METRIC_SYNONYMS: Record<string, string[]> = {
  total_farms: ['number of farms', 'farm count', 'how many farms', 'operations', 'total farms'],
  land_total_acres: ['total farmland', 'total acres', 'farm area', 'land area', 'acreage', 'size of county'],
  avg_farm_size_acres: ['average farm size', 'acres per farm', 'farm size', 'how big are farms'],
  land_crops_acres: ['cropland', 'crop acres', 'planted land', 'arable land', 'tillable land'],
  tenure_owned_acres: ['owned land', 'land ownership', 'farmer owned', 'land tenure'],
  tenure_rented_acres: ['rented land', 'leased land', 'land rent', 'tenant farming', 'rental acres', 'cash rent', 'rented for cash', 'land lease'],
  tenure_cropshare_acres: ['crop share', 'crop-shared land', 'sharecropping'],
  crop_corn_grain_acres: ['corn', 'grain corn', 'field corn', 'maize', 'cash crop'],
  crop_soybeans_acres: ['soybeans', 'soya', 'beans', 'soy', 'oilseeds', 'cash crop'],
  crop_wheat_total_acres: ['wheat', 'cereal', 'grain'],
  crop_winter_wheat_acres: ['winter wheat', 'fall wheat'],
  crop_canola_acres: ['canola', 'rapeseed', 'oilseeds'],
  crop_barley_acres: ['barley', 'feed grain'],
  crop_oats_acres: ['oats', 'feed grain'],
  crop_alfalfa_acres: ['alfalfa', 'hay', 'forage', 'fodder', 'feed'],
  crop_other_hay_acres: ['hay', 'tame hay', 'forage', 'fodder', 'grass hay', 'bales'],
  crop_corn_silage_acres: ['silage', 'corn silage', 'forage', 'cattle feed'],
  crop_potatoes_acres: ['potatoes', 'spuds', 'root crops', 'tubers'],
  fruit_total_acres: ['fruit', 'orchards', 'berries', 'horticulture'],
  fruit_apples_acres: ['apples', 'orchards', 'cider'],
  fruit_grapes_acres: ['grapes', 'vineyards', 'wine', 'wineries'],
  veg_total_acres: ['vegetables', 'veggies', 'market garden', 'produce', 'horticulture'],
  gh_total_sqft: ['greenhouse', 'greenhouses', 'glasshouse', 'under glass', 'indoors'],
  maple_total_taps: ['maple syrup', 'maple taps', 'sugarbush', 'sap', 'sugar shack'],
  cattle_total_head: ['cattle', 'cows', 'calves', 'beef', 'dairy', 'livestock', 'herd'],
  cattle_dairy_cows_head: ['dairy cows', 'milk cows', 'milking herd', 'dairy'],
  cattle_beef_cows_head: ['beef cows', 'cow-calf', 'beef cattle', 'ranching'],
  pigs_total_head: ['pigs', 'hogs', 'swine', 'pork', 'barns'],
  sheep_total_head: ['sheep', 'lambs', 'wool', 'ewes'],
  horses_ponies_head: ['horses', 'equine', 'ponies', 'mares', 'riding', 'stables'],
  poultry_hens_chickens_birds: ['chickens', 'poultry', 'hens', 'birds', 'broilers', 'layers', 'eggs'],
  poultry_turkeys_birds: ['turkeys', 'turkey flock', 'poultry'],
  bees_colonies: ['bees', 'honeybees', 'honey', 'hives', 'colonies', 'apiculture', 'pollinators'],
  cap_total_dollars: ['farm capital', 'net worth', 'asset value', 'total investment', 'wealth'],
  land_bldg_value_per_acre: ['land value per acre', 'farmland price', 'cost per acre', 'price of land', 'real estate value', '$/acre'],
  cap_machinery: ['machinery', 'tractors', 'combines', 'equipment value'],
  rev_total_dollars: ['gross revenue', 'farm sales', 'farm receipts', 'gross income', 'economic output', 'money'],
  rev_500k_plus: ['commercial farms', 'large farms', '500k plus', 'high revenue farms'],
  avg_rev_per_farm: ['average revenue per farm', 'sales per farm', 'income per farm'],
  exp_total_dollars: ['operating expenses', 'farm costs', 'input costs', 'bills', 'spending'],
  avg_net_income_per_farm: ['net income', 'profit', 'net cash income', 'earnings'],
  net_operating_margin_pct: ['operating margin', 'profit margin', 'return', 'profitability'],
  lab_farms_reporting: ['paid labour', 'farm workers', 'employees', 'hiring', 'jobs', 'workforce'],
  op_total_operators: ['farm operators', 'farmers', 'number of farmers', 'people'],
  op_sex_female: ['women farmers', 'female operators', 'gender', 'women in ag'],
  op_age_under_35: ['young farmers', 'under 35', 'youth', 'new entrants', 'next generation'],
  op_age_55_plus: ['older farmers', 'seniors', 'over 55', 'retirement'],
  op_avg_age: ['average age', 'farmer age', 'how old are farmers'],
  succ_written: ['succession plan', 'estate planning', 'passing on the farm', 'transition plan'],
  tech_autosteer: ['auto-steer', 'gps', 'precision ag', 'automated steering', 'guidance'],
  tech_gis: ['gis', 'mapping', 'precision ag'],
  tech_drones: ['drones', 'uav', 'aerial'],
  tech_robotic_milker: ['robotic milkers', 'milking robots', 'automation', 'dairy tech'],
  energy_solar_farms: ['solar', 'solar panels', 'renewable energy', 'green energy'],
  till_notill_acres: ['no-till', 'zero-till', 'conservation', 'soil health'],
  bmp_cover_crops_farms: ['cover crops', 'winter cover', 'soil health', 'stewardship', 'climate'],
  ds_total_farms: ['direct sales', 'farm gate', 'farmers market', 'local food', 'selling direct'],
  org_total_farms: ['organic', 'certified organic']
};

export interface SmartGeoMatch {
  geo: GeographyNode;
  score: number;
  matchReason?: string;
}

const STOP_WORDS = new Set([
  'the',
  'of',
  'in',
  'and',
  'or',
  'for',
  'to',
  'a',
  'an',
  'county',
  'district',
  'township',
  'municipality',
  'regional',
  'region',
  'federation',
  'federations',
  'agriculture',
  'agricultural',
  'ofa',
  'zone',
  'ontario',
  'canada',
  'cd',
  'ccs',
  'car'
]);

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-/.,'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSafeWordPrefix(word: string, prefix: string): boolean {
  if (prefix.length < 3 || !word.startsWith(prefix)) return false;
  if (/\d$/.test(prefix) && word.length > prefix.length && /^\d/.test(word.slice(prefix.length))) {
    return false;
  }
  return true;
}

export function searchGeographiesSmart(
  geographies: GeographyNode[],
  rawQuery: string,
  options?: {
    provinceFilter?: string;
    levelFilter?: GeoLevel | 'ALL';
    limit?: number;
  }
): SmartGeoMatch[] {
  const provinceFilter = options?.provinceFilter ?? 'ALL';
  const levelFilter = options?.levelFilter ?? 'ALL';
  const limit = options?.limit ?? 150;

  const cleanQ = normalizeText(rawQuery);

  // Filter base pool by province and level if requested
  const pool = geographies.filter((g) => {
    if (levelFilter !== 'ALL' && g.level !== levelFilter) return false;
    if (provinceFilter !== 'ALL' && g.provinceCode !== provinceFilter) return false;
    return true;
  });

  if (!cleanQ) {
    return pool.slice(0, limit).map((geo) => ({ geo, score: 1 }));
  }

  // Extract meaningful tokens (plus keep all tokens if all words were stop words like "Ontario")
  const allTokens = cleanQ.split(' ').filter((t) => t.length >= 2);
  const coreTokens = allTokens.filter((t) => !STOP_WORDS.has(t));
  const tokens = coreTokens.length > 0 ? coreTokens : allTokens;
  const paddedQ = ` ${cleanQ} `;

  // Check if the query matches any entries in ONTARIO_COMMUNITY_AND_ALIAS_INDEX
  const aliasBoostByTargetName = new Map<string, { boost: number; reason: string }>();
  for (const entry of ONTARIO_COMMUNITY_AND_ALIAS_INDEX) {
    let matchedKeyword = '';
    let matchCount = 0;
    for (const kw of entry.keywords) {
      const normKw = normalizeText(kw);
      if (!normKw) continue;
      if (
        normKw === cleanQ ||
        paddedQ.includes(` ${normKw} `) ||
        isSafeWordPrefix(normKw, cleanQ)
      ) {
        matchedKeyword = kw;
        matchCount += 2;
      } else if (coreTokens.length > 0) {
        // Check token prefix overlap on non-stopword tokens >= 3 chars
        const kwParts = normKw.split(' ').filter((kp) => !STOP_WORDS.has(kp));
        const overlap = coreTokens.filter(
          (t) =>
            t.length >= 3 &&
            kwParts.some(
              (kp) => kp === t || isSafeWordPrefix(kp, t) || (kp.length >= 4 && isSafeWordPrefix(t, kp))
            )
        );
        if (overlap.length > 0) {
          matchCount += overlap.length;
          if (!matchedKeyword) matchedKeyword = overlap.join(' ');
        }
      }
    }
    if (matchCount > 0) {
      for (const target of entry.targetNames) {
        const normTarget = normalizeText(target);
        const existing = aliasBoostByTargetName.get(normTarget);
        const boostScore = matchCount * 35;
        if (!existing || boostScore > existing.boost) {
          aliasBoostByTargetName.set(normTarget, {
            boost: boostScore,
            reason: entry.reasonLabel
          });
        }
      }
    }
  }

  const results: SmartGeoMatch[] = [];

  for (const g of pool) {
    const normName = normalizeText(g.cleanName || g.name);
    const normPath = normalizeText(g.hierarchyPath);
    const normOfa = g.ofaFederation ? normalizeText(g.ofaFederation) : '';
    const normDguid = g.dguid.toLowerCase();

    let score = 0;
    let matchReason: string | undefined;

    // 1. Exact or full substring match
    if (normName === cleanQ) {
      score += 200;
    } else if (normName.startsWith(cleanQ)) {
      score += 140;
    } else if (normName.includes(cleanQ)) {
      score += 110;
    } else if (normOfa.includes(cleanQ)) {
      score += 105;
      matchReason = `Matched OFA Federation: ${g.ofaFederation}`;
    } else if (normPath.includes(cleanQ)) {
      score += 85;
    } else if (normDguid.includes(cleanQ)) {
      score += 90;
    }

    // 2. Community / Alias Boost (e.g., "East Nipissing Parry Sound", "North Bay", "Powassan", "Listowel")
    const aliasHit = aliasBoostByTargetName.get(normName);
    if (aliasHit) {
      score += aliasHit.boost;
      if (!matchReason) {
        matchReason = aliasHit.reason;
      }
    }

    // 3. Multi-word Token Matching (so "East Nipissing Parry Sound" matches Nipissing, Parry Sound, East Ferris, etc.)
    let matchedTokens = 0;
    for (const tok of tokens) {
      if (normName === tok) {
        score += 55;
        matchedTokens++;
      } else if (normName.includes(tok)) {
        score += 40;
        matchedTokens++;
      } else if (normOfa.includes(tok)) {
        score += 28;
        matchedTokens++;
        if (!matchReason && g.ofaFederation) {
          matchReason = `Matched OFA: ${g.ofaFederation}`;
        }
      } else if (normPath.includes(tok)) {
        score += 18;
        matchedTokens++;
      }
    }

    // Bonus when multiple tokens match the same geography or its hierarchy path
    if (matchedTokens >= 2) {
      score += matchedTokens * 25;
    }

    // Slight priority boost for Counties/CDs and Provinces over small townships when scores are tied
    if (score > 0) {
      if (g.level === 'Counties / Census Divisions (CD)') score += 12;
      else if (g.level === 'Census Agricultural Regions (CAR)') score += 8;
      else if (g.level === 'Provinces & Territories') score += 10;
      if (g.provinceCode === '35') score += 5; // Prefer Ontario slightly for OFA users

      results.push({ geo: g, score, matchReason });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.geo.name.localeCompare(b.geo.name);
  });

  return results.slice(0, limit);
}

export interface SmartCharacteristicMatch {
  characteristic: CharacteristicMeta;
  score: number;
  matchedSynonym?: string;
}

export function searchCharacteristicsSmart(
  characteristics: CharacteristicMeta[],
  rawQuery: string,
  limit = 25
): SmartCharacteristicMatch[] {
  const cleanQ = normalizeText(rawQuery);
  if (!cleanQ) {
    return characteristics.slice(0, limit).map((characteristic) => ({ characteristic, score: 1 }));
  }

  const tokens = cleanQ.split(' ').filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  const activeTokens = tokens.length > 0 ? tokens : cleanQ.split(' ').filter(Boolean);

  const matches: SmartCharacteristicMatch[] = [];

  for (const c of characteristics) {
    const normName = normalizeText(c.name);
    const normShort = normalizeText(c.shortName);
    const normCat = normalizeText(c.category);
    const normDesc = normalizeText(`${c.layer2} ${c.layer3} ${c.baseDescription || ''}`);
    const synonyms = METRIC_SYNONYMS[c.id] || [];

    let score = 0;
    let matchedSynonym: string | undefined;

    if (normShort === cleanQ || normName === cleanQ) {
      score += 200;
    } else if (normShort.includes(cleanQ) || normName.includes(cleanQ)) {
      score += 120;
    } else if (normCat.includes(cleanQ)) {
      score += 60;
    } else if (normDesc.includes(cleanQ)) {
      score += 50;
    }

    const paddedQ = ` ${cleanQ} `;
    for (const syn of synonyms) {
      const normSyn = normalizeText(syn);
      const synWords = normSyn.split(' ');
      if (
        normSyn === cleanQ ||
        paddedQ.includes(` ${normSyn} `) ||
        isSafeWordPrefix(normSyn, cleanQ) ||
        synWords.some((w) => isSafeWordPrefix(w, cleanQ))
      ) {
        score += 110;
        matchedSynonym = syn;
        break;
      }
      for (const tok of activeTokens) {
        if (synWords.some((w) => w === tok || isSafeWordPrefix(w, tok))) {
          score += 35;
          if (!matchedSynonym) matchedSynonym = syn;
        }
      }
    }

    for (const tok of activeTokens) {
      if (normShort.includes(tok) || normName.includes(tok)) {
        score += 45;
      } else if (normCat.includes(tok)) {
        score += 20;
      } else if (normDesc.includes(tok)) {
        score += 15;
      }
    }

    if (score > 0) {
      // Boost primary aggregate/headline metrics slightly so totals appear before sub-brackets
      if (c.layer1 === 'Aggregate Statistics') score += 10;
      matches.push({ characteristic: c, score, matchedSynonym });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}
