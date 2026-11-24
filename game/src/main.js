// main.js — boot, game loop, player controller, camera, save/load and the
// wiring between every San Verano system: world, vehicles, pedestrians,
// police, missions, combat, HUD and audio.

import { buildCity, resolveCollisions, CITY } from './world.js';
import { Car, makeTrafficCar, makeParkedCar } from './vehicles.js';
import { spawnPedestrians } from './pedestrians.js';
import { WantedSystem } from './police.js';
import { MissionManager } from './missions.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { applyShot } from './shots.js';
import { clamp, lerp, mulberry32, pick, dist2 } from './util.js';

const SEED = 20261124;
const SAVE_KEY = 'sanverano-save-v1';

const game = {
  state: 'menu', // menu | playing | paused | gameover
  cash: 0,
  clockMin: 1122, // 18:42 golden hour
  time: 0,
  shake: 0,
  saveNotice: 0,
};

let renderer, scene, camera;
let world, hud, audio, wanted, missions, combat;
let traffic = [], parked = [], peds = [];
let player, playerMesh;
let currentCar = null;
let keys = {};
let camYaw = 0, camPitch = 0.32, camDist = 11;
let camLock = false; // staged shots lock the camera angle
let dragging = false, lastMX = 0, lastMY = 0;
let lastT = 0;
let particles = [];
let missionRivalsSpawned = false;
let lastDamageAt = -99;
let rng = mulberry32(SEED);

init();

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(-30, 18, 60);

  world = buildCity(scene, SEED);
  hud = new Hud();
  audio = new GameAudio();
  wanted = new WantedSystem(scene);
  missions = new MissionManager();
  combat = new Combat(scene);

  // Traffic: 12 cars circulating the grid.
  for (let i = 0; i < 12; i++) traffic.push(makeTrafficCar(scene, rng, world.colliders));
  // Parked cars the player can steal, near streets.
  const parkedSpots = [[-24, -24], [36, -54], [-54, 36], [66, 6], [-6, 66], [24, 96], [-96, -6], [96, -36]];
  for (const [x, z] of parkedSpots) parked.push(makeParkedCar(scene, rng, x, z, rng() < 0.5 ? 0 : Math.PI / 2));

  peds = spawnPedestrians(scene, SEED, 26);

  // Rio Vega, the player character: red jacket, dark jeans.
  playerMesh = makePlayerMesh();
  scene.add(playerMesh);
  player = {
    x: -70, z: -52, y: 0, vy: 0, heading: 0.6, speed: 0,
    health: 100, onFoot: true, grounded: true, walkPhase: 0,
  };
  playerMesh.position.set(player.x, 0, player.z);

  bindInput();
  wireMenus();
  hud.showHud(false);
  hud.setCash(0); hud.setHealth(100); hud.setWanted(0);
  hud.setObjective('SAN VERANO', 'Press NEW GAME to start Rio\'s story');
  animate(0);

  // Staged screenshot mode: ?shot=cover|drive|chase|mission&seed=1
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (shot) {
    setTimeout(() => { try { applyShot(api, shot); } catch (e) { console.error('shot failed', e); } }, 600);
  }
}

function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xc22e2e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2b3a55 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), jacket);
  torso.position.y = 1.08; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.68; head.castShadow = true; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  cap.position.y = 1.86; g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), jeans);
  legL.position.set(-0.15, 0.35, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.15; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), jacket);
  armL.position.set(-0.4, 1.05, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
  g.userData.legL = legL; g.userData.legR = legR;
  g.userData.armR = armR;
  return g;
}

