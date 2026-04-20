/**
 * measure.ts
 * Utilitaires de mesure géodésique (longueur et surface)
 *
 * On utilise ol/sphere pour les calculs geodésiques corrects sur l'ellipsoïde,
 * ce qui est indispensable pour des mesures précises à toutes les latitudes.
 */

import { getLength, getArea } from 'ol/sphere';
import type { Geometry } from 'ol/geom';

// ─── Formatage ────────────────────────────────────────────────────────────────

/**
 * Formate une longueur en m, km ou pour les très courtes distances en cm
 */
export function formatLength(geometry: Geometry): string {
  const length = getLength(geometry, { projection: 'EPSG:3857' });
  if (length < 0.1) return `${(length * 100).toFixed(1)} cm`;
  if (length < 1) return `${(length * 100).toFixed(0)} cm`;
  if (length < 1000) return `${length.toFixed(1)} m`;
  return `${(length / 1000).toFixed(3)} km`;
}

/**
 * Formate une surface en m², ha, km²
 */
export function formatArea(geometry: Geometry): string {
  const area = getArea(geometry, { projection: 'EPSG:3857' });
  if (area < 1) return `${(area * 10000).toFixed(1)} cm²`;
  if (area < 10000) return `${area.toFixed(1)} m²`;
  if (area < 1_000_000) return `${(area / 10000).toFixed(2)} ha`;
  return `${(area / 1_000_000).toFixed(4)} km²`;
}

/**
 * Retourne la valeur numérique brute de la longueur en mètres
 */
export function getLengthMeters(geometry: Geometry): number {
  return getLength(geometry, { projection: 'EPSG:3857' });
}

/**
 * Retourne la valeur numérique brute de la surface en m²
 */
export function getAreaSqMeters(geometry: Geometry): number {
  return getArea(geometry, { projection: 'EPSG:3857' });
}

// ─── Niveaux de zoom et résolution ────────────────────────────────────────────

/**
 * Calcule la résolution au sol en m/px pour un niveau de zoom et une latitude donnés.
 * Formule : résolution = (156543.03 * cos(lat)) / 2^zoom
 * Valable pour la projection WebMercator (EPSG:3857)
 */
export function getResolutionAtZoom(zoom: number, latDeg = 46.5): number {
  const latRad = (latDeg * Math.PI) / 180;
  return (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom);
}

/**
 * Niveau de zoom correspondant à une résolution donnée (en m/px)
 * Inverse de getResolutionAtZoom
 */
export function getZoomForResolution(resolutionMPerPx: number, latDeg = 46.5): number {
  const latRad = (latDeg * Math.PI) / 180;
  return Math.log2((156543.03392 * Math.cos(latRad)) / resolutionMPerPx);
}

/**
 * Calcule l'échelle cartographique approximative (1/N) pour un zoom et DPI donnés.
 * Exemple : zoom 22 ≈ 1/265 à 96 DPI, latitude France
 *
 * Formule : échelle = résolution_m_par_px * dpi / 0.0254
 * (0.0254 m = 1 pouce)
 */
export function getMapScale(zoom: number, dpi = 96, latDeg = 46.5): number {
  const resolution = getResolutionAtZoom(zoom, latDeg);
  return resolution * dpi / 0.0254;
}

/**
 * Niveau de zoom cible pour une échelle cartographique 1/N
 * Ex : scaleN=100 → zoom ≈ 22.6 (France, 96 DPI)
 */
export function getZoomForScale(scaleN: number, dpi = 96, latDeg = 46.5): number {
  const resolution = (scaleN * 0.0254) / dpi;
  return getZoomForResolution(resolution, latDeg);
}

// ─── Types exports ────────────────────────────────────────────────────────────

export type MeasureMode = 'none' | 'length' | 'area';

export interface MeasureResult {
  mode: MeasureMode;
  value: string;         // valeur formatée (ex: "1.234 km")
  rawMeters: number;     // longueur en m (ou périmètre pour surface)
  rawSqMeters?: number;  // surface en m² (uniquement pour mode area)
  points: number;        // nombre de points du dessin
}
