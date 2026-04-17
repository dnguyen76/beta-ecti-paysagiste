/**
 * POST /api/projet/export
 * Corps JSON : { nom, lignesMetrage, svgContent, csvMetrage, csvSommets }
 * Retourne un fichier .zip contenant :
 *   projet.json  — état complet rechargeable
 *   metrage.csv  — métrés par catégorie
 *   sommets.csv  — coordonnées de tous les sommets
 *   plan.svg     — plan vectoriel
 *   plan.pdf     — plan + tableau sommets en PDF A4 paysage
 */

import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { ProjetState } from '@/lib/projet-zip';
import { serializeProjet } from '@/lib/projet-zip';
import type { LigneMetrage } from '@/lib/paysagiste';
import {
  recapParCategorie,
  coordsRelatives,
  type CoordImplantation,
} from '@/lib/paysagiste';

function niceStepPDF(raw: number): number {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

interface ExportBody {
  nom: string;
  lignesMetrage: LigneMetrage[];
  svgContent: string;
  csvMetrage: string;
  csvSommets: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: ExportBody = await req.json();
    const { nom, lignesMetrage, svgContent, csvMetrage, csvSommets } = body;

    const zip = new JSZip();

    // ── 1. projet.json ──────────────────────────────────────────────────────
    const state: ProjetState = serializeProjet(nom, lignesMetrage);
    zip.file('projet.json', JSON.stringify(state, null, 2));

    // ── 2 & 3. CSV ──────────────────────────────────────────────────────────
    zip.file('metrage.csv',  '\uFEFF' + csvMetrage);
    zip.file('sommets.csv', '\uFEFF' + csvSommets);

    // ── 4. plan.dxf ─────────────────────────────────────────────────────────
    // Généré depuis les coordonnées relatives SW — format DXF R12 ASCII
    // Compatible AutoCAD, QGIS, LibreCAD, BricsCAD
    {
      const withVDxf = lignesMetrage.filter((l) => l.vertices && l.vertices.length > 0);
      const allDxfPts: CoordImplantation[] = [];
      withVDxf.forEach((l, fi) =>
        (l.vertices ?? []).forEach((v, vi) =>
          allDxfPts.push({ lon: v.lon, lat: v.lat, label: l.nom, figureIdx: fi, vertexIdx: vi, geomType: l.geomType })
        )
      );
      const relDxf = coordsRelatives(allDxfPts);
      const figDxf = new Map<number, typeof relDxf>();
      relDxf.forEach((p) => {
        if (!figDxf.has(p.figureIdx)) figDxf.set(p.figureIdx, []);
        figDxf.get(p.figureIdx)!.push(p);
      });

      // ── Générateur DXF R12 ASCII ──────────────────────────────────────────
      const dxfLines: string[] = [];

      const dxf = (...parts: string[]) => dxfLines.push(...parts);

      // En-tête HEADER minimal
      dxf('0', 'SECTION', '2', 'HEADER',
          '9', '$ACADVER', '1', 'AC1009',
          '9', '$EXTMIN', '10', '-1', '20', '-1', '30', '0',
          '9', '$EXTMAX', '10', '9999', '20', '9999', '30', '0',
          '0', 'ENDSEC');

      // TABLES : calques par catégorie
      const uniqueCats = [...new Set(withVDxf.map((l) => l.categorie.replace(/[^A-Za-z0-9_-]/g, '_')))];
      dxf('0', 'SECTION', '2', 'TABLES',
          '0', 'TABLE', '2', 'LAYER', '70', String(uniqueCats.length + 1));
      // Calque 0 (défaut)
      dxf('0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS');
      // Un calque par catégorie
      uniqueCats.forEach((cat, i) => {
        const colorIdx = [1, 2, 3, 4, 5, 6, 30, 40, 50, 130, 140, 150][i % 12];
        dxf('0', 'LAYER', '2', cat, '70', '0', '62', String(colorIdx), '6', 'CONTINUOUS');
      });
      dxf('0', 'ENDTAB', '0', 'ENDSEC');

      // ENTITIES
      dxf('0', 'SECTION', '2', 'ENTITIES');

      withVDxf.forEach((ligne, figIdx) => {
        const pts = figDxf.get(figIdx) ?? [];
        if (pts.length === 0) return;
        const layer = ligne.categorie.replace(/[^A-Za-z0-9_-]/g, '_');

        if (ligne.geomType === 'Point') {
          // POINT entity
          dxf('0', 'POINT',
              '8', layer,
              '10', pts[0].xM.toFixed(4),
              '20', pts[0].yM.toFixed(4),
              '30', '0.0');
          // TEXT pour le nom
          dxf('0', 'TEXT',
              '8', layer,
              '10', (pts[0].xM + 0.3).toFixed(4),
              '20', (pts[0].yM + 0.3).toFixed(4),
              '30', '0.0',
              '40', '0.5',
              '1', ligne.nom.slice(0, 50));

        } else if (ligne.geomType === 'LineString') {
          // POLYLINE + VERTEX pour LineString
          dxf('0', 'POLYLINE',
              '8', layer,
              '66', '1',
              '70', '0',
              '10', '0', '20', '0', '30', '0');
          pts.forEach((p) => {
            dxf('0', 'VERTEX',
                '8', layer,
                '10', p.xM.toFixed(4),
                '20', p.yM.toFixed(4),
                '30', '0.0');
          });
          dxf('0', 'SEQEND', '8', layer);
          // Texte au milieu
          const midIdx = Math.floor(pts.length / 2);
          const mp = pts[midIdx];
          dxf('0', 'TEXT',
              '8', layer,
              '10', mp.xM.toFixed(4),
              '20', (mp.yM + 0.3).toFixed(4),
              '30', '0.0',
              '40', '0.5',
              '1', ligne.nom.slice(0, 50));

        } else if (ligne.geomType === 'Polygon') {
          // POLYLINE fermée
          dxf('0', 'POLYLINE',
              '8', layer,
              '66', '1',
              '70', '1',   // 1 = fermée
              '10', '0', '20', '0', '30', '0');
          pts.forEach((p) => {
            dxf('0', 'VERTEX',
                '8', layer,
                '10', p.xM.toFixed(4),
                '20', p.yM.toFixed(4),
                '30', '0.0');
          });
          dxf('0', 'SEQEND', '8', layer);
          // Texte au centroïde
          const cx3 = pts.reduce((s, p) => s + p.xM, 0) / pts.length;
          const cy3 = pts.reduce((s, p) => s + p.yM, 0) / pts.length;
          dxf('0', 'TEXT',
              '8', layer,
              '10', cx3.toFixed(4),
              '20', cy3.toFixed(4),
              '30', '0.0',
              '40', '0.5',
              '1', ligne.nom.slice(0, 50));
        }
      });

      // Bloc titre (INSERT commentaire dans ENTITIES)
      dxf('0', 'TEXT',
          '8', '0',
          '10', '0', '20', '-2', '30', '0',
          '40', '1.0',
          '1', (nom || 'Projet').slice(0, 50));

      dxf('0', 'ENDSEC', '0', 'EOF');

      zip.file('plan.dxf', dxfLines.join('\n'));
    }

    // ── 5. plan.pdf ─────────────────────────────────────────────────────────
    const pdfDoc  = await PDFDocument.create();
    const font    = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontB   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const W = 841.89; const H = 595.28;  // A4 paysage

    const txt = (page: ReturnType<typeof pdfDoc.addPage>, text: string, x: number, y: number, size: number, bold = false, col = rgb(0.2, 0.2, 0.2)) =>
      page.drawText(String(text).slice(0, 90), { x, y, size, font: bold ? fontB : font, color: col });

    // ── Page 1 : récap métrés ────────────────────────────────────────────────
    const p1 = pdfDoc.addPage([W, H]);
    let y = H - 40;

    txt(p1, `Plan paysagiste - ${nom || 'Projet'}`, 40, y, 15, true, rgb(0.08, 0.08, 0.08));
    y -= 14;
    txt(p1, `Exporté le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 40, y, 8, false, rgb(0.5, 0.5, 0.5));
    y -= 6;
    p1.drawLine({ start: { x: 40, y }, end: { x: W - 40, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    y -= 14;

    txt(p1, 'RÉCAPITULATIF DES MÉTRÉS', 40, y, 10, true, rgb(0.08, 0.6, 0.3));
    y -= 14;

    const recap = recapParCategorie(lignesMetrage);
    for (const cat of recap) {
      if (y < 60) break;
      // En-tête catégorie
      p1.drawRectangle({ x: 38, y: y - 4, width: W - 76, height: 13, color: rgb(0.93, 0.98, 0.93) });
      txt(p1, cat.categorie, 42, y, 9, true, rgb(0.1, 0.4, 0.1));
      const totaux = (Object.entries(cat.totalParUnite) as [string, number][])
        .filter(([, v]) => v > 0).map(([u, v]) => `${v.toFixed(2)} ${u}`).join('  |  ');
      txt(p1, totaux, 300, y, 9, false, rgb(0.08, 0.6, 0.3));
      y -= 13;
      for (const l of cat.lignes) {
        if (y < 60) break;
        const q = (l.quantiteManuelle ?? l.quantite).toFixed(2);
        txt(p1, `  - ${l.nom}`, 48, y, 8, false, rgb(0.35, 0.35, 0.35));
        txt(p1, `${q} ${l.unite}`, 300, y, 8, false, rgb(0.2, 0.2, 0.2));
        if (l.label) txt(p1, `"${l.label}"`, 380, y, 7, false, rgb(0.55, 0.55, 0.55));
        if (l.coords) txt(p1, `(${l.coords.lon.toFixed(4)}, ${l.coords.lat.toFixed(4)})`, 560, y, 6.5, false, rgb(0.65, 0.65, 0.65));
        y -= 10;
      }
      y -= 5;
    }

    // ── Page 2 : plan d'implantation dessiné avec pdf-lib ─────────────────────
    const withVPlan = lignesMetrage.filter((l) => l.vertices && l.vertices.length > 0);
    if (withVPlan.length > 0) {
      const allPtsPlan: CoordImplantation[] = [];
      withVPlan.forEach((l, fi) => (l.vertices ?? []).forEach((v, vi) =>
        allPtsPlan.push({ lon: v.lon, lat: v.lat, label: l.nom, figureIdx: fi, vertexIdx: vi, geomType: l.geomType })
      ));
      const relPlan = coordsRelatives(allPtsPlan);

      const extXM = relPlan.length > 0 ? Math.max(...relPlan.map((p) => p.xM)) : 0;
      const extYM = relPlan.length > 0 ? Math.max(...relPlan.map((p) => p.yM)) : 0;
      const scaleMax = Math.max(extXM, extYM, 1);

      // Zone dessin dans le PDF A4 paysage (mm → pt : 1mm=2.8346pt)
      const MG = 50; // marge
      const dW = W - MG * 2;
      const dH = H - MG * 2 - 30; // -30 pour le titre
      const sc = Math.min(dW / scaleMax, dH / scaleMax);
      // Origine dans coords PDF : bas-gauche à (MG, MG + dH * fraction)
      // En PDF y croît vers le haut → origine SW = (MG, MG)
      const pX = (xM: number) => MG + xM * sc;
      const pY = (yM: number) => MG + yM * sc;  // Y déjà vers le haut en PDF

      const pp = pdfDoc.addPage([W, H]);

      // Titre
      txt(pp, `Plan d'implantation - ${nom || 'Projet'}`, 40, H - 30, 12, true, rgb(0.08, 0.08, 0.08));
      txt(pp, `Origine SW · X=Est · Y=Nord · ${extXM.toFixed(1)} × ${extYM.toFixed(1)} m`, 40, H - 42, 7.5, false, rgb(0.5, 0.5, 0.5));

      // Fond zone dessin
      pp.drawRectangle({ x: MG, y: MG, width: dW, height: dH, color: rgb(0.98, 0.99, 0.98), borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 0.5 });

      // Axes
      pp.drawLine({ start: { x: MG, y: MG }, end: { x: MG + dW, y: MG }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
      pp.drawLine({ start: { x: MG, y: MG }, end: { x: MG, y: MG + dH }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
      txt(pp, 'X - Est (m) ->', MG + dW / 2, MG - 14, 7, false, rgb(0.3, 0.3, 0.3));
      txt(pp, 'O SW', MG - 18, MG - 10, 6.5, true, rgb(0.2, 0.2, 0.2));
      txt(pp, '^N', MG + dW - 10, MG + dH - 2, 8, true, rgb(0.05, 0.2, 0.7));

      // Grille légère
      const tickS = niceStepPDF(scaleMax / 4);
      for (let v = tickS; v <= scaleMax; v += tickS) {
        const gx = pX(v), gy = pY(v);
        if (gx < MG + dW) {
          pp.drawLine({ start: { x: gx, y: MG }, end: { x: gx, y: MG + dH }, thickness: 0.3, color: rgb(0.88, 0.88, 0.88) });
          txt(pp, v.toFixed(0), gx - 6, MG - 10, 5.5, false, rgb(0.6, 0.6, 0.6));
        }
        if (gy < MG + dH) {
          pp.drawLine({ start: { x: MG, y: gy }, end: { x: MG + dW, y: gy }, thickness: 0.3, color: rgb(0.88, 0.88, 0.88) });
          txt(pp, v.toFixed(0), MG - 20, gy - 3, 5.5, false, rgb(0.6, 0.6, 0.6));
        }
      }

      // Grouper par figure
      const figMap = new Map<number, typeof relPlan>();
      relPlan.forEach((p) => { if (!figMap.has(p.figureIdx)) figMap.set(p.figureIdx, []); figMap.get(p.figureIdx)!.push(p); });

      // Couleurs PDF par figure (approximées depuis hex de la LigneMetrage)
      const hexToPdfRgb = (hex: string): ReturnType<typeof rgb> => {
        const r2 = parseInt(hex.slice(1,3),16)/255, g2 = parseInt(hex.slice(3,5),16)/255, b2 = parseInt(hex.slice(5,7),16)/255;
        return rgb(r2, g2, b2);
      };

      withVPlan.forEach((ligne, figIdx) => {
        const pts = figMap.get(figIdx) ?? [];
        if (pts.length === 0) return;
        const c = hexToPdfRgb(ligne.color);

        if (ligne.geomType === 'Point') {
          pp.drawCircle({ x: pX(pts[0].xM), y: pY(pts[0].yM), size: 4, color: c });
          txt(pp, `F${figIdx+1}`, pX(pts[0].xM) + 5, pY(pts[0].yM) + 3, 5.5, true, c);
          txt(pp, ligne.nom.slice(0, 22), pX(pts[0].xM) + 5, pY(pts[0].yM) - 8, 8, true, c);
          return;
        }

        // Tracer les segments
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b2 = pts[i+1];
          pp.drawLine({ start: { x: pX(a.xM), y: pY(a.yM) }, end: { x: pX(b2.xM), y: pY(b2.yM) }, thickness: 1, color: c });
          // Cote
          const dist = Math.sqrt((b2.xM-a.xM)**2 + (b2.yM-a.yM)**2);
          if (dist > 0.1) {
            const mx2 = (pX(a.xM)+pX(b2.xM))/2, my2 = (pY(a.yM)+pY(b2.yM))/2;
            const dLabel = dist >= 10 ? dist.toFixed(1) : dist.toFixed(2);
            txt(pp, `${dLabel}m`, mx2 - 8, my2 + 3, 5, false, c);
          }
        }
        // Fermer polygone
        if (ligne.geomType === 'Polygon' && pts.length >= 2) {
          const a = pts[pts.length-1], b2 = pts[0];
          pp.drawLine({ start: { x: pX(a.xM), y: pY(a.yM) }, end: { x: pX(b2.xM), y: pY(b2.yM) }, thickness: 1, color: c });
          const dist = Math.sqrt((b2.xM-a.xM)**2 + (b2.yM-a.yM)**2);
          if (dist > 0.1) {
            const mx2 = (pX(a.xM)+pX(b2.xM))/2, my2 = (pY(a.yM)+pY(b2.yM))/2;
            txt(pp, `${dist >= 10 ? dist.toFixed(1) : dist.toFixed(2)}m`, mx2 - 8, my2 + 3, 5, false, c);
          }
        }
        // Sommets
        pts.forEach((p, vi) => {
          pp.drawCircle({ x: pX(p.xM), y: pY(p.yM), size: 2.5, color: c });
          txt(pp, `F${figIdx+1}-S${vi+1}`, pX(p.xM)+3, pY(p.yM)+2, 4.5, false, c);
        });
        // Nom de l'element au centroide
        if (pts.length > 0) {
          const cx = pts.reduce((s, p) => s + pX(p.xM), 0) / pts.length;
          const cy = pts.reduce((s, p) => s + pY(p.yM), 0) / pts.length;
          txt(pp, ligne.nom.slice(0, 22), cx - 14, cy, 8, true, c);
        }
      });

      // Legende
      txt(pp, 'LEGENDE', MG + dW + 8, MG + dH + 6, 6, true, rgb(0.2, 0.2, 0.2));
      withVPlan.slice(0, 14).forEach((ligne, i) => {
        const ly = MG + dH - 6 - i * 14;
        pp.drawRectangle({ x: MG + dW + 8, y: ly - 4, width: 8, height: 8, color: hexToPdfRgb(ligne.color) });
        // Icone type geometrie
        const typeIcon = ligne.geomType === 'Point' ? '[.]' : ligne.geomType === 'LineString' ? '[-]' : '[#]';
        txt(pp, `F${i+1} ${typeIcon} ${ligne.nom.slice(0, 20)}`, MG + dW + 20, ly, 5, false, rgb(0.2, 0.2, 0.2));
        if (ligne.categorie) txt(pp, ligne.categorie.slice(0, 22), MG + dW + 22, ly - 7, 4, false, rgb(0.55, 0.55, 0.55));
      });
    }

    // ── Page 3 : tableau sommets ─────────────────────────────────────────────
    const withV = lignesMetrage.filter((l) => l.vertices && l.vertices.length > 0);
    if (withV.length > 0) {
      const allPts: CoordImplantation[] = [];
      withV.forEach((l, fi) => (l.vertices ?? []).forEach((v, vi) =>
        allPts.push({ lon: v.lon, lat: v.lat, label: l.nom, figureIdx: fi, vertexIdx: vi, geomType: l.geomType })
      ));
      const rel = coordsRelatives(allPts);

      let p2 = pdfDoc.addPage([W, H]);
      let y2 = H - 40;
      const t2 = (text: string, x: number, yp: number, size: number, bold = false, col = rgb(0.2, 0.2, 0.2)) =>
        p2.drawText(String(text).slice(0, 90), { x, y: yp, size, font: bold ? fontB : font, color: col });

      t2(`Coordonnees d'implantation - ${nom || 'Projet'}`, 40, y2, 13, true, rgb(0.08, 0.08, 0.08));
      y2 -= 12;
      t2('Origine O = point le plus Nord-Ouest (lon_min, lat_max). X = Est (m), Y = Sud (m).', 40, y2, 7.5, false, rgb(0.5, 0.5, 0.5));
      y2 -= 16;

      const C = [40, 70, 100, 220, 312, 404, 506, 620, 720];
      const HDR = ['Fig.', 'S.', 'Élément', 'Type', 'Longitude', 'Latitude', 'X (m Est)', 'Y (m Sud)'];

      const drawHeader = () => {
        p2.drawRectangle({ x: 38, y: y2 - 4, width: W - 76, height: 13, color: rgb(0.9, 0.97, 0.9) });
        HDR.forEach((h, i) => t2(h, C[i], y2, 7.5, true, rgb(0.05, 0.4, 0.15)));
        y2 -= 13;
        p2.drawLine({ start: { x: 38, y: y2 + 2 }, end: { x: W - 38, y: y2 + 2 }, thickness: 0.4, color: rgb(0.8, 0.8, 0.8) });
      };
      drawHeader();

      for (const pt of rel) {
        if (y2 < 36) {
          // Nouvelle page
          p2 = pdfDoc.addPage([W, H]);
          y2 = H - 36;
          drawHeader();
        }
        const first = pt.vertexIdx === 0;
        if (first) p2.drawRectangle({ x: 38, y: y2 - 3, width: W - 76, height: 10, color: rgb(0.96, 0.99, 0.96) });
        const cg = rgb(0.08, 0.5, 0.2);
        const cd = rgb(0.3, 0.3, 0.3);
        const cm = rgb(0.55, 0.55, 0.55);
        t2(`F${pt.figureIdx + 1}`, C[0], y2, 7, true, cg);
        t2(`S${pt.vertexIdx + 1}`, C[1], y2, 7, false, cm);
        if (first) t2(pt.nom, C[2], y2, 7, false, cd);
        if (first) t2(pt.geomType, C[3], y2, 6.5, false, cm);
        t2(pt.lon.toFixed(6), C[4], y2, 7, false, cm);
        t2(pt.lat.toFixed(6), C[5], y2, 7, false, cm);
        t2(pt.xM.toFixed(3), C[6], y2, 7, true, cd);
        t2(pt.yM.toFixed(3), C[7], y2, 7, true, cd);
        y2 -= 10;
      }
    }

    const pdfBytes = await pdfDoc.save();
    zip.file('plan.pdf', pdfBytes);

    // ── 6. implantation.txt ─────────────────────────────────────────────────
    {
      const withVerts = lignesMetrage.filter((l) => l.vertices && l.vertices.length > 0);
      const allPtsFlat: CoordImplantation[] = [];
      withVerts.forEach((l, fi) =>
        (l.vertices ?? []).forEach((v, vi) =>
          allPtsFlat.push({ lon: v.lon, lat: v.lat, label: l.nom, figureIdx: fi, vertexIdx: vi, geomType: l.geomType })
        )
      );
      const relAll = coordsRelatives(allPtsFlat);
      const figMap = new Map<number, typeof relAll>();
      relAll.forEach((p) => {
        if (!figMap.has(p.figureIdx)) figMap.set(p.figureIdx, []);
        figMap.get(p.figureIdx)!.push(p);
      });

      const dateStr = new Date().toLocaleDateString('fr-FR');

      // ── Format épuré : nom projet, date, puis éléments + coordonnées ──────
      const lines: string[] = [
        nom || 'Sans nom',
        dateStr,
        ``,
      ];

      withVerts.forEach((ligne, figIdx) => {
        const pts = figMap.get(figIdx) ?? [];
        lines.push(ligne.nom);
        if (pts.length === 0) {
          lines.push(`  (aucun sommet)`);
        } else if (ligne.geomType === 'Point') {
          // Ponctuel : une seule coordonnée
          lines.push(`  (${pts[0].xM.toFixed(2)}, ${pts[0].yM.toFixed(2)})`);
        } else {
          // Polyline ou Polygon : liste des sommets
          pts.forEach((p, si) => {
            lines.push(`  S${si + 1} : (${p.xM.toFixed(2)}, ${p.yM.toFixed(2)})`);
          });
        }
        lines.push('');
      });

      if (withVerts.length === 0) {
        lines.push('Aucun element avec geometrie dans ce projet.');
      }

      const implContent = lines.join('\n');

      // ── Fichier dans le ZIP ─────────────────────────────────────────────
      zip.file('implantation.txt', implContent);

      // ── Copie parallèle : implantation_<nom>_<date>.txt ────────────────
      const safeNom2 = (nom || 'projet').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30);
      const safeDateStr = dateStr.replace(/\//g, '-');
      zip.file(`implantation_${safeNom2}_${safeDateStr}.txt`, implContent);
    }

    // ── ZIP final ───────────────────────────────────────────────────────────
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const safeName = (nom || 'projet').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeName}_paysagiste.zip"`,
        'Content-Length': String(buf.length),
      },
    });
  } catch (e: unknown) {
    console.error('[/api/projet/export]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur export' }, { status: 500 });
  }
}
