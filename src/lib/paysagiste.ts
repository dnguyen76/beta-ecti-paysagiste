/**
 * paysagiste.ts
 * Catalogue des éléments de métré paysagiste / aménagement de jardin
 *
 * Chaque élément est associé à :
 *  - une catégorie (terrassement, revêtements, plantations, mobilier…)
 *  - un type de géométrie (point, ligne, surface)
 *  - une unité de métré (u, ml, m², m³)
 *  - une couleur de rendu sur la carte
 *
 * Le catalogue couvre les usages professionnels CCTP paysage.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type GeomType = 'Point' | 'LineString' | 'Polygon';
export type Unite = 'u' | 'ml' | 'm²' | 'm³' | 'ml²';

export interface ElementPaysagiste {
  id: string;
  categorie: string;
  nom: string;
  description: string;
  geomType: GeomType;
  unite: Unite;
  color: string;          // couleur hexadécimale pour rendu OL
  fillAlpha?: number;     // opacité du remplissage (0-1, pour polygones)
  strokeDash?: number[];  // tiret pour lignes
  icone: string;          // emoji représentatif
}

export interface LigneMetrage {
  id: string;                        // uuid
  elementId: string;                 // ref vers ElementPaysagiste
  nom: string;                       // nom affiché (peut être personnalisé)
  categorie: string;
  unite: Unite;
  quantite: number;                  // calculé automatiquement (m, m², etc.)
  quantiteManuelle?: number;         // override manuel (ex: nb d'arbres)
  label?: string;                    // note libre
  featureId?: string;                // ref vers la Feature OL sur la carte
  coords?: { lon: number; lat: number };         // centroïde WGS84 (rétrocompatibilité)
  vertices?: { lon: number; lat: number }[];     // tous les sommets WGS84 de la géométrie
  geomType: GeomType;
  color: string;
  createdAt: number;
}

export interface RecapCategorie {
  categorie: string;
  icone: string;
  color: string;
  lignes: LigneMetrage[];
  totalParUnite: Record<Unite, number>;
}

// ─── Catalogue ────────────────────────────────────────────────────────────────

export const CATALOGUE: ElementPaysagiste[] = [

  // ── Terrassements ────────────────────────────────────────────────────────────
  {
    id: 'terr-deblai',
    categorie: 'Terrassements',
    nom: 'Déblai / Décaissement',
    description: 'Fouille, décaissement, terrassement général',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#92400e',
    fillAlpha: 0.18,
    icone: '⛏',
  },
  {
    id: 'terr-remblai',
    categorie: 'Terrassements',
    nom: 'Remblai / Apport terre',
    description: 'Apport de terre végétale, remblaiement',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#b45309',
    fillAlpha: 0.18,
    icone: '🪣',
  },
  {
    id: 'terr-nivellement',
    categorie: 'Terrassements',
    nom: 'Nivellement / Planage',
    description: 'Mise à niveau, finition de surface',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#d97706',
    fillAlpha: 0.15,
    icone: '📐',
  },
  {
    id: 'terr-talus',
    categorie: 'Terrassements',
    nom: 'Talus / Butte',
    description: 'Création de relief, modelage de talus',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#a16207',
    fillAlpha: 0.2,
    icone: '⛰',
  },

  // ── Revêtements sols durs ─────────────────────────────────────────────────
  {
    id: 'rev-dalle-beton',
    categorie: 'Revêtements sols durs',
    nom: 'Dalle béton',
    description: 'Dallage béton coulé ou préfabriqué',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#6b7280',
    fillAlpha: 0.3,
    icone: '▪',
  },
  {
    id: 'rev-dalle-pierre',
    categorie: 'Revêtements sols durs',
    nom: 'Dallage pierre naturelle',
    description: 'Granit, calcaire, grès, ardoise…',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#9ca3af',
    fillAlpha: 0.3,
    icone: '🪨',
  },
  {
    id: 'rev-pave',
    categorie: 'Revêtements sols durs',
    nom: 'Pavage',
    description: 'Pavés béton, granit, bois…',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#78716c',
    fillAlpha: 0.3,
    icone: '🧱',
  },
  {
    id: 'rev-beton-desactive',
    categorie: 'Revêtements sols durs',
    nom: 'Béton désactivé',
    description: 'Béton lavé, granulats apparents',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#a8a29e',
    fillAlpha: 0.3,
    icone: '⬜',
  },
  {
    id: 'rev-resine',
    categorie: 'Revêtements sols durs',
    nom: 'Sol résine / stabilisé coloré',
    description: 'Revêtement résine poreuse, enrobé coloré',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#f97316',
    fillAlpha: 0.25,
    icone: '🟠',
  },
  {
    id: 'rev-terrasse-bois',
    categorie: 'Revêtements sols durs',
    nom: 'Terrasse bois / composite',
    description: 'Lames bois exotique, composite, IPE…',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#854d0e',
    fillAlpha: 0.3,
    icone: '🪵',
  },

  // ── Revêtements sols souples ──────────────────────────────────────────────
  {
    id: 'rev-gravillon',
    categorie: 'Revêtements sols souples',
    nom: 'Gravillons / Gravier',
    description: 'Allée gravillonnée, gravier calcaire, silex…',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#e5e7eb',
    fillAlpha: 0.5,
    icone: '⬦',
  },
  {
    id: 'rev-stabilise',
    categorie: 'Revêtements sols souples',
    nom: 'Stabilisé / Sablé',
    description: 'Sable stabilisé, allée sablée',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#fef3c7',
    fillAlpha: 0.5,
    icone: '🟡',
  },
  {
    id: 'rev-gazon-synthetique',
    categorie: 'Revêtements sols souples',
    nom: 'Gazon synthétique',
    description: 'Pelouse artificielle, terrain de jeux',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#4ade80',
    fillAlpha: 0.3,
    icone: '🟢',
  },
  {
    id: 'rev-paillis-ecorce',
    categorie: 'Revêtements sols souples',
    nom: 'Paillis / Écorce',
    description: 'Paillage écorce de pin, BRF, ardoise…',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#78350f',
    fillAlpha: 0.25,
    icone: '🍂',
  },
  {
    id: 'rev-caoutchouc',
    categorie: 'Revêtements sols souples',
    nom: 'Sol caoutchouc / sécurité',
    description: 'Aire de jeux, revêtement amortissant',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#ef4444',
    fillAlpha: 0.25,
    icone: '🔴',
  },

  // ── Espaces verts / Engazonnement ─────────────────────────────────────────
  {
    id: 'env-gazon-semis',
    categorie: 'Espaces verts',
    nom: 'Engazonnement par semis',
    description: 'Pelouse à créer par semis, préparation terrain incluse',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#22c55e',
    fillAlpha: 0.3,
    icone: '🌿',
  },
  {
    id: 'env-gazon-rouleau',
    categorie: 'Espaces verts',
    nom: 'Gazon en rouleaux (placage)',
    description: 'Pose de rouleaux de gazon préfabriqué',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#16a34a',
    fillAlpha: 0.3,
    icone: '🎋',
  },
  {
    id: 'env-prairie',
    categorie: 'Espaces verts',
    nom: 'Prairie fleurie / Jachère',
    description: 'Semis prairie naturelle, mélange fleurs sauvages',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#86efac',
    fillAlpha: 0.3,
    icone: '🌸',
  },
  {
    id: 'env-massif-vivaces',
    categorie: 'Espaces verts',
    nom: 'Massif vivaces / Graminées',
    description: 'Massif de plantes vivaces, graminées ornementales',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#a3e635',
    fillAlpha: 0.3,
    icone: '🌾',
  },
  {
    id: 'env-massif-annuelles',
    categorie: 'Espaces verts',
    nom: 'Massif annuelles / bisannuelles',
    description: 'Plates-bandes fleurs annuelles saisonnières',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#f9a8d4',
    fillAlpha: 0.3,
    icone: '🌺',
  },

  // ── Plantations arborées ──────────────────────────────────────────────────
  {
    id: 'plant-arbre-tige',
    categorie: 'Plantations arborées',
    nom: 'Arbre de haute tige',
    description: 'Arbre feuillus ou résineux, tige 1.8-2m, cir. 16-18',
    geomType: 'Point',
    unite: 'u',
    color: '#166534',
    icone: '🌳',
  },
  {
    id: 'plant-arbre-demi-tige',
    categorie: 'Plantations arborées',
    nom: 'Arbre demi-tige',
    description: 'Arbre fruitier ou ornemental demi-tige',
    geomType: 'Point',
    unite: 'u',
    color: '#15803d',
    icone: '🌲',
  },
  {
    id: 'plant-arbre-leger',
    categorie: 'Plantations arborées',
    nom: 'Arbre léger / Feathered',
    description: 'Jeune arbre branches du sol, cir. 10-12',
    geomType: 'Point',
    unite: 'u',
    color: '#4ade80',
    icone: '🌱',
  },
  {
    id: 'plant-arbre-baliveau',
    categorie: 'Plantations arborées',
    nom: 'Baliveau / Cépée',
    description: 'Baliveau ou cépée multi-tiges',
    geomType: 'Point',
    unite: 'u',
    color: '#86efac',
    icone: '🎄',
  },
  {
    id: 'plant-palmier',
    categorie: 'Plantations arborées',
    nom: 'Palmier / Cycas',
    description: 'Palmier méditerranéen, Washingtonia, Phoenix…',
    geomType: 'Point',
    unite: 'u',
    color: '#d97706',
    icone: '🌴',
  },

  // ── Arbustes & haies ──────────────────────────────────────────────────────
  {
    id: 'plant-arbuste-isole',
    categorie: 'Arbustes & haies',
    nom: 'Arbuste isolé',
    description: 'Arbuste ornemental en pot ou motte, C5 à C30',
    geomType: 'Point',
    unite: 'u',
    color: '#059669',
    icone: '🫚',
  },
  {
    id: 'plant-haie-libre',
    categorie: 'Arbustes & haies',
    nom: 'Haie libre (plants)',
    description: 'Haie campagnarde, champêtre, plants godets ou motte',
    geomType: 'LineString',
    unite: 'ml',
    color: '#065f46',
    strokeDash: undefined,
    icone: '🌿',
  },
  {
    id: 'plant-haie-persistante',
    categorie: 'Arbustes & haies',
    nom: 'Haie persistante taillée',
    description: 'Laurier, Buis, If, Photinia… haie taillée',
    geomType: 'LineString',
    unite: 'ml',
    color: '#064e3b',
    icone: '🟩',
  },
  {
    id: 'plant-massif-arbustif',
    categorie: 'Arbustes & haies',
    nom: 'Massif arbustif',
    description: 'Massif d\'arbustes mixtes, densité 3-5 pl/m²',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#34d399',
    fillAlpha: 0.25,
    icone: '🍃',
  },
  {
    id: 'plant-rosiers',
    categorie: 'Arbustes & haies',
    nom: 'Rosiers',
    description: 'Rosiers buisson, grimpants, tiges',
    geomType: 'Point',
    unite: 'u',
    color: '#f43f5e',
    icone: '🌹',
  },

  // ── Grimpantes & couvre-sol ───────────────────────────────────────────────
  {
    id: 'plant-grimpante',
    categorie: 'Grimpantes & couvre-sol',
    nom: 'Plante grimpante',
    description: 'Lierre, Wisteria, Clématite, Rosier grimpant…',
    geomType: 'LineString',
    unite: 'ml',
    color: '#7c3aed',
    strokeDash: [4, 4],
    icone: '🍀',
  },
  {
    id: 'plant-couvre-sol',
    categorie: 'Grimpantes & couvre-sol',
    nom: 'Couvre-sol',
    description: 'Ajuga, Pachysandra, Cotoneaster ras, Vinca…',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#8b5cf6',
    fillAlpha: 0.25,
    icone: '🍃',
  },
  {
    id: 'plant-bambou',
    categorie: 'Grimpantes & couvre-sol',
    nom: 'Bambou / Graminée haute',
    description: 'Phyllostachys, Fargesia, Miscanthus géant…',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#65a30d',
    fillAlpha: 0.3,
    icone: '🎍',
  },

  // ── Clôtures & limites ────────────────────────────────────────────────────
  {
    id: 'clo-cloture-panneaux',
    categorie: 'Clôtures & limites',
    nom: 'Clôture panneaux rigides',
    description: 'Grillage rigide soudé, panneaux acier…',
    geomType: 'LineString',
    unite: 'ml',
    color: '#374151',
    strokeDash: [8, 3],
    icone: '🔲',
  },
  {
    id: 'clo-cloture-bois',
    categorie: 'Clôtures & limites',
    nom: 'Clôture bois / palissade',
    description: 'Palissade bois, bardage, occultant bois',
    geomType: 'LineString',
    unite: 'ml',
    color: '#92400e',
    strokeDash: [6, 3],
    icone: '🪵',
  },
  {
    id: 'clo-mur-maconnerie',
    categorie: 'Clôtures & limites',
    nom: 'Mur maçonnerie',
    description: 'Mur parpaing, brique, pierre sèche',
    geomType: 'LineString',
    unite: 'ml',
    color: '#9ca3af',
    strokeDash: undefined,
    icone: '🧱',
  },
  {
    id: 'clo-bordure',
    categorie: 'Clôtures & limites',
    nom: 'Bordure / Caniveau',
    description: 'Bordure béton T2, granit, acier Corten…',
    geomType: 'LineString',
    unite: 'ml',
    color: '#6b7280',
    strokeDash: [3, 3],
    icone: '━',
  },
  {
    id: 'clo-portail',
    categorie: 'Clôtures & limites',
    nom: 'Portail / Portillon',
    description: 'Portail coulissant, battant, portillon accès piéton',
    geomType: 'Point',
    unite: 'u',
    color: '#1e3a5f',
    icone: '🚪',
  },

  // ── Eau / Irrigation ──────────────────────────────────────────────────────
  {
    id: 'eau-bassin',
    categorie: 'Eau & irrigation',
    nom: 'Bassin / Mare',
    description: 'Bassin ornement, mare naturelle, plan d\'eau',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#0ea5e9',
    fillAlpha: 0.35,
    icone: '💧',
  },
  {
    id: 'eau-noue',
    categorie: 'Eau & irrigation',
    nom: 'Noue / Fossé paysager',
    description: 'Noue hydraulique, fossé végétalisé, gestion EP',
    geomType: 'LineString',
    unite: 'ml',
    color: '#38bdf8',
    icone: '〰',
  },
  {
    id: 'eau-arrosage-reseau',
    categorie: 'Eau & irrigation',
    nom: 'Réseau arrosage intégré',
    description: 'Tuyaux arrosage, tranchée, réseau enterré',
    geomType: 'LineString',
    unite: 'ml',
    color: '#7dd3fc',
    strokeDash: [5, 5],
    icone: '💦',
  },
  {
    id: 'eau-asperseur',
    categorie: 'Eau & irrigation',
    nom: 'Asperseur / Tête arrosage',
    description: 'Tête pop-up, micro-asperseur, goutteur',
    geomType: 'Point',
    unite: 'u',
    color: '#0369a1',
    icone: '⛲',
  },
  {
    id: 'eau-fontaine',
    categorie: 'Eau & irrigation',
    nom: 'Fontaine / Point d\'eau',
    description: 'Fontaine ornementale, point eau potable',
    geomType: 'Point',
    unite: 'u',
    color: '#0284c7',
    icone: '⛲',
  },

  // ── Éclairage ─────────────────────────────────────────────────────────────
  {
    id: 'ecl-reseau-cable',
    categorie: 'Éclairage',
    nom: 'Câble électrique / réseau',
    description: 'Tranchée câble alimentation éclairage',
    geomType: 'LineString',
    unite: 'ml',
    color: '#fbbf24',
    strokeDash: [4, 4],
    icone: '⚡',
  },
  {
    id: 'ecl-lampadaire',
    categorie: 'Éclairage',
    nom: 'Candélabre / Lampadaire',
    description: 'Mât éclairage voirie, parc',
    geomType: 'Point',
    unite: 'u',
    color: '#f59e0b',
    icone: '💡',
  },
  {
    id: 'ecl-borne',
    categorie: 'Éclairage',
    nom: 'Borne lumineuse / Balisage',
    description: 'Borne LED, balise sol, luminaire encastré',
    geomType: 'Point',
    unite: 'u',
    color: '#fcd34d',
    icone: '🔆',
  },
  {
    id: 'ecl-spot-vegetal',
    categorie: 'Éclairage',
    nom: 'Spot végétal / projecteur',
    description: 'Spot d\'accentuation arbres, massifs',
    geomType: 'Point',
    unite: 'u',
    color: '#fef08a',
    icone: '🔦',
  },

  // ── Mobilier & structures ─────────────────────────────────────────────────
  {
    id: 'mob-banc',
    categorie: 'Mobilier & structures',
    nom: 'Banc / Assise',
    description: 'Banc béton, bois, métal, assise muret',
    geomType: 'Point',
    unite: 'u',
    color: '#a78bfa',
    icone: '🪑',
  },
  {
    id: 'mob-table-pique-nique',
    categorie: 'Mobilier & structures',
    nom: 'Table pique-nique / Salon jardin',
    description: 'Table + bancs intégrés, mobilier extérieur',
    geomType: 'Point',
    unite: 'u',
    color: '#8b5cf6',
    icone: '🛖',
  },
  {
    id: 'mob-pergola',
    categorie: 'Mobilier & structures',
    nom: 'Pergola / Tonnelle',
    description: 'Pergola bois, alu, acier, bioclimatique',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#7c3aed',
    fillAlpha: 0.2,
    icone: '⛺',
  },
  {
    id: 'mob-abri-jardin',
    categorie: 'Mobilier & structures',
    nom: 'Abri de jardin / Local',
    description: 'Abri bois, métal, béton, local technique',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#6d28d9',
    fillAlpha: 0.25,
    icone: '🏠',
  },
  {
    id: 'mob-bac-plante',
    categorie: 'Mobilier & structures',
    nom: 'Bac à plantes / Jardinière',
    description: 'Jardinière béton, acier Corten, bois',
    geomType: 'Point',
    unite: 'u',
    color: '#c4b5fd',
    icone: '🪴',
  },
  {
    id: 'mob-aire-jeux',
    categorie: 'Mobilier & structures',
    nom: 'Aire de jeux',
    description: 'Espace jeux enfants (périmètre sécurité inclus)',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#f472b6',
    fillAlpha: 0.2,
    icone: '🛝',
  },
  {
    id: 'mob-potager',
    categorie: 'Mobilier & structures',
    nom: 'Potager / Carrés de culture',
    description: 'Carré potager surélevé, serre jardin',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#84cc16',
    fillAlpha: 0.25,
    icone: '🥕',
  },

  // ── Voirie & circulations ─────────────────────────────────────────────────
  {
    id: 'voi-allee-principale',
    categorie: 'Voirie & circulations',
    nom: 'Allée principale',
    description: 'Cheminement principal, largeur > 1.5 m',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#d4d4d8',
    fillAlpha: 0.4,
    icone: '🛤',
  },
  {
    id: 'voi-sentier',
    categorie: 'Voirie & circulations',
    nom: 'Sentier / Chemin secondaire',
    description: 'Petit cheminement, pas japonais, chemin piéton',
    geomType: 'LineString',
    unite: 'ml',
    color: '#a1a1aa',
    icone: '🚶',
  },
  {
    id: 'voi-marche-escalier',
    categorie: 'Voirie & circulations',
    nom: 'Marches / Escalier extérieur',
    description: 'Escalier béton, pierre, bois, rampe PMR',
    geomType: 'LineString',
    unite: 'ml',
    color: '#52525b',
    icone: '🪜',
  },
  {
    id: 'voi-parking',
    categorie: 'Voirie & circulations',
    nom: 'Parking / Stationnement',
    description: 'Aire de stationnement, place de parking',
    geomType: 'Polygon',
    unite: 'm²',
    color: '#71717a',
    fillAlpha: 0.3,
    icone: '🅿',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retourne la liste des catégories uniques dans l'ordre du catalogue */
