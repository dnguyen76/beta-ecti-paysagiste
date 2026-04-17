'use client';

import { useRef, useState } from 'react';
import type { LigneMetrage } from '@/lib/paysagiste';
import { exportCoordsCSV, type CoordImplantation } from '@/lib/paysagiste';

function buildCsvMetrage(lignes: LigneMetrage[], projetNom: string): string {
  const map = new Map<string, LigneMetrage[]>();
  lignes.forEach((l) => { if (!map.has(l.categorie)) map.set(l.categorie, []); map.get(l.categorie)!.push(l); });
  const parts: string[] = [`Projet;${projetNom}`, `Exporté le;${new Date().toLocaleDateString('fr-FR')}`, ''];
  for (const [cat, ls] of map.entries()) {
    parts.push(`=== ${cat} ===`);
    parts.push('Élément;Quantité;Unité;Note');
    for (const l of ls) {
      const q = (l.quantiteManuelle ?? l.quantite).toFixed(3);
      parts.push([`"${l.nom}"`, q, l.unite, `"${l.label ?? ''}"`].join(';'));
    }
    parts.push('');
  }
  return parts.join('\n');
}

function buildCsvSommets(lignes: LigneMetrage[], projetNom: string): string {
  const allPts: CoordImplantation[] = [];
  lignes.filter((l) => l.vertices?.length).forEach((l, fi) => {
    (l.vertices ?? []).forEach((v, vi) =>
      allPts.push({ lon: v.lon, lat: v.lat, label: l.nom, figureIdx: fi, vertexIdx: vi, geomType: l.geomType })
    );
  });
  return exportCoordsCSV(allPts, projetNom);
}

interface ProjetActionsProps {
  projetNom: string;
  lignesMetrage: LigneMetrage[];
  svgRef: React.RefObject<SVGSVGElement | null>;
  onImport: (nom: string, lignes: LigneMetrage[]) => void;
  onNouveauProjet: () => void;
}

export default function ProjetActions({ projetNom, lignesMetrage, svgRef, onImport, onNouveauProjet }: ProjetActionsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [showNouveauModal, setShowNouveauModal] = useState(false);
  const [showOuvrirModal, setShowOuvrirModal] = useState(false);

  const showMsg = (text: string, type: 'ok' | 'err') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3500);
  };

  const handleSave = async () => {
    if (!projetNom.trim()) { showMsg('Donnez un nom au projet avant d\'enregistrer', 'err'); return; }
    if (lignesMetrage.length === 0) { showMsg('Aucun métré à enregistrer', 'err'); return; }
    setSaving(true);
    try {
      let svgContent = '';
      if (svgRef.current) {
        const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('viewBox', '0 0 580 440');
        clone.setAttribute('width', '580');
        clone.setAttribute('height', '440');
        svgContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
      }
      const body = { nom: projetNom, lignesMetrage, svgContent, csvMetrage: buildCsvMetrage(lignesMetrage, projetNom), csvSommets: buildCsvSommets(lignesMetrage, projetNom) };
      const res = await fetch('/api/projet/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Erreur serveur' })); throw new Error(err.error); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projetNom.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40)}_paysagiste.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showMsg(`Projet enregistré — ${lignesMetrage.length} métrés`, 'ok');
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : 'Erreur d\'enregistrement', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/projet/import', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erreur de lecture');
      onImport(data.nom, data.lignesMetrage);
      showMsg(`Projet "${data.nom}" chargé — ${data.nbLignes} métrés`, 'ok');
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : 'Erreur d\'import', 'err');
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmNouveau = () => {
    setShowNouveauModal(false);
    onNouveauProjet();
  };

  const handleConfirmOuvrir = () => {
    setShowOuvrirModal(false);
    fileRef.current?.click();
  };

  return (
    <div style={{ flexShrink: 0 }}>

      {/* Modale confirmation Nouveau projet */}
      {showNouveauModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 12, padding: '24px 20px', maxWidth: 320, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: 24, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.6, textAlign: 'center', marginBottom: 20 }}>
              Attention — enregistrer le projet en cours.<br />
              <strong>Tous les éléments vont être supprimés.</strong>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleConfirmNouveau}
                style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer' }}
              >
                Confirmer nouveau
              </button>
              <button
                onClick={() => setShowNouveauModal(false)}
                style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text)', cursor: 'pointer' }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale confirmation Ouvrir projet */}
      {showOuvrirModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 12, padding: '24px 20px', maxWidth: 320, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: 24, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.6, textAlign: 'center', marginBottom: 20 }}>
              Attention — enregistrer le projet en cours.<br />
              <strong>Tous les éléments vont être supprimés.</strong>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleConfirmOuvrir}
                style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer' }}
              >
                Confirmer Ouvrir
              </button>
              <button
                onClick={() => setShowOuvrirModal(false)}
                style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text)', cursor: 'pointer' }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barre boutons */}
      <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 5, background: 'var(--color-surface)' }}>

        {/* Nouveau */}
        <button
          onClick={() => setShowNouveauModal(true)}
          title="Créer un nouveau projet (efface le projet en cours)"
          style={{
            padding: '6px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', border: '1px solid var(--color-border)',
            background: 'var(--color-surface-2)', color: 'var(--color-text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            whiteSpace: 'nowrap',
          }}
        >
          ✦ Nouveau
        </button>

        {/* Ouvrir */}
        <button
          onClick={() => setShowOuvrirModal(true)}
          disabled={importing}
          title="Charger un projet depuis un fichier enregistré"
          style={{
            flex: 1, padding: '6px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600,
            cursor: importing ? 'not-allowed' : 'pointer',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-2)',
            color: importing ? 'var(--color-text-muted)' : 'var(--color-text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          {importing ? '⟳ Lecture…' : '↑ Ouvrir projet'}
        </button>

        {/* Enregistrer */}
        <button
          onClick={handleSave}
          disabled={saving || lignesMetrage.length === 0}
          title="Enregistrer le projet (ZIP)"
          style={{
            flex: 1, padding: '6px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600,
            cursor: saving || lignesMetrage.length === 0 ? 'not-allowed' : 'pointer',
            border: 'none',
            background: lignesMetrage.length === 0 ? 'var(--color-surface-2)' : '#22c55e',
            color: lignesMetrage.length === 0 ? 'var(--color-text-muted)' : 'white',
            opacity: lignesMetrage.length === 0 ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          {saving ? '⟳ Génération…' : '↓ Enregistrer projet'}
        </button>

        <input ref={fileRef} type="file" accept=".zip" onChange={handleFileChange} style={{ display: 'none' }} />
      </div>

      {/* Feedback */}
      {msg && (
        <div style={{
          padding: '6px 10px', fontSize: 10, lineHeight: 1.4,
          background: msg.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          borderBottom: `1px solid ${msg.type === 'ok' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          color: msg.type === 'ok' ? '#15803d' : '#dc2626',
        }}>
          {msg.type === 'ok' ? '✓ ' : '✕ '}{msg.text}
        </div>
      )}

      <div style={{ padding: '4px 10px', fontSize: 9, color: 'var(--color-text-muted)', lineHeight: 1.5, borderBottom: '1px solid var(--color-border)' }}>
        ZIP : projet.json · metrage.csv · sommets.csv · plan.dxf · plan.pdf · implantation.txt
      </div>
    </div>
  );
}