function bindInput() {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyE') tryEnterExitCar();
    if (e.code === 'KeyR') combat.startReload();
    if (e.code === 'KeyM') tryTaxiFare();
    if (e.code === 'KeyF') saveGame(true);
    if (e.code === 'KeyN') { audio.setMuted(!audio.muted); hud.toast(audio.muted ? 'Sound muted' : 'Sound on'); }
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  const cv = renderer.domElement;
  cv.addEventListener('mousedown', (e) => {
    dragging = true; lastMX = e.clientX; lastMY = e.clientY;
    if (game.state === 'playing' && player.onFoot && e.button === 0) playerShoot();
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    camYaw -= (e.clientX - lastMX) * 0.005;
    camPitch = clamp(camPitch + (e.clientY - lastMY) * 0.004, 0.08, 1.1);
    lastMX = e.clientX; lastMY = e.clientY;
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function wireMenus() {
  document.getElementById('btn-new').addEventListener('click', () => {
    audio.init();
    startNewGame();
  });
  document.getElementById('btn-continue').addEventListener('click', () => {
    audio.init();
    if (!loadGame()) { hud.toast('No save found — starting a new game'); startNewGame(); }
  });
  document.getElementById('btn-resume').addEventListener('click', togglePause);
  document.getElementById('btn-quit').addEventListener('click', () => {
    game.state = 'menu';
    hud.showPause(false); hud.showMenu(true); hud.showHud(false);
  });
  document.getElementById('btn-respawn').addEventListener('click', respawn);
}

function startNewGame() {
  game.cash = 0; game.clockMin = 1122;
  player.health = 100;
  wanted.clearAll();
  combat.clearRivals();
  missions = new MissionManager();
  missions.startMission(0);
  placePlayer(-70, -52, 0.6);
  exitCar(true);
  hud.showMenu(false); hud.showHud(true);
  game.state = 'playing';
  hud.toast('Mission 1: First Shift — go to Mara\'s Garage');
  hud.centerMsg('SAN VERANO — Rio Vega');
  saveGame(false);
}

function placePlayer(x, z, heading) {
  player.x = x; player.z = z; player.heading = heading; player.y = 0; player.vy = 0;
  playerMesh.position.set(x, 0, z);
  playerMesh.rotation.y = heading;
}

function respawn() {
  game.cash = Math.max(0, game.cash - 100);
  player.health = 100;
  wanted.clearAll();
  placePlayer(-70, -52, 0.6);
  exitCar(true);
  hud.showGameOver(false);
  hud.showHud(true);
  game.state = 'playing';
  hud.toast('Back on the streets. $100 fine paid.');
}

function togglePause() {
  if (game.state === 'playing') { game.state = 'paused'; hud.showPause(true); }
  else if (game.state === 'paused') { game.state = 'playing'; hud.showPause(false); }
}

// --- cars: enter / exit / steal -------------------------------------------
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of [...traffic, ...parked, ...wanted.policeCars]) {
    if (c === currentCar) continue;
    const d = dist2(player.x, player.z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function tryEnterExitCar() {
  if (game.state !== 'playing') return;
  if (!player.onFoot) { exitCar(false); return; }
  const car = nearestCar(4.5);
  if (!car) return;
  if (car.police) { hud.toast('That is a police car — find another ride'); return; }
  // Stealing a car is a crime: the heat goes up.
  if (car.ai || parked.includes(car)) wanted.addCrime(20, 'Grand theft auto');
  currentCar = car;
  player.onFoot = false;
  playerMesh.visible = false;
  if (missions.active && missions.index === 0) checkMissionProgress();
  hud.toast('Stole a car — the cops noticed (+1★)');
  audio.jingle();
}

function exitCar(silent) {
  if (!currentCar) { player.onFoot = true; playerMesh.visible = true; return; }
  const c = currentCar;
  currentCar = null;
  player.onFoot = true;
  playerMesh.visible = true;
  const side = c.heading + Math.PI / 2;
  placePlayer(c.x + Math.sin(side) * 2.5, c.z + Math.cos(side) * 2.5, c.heading);
  if (!silent) hud.setCarHint('Press E near a car to steal it');
}

// --- combat ----------------------------------------------------------------
function aimPoint() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  return { x: origin.x + dir.x * 45, y: Math.max(0.4, origin.y + dir.y * 45), z: origin.z + dir.z * 45 };
}

function playerShoot() {
  if (!player.onFoot || game.state !== 'playing') return;
  const from = { x: player.x, y: 1.35, z: player.z };
  const result = combat.shoot(from, aimPoint(), { cars: [...traffic, ...parked, ...wanted.policeCars] });
  if (result === 'rival' || result === 'car' || result === 'nothing') {
    audio.gunshot();
    game.shake = Math.max(game.shake, 0.12);
    wanted.addCrime(5, 'Shots fired');
    if (result === 'rival') checkMissionProgress();
  } else if (result === 'empty') {
    hud.toast('Out of ammo — press R to reload');
  }
}

function damagePlayer(amount) {
  player.health -= amount;
  lastDamageAt = game.time;
  game.shake = Math.max(game.shake, 0.25);
  hud.setHealth(player.health);
  if (player.health <= 0) {
    game.state = 'gameover';
    hud.showHud(false);
    hud.showGameOver(true, 'Rio went down in a hail of gunfire. The crew will remember him.');
  }
}

// --- missions ---------------------------------------------------------------
function checkMissionProgress() {
  if (!missions.active) return;
  const m = missions.current;
  if (!m) return;
  const target = missions.targetPos();
  const nearTarget = target && dist2(player.x, player.z, target.x, target.z) < 9;
  const rivalsCleared = m.spawnRivals ? combat.rivals.every((r) => !r.alive) && combat.rivals.length > 0 : false;
  const s = {
    inCar: !player.onFoot,
    nearTarget,
    rivalsCleared,
    missionTime: missions.missionTime,
  };
  if (m.failWhen && m.failWhen(s)) {
    hud.toast('Mission failed — the clock ran out. Try again!');
    missions.startMission(missions.index);
    placePlayer(-70, -52, 0.6);
    exitCar(true);
    return;
  }
  if (m.twoStage && missions.stage === 0 && nearTarget) {
    missions.stage = 1;
    game.cash += 0;
    wanted.addCrime(40, 'The big score');
    hud.centerMsg('CASH GRABBED — lose the heat, get it to Mara!');
    audio.cashSound();
    return;
  }
  if (m.completeWhen(s)) {
    const done = missions.completeMission();
    game.cash += done.reward;
    audio.cashSound();
    hud.centerMsg(`${done.title} COMPLETE  +$${done.reward}`);
    hud.toast(done.completeText);
    combat.clearRivals();
    missionRivalsSpawned = false;
    saveGame(false);
    if (missions.storyDone) {
      hud.toast('Story complete! Press M for taxi fares and keep earning.');
    } else {
      const next = missions.startMission(missions.index);
      hud.toast(`Mission ${next.id}: ${next.title} — ${next.intro}`);
    }
  }
}

function tryTaxiFare() {
  if (game.state !== 'playing' || !missions.storyDone || missions.fare) return;
  const fare = missions.startFare(rng);
  hud.toast(`Taxi fare: passenger wants ${fare.dest.name} — $${fare.reward}`);
  audio.jingle();
}

// --- particles ---------------------------------------------------------------
function spawnParticle(x, y, z, color, size, life, vel) {
  const p = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  p.position.set(x, y, z);
  p.userData = { life, maxLife: life, vel: vel || new THREE.Vector3(0, 1, 0) };
  scene.add(p);
  particles.push(p);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.life -= dt;
    p.position.addScaledVector(p.userData.vel, dt);
    p.material.opacity = Math.max(0, p.userData.life / p.userData.maxLife) * 0.85;
    if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); }
  }
}

