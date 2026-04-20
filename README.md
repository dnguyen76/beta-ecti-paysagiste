# IGN Explorer — Next.js + OpenLayers + Géoplateforme

Application cartographique complète démontrant l'intégration des APIs IGN
(Géoplateforme) dans un projet **Next.js 14** avec **OpenLayers 9** et les
**extensions geopf-extensions-openlayers**.

---

## Stack technique

| Technologie | Version | Rôle |
|---|---|---|
| Next.js | 14.x | Framework React (App Router) |
| OpenLayers | 9.x | Moteur cartographique |
| geopf-extensions-openlayers | 3.4.x | Widgets IGN (SearchEngine, Route, Isocurve…) |
| TypeScript | 5.x | Typage statique |

---

## Installation

```bash
git clone <ce-repo>
cd ign-nextjs-demo
npm install
npm run dev
```

L'application tourne sur `http://localhost:3000`.

---

## Structure du projet

```
src/
├── app/
│   ├── globals.css        # Styles globaux + import CSS OL/IGN
│   ├── layout.tsx         # Layout racine Next.js
│   └── page.tsx           # Page principale (état global, coordination)
│
├── components/map/
│   ├── MapView.tsx        # Composant carte OL (chargé sans SSR)
│   └── Sidebar.tsx        # Panneau latéral (couches, search, altitude, route)
│
└── lib/
    ├── ign-layers.ts      # Catalogue des couches IGN + endpoints GPF
    └── gpf-api.ts         # Wrappers fetch vers les APIs Géoplateforme
```

---

## APIs Géoplateforme utilisées

Toutes les APIs ci-dessous sont **publiques** (sans clé API) :

### Couches cartographiques WMTS
```
GET https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetCapabilities
```
Couches utilisées :
- `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2` — Plan IGN v2
- `ORTHOIMAGERY.ORTHOPHOTOS` — Orthophotos HD
- `CADASTRALPARCELS.PARCELLAIRE_EXPRESS` — Parcellaire cadastral
- `ELEVATION.SLOPES` — Carte des pentes
- `LANDCOVER.HR_IMPERVIOUSNESS` — Imperméabilité des sols

### Géocodage
```
GET https://data.geopf.fr/geocodage/search?q={adresse}&limit=5
GET https://data.geopf.fr/geocodage/reverse?lon={lon}&lat={lat}
```

### Altimétrie
```
GET https://data.geopf.fr/altimetrie/rest/elevationLine?lon={lon}&lat={lat}&resource=ign_rge_alti_wld
```

### Itinéraire
```
GET https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car&start={lon,lat}&end={lon,lat}
```

---

## Fonctionnalités implémentées

### ✅ Couches WMTS
- Chargement via `GetCapabilities` (options automatiques)
- Toggle visibilité par couche
- Contrôle d'opacité par couche

### ✅ Géocodage
- Autocomplétion avec debounce 400ms
- Zoom automatique sur le résultat
- Géocodage inverse au clic carte

### ✅ Altimétrie
- Sélection d'un point par clic
- Appel API RGE Alti® 1m
- Affichage de l'altitude en mètres

### ✅ Itinéraire
- Saisie adresse départ / arrivée
- Géocodage automatique des adresses
- Calcul voiture ou piéton
- Affichage tracé sur la carte
- Résumé distance + durée + étapes

---

## Intégration des extensions IGN officielles

Les extensions `geopf-extensions-openlayers` sont prêtes à être activées.
Des exemples commentés sont présents dans `MapView.tsx` :

```typescript
// Import direct (recommandé pour webpack/Vite)
import SearchEngine from 'geopf-extensions-openlayers/src/packages/Controls/SearchEngine/SearchEngine';
import Route from 'geopf-extensions-openlayers/src/packages/Controls/Route/Route';
import Isocurve from 'geopf-extensions-openlayers/src/packages/Controls/Isocurve/Isocurve';
import ElevationPath from 'geopf-extensions-openlayers/src/packages/Controls/ElevationPath/ElevationPath';
import LayerSwitcher from 'geopf-extensions-openlayers/src/packages/Controls/LayerSwitcher/LayerSwitcher';

// Ajout sur la carte
map.addControl(new SearchEngine({ displayMarker: true, zoomTo: 'auto' }));
map.addControl(new Route({ graphs: ['Voiture', 'Pieton'] }));
map.addControl(new Isocurve({ methods: ['time', 'distance'] }));
map.addControl(new ElevationPath());
map.addControl(new LayerSwitcher());
```

Pour le CSS des widgets, importer dans `globals.css` :
```css
@import 'geopf-extensions-openlayers/dist/GpPluginOpenLayers.css';
```

---

## Considérations Next.js

### Import dynamique obligatoire
OpenLayers accède au DOM — il ne peut pas être rendu côté serveur (SSR).
```typescript
// page.tsx
const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false });
```

### Configuration webpack
```javascript
// next.config.js
transpilePackages: ['ol', 'geopf-extensions-openlayers']
```

### CSS OpenLayers
```css
/* globals.css — doit être importé une seule fois */
@import 'ol/ol.css';
```

---

## Données restreintes (SCANs IGN)

Pour accéder aux données SCAN 25®, SCAN 100®, utiliser la clé transitoire :
```
apikey=ign_scan_ws
URL de base : https://data.geopf.fr/private/wmts
```

Pour des clés personnalisées : `contact.geoservices@ign.fr`

---

## Licence

Code source : MIT  
Données IGN : Licence ouverte Etalab 2.0 (données libres)
