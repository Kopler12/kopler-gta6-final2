// pedestrians.js — sidewalk walkers who stroll the city and flee from
// speeding cars and gunfire. Each pedestrian is a simple procedural figure
// with a coloured shirt, and walks a street line, turning at intersections.

import { clamp, mulberry32, pick } from './util.js';
import { CITY } from './world.js';

const SHIRTS = [0xe84a5f, 0x2a9d8f, 0xf4a261, 0x457b9d, 0xe9c46a, 0x9b5de5, 0xffffff, 0xef476f];

export function makePedestrianMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b2d42 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.3), shirt);
  torso.position.y = 1.05; torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62; head.castShadow = true;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), pants);
  legL.position.set(-0.14, 0.33, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.14; g.add(legR);
  g.userData.legL = legL; g.userData.legR = legR;
  return g;
}

export class Pedestrian {
  constructor(scene, rng, x, z) {
    this.mesh = makePedestrianMesh(rng);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.heading = rng() * Math.PI * 2;
    this.speed = 1.2 + rng() * 0.8;
    this.fleeing = false;
    this.fleeTimer = 0;
    this.walkPhase = rng() * 10;
    this.rng = rng;
  }

  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }

  // Walk along the sidewalk; when scared, run away from the threat point.
  update(dt, threats) {
    let threat = null;
    for (const t of threats) {
      const dx = this.x - t.x, dz = this.z - t.z;
      if (dx * dx + dz * dz < t.radius * t.radius) { threat = t; break; }
    }
    if (threat) { this.fleeing = true; this.fleeTimer = 2.5; }
    else if (this.fleeTimer > 0) { this.fleeTimer -= dt; if (this.fleeTimer <= 0) this.fleeing = false; }

    if (this.fleeing && threat) {
      const dx = this.x - threat.x, dz = this.z - threat.z;
      const d = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
      this.heading = Math.atan2(dx / d, dz / d);
      this.speed = 5.5;
    } else {
      this.speed = 1.2 + Math.sin(this.walkPhase * 0.1) * 0.3;
      // Wander: occasionally pick a new heading, preferring street lines.
      if (this.rng() < dt * 0.05) this.heading += (this.rng() - 0.5) * 1.2;
    }
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    this.mesh.position.x = clamp(nx, -CITY.half, 125);
    this.mesh.position.z = clamp(nz, -CITY.half, CITY.half);
    this.mesh.rotation.y = this.heading;
    // Simple leg swing while walking.
    this.walkPhase += dt * this.speed * 3;
    const swing = Math.sin(this.walkPhase) * 0.45 * Math.min(1, this.speed / 3);
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
  }
}

export function spawnPedestrians(scene, seed, count) {
  const rng = mulberry32(seed + 777);
  const peds = [];
  const streets = [-90, -60, -30, 0, 30, 60, 90];
  for (let i = 0; i < count; i++) {
    const horizontal = rng() < 0.5;
    const line = pick(rng, streets) + (rng() < 0.5 ? 6 : -6);
    const along = (rng() * 2 - 1) * 105;
    peds.push(new Pedestrian(scene, rng,
      horizontal ? along : line, horizontal ? line : along));
  }
  return peds;
}