// --- save / load --------------------------------------------------------------
function saveGame(announce) {
  try {
    const data = {
      cash: game.cash, missionIndex: missions.index,
      x: player.x, z: player.z, health: player.health,
      clockMin: game.clockMin, ammo: combat.ammo, reserve: combat.reserve,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (announce) hud.toast('Game saved');
    return true;
  } catch (e) { return false; }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    game.cash = d.cash || 0;
    player.health = d.health || 100;
    game.clockMin = d.clockMin || 1122;
    combat.ammo = d.ammo ?? 12; combat.reserve = d.reserve ?? 48;
    missions = new MissionManager();
    missions.index = d.missionIndex || 0;
    if (!missions.storyDone) missions.startMission(missions.index);
    placePlayer(d.x ?? -70, d.z ?? -52, 0.6);
    exitCar(true);
    hud.showMenu(false); hud.showHud(true);
    game.state = 'playing';
    hud.toast('Save loaded — welcome back to San Verano');
    return true;
  } catch (e) { return false; }
}

// --- per-frame update ---------------------------------------------------------
function animate(t) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  game.time += dt;

  if (game.state === 'playing') {
    updatePlaying(dt);
  } else if (game.state === 'menu') {
    // Slow cinematic orbit around the plaza while the menu is up.
    const a = game.time * 0.08;
    camera.position.set(Math.sin(a) * 70, 26, Math.cos(a) * 70);
    camera.lookAt(0, 4, 0);
    for (const c of traffic) c.updateTraffic(dt, world.colliders, [...traffic, ...parked]);
    for (const p of peds) p.update(dt, []);
  }
  updateParticles(dt);
  renderer.render(scene, camera);
}

