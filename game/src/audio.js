// audio.js — fully synthesized WebAudio sound for San Verano: no audio files.
// Engine hum, police sirens, gunshots, pickup jingles and a procedural
// sunset music loop, all generated with oscillators and noise buffers.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicStep = 0;
  }

  // Must be called from a user gesture (start button) so the context resumes.
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // Short noise burst through a low-pass filter: a gunshot crack.
  gunshot() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.12);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  // Two-note pickup jingle.
  jingle() {
    if (!this.ctx || this.muted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => this.tone(freq, 0.09, i * 0.07, 'triangle', 0.25));
  }

  // Cash register-ish cha-ching for mission payouts.
  cashSound() {
    if (!this.ctx || this.muted) return;
    this.tone(987.77, 0.08, 0, 'square', 0.12);
    this.tone(1318.5, 0.16, 0.08, 'square', 0.12);
  }

  tone(freq, dur, delay, type, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // Continuous engine hum whose pitch follows the player's speed.
  startEngine() {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = 55;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 320;
    const g = this.ctx.createGain(); g.gain.value = 0.0;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start();
    this.engineOsc = o; this.engineGain = g;
  }

  setEngine(speedNorm, driving) {
    if (!this.engineOsc) return;
    const target = driving ? 0.05 + speedNorm * 0.09 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 110, this.ctx.currentTime, 0.1);
  }

  // Two-tone police siren that starts when wanted >= 1 and stops at 0.
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 220;
      lfo.connect(lfoGain); lfoGain.connect(o.frequency);
      o.frequency.value = 750;
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this.sirenOsc = o; this.sirenGain = g; this.sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch (e) { /* already stopped */ }
      this.sirenOsc = null; this.sirenLfo = null;
    }
  }

  // Simple sunset groove: a walking bass line plus soft pad chords,
  // scheduled one step at a time so it never needs an audio file.
  startMusic() {
    const bass = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 65.41, 0];
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [146.8, 220, 293.7]];
    const stepMs = 210;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const i = this.musicStep % 16;
      const b = bass[i];
      if (b) this.tone(b, 0.2, 0, 'triangle', 0.16);
      if (i % 4 === 0) {
        const chord = chords[(this.musicStep / 4 | 0) % 4];
        chord.forEach((f) => this.tone(f, 0.8, 0, 'sine', 0.045));
      }
      if (i % 2 === 0) this.tone(880 + (i % 8) * 40, 0.05, 0, 'sine', 0.02);
      this.musicStep++;
    }, stepMs);
  }
}
