'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { CatalogueData, CatalogueItem } from '@/lib/catalogue-xlsx';
import { uploadCatalogueXlsx } from '@/lib/catalogue-xlsx';
import type { LigneMetrage, Unite } from '@/lib/paysagiste';
import { generateId } from '@/lib/paysagiste';

export interface CataloguePanelProps {
  onAddLigne: (ligne: LigneMetrage) => void;
  lignesMetrage: LigneMetrage[];
  onUpdateLigne: (id: string, updates: Partial<LigneMetrage>) => void;
  onDeleteLigne: (id: string) => void;
  // Si l'item a un geomType → activer le dessin carte
  onSelectForDraw?: (item: import('@/lib/catalogue-xlsx').CatalogueItem) => void;
  activeDrawItemId?: string | null;
  // Catalogue persisté dans page.tsx pour survivre aux changements d'onglet
  externalCatalogueData?: CatalogueData | null;
  onCatalogueDataChange?: (data: CatalogueData | null) => void;
}

const CAT_COLORS: Record<string, string> = {
  Vegetal: '#22c55e', Mineral: '#78716c', Water: '#0ea5e9',
  Structures: '#8b5cf6', Bois: '#a16207', Reseaux: '#f59e0b', Maconnerie: '#9ca3af',
};
const CAT_ICONS: Record<string, string> = {
  Vegetal: '🌿', Mineral: '🪨', Water: '💧',
  Structures: '🏗', Bois: '🪵', Reseaux: '⚙', Maconnerie: '🧱',
};
const col = (cat: string) => CAT_COLORS[cat] ?? '#6b7280';
const ico = (cat: string) => CAT_ICONS[cat] ?? '📦';
const unite0 = (cat: string): Unite =>
  ['Vegetal', 'Water', 'Structures'].includes(cat) ? 'u' : cat === 'Reseaux' ? 'ml' : 'm²';

