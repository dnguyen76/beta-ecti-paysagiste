/**
 * projet-zip.ts
 * Définit le format de sauvegarde d'un projet paysagiste.
 *
 * Le ZIP contient :
 *  - projet.json     : état complet (métrés, nom, version)
 *  - metrage.csv     : tableau des métrés par catégorie
 *  - sommets.csv     : coordonnées de tous les sommets
 *  - plan.svg        : plan d'implantation vectoriel
 *  - plan.pdf        : même plan en PDF (généré serveur)
 */

import type { LigneMetrage } from '@/lib/paysagiste';

export const PROJET_ZIP_VERSION = '1.0';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjetState {
  version: string;
  nom: string;
  dateCreation: string;
  dateSauvegarde: string;
  lignesMetrage: LigneMetrage[];
}

// ─── Sérialisation ────────────────────────────────────────────────────────────

export function serializeProjet(nom: string, lignes: LigneMetrage[]): ProjetState {
  return {
    version: PROJET_ZIP_VERSION,
    nom,
    dateCreation: new Date().toISOString(),
    dateSauvegarde: new Date().toISOString(),
    lignesMetrage: lignes,
  };
}

export function deserializeProjet(state: ProjetState): {
  nom: string;
  lignes: LigneMetrage[];
} {
  if (!state.version) throw new Error('Format de projet invalide');
  return {
    nom: state.nom ?? '',
    lignes: state.lignesMetrage ?? [],
  };
}
