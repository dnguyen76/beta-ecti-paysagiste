/**
 * gpf-api.ts
 * Fonctions utilitaires pour les APIs REST de la Géoplateforme IGN
 * Toutes les APIs utilisées ici sont publiques (sans clé)
 */

import { GPF_ENDPOINTS } from './ign-layers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeocodeResult {
  label: string;
  type: string;
  x: number;
  y: number;
  city?: string;
  postcode?: string;
  context?: string;
}

export interface ElevationResult {
  lon: number;
  lat: number;
  z: number;
  acc: number;
  source?: string;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
}

export interface RouteResult {
  distance: number;
  duration: number;
  geometry: GeoJSON.LineString;
  legs: RouteStep[];
}

// ─── Géocodage ────────────────────────────────────────────────────────────────

export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  const url = new URL(`${GPF_ENDPOINTS.GEOCODAGE}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '5');
  url.searchParams.set('returntruegeometry', 'false');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Géocodage échoué: ${res.status}`);
  const data = await res.json();

  return (data.features ?? []).map((f: any) => ({
    label: f.properties.label ?? f.properties.name,
    type: f.properties.type,
    x: f.geometry.coordinates[0],
    y: f.geometry.coordinates[1],
    city: f.properties.city,
    postcode: f.properties.postcode,
    context: f.properties.context,
  }));
}

export async function reverseGeocode(lon: number, lat: number): Promise<GeocodeResult | null> {
  const url = new URL(`${GPF_ENDPOINTS.GEOCODAGE}/reverse`);
  url.searchParams.set('lon', lon.toFixed(6));
  url.searchParams.set('lat', lat.toFixed(6));

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const f = data.features?.[0];
  if (!f) return null;

  return {
    label: f.properties.label ?? '',
    type: f.properties.type,
    x: f.geometry.coordinates[0],
    y: f.geometry.coordinates[1],
    city: f.properties.city,
    postcode: f.properties.postcode,
  };
}

// ─── Altimétrie ───────────────────────────────────────────────────────────────

/**
 * Récupère l'altitude via l'API Géoplateforme IGN v1.0
 *
 * Endpoint correct (doc IGN 2024/2025) :
 *   GET  https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json
 *        ?lon=5.9456|1.48&lat=44.1953|43.54&resource=ign_rge_alti_wld&delimiter=|&zonly=false
 *
 * Le séparateur est | (pipe) entre plusieurs points.
 * resource=ign_rge_alti_wld = RGE Alti France (précision ~1m en métropole)
 *
 * Réponse : { "elevations": [{ "lon": 5.9456, "lat": 44.1953, "z": 487.3, "acc": "..." }] }
 *
 * POST également supporté avec le même body JSON que les params GET.
 */
