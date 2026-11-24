// hud.js — every 2D interface element of San Verano: the HUD (health, cash,
// wanted stars, speed, clock, objective), the live canvas minimap, the start
// screen, pause menu, game-over screen and toast messages. Pure DOM + canvas,
// no assets.

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.buildHud();
    this.buildMenus();
    this.toasts = [];
  }

  buildHud() {
    this.root.innerHTML = `
      <div id="hud-top-left">
        <div id="wanted"></div>
        <div id="cash">$0</div>
        <div id="clock">18:42</div>
      </div>
      <div id="hud-objective"><span id="mission-title"></span><span id="mission-text"></span></div>
      <div id="hud-bottom-left">
        <div id="health-wrap"><div id="health-bar"></div><span id="health-text">100</span></div>
        <div id="ammo">PISTOL 12 / 48</div>
      </div>
      <div id="hud-bottom-right">
        <div id="speed">0</div><div id="speed-unit">km/h</div>
        <div id="car-hint"></div>
      </div>
      <canvas id="minimap" width="180" height="180"></canvas>
      <div id="crosshair">+</div>
      <div id="toast"></div>
      <div id="center-msg"></div>`;
    this.minimap = document.getElementById('minimap');
    this.mm = this.minimap.getContext('2d');
  }

  buildMenus() {
    const menu = document.createElement('div');
    menu.id = 'menu';
    menu.innerHTML = `
      <div class="menu-card">
        <h1>SAN VERANO</h1>
        <h2>Neon Coast 3D</h2>
        <p class="story">Rio Vega just rolled into San Verano with an empty wallet and a fast car.
        Mara Solis runs the garage, Dario Finn runs the harbour — and the whole neon coast
        is up for grabs. Five jobs stand between you and the big score.</p>
        <p class="controls"><b>WASD</b> move / drive &nbsp; <b>Shift</b> run &nbsp; <b>Space</b> jump / handbrake<br>
        <b>E</b> enter / exit car &nbsp; <b>Mouse</b> aim &nbsp; <b>Click</b> shoot &nbsp; <b>R</b> reload<br>
        <b>M</b> taxi fare &nbsp; <b>P</b> pause &nbsp; <b>N</b> mute &nbsp; <b>F</b> save game</p>
        <button id="btn-new">NEW GAME</button>
        <button id="btn-continue">CONTINUE</button>
        <p class="foot">An original game. No Rockstar content. Best in desktop Chrome.</p>
      </div>`;
    document.body.appendChild(menu);
    this.menu = menu;

    const pause = document.createElement('div');
    pause.id = 'pause';
    pause.innerHTML = `<div class="menu-card"><h1>PAUSED</h1>
      <p class="controls">P to resume &nbsp; F to save &nbsp; N to mute</p>
      <button id="btn-resume">RESUME</button>
      <button id="btn-quit">QUIT TO MENU</button></div>`;
    document.body.appendChild(pause);
    this.pauseMenu = pause;

    const over = document.createElement('div');
    over.id = 'gameover';
    over.innerHTML = `<div class="menu-card"><h1>BUSTED</h1>
      <p class="story" id="over-text">The San Verano police caught up with you.</p>
      <button id="btn-respawn">RESPAWN — $100 FINE</button></div>`;
    document.body.appendChild(over);
    this.gameOverMenu = over;
  }

  showMenu(show) { this.menu.style.display = show ? 'flex' : 'none'; }
  showPause(show) { this.pauseMenu.style.display = show ? 'flex' : 'none'; }
  showGameOver(show, text) {
    if (text) document.getElementById('over-text').textContent = text;
    this.gameOverMenu.style.display = show ? 'flex' : 'none';
  }
  showHud(show) { this.root.style.display = show ? 'block' : 'none'; }

  setHealth(h) {
    const bar = document.getElementById('health-bar');
    bar.style.width = Math.max(0, h) + '%';
    bar.style.background = h > 50 ? '#37d67a' : h > 25 ? '#f4a261' : '#e84a5f';
    document.getElementById('health-text').textContent = Math.max(0, Math.round(h));
  }
  setCash(c) { document.getElementById('cash').textContent = '$' + c.toLocaleString('en-US'); }
  setWanted(stars) {
    let s = '';
    for (let i = 0; i < 5; i++) s += `<span class="star ${i < stars ? 'on' : ''}">★</span>`;
    document.getElementById('wanted').innerHTML = s;
  }
  setSpeed(kmh, inCar) {
    document.getElementById('speed').textContent = Math.round(kmh);
    document.getElementById('speed-unit').textContent = inCar ? 'km/h' : 'ON FOOT';
  }
  setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    document.getElementById('clock').textContent =
      String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  setObjective(title, text) {
    document.getElementById('mission-title').textContent = title;
    document.getElementById('mission-text').textContent = text;
  }
  setAmmo(ammo, reserve, reloading) {
    document.getElementById('ammo').textContent =
      reloading ? 'RELOADING…' : `PISTOL ${ammo} / ${reserve}`;
  }
  setCarHint(text) { document.getElementById('car-hint').textContent = text; }
  setCrosshair(onFoot) {
    document.getElementById('crosshair').style.display = onFoot ? 'block' : 'none';
  }

  toast(text, ms) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.style.opacity = '0'; }, ms || 3200);
  }

  centerMsg(text, ms) {
    const el = document.getElementById('center-msg');
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(this._centerTimer);
    this._centerTimer = setTimeout(() => { el.style.opacity = '0'; }, ms || 2600);
  }

  // Live top-down minimap: roads, beach, sea, mission marker, traffic,
  // police, pedestrians and the player arrow, all drawn each frame.
  drawMinimap(state) {
    const g = this.mm, S = 180, W = 260; // world -130..130 maps to 0..180
    const toMap = (x, z) => [(x + 130) / W * S, (z + 130) / W * S];
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(10,14,24,0.82)';
    g.fillRect(0, 0, S, S);
    // Sea + sand on the east edge.
    g.fillStyle = '#1e6f8e';
    g.fillRect(toMap(128, -130)[0], 0, S - toMap(128, -130)[0], S);
    g.fillStyle = '#e8cf9a';
    g.fillRect(toMap(108, -130)[0], 0, toMap(128, -130)[0] - toMap(108, -130)[0], S);
    // Roads.
    g.strokeStyle = '#565b66'; g.lineWidth = 4;
    for (const s of state.streets) {
      const [x1, y1] = toMap(s, -120), [x2, y2] = toMap(s, 120);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      const [a1, b1] = toMap(-120, s), [a2, b2] = toMap(120, s);
      g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke();
    }
    // Mission marker (pulsing yellow diamond).
    if (state.target) {
      const [tx, ty] = toMap(state.target.x, state.target.z);
      const pulse = 5 + Math.sin(state.time * 5) * 2;
      g.fillStyle = '#ffe600';
      g.beginPath();
      g.moveTo(tx, ty - pulse); g.lineTo(tx + pulse, ty);
      g.lineTo(tx, ty + pulse); g.lineTo(tx - pulse, ty);
      g.closePath(); g.fill();
    }
    // Traffic (white), police (blue/red flash), pedestrians (grey).
    g.fillStyle = '#ffffff';
    for (const c of state.traffic) {
      const [cx, cy] = toMap(c.x, c.z);
      g.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    for (const p of state.police) {
      const [px, py] = toMap(p.x, p.z);
      g.fillStyle = Math.floor(state.time * 4) % 2 ? '#ff2222' : '#2244ff';
      g.beginPath(); g.arc(px, py, 3.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#9aa0aa';
    for (const p of state.peds) {
      const [px, py] = toMap(p.x, p.z);
      g.fillRect(px - 1, py - 1, 2, 2);
    }
    // Player arrow, rotated by heading.
    const [px, py] = toMap(state.player.x, state.player.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.atan2(Math.sin(state.player.heading), Math.cos(state.player.heading)) * -1 + Math.PI);
    g.fillStyle = '#37d67a';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
    g.restore();
    // Border.
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    g.strokeRect(1, 1, S - 2, S - 2);
  }
}