export function getCategories(): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const el of CATALOGUE) {
    if (!seen.has(el.categorie)) {
      seen.add(el.categorie);
      result.push(el.categorie);
    }
  }
  return result;
}

/** Icone représentative d'une catégorie (premier élément trouvé) */
export function getCategorieIcone(categorie: string): string {
  const icons: Record<string, string> = {
    'Terrassements': '⛏',
    'Revêtements sols durs': '🪨',
    'Revêtements sols souples': '⬦',
    'Espaces verts': '🌿',
    'Plantations arborées': '🌳',
    'Arbustes & haies': '🌿',
    'Grimpantes & couvre-sol': '🍀',
    'Clôtures & limites': '🔲',
    'Eau & irrigation': '💧',
    'Éclairage': '💡',
    'Mobilier & structures': '🪑',
    'Voirie & circulations': '🛤',
  };
  return icons[categorie] ?? '📐';
}

/** Couleur représentative d'une catégorie */
export function getCategorieColor(categorie: string): string {
  return CATALOGUE.find((e) => e.categorie === categorie)?.color ?? '#6b7280';
}

/** Formate une quantité avec son unité */
export function formatQuantite(quantite: number, unite: Unite): string {
  if (unite === 'u') return `${Math.ceil(quantite)} u`;
  if (unite === 'ml') return `${quantite.toFixed(2)} ml`;
  if (unite === 'm²') return `${quantite.toFixed(2)} m²`;
  if (unite === 'm³') return `${quantite.toFixed(3)} m³`;
  return `${quantite.toFixed(2)} ${unite}`;
}