function updatePlaying(dt) {
  game.clockMin += dt * 0.6; // a full day in ~40 minutes of play
  if (missions.active) missions.missionTime += dt;
  if (missions.fare) {
    missions.fareTimer += dt;
    if (missions.fareTimer > missions.fare.timer) {
      hud.toast('Fare expired — the passenger walked away');
      missions.fare = null;
    }
  }

  // --- player ---
  const run = keys['ShiftLeft'] || keys['ShiftRight'];
  const moveSpeed = run ? 9 : 5;
  let mx = 0, mz = 0;
  if (keys['KeyW'] || keys['ArrowUp']) mz += 1;
  if (keys['KeyS'] || keys['ArrowDown']) mz -= 1;
  if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) mx += 1;

  if (player.onFoot) {
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const wx = (mx * cos - mz * sin) * moveSpeed;
    const wz = (mx * sin + mz * cos) * moveSpeed;
    const pos = { x: player.x + wx * dt, z: player.z + wz * dt };
    const hitWall = resolveCollisions(world.colliders, pos, 0.6);
    player.x = clamp(pos.x, -125, 165);
    player.z = clamp(pos.z, -125, 125);
    if (wx || wz) {
      player.heading = Math.atan2(wx, wz);
      player.walkPhase += dt * moveSpeed * 1.6;
      const swing = Math.sin(player.walkPhase) * 0.5;
      playerMesh.userData.legL.rotation.x = swing;
      playerMesh.userData.legR.rotation.x = -swing;
    } else {
      playerMesh.userData.legL.rotation.x = 0;
      playerMesh.userData.legR.rotation.x = 0;
    }
    // Jump with gravity.
    if (keys['Space'] && player.grounded) { player.vy = 7; player.grounded = false; }
    if (!player.grounded) {
      player.vy -= 22 * dt;
      player.y += player.vy * dt;
      if (player.y <= 0) { player.y = 0; player.vy = 0; player.grounded = true; }
    }
    playerMesh.position.set(player.x, player.y, player.z);
    playerMesh.rotation.y = player.heading;
    // Aim the right arm toward the camera direction while on foot.
    playerMesh.userData.armR.rotation.x = -1.2;
    // Bump a pedestrian hard and the heat rises.
    for (const p of peds) {
      if (dist2(player.x, player.z, p.x, p.z) < 1 && Math.abs(wx) + Math.abs(wz) > 0) {
        wanted.addCrime(10, 'Pedestrian down');
      }
    }
  } else if (currentCar) {
    const input = {
      up: keys['KeyW'] || keys['ArrowUp'],
      down: keys['KeyS'] || keys['ArrowDown'],
      left: keys['KeyA'] || keys['ArrowLeft'],
      right: keys['KeyD'] || keys['ArrowRight'],
      handbrake: keys['Space'],
    };
    const prevSpeed = currentCar.speed;
    currentCar.updatePlayer(dt, input, world.colliders);
    player.x = currentCar.x; player.z = currentCar.z; player.heading = currentCar.heading;
    // Skid dust + smoke when damaged.
    if (input.handbrake && Math.abs(currentCar.speed) > 10 && Math.random() < 0.5) {
      spawnParticle(currentCar.x, 0.3, currentCar.z, 0xcccccc, 0.4, 0.5, new THREE.Vector3(0, 1.5, 0));
    }
    if (currentCar.health < 40 && Math.random() < 0.3) {
      const sp = currentCar.smokePos();
      spawnParticle(sp.x, sp.y, sp.z, 0x333333, 0.5, 0.9, new THREE.Vector3(0, 2, 0));
    }
    // Running over a pedestrian at speed is a crime.
    for (const p of peds) {
      if (dist2(currentCar.x, currentCar.z, p.x, p.z) < 2.2 && Math.abs(currentCar.speed) > 6) {
        wanted.addCrime(15, 'Hit and run');
        p.mesh.position.x += (Math.random() - 0.5) * 6;
        p.mesh.position.z += (Math.random() - 0.5) * 6;
      }
    }
    // Crash into a traffic car: both take damage, heat rises.
    for (const c of [...traffic, ...parked]) {
      if (c === currentCar) continue;
      if (dist2(currentCar.x, currentCar.z, c.x, c.z) < 4 && Math.abs(currentCar.speed - prevSpeed) > 4) {
        currentCar.speed *= 0.4;
        currentCar.health -= 6;
        game.shake = Math.max(game.shake, 0.3);
        wanted.addCrime(5, 'Traffic collision');
      }
    }
    if (currentCar.health <= 0) {
      hud.toast('Your car is wrecked!');
      exitCar(false);
    }
  }

  // --- traffic, pedestrians, police, combat ---
  const allCars = [...traffic, ...parked, ...(currentCar ? [currentCar] : []), ...wanted.policeCars];
  for (const c of traffic) c.updateTraffic(dt, world.colliders, allCars);
  const threats = [];
  if (currentCar && Math.abs(currentCar.speed) > 12) threats.push({ x: currentCar.x, z: currentCar.z, radius: 10 });
  if (game.time - lastDamageAt < 1) threats.push({ x: player.x, z: player.z, radius: 12 });
  for (const p of peds) p.update(dt, threats);

  const playerSpeed = player.onFoot ? 0 : Math.abs(currentCar ? currentCar.speed : 0);
  wanted.update(dt, { x: player.x, z: player.z }, playerSpeed, true);
  if (wanted.checkBusted({ x: player.x, z: player.z }, playerSpeed, player.onFoot)) {
    game.state = 'gameover';
    hud.showHud(false);
    hud.showGameOver(true, 'BUSTED — the San Verano police hauled Rio in.');
    return;
  }
  combat.update(dt, { x: player.x, z: player.z }, damagePlayer, audio);

  // Mission 3 rivals spawn when the player gets near the pier.
  const m = missions.current;
  if (missions.active && m && m.spawnRivals && !missionRivalsSpawned &&
      dist2(player.x, player.z, 132, -30) < 40) {
    missionRivalsSpawned = true;
    combat.spawnRival(128, -42, 'Vic');
    combat.spawnRival(136, -18, 'Sal');
    combat.spawnRival(126, -24, 'Dee');
    hud.centerMsg('AMBUSH! Clear the rivals!');
    wanted.addCrime(20, 'Pier shootout');
  }
  checkMissionProgress();

  // Taxi fare completion.
  if (missions.fare && player.onFoot === false) {
    const d = missions.fare.dest;
    if (dist2(player.x, player.z, d.x, d.z) < 9) {
      game.cash += missions.fare.reward;
      audio.cashSound();
      hud.centerMsg(`FARE COMPLETE  +$${missions.fare.reward}`);
      missions.fare = null;
      saveGame(false);
    }
  }

  // Health regen when calm.
  if (game.time - lastDamageAt > 8 && player.health < 100) {
    player.health = Math.min(100, player.health + dt * 3);
  }

  // --- camera ---
  updateCamera(dt);
  audio.setEngine(player.onFoot ? 0 : Math.abs(currentCar ? currentCar.speed : 0) / 42, !player.onFoot);
  audio.setSiren(wanted.stars > 0);
  updateHud(false);
}

