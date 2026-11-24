// police.js — the wanted system and police pursuit.
// Crimes raise the wanted level (0–5 stars). Police cars spawn in proportion
// to the stars and chase the player, ramming to stop them. Stay out of sight
// and quiet and the heat decays; getting busted or wrecked resets it.

import { clamp, dist2 } from './util.js';
import { Car } from './vehicles.js';

export class WantedSystem {
  constructor(scene) {
    this.scene = scene;
    this.stars = 0;
    this.heat = 0;            // 0..100, stars = ceil(heat/20)
    this.policeCars = [];
    this.spawnTimer = 0;
    this.hiddenTimer = 0;     // time spent slow and out of trouble
    this.busted = false;
  }

  addCrime(amount, reason) {
    this.heat = clamp(this.heat + amount, 0, 100);
    this.stars = Math.ceil(this.heat / 20);
    this.hiddenTimer = 0;
    return reason;
  }

  // Called every frame: spawn/despawn police to match stars, decay heat
  // when the player is slow and no crime happened recently.
  update(dt, playerPos, playerSpeed, playerVisible) {
    if (this.stars > 0 && playerVisible) this.hiddenTimer = 0;
    if (this.stars > 0 && playerSpeed < 2) {
      this.hiddenTimer += dt;
      if (this.hiddenTimer > 6) {
        this.heat = Math.max(0, this.heat - dt * 6);
        this.stars = Math.ceil(this.heat / 20);
      }
    }
    // Match police count to stars (1 car per star, max 5).
    const want = this.stars;
    this.spawnTimer -= dt;
    if (this.policeCars.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      const a = Math.random() * Math.PI * 2;
      const px = playerPos.x + Math.sin(a) * 45;
      const pz = playerPos.z + Math.cos(a) * 45;
      const car = new Car(this.scene, 0xffffff, true,
        clamp(px, -115, 120), clamp(pz, -115, 115), a);
      car.speed = 8;
      this.policeCars.push(car);
    }
    while (this.policeCars.length > want) {
      const c = this.policeCars.pop();
      this.scene.remove(c.mesh);
    }
    // Pursuit: steer toward the player, ram on contact, brake when close.
    for (const cop of this.policeCars) {
      const d = dist2(cop.x, cop.z, playerPos.x, playerPos.z);
      const desired = Math.atan2(playerPos.x - cop.x, playerPos.z - cop.z);
      let diff = desired - cop.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cop.heading += clamp(diff, -2.2 * dt, 2.2 * dt);
      const targetSpeed = d > 6 ? 26 + this.stars * 2.5 : 10;
      cop.speed += (targetSpeed - cop.speed) * Math.min(1, dt * 1.2);
      const nx = cop.x + Math.sin(cop.heading) * cop.speed * dt;
      const nz = cop.z + Math.cos(cop.heading) * cop.speed * dt;
      cop.setPos(clamp(nx, -120, 130), clamp(nz, -120, 120));
      cop.mesh.rotation.y = cop.heading;
      cop.spinWheels(dt);
      cop.updateLightBar(dt);
    }
  }

  // Remove all police (after a bust, a mission reset or a new game).
  clearAll() {
    for (const c of this.policeCars) this.scene.remove(c.mesh);
    this.policeCars = [];
    this.heat = 0; this.stars = 0; this.hiddenTimer = 0;
  }

  // Player is caught when a police car sits on top of them while on foot
  // and slow, or when their car is wrecked.
  checkBusted(playerPos, playerSpeed, onFoot) {
    if (this.stars === 0) return false;
    for (const cop of this.policeCars) {
      if (dist2(cop.x, cop.z, playerPos.x, playerPos.z) < 3.2 && playerSpeed < 1.5) return true;
    }
    return false;
  }
}