/** Génère un identifiant unique */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Regroupe les lignes de métré par catégorie avec totaux */
export function recapParCategorie(lignes: LigneMetrage[]): RecapCategorie[] {
  const map = new Map<string, LigneMetrage[]>();
  for (const ligne of lignes) {
    if (!map.has(ligne.categorie)) map.set(ligne.categorie, []);
    map.get(ligne.categorie)!.push(ligne);
  }

  return Array.from(map.entries()).map(([cat, ls]) => {
    const totalParUnite: Record<Unite, number> = { u: 0, ml: 0, 'm²': 0, 'm³': 0, 'ml²': 0 };
    for (const l of ls) {
      const q = l.quantiteManuelle ?? l.quantite;
      totalParUnite[l.unite] = (totalParUnite[l.unite] ?? 0) + q;
    }
    return {
      categorie: cat,
      icone: getCategorieIcone(cat),
      color: getCategorieColor(cat),
      lignes: ls,
      totalParUnite,
    };
  });
}

/** Export CSV des métrés */
export function exportCSV(lignes: LigneMetrage[]): string {
  const header = 'Catégorie;Élément;Quantité;Unité;Note';
  const rows = lignes.map((l) => {
    const q = (l.quantiteManuelle ?? l.quantite).toFixed(3);
    return [l.categorie, `"${l.nom}"`, q, l.unite, `"${l.label ?? ''}"`].join(';');
  });
  return [header, ...rows].join('\n');
}