function updateCamera(dt) {
  // Camera follows behind the player's heading, smoothed; drag to orbit.
  const targetYaw = player.heading + Math.PI;
  let dy = targetYaw - camYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  if (!dragging && !camLock) camYaw += dy * Math.min(1, dt * 1.6);
  const dist = player.onFoot ? 8 : 12;
  const px = player.x, pz = player.z;
  const cx = px + Math.sin(camYaw) * dist;
  const cz = pz + Math.cos(camYaw) * dist;
  const cy = (player.onFoot ? 3.2 : 4.2) + Math.sin(camPitch) * dist * 0.5;
  camera.position.x = lerp(camera.position.x, cx, Math.min(1, dt * 8));
  camera.position.y = lerp(camera.position.y, cy, Math.min(1, dt * 8));
  camera.position.z = lerp(camera.position.z, cz, Math.min(1, dt * 8));
  if (game.shake > 0) {
    game.shake -= dt;
    camera.position.x += (Math.random() - 0.5) * game.shake * 2;
    camera.position.y += (Math.random() - 0.5) * game.shake * 2;
  }
  camera.lookAt(px, (player.onFoot ? 1.6 : 1.4), pz);
}

function updateHud(force) {
  hud.setHealth(player.health);
  hud.setCash(game.cash);
  hud.setWanted(wanted.stars);
  hud.setClock(game.clockMin);
  const kmh = player.onFoot ? 0 : Math.abs(currentCar ? currentCar.speed : 0) * 3.6;
  hud.setSpeed(kmh, !player.onFoot);
  hud.setAmmo(combat.ammo, combat.reserve, combat.reloadTimer > 0);
  hud.setCrosshair(player.onFoot);
  const m = missions.current;
  const title = missions.fare ? 'TAXI FARE' : m ? `MISSION ${m.id} — ${m.title}` : 'FREE ROAM';
  hud.setObjective(title, missions.objectiveText());
  let hint = '';
  if (player.onFoot) {
    const near = nearestCar(4.5);
    hint = near ? (near.police ? 'Police car — keep away' : 'Press E to steal this car') : 'Find a car — press E near one';
  } else {
    hint = 'E exit car • Space handbrake';
  }
  hud.setCarHint(hint);
  hud.drawMinimap({
    streets: world.streets,
    target: missions.targetPos(),
    traffic, police: wanted.policeCars, peds,
    player: { x: player.x, z: player.z, heading: player.heading },
    time: game.time,
  });
}

