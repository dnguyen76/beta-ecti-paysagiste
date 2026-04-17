'use client';

import type { LineString as GeoJSONLineString } from 'geojson';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { IGNLayer } from '@/lib/ign-layers';
import {
  geocodeAddress,
  getElevation,
  calculateRoute,
  reverseGeocode,
  formatDistance,
  formatDuration,
  type GeocodeResult,
  type RouteResult,
} from '@/lib/gpf-api';
import type { MeasureMode, MeasureResult } from '@/lib/measure';
import PaysagistePanel from '@/components/map/PaysagistePanel';
import CataloguePanel from '@/components/map/CataloguePanel';
import type { ElementPaysagiste, LigneMetrage } from '@/lib/paysagiste';
import { getMapScale } from '@/lib/measure';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  layers: IGNLayer[];
  opacities: Record<string, number>;
  onLayerToggle: (id: string) => void;
  onOpacityChange: (id: string, value: number) => void;
  onGeocode: (lon: number, lat: number) => void;
  onRoute: (geometry: GeoJSONLineString) => void;
  clickedCoords: { lon: number; lat: number } | null;
  measureMode: MeasureMode;
  onMeasureModeChange: (mode: MeasureMode) => void;
  measureResult: MeasureResult | null;
  currentZoom: number;
  // Paysagiste
  activeElement: ElementPaysagiste | null;
  onSelectElement: (el: ElementPaysagiste | null) => void;
  lignesMetrage: LigneMetrage[];
  onUpdateLigne: (id: string, updates: Partial<LigneMetrage>) => void;
  onDeleteLigne: (id: string) => void;
  onClearAll: () => void;
  projetNom: string;
  onProjetNomChange: (nom: string) => void;
  onImportProjet: (nom: string, lignes: import('@/lib/paysagiste').LigneMetrage[]) => void;
  onNouveauProjet: () => void;
  highlightFeatureId?: string | null;
  onFlashFeature?: (featureId: string) => void;
  // Catalogue xlsx
  onAddLigneCatalogue: (ligne: import('@/lib/paysagiste').LigneMetrage) => void;
  onSelectCatalogueForDraw?: (item: import('@/lib/catalogue-xlsx').CatalogueItem) => void;
  activeCatalogueDrawItemId?: string | null;
  catalogueData?: import('@/lib/catalogue-xlsx').CatalogueData | null;
  onCatalogueDataChange?: (data: import('@/lib/catalogue-xlsx').CatalogueData | null) => void;
  onDesignationMode?: () => void;  // sortir du mode dessin -> mode sélection
  onShowMnt3D?: (bbox: [number,number,number,number]) => void;
}

type ActiveTool = 'layers' | 'search' | 'elevation' | 'route' | 'measure' | 'paysagiste' | 'catalogue' | 'designation';

// ─── Composant ────────────────────────────────────────────────────────────────

