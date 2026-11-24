// vehicles.js — car meshes, arcade driving physics and traffic AI.
// Every car is a procedural box-built mesh: body, cabin, wheels, headlights,
// tail lights and (for police) a light bar. Traffic cars follow the street
// grid, turn at intersections and stop behind the car ahead.

import { clamp, angleDiff, dist2, mulberry32, pick } from './util.js';
import { resolveCollisions, nearestStreetCoord, CITY } from './world.js';

const CAR_COLORS = [0xd23b3b, 0x2b6fd2, 0xe8c33a, 0x3aa655, 0xe8e8e8, 0x222831, 0xd27a2b, 0x7a3ad2];

// Build a car mesh. `police` adds a black-and-white paint job and a light bar.
export function makeCarMesh(color, police) {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0xf2f2f2 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  car.add(body);
  const cabinMat = new THREE.MeshLambertMaterial({ color: police ? 0x1a1a1a : 0x1c2733 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), cabinMat);
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true;
  car.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    car.add(w); wheels.push(w);
  }
  // Headlights (white) and tail lights (red).
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const hx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), hl);
    h.position.set(hx, 0.6, 2.21); car.add(h);
  }
  const tl = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const tx of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tl);
    t.position.set(tx, 0.6, -2.21); car.add(t);
  }
  let lightBar = null;
  if (police) {
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 1.6), doorMat);
    door.position.set(0, 0.55, 0); car.add(door);
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.4; lightBar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.x = 0.4; lightBar.add(blue);
    lightBar.position.set(0, 1.5, -0.2);
    car.add(lightBar);
  }
  car.userData.wheels = wheels;
  car.userData.lightBar = lightBar;
  return car;
}