export default function CataloguePanel({ onAddLigne, lignesMetrage, onUpdateLigne, onDeleteLigne, onSelectForDraw, activeDrawItemId, externalCatalogueData, onCatalogueDataChange }: CataloguePanelProps) {
  // État interne initialisé depuis la prop externe (persistance entre onglets)
  const [catalogue, setCatalogueInternal] = useState<CatalogueData | null>(externalCatalogueData ?? null);

  // Synchroniser avec l'état externe (si page.tsx a déjà un catalogue chargé)
  useEffect(() => {
    if (externalCatalogueData !== undefined && externalCatalogueData !== catalogue) {
      setCatalogueInternal(externalCatalogueData);
      if (externalCatalogueData && !activeSheet) {
        setActiveSheet(externalCatalogueData.sheets[0]?.name ?? null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalCatalogueData]);

  // Wrapper setCatalogue qui notifie aussi page.tsx
  const setCatalogue = useCallback((data: CatalogueData | null) => {
    setCatalogueInternal(data);
    onCatalogueDataChange?.(data);
  }, [onCatalogueDataChange]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<CatalogueItem | null>(null);
  const [showPanier, setShowPanier] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const panierLignes = useMemo(
    () => lignesMetrage.filter((l) => l.elementId.startsWith('xlsx-')),
    [lignesMetrage]
  );

  const loadFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setError('Utilisez un fichier .xlsx'); return; }
    setLoading(true); setError(null);
    try {
      const data = await uploadCatalogueXlsx(file);
      if (!data.sheets.length) { setError('Aucune donnée. Colonnes attendues : id · name · price · icon · description · tags'); return; }
      setCatalogue(data); setActiveSheet(data.sheets[0]?.name ?? null); setSearch(''); setSelectedItem(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fichier invalide');
    } finally { setLoading(false); }
  }, []);

  const handleAddItem = useCallback((item: CatalogueItem, quantite: number, unite: Unite, note: string) => {
    onAddLigne({
      id: generateId(), elementId: `xlsx-${item.id}`, nom: item.name,
      categorie: item.categorie, unite, quantite, quantiteManuelle: quantite,
      label: note.trim() || undefined, geomType: 'Point',
      color: col(item.categorie), createdAt: Date.now(),
    });
    setSelectedItem(null);
  }, [onAddLigne]);

  const currentSheet = catalogue?.sheets.find((s) => s.name === activeSheet);
  const filteredItems = useMemo(() => {
    if (!currentSheet) return [];
    const q = search.toLowerCase().trim();
    if (!q) return currentSheet.items;
    return currentSheet.items.filter((it) =>
      it.name.toLowerCase().includes(q) ||
      it.description.toLowerCase().includes(q) ||
      it.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [currentSheet, search]);

  // ── Dropzone ────────────────────────────────────────────────────────────────
  if (!catalogue) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)' }}>
          Catalogue professionnel
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#22c55e' : 'var(--color-border)'}`,
            borderRadius: 12, padding: '28px 14px', textAlign: 'center',
            cursor: 'pointer', background: dragging ? 'rgba(34,197,94,0.05)' : 'var(--color-surface-2)',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: 30, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>
            Glisser votre catalogue .xlsx
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>ou cliquer pour parcourir</div>
          <div style={{ marginTop: 10, fontSize: 10, color: 'var(--color-text-muted)', opacity: 0.6, lineHeight: 1.5 }}>
            Colonnes : id · name · price · icon · description · tags<br />Un onglet = une catégorie
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }}
          style={{ display: 'none' }} />
        {loading && <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)' }}>⟳ Lecture…</div>}
        {error && <div style={{ padding: '9px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 11, color: '#ef4444', lineHeight: 1.5 }}>{error}</div>}
      </div>
    );
  }

  // ── Vue panier ──────────────────────────────────────────────────────────────
  if (showPanier) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={() => setShowPanier(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>←</button>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>Sélection ({panierLignes.length})</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {panierLignes.length === 0
            ? <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-muted)', fontSize: 12 }}><div style={{ fontSize: 28, marginBottom: 8 }}>🧺</div>Aucun élément.</div>
            : panierLignes.map((l) => <PanierCard key={l.id} ligne={l} onUpdate={(u) => onUpdateLigne(l.id, u)} onDelete={() => onDeleteLigne(l.id)} />)
          }
        </div>
      </div>
    );
  }

  // ── Vue catalogue ───────────────────────────────────────────────────────────
  const catColor = col(activeSheet ?? '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, background: 'var(--color-surface)' }}>
        <span style={{ flex: 1, fontSize: 10, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          📂 {catalogue.fileName}
        </span>
        <button onClick={() => setShowPanier(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: '1px solid var(--color-border)', background: panierLignes.length > 0 ? 'rgba(34,197,94,0.1)' : 'transparent', color: panierLignes.length > 0 ? '#22c55e' : 'var(--color-text-muted)' }}>
          🧺 {panierLignes.length}
        </button>
        <button onClick={() => { setCatalogue(null); setActiveSheet(null); setSearch(''); setSelectedItem(null); }} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '3px 7px', fontSize: 10, cursor: 'pointer', color: 'var(--color-text-muted)' }}>↺</button>
      </div>

      {/* Corps : onglets gauche + liste droite */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Colonne onglets — fixe, scrollable si nécessaire */}
        <div style={{ width: 64, flexShrink: 0, borderRight: '1px solid var(--color-border)', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', scrollbarWidth: 'none' }}>
          {catalogue.sheets.map((sh) => {
            const active = activeSheet === sh.name;
            const c = col(sh.name);
            return (
              <button
                key={sh.name}
                onClick={() => { setActiveSheet(sh.name); setSearch(''); setSelectedItem(null); }}
                title={`${sh.name} (${sh.items.length})`}
                style={{
                  width: '100%', padding: '10px 4px', border: 'none',
                  borderRight: `3px solid ${active ? c : 'transparent'}`,
                  background: active ? `${c}14` : 'transparent',
                  cursor: 'pointer', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  transition: 'all 0.12s', flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 18 }}>{ico(sh.name)}</span>
                <span style={{ fontSize: 8, fontWeight: active ? 700 : 400, lineHeight: 1.2, color: active ? c : 'var(--color-text-muted)', wordBreak: 'break-all' }}>
                  {sh.name}
                </span>
                <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: active ? c : 'var(--color-text-muted)', opacity: 0.7 }}>
                  {sh.items.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Colonne liste — flex, scroll sur la liste uniquement */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Recherche — fixe */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--color-text-muted)', pointerEvents: 'none' }}>⌕</span>
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedItem(null); }}
                placeholder={`${currentSheet?.items.length ?? 0} éléments…`}
                style={{ width: '100%', paddingLeft: 22, paddingRight: search ? 22 : 6, paddingTop: 5, paddingBottom: 5, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 11, color: 'var(--color-text)', outline: 'none' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
              )}
            </div>
          </div>

          {/* Liste items — SCROLLABLE */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {filteredItems.length === 0
              ? <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted)' }}>{search ? `Aucun résultat pour « ${search} »` : 'Onglet vide'}</div>
              : filteredItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  catColor={catColor}
                  isSelected={selectedItem?.id === item.id}
                  onSelect={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                />
              ))
            }
          </div>
        </div>
      </div>

      {/* Formulaire ajout — fixe bas, affiché si item sélectionné */}
      {selectedItem && (
        <AddForm
          item={selectedItem}
          catColor={catColor}
          defaultUnite={unite0(selectedItem.categorie)}
          onAdd={handleAddItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}

// ─── Ligne item ───────────────────────────────────────────────────────────────

function ItemRow({ item, catColor, isSelected, onSelect }: {
  item: CatalogueItem; catColor: string; isSelected: boolean; onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '7px 9px', borderBottom: '1px solid var(--color-border)',
        background: isSelected ? `${catColor}10` : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
        transition: 'background 0.1s',
        borderLeft: `3px solid ${isSelected ? catColor : 'transparent'}`,
      }}
    >
      <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1 }}>{item.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: isSelected ? 600 : 400, color: isSelected ? catColor : 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </div>
        {item.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 3, marginTop: 2, flexWrap: 'wrap' }}>
            {item.tags.slice(0, 2).map((tag) => (
              <span key={tag} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 8, background: `${catColor}15`, color: catColor }}>{tag}</span>
            ))}
          </div>
        )}
      </div>
      {item.price > 0 && (
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, color: catColor, flexShrink: 0 }}>{item.price} €</span>
      )}
    </div>
  );
}

