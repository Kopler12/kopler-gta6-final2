// world.js — builds the living city of San Verano: a sun-soaked coastal
// grid city with neon buildings, roads, beach, sea, palms and streetlights.
// All geometry is procedural and deterministic from a seed, so the city is
// identical on every load. Colliders are axis-aligned boxes the cars and
// the player push against.

import { mulberry32, pick, canvasTexture, neonSignTexture, facadeTexture, roadTexture } from './util.js';

export const CITY = {
  half: 120,            // city extends -120..120 on both axes
  streetSpacing: 30,    // streets every 30 units
  roadWidth: 9,
  beachX: 108,          // sand starts here, sea beyond x = 128
};

const STREETS = [-90, -60, -30, 0, 30, 60, 90];

export function buildCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'SanVeranoCity';
  scene.add(group);

  // --- sky, sunset light, fog -------------------------------------------
  scene.background = new THREE.Color(0xff9e5e);
  scene.fog = new THREE.Fog(0xff9e5e, 140, 420);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
  sun.position.set(-80, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -140; sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -140;
  sun.shadow.camera.far = 400;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffd9a0, 0x2a1e3f, 0.85));

  // --- ground: grass/concrete base, sand beach, sea ---------------------
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x3d4a3a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 560),
    new THREE.MeshLambertMaterial({ color: 0xe8cf9a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(138, 0.02, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 560),
    new THREE.MeshLambertMaterial({ color: 0x1e6f8e }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(278, 0.01, 0);
  group.add(sea);

  // Boardwalk strip between city and sand.
  const walk = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 260),
    new THREE.MeshLambertMaterial({ color: 0x8a6f4d }));
  walk.rotation.x = -Math.PI / 2; walk.position.set(113, 0.03, 0);
  walk.receiveShadow = true;
  group.add(walk);

  // --- roads --------------------------------------------------------------
  const roadMatH = new THREE.MeshLambertMaterial({ map: roadTexture(true) });
  const roadMatV = new THREE.MeshLambertMaterial({ map: roadTexture(false) });
  roadMatH.map.wrapS = roadMatH.map.wrapT = THREE.RepeatWrapping;
  roadMatV.map.wrapS = roadMatV.map.wrapT = THREE.RepeatWrapping;
  for (const s of STREETS) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(240, CITY.roadWidth), roadMatH.clone());
    h.material.map = roadMatH.map.clone();
    h.material.map.repeat.set(20, 1); h.material.map.needsUpdate = true;
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.05, s); h.receiveShadow = true;
    group.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, 240), roadMatV.clone());
    v.material.map = roadMatV.map.clone();
    v.material.map.repeat.set(1, 20); v.material.map.needsUpdate = true;
    v.rotation.x = -Math.PI / 2; v.position.set(s, 0.05, 0); v.receiveShadow = true;
    group.add(v);
    // Sidewalk strips along every street.
    const swMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
    const sw1 = new THREE.Mesh(new THREE.PlaneGeometry(240, 3), swMat);
    sw1.rotation.x = -Math.PI / 2; sw1.position.set(0, 0.04, s + 6); group.add(sw1);
    const sw2 = new THREE.Mesh(new THREE.PlaneGeometry(240, 3), swMat);
    sw2.rotation.x = -Math.PI / 2; sw2.position.set(0, 0.04, s - 6); group.add(sw2);
    const sw3 = new THREE.Mesh(new THREE.PlaneGeometry(3, 240), swMat);
    sw3.rotation.x = -Math.PI / 2; sw3.position.set(s + 6, 0.04, 0); group.add(sw3);
    const sw4 = new THREE.Mesh(new THREE.PlaneGeometry(3, 240), swMat);
    sw4.rotation.x = -Math.PI / 2; sw4.position.set(s - 6, 0.04, 0); group.add(sw4);
  }

  // --- buildings: one or two per block, with lit windows + neon signs ----
  const wallColors = ['#b98a5e', '#7e8aa0', '#a05e6e', '#5e7a6e', '#8a7aa0', '#c2a06a'];
  const signWords = ['NEON', 'TACOS', 'HOTEL', 'PIER 9', 'CLUB', '24H', 'SURF', 'BAR', 'DINE', 'MOTEL'];
  const signColors = ['#ff2d95', '#00e5ff', '#ffe600', '#7cff00', '#ff6b35'];
  const buildingMeshes = [];
  for (let bx = 0; bx < STREETS.length - 1; bx++) {
    for (let bz = 0; bz < STREETS.length - 1; bz++) {
      const cx = (STREETS[bx] + STREETS[bx + 1]) / 2;
      const cz = (STREETS[bz] + STREETS[bz + 1]) / 2;
      // Keep the garage block and the central plaza clear for missions.
      if (Math.abs(cx + 75) < 16 && Math.abs(cz + 75) < 16) continue;
      if (Math.abs(cx) < 16 && Math.abs(cz) < 16) continue;
      const count = rng() < 0.6 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const w = 9 + rng() * 6, d = 9 + rng() * 6, hgt = 10 + rng() * 34;
        const ox = (k === 0 ? -5 : 5) + (rng() - 0.5) * 2;
        const oz = (k === 0 ? -4 : 4) + (rng() - 0.5) * 2;
        const x = cx + ox, z = cz + oz;
        const tex = facadeTexture(rng, pick(rng, wallColors), pick(rng, ['#ffd27a', '#ffe9a8', '#9fd8ff']));
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), mat);
        b.position.set(x, hgt / 2, z);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b); buildingMeshes.push(b);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        // Neon sign on the front face of taller buildings.
        if (hgt > 18 && rng() < 0.75) {
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(9, 2.2),
            new THREE.MeshBasicMaterial({ map: neonSignTexture(pick(rng, signWords), pick(rng, signColors)) }));
          sign.position.set(x, Math.min(hgt - 2, 14), z + d / 2 + 0.15);
          group.add(sign);
        }
      }
    }
  }

  // --- central plaza: fountain + palms ------------------------------------
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7, 1, 24),
    new THREE.MeshLambertMaterial({ color: 0x2e7f9e }));
  plaza.position.set(0, 0.5, 0); plaza.castShadow = true;
  group.add(plaza);
  // No collider: the fountain sits in the middle of the intersection like a
  // roundabout and cars drive around (and over) it.

  // --- Mara's garage (mission hub, SW block) ------------------------------
  const garage = new THREE.Group();
  const gBase = new THREE.Mesh(
    new THREE.BoxGeometry(20, 8, 14),
    new THREE.MeshLambertMaterial({ color: 0x4a5a6e }));
  gBase.position.y = 4; gBase.castShadow = true; gBase.receiveShadow = true;
  garage.add(gBase);
  const gSign = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 3),
    new THREE.MeshBasicMaterial({ map: neonSignTexture("MARA'S GARAGE", '#ff2d95') }));
  gSign.position.set(0, 7, 7.2);
  garage.add(gSign);
  const gDoor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 6),
    new THREE.MeshLambertMaterial({ color: 0x222831 }));
  gDoor.position.set(0, 3, 7.05);
  garage.add(gDoor);
  garage.position.set(-75, 0, -75);
  group.add(garage);
  colliders.push({ minX: -85, maxX: -65, minZ: -82, maxZ: -68 });

  // --- harbour crates + pier (east beach) ----------------------------------
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a6b2f });
  for (let i = 0; i < 10; i++) {
    const s = 2 + rng() * 1.5;
    const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    c.position.set(112 + rng() * 8, s / 2, -40 + rng() * 90);
    c.rotation.y = rng() * Math.PI;
    c.castShadow = true;
    group.add(c);
    colliders.push({ minX: c.position.x - s / 2, maxX: c.position.x + s / 2, minZ: c.position.z - s / 2, maxZ: c.position.z + s / 2 });
  }
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(6, 1, 60),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
  pier.position.set(132, 0.6, -30); pier.castShadow = true;
  group.add(pier);

  // --- palm trees along the beach and plaza --------------------------------
  const palmPositions = [];
  for (let z = -110; z <= 110; z += 14) palmPositions.push([112, z + (rng() - 0.5) * 4]);
  for (let i = 0; i < 10; i++) palmPositions.push([(rng() - 0.5) * 30, (rng() - 0.5) * 30 + (rng() < 0.5 ? -60 : 60)]);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b4a });
  for (const [px, pz] of palmPositions) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 6), trunkMat);
    trunk.position.set(px, 3.5, pz); trunk.castShadow = true;
    group.add(trunk);
    for (let l = 0; l < 5; l++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 4), leafMat);
      const a = (l / 5) * Math.PI * 2;
      leaf.position.set(px + Math.cos(a) * 1.6, 7.2, pz + Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 0.9;
      leaf.rotation.x = -Math.sin(a) * 0.9;
      group.add(leaf);
    }
  }

  // --- streetlights at intersections ---------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x333a44 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const sx of STREETS) {
    for (const sz of STREETS) {
      if (rng() < 0.35) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
      pole.position.set(sx + 5.5, 3, sz + 5.5);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampMat);
      lamp.position.set(sx + 5.5, 6.2, sz + 5.5);
      group.add(lamp);
    }
  }

  return {
    group, colliders, streets: STREETS,
    garagePos: { x: -75, z: -60 },
    harbourPos: { x: 112, z: 20 },
    pierPos: { x: 132, z: -30 },
    plazaPos: { x: 0, z: 0 },
    beachPos: { x: 118, z: 60 },
  };
}

// Push a circle (player or car) out of every building AABB it overlaps.
// Returns true if any collision happened.
export function resolveCollisions(colliders, pos, radius) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        pos.x = c.maxX + radius;
      }
    }
  }
  return hit;
}

// True when the point sits on a road (within half the road width of a street line).
export function isOnRoad(x, z) {
  for (const s of STREETS) {
    if (Math.abs(z - s) < CITY.roadWidth / 2 + 1) return true;
    if (Math.abs(x - s) < CITY.roadWidth / 2 + 1) return true;
  }
  return false;
}

// Snap a point to the nearest street line (used to place traffic cars).
export function nearestStreetCoord(v) {
  let best = STREETS[0], bd = Infinity;
  for (const s of STREETS) {
    const d = Math.abs(v - s);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
