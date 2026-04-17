'use client';

/**
 * PaysagistePanel.tsx
 *
 * Vue Catalogue  — onglets gauche (catégories) + liste scrollable droite + formulaire fixe bas
 * Vue Métrés     — liste des lignes saisies, édition note + quantité
 * Vue Récap/CSV  — totaux par catégorie + export CSV multi-onglets
 *
 * Layout catalogue identique à CataloguePanel :
 * ┌──────┬──────────────────────────┐
 * │ ⛏   │ ⌕ Filtrer…              │
 * │Terr. ├──────────────────────────│
 * │──────│ • Déblai / Décaissement  │
 * │ 🪨   │ • Remblai / Apport       │  ← liste scrollable
 * │Revêt.│ …                        │
 * │──────│                          │
 * │ 🌿   │                          │
 * │Esp.V.│                          │
 * ├──────┴──────────────────────────┤
 * │ [Formulaire ajout — fixe bas]   │  ← si élément sélectionné
 * └─────────────────────────────────┘
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import ProjetActions from '@/components/map/ProjetActions';
import PlanImplantation from '@/components/map/PlanImplantation';
import type { CatalogueData, CatalogueItem } from '@/lib/catalogue-xlsx';
import {
  CATALOGUE,
  getCategories,
  getCategorieIcone,
  getCategorieColor,
  formatQuantite,
  recapParCategorie,
  type ElementPaysagiste,
  type LigneMetrage,
  type Unite,
} from '@/lib/paysagiste';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaysagistePanelProps {
  lignes: LigneMetrage[];
  activeElement: ElementPaysagiste | null;
  onSelectElement: (el: ElementPaysagiste | null) => void;
  onUpdateLigne: (id: string, updates: Partial<LigneMetrage>) => void;
  onDeleteLigne: (id: string) => void;
  onClearAll: () => void;
  projetNom: string;
  onProjetNomChange: (nom: string) => void;
  onImportProjet: (nom: string, lignes: LigneMetrage[]) => void;
  onNouveauProjet: () => void;
  highlightFeatureId?: string | null;
  onFlashFeature?: (featureId: string) => void;
  // Catalogue xlsx persisté (partagé avec CataloguePanel)
  catalogueData?: CatalogueData | null;
  onSelectCatalogueItem?: (item: CatalogueItem) => void;
}

type View = 'catalogue' | 'metrage' | 'recap' | 'plan';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Retourne les éléments par catégorie sous forme de Map
function getCatElements(): Map<string, ElementPaysagiste[]> {
  const map = new Map<string, ElementPaysagiste[]>();
  for (const el of CATALOGUE) {
    if (!map.has(el.categorie)) map.set(el.categorie, []);
    map.get(el.categorie)!.push(el);
  }
  return map;
}

/** Export CSV multi-onglets : un bloc par catégorie séparé par une ligne vide */
function exportCSVParCategorie(lignes: LigneMetrage[], projetNom: string): string {
  const recap = recapParCategorie(lignes);
  const parts: string[] = [];

  parts.push(`Projet;${projetNom || '—'}`);
  parts.push(`Exporté le;${new Date().toLocaleDateString('fr-FR')}`);
  parts.push('');

  for (const cat of recap) {
    parts.push(`=== ${cat.categorie} ===`);
    parts.push('Élément;Quantité;Unité;Note');
    for (const l of cat.lignes) {
      const q = (l.quantiteManuelle ?? l.quantite).toFixed(3);
      parts.push([`"${l.nom}"`, q, l.unite, `"${l.label ?? ''}"`].join(';'));
    }
    // Totaux de la catégorie
    const totaux = Object.entries(cat.totalParUnite)
      .filter(([, v]) => v > 0)
      .map(([u, v]) => `${v.toFixed(2)} ${u}`)
      .join(' | ');
    parts.push(`TOTAL;;${totaux}`);
    parts.push('');
  }

  return parts.join('\n');
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function PaysagistePanel({
  lignes,
  activeElement,
  onSelectElement,
  onUpdateLigne,
  onDeleteLigne,
  onClearAll,
  projetNom,
  onProjetNomChange,
  onImportProjet,
  onNouveauProjet,
  highlightFeatureId,
  onFlashFeature,
  catalogueData,
  onSelectCatalogueItem,
}: PaysagistePanelProps) {
  const [view, setView] = useState<View>('catalogue');
  const svgRef = useRef<SVGSVGElement>(null);
  const recap = useMemo(() => recapParCategorie(lignes), [lignes]);

  const handleExportCSV = () => {
    const csv = exportCSVParCategorie(lignes, projetNom);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(projetNom || 'projet').replace(/\s/g, '_')}_metrage.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minHeight: 0 }}>

      {/* ── En-tête projet ── */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <input
          type="text"
          value={projetNom}
          onChange={(e) => onProjetNomChange(e.target.value)}
          placeholder="Nom du projet…"
          style={{
            width: '100%', background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)', borderRadius: 6,
            padding: '5px 9px', fontSize: 12, color: 'var(--color-text)', outline: 'none',
          }}
        />
      </div>

      {/* ── Actions projet : Sauvegarder / Ouvrir ZIP ── */}
      <ProjetActions
        projetNom={projetNom}
        lignesMetrage={lignes}
        svgRef={svgRef}
        onImport={onImportProjet}
        onNouveauProjet={onNouveauProjet}
      />

      {/* ── Tabs : Éléments / Métrés / Récap ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        {([
          { key: 'catalogue', label: 'Éléments', icon: '◫' },
          { key: 'metrage',   label: `Métrés (${lignes.length})`, icon: '📋' },
          { key: 'recap',     label: 'Récap CSV', icon: '📊' },
          { key: 'plan',     label: 'Plan',      icon: '📐' },
        ] as { key: View; label: string; icon: string }[]).map((tab) => (
          <button key={tab.key} onClick={() => setView(tab.key)}
            style={{
              flex: 1, padding: '6px 4px', fontSize: 9, fontWeight: view === tab.key ? 700 : 400,
              cursor: 'pointer', border: 'none',
              borderBottom: `2px solid ${view === tab.key ? '#22c55e' : 'transparent'}`,
              background: 'transparent',
              color: view === tab.key ? '#22c55e' : 'var(--color-text-muted)',
              transition: 'all 0.15s', textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 13, marginBottom: 1 }}>{tab.icon}</div>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Corps — wrapper contraint obligatoire pour le scroll ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {view === 'catalogue' && (
          <CatalogueView activeElement={activeElement} onSelectElement={onSelectElement} catalogueData={catalogueData} onSelectCatalogueItem={onSelectCatalogueItem} />
        )}
        {view === 'metrage' && (
          <MetrageView
            lignes={lignes}
            onUpdateLigne={onUpdateLigne}
            onDeleteLigne={onDeleteLigne}
            onClearAll={onClearAll}
            highlightFeatureId={highlightFeatureId}
            onFlashFeature={onFlashFeature}
          />
        )}
        {view === 'plan' && (
          <PlanImplantation lignes={lignes} projetNom={projetNom} svgRef={svgRef} />
        )}
        {view === 'recap' && (
          <RecapView
            recap={recap}
            lignes={lignes}
            projetNom={projetNom}
            onExport={handleExportCSV}
          />
        )}
      </div>
    </div>
  );
}

// ─── Vue Catalogue — onglets gauche + liste scrollable droite ─────────────────
// Affiche en tête les catégories du catalogue xlsx chargé, puis le catalogue interne

const XLSX_CAT_COLORS: Record<string, string> = {
  Vegetal: '#22c55e', Mineral: '#78716c', Water: '#0ea5e9',
  Structures: '#8b5cf6', Bois: '#a16207', Reseaux: '#f59e0b', Maconnerie: '#9ca3af',
};
const XLSX_CAT_ICONS: Record<string, string> = {
  Vegetal: '🌿', Mineral: '🪨', Water: '💧',
  Structures: '🏗', Bois: '🪵', Reseaux: '⚙', Maconnerie: '🧱',
};

function CatalogueView({
  activeElement,
  onSelectElement,
  catalogueData,
  onSelectCatalogueItem,
}: {
  activeElement: ElementPaysagiste | null;
  onSelectElement: (el: ElementPaysagiste | null) => void;
  catalogueData?: CatalogueData | null;
  onSelectCatalogueItem?: (item: CatalogueItem) => void;
}) {
  const internalCategories = getCategories();
  const catElements = useMemo(() => getCatElements(), []);

  // Catégories xlsx en tête, puis catégories internes
  const xlshSheets = catalogueData?.sheets ?? [];
  const allCats: Array<{ id: string; label: string; color: string; icon: string; isXlsx: boolean }> = [
    ...xlshSheets.map((s) => ({
      id: `xlsx:${s.name}`,
      label: s.name,
      color: XLSX_CAT_COLORS[s.name] ?? '#6b7280',
      icon: XLSX_CAT_ICONS[s.name] ?? '📦',
      isXlsx: true,
    })),
    ...internalCategories.map((cat) => ({
      id: `int:${cat}`,
      label: cat,
      color: getCategorieColor(cat),
      icon: getCategorieIcone(cat),
      isXlsx: false,
    })),
  ];

  const [activeCatId, setActiveCatId] = useState<string>(allCats[0]?.id ?? '');

  // Recaler activeCatId si allCats change (ex: import projet ou chargement catalogue xlsx)
  useEffect(() => {
    if (allCats.length > 0 && !allCats.find((c) => c.id === activeCatId)) {
      setActiveCatId(allCats[0].id);
    }
  }, [allCats.map((c) => c.id).join(',')]);
  const [search, setSearch] = useState('');
  const [selectedEl, setSelectedEl] = useState<ElementPaysagiste | null>(activeElement);

  // Si le catalogue xlsx change et l'onglet actif est un onglet interne, repasser au 1er
  useMemo(() => {
    if (xlshSheets.length > 0 && !activeCatId.startsWith('xlsx:')) {
      // Ne pas forcer — laisser l'utilisateur naviguer librement
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xlshSheets.length]);

  const activeCat = allCats.find((c) => c.id === activeCatId) ?? allCats[0];

  // Éléments de la catégorie active
  const items: Array<{ isXlsx: boolean; el?: ElementPaysagiste; item?: CatalogueItem }> = useMemo(() => {
    if (!activeCat) return [];
    if (activeCat.isXlsx) {
      const sheet = xlshSheets.find((s) => s.name === activeCat.label);
      return (sheet?.items ?? []).map((item) => ({ isXlsx: true, item }));
    }
    return (catElements.get(activeCat.label) ?? []).map((el) => ({ isXlsx: false, el }));
  }, [activeCat, xlshSheets, catElements]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter(({ el, item }) => {
      if (el) return el.nom.toLowerCase().includes(q) || el.description.toLowerCase().includes(q);
      if (item) return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.tags.some((t) => t.toLowerCase().includes(q));
      return false;
    });
  }, [items, search]);

  const handleSelect = (el: ElementPaysagiste) => {
    if (selectedEl?.id === el.id) {
      setSelectedEl(null);
      onSelectElement(null);
    } else {
      setSelectedEl(el);
      onSelectElement(el);
    }
  };

  const handleSelectXlsx = (item: CatalogueItem) => {
    if (!item.geomType) return; // pas de géométrie → pas de dessin
    onSelectCatalogueItem?.(item);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

      {/* Indicateur outil actif */}
      {activeElement && (
        <div style={{
          padding: '6px 10px', flexShrink: 0,
          background: `${activeElement.color}14`,
          borderBottom: `1px solid ${activeElement.color}40`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>{activeElement.icone}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: activeElement.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeElement.nom}
            </div>
            <div style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>
              {activeElement.geomType === 'Point' ? 'Cliquer sur la carte'
                : activeElement.geomType === 'LineString' ? 'Tracer — dbl-clic pour finir'
                : 'Dessiner — dbl-clic pour fermer'} · {activeElement.unite}
            </div>
          </div>
          <button onClick={() => { onSelectElement(null); setSelectedEl(null); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 13, padding: '2px 4px', lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* Corps : onglets gauche + liste droite */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Colonne onglets — 64px, scrollable — xlsx en tête, internes dessous */}
        <div style={{
          width: 64, flexShrink: 0,
          borderRight: '1px solid var(--color-border)',
          overflowY: 'auto', overflowX: 'hidden',
          display: 'flex', flexDirection: 'column',
          scrollbarWidth: 'none',
        }}>
          {/* Séparateur xlsx si présent */}
          {xlshSheets.length > 0 && (
            <div style={{ fontSize: 7, color: 'var(--color-text-muted)', textAlign: 'center', padding: '4px 2px 2px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-2)', flexShrink: 0 }}>
              xlsx
            </div>
          )}
          {allCats.map((cat, idx) => {
            const active = (activeCatId ?? allCats[0]?.id) === cat.id;
            const isFirstInternal = !cat.isXlsx && (idx === 0 || allCats[idx - 1].isXlsx);
            return (
              <div key={cat.id}>
                {isFirstInternal && xlshSheets.length > 0 && (
                  <div style={{ fontSize: 7, color: 'var(--color-text-muted)', textAlign: 'center', padding: '4px 2px 2px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
                    interne
                  </div>
                )}
                <button
                  onClick={() => { setActiveCatId(cat.id); setSearch(''); }}
                  title={cat.label}
                  style={{
                    width: '100%', padding: '9px 3px', border: 'none',
                    borderRight: `3px solid ${active ? cat.color : 'transparent'}`,
                    background: active ? `${cat.color}14` : 'transparent',
                    cursor: 'pointer', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    transition: 'all 0.12s', flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{cat.icon}</span>
                  <span style={{ fontSize: 8, fontWeight: active ? 700 : 400, lineHeight: 1.2, color: active ? cat.color : 'var(--color-text-muted)', wordBreak: 'break-all', maxWidth: 56 }}>
                    {cat.label}
                  </span>
                  <span style={{ fontSize: 7, color: active ? cat.color : 'var(--color-text-muted)', opacity: 0.7, fontFamily: 'var(--font-mono)' }}>
                    {cat.isXlsx
                      ? (xlshSheets.find((s) => s.name === cat.label)?.items.length ?? 0)
                      : (catElements.get(cat.label)?.length ?? 0)
                    }
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Colonne droite : search + liste scrollable */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Barre recherche — fixe */}
          <div style={{ padding: '6px 7px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--color-text-muted)', pointerEvents: 'none' }}>⌕</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`${items.length} éléments…`}
                style={{
                  width: '100%', paddingLeft: 22, paddingRight: search ? 22 : 6,
                  paddingTop: 5, paddingBottom: 5,
                  background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                  borderRadius: 6, fontSize: 11, color: 'var(--color-text)', outline: 'none',
                }}
              />
              {search && (
                <button onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
              )}
            </div>
          </div>

          {/* Liste items — scrollable */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {filtered.length === 0
              ? <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {search ? `Aucun résultat pour « ${search} »` : 'Catégorie vide'}
                </div>
              : filtered.map(({ isXlsx, el, item }, idx) => {
                  if (isXlsx && item) {
                    // Élément xlsx
                    const c = XLSX_CAT_COLORS[item.categorie] ?? '#6b7280';
                    const canDraw = !!item.geomType;
                    const isActiveDraw = activeElement?.id === `xlsx-${item.id}`;
                    return (
                      <div key={`xlsx-${item.id}`}
                        onClick={() => canDraw && handleSelectXlsx(item)}
                        style={{
                          padding: '7px 9px',
                          borderBottom: '1px solid var(--color-border)',
                          borderLeft: `3px solid ${isActiveDraw ? c : 'transparent'}`,
                          background: isActiveDraw ? `${c}10` : 'transparent',
                          cursor: canDraw ? 'pointer' : 'default',
                          display: 'flex', alignItems: 'center', gap: 7,
                        }}
                      >
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: isActiveDraw ? 700 : 400, color: isActiveDraw ? c : 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--color-text-muted)', display: 'flex', gap: 4, marginTop: 1 }}>
                            {canDraw && (
                              <span style={{ background: `${c}20`, color: c, padding: '1px 4px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                                {item.geomType === 'Point' ? '●' : item.geomType === 'LineString' ? '—' : '▭'} {item.unite}
                              </span>
                            )}
                            {!canDraw && <span style={{ opacity: 0.5 }}>saisie manuelle</span>}
                          </div>
                        </div>
                        {isActiveDraw && <span style={{ fontSize: 9, color: c, fontWeight: 700 }}>✓</span>}
                      </div>
                    );
                  }
                  // Élément interne
                  if (!el) return null;
                  const isSelected = selectedEl?.id === el.id;
                  const c = el.color;
                  return (
                    <div key={el.id} onClick={() => handleSelect(el)}
                      style={{
                        padding: '7px 9px', borderBottom: '1px solid var(--color-border)',
                        borderLeft: `3px solid ${isSelected ? c : 'transparent'}`,
                        background: isSelected ? `${c}10` : 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'background 0.1s',
                      }}
                    >
                      <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{el.icone}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: isSelected ? 700 : 400, color: isSelected ? c : 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.nom}</div>
                        <div style={{ fontSize: 9, color: 'var(--color-text-muted)', display: 'flex', gap: 4, marginTop: 1, alignItems: 'center' }}>
                          <span style={{ background: `${c}20`, color: c, padding: '1px 4px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                            {el.geomType === 'Point' ? '●' : el.geomType === 'LineString' ? '—' : '▭'}
                          </span>
                          <span>{el.unite}</span>
                        </div>
                      </div>
                      {isSelected && <span style={{ fontSize: 9, color: c, fontWeight: 700, flexShrink: 0 }}>✓</span>}
                    </div>
                  );
                })
            }
          </div>
        </div>
      </div>

      {/* Formulaire info élément sélectionné — fixe bas */}
      {selectedEl && (
        <div style={{
          borderTop: `2px solid ${selectedEl.color}`,
          background: 'var(--color-surface)',
          padding: '9px 12px',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 18 }}>{selectedEl.icone}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: selectedEl.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedEl.nom}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedEl.description}
              </div>
            </div>
          </div>
          <div style={{
            fontSize: 11, padding: '6px 10px',
            background: `${selectedEl.color}10`,
            border: `1px solid ${selectedEl.color}30`,
            borderRadius: 6, color: selectedEl.color, lineHeight: 1.5,
          }}>
            {selectedEl.geomType === 'Point'
              ? '● Cliquez sur la carte pour placer l\'élément'
              : selectedEl.geomType === 'LineString'
              ? '— Tracez sur la carte · double-clic pour terminer'
              : '▭ Dessinez le polygone · double-clic pour fermer'}
            {' '}· <strong>{selectedEl.unite}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vue Métrés ───────────────────────────────────────────────────────────────

function MetrageView({
  lignes,
  onUpdateLigne,
  onDeleteLigne,
  onClearAll,
  highlightFeatureId,
  onFlashFeature,
}: {
  lignes: LigneMetrage[];
  onUpdateLigne: (id: string, updates: Partial<LigneMetrage>) => void;
  onDeleteLigne: (id: string) => void;
  onClearAll: () => void;
  highlightFeatureId?: string | null;
  onFlashFeature?: (featureId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroller automatiquement vers l'élément highlighté
  useEffect(() => {
    if (!highlightFeatureId) return;
    const el = itemRefs.current[highlightFeatureId];
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightFeatureId]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Liste scrollable */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {lignes.length === 0
          ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-muted)', fontSize: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              Aucun métré saisi.<br />
              <span style={{ fontSize: 11 }}>Sélectionnez un élément dans l'onglet Éléments et dessinez sur la carte.</span>
            </div>
          )
          : lignes.map((l) => (
            <div key={l.id} ref={(el) => { itemRefs.current[l.featureId ?? l.id] = el; }} onClick={() => l.featureId && onFlashFeature?.(l.featureId)} style={{ cursor: l.featureId ? 'pointer' : 'default' }}>
              <LigneMetrageCard
                ligne={l}
                onUpdate={(u) => onUpdateLigne(l.id, u)}
                onDelete={() => onDeleteLigne(l.id)}
                highlighted={!!l.featureId && l.featureId === highlightFeatureId}
              />
            </div>
          ))
        }
      </div>
      {/* Footer */}
      {lignes.length > 0 && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={() => { if (confirm('Effacer tous les métrés ?')) onClearAll(); }}
            style={{ padding: '6px 12px', borderRadius: 7, fontSize: 11, cursor: 'pointer', border: '1px solid var(--color-border)', background: 'transparent', color: '#ef4444' }}
          >✕ Tout effacer</button>
        </div>
      )}
    </div>
  );
}

// ─── Vue Récap + Export CSV ───────────────────────────────────────────────────

function RecapView({
  recap,
  lignes,
  projetNom,
  onExport,
}: {
  recap: ReturnType<typeof recapParCategorie>;
  lignes: LigneMetrage[];
  projetNom: string;
  onExport: () => void;
}) {
  const totalM2 = lignes.filter((l) => l.unite === 'm²').reduce((s, l) => s + (l.quantiteManuelle ?? l.quantite), 0);
  const totalMl = lignes.filter((l) => l.unite === 'ml').reduce((s, l) => s + (l.quantiteManuelle ?? l.quantite), 0);
  const totalU  = lignes.filter((l) => l.unite === 'u').reduce((s, l) => s + (l.quantiteManuelle ?? l.quantite), 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Synthèse globale */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: 6 }}>
          {projetNom || 'Projet sans nom'} — {lignes.length} élément{lignes.length > 1 ? 's' : ''}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {[
            { label: 'm²', val: totalM2.toFixed(1) },
            { label: 'ml', val: totalMl.toFixed(1) },
            { label: 'u',  val: Math.round(totalU).toString() },
          ].map(({ label, val }) => (
            <div key={label} style={{ background: 'var(--color-surface-2)', borderRadius: 7, padding: '5px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', fontFamily: 'var(--font-mono)' }}>{val}</div>
              <div style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 1 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Détail par catégorie — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recap.length === 0
          ? <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-muted)', fontSize: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
              Aucun métré à récapituler.
            </div>
          : recap.map((cat) => (
            <div key={cat.categorie} style={{ border: '1px solid var(--color-border)', borderRadius: 9, overflow: 'hidden' }}>
              {/* Header catégorie */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: `${cat.color}10`, borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 14 }}>{cat.icone}</span>
                <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: cat.color }}>{cat.categorie}</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>{cat.lignes.length} élément{cat.lignes.length > 1 ? 's' : ''}</span>
              </div>
              {/* Totaux */}
              <div style={{ padding: '5px 10px 4px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.entries(cat.totalParUnite) as [Unite, number][])
                  .filter(([, v]) => v > 0)
                  .map(([u, total]) => (
                    <span key={u} style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: cat.color, background: `${cat.color}12`, padding: '2px 7px', borderRadius: 20 }}>
                      {formatQuantite(total, u)}
                    </span>
                  ))}
              </div>
              {/* Lignes détail */}
              <div style={{ padding: '3px 10px 7px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {cat.lignes.map((l) => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nom}</span>
                    {l.label && <span style={{ fontSize: 9, color: 'var(--color-text-muted)', fontStyle: 'italic', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.label}>"{l.label}"</span>}
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)', flexShrink: 0 }}>
                      {formatQuantite(l.quantiteManuelle ?? l.quantite, l.unite)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        }
      </div>

      {/* Bouton export */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
        <button
          onClick={onExport}
          disabled={lignes.length === 0}
          style={{
            width: '100%', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: lignes.length === 0 ? 'not-allowed' : 'pointer',
            border: 'none',
            background: lignes.length === 0 ? 'var(--color-surface-2)' : '#22c55e',
            color: lignes.length === 0 ? 'var(--color-text-muted)' : 'white',
            opacity: lignes.length === 0 ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          ↓ Exporter CSV par catégorie
        </button>
        <div style={{ fontSize: 9, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 4 }}>
          Un bloc par catégorie · BOM UTF-8 · compatible Excel
        </div>
      </div>
    </div>
  );
}

// ─── Carte d'une ligne de métré ───────────────────────────────────────────────

function LigneMetrageCard({
  ligne,
  onUpdate,
  onDelete,
  highlighted = false,
}: {
  ligne: LigneMetrage;
  onUpdate: (updates: Partial<LigneMetrage>) => void;
  onDelete: () => void;
  highlighted?: boolean;
}) {
  const [labelVal, setLabelVal] = useState(ligne.label ?? '');
  const [qManuelle, setQManuelle] = useState(
    ligne.quantiteManuelle !== undefined ? String(ligne.quantiteManuelle) : ''
  );
  const [qEditing, setQEditing] = useState(false);

  const displayQ = ligne.quantiteManuelle !== undefined ? ligne.quantiteManuelle : ligne.quantite;
  const hasOverride = ligne.quantiteManuelle !== undefined;

  const saveLabel = () => {
    const t = labelVal.trim();
    if (t !== (ligne.label ?? '')) onUpdate({ label: t || undefined });
  };

  const saveQuantite = () => {
    if (qManuelle === '') {
      onUpdate({ quantiteManuelle: undefined });
    } else {
      const qm = parseFloat(qManuelle);
      if (!isNaN(qm) && qm > 0) onUpdate({ quantiteManuelle: qm });
      else setQManuelle(ligne.quantiteManuelle !== undefined ? String(ligne.quantiteManuelle) : '');
    }
    setQEditing(false);
  };

  return (
    <div style={{
      background: highlighted ? `${ligne.color}14` : 'var(--color-surface-2)',
      border: `2px solid ${highlighted ? ligne.color : ligne.color + '40'}`,
      borderRadius: 8, overflow: 'hidden',
      transition: 'border-color 0.2s, background 0.2s',
      boxShadow: highlighted ? `0 0 0 2px ${ligne.color}30` : 'none',
    }}>
      {/* Ligne unique : couleur + nom + quantité + ✕ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--color-border)', background: `${ligne.color}10` }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: ligne.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ligne.nom}</div>
          <div style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 1 }}>{ligne.categorie} · {ligne.geomType === 'Point' ? '●' : ligne.geomType === 'LineString' ? '—' : '▭'}</div>
        </div>
        {/* Quantité inline cliquable */}
        {qEditing ? (
          <input autoFocus type="number" min={0} step={ligne.unite === 'u' ? 1 : 0.01}
            value={qManuelle}
            onChange={(e) => setQManuelle(e.target.value)}
            onBlur={saveQuantite}
            onKeyDown={(e) => { if (e.key === 'Enter') saveQuantite(); if (e.key === 'Escape') { setQManuelle(''); setQEditing(false); } }}
            style={{ width: 64, padding: '2px 5px', background: 'var(--color-surface)', border: `1px solid ${ligne.color}80`, borderRadius: 5, fontSize: 12, color: 'var(--color-text)', outline: 'none', fontFamily: 'var(--font-mono)', textAlign: 'right' }}
          />
        ) : (
          <button
            onClick={() => { setQManuelle(hasOverride ? String(ligne.quantiteManuelle) : ''); setQEditing(true); }}
            title="Cliquer pour modifier la quantité"
            style={{ padding: '2px 6px', background: 'none', border: `1px solid ${hasOverride ? ligne.color + '60' : 'var(--color-border)'}`, borderRadius: 5, fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: hasOverride ? ligne.color : 'var(--color-text)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}
          >
            {formatQuantite(displayQ, ligne.unite)}
            {hasOverride && <span style={{ fontSize: 8, opacity: 0.7 }}>✎</span>}
          </button>
        )}
        {hasOverride && !qEditing && (
          <button onClick={() => { setQManuelle(''); onUpdate({ quantiteManuelle: undefined }); }}
            title="Rétablir la quantité calculée"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 11, padding: '0 2px' }}>↩</button>
        )}
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, padding: '0 3px', lineHeight: 1, flexShrink: 0 }}>✕</button>
      </div>
      {/* Note CSV — compacte sur 1 ligne */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px' }}>
        <span style={{ fontSize: 9, color: 'var(--color-text-muted)', flexShrink: 0 }}>Note</span>
        <input
          type="text" value={labelVal}
          onChange={(e) => setLabelVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setLabelVal(ligne.label ?? ''); e.currentTarget.blur(); } }}
          placeholder="Repère CSV…"
          style={{ flex: 1, padding: '2px 5px', fontSize: 10, background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 4, outline: 'none', color: 'var(--color-text)' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#22c55e'; }}
          onBlur={(e) => { saveLabel(); e.currentTarget.style.borderColor = 'var(--color-border)'; }}
        />
        {labelVal && <span style={{ fontSize: 9, color: '#22c55e', flexShrink: 0 }}>✓</span>}
      </div>
    </div>
  );
}
