/**
 * POST /api/catalogue
 * Reçoit un fichier .xlsx en multipart/form-data,
 * le parse avec ExcelJS (Node.js) et retourne le catalogue JSON.
 *
 * ExcelJS tourne uniquement côté serveur — c'est pourquoi on passe
 * par une API Route plutôt que d'importer ExcelJS dans le composant React.
 */

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import type { CatalogueData, CatalogueItem, CatalogueSheet } from '@/lib/catalogue-xlsx';
import { getSheetIcon } from '@/lib/catalogue-xlsx';

// Taille max fichier : 10 Mo
export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier reçu' }, { status: 400 });
    }

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json({ error: 'Format non supporté — utilisez un fichier .xlsx' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 10 Mo)' }, { status: 400 });
    }

    // Lire le contenu du fichier en ArrayBuffer
    const buffer = await file.arrayBuffer();

    // Parser avec ExcelJS
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const sheets: CatalogueSheet[] = [];

    wb.eachSheet((worksheet) => {
      const sheetName = worksheet.name;
      const allRows: (string | number)[][] = [];

      worksheet.eachRow({ includeEmpty: false }, (row) => {
        // row.values est indexé à partir de 1, on retire le premier undefined
        const vals = (row.values as (string | number | null | undefined)[])
          .slice(1)
          .map((v) => (v === null || v === undefined ? '' : v));
        allRows.push(vals as (string | number)[]);
      });

      if (allRows.length < 1) return;

      // Détecter si la ligne 0 est un header
      // Un header contient 'name', 'id', ou 'M' dans les premières colonnes
      const firstRow = allRows[0].map((v) => String(v).trim().toLowerCase());
      const hasHeader =
        firstRow.includes('name') ||
        firstRow.includes('id') ||
        firstRow[0] === 'm';

      const dataRows = hasHeader ? allRows.slice(1) : allRows;

      const items: CatalogueItem[] = [];

      for (const row of dataRows) {
        const id   = String(row[0] ?? '').trim();
        const name = String(row[1] ?? '').trim();
        const priceRaw = row[2];
        const icon = String(row[3] ?? '').trim();
        const description = String(row[4] ?? '').trim();
        const tagsRaw = String(row[5] ?? '').trim();
        const geomRaw  = String(row[6] ?? '').trim();
        const uniteRaw = String(row[7] ?? '').trim();

        if (!id || !name) continue;

        const price =
          typeof priceRaw === 'number'
            ? priceRaw
            : parseFloat(String(priceRaw ?? '0').replace(',', '.')) || 0;

        const tags = tagsRaw
          ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
          : [];

        // geomType : valider contre les valeurs autorisées
        const validGeom = ['Point', 'LineString', 'Polygon'];
        const geomType = validGeom.includes(geomRaw)
          ? (geomRaw as 'Point' | 'LineString' | 'Polygon')
          : undefined;

        // unite : valider
        const validUnite = ['u', 'ml', 'm²', 'm³'];
        const unite = validUnite.includes(uniteRaw)
          ? (uniteRaw as 'u' | 'ml' | 'm²' | 'm³')
          : undefined;

        items.push({ id, name, price, icon, description, tags, categorie: sheetName, geomType, unite });
      }

      if (items.length === 0) return;

      sheets.push({
        name: sheetName,
        icon: getSheetIcon(sheetName),
        items,
      });
    });

    if (sheets.length === 0) {
      return NextResponse.json(
        { error: 'Aucune donnée trouvée. Vérifiez la structure (colonnes : id, name, price, icon, description, tags).' },
        { status: 422 }
      );
    }

    const catalogue: CatalogueData = {
      sheets,
      totalItems: sheets.reduce((s, sh) => s + sh.items.length, 0),
      fileName: file.name,
    };

    return NextResponse.json(catalogue);

  } catch (e: unknown) {
    console.error('[/api/catalogue]', e);
    return NextResponse.json(
      { error: `Erreur de lecture : ${e instanceof Error ? e.message : 'fichier invalide'}` },
      { status: 500 }
    );
  }
}
