import type { LineString as GeoJSONLineString } from 'geojson';
'use client';

import { useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { IGNLayer } from '@/lib/ign-layers';
import { IGN_LAYERS } from '@/lib/ign-layers';
import Sidebar from '@/components/map/Sidebar';
const Mnt3DModal = dynamic(() => import('@/components/map/Mnt3DModal'), { ssr: false });
import { reverseGeocode } from '@/lib/gpf-api';
import type { MeasureMode, MeasureResult } from '@/lib/measure';
import type { ElementPaysagiste, LigneMetrage } from '@/lib/paysagiste';
import type { CatalogueData, CatalogueItem } from '@/lib/catalogue-xlsx';

const MapView = dynamic(() => import('@/components/map/MapView'), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', color: 'var(--color-text-muted)', fontSize: '14px', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '32px' }}>🗺</div>
      <div>Chargement de la carte…</div>
    </div>
  ),
});

export default function HomePage() {
  // Couches IGN
  const [layers, setLayers] = useState<IGNLayer[]>(IGN_LAYERS);
  const [opacities, setOpacities] = useState<Record<string, number>>(
    Object.fromEntries(IGN_LAYERS.map((l) => [l.id, l.defaultOpacity]))
  );

  // Coordonnées
  const [coords, setCoords] = useState({ lon: 0, lat: 0, zoom: 12 });
  const [showMnt3D, setShowMnt3D] = useState(false);
  const [mntBbox, setMntBbox] = useState<[number,number,number,number]>([2.3,48.8,2.4,48.9]);
  const getViewBboxRef = useRef<(() => [number,number,number,number] | null) | null>(null);
  const [clickedCoords, setClickedCoords] = useState<{ lon: number; lat: number } | null>(null);
  const [reverseLabel, setReverseLabel] = useState('');

  // Géocodage
  const [markerCoords, setMarkerCoords] = useState<[number, number] | null>(null);

  // Itinéraire
  const [routeGeometry, setRouteGeometry] = useState<GeoJSONLineString | null>(null);

  // Mesure simple
  const [measureMode, setMeasureMode] = useState<MeasureMode>('none');
  const [measureResult, setMeasureResult] = useState<MeasureResult | null>(null);

  // ── Paysagiste ───────────────────────────────────────────────────────────────
  const [activeElement, setActiveElement] = useState<ElementPaysagiste | null>(null);
  const [lignesMetrage, setLignesMetrage] = useState<LigneMetrage[]>([]);
  const [projetNom, setProjetNom] = useState('');
  // Catalogue xlsx chargé — persisté ici pour survivre aux changements d'onglet
  const [catalogueData, setCatalogueData] = useState<CatalogueData | null>(null);
  // Item catalogue xlsx sélectionné pour dessin carte
  const [activeDrawCatalogueItem, setActiveDrawCatalogueItem] = useState<CatalogueItem | null>(null);

  // Feature à supprimer sur la carte
  const [featureToDelete, setFeatureToDelete] = useState<string | null>(null);
  const [flashFeatureId, setFlashFeatureId] = useState<string | null>(null);
  // Feature sélectionnée sur la carte → highlight dans métrés
  const [highlightFeatureId, setHighlightFeatureId] = useState<string | null>(null);

  // Signal pour tout effacer sur la carte d'un coup
  const [clearAllPays, setClearAllPays] = useState(false);

  // Lignes à restaurer sur la carte (chargement ZIP)
  const [lignesARestorer, setLignesARestorer] = useState<LigneMetrage[] | undefined>(undefined);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleLayerToggle = useCallback((id: string) => {
    setLayers((prev) => prev.map((l) => l.id === id ? { ...l, defaultVisible: !l.defaultVisible } : l));
  }, []);

  const handleOpacityChange = useCallback((id: string, value: number) => {
    setOpacities((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleGeocode = useCallback((lon: number, lat: number) => setMarkerCoords([lon, lat]), []);

  const handleRoute = useCallback((geometry: GeoJSONLineString) => {
    setRouteGeometry(geometry);
    setMarkerCoords(null);
  }, []);

  const handleMapClick = useCallback(async (lon: number, lat: number) => {
    setClickedCoords({ lon, lat });
    try {
      const result = await reverseGeocode(lon, lat);
      if (result) setReverseLabel(result.label);
    } catch { setReverseLabel(''); }
  }, []);

  const handleMeasureModeChange = useCallback((mode: MeasureMode) => {
    setMeasureMode(mode);
    if (mode === 'none') setMeasureResult(null);
  }, []);

  // Quand un élément paysagiste est dessiné sur la carte → ajouter la ligne
  const handlePaysagisteFeature = useCallback((ligne: LigneMetrage, _featureId: string) => {
    setLignesMetrage((prev) => [...prev, ligne]);
  }, []);

  // Ajout depuis le catalogue xlsx (sans dessin carte)
  const handleAddLigneCatalogue = useCallback((ligne: LigneMetrage) => {
    setLignesMetrage((prev) => [...prev, ligne]);
  }, []);

  const handleSelectElement = useCallback((el: ElementPaysagiste | null) => {
    setActiveElement(el);
    // Si on active un élément paysagiste, désactiver la mesure simple
    if (el) setMeasureMode('none');
  }, []);

  const handleUpdateLigne = useCallback((id: string, updates: Partial<LigneMetrage>) => {
    setLignesMetrage((prev) => prev.map((l) => l.id === id ? { ...l, ...updates } : l));
  }, []);

  const handleDeleteLigne = useCallback((id: string) => {
    setLignesMetrage((prev) => {
      const ligne = prev.find((l) => l.id === id);
      if (ligne?.featureId) setFeatureToDelete(ligne.featureId);
      return prev.filter((l) => l.id !== id);
    });
  }, []);

  // Sélection d'un item catalogue pour dessin sur la carte
  // On crée un ElementPaysagiste factice avec les infos du catalogue
  const CAT_COLORS: Record<string, string> = {
    Vegetal: '#22c55e', Mineral: '#78716c', Water: '#0ea5e9',
    Structures: '#8b5cf6', Bois: '#a16207', Reseaux: '#f59e0b', Maconnerie: '#9ca3af',
  };

  const handleSelectCatalogueForDraw = useCallback((item: CatalogueItem) => {
    setActiveDrawCatalogueItem(item);
    // Convertir CatalogueItem en ElementPaysagiste pour MapView
    const fakeEl: ElementPaysagiste = {
      id: `xlsx-${item.id}`,
      categorie: item.categorie,
      nom: item.name,
      description: item.description,
      geomType: item.geomType ?? 'Point',
      unite: (item.unite as any) ?? 'u',
      color: CAT_COLORS[item.categorie] ?? '#6b7280',
      icone: item.icon,
    };
    setActiveElement(fakeEl);
  }, []);

  // Mise à jour géométrie après déplacement/modification sur la carte
  const handleUpdateLigneGeom = useCallback((
    featureId: string,
    updates: { quantite: number; coords?: { lon: number; lat: number }; vertices?: { lon: number; lat: number }[] }
  ) => {
    setLignesMetrage((prev) =>
      prev.map((l) =>
        l.featureId === featureId
          ? {
              ...l,
              quantite: updates.quantite,
              // Si quantite manuelle active, la conserver mais mettre à jour la mesurée
              quantiteManuelle: l.quantiteManuelle !== undefined ? l.quantiteManuelle : undefined,
              coords: updates.coords ?? l.coords,
              vertices: updates.vertices ?? l.vertices,
            }
          : l
      )
    );
  }, []);

  const handleImportProjet = useCallback((nom: string, lignes: LigneMetrage[]) => {
    setClearAllPays(true);   // effacer les features du projet précédent
    setProjetNom(nom);
    setLignesMetrage(lignes);
    setActiveElement(null);
    setActiveDrawCatalogueItem(null);
    // Restaurer les features du nouveau projet après effacement
    const withGeom = lignes.filter((l) => l.vertices && l.vertices.length > 0);
    if (withGeom.length > 0) setTimeout(() => setLignesARestorer([...withGeom]), 50);
  }, []);

  const handleClearAll = useCallback(() => {
    setClearAllPays(true);
    setLignesMetrage([]);
    setActiveElement(null);
  }, []);

  const handleDesignationMode = useCallback(() => {
    setActiveElement(null);          // stoppe le Draw
    setActiveDrawCatalogueItem(null); // stoppe le Draw catalogue
  }, []);

  const handleNouveauProjet = useCallback(() => {
    setClearAllPays(true);   // vider la couche carte d'un coup
    setLignesMetrage([]);
    setActiveElement(null);
    setProjetNom('');
    setActiveDrawCatalogueItem(null);
  }, []);

  // ── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <div className="app-layout">
      <Sidebar
        layers={layers}
        opacities={opacities}
        onLayerToggle={handleLayerToggle}
        onOpacityChange={handleOpacityChange}
        onGeocode={handleGeocode}
        onRoute={handleRoute}
        clickedCoords={clickedCoords}
        measureMode={measureMode}
        onMeasureModeChange={handleMeasureModeChange}
        measureResult={measureResult}
        currentZoom={coords.zoom}
        activeElement={activeElement}
        onSelectElement={handleSelectElement}
        lignesMetrage={lignesMetrage}
        onUpdateLigne={handleUpdateLigne}
        onDeleteLigne={handleDeleteLigne}
        onClearAll={handleClearAll}
        projetNom={projetNom}
        onProjetNomChange={setProjetNom}
        onAddLigneCatalogue={handleAddLigneCatalogue}
        onSelectCatalogueForDraw={handleSelectCatalogueForDraw}
        activeCatalogueDrawItemId={activeDrawCatalogueItem?.id ?? null}
        catalogueData={catalogueData}
        onCatalogueDataChange={setCatalogueData}
        onImportProjet={handleImportProjet}
        onNouveauProjet={handleNouveauProjet}
        onDesignationMode={handleDesignationMode}
        onShowMnt3D={() => {
            // Utiliser la vraie emprise visible de la carte OL
            const realBbox = getViewBboxRef.current?.();
            if (realBbox) setMntBbox(realBbox);
            setShowMnt3D(true);
          }}
        highlightFeatureId={highlightFeatureId}
        onFlashFeature={setFlashFeatureId}
      />

      <div className="map-area">
        <div className="map-container">
          <MapView
            layers={layers}
            opacities={opacities}
            onGetViewBboxRef={getViewBboxRef}
            onCoordsChange={(c) => {
            setCoords(c);
            // bbox MNT : récupérée depuis getViewBboxRef au moment du clic
          }}
            onMapClick={handleMapClick}
            routeGeometry={routeGeometry}
            markerCoords={markerCoords}
            measureMode={measureMode}
            onMeasureResult={setMeasureResult}
            activeElement={activeElement}
            onPaysagisteFeature={handlePaysagisteFeature}
            paysagisteFeatureToDelete={featureToDelete}
            clearAllPaysFeatures={clearAllPays}
            onClearAllPaysFeaturesAck={() => setClearAllPays(false)}
            lignesARestorer={lignesARestorer}
            onRestoreComplete={() => setLignesARestorer(undefined)}
            onFeatureSelect={setHighlightFeatureId}
            flashFeatureId={flashFeatureId}
            onFlashAck={() => setFlashFeatureId(null)}
            onUpdateLigneGeom={handleUpdateLigneGeom}
          />
        </div>

        {/* Barre de statut */}
        <div className="coords-bar">
          <div className="coords-item">
            <span className="coords-label">LON</span>
            <span className="coords-val">{coords.lon.toFixed(5)}</span>
          </div>
          <div className="coords-item">
            <span className="coords-label">LAT</span>
            <span className="coords-val">{coords.lat.toFixed(5)}</span>
          </div>
          <div className="coords-item">
            <span className="coords-label">Z</span>
            <span className="coords-val">{coords.zoom.toFixed(1)}</span>
          </div>
          <div className="coords-item">
            <span className="coords-label">1/</span>
            <span className="coords-val">
              {Math.round(156543.03 * Math.cos(coords.lat * Math.PI / 180) / Math.pow(2, coords.zoom) * 96 / 0.0254).toLocaleString('fr-FR')}
            </span>
          </div>

          {/* Indicateur outil actif */}
          {activeElement && (
            <div className="coords-item" style={{ flex: 1, justifyContent: 'center' }}>
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: activeElement.color, fontWeight: 600 }}>
                {activeElement.icone} {activeElement.nom} · {activeElement.unite}
              </span>
            </div>
          )}
          {measureResult && !activeElement && (
            <div className="coords-item" style={{ flex: 1, justifyContent: 'center' }}>
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: measureResult.mode === 'length' ? '#f59e0b' : '#8b5cf6', fontWeight: 600 }}>
                {measureResult.mode === 'length' ? '― ' : '▭ '}{measureResult.value}
              </span>
            </div>
          )}
          {reverseLabel && !measureResult && !activeElement && (
            <div className="coords-item" style={{ flex: 1, justifyContent: 'flex-end' }}>
              <span className="coords-label">↖</span>
              <span className="coords-val" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reverseLabel}</span>
            </div>
          )}

          {/* Compteur métrés */}
          {lignesMetrage.length > 0 && (
            <div className="coords-item">
              <span style={{ fontSize: '10px', background: 'rgba(34,197,94,0.12)', color: '#22c55e', padding: '2px 7px', borderRadius: 20, fontWeight: 600 }}>
                🌿 {lignesMetrage.length}
              </span>
            </div>
          )}

          <div className="coords-item">
            <span className="status-badge ok" style={{ fontSize: '10px', padding: '2px 6px' }}>
              <span className="status-dot" />GPF
            </span>
          </div>
        </div>
      </div>
      {showMnt3D && (
        <Mnt3DModal bbox={mntBbox} lignesMetrage={lignesMetrage} onClose={() => setShowMnt3D(false)} />
      )}
    </div>
  );
}
