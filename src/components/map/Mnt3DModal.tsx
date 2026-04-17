'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getElevationGrid } from '@/lib/gpf-api';
import type { LigneMetrage } from '@/lib/paysagiste';
import { coordsRelatives, type CoordImplantation } from '@/lib/paysagiste';

interface Props {
  bbox: [number, number, number, number];
  lignesMetrage: LigneMetrage[];
  onClose: () => void;
}

// Interpoler l'altitude à une position (x,y) depuis la grille
function interpolateZ(
  grid: { z: number; x: number; y: number }[][],
  xQ: number, yQ: number,
  xMax: number, yMax: number
): number {
  const GRID = grid.length;
  const col = Math.max(0, Math.min(GRID - 1, Math.round((xQ / xMax) * (GRID - 1))));
  const row = Math.max(0, Math.min(GRID - 1, Math.round((yQ / yMax) * (GRID - 1))));
  return grid[row]?.[col]?.z ?? 0;
}

export default function Mnt3DModal({ bbox, lignesMetrage, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [info, setInfo]       = useState('');
  const cleanupRef = useRef<(() => void) | null>(null);

  const buildScene = useCallback(async () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const THREE = await import('three');

    // ── Grille MNT ──────────────────────────────────────────────────────────
    const GRID = 16;
    const [lonMin, latMin, lonMax, latMax] = bbox;
    let grid: { z: number; x: number; y: number }[][];
    try {
      grid = await getElevationGrid(bbox, GRID);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Erreur API altimétrie');
    }

    const zValues = grid.flat().map((p) => p.z).filter((z) => isFinite(z) && z > -500);
    if (zValues.length === 0) throw new Error('Aucune altitude valide (zone hors couverture)');

    const zMin  = Math.min(...zValues);
    const zMax  = Math.max(...zValues);
    const zRange = Math.max(zMax - zMin, 1);
    const xMax  = grid[0][GRID - 1].x;
    const yMax  = grid[GRID - 1][0].y;
    const footprint = Math.max(xMax, yMax); // emprise max

    // ── Exagération adaptative ───────────────────────────────────────────────
    // Zone très plate (<5m de dénivelé) → ×8, modérée → ×3, montagne → ×1.2
    const EXAG = zRange < 5 ? 8 : zRange < 20 ? 5 : zRange < 100 ? 3 : zRange < 300 ? 2 : 1.2;
    setInfo(
      `Alt. ${zMin.toFixed(0)}–${zMax.toFixed(0)} m · ΔZ=${zRange.toFixed(0)} m · emprise ${(xMax/1000).toFixed(2)}×${(yMax/1000).toFixed(2)} km · exag. ×${EXAG}`
    );

    // ── Scène ───────────────────────────────────────────────────────────────
    const W = canvas.clientWidth  || 780;
    const H = canvas.clientHeight || 460;
    canvas.width  = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x0d1b2a);

    const scene  = new THREE.Scene();
    // Brume légère pour la profondeur
    scene.fog = new THREE.Fog(0x0d1b2a, footprint * 2, footprint * 5);

    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, footprint * 10);
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffeebb, 1.0);
    sun.position.set(xMax * 0.8, zRange * EXAG * 3, yMax * 0.5);
    scene.add(sun);

    // ── Terrain ─────────────────────────────────────────────────────────────
    const geo = new THREE.PlaneGeometry(xMax, yMax, GRID - 1, GRID - 1);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const idx = row * GRID + col;
        const z = grid[row][col].z;
        const zSafe = (isFinite(z) && z > -500) ? z : zMin;
        pos.setY(idx, (zSafe - zMin) * EXAG);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // Couleurs terrain par altitude
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, pos.getY(i) / (zRange * EXAG)));
      let r: number, g: number, b: number;
      if (t < 0.25)      { r = 0.13 + t*0.7; g = 0.42 + t*0.4; b = 0.07; }
      else if (t < 0.55) { const s=(t-0.25)/0.3; r=0.30+s*0.32; g=0.52-s*0.18; b=0.08; }
      else if (t < 0.80) { const s=(t-0.55)/0.25; r=0.52+s*0.18; g=0.38-s*0.08; b=0.08+s*0.1; }
      else               { const s=(t-0.80)/0.20; r=0.70+s*0.28; g=0.60+s*0.38; b=0.28+s*0.70; }
      colors[i*3]=r; colors[i*3+1]=g; colors[i*3+2]=b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(geo, mat));

    // Fil de fer discret
    const wireGeo = new THREE.WireframeGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.06 });
    scene.add(new THREE.LineSegments(wireGeo, wireMat));

    // ── Éléments paysagistes sur le relief ──────────────────────────────────
    const withVerts = lignesMetrage.filter((l) => l.vertices && l.vertices.length > 0);
    if (withVerts.length > 0) {
      // Calculer les coords relatives (mêmes que dans le plan)
      const allPts: CoordImplantation[] = [];
      withVerts.forEach((l, fi) =>
        (l.vertices ?? []).forEach((v, vi) =>
          allPts.push({ lon: v.lon, lat: v.lat, label: l.nom, figureIdx: fi, vertexIdx: vi, geomType: l.geomType })
        )
      );
      const relAll = coordsRelatives(allPts);
      const figMap = new Map<number, typeof relAll>();
      relAll.forEach((p) => {
        if (!figMap.has(p.figureIdx)) figMap.set(p.figureIdx, []);
        figMap.get(p.figureIdx)!.push(p);
      });

      // Pour chaque élément, placer un symbole 3D sur le terrain
      withVerts.forEach((ligne, figIdx) => {
        const pts = figMap.get(figIdx) ?? [];
        if (pts.length === 0) return;

        // Convertir les coordonnées relatives (depuis l'origine SW du projet) vers l'espace 3D
        // L'espace 3D a son origine au coin SW de la bbox, donc on recale
        const M = 111319.49;
        const cosLat = Math.cos(((latMin + latMax) / 2) * Math.PI / 180);
        const toScene = (lon: number, lat: number) => ({
          sx: (lon - lonMin) * cosLat * M,
          sy: (lat - latMin) * M,
        });

        // Couleur de l'élément
        const hex = ligne.color.replace('#', '');
        const elemColor = new THREE.Color(
          parseInt(hex.slice(0,2),16)/255,
          parseInt(hex.slice(2,4),16)/255,
          parseInt(hex.slice(4,6),16)/255,
        );
        const elemMat = new THREE.MeshLambertMaterial({ color: elemColor });
        const elemMatLine = new THREE.LineBasicMaterial({ color: elemColor, linewidth: 2 });

        // Altitude du centroïde de la feature (interpolée depuis la grille)
        const cx3d = pts.reduce((s,p) => s + toScene(lonMin + p.xM/(cosLat*M), latMin + p.yM/M).sx, 0) / pts.length;
        const cy3d = pts.reduce((s,p) => s + toScene(lonMin + p.xM/(cosLat*M), latMin + p.yM/M).sy, 0) / pts.length;
        const czBase = (interpolateZ(grid, cx3d, cy3d, xMax, yMax) - zMin) * EXAG;

        if (ligne.geomType === 'Point') {
          // Cylindre vertical pour les arbres/points
          const h = zRange * EXAG * 0.04 + 2;
          const cylGeo = new THREE.CylinderGeometry(0.5, 0.8, h, 6);
          const cyl = new THREE.Mesh(cylGeo, elemMat);
          cyl.position.set(cx3d, czBase + h / 2, cy3d);
          scene.add(cyl);
          // Petite sphère au sommet
          const sphGeo = new THREE.SphereGeometry(1.2, 6, 6);
          const sph = new THREE.Mesh(sphGeo, elemMat);
          sph.position.set(cx3d, czBase + h + 1.2, cy3d);
          scene.add(sph);

        } else if (ligne.geomType === 'LineString') {
          // Tube le long des sommets
          const linePoints = pts.map((p) => {
            const {sx, sy} = toScene(lonMin + p.xM/(cosLat*M), latMin + p.yM/M);
            const sz = (interpolateZ(grid, sx, sy, xMax, yMax) - zMin) * EXAG + 0.5;
            return new THREE.Vector3(sx, sz, sy);
          });
          if (linePoints.length >= 2) {
            const curve = new THREE.CatmullRomCurve3(linePoints);
            const tubeGeo = new THREE.TubeGeometry(curve, linePoints.length * 4, 0.4, 4, false);
            scene.add(new THREE.Mesh(tubeGeo, elemMat));
          }

        } else if (ligne.geomType === 'Polygon') {
          // Polygone plat légèrement surélevé
          const shape = new THREE.Shape();
          pts.forEach((p, i) => {
            const {sx, sy} = toScene(lonMin + p.xM/(cosLat*M), latMin + p.yM/M);
            if (i === 0) shape.moveTo(sx, sy); else shape.lineTo(sx, sy);
          });
          shape.closePath();
          const shapeGeo = new THREE.ShapeGeometry(shape);
          const shapeMesh = new THREE.Mesh(shapeGeo,
            new THREE.MeshLambertMaterial({ color: elemColor, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
          );
          shapeMesh.rotation.x = -Math.PI / 2;
          shapeMesh.position.y = czBase + 0.3;
          scene.add(shapeMesh);
          // Contour
          const contourPts = pts.map((p) => {
            const {sx, sy} = toScene(lonMin + p.xM/(cosLat*M), latMin + p.yM/M);
            return new THREE.Vector3(sx, czBase + 0.4, sy);
          });
          if (contourPts.length >= 2) {
            contourPts.push(contourPts[0].clone());
            const contourGeo = new THREE.BufferGeometry().setFromPoints(contourPts);
            scene.add(new THREE.Line(contourGeo, elemMatLine));
          }
        }

        // ── Label texte via canvas 2D → sprite ──────────────────────────────
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 256; labelCanvas.height = 48;
        const lctx = labelCanvas.getContext('2d')!;
        lctx.clearRect(0, 0, 256, 48);
        lctx.fillStyle = 'rgba(10,20,30,0.75)';
        lctx.roundRect?.(2, 8, 252, 34, 6);
        lctx.fill();
        lctx.fillStyle = ligne.color;
        lctx.font = 'bold 18px Arial';
        lctx.textAlign = 'center';
        lctx.textBaseline = 'middle';
        lctx.fillText(ligne.nom.slice(0, 22), 128, 26);

        const labelTex = new THREE.CanvasTexture(labelCanvas);
        const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(labelMat);
        const labelH = zRange * EXAG * 0.06 + 5;
        sprite.position.set(cx3d, czBase + labelH, cy3d);
        sprite.scale.set(xMax * 0.12, xMax * 0.03, 1);
        scene.add(sprite);
      });
    }

    // ── Flèche Nord ─────────────────────────────────────────────────────────
    // Positionnée en haut à droite du terrain, à altitude maximale
    {
      const nx = xMax * 0.88, ny = yMax * 0.88;
      const nz = (zMax - zMin) * EXAG + zRange * EXAG * 0.15 + 3;
      const arrowLen = Math.max(xMax, yMax) * 0.06;

      // Tige de la flèche (vers le nord = +Y en Three.js = +lat)
      const arrowPts = [
        new THREE.Vector3(nx, nz, ny),
        new THREE.Vector3(nx, nz, ny + arrowLen),
      ];
      const arrowGeo = new THREE.BufferGeometry().setFromPoints(arrowPts);
      scene.add(new THREE.Line(arrowGeo, new THREE.LineBasicMaterial({ color: 0xff3333, linewidth: 3 })));

      // Pointe de flèche (cône)
      const coneGeo = new THREE.ConeGeometry(arrowLen * 0.15, arrowLen * 0.35, 6);
      const cone = new THREE.Mesh(coneGeo, new THREE.MeshLambertMaterial({ color: 0xff3333 }));
      cone.position.set(nx, nz + arrowLen * 0.18, ny + arrowLen);
      scene.add(cone);

      // Label "N" via sprite
      const nc = document.createElement('canvas');
      nc.width = 64; nc.height = 64;
      const nctx = nc.getContext('2d')!;
      nctx.fillStyle = '#ff3333';
      nctx.font = 'bold 48px Arial';
      nctx.textAlign = 'center';
      nctx.textBaseline = 'middle';
      nctx.fillText('N', 32, 32);
      const nTex = new THREE.CanvasTexture(nc);
      const nSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: nTex, transparent: true, depthTest: false }));
      nSprite.position.set(nx, nz + arrowLen * 0.5, ny + arrowLen * 1.4);
      nSprite.scale.set(arrowLen * 0.6, arrowLen * 0.6, 1);
      scene.add(nSprite);
    }

    // ── Contrôles orbite ────────────────────────────────────────────────────
    let isDragging = false, lastX = 0, lastY = 0;
    let azimuth = 0.3, elevation = 0.55;
    let radius = footprint * 1.4;
    const target = new THREE.Vector3(xMax / 2, zRange * EXAG * 0.3, yMax / 2);

    const updateCamera = () => {
      camera.position.x = target.x + radius * Math.sin(azimuth) * Math.cos(elevation);
      camera.position.y = target.y + radius * Math.sin(elevation);
      camera.position.z = target.z + radius * Math.cos(azimuth) * Math.cos(elevation);
      camera.lookAt(target);
    };
    updateCamera();

    const onMouseDown = (e: MouseEvent) => { isDragging = true; lastX = e.clientX; lastY = e.clientY; };
    const onMouseUp   = () => { isDragging = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      azimuth   -= (e.clientX - lastX) * 0.008;
      elevation  = Math.max(-1.3, Math.min(1.3, elevation + (e.clientY - lastY) * 0.008));
      lastX = e.clientX; lastY = e.clientY;
      updateCamera();
    };
    const onWheel = (e: WheelEvent) => {
      radius = Math.max(50, radius * (1 + e.deltaY * 0.001));
      updateCamera();
      e.preventDefault();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup',   onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel',     onWheel, { passive: false });

    let animId = 0;
    const animate = () => { animId = requestAnimationFrame(animate); renderer.render(scene, camera); };
    animate();

    cleanupRef.current = () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup',   onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      renderer.dispose();
    };
  }, [bbox, lignesMetrage]);

  useEffect(() => {
    setLoading(true); setError(null);
    buildScene()
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
    return () => { cleanupRef.current?.(); };
  }, [buildScene]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--color-surface)', borderRadius: 14,
        border: '1px solid var(--color-border)',
        boxShadow: '0 20px 64px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column',
        width: 'min(860px, 96vw)', height: 'min(580px, 92vh)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontSize: 18 }}>🏔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Vue MNT 3D — RGE Alti IGN</div>
            {info && <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>{info}</div>}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'right', lineHeight: 1.5 }}>
            Glisser : rotation · Molette : zoom<br />🔴 Flèche rouge = Nord
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 20, padding: '2px 4px' }}>✕</button>
        </div>

        <div style={{ flex: 1, position: 'relative', background: '#0d1b2a' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', gap: 12 }}>
              <div style={{ fontSize: 32 }}>⏳</div>
              <div style={{ fontSize: 13 }}>Interrogation RGE Alti IGN… (~7s)</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>256 points · 4 batches · délai anti-rate-limit</div>
            </div>
          )}
          {error && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ef4444', gap: 10, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 32 }}>⚠️</div>
              <div style={{ fontSize: 11, maxWidth: 440, lineHeight: 1.6 }}>{error}</div>
            </div>
          )}
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        <div style={{ padding: '5px 16px', borderTop: '1px solid var(--color-border)', fontSize: 9, color: 'var(--color-text-muted)', flexShrink: 0 }}>
          Source : RGE Alti® IGN · data.geopf.fr · Exagération adaptative selon le relief · Grille 16×16
        </div>
      </div>
    </div>
  );
}