export class Car {
  constructor(scene, color, police, x, z, heading) {
    this.mesh = makeCarMesh(color, police);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.police = police;
    this.heading = heading;
    this.speed = 0;           // signed, units/second (forward positive)
    this.steer = 0;
    this.health = 100;
    this.smokeTimer = 0;
    this.flash = 0;           // police light-bar flash timer
    this.ai = null;           // traffic AI state, set by makeTrafficCar
    this.stopped = false;
  }

  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }
  setPos(x, z) { this.mesh.position.x = x; this.mesh.position.z = z; }

  // Arcade update for the PLAYER car: throttle, brake/reverse, steering that
  // scales down at speed, handbrake skid, building collisions, city bounds.
  updatePlayer(dt, input, colliders) {
    const maxSpeed = 42, maxReverse = 12;
    const accel = input.up ? 26 : 0;
    const brake = input.down ? 34 : 0;
    if (input.up) this.speed += accel * dt;
    else if (input.down) {
      if (this.speed > 0.5) this.speed -= brake * dt;
      else this.speed -= 14 * dt;
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 10 * dt);
    }
    if (input.handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 26 * dt);
    this.speed = clamp(this.speed, -maxReverse, maxSpeed);
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerAuthority = clamp(Math.abs(this.speed) / 8, 0, 1) * 0.55;
    this.steer += (steerTarget * steerAuthority - this.steer) * Math.min(1, dt * 8);
    this.heading += this.steer * (this.speed / 8) * dt * (input.handbrake ? 1.7 : 1);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const pos = { x: nx, z: nz };
    const hit = resolveCollisions(colliders, pos, 2.1);
    if (hit) this.speed *= 0.45;
    pos.x = clamp(pos.x, -CITY.half - 30, 168);
    pos.z = clamp(pos.z, -CITY.half - 30, CITY.half + 30);
    this.setPos(pos.x, pos.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z = -this.steer * 0.06 * Math.sign(this.speed || 1);
    this.spinWheels(dt);
    if (this.police) this.updateLightBar(dt);
  }

  // Traffic AI: drive along the current street; at an intersection pick a
  // new direction (mostly straight, sometimes a turn); slow and stop when
  // another car is close ahead; wrap around the far edge of the city.
  updateTraffic(dt, colliders, cars) {
    const a = this.ai;
    if (!a) return;
    // Car ahead on the same street and direction? Stop behind it.
    let blocked = false;
    for (const other of cars) {
      if (other === this) continue;
      const dx = other.x - this.x, dz = other.z - this.z;
      const ahead = dx * Math.sin(this.heading) + dz * Math.cos(this.heading);
      const side = Math.abs(dx * Math.cos(this.heading) - dz * Math.sin(this.heading));
      if (ahead > 0 && ahead < 9 && side < 2.4) { blocked = true; break; }
    }
    const targetSpeed = blocked ? 0 : a.cruise;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 1.4);
    // Steering: stay on the street centre line, turn at intersections.
    let desired = a.heading;
    const along = a.axis === 'x' ? this.x : this.z;
    if (a.turnAt !== null && Math.abs(along - a.turnAt) < 1.2) {
      // Reached the chosen intersection: turn.
      const dir = pick(a.rng, ['straight', 'straight', 'left', 'right']);
      const turn = dir === 'left' ? -Math.PI / 2 : dir === 'right' ? Math.PI / 2 : 0;
      const newHeading = a.heading + turn;
      a.axis = Math.abs(Math.sin(newHeading)) > 0.5 ? 'x' : 'z';
      a.heading = newHeading;
      a.line = a.turnAt; // now travelling along the street we just turned onto
      a.turnAt = this.pickNextIntersection();
      desired = newHeading;
    }
    // Gentle correction back onto the street centre line.
    const cross = a.axis === 'x' ? this.z - a.line : this.x - a.line;
    desired += clamp(-cross * 0.06, -0.3, 0.3);
    this.heading += clamp(angleDiff(this.heading, desired), -1.6 * dt, 1.6 * dt);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const pos = { x: nx, z: nz };
    resolveCollisions(colliders, pos, 2.1);
    this.setPos(pos.x, pos.z);
    this.mesh.rotation.y = this.heading;
    this.spinWheels(dt);
    // Wrap: a car that leaves the city re-enters on the opposite side.
    if (this.x > 125 || this.x < -125 || this.z > 125 || this.z < -125) {
      this.setPos(-this.x * 0.9, -this.z * 0.9);
      this.ai.line = nearestStreetCoord(this.ai.axis === 'x' ? this.z : this.x);
      this.ai.turnAt = this.pickNextIntersection();
    }
  }

  pickNextIntersection() {
    const a = this.ai;
    const along = a.axis === 'x' ? this.x : this.z;
    const dir = Math.sin(a.heading) !== 0 ? Math.sign(Math.sin(a.heading)) : Math.sign(Math.cos(a.heading));
    // Next street line ahead of us on this axis.
    const streets = [-90, -60, -30, 0, 30, 60, 90];
    for (const s of streets) {
      if (dir > 0 && s > along + 12) return s;
      if (dir < 0 && s < along - 12) return s;
    }
    return null;
  }

  spinWheels(dt) {
    const spin = (this.speed * dt) / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
  }

  updateLightBar(dt) {
    this.flash += dt;
    const bar = this.mesh.userData.lightBar;
    if (!bar) return;
    const on = Math.floor(this.flash * 6) % 2 === 0;
    bar.children[0].material.color.setHex(on ? 0xff2222 : 0x551111);
    bar.children[1].material.color.setHex(on ? 0x111155 : 0x2244ff);
  }

  // Damage smoke puff position (used by main for particle spawns).
  smokePos() { return { x: this.x, y: 1.2, z: this.z }; }
}

// Spawn a traffic car on a random street with a random heading.
export function makeTrafficCar(scene, rng, colliders) {
  const horizontal = rng() < 0.5;
  const line = pick(rng, [-90, -60, -30, 0, 30, 60, 90]);
  const along = (rng() * 2 - 1) * 100;
  const heading = horizontal ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
  const car = new Car(scene, pick(rng, CAR_COLORS), false,
    horizontal ? along : line, horizontal ? line : along, heading);
  car.ai = {
    rng: mulberry32(Math.floor(rng() * 1e9)),
    axis: horizontal ? 'x' : 'z',
    line,
    heading,
    cruise: 7 + rng() * 5,
    turnAt: null,
  };
  car.ai.turnAt = car.pickNextIntersection();
  car.speed = car.ai.cruise;
  return car;
}

// A parked car the player can steal, placed beside a street.
export function makeParkedCar(scene, rng, x, z, heading) {
  const car = new Car(scene, pick(rng, CAR_COLORS), false, x, z, heading);
  car.speed = 0;
  return car;
}
