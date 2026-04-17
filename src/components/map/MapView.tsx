'use client';

/**
 * MapView.tsx
 * Composant carte OpenLayers + extensions IGN
 * — Mesure longueur / surface géodésique
 * — Mode paysagiste : dessin par élément du catalogue
 * — Zoom max 22 (≈ 1/140 · lat France)
 * - TypeScript prend encore Map pour la classe OpenLayers (pas générique), pas pour Map<K,V>. Il suffit de ne plus utiliser Map<>
 */

import { useEffect, useRef } from 'react';
import type { IGNLayer } from '@/lib/ign-layers';
import { GPF_ENDPOINTS } from '@/lib/ign-layers';
import type { MeasureMode, MeasureResult } from '@/lib/measure';
import {
  formatLength,
  formatArea,
  getLengthMeters,
  getAreaSqMeters,
} from '@/lib/measure';
import type { ElementPaysagiste, LigneMetrage } from '@/lib/paysagiste';
import { generateId } from '@/lib/paysagiste';

import type { LineString as GeoJSONLineString } from 'geojson';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';
import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import { fromLonLat, toLonLat } from 'ol/proj';
import { ScaleLine, FullScreen, Zoom } from 'ol/control';
import { defaults as defaultInteractions, Draw, Snap, Select } from 'ol/interaction';

import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import OlLineString from 'ol/geom/LineString';
import OlPolygon from 'ol/geom/Polygon';
import { Modify } from 'ol/interaction';
import GeoJSON from 'ol/format/GeoJSON';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import type { DrawEvent } from 'ol/interaction/Draw';
import type MapBrowserEvent from 'ol/MapBrowserEvent';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MapCoords {
  lon: number;
  lat: number;
  zoom: number;
}

export interface MapViewProps {
  layers: IGNLayer[];
  opacities: Record<string, number>;
  onCoordsChange?: (coords: MapCoords) => void;
  onMapClick?: (lon: number, lat: number) => void;
  onMapReady?: (map: OlMap) => void;
  routeGeometry?: GeoJSONLineString | null;
  markerCoords?: [number, number] | null;
  // Mesure simple
  measureMode: MeasureMode;
  onMeasureResult?: (result: MeasureResult | null) => void;
  // Mode paysagiste
  activeElement: ElementPaysagiste | null;
  onPaysagisteFeature?: (ligne: LigneMetrage, featureId: string) => void;
  paysagisteFeatureToDelete?: string | null;
  clearAllPaysFeatures?: boolean;  // signal pour tout effacer d'un coup
  onClearAllPaysFeaturesAck?: () => void;
  lignesARestorer?: import('@/lib/paysagiste').LigneMetrage[];
  onRestoreComplete?: () => void;
  // Mise à jour géométrie après Modify
  onFeatureSelect?: (featureId: string | null) => void;
  flashFeatureId?: string | null;
  onFlashAck?: () => void;
  onUpdateLigneGeom?: (featureId: string, updates: {
    quantite: number;
    coords?: { lon: number; lat: number };
    vertices?: { lon: number; lat: number }[];
  }) => void;
}

// ─── Styles mesure ────────────────────────────────────────────────────────────

const STYLE_LENGTH = new Style({
  stroke: new Stroke({ color: '#f59e0b', width: 2.5, lineDash: [6, 4] }),
  image: new CircleStyle({
    radius: 5,
    fill: new Fill({ color: '#f59e0b' }),
    stroke: new Stroke({ color: 'white', width: 1.5 }),
  }),
});

const STYLE_AREA = new Style({
  stroke: new Stroke({ color: '#8b5cf6', width: 2.5, lineDash: [6, 4] }),
  fill: new Fill({ color: 'rgba(139,92,246,0.12)' }),
  image: new CircleStyle({
    radius: 5,
    fill: new Fill({ color: '#8b5cf6' }),
    stroke: new Stroke({ color: 'white', width: 1.5 }),
  }),
});

function measureStyleFn(mode: MeasureMode) {
  return (feature: Feature) => {
    const geom = feature.getGeometry();
    if (!geom) return [];
    const base = mode === 'length' ? STYLE_LENGTH : STYLE_AREA;
    const label = mode === 'length' ? formatLength(geom) : formatArea(geom);
    return [
      base,
      new Style({
        text: new Text({
          text: label,
          font: 'bold 12px monospace',
          fill: new Fill({
            color: mode === 'length' ? '#f59e0b' : '#8b5cf6',
          }),
          stroke: new Stroke({
            color: 'rgba(15,17,23,0.85)',
            width: 4,
          }),
          offsetY: -14,
        }),
      }),
    ];
  };
}