// --- API used by shots.js (staged screenshots) and debugging -----------------
const api = {
  startGame() {
    if (game.state !== 'playing') startNewGame();
  },
  clearPolice() { wanted.clearAll(); },
  setMission(i) {
    missions = new MissionManager();
    missions.startMission(i);
    missionRivalsSpawned = false;
  },
  setWantedStars(n) {
    wanted.heat = n * 20; wanted.stars = n;
    wanted.spawnTimer = 0;
  },
  spawnPolice(n, dist) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.5;
      const car = new Car(scene, 0xffffff, true,
        clamp(player.x + Math.sin(a) * dist, -115, 120),
        clamp(player.z + Math.cos(a) * dist, -115, 115), a);
      car.speed = 10;
      wanted.policeCars.push(car);
    }
  },
  // Put the first police car ahead of the player, facing them — so a staged
  // chase shot shows the pursuit closing in.
  placePoliceAhead(dist) {
    if (!wanted.policeCars.length) return;
    const cop = wanted.policeCars[0];
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    cop.setPos(player.x + fx * dist, player.z + fz * dist);
    cop.heading = player.heading + Math.PI;
    cop.mesh.rotation.y = cop.heading;
    cop.speed = 6;
  },
  spawnTrafficNear(n, cx, cz, range) {
    const placed = [{ x: player.x, z: player.z }];
    for (let i = 0; i < n; i++) {
      let x = cx, z = cz, ok = false, tries = 0;
      while (!ok && tries < 12) {
        tries++;
        x = cx + (rng() - 0.5) * range;
        z = cz + (rng() - 0.5) * range;
        ok = placed.every((p) => dist2(x, z, p.x, p.z) > 9);
      }
      placed.push({ x, z });
      const c = makeTrafficCar(scene, rng, world.colliders);
      c.setPos(x, z);
      traffic.push(c);
    }
  },
  spawnRivalsAtPier() {
    combat.clearRivals();
    combat.spawnRival(128, -42, 'Vic');
    combat.spawnRival(136, -18, 'Sal');
    combat.spawnRival(126, -24, 'Dee');
    missionRivalsSpawned = true;
  },
  placeCarAt(x, z, heading, speed) {
    const car = makeParkedCar(scene, rng, x, z, heading);
    car.speed = speed || 0;
    parked.push(car);
    currentCar = car;
    player.onFoot = false;
    playerMesh.visible = false;
    player.x = x; player.z = z; player.heading = heading;
  },
  enterNearestCar() {
    const car = nearestCar(60);
    if (car) { currentCar = car; player.onFoot = false; playerMesh.visible = false; }
  },
  placeOnFoot(x, z, heading) {
    exitCar(true);
    placePlayer(x, z, heading);
    camYaw = heading + Math.PI;
  },
  setCamera(yawOff, pitch, dist) {
    camYaw = player.heading + Math.PI + yawOff;
    camPitch = pitch; camDist = dist;
    camLock = true; // staged shots keep their composed angle
  },
  setClock(min) { game.clockMin = min; },
  updateHud(force) { updateHud(force); },
  // Debug/verification state for the screenshot harness.
  getState() {
    return {
      x: player.x, z: player.z, heading: player.heading,
      speed: currentCar ? currentCar.speed : 0,
      health: currentCar ? currentCar.health : 100,
      onFoot: player.onFoot,
      stars: wanted.stars,
      police: wanted.policeCars.length,
      traffic: traffic.length,
      mission: missions.current ? missions.current.id : 0,
      cash: game.cash,
    };
  },
};
window.__sv = api;