// ─── Formulaire ajout (bas fixe) ─────────────────────────────────────────────

function AddForm({ item, catColor, defaultUnite, onAdd, onClose, onSelectForDraw, activeDrawItemId }: {
  item: CatalogueItem; catColor: string; defaultUnite: Unite;
  onAdd: (item: CatalogueItem, qte: number, unite: Unite, note: string) => void;
  onClose: () => void;
  onSelectForDraw?: (item: CatalogueItem) => void;
  activeDrawItemId?: string | null;
}) {
  const [quantite, setQuantite] = useState('1');
  const [unite, setUnite] = useState<Unite>(defaultUnite);
  const [note, setNote] = useState('');
  const UNITES: Unite[] = ['u', 'ml', 'm²', 'm³'];
  const canDraw = !!item.geomType;
  const isDrawing = activeDrawItemId === item.id;

  const doAdd = () => {
    const q = parseFloat(quantite.replace(',', '.')) || 1;
    onAdd(item, q, (item.unite as Unite) ?? unite, note);
    setQuantite('1'); setNote('');
  };

  const geomLabel = item.geomType === 'Point'
    ? '● Cliquer sur la carte pour placer'
    : item.geomType === 'LineString'
    ? '— Tracer · double-clic pour terminer'
    : '▭ Dessiner · double-clic pour fermer';

  return (
    <div style={{ borderTop: `2px solid ${catColor}`, background: 'var(--color-surface)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
      {/* Titre + badge geomType */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{item.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: catColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          {item.description && <div style={{ fontSize: 9, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>}
        </div>
        {canDraw && (
          <span style={{ fontSize: 8, padding: '2px 5px', borderRadius: 8, background: `${catColor}18`, color: catColor, flexShrink: 0, fontWeight: 700 }}>
            {item.geomType === 'Point' ? '●' : item.geomType === 'LineString' ? '—' : '▭'} {item.unite}
          </span>
        )}
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 14, padding: '2px 4px', lineHeight: 1 }}>✕</button>
      </div>

      {canDraw ? (
        <>
          {/* Bouton dessin OU indicateur actif */}
          {isDrawing ? (
            <div style={{ padding: '8px 10px', background: `${catColor}12`, border: `1px solid ${catColor}40`, borderRadius: 7, fontSize: 11, color: catColor, fontWeight: 600, textAlign: 'center', lineHeight: 1.6 }}>
              {geomLabel}
              <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.8 }}>La quantité sera calculée automatiquement · {item.unite}</div>
            </div>
          ) : (
            <button onClick={() => onSelectForDraw?.(item)}
              style={{ padding: '8px', borderRadius: 7, fontSize: 12, fontWeight: 700, border: `2px solid ${catColor}`, background: 'transparent', color: catColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              ✏ Dessiner sur la carte
            </button>
          )}
          {/* Note */}
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif)"
            style={{ width: '100%', padding: '5px 7px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 5, fontSize: 11, color: 'var(--color-text)', outline: 'none' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#22c55e'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
          />
          {/* Saisie manuelle aussi disponible */}
          <div style={{ fontSize: 9, color: 'var(--color-text-muted)', textAlign: 'center' }}>ou saisir manuellement :</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="number" min={0} step={0.01} value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doAdd(); }}
              placeholder="Quantité"
              style={{ flex: 1, padding: '5px 7px', background: 'var(--color-surface-2)', border: `1px solid ${catColor}40`, borderRadius: 5, fontSize: 12, color: 'var(--color-text)', outline: 'none', fontFamily: 'var(--font-mono)' }}
            />
            <button onClick={doAdd} style={{ padding: '5px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700, border: 'none', background: catColor, color: 'white', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              + Manuel
            </button>
          </div>
        </>
      ) : (
        /* Saisie manuelle uniquement */
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: 'var(--color-text-muted)', marginBottom: 2 }}>Quantité</div>
              <input type="number" min={0} step={unite === 'u' ? 1 : 0.01} value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doAdd(); }}
                style={{ width: '100%', padding: '5px 7px', background: 'var(--color-surface-2)', border: `1px solid ${catColor}60`, borderRadius: 5, fontSize: 13, color: 'var(--color-text)', outline: 'none', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'var(--color-text-muted)', marginBottom: 2 }}>Unité</div>
              <select value={unite} onChange={(e) => setUnite(e.target.value as Unite)}
                style={{ padding: '5px 6px', background: 'var(--color-surface-2)', border: `1px solid ${catColor}60`, borderRadius: 5, fontSize: 12, color: 'var(--color-text)', outline: 'none', cursor: 'pointer' }}>
                {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif)"
            onKeyDown={(e) => { if (e.key === 'Enter') doAdd(); }}
            style={{ width: '100%', padding: '5px 7px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 5, fontSize: 11, color: 'var(--color-text)', outline: 'none' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#22c55e'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
          />
          <button onClick={doAdd} style={{ padding: '8px', borderRadius: 7, fontSize: 12, fontWeight: 700, border: 'none', background: catColor, color: 'white', cursor: 'pointer' }}>
            + Ajouter au métré
          </button>
        </>
      )}
    </div>
  );
}

// ─── Carte panier ─────────────────────────────────────────────────────────────

function PanierCard({ ligne, onUpdate, onDelete }: {
  ligne: LigneMetrage;
  onUpdate: (updates: Partial<LigneMetrage>) => void;
  onDelete: () => void;
}) {
  const [noteVal, setNoteVal] = useState(ligne.label ?? '');
  const [qVal, setQVal] = useState(String(ligne.quantiteManuelle ?? ligne.quantite));
  const saveNote = () => { const t = noteVal.trim(); if (t !== (ligne.label ?? '')) onUpdate({ label: t || undefined }); };
  const saveQ = () => { const q = parseFloat(qVal.replace(',', '.')); if (!isNaN(q) && q > 0) onUpdate({ quantiteManuelle: q }); else setQVal(String(ligne.quantiteManuelle ?? ligne.quantite)); };

  return (
    <div style={{ background: 'var(--color-surface-2)', border: `1px solid ${ligne.color}40`, borderRadius: 9, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: `${ligne.color}10`, borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: ligne.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ligne.nom}</div>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{ligne.categorie}</div>
        </div>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13, padding: '2px 6px' }}>✕</button>
      </div>
      <div style={{ padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', width: 48, flexShrink: 0 }}>Quantité</span>
          <input type="number" value={qVal} min={0} step={ligne.unite === 'u' ? 1 : 0.01}
            onChange={(e) => setQVal(e.target.value)} onBlur={saveQ} onKeyDown={(e) => { if (e.key === 'Enter') saveQ(); }}
            style={{ flex: 1, padding: '3px 6px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: ligne.color, background: 'var(--color-surface)', border: `1px solid ${ligne.color}50`, borderRadius: 5, outline: 'none' }}
          />
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{ligne.unite}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', width: 48, flexShrink: 0 }}>Note</span>
          <input type="text" value={noteVal} onChange={(e) => setNoteVal(e.target.value)}
            onBlur={(e) => { saveNote(); e.currentTarget.style.borderColor = 'var(--color-border)'; }}
            onKeyDown={(e) => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setNoteVal(ligne.label ?? ''); }}
            placeholder="Repère… (→ CSV)"
            style={{ flex: 1, padding: '3px 6px', fontSize: 11, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 5, outline: 'none', color: 'var(--color-text)', fontStyle: noteVal ? 'normal' : 'italic' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#22c55e'; }}
          />
        </div>
        {noteVal && <div style={{ fontSize: 9, color: '#22c55e', paddingLeft: 54 }}>✓ inclus dans l'export CSV</div>}
      </div>
    </div>
  );
}