// ─── Styles paysagiste (dynamique par couleur d'élément) ──────────────────────

function makePaysagisteStyle(
  color: string,
  fillAlpha = 0.2,
  strokeDash?: number[],
) {
  const rgb = hexToRgb(color);
  return new Style({
    stroke: new Stroke({ color, width: 2.5, lineDash: strokeDash }),
    fill: new Fill({ color: `rgba(${rgb},${fillAlpha})` }),
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: 'white', width: 2 }),
    }),
  });
}

function makePaysagisteDrawStyle(color: string) {
  const rgb = hexToRgb(color);
  return new Style({
    stroke: new Stroke({ color, width: 2, lineDash: [5, 4] }),
    fill: new Fill({ color: `rgba(${rgb},0.1)` }),
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: 'white', width: 1.5 }),
    }),
  });
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// ─── Composant ────────────────────────────────────────────────────────────────

export default function MapView({
  layers,
  opacities,
  onCoordsChange,
  onMapClick,
  onMapReady,
  routeGeometry,
  markerCoords,
  measureMode,
  onMeasureResult,
  activeElement,
  onPaysagisteFeature,
  paysagisteFeatureToDelete,
  clearAllPaysFeatures,
  onClearAllPaysFeaturesAck,
  lignesARestorer,
  onRestoreComplete,
  onFeatureSelect,
  flashFeatureId,
  onFlashAck,
  onUpdateLigneGeom,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<OlMap | null>(null);

  const tileLayers = useRef<Map<string, TileLayer> | null>(null);
  const markerLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const routeLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const measureLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const paysagisteLayerRef = useRef<VectorLayer<VectorSource> | null>(null);

  const drawRef = useRef<Draw | null>(null);
  const snapRef = useRef<Snap | null>(null);

  const measureModeRef = useRef<MeasureMode>('none');
  const activeElementRef = useRef<ElementPaysagiste | null>(null);

  // Refs stables pour les callbacks (évite stale closures dans les handlers OL)
  const onCoordsChangeRef = useRef(onCoordsChange);
  const onUpdateLigneGeomRef = useRef(onUpdateLigneGeom);
  const onFeatureSelectRef = useRef(onFeatureSelect);
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onCoordsChangeRef.current = onCoordsChange; }, [onCoordsChange]);
  useEffect(() => { onUpdateLigneGeomRef.current = onUpdateLigneGeom; }, [onUpdateLigneGeom]);
  useEffect(() => { onFeatureSelectRef.current = onFeatureSelect; }, [onFeatureSelect]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  // Map featureId → Feature pour suppression/modification
  const featureMapRef = useRef<Map<string, Feature>>(new Map());
  const modifyRef = useRef<import('ol/interaction').Modify | null>(null);
  const pointPointerUpRef = useRef<(() => void) | null>(null);
  const selectRef = useRef<import('ol/interaction').Select | null>(null);

  // ── Init carte ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = new OlMap({
      target: mapRef.current,
      view: new View({
        center: fromLonLat([2.3488, 48.8534]),
        zoom: 12,
        minZoom: 2,
        maxZoom: 22,
      }),
      controls: [
        new Zoom(),
        new ScaleLine({
          units: 'metric',
          bar: true,
          steps: 4,
          text: true,
          minWidth: 120,
        }),
        new FullScreen(),
      ],
      interactions: defaultInteractions({
        altShiftDragRotate: false,
        pinchRotate: false,
      }),
    });

    mapInstance.current = map;
    tileLayers.current = new Map<string, TileLayer>();

    loadAllWMTSLayers(map, layers, tileLayers.current).then(() =>
      onMapReady?.(map),
    );

    // Couche marqueurs géocodage
    const markerSrc = new VectorSource();
    const markerLayer = new VectorLayer({
      source: markerSrc,
      style: new Style({
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ color: '#3b82f6' }),
          stroke: new Stroke({ color: 'white', width: 2 }),
        }),
      }),
      zIndex: 200,
    });
    map.addLayer(markerLayer);
    markerLayerRef.current = markerLayer;

    // Couche itinéraire
    const routeSrc = new VectorSource();
    const routeLayer = new VectorLayer({
      source: routeSrc,
      style: new Style({
        stroke: new Stroke({
          color: '#3b82f6',
          width: 4,
          lineDash: [8, 4],
        }),
      }),
      zIndex: 90,
    });
    map.addLayer(routeLayer);
    routeLayerRef.current = routeLayer;

    // Couche mesures simples
    const measureSrc = new VectorSource();
    const measureLayer = new VectorLayer({
      source: measureSrc,
      zIndex: 110,
    });
    map.addLayer(measureLayer);
    measureLayerRef.current = measureLayer;

    // Couche paysagiste
    const paysSrc = new VectorSource();
    const paysLayer = new VectorLayer({
      source: paysSrc,
      zIndex: 105,
    });
    map.addLayer(paysLayer);
    paysagisteLayerRef.current = paysLayer;

    // ── Select : clic sur une feature pour la sélectionner ───────────────────
    const selectInteraction = new Select({
      layers: [paysLayer],
      style: (feature) => {
        const color = (feature as Feature).get('paysColor') as string ?? '#22c55e';
        return [
          new Style({
            stroke: new Stroke({ color: 'white', width: 6 }),
            fill: new Fill({ color: `${color}25` }),
            image: new CircleStyle({
              radius: 10,
              fill: new Fill({ color }),
              stroke: new Stroke({ color: 'white', width: 3 }),
            }),
          }),
          new Style({
            stroke: new Stroke({ color, width: 2.5 }),
            image: new CircleStyle({
              radius: 7,
              fill: new Fill({ color }),
            }),
          }),
        ];
      },
    });
    selectInteraction.on('select', (e) => {
      const selected = e.selected[0];
      const fid = selected ? (selected as Feature).getId() as string : null;
      onFeatureSelectRef.current?.(fid);
    });
    map.addInteraction(selectInteraction);
    selectRef.current = selectInteraction;

    // ── Modify : déplacer/remodeler les géométries existantes ────────────────
    const modifyInteraction = new Modify({ source: paysSrc });
    modifyInteraction.on('modifyend', (e) => {
      e.features.forEach((feat) => {
        const fid = (feat as Feature).getId() as string | undefined;
        if (!fid) return;
        const geom = (feat as Feature).getGeometry();
        if (!geom) return;

        let quantite = 1;
        let updCoords: { lon: number; lat: number } | undefined;
        let updVertices: { lon: number; lat: number }[] = [];

        try {
          if (geom instanceof Point) {
            const w = toLonLat((geom as Point).getCoordinates());
            updCoords = { lon: +w[0].toFixed(6), lat: +w[1].toFixed(6) };
            updVertices = [updCoords];
            quantite = 1;
          } else if (geom instanceof OlLineString) {
            updVertices = (geom as OlLineString).getCoordinates().map((c: number[]) => {
              const w = toLonLat(c); return { lon: +w[0].toFixed(6), lat: +w[1].toFixed(6) };
            });
            const wm = toLonLat((geom as OlLineString).getCoordinateAt(0.5));
            updCoords = { lon: +wm[0].toFixed(6), lat: +wm[1].toFixed(6) };
            quantite = getLengthMeters(geom as OlLineString);
          } else if (geom instanceof OlPolygon) {
            const ring = (geom as OlPolygon).getCoordinates()[0].slice(0, -1);
            updVertices = ring.map((c: number[]) => {
              const w = toLonLat(c); return { lon: +w[0].toFixed(6), lat: +w[1].toFixed(6) };
            });
            const wi = toLonLat((geom as OlPolygon).getInteriorPoint().getCoordinates());
            updCoords = { lon: +wi[0].toFixed(6), lat: +wi[1].toFixed(6) };
            quantite = getAreaSqMeters(geom as OlPolygon);
          }
        } catch (_) { /* géométrie invalide */ }

        onUpdateLigneGeomRef.current?.(fid, {
          quantite,
          coords: updCoords,
          vertices: updVertices.length > 0 ? updVertices : undefined,
        });
      });
    });
    map.addInteraction(modifyInteraction);
    modifyRef.current = modifyInteraction;

    // Events
    map.on('pointermove', (e: MapBrowserEvent) => {
      const [lon, lat] = toLonLat(e.coordinate);
      onCoordsChangeRef.current?.({
        lon,
        lat,
        zoom: map.getView().getZoom() ?? 0,
      });
    });

    // Mettre à jour le Z à chaque fin de déplacement/zoom (molette, boutons +/-)
    // Z temps réel : moveend (fin de geste) + change:resolution (pendant zoom molette)
    map.on('moveend', () => {
      const view = map.getView();
      const center = view.getCenter();
      if (!center) return;
      const [lon, lat] = toLonLat(center);
      onCoordsChangeRef.current?.({ lon, lat, zoom: view.getZoom() ?? 0 });
    });
    map.getView().on('change:resolution', () => {
      const view = map.getView();
      const center = view.getCenter();
      if (!center) return;
      const [lon, lat] = toLonLat(center);
      onCoordsChangeRef.current?.({ lon, lat, zoom: view.getZoom() ?? 0 });
    });

    map.on('click', (e: MapBrowserEvent) => {
      const [lon, lat] = toLonLat(e.coordinate);
      // Toujours remonter le clic pour l'altimétrie
      onMapClickRef.current?.(lon, lat);
    });

    return () => {
      map.setTarget(undefined);
      mapInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Gestion mode mesure ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstance.current;
    const measureLayer = measureLayerRef.current;
    if (!map || !measureLayer) return;

    measureModeRef.current = measureMode;
    removeDraw(map);

    if (measureMode === 'none') {
      if (mapRef.current) mapRef.current.style.cursor = '';
      return;
    }

    if (mapRef.current) mapRef.current.style.cursor = 'crosshair';

    const src = measureLayer.getSource()!;
    const draw = new Draw({
      source: src,
      type: measureMode === 'length' ? 'LineString' : 'Polygon',
      style: measureStyleFn(measureMode) as any,
    });

    draw.on('drawstart', (e) => {
      e.feature.getGeometry()!.on('change', () => {
        const g = e.feature.getGeometry()!;
        onMeasureResult?.({
          mode: measureMode,
          value:
            measureMode === 'length' ? formatLength(g) : formatArea(g),
          rawMeters: getLengthMeters(g),
          rawSqMeters:
            measureMode === 'area'
              ? getAreaSqMeters(g)
              : undefined,
          points: 0,
        });
      });
    });

    draw.on('drawend', (e: DrawEvent) => {
      const g = e.feature.getGeometry()!;
      e.feature.setStyle(
        measureMode === 'length' ? STYLE_LENGTH : STYLE_AREA,
      );
      onMeasureResult?.({
        mode: measureMode,
        value:
          measureMode === 'length' ? formatLength(g) : formatArea(g),
        rawMeters: getLengthMeters(g),
        rawSqMeters:
          measureMode === 'area'
            ? getAreaSqMeters(g)
            : undefined,
        points: 0,
      });
    });

    map.addInteraction(draw);
    drawRef.current = draw;

    const snap = new Snap({ source: src });
    map.addInteraction(snap);
    snapRef.current = snap;
  }, [measureMode, onMeasureResult]);

  // ── Gestion mode paysagiste ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstance.current;
    const paysLayer = paysagisteLayerRef.current;
    if (!map || !paysLayer) return;

    activeElementRef.current = activeElement;
    removeDraw(map);

    if (!activeElement) {
      if (mapRef.current) mapRef.current.style.cursor = '';
      // Réactiver Select si disponible
      if (selectRef.current) selectRef.current.setActive(true);
      return;
    }

    // Désactiver Select pendant le dessin
    if (selectRef.current) selectRef.current.setActive(false);

    if (mapRef.current) mapRef.current.style.cursor = 'crosshair';

    const src = paysLayer.getSource()!;
    const drawStyle = makePaysagisteDrawStyle(activeElement.color);

    const draw = new Draw({
      source: src,
      type: activeElement.geomType,
      style: drawStyle,
      clickTolerance: 8,
    });

    draw.on('drawend', (e: DrawEvent) => {
      const geom = e.feature.getGeometry()!;
      const featureId = generateId();
      e.feature.setId(featureId);

      const finalStyle = makePaysagisteStyle(
        activeElement.color,
        activeElement.fillAlpha ?? 0.2,
        activeElement.strokeDash,
      );
      const styles: Style[] = [finalStyle];

      const labelText = activeElement.unite === 'u'
        ? activeElement.icone
        : activeElement.geomType === 'LineString'
          ? `${activeElement.icone} ${formatLength(geom)}`
          : `${activeElement.icone} ${formatArea(geom)}`;

      styles.push(new Style({
        text: new Text({
          text: labelText,
          font: '11px sans-serif',
          fill: new Fill({ color: activeElement.color }),
          stroke: new Stroke({ color: 'rgba(15,17,23,0.9)', width: 3 }),
          overflow: true,
        }),
      }));
      e.feature.setStyle(styles);
      e.feature.set('paysColor', activeElement.color);

      let quantite = 1;
      if (activeElement.geomType === 'LineString') quantite = getLengthMeters(geom);
      else if (activeElement.geomType === 'Polygon') quantite = getAreaSqMeters(geom);

      let coords: { lon: number; lat: number } | undefined;
      let vertices: { lon: number; lat: number }[] = [];
      try {
        if (activeElement.geomType === 'Point') {
          const raw = (geom as Point).getCoordinates();
          const wgs84 = toLonLat(raw);
          coords = { lon: +wgs84[0].toFixed(6), lat: +wgs84[1].toFixed(6) };
          vertices = [coords];
        } else if (activeElement.geomType === 'LineString') {
          const rawC = (geom as OlLineString).getCoordinates();
          vertices = rawC.map((c: number[]) => { const w = toLonLat(c); return { lon: +w[0].toFixed(6), lat: +w[1].toFixed(6) }; });
          const wm = toLonLat((geom as OlLineString).getCoordinateAt(0.5));
          coords = { lon: +wm[0].toFixed(6), lat: +wm[1].toFixed(6) };
        } else {
          const ring = (geom as OlPolygon).getCoordinates()[0].slice(0, -1);
          vertices = ring.map((c: number[]) => { const w = toLonLat(c); return { lon: +w[0].toFixed(6), lat: +w[1].toFixed(6) }; });
          const wi = toLonLat((geom as OlPolygon).getInteriorPoint().getCoordinates());
          coords = { lon: +wi[0].toFixed(6), lat: +wi[1].toFixed(6) };
        }
      } catch (_) {}

      featureMapRef.current.set(featureId, e.feature);

      const ligne: LigneMetrage = {
        id: generateId(),
        elementId: activeElement.id,
        nom: activeElement.nom,
        categorie: activeElement.categorie,
        unite: activeElement.unite,
        quantite,
        geomType: activeElement.geomType,
        color: activeElement.color,
        createdAt: Date.now(),
        featureId,
        coords,
        vertices: vertices.length > 0 ? vertices : undefined,
      };

      onPaysagisteFeature?.(ligne, featureId);
    });

    map.addInteraction(draw);
    drawRef.current = draw;

    if (activeElement.geomType !== 'Point') {
      const snap = new Snap({ source: src });
      map.addInteraction(snap);
      snapRef.current = snap;
    }
  }, [activeElement, onPaysagisteFeature]);

  // ── Suppression d'une feature paysagiste ────────────────────────────────────
  useEffect(() => {
    if (!paysagisteFeatureToDelete || !paysagisteLayerRef.current) return;
    const src = paysagisteLayerRef.current.getSource()!;
    const feature = featureMapRef.current.get(paysagisteFeatureToDelete);
    if (feature) {
      src.removeFeature(feature);
      featureMapRef.current.delete(paysagisteFeatureToDelete);
    }
  }, [paysagisteFeatureToDelete]);

  // ── Flash d'une feature au clic sur sa carte métré ────────────────────────
  useEffect(() => {
    if (!flashFeatureId) return;
    const feature = featureMapRef.current.get(flashFeatureId);
    if (!feature) { onFlashAck?.(); return; }

    const originalStyle = feature.getStyle();
    let visible = true;
    let count = 0;
    const BLINKS = 3;   // 3 clignotements
    const HALF = 80;    // 80ms ON + 80ms OFF = 160ms par cycle → 3×160=480ms ≈ 0.5s

    const id = setInterval(() => {
      visible = !visible;
      if (!visible) {
        // Style "invisible" : transparent
        feature.setStyle(new Style({
          image: new CircleStyle({ radius: 9, fill: new Fill({ color: 'rgba(255,255,255,0)' }), stroke: new Stroke({ color: 'rgba(255,255,255,0)', width: 0 }) }),
          stroke: new Stroke({ color: 'rgba(255,255,255,0)', width: 0 }),
          fill: new Fill({ color: 'rgba(255,255,255,0)' }),
        }));
      } else {
        // Style "éclairé" : blanc opaque
        feature.setStyle(new Style({
          image: new CircleStyle({ radius: 12, fill: new Fill({ color: 'white' }), stroke: new Stroke({ color: '#22c55e', width: 3 }) }),
          stroke: new Stroke({ color: 'white', width: 4 }),
          fill: new Fill({ color: 'rgba(255,255,255,0.7)' }),
        }));
        count++;
        if (count >= BLINKS) {
          clearInterval(id);
          // Restaurer le style original
          feature.setStyle(originalStyle as import('ol/style/Style').default | import('ol/style/Style').default[]);
          onFlashAck?.();
        }
      }
    }, HALF);

    return () => { clearInterval(id); feature.setStyle(originalStyle as import('ol/style/Style').default | import('ol/style/Style').default[]); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashFeatureId]);

  // ── Effacement complet de la couche paysagiste (Nouveau projet / Ouvrir) ────
  useEffect(() => {
    if (!clearAllPaysFeatures) return;
    const paysLayer = paysagisteLayerRef.current;
    if (paysLayer) {
      paysLayer.getSource()!.clear();
      featureMapRef.current.clear();
    }
    onClearAllPaysFeaturesAck?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearAllPaysFeatures]);

  // ── Restauration des features depuis un ZIP ────────────────────────────────
  useEffect(() => {
    if (!lignesARestorer || lignesARestorer.length === 0) return;
    const paysLayer = paysagisteLayerRef.current;
    const map = mapInstance.current;
    if (!paysLayer || !map) return;

    const src2 = paysLayer.getSource()!;

    const withVerts = lignesARestorer.filter((l) => l.vertices && l.vertices.length > 0);
    if (withVerts.length === 0) { onRestoreComplete?.(); return; }

    const allLons = withVerts.flatMap((l) => (l.vertices ?? []).map((v) => v.lon));
    const allLats = withVerts.flatMap((l) => (l.vertices ?? []).map((v) => v.lat));
    const lonC = (Math.min(...allLons) + Math.max(...allLons)) / 2;
    const latC = (Math.min(...allLats) + Math.max(...allLats)) / 2;

    withVerts.forEach((ligne) => {
      const verts = ligne.vertices!;
      let geom: Point | OlLineString | OlPolygon;

      if (ligne.geomType === 'Point') {
        geom = new Point(fromLonLat([verts[0].lon, verts[0].lat]));
      } else if (ligne.geomType === 'LineString') {
        geom = new OlLineString(verts.map((v) => fromLonLat([v.lon, v.lat])));
      } else {
        const ring = verts.map((v) => fromLonLat([v.lon, v.lat]));
        ring.push(ring[0]); // fermer le polygone
        geom = new OlPolygon([ring]);
      }

      const feature = new Feature({ geometry: geom });
      const featureId = ligne.featureId ?? generateId();
      feature.setId(featureId);

      // Recalculer le label
      const labelText =
        ligne.unite === 'u'
          ? ''
          : ligne.geomType === 'LineString'
          ? `${getLengthMeters(geom as OlLineString).toFixed(1)} ml`
          : `${getAreaSqMeters(geom as OlPolygon).toFixed(1)} m²`;

      feature.setStyle([
        makePaysagisteStyle(ligne.color, 0.2),
        new Style({
          text: new Text({
            text: labelText,
            font: '11px sans-serif',
            fill: new Fill({ color: ligne.color }),
            stroke: new Stroke({ color: 'rgba(15,17,23,0.9)', width: 3 }),
            overflow: true,
          }),
        }),
      ]);

      feature.set('paysColor', ligne.color); // pour Select
      src2.addFeature(feature);
      featureMapRef.current.set(featureId, feature);
    });

    // Ajouter interaction Modify pour pouvoir éditer les features restaurées
    const modify = new Modify({ source: src2 });
    map.addInteraction(modify);

    // Recentrer sur l'emprise calculée directement depuis les vertices WGS84
    // (plus fiable que src2.getExtent() qui peut ne pas être à jour)
    const lonMin = Math.min(...allLons);
    const lonMax = Math.max(...allLons);
    const latMin = Math.min(...allLats);
    const latMax = Math.max(...allLats);

    // Cas point unique : animer vers le centre
    if (lonMin === lonMax && latMin === latMax) {
      map.getView().animate({
        center: fromLonLat([lonC, latC]),
        zoom: 18,
        duration: 700,
      });
    } else {
      // Construire l'extent en WebMercator depuis les coins WGS84
      const sw = fromLonLat([lonMin, latMin]);
      const ne = fromLonLat([lonMax, latMax]);
      const bbox: [number, number, number, number] = [sw[0], sw[1], ne[0], ne[1]];
      // Différer légèrement pour laisser OL finaliser le rendu
      setTimeout(() => {
        map.getView().fit(bbox, {
          padding: [80, 60, 80, 60],
          duration: 800,
          maxZoom: 19,
        });
      }, 150);
    }

    onRestoreComplete?.();
  }, [lignesARestorer, onRestoreComplete]);

  // ── Couches WMTS visibilité ─────────────────────────────────────────────────
  useEffect(() => {
    if (!tileLayers.current) return;
    layers.forEach((l) => {
      const tl = tileLayers.current!.get(l.id);
      if (tl) tl.setVisible(l.defaultVisible);
    });
  }, [layers]);

  // ── Opacité ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tileLayers.current) return;
    Object.entries(opacities).forEach(([id, op]) => {
      const tl = tileLayers.current!.get(id);
      if (tl) tl.setOpacity(op);
    });
  }, [opacities]);

  // ── Itinéraire ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!routeLayerRef.current) return;
    const src = routeLayerRef.current.getSource()!;
    src.clear();
    if (routeGeometry) {
      const feature = new GeoJSON().readFeature(
        {
          type: 'Feature',
          geometry: routeGeometry,
          properties: {},
        },
        {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        },
      );
      src.addFeature(feature as Feature);
      
	const extent = src.getExtent();
		if (extent) {
	  mapInstance.current?.getView().fit(extent, {padding: [60, 60, 60, 60],duration: 800 });
//	}

	  // mapInstance.current
        // ?.getView()
        // .fit(src.getExtent(), {
          // padding: [60, 60, 60, 60],
          // duration: 800,
//      });
    }


    }
  }, [routeGeometry]);  

  // ── Marqueur ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!markerLayerRef.current) return;
    const src = markerLayerRef.current.getSource()!;
    src.clear();
    if (markerCoords) {
      src.addFeature(
        new Feature({
          geometry: new Point(fromLonLat(markerCoords)),
        }),
      );
      mapInstance.current?.getView().animate({
        center: fromLonLat(markerCoords),
        zoom: 15,
        duration: 600,
      });
    }
  }, [markerCoords]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
}