export async function getElevation(
  points: { lon: number; lat: number }[]
): Promise<ElevationResult[]> {
  if (points.length === 0) return [];

  const BASE = GPF_ENDPOINTS.ALTIMETRIE;
  // Le pipe | doit être LITTÉRAL dans l'URL (non encodé) — c'est la syntaxe IGN
  const lons = points.map((p) => p.lon.toFixed(6)).join('|');
  const lats = points.map((p) => p.lat.toFixed(6)).join('|');
  const errors: string[] = [];

  // ── Tentative 1 : GET avec pipe littéral (syntaxe officielle IGN) ──────────
  try {
    const url = `${BASE}/elevation.json?lon=${lons}&lat=${lats}&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false&zonly=false`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      const parsed = parseElevationResponse(data, points, 'GET RGE Alti 1m');
      if (parsed.length > 0) return parsed;
    } else {
      errors.push(`GET elevation.json → HTTP ${res.status}`);
    }
  } catch (e: unknown) {
    errors.push(`GET → ${e instanceof Error ? e.message : 'erreur'}`);
  }

  // ── Tentative 2 : POST (lon/lat comme strings séparés par pipe) ────────────
  try {
    const body = {
      lon: lons,
      lat: lats,
      resource: 'ign_rge_alti_wld',
      delimiter: '|',
      indent: 'false',
      measures: 'false',
      zonly: 'false',
    };
    const res = await fetch(`${BASE}/elevation.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      const parsed = parseElevationResponse(data, points, 'POST RGE Alti 1m');
      if (parsed.length > 0) return parsed;
    } else {
      errors.push(`POST elevation.json → HTTP ${res.status}`);
    }
  } catch (e: unknown) {
    errors.push(`POST → ${e instanceof Error ? e.message : 'erreur'}`);
  }

  // ── Tentative 3 : GET zonly=true (retourne tableau de nombres) ─────────────
  try {
    const url = `${BASE}/elevation.json?lon=${lons}&lat=${lats}&resource=ign_rge_alti_wld&delimiter=|&zonly=true`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((z: number, i: number) => ({
          lon: points[i]?.lon ?? 0, lat: points[i]?.lat ?? 0,
          z: typeof z === 'number' ? z : parseFloat(String(z)),
          acc: 0, source: 'GET zonly',
        }));
      }
      const parsed = parseElevationResponse(data, points, 'GET zonly');
      if (parsed.length > 0) return parsed;
    } else {
      errors.push(`GET zonly → HTTP ${res.status}`);
    }
  } catch (e: unknown) {
    errors.push(`GET zonly → ${e instanceof Error ? e.message : 'erreur'}`);
  }

  throw new Error(`API altimétrie IGN indisponible.\n${errors.join('\n')}`);
}

export async function getElevationGrid(
  bbox: [number, number, number, number],
  gridSize = 16
): Promise<{ z: number; x: number; y: number }[][]> {
  const [lonMin, latMin, lonMax, latMax] = bbox;
  const grid: { lon: number; lat: number }[] = [];
  const rows: number[] = [];
  const cols: number[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      grid.push({
        lon: lonMin + (lonMax - lonMin) * (col / (gridSize - 1)),
        lat: latMin + (latMax - latMin) * (row / (gridSize - 1)),
      });
      rows.push(row);
      cols.push(col);
    }
  }

  const BATCH = 40;
  const DELAY_MS = 350;
  const results: ElevationResult[] = [];
  for (let i = 0; i < grid.length; i += BATCH) {
    if (i > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
    const batch = grid.slice(i, i + BATCH);
    try {
      const res = await getElevation(batch);
      results.push(...res);
    } catch {
      batch.forEach((p) => results.push({ lon: p.lon, lat: p.lat, z: 0, acc: 0 }));
    }
  }

  const M = 111319.49;
  const cosLat = Math.cos(((latMin + latMax) / 2) * (Math.PI / 180));
  const grid2D: { z: number; x: number; y: number }[][] = Array.from(
    { length: gridSize }, () => Array(gridSize).fill({ z: 0, x: 0, y: 0 })
  );
  results.forEach((r, i) => {
    const row = rows[i], col = cols[i];
    if (row === undefined || col === undefined) return;
    grid2D[row][col] = {
      z: (typeof r.z === 'number' && isFinite(r.z)) ? r.z : 0,
      x: (r.lon - lonMin) * cosLat * M,
      y: (r.lat - latMin) * M,
    };
  });
  return grid2D;
}

function parseElevationResponse(
  data: any,
  points: { lon: number; lat: number }[],
  source: string
): ElevationResult[] {
  // Format standard : { elevations: [{ lon, lat, z, acc }] }
  if (Array.isArray(data?.elevations) && data.elevations.length > 0) {
    const results: ElevationResult[] = data.elevations.map((e: any, i: number) => ({
      lon: typeof e.lon === 'number' ? e.lon : points[i]?.lon ?? 0,
      lat: typeof e.lat === 'number' ? e.lat : points[i]?.lat ?? 0,
      z: typeof e.z === 'number' ? e.z : parseFloat(String(e.z ?? 'NaN')),
      acc: 0,
      source,
    }));
    if (results.every((r) => !isNaN(r.z) && r.z !== -99999)) return results;
  }
  // Tableau de z direct
  if (Array.isArray(data) && data.length > 0) {
    return data.map((z: number, i: number) => ({
      lon: points[i]?.lon ?? 0,
      lat: points[i]?.lat ?? 0,
      z: typeof z === 'number' ? z : parseFloat(String(z)),
      acc: 0,
      source,
    }));
  }
  return [];
}

// ─── Itinéraire ───────────────────────────────────────────────────────────────

export async function calculateRoute(
  start: { lon: number; lat: number },
  end: { lon: number; lat: number },
  profile: 'car' | 'pedestrian' = 'car'
): Promise<RouteResult> {
  const url = new URL(`${GPF_ENDPOINTS.ITINERAIRE}/itineraire`);
  url.searchParams.set('resource', 'bdtopo-osrm');
  url.searchParams.set('profile', profile);
  url.searchParams.set('optimization', 'fastest');
  url.searchParams.set('start', `${start.lon},${start.lat}`);
  url.searchParams.set('end', `${end.lon},${end.lat}`);
  url.searchParams.set('geometryFormat', 'geojson');
  url.searchParams.set('getSteps', 'true');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Itinéraire échoué: ${res.status}`);
  const data = await res.json();

  return {
    distance: data.distance ?? 0,
    duration: data.duration ?? 0,
    geometry: data.geometry,
    legs: (data.portions ?? []).flatMap((p: any) =>
      (p.steps ?? []).map((s: any) => ({
        instruction: s.instruction?.text ?? '',
        distance: s.distance ?? 0,
        duration: s.duration ?? 0,
      }))
    ),
  };
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}
