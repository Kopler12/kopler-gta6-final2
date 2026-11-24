// combat.js — on-foot pistol combat: raycast shooting, tracers, muzzle
// flash, hit particles and simple rival AI that takes cover positions and
// shoots back. All effects are procedural meshes, no assets.

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.ammo = 12;
    this.reserve = 48;
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.tracers = [];
    this.rivals = [];
    this.muzzle = null;
    this.muzzleTimer = 0;
  }

  // A short-lived glowing line from muzzle to hit point.
  spawnTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color || 0xffe9a8 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  // Orange burst of small boxes at an impact point.
  spawnHitBurst(pos, color) {
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: color || 0xffa733 }));
      p.position.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + (Math.random() - 0.5) * 0.4, pos.z + (Math.random() - 0.5) * 0.4);
      p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4);
      p.userData.life = 0.4;
      this.scene.add(p);
      this.tracers.push({ line: p, life: 0.4, particle: true });
    }
  }

  // Fire one shot from the player toward the aim point. Returns what it hit:
  // 'rival', 'car', 'building' or 'nothing'.
  shoot(from, aimPoint, targets) {
    if (this.cooldown > 0 || this.reloadTimer > 0) return null;
    if (this.ammo <= 0) { this.startReload(); return 'empty'; }
    this.ammo--;
    this.cooldown = 0.22;
    this.muzzleTimer = 0.06;
    const dir = new THREE.Vector3(aimPoint.x - from.x, aimPoint.y - from.y, aimPoint.z - from.z);
    const range = dir.length();
    dir.normalize();
    const ray = new THREE.Raycaster(new THREE.Vector3(from.x, from.y, from.z), dir, 0, range);
    const meshes = [];
    for (const r of this.rivals) if (r.alive) meshes.push(r.mesh);
    for (const c of targets.cars || []) meshes.push(c.mesh);
    const hits = ray.intersectObjects(meshes, true);
    let end = new THREE.Vector3(from.x, from.y, from.z).addScaledVector(dir, range);
    let result = 'nothing';
    if (hits.length > 0) {
      end = hits[0].point;
      let obj = hits[0].object;
      while (obj && !obj.userData.rival && !obj.userData.carRef) obj = obj.parent;
      if (obj && obj.userData.rival) {
        result = 'rival';
        this.damageRival(obj.userData.rival, 34);
        this.spawnHitBurst(end, 0xff4444);
      } else if (obj && obj.userData.carRef) {
        result = 'car';
        obj.userData.carRef.health -= 8;
        this.spawnHitBurst(end, 0xffa733);
      }
    }
    this.spawnTracer(from, end, 0xffe9a8);
    return result;
  }

  startReload() {
    if (this.reloadTimer > 0 || this.reserve <= 0 || this.ammo === 12) return;
    this.reloadTimer = 1.1;
  }

  damageRival(rival, dmg) {
    rival.health -= dmg;
    rival.flashTimer = 0.15;
    if (rival.health <= 0 && rival.alive) {
      rival.alive = false;
      rival.mesh.visible = false;
    }
  }

  // Spawn a rival gunman at a position. Rivals stand, aim at the player and
  // fire on a timer; they are the shootout of the pier mission.
  spawnRival(x, z, name) {
    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0x3a2a4a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.32), jacket);
    torso.position.y = 1.05; torso.castShadow = true; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), skin);
    head.position.y = 1.65; g.add(head);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    legL.position.set(-0.15, 0.33, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.15; g.add(legR);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.3, 1.15, 0.3); g.add(gun);
    g.position.set(x, 0, z);
    g.userData.rival = true;
    this.scene.add(g);
    const rival = { mesh: g, name: name || 'Rival', health: 100, alive: true, shootTimer: 1 + Math.random(), flashTimer: 0 };
    g.userData.rival = rival;
    this.rivals.push(rival);
    return rival;
  }

  clearRivals() {
    for (const r of this.rivals) this.scene.remove(r.mesh);
    this.rivals = [];
  }

  // Rivals shoot at the player every couple of seconds when in range.
  update(dt, playerPos, onDamage, audio) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = 12 - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take; this.reserve -= take;
      }
    }
    if (this.muzzleTimer > 0) this.muzzleTimer -= dt;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.particle) {
        t.line.position.addScaledVector(t.line.userData.vel, dt);
        t.line.userData.vel.y -= 9 * dt;
      }
      if (t.life <= 0) {
        this.scene.remove(t.line);
        if (t.line.geometry) t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (const r of this.rivals) {
      if (!r.alive) continue;
      if (r.flashTimer > 0) r.flashTimer -= dt;
      const dx = playerPos.x - r.mesh.position.x;
      const dz = playerPos.z - r.mesh.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      r.mesh.rotation.y = Math.atan2(dx, dz);
      r.shootTimer -= dt;
      if (d < 45 && r.shootTimer <= 0) {
        r.shootTimer = 1.6 + Math.random() * 1.2;
        const from = { x: r.mesh.position.x, y: 1.3, z: r.mesh.position.z };
        const to = { x: playerPos.x + (Math.random() - 0.5) * 2, y: 1.2, z: playerPos.z + (Math.random() - 0.5) * 2 };
        this.spawnTracer(from, to, 0xff6644);
        if (audio) audio.gunshot();
        // Rough accuracy: closer rivals hit more often.
        if (Math.random() < (d < 15 ? 0.45 : 0.2)) onDamage(9);
      }
    }
  }
}