// ─── Helpers internes ─────────────────────────────────────────────────────────

function removeDraw(map: OlMap) {
  const toRemove = map
    .getInteractions()
    .getArray()
    .filter((i) => i instanceof Draw || i instanceof Snap);
  toRemove.forEach((i) => map.removeInteraction(i));
}

async function loadAllWMTSLayers(
  map: OlMap,
  layers: IGNLayer[],
  tileLayersMap: Map<string, TileLayer>,
): Promise<void> {
  try {
    const res = await fetch(
      `${GPF_ENDPOINTS.WMTS}?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities`,
    );
    const text = await res.text();
    const caps = new WMTSCapabilities().read(text);

    for (const layerDef of layers) {
      try {
        const options = optionsFromCapabilities(caps, {
          layer: layerDef.id,
          matrixSet: 'PM',
          style: 'normal',
        });
        if (!options) {
          console.warn(`Couche IGN introuvable: ${layerDef.id}`);
          continue;
        }
        const tl = new TileLayer({
          source: new WMTS(options),
          visible: layerDef.defaultVisible,
          opacity: layerDef.defaultOpacity,
          zIndex: layerDef.defaultVisible ? 1 : 0,
          properties: { id: layerDef.id },
        });
        map.addLayer(tl);
        tileLayersMap.set(layerDef.id, tl);
      } catch (e: unknown) {
        console.warn(`Couche ${layerDef.id}:`, e);
      }
    }
  } catch (e: unknown) {
    console.error('GetCapabilities WMTS:', e);
    for (const layerDef of layers) {
      const tl = new TileLayer({
        source: new WMTS({
          url: `${GPF_ENDPOINTS.WMTS}?`,
          layer: layerDef.id,
          matrixSet: 'PM',
          format: 'image/png',
          projection: 'EPSG:3857',
          style: 'normal',
          tileGrid: undefined as any,
          requestEncoding: 'KVP',
        }),
        visible: layerDef.defaultVisible,
        opacity: layerDef.defaultOpacity,
        properties: { id: layerDef.id },
      });
      map.addLayer(tl);
      tileLayersMap.set(layerDef.id, tl);
    }
  }
}