// ─── Coordonnées d'implantation ───────────────────────────────────────────────

export interface CoordImplantation {
  lon: number;          // WGS84
  lat: number;          // WGS84
  label: string;        // nom de l'élément
  figureIdx: number;    // index de la figure (0-based)
  vertexIdx: number;    // index du sommet dans la figure (0-based)
  geomType: GeomType;   // type de géométrie
}

/**
 * Calcule les coordonnées relatives en mètres par rapport à l'origine
 * (point le plus Nord-Ouest = lat max, lon min de l'ensemble).
 * Utilise une projection locale plane (approximation valable < 10 km).
 *
 *  X (Est)  = (lon - lonMin) * cos(latMoy) * 111319.49
 *  Y (Nord) = (lat - latMax) * 111319.49      → valeur négative = vers le Sud
 *
 * Pour l'affichage plan : Y est inversé (axe SVG vers le bas = Sud)
 */
export interface PointRelatif {
  figureIdx: number;    // index de la figure
  vertexIdx: number;    // index du sommet dans sa figure
  nom: string;          // nom de la figure
  geomType: GeomType;
  lon: number;
  lat: number;
  xM: number;           // mètres Est depuis l'origine SW (lon_min, lat_min)
  yM: number;           // mètres Nord depuis l'origine SW (positif = vers le Nord)
}

