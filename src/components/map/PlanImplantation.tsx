'use client';

/**
 * PlanImplantation.tsx — Plan d'implantation coté avec zoom/pan
 *
 * Repère local :
 *   Origine O = point le plus Sud-Ouest (lon_min, lat_min)
 *   X → Est (mètres)
 *   Y ↑ Nord (mètres) — axe SVG inversé : toY = MARGIN + drawH - yM*scale
 *
 * Cotation :
 *   - Cotes entre sommets consécutifs de chaque figure (distance en mètres)
 *   - Affichées sur des lignes de cote avec flèches
 *
 * Zoom/Pan :
 *   - Molette : zoom centré curseur
 *   - Clic+glisser : pan
 *   - Double-clic : zoom×2
 *   - Boutons +/−/reset
 *
 * Le SVG est exportable tel quel (viewBox complet) et est inclus dans le PDF
 * via la prop svgRef transmise depuis PaysagistePanel.
 */

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import type { LigneMetrage } from '@/lib/paysagiste';
import { coordsRelatives, exportCoordsCSV, type CoordImplantation } from '@/lib/paysagiste';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlanImplantationProps {
  lignes: LigneMetrage[];
  projetNom: string;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const SVG_W = 580;
const SVG_H = 460;
const MARGIN = 56;   // espace pour axes + graduations + cotes
const VERTEX_R = 4;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 50;
const COTE_OFFSET = 10;  // décalage ligne de cote en px SVG

interface ViewBox { x: number; y: number; w: number; h: number; }

// ─── Composant ────────────────────────────────────────────────────────────────

export default function PlanImplantation({
  lignes,
  projetNom,
  svgRef: externalSvgRef,
}: PlanImplantationProps) {
  const internalRef = useRef<SVGSVGElement>(null);
  const svgRef = (externalSvgRef ?? internalRef) as React.RefObject<SVGSVGElement>;

  const [vb, setVb] = useState<ViewBox>({ x: 0, y: 0, w: SVG_W, h: SVG_H });
  const isPanning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const zoomLevel = SVG_W / vb.w;

  // ── Données ─────────────────────────────────────────────────────────────────

  const withVertices = useMemo(
    () => lignes.filter((l) => l.vertices && l.vertices.length > 0),
    [lignes]
  );

  const allPoints = useMemo<CoordImplantation[]>(() => {
    const pts: CoordImplantation[] = [];
    withVertices.forEach((ligne, figIdx) => {
      (ligne.vertices ?? []).forEach((v, vIdx) => {
        pts.push({ lon: v.lon, lat: v.lat, label: ligne.nom, figureIdx: figIdx, vertexIdx: vIdx, geomType: ligne.geomType });
      });
    });
    return pts;
  }, [withVertices]);

  const relPoints = useMemo(() => coordsRelatives(allPoints), [allPoints]);

  const extentXM = relPoints.length > 0 ? Math.max(...relPoints.map((p) => p.xM)) : 0;
  const extentYM = relPoints.length > 0 ? Math.max(...relPoints.map((p) => p.yM)) : 0;

  const drawW = SVG_W - MARGIN * 2;
  const drawH = SVG_H - MARGIN * 2;
  const scaleMax = Math.max(extentXM, extentYM, 1);
  const scale = Math.min(drawW / scaleMax, drawH / scaleMax);

  // Axe Y inversé : O en bas à gauche, Y vers le haut
  const toX = (xM: number) => MARGIN + xM * scale;
  const toY = (yM: number) => MARGIN + drawH - yM * scale;  // ← inversé

  const tickStep = niceStep(scaleMax / 4);
  const ticks: number[] = [];
  for (let v = 0; v <= scaleMax + tickStep; v += tickStep) ticks.push(v);

  const figurePoints = useMemo(() => {
    const map = new Map<number, typeof relPoints>();
    relPoints.forEach((p) => {
      if (!map.has(p.figureIdx)) map.set(p.figureIdx, []);
      map.get(p.figureIdx)!.push(p);
    });
    return map;
  }, [relPoints]);

  useEffect(() => { setVb({ x: 0, y: 0, w: SVG_W, h: SVG_H }); }, [lignes]);

  // ── Zoom/Pan ──────────────────────────────────────────────────────────────

  const screenToSvg = useCallback((cx: number, cy: number) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: vb.x + (cx - rect.left) * (vb.w / rect.width),
      y: vb.y + (cy - rect.top)  * (vb.h / rect.height),
    };
  }, [vb, svgRef]);

  const zoomAt = useCallback((svgX: number, svgY: number, factor: number) => {
    setVb((prev) => {
      const newW = clamp(prev.w / factor, SVG_W / ZOOM_MAX, SVG_W / ZOOM_MIN);
      const newH = clamp(prev.h / factor, SVG_H / ZOOM_MAX, SVG_H / ZOOM_MIN);
      const f = prev.w / newW;
      return { x: svgX - (svgX - prev.x) / f, y: svgY - (svgY - prev.y) / f, w: newW, h: newH };
    });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const { x, y } = screenToSvg(e.clientX, e.clientY);
    zoomAt(x, y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, [screenToSvg, zoomAt]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    lastPan.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = (e.clientX - lastPan.current.x) * (vb.w / rect.width);
    const dy = (e.clientY - lastPan.current.y) * (vb.h / rect.height);
    lastPan.current = { x: e.clientX, y: e.clientY };
    setVb((p) => ({ ...p, x: p.x - dx, y: p.y - dy }));
  }, [vb.w, vb.h, svgRef]);

  const handlePointerUp = useCallback(() => { isPanning.current = false; }, []);
  const handleDblClick = useCallback((e: React.MouseEvent) => {
    const { x, y } = screenToSvg(e.clientX, e.clientY);
    zoomAt(x, y, 2);
  }, [screenToSvg, zoomAt]);

  const zoomIn  = () => zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, 1.5);
  const zoomOut = () => zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, 1 / 1.5);
  const resetZoom = () => setVb({ x: 0, y: 0, w: SVG_W, h: SVG_H });

  // ── Exports ──────────────────────────────────────────────────────────────

  const handleExportSVG = () => {
    const el = svgRef.current;
    if (!el) return;
    const clone = el.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
    clone.setAttribute('width', String(SVG_W));
    clone.setAttribute('height', String(SVG_H));
    const blob = new Blob(
      ['<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone)],
      { type: 'image/svg+xml' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(projetNom || 'projet').replace(/\s/g, '_')}_plan.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const csv = exportCoordsCSV(allPoints, projetNom);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(projetNom || 'projet').replace(/\s/g, '_')}_sommets.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Vide ─────────────────────────────────────────────────────────────────

  if (withVertices.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📐</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', marginBottom: 6 }}>Aucun élément dessiné sur la carte</div>
        <div style={{ fontSize: 11, lineHeight: 1.6, maxWidth: 220 }}>
          Utilisez l'onglet <strong>Éléments</strong> pour dessiner des points, lignes ou surfaces. Les sommets et cotes apparaîtront ici.
        </div>
      </div>
    );
  }

  // ── SVG content (réutilisé pour export) ──────────────────────────────────

  const svgContent = (
    <>
      {/* Titre */}
      <text x={SVG_W / 2} y={14} textAnchor="middle" fontSize={9} fill="#374151" fontFamily="Arial" fontWeight="bold">
        {projetNom || 'Plan d\'implantation'} — coordonnées relatives (m) · origine SW
      </text>

      {/* Fond zone dessin */}
      <rect x={MARGIN} y={MARGIN} width={drawW} height={drawH} fill="#f9fafb" stroke="#e5e7eb" strokeWidth={0.5} />

      {/* Grille */}
      {ticks.map((v) => {
        const px = toX(v);
        const py = toY(v);
        return (
          <g key={v}>
            {px <= MARGIN + drawW + 0.5 && <>
              <line x1={px} y1={MARGIN} x2={px} y2={MARGIN + drawH} stroke="#e5e7eb" strokeWidth={0.5} />
              <text x={px} y={MARGIN + drawH + 12} textAnchor="middle" fontSize={7} fill="#9ca3af" fontFamily="Arial">{v.toFixed(0)}</text>
            </>}
            {py >= MARGIN - 0.5 && py <= MARGIN + drawH + 0.5 && <>
              <line x1={MARGIN} y1={py} x2={MARGIN + drawW} y2={py} stroke="#e5e7eb" strokeWidth={0.5} />
              <text x={MARGIN - 4} y={py + 2.5} textAnchor="end" fontSize={7} fill="#9ca3af" fontFamily="Arial">{v.toFixed(0)}</text>
            </>}
          </g>
        );
      })}

      {/* Axes */}
      {/* X : bas du dessin (Y=0 = Sud) */}
      <line x1={MARGIN} y1={MARGIN + drawH} x2={MARGIN + drawW} y2={MARGIN + drawH} stroke="#374151" strokeWidth={1.2} />
      {/* Y : gauche du dessin (X=0 = Ouest) */}
      <line x1={MARGIN} y1={MARGIN} x2={MARGIN} y2={MARGIN + drawH} stroke="#374151" strokeWidth={1.2} />
      {/* Flèches axes */}
      <polygon points={`${MARGIN + drawW + 6},${MARGIN + drawH} ${MARGIN + drawW},${MARGIN + drawH - 3} ${MARGIN + drawW},${MARGIN + drawH + 3}`} fill="#374151" />
      <polygon points={`${MARGIN},${MARGIN - 6} ${MARGIN - 3},${MARGIN} ${MARGIN + 3},${MARGIN}`} fill="#374151" />
      {/* Labels axes */}
      <text x={MARGIN + drawW / 2} y={SVG_H - 3} textAnchor="middle" fontSize={8} fill="#374151" fontFamily="Arial">X — Est (m) →</text>
      <text x={8} y={MARGIN + drawH / 2} textAnchor="middle" fontSize={8} fill="#374151" fontFamily="Arial" transform={`rotate(-90,8,${MARGIN + drawH / 2})`}>Y — Nord (m) ↑</text>
      {/* Origine SW */}
      <circle cx={MARGIN} cy={MARGIN + drawH} r={3.5} fill="#374151" />
      <text x={MARGIN + 5} y={MARGIN + drawH + 12} fontSize={7} fill="#374151" fontFamily="Arial" fontWeight="bold">O (SW)</text>
      {/* Nord */}
      <text x={SVG_W - 8} y={MARGIN + 10} textAnchor="end" fontSize={9} fill="#1e40af" fontFamily="Arial" fontWeight="bold">▲ N</text>

      {/* ── Figures avec cotation ── */}
      {withVertices.map((ligne, figIdx) => {
        const pts = figurePoints.get(figIdx) ?? [];
        if (pts.length === 0) return null;
        const color = ligne.color;
        const rgb = hexToRgb(color);

        // Paires de sommets pour les cotes
        // Pour Point : pas de cote
        // Pour LineString : cotes entre segments consécutifs
        // Pour Polygon : cotes de tous les côtés (y compris fermeture)
        const cotePairs: [typeof pts[0], typeof pts[0]][] = [];
        if (ligne.geomType === 'LineString' && pts.length >= 2) {
          for (let i = 0; i < pts.length - 1; i++) cotePairs.push([pts[i], pts[i + 1]]);
        } else if (ligne.geomType === 'Polygon' && pts.length >= 2) {
          for (let i = 0; i < pts.length; i++) cotePairs.push([pts[i], pts[(i + 1) % pts.length]]);
        }

        return (
          <g key={figIdx}>
            {/* Cotes */}
            {cotePairs.map(([a, b], ci) => {
              const ax = toX(a.xM), ay = toY(a.yM);
              const bx = toX(b.xM), by = toY(b.yM);
              const dist = Math.sqrt((b.xM - a.xM) ** 2 + (b.yM - a.yM) ** 2);
              if (dist < 0.05) return null;

              // Vecteur unitaire du segment
              const dx = bx - ax, dy = by - ay;
              const len = Math.sqrt(dx * dx + dy * dy);
              const ux = dx / len, uy = dy / len;
              // Perpendiculaire (vers l'extérieur de la figure)
              const nx = -uy, ny = ux;
              const off = COTE_OFFSET;

              // Points de la ligne de cote
              const x1c = ax + nx * off, y1c = ay + ny * off;
              const x2c = bx + nx * off, y2c = by + ny * off;
              const mx = (x1c + x2c) / 2, my = (y1c + y2c) / 2;

              const angle = Math.atan2(y2c - y1c, x2c - x1c) * 180 / Math.PI;
              const distLabel = dist >= 10 ? dist.toFixed(1) : dist.toFixed(2);

              return (
                <g key={ci}>
                  {/* Lignes de rappel */}
                  <line x1={ax} y1={ay} x2={x1c} y2={y1c} stroke={color} strokeWidth={0.5} strokeDasharray="2,2" opacity={0.6} />
                  <line x1={bx} y1={by} x2={x2c} y2={y2c} stroke={color} strokeWidth={0.5} strokeDasharray="2,2" opacity={0.6} />
                  {/* Ligne de cote */}
                  <line x1={x1c} y1={y1c} x2={x2c} y2={y2c} stroke={color} strokeWidth={0.8} />
                  {/* Flèches de cote */}
                  <polygon points={arrowHead(x1c, y1c, x2c, y2c, 4)} fill={color} />
                  <polygon points={arrowHead(x2c, y2c, x1c, y1c, 4)} fill={color} />
                  {/* Texte cote */}
                  <g transform={`translate(${mx},${my}) rotate(${angle > 90 || angle < -90 ? angle + 180 : angle})`}>
                    <rect x={-(distLabel.length * 3.2 + 2)} y={-8} width={distLabel.length * 6.4 + 4} height={9} fill="white" opacity={0.85} rx={1} />
                    <text x={0} y={-1} textAnchor="middle" fontSize={6.5} fill={color} fontFamily="Arial" fontWeight="bold">{distLabel} m</text>
                  </g>
                </g>
              );
            })}

            {/* Figure elle-même */}
            {ligne.geomType === 'Point' && (() => {
              const p = pts[0];
              return (
                <>
                  <circle cx={toX(p.xM)} cy={toY(p.yM)} r={VERTEX_R + 2} fill={color} stroke="white" strokeWidth={1.5} />
                  <text x={toX(p.xM)} y={toY(p.yM) + 4} textAnchor="middle" fontSize={6} fill="white" fontFamily="Arial" fontWeight="bold">F{figIdx + 1}</text>
                  <text x={toX(p.xM)} y={toY(p.yM) + (VERTEX_R + 2) + 9} textAnchor="middle" fontSize={8} fill={color} fontFamily="Arial" fontWeight="bold">{ligne.nom.length > 18 ? ligne.nom.slice(0, 17) + '…' : ligne.nom}</text>
                </>
              );
            })()}

            {ligne.geomType === 'LineString' && (() => {
              const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.xM).toFixed(1)},${toY(p.yM).toFixed(1)}`).join(' ');
              return (
                <>
                  <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((p, vi) => (
                    <g key={vi}>
                      <circle cx={toX(p.xM)} cy={toY(p.yM)} r={VERTEX_R} fill={color} stroke="white" strokeWidth={1.2} />
                      <text x={toX(p.xM)} y={toY(p.yM) + 3.5} textAnchor="middle" fontSize={5} fill="white" fontFamily="Arial" fontWeight="bold">{vi + 1}</text>
                      <text x={toX(p.xM) + VERTEX_R + 2} y={toY(p.yM) - 4} fontSize={6} fill={color} fontFamily="Arial" fontWeight="bold">F{figIdx + 1}-S{vi + 1}</text>
                    </g>
                  ))}
                </>
              );
            })()}

            {ligne.geomType === 'Polygon' && (() => {
              const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.xM).toFixed(1)},${toY(p.yM).toFixed(1)}`).join(' ') + ' Z';
              const cx2 = pts.reduce((s, p) => s + toX(p.xM), 0) / pts.length;
              const cy2 = pts.reduce((s, p) => s + toY(p.yM), 0) / pts.length;
              return (
                <>
                  <path d={pathD} fill={`rgba(${rgb},0.15)`} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
                  <text x={cx2} y={cy2 + 3} textAnchor="middle" fontSize={7} fill={color} fontFamily="Arial" fontWeight="bold">F{figIdx + 1}</text>
                  <text x={cx2} y={cy2 + 13} textAnchor="middle" fontSize={8} fill={color} fontFamily="Arial" fontWeight="bold">{ligne.nom.length > 18 ? ligne.nom.slice(0, 17) + '…' : ligne.nom}</text>
                  {pts.map((p, vi) => (
                    <g key={vi}>
                      <circle cx={toX(p.xM)} cy={toY(p.yM)} r={VERTEX_R} fill={color} stroke="white" strokeWidth={1.2} />
                      <text x={toX(p.xM)} y={toY(p.yM) + 3.5} textAnchor="middle" fontSize={5} fill="white" fontFamily="Arial" fontWeight="bold">{vi + 1}</text>
                      <text x={toX(p.xM) + VERTEX_R + 2} y={toY(p.yM) - 4} fontSize={6} fill={color} fontFamily="Arial" fontWeight="bold">F{figIdx + 1}-S{vi + 1}</text>
                    </g>
                  ))}
                </>
              );
            })()}
          </g>
        );
      })}

      {/* Échelle graphique */}
      <g transform={`translate(${MARGIN}, ${SVG_H - 12})`}>
        <line x1={0} y1={0} x2={tickStep * scale} y2={0} stroke="#374151" strokeWidth={2} />
        <line x1={0} y1={-3} x2={0} y2={3} stroke="#374151" strokeWidth={1.5} />
        <line x1={tickStep * scale} y1={-3} x2={tickStep * scale} y2={3} stroke="#374151" strokeWidth={1.5} />
        <text x={tickStep * scale / 2} y={-4} textAnchor="middle" fontSize={7} fill="#374151" fontFamily="Arial">
          {tickStep >= 1 ? tickStep.toFixed(0) : tickStep.toFixed(1)} m
        </text>
      </g>

      {/* Légende figures */}
      {withVertices.slice(0, 10).map((ligne, i) => (
        <g key={i} transform={`translate(${SVG_W - MARGIN + 5}, ${MARGIN + i * 15})`}>
          <rect x={0} y={-6} width={8} height={8} fill={ligne.color} rx={1} />
          <text x={11} y={1} fontSize={6.5} fill="#374151" fontFamily="Arial">
            F{i + 1} {ligne.nom.length > 14 ? ligne.nom.slice(0, 13) + '…' : ligne.nom}
          </text>
        </g>
      ))}
      {withVertices.length > 10 && (
        <text x={SVG_W - MARGIN + 5} y={MARGIN + 10 * 15} fontSize={6.5} fill="#9ca3af" fontFamily="Arial">
          +{withVertices.length - 10}…
        </text>
      )}
    </>
  );

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>Plan — {projetNom || 'Projet'}</div>
          <div style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>
            {withVertices.length} fig. · {allPoints.length} sommets · {extentXM.toFixed(1)}×{extentYM.toFixed(1)} m · origine SW
          </div>
        </div>
        <button onClick={zoomOut} style={zoomBtnStyle}>−</button>
        <button onClick={resetZoom} style={{ ...zoomBtnStyle, fontSize: 8, padding: '3px 5px', minWidth: 38 }}>
          {zoomLevel.toFixed(1)}×
        </button>
        <button onClick={zoomIn} style={zoomBtnStyle}>+</button>
        <div style={{ width: 1, height: 16, background: 'var(--color-border)' }} />
        <button onClick={handleExportSVG} style={exportBtnStyle('#3b82f6')}>↓ SVG</button>
        <button onClick={handleExportCSV} style={exportBtnStyle('#22c55e')}>↓ CSV</button>
      </div>

      {/* Zone SVG interactive */}
      <div style={{ background: 'var(--color-surface-2)', padding: 8, flexShrink: 0, userSelect: 'none', touchAction: 'none' }}>
        <svg
          ref={svgRef}
          width="100%"
          height={310}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          style={{ background: 'white', display: 'block', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'grab' }}
          xmlns="http://www.w3.org/2000/svg"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onDoubleClick={handleDblClick}
        >
          {svgContent}
        </svg>
        <div style={{ fontSize: 9, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 3 }}>
          Molette : zoom · Glisser : pan · Double-clic : zoom×2
        </div>
      </div>

      {/* Tableau sommets */}
      <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--color-border)', minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ background: 'var(--color-surface)', position: 'sticky', top: 0, zIndex: 1 }}>
              {['Fig.', 'Som.', 'Élément', 'Type', 'Longitude', 'Latitude', 'X (m Est)', 'Y (m Nord)'].map((h) => (
                <th key={h} style={{ padding: '5px 6px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap', fontSize: 9 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {relPoints.map((pt, i) => {
              const ligne = withVertices[pt.figureIdx];
              const first = pt.vertexIdx === 0;
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)', background: first ? `${ligne.color}08` : 'transparent' }}>
                  <td style={{ padding: '3px 6px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: ligne.color }}>F{pt.figureIdx + 1}</td>
                  <td style={{ padding: '3px 6px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>S{pt.vertexIdx + 1}</td>
                  <td style={{ padding: '3px 6px', color: 'var(--color-text)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first ? pt.nom : ''}</td>
                  <td style={{ padding: '3px 6px', color: 'var(--color-text-muted)', fontSize: 8 }}>{first ? pt.geomType : ''}</td>
                  <td style={{ padding: '3px 6px', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)' }}>{pt.lon.toFixed(6)}</td>
                  <td style={{ padding: '3px 6px', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)' }}>{pt.lat.toFixed(6)}</td>
                  <td style={{ padding: '3px 6px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text)' }}>{pt.xM.toFixed(3)}</td>
                  <td style={{ padding: '3px 6px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text)' }}>{pt.yM.toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) { return Math.min(Math.max(v, min), max); }

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

function hexToRgb(hex: string): string {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}

/** Calcule les points d'une flèche de cotation */
function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): string {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return '';
  const ux = dx / len, uy = dy / len;
  const px = -uy * size * 0.4, py = ux * size * 0.4;
  return `${x1},${y1} ${x1 + ux * size + px},${y1 + uy * size + py} ${x1 + ux * size - px},${y1 + uy * size - py}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const zoomBtnStyle: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 5, fontSize: 14, fontWeight: 700,
  border: '1px solid var(--color-border)', background: 'var(--color-surface-2)',
  color: 'var(--color-text)', cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 0,
};

function exportBtnStyle(color: string): React.CSSProperties {
  return { padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: 'none', background: color, color: 'white', cursor: 'pointer', flexShrink: 0 };
}
