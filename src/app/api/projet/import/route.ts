/**
 * POST /api/projet/import
 * Reçoit un fichier ZIP (multipart/form-data, champ "file").
 * Extrait projet.json et retourne l'état du projet.
 */

import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import type { ProjetState } from '@/lib/projet-zip';
import { deserializeProjet } from '@/lib/projet-zip';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'Aucun fichier reçu' }, { status: 400 });
    if (!file.name.endsWith('.zip')) return NextResponse.json({ error: 'Le fichier doit être un .zip' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    // Chercher projet.json dans le ZIP
    const jsonFile = zip.file('projet.json');
    if (!jsonFile) {
      return NextResponse.json(
        { error: 'Ce ZIP ne contient pas de fichier projet.json. Assurez-vous qu\'il a été créé par ECTI Paysagiste.' },
        { status: 422 }
      );
    }

    const jsonStr = await jsonFile.async('string');
    const state: ProjetState = JSON.parse(jsonStr);

    // Désérialiser et valider
    const { nom, lignes } = deserializeProjet(state);

    return NextResponse.json({
      nom,
      lignesMetrage: lignes,
      version: state.version,
      dateCreation: state.dateCreation,
      dateSauvegarde: state.dateSauvegarde,
      nbLignes: lignes.length,
    });

  } catch (e: unknown) {
    console.error('[/api/projet/import]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur de lecture du fichier' },
      { status: 500 }
    );
  }
}
