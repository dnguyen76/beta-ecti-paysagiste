/**
 * catalogue-xlsx.ts
 * Types partagés pour le catalogue professionnel xlsx.
 *
 * Le parsing est effectué côté serveur (API Route /api/catalogue)
 * car ExcelJS est une bibliothèque Node.js (pas de bundle browser).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogueItem {
  id: string;
  name: string;
  price: number;
  icon: string;
  description: string;
  tags: string[];
  categorie: string;
  geomType?: 'Point' | 'LineString' | 'Polygon';  // col G — optionnel rétrocompat
  unite?: 'u' | 'ml' | 'm²' | 'm³';              // col H — optionnel rétrocompat
}

export interface CatalogueSheet {
  name: string;
  icon: string;
  items: CatalogueItem[];
}

export interface CatalogueData {
  sheets: CatalogueSheet[];
  totalItems: number;
  fileName: string;
}

// ─── Icônes par catégorie ─────────────────────────────────────────────────────

const SHEET_ICONS: Record<string, string> = {
  Vegetal:    '🌿',
  Mineral:    '🪨',
  Water:      '💧',
  Structures: '🏗',
  Bois:       '🪵',
  Reseaux:    '⚙',
  Maconnerie: '🧱',
};

export function getSheetIcon(name: string): string {
  return SHEET_ICONS[name] ?? '📦';
}

// ─── Upload vers l'API Route ──────────────────────────────────────────────────

/**
 * Envoie le fichier xlsx à l'API Route /api/catalogue qui parse
 * côté serveur avec ExcelJS et retourne le catalogue JSON.
 */
export async function uploadCatalogueXlsx(file: File): Promise<CatalogueData> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/catalogue', { method: 'POST', body: form });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<CatalogueData>;
}