export default function Sidebar({
  layers,
  opacities,
  onLayerToggle,
  onOpacityChange,
  onGeocode,
  onRoute,
  clickedCoords,
  measureMode,
  onMeasureModeChange,
  measureResult,
  currentZoom,
  activeElement,
  onSelectElement,
  lignesMetrage,
  onUpdateLigne,
  onDeleteLigne,
  onClearAll,
  projetNom,
  onProjetNomChange,
  onImportProjet,
  onNouveauProjet,
  highlightFeatureId,
  onFlashFeature,
  onAddLigneCatalogue,
  onSelectCatalogueForDraw,
  activeCatalogueDrawItemId,
  catalogueData,
  onCatalogueDataChange,
  onDesignationMode,
  onShowMnt3D,
}: SidebarProps) {
  const [activeTool, setActiveTool] = useState<ActiveTool>('layers');

  return (
    <aside className="sidebar">
      {/* En-tête */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🗺</div>
          <span className="sidebar-logo-text">ECTI Paysagiste 0.5</span>
        </div>
        <div className="sidebar-subtitle">Géoplateforme · OpenLayers · Next.js</div>
      </div>

      {/* Navigation onglets — 2 rangées de 4 pour éviter le débordement */}
      <div style={{ padding: '6px 10px 0', display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
        {(
          [
            { key: 'layers',     label: 'Couches',    icon: '⊞' },
            { key: 'search',     label: 'Recherche',  icon: '⌕' },
            { key: 'elevation',  label: 'Altitude',   icon: '△' },
            { key: 'route',      label: 'Itinéraire', icon: '⟶' },
            { key: 'measure',    label: 'Mesure',     icon: '◫' },
            { key: 'paysagiste', label: 'Paysage',    icon: '🌿' },
            { key: 'catalogue',  label: 'Catalogue',  icon: '📂' },
            { key: 'designation', label: 'Désigner',   icon: '↗' },
          ] as { key: ActiveTool; label: string; icon: string }[]
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTool(tab.key)}
            style={{
              width: 'calc(25% - 2px)',
              padding: '5px 2px',
              fontSize: '9px',
              fontWeight: activeTool === tab.key ? 700 : 400,
              cursor: 'pointer',
              border: 'none',
              borderRadius: '6px',
              background: activeTool === tab.key ? 'var(--color-accent-muted)' : 'transparent',
              color: tab.key === 'designation'
                ? 'var(--color-warning)'
                : activeTool === tab.key
                  ? 'var(--color-accent)'
                  : 'var(--color-text-muted)',
              transition: 'all 0.15s',
              textAlign: 'center',
              outline: activeTool === tab.key ? '1px solid var(--color-accent)' : 'none',
            }}
          >
            <div style={{ fontSize: '15px', marginBottom: '2px' }}>{tab.icon}</div>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="sep" style={{ margin: '8px 0 0' }} />

      {/* Panels standard — scrollables avec padding */}
      {!['catalogue', 'paysagiste'].includes(activeTool) && (
        <div className="sidebar-body">
          {activeTool === 'layers' && (
            <LayersPanel
              layers={layers}
              opacities={opacities}
              onToggle={onLayerToggle}
              onOpacity={onOpacityChange}
            />
          )}
          {activeTool === 'search' && (
            <SearchPanel onGeocode={onGeocode} />
          )}
          {activeTool === 'elevation' && (
            <ElevationPanel clickedCoords={clickedCoords} onShowMnt3D={onShowMnt3D} />
          )}
          {activeTool === 'route' && (
            <RoutePanel onRoute={onRoute} />
          )}
          {activeTool === 'measure' && (
            <MeasurePanel
              measureMode={measureMode}
              onMeasureModeChange={onMeasureModeChange}
              measureResult={measureResult}
              currentZoom={currentZoom}
            />
          )}
        </div>
      )}

      {/* Panels à layout interne — pleine hauteur, pas de sidebar-body */}
      {activeTool === 'catalogue' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <CataloguePanel
            onAddLigne={onAddLigneCatalogue}
            lignesMetrage={lignesMetrage}
            onUpdateLigne={onUpdateLigne}
            onDeleteLigne={onDeleteLigne}
            onSelectForDraw={onSelectCatalogueForDraw}
            activeDrawItemId={activeCatalogueDrawItemId}
            externalCatalogueData={catalogueData}
            onCatalogueDataChange={onCatalogueDataChange}
          />
        </div>
      )}
      {activeTool === 'paysagiste' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <PaysagistePanel
            lignes={lignesMetrage}
            activeElement={activeElement}
            onSelectElement={onSelectElement}
            onUpdateLigne={onUpdateLigne}
            onDeleteLigne={onDeleteLigne}
            onClearAll={onClearAll}
            projetNom={projetNom}
            onProjetNomChange={onProjetNomChange}
            onImportProjet={onImportProjet}
            onNouveauProjet={onNouveauProjet}
            highlightFeatureId={highlightFeatureId}
            onFlashFeature={onFlashFeature}
            catalogueData={catalogueData}
            onSelectCatalogueItem={onSelectCatalogueForDraw}
          />
        </div>
      )}
    </aside>
  );
}

// ─── Panel : Couches ──────────────────────────────────────────────────────────

function LayersPanel({
  layers,
  opacities,
  onToggle,
  onOpacity,
}: {
  layers: IGNLayer[];
  opacities: Record<string, number>;
  onToggle: (id: string) => void;
  onOpacity: (id: string, value: number) => void;
}) {
  const [showPremium, setShowPremium] = useState(false);

  const standardLayers = layers.filter((l) => !l.premium);
  const premiumLayers  = layers.filter((l) => l.premium);

  const LayerRow = ({ layer }: { layer: import('@/lib/ign-layers').IGNLayer }) => (
    <div key={layer.id}>
      <div
        className={`layer-item ${layer.defaultVisible ? 'active' : ''}`}
        onClick={() => onToggle(layer.id)}
      >
        <div className="layer-dot" style={{ background: layer.color }} />
        <div className="layer-info">
          <div className="layer-name">{layer.name}</div>
          <div className="layer-desc">{layer.description}</div>
        </div>
        <div className="layer-toggle" />
      </div>
      {layer.defaultVisible && (
        <div className="opacity-row" style={{ marginTop: 4 }}>
          <span className="opacity-label">Opacité</span>
          <input
            type="range"
            className="opacity-slider"
            min={0} max={1} step={0.05}
            value={opacities[layer.id] ?? layer.defaultOpacity}
            onChange={(e) => onOpacity(layer.id, parseFloat(e.target.value))}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="opacity-value">
            {Math.round((opacities[layer.id] ?? layer.defaultOpacity) * 100)}%
          </span>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">Fonds de carte</div>
        {standardLayers.map((layer) => <LayerRow key={layer.id} layer={layer} />)}
      </div>

      {/* Couches opérateur (premium) */}
      {premiumLayers.length > 0 && (
        <div className="panel-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div className="panel-section-title" style={{ margin: 0 }}>Accès opérateur</div>
            <button
              onClick={() => setShowPremium((v) => !v)}
              style={{
                padding: '2px 8px', fontSize: 9, borderRadius: 10, cursor: 'pointer',
                border: '1px solid var(--color-border)',
                background: showPremium ? '#16a34a' : 'var(--color-surface-2)',
                color: showPremium ? 'white' : 'var(--color-text-muted)',
                fontWeight: 600,
              }}
            >
              {showPremium ? 'Masquer' : 'Afficher'}
            </button>
          </div>
          {showPremium
            ? premiumLayers.map((layer) => <LayerRow key={layer.id} layer={layer} />)
            : (
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', lineHeight: 1.5, padding: '4px 0' }}>
                Couches disponibles sur demande : Ortho Express récente (2024).
                Cliquez sur <em>Afficher</em> pour y accéder. La disponibilité dépend de la couverture IGN.
              </div>
            )
          }
        </div>
      )}

      <div className="sep" />

      <div className="panel-section">
        <div className="panel-section-title">À propos des couches</div>
        <div className="result-card">
          <div className="result-row">
            <span className="result-key">Source</span>
            <span className="result-val">data.geopf.fr</span>
          </div>
          <div className="result-row">
            <span className="result-key">Protocole</span>
            <span className="result-val">WMTS/KVP</span>
          </div>
          <div className="result-row">
            <span className="result-key">Projection</span>
            <span className="result-val">EPSG:3857</span>
          </div>
          <div className="result-row">
            <span className="result-key">Clé API</span>
            <span className="result-val" style={{ color: 'var(--color-success)' }}>non requise</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Panel : Recherche ────────────────────────────────────────────────────────

function SearchPanel({ onGeocode }: { onGeocode: (lon: number, lat: number) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GeocodeResult | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 3) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await geocodeAddress(q);
      setResults(res);
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 400);
  };

  const handleSelect = (r: GeocodeResult) => {
    setSelected(r);
    setResults([]);
    setQuery(r.label);
    onGeocode(r.x, r.y);
  };

  return (
    <div className="panel-section">
      <div className="panel-section-title">Géocodage IGN</div>

      <div className="search-input-wrap">
        <span className="search-icon">⌕</span>
        <input
          type="text"
          className="search-input"
          placeholder="Adresse, lieu, commune..."
          value={query}
          onChange={handleChange}
        />
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '8px', color: 'var(--color-text-muted)', fontSize: '12px' }}>
          Recherche...
        </div>
      )}

      {results.length > 0 && (
        <div className="geocode-results">
          {results.map((r, i) => (
            <div key={i} className="geocode-result-item" onClick={() => handleSelect(r)}>
              <div className="geocode-result-label">{r.label}</div>
              <div className="geocode-result-type">
                {r.type} {r.postcode ? `· ${r.postcode}` : ''} {r.context ? `· ${r.context}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div className="sep" />
          <div className="panel-section-title">Résultat</div>
          <div className="result-card">
            <div className="result-card-title">{selected.label}</div>
            <div className="result-row">
              <span className="result-key">Type</span>
              <span className="result-val">{selected.type}</span>
            </div>
            <div className="result-row">
              <span className="result-key">Lon</span>
              <span className="result-val">{selected.x.toFixed(5)}</span>
            </div>
            <div className="result-row">
              <span className="result-key">Lat</span>
              <span className="result-val">{selected.y.toFixed(5)}</span>
            </div>
            {selected.city && (
              <div className="result-row">
                <span className="result-key">Commune</span>
                <span className="result-val">{selected.city}</span>
              </div>
            )}
          </div>
        </>
      )}

      <div className="sep" />
      <div className="panel-section-title">API utilisée</div>
      <div className="result-card" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
        <code style={{ wordBreak: 'break-all', color: 'var(--color-text)' }}>
          data.geopf.fr/geocodage/search?q=...
        </code>
        <div style={{ marginTop: '6px' }}>BAN · BD TOPO® · PCI · 50 req/s</div>
      </div>
    </div>
  );
}

// ─── Panel : Altimétrie ───────────────────────────────────────────────────────

function ElevationPanel({
  clickedCoords,
  onShowMnt3D,
}: {
  clickedCoords: { lon: number; lat: number } | null;
  onShowMnt3D?: (bbox: [number,number,number,number]) => void;
}) {
  const [elevation, setElevation] = useState<number | null>(null);
  const [elevSource, setElevSource] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCoords, setLastCoords] = useState<{ lon: number; lat: number } | null>(null);

  const fetchElevation = useCallback(async (coords: { lon: number; lat: number }) => {
    setLoading(true);
    setError(null);
    setLastCoords(coords);
    setElevation(null);
    setElevSource('');
    try {
      const results = await getElevation([coords]);
      const r = results[0];
      const z = r?.z;
      if (z === undefined || z === null || isNaN(z)) {
        setError('Altitude non disponible pour ce point (hors couverture RGE Alti)');
      } else {
        setElevation(z);
        setElevSource(r.source ?? '');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur API altimétrie';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Lancer automatiquement le calcul dès qu'un nouveau point est cliqué
  useEffect(() => {
    if (clickedCoords) {
      fetchElevation(clickedCoords);
    }
  }, [clickedCoords, fetchElevation]);

  return (
    <div className="panel-section">
      <div className="panel-section-title">Altimétrie RGE Alti</div>

      <div className="result-card" style={{ marginBottom: 8 }}>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          {clickedCoords
            ? 'Calcul automatique au clic sur la carte.'
            : 'Cliquez sur la carte pour obtenir l\'altitude du point.'}
        </div>
      </div>

      {clickedCoords && (
        <div className="result-card" style={{ marginBottom: 8 }}>
          <div className="result-row">
            <span className="result-key">Longitude</span>
            <span className="result-val">{clickedCoords.lon.toFixed(5)}</span>
          </div>
          <div className="result-row">
            <span className="result-key">Latitude</span>
            <span className="result-val">{clickedCoords.lat.toFixed(5)}</span>
          </div>
        </div>
      )}

      {/* Bouton manuel pour relancer si besoin */}
      <button
        className="btn btn-primary"
        disabled={!clickedCoords || loading}
        onClick={() => clickedCoords && fetchElevation(clickedCoords)}
      >
        {loading ? 'Calcul en cours...' : 'Calculer l\'altitude'}
      </button>

      {/* Bouton Vue MNT 3D */}
      <button
        className="btn"
        style={{ marginTop: 8, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', width: '100%' }}
        onClick={() => {
          const c = clickedCoords ?? { lon: 2.35, lat: 48.85 };
          const dLon = 0.06, dLat = 0.04;
          onShowMnt3D?.([c.lon - dLon, c.lat - dLat, c.lon + dLon, c.lat + dLat]);
        }}
      >
        🏔 Vue MNT 3D (zone carte)
      </button>

      {loading && (
        <div style={{ textAlign: 'center', padding: '12px', color: 'var(--color-text-muted)', fontSize: '12px' }}>
          Interrogation RGE Alti® IGN...
        </div>
      )}

      {error && (
        <div style={{ margin: '8px 0', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 10, color: '#ef4444', lineHeight: 1.5 }}>
          <strong>Erreur altimétrie</strong><br />
          {error.split('\n').map((line, i) => (
            <span key={i} style={{ display: 'block', opacity: i === 0 ? 1 : 0.75, fontSize: i === 0 ? 10 : 9 }}>{line}</span>
          ))}
        </div>
      )}

      {elevation !== null && lastCoords && !loading && (
        <>
          <div className="sep" />
          <div className="elevation-info">
            <div className="panel-section-title" style={{ marginBottom: 8 }}>Résultat</div>
            <div className="elevation-grid">
              <div className="elevation-stat">
                <div className="elevation-stat-val" style={{ color: '#22c55e', fontSize: '22px' }}>
                  {elevation.toFixed(1)}
                </div>
                <div className="elevation-stat-label">m altitude NGF</div>
              </div>
              <div className="elevation-stat">
                <div className="elevation-stat-val">{lastCoords.lon.toFixed(4)}</div>
                <div className="elevation-stat-label">longitude</div>
              </div>
              <div className="elevation-stat">
                <div className="elevation-stat-val">{lastCoords.lat.toFixed(4)}</div>
                <div className="elevation-stat-label">latitude</div>
              </div>
            </div>
            {elevSource && (
              <div style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 5, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                via {elevSource}
              </div>
            )}
          </div>
        </>
      )}

      <div className="sep" />
      <div className="panel-section-title">API utilisée</div>
      <div className="result-card" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
        <code style={{ wordBreak: 'break-all', color: 'var(--color-text)' }}>
          data.geopf.fr/altimetrie/rest/elevationLine
        </code>
        <div style={{ marginTop: '6px' }}>MNT RGE Alti® 1m · sans cle</div>
      </div>
    </div>
  );
}

// ─── Panel : Itinéraire ───────────────────────────────────────────────────────

function RoutePanel({ onRoute }: { onRoute: (g: GeoJSONLineString) => void }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [profile, setProfile] = useState<'car' | 'pedestrian'>('car');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async () => {
    if (!start || !end) return;
    setLoading(true);
    setError(null);
    try {
      // Géocode les adresses de départ et arrivée
      const [startRes, endRes] = await Promise.all([
        geocodeAddress(start),
        geocodeAddress(end),
      ]);

      if (!startRes[0] || !endRes[0]) {
        setError('Adresse non trouvée. Essayez d\'être plus précis.');
        return;
      }

      const routeResult = await calculateRoute(
        { lon: startRes[0].x, lat: startRes[0].y },
        { lon: endRes[0].x, lat: endRes[0].y },
        profile
      );

      setResult(routeResult);
      onRoute(routeResult.geometry);
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : 'Erreur de calcul d\'itinéraire'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-section">
      <div className="panel-section-title">Calcul d'itinéraire</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="text"
          className="search-input"
          style={{ paddingLeft: '12px' }}
          placeholder="Départ (ex: Paris 1er)"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <input
          type="text"
          className="search-input"
          style={{ paddingLeft: '12px' }}
          placeholder="Arrivée (ex: Lyon centre)"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />

        {/* Mode de transport */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['car', 'pedestrian'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProfile(p)}
              className="btn btn-ghost"
              style={{
                flex: 1,
                borderColor: profile === p ? 'var(--color-accent)' : undefined,
                color: profile === p ? 'var(--color-accent)' : undefined,
                fontSize: '11px',
                padding: '6px',
              }}
            >
              {p === 'car' ? '🚗 Voiture' : '🚶 Piéton'}
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary"
          disabled={!start || !end || loading}
          onClick={handleCalculate}
        >
          {loading ? 'Calcul en cours...' : '⟶ Calculer l\'itinéraire'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#ef4444',
        }}>
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="sep" />
          <div className="panel-section-title">Résumé</div>
          <div className="elevation-grid">
            <div className="elevation-stat">
              <div className="elevation-stat-val">{formatDistance(result.distance)}</div>
              <div className="elevation-stat-label">distance</div>
            </div>
            <div className="elevation-stat">
              <div className="elevation-stat-val">{formatDuration(result.duration)}</div>
              <div className="elevation-stat-label">durée est.</div>
            </div>
          </div>

          {result.legs.length > 0 && (
            <>
              <div className="panel-section-title" style={{ marginTop: 8 }}>
                Étapes ({result.legs.length})
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {result.legs.slice(0, 8).map((leg, i) => (
                  <div key={i} style={{
                    padding: '5px 0',
                    borderBottom: '1px solid var(--color-border)',
                    fontSize: '11px',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-start',
                  }}>
                    <span style={{ color: 'var(--color-accent)', minWidth: 16 }}>{i + 1}.</span>
                    <span style={{ flex: 1 }}>{leg.instruction || '—'}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                      {formatDistance(leg.distance)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="sep" />
      <div className="panel-section-title">API utilisée</div>
      <div className="result-card" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
        <code style={{ wordBreak: 'break-all', color: 'var(--color-text)' }}>
          data.geopf.fr/navigation/itineraire
        </code>
        <div style={{ marginTop: '6px' }}>BD TOPO-OSRM · sans clé</div>
      </div>
    </div>
  );
}

// ─── Panel : Mesure ───────────────────────────────────────────────────────────

function MeasurePanel({
  measureMode,
  onMeasureModeChange,
  measureResult,
  currentZoom,
}: {
  measureMode: MeasureMode;
  onMeasureModeChange: (mode: MeasureMode) => void;
  measureResult: MeasureResult | null;
  currentZoom: number;
}) {
  const scale = Math.round(getMapScale(currentZoom));

  const tools = [
    {
      mode: 'length' as MeasureMode,
      label: 'Longueur',
      icon: '―',
      color: '#f59e0b',
      desc: 'Tracez une polyligne — cliquez pour chaque point, double-clic pour finir',
    },
    {
      mode: 'area' as MeasureMode,
      label: 'Surface',
      icon: '▭',
      color: '#8b5cf6',
      desc: 'Tracez un polygone — cliquez pour chaque sommet, double-clic pour fermer',
    },
  ];

  return (
    <div className="panel-section">
      <div className="panel-section-title">Outils de mesure</div>

      {/* Échelle courante */}
      <div className="result-card" style={{ marginBottom: 4 }}>
        <div className="result-row">
          <span className="result-key">Échelle carte</span>
          <span className="result-val" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
            1 / {scale.toLocaleString('fr-FR')}
          </span>
        </div>
        <div className="result-row">
          <span className="result-key">Niveau zoom</span>
          <span className="result-val">{currentZoom.toFixed(1)}</span>
        </div>
        <div className="result-row">
          <span className="result-key">Zoom max</span>
          <span className="result-val" style={{ color: 'var(--color-success)' }}>22 (≈ 1/140)</span>
        </div>
      </div>

      <div className="sep" />

      {/* Sélection outil */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {tools.map((tool) => (
          <button
            key={tool.mode}
            className="btn btn-ghost"
            style={{
              flex: 1,
              flexDirection: 'column',
              gap: 4,
              padding: '10px 8px',
              borderColor: measureMode === tool.mode ? tool.color : undefined,
              color: measureMode === tool.mode ? tool.color : undefined,
              background: measureMode === tool.mode ? `${tool.color}14` : undefined,
            }}
            onClick={() =>
              onMeasureModeChange(measureMode === tool.mode ? 'none' : tool.mode)
            }
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{tool.icon}</span>
            <span style={{ fontSize: 11 }}>{tool.label}</span>
          </button>
        ))}
      </div>

      {/* Description de l'outil actif */}
      {measureMode !== 'none' && (
        <div style={{
          padding: '8px 12px',
          background: measureMode === 'length'
            ? 'rgba(245,158,11,0.08)'
            : 'rgba(139,92,246,0.08)',
          border: `1px solid ${measureMode === 'length' ? 'rgba(245,158,11,0.3)' : 'rgba(139,92,246,0.3)'}`,
          borderRadius: 8,
          fontSize: 12,
          color: measureMode === 'length' ? '#f59e0b' : '#8b5cf6',
          lineHeight: 1.5,
        }}>
          {tools.find((t) => t.mode === measureMode)?.desc}
        </div>
      )}

      {measureMode === 'none' && (
        <div style={{
          fontSize: 12,
          color: 'var(--color-text-muted)',
          lineHeight: 1.5,
          padding: '4px 2px',
        }}>
          Sélectionnez un outil, puis dessinez sur la carte. Les mesures s'accumulent — utilisez «&nbsp;Effacer&nbsp;» pour recommencer.
        </div>
      )}

      {/* Bouton effacer */}
      <button
        className="btn btn-ghost"
        style={{ marginTop: 4, fontSize: 12 }}
        onClick={() => onMeasureModeChange('none')}
      >
        ✕ Arrêter / Effacer les mesures
      </button>

      {/* Résultat courant */}
      {measureResult && (
        <>
          <div className="sep" />
          <div className="panel-section-title">
            Mesure en cours
          </div>
          <div className="elevation-grid">
            <div className="elevation-stat" style={{
              gridColumn: '1 / -1',
              background: measureResult.mode === 'length'
                ? 'rgba(245,158,11,0.08)'
                : 'rgba(139,92,246,0.08)',
              border: `1px solid ${measureResult.mode === 'length' ? 'rgba(245,158,11,0.2)' : 'rgba(139,92,246,0.2)'}`,
            }}>
              <div className="elevation-stat-val" style={{
                fontSize: 22,
                color: measureResult.mode === 'length' ? '#f59e0b' : '#8b5cf6',
              }}>
                {measureResult.value}
              </div>
              <div className="elevation-stat-label">
                {measureResult.mode === 'length' ? 'longueur géodésique' : 'surface géodésique'}
              </div>
            </div>

            {measureResult.mode === 'area' && measureResult.rawSqMeters !== undefined && (
              <>
                <div className="elevation-stat">
                  <div className="elevation-stat-val" style={{ fontSize: 14 }}>
                    {(measureResult.rawSqMeters / 10000).toFixed(3)}
                  </div>
                  <div className="elevation-stat-label">hectares</div>
                </div>
                <div className="elevation-stat">
                  <div className="elevation-stat-val" style={{ fontSize: 14 }}>
                    {(measureResult.rawSqMeters / 1_000_000).toFixed(5)}
                  </div>
                  <div className="elevation-stat-label">km²</div>
                </div>
              </>
            )}

            {measureResult.mode === 'length' && (
              <>
                <div className="elevation-stat">
                  <div className="elevation-stat-val" style={{ fontSize: 14 }}>
                    {measureResult.rawMeters.toFixed(1)}
                  </div>
                  <div className="elevation-stat-label">mètres</div>
                </div>
                <div className="elevation-stat">
                  <div className="elevation-stat-val" style={{ fontSize: 14 }}>
                    {measureResult.points}
                  </div>
                  <div className="elevation-stat-label">points</div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <div className="sep" />
      <div className="panel-section-title">Méthode de calcul</div>
      <div className="result-card" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
        <div style={{ marginBottom: 4 }}>
          <span style={{ color: 'var(--color-text)' }}>ol/sphere</span> — calcul géodésique
          sur l'ellipsoïde WGS-84, précis quelle que soit la latitude.
        </div>
        <div>Projection affichage : EPSG:3857 (WebMercator)</div>
      </div>
    </div>
  );
}