export function coordsRelatives(points: CoordImplantation[]): PointRelatif[] {
  if (points.length === 0) return [];

  const lonMin = Math.min(...points.map((p) => p.lon));
  const latMin = Math.min(...points.map((p) => p.lat));   // origine SW
  const latMoy = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const cosLat = Math.cos((latMoy * Math.PI) / 180);
  const M_PER_DEG = 111319.49;

  return points.map((p) => ({
    figureIdx: p.figureIdx,
    vertexIdx: p.vertexIdx,
    nom: p.label,
    geomType: p.geomType,
    lon: p.lon,
    lat: p.lat,
    xM: (p.lon - lonMin) * cosLat * M_PER_DEG,   // Est depuis SW
    yM: (p.lat - latMin) * M_PER_DEG,             // Nord depuis SW (positif vers le haut)
  }));
}

/**
 * Export CSV des coordonnées d'implantation
 */
export function exportCoordsCSV(
  points: CoordImplantation[],
  projetNom: string,
): string {
  const rel = coordsRelatives(points);
  const header = 'Figure;Sommet;Élément;Type;Longitude WGS84;Latitude WGS84;X (m Est depuis SW);Y (m Nord depuis SW)';
  const rows = rel.map((r) =>
    [
      r.figureIdx + 1,
      r.vertexIdx + 1,
      `"${r.nom}"`,
      r.geomType,
      r.lon.toFixed(6),
      r.lat.toFixed(6),
      r.xM.toFixed(3),
      r.yM.toFixed(3),
    ].join(';')
  );
  return [`Projet;${projetNom}`, `Origine;point le plus Sud-Ouest (lon_min lat_min) — X=Est Y=Nord`, '', header, ...rows].join('\n');
}
