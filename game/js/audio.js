/* Neon Tide — procedural audio. Every sound is synthesised with WebAudio;
   no audio files are shipped, so the game stays fully offline. */
'use strict';

/* One global sound engine. The AudioContext is created lazily on the first
   user gesture, so the browser's autoplay policy is satisfied. */
const Sound = {
  ctx: null,
  master: null,
  musicGain: null,
  muted: false,
  engineOsc: null,
  engineGain: null,
  musicTimer: null,
  musicStep: 0,

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    } catch (e) {
      this.ctx = null;
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  },

  /* A short tone that slides from one pitch to another. */
  blip(freq0, freq1, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  /* A filtered burst of noise — gunshots, crashes, punches. */
  noise(dur, vol, freq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq || 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  },

  shoot() {
    this.noise(0.14, 0.5, 2600);
    this.blip(320, 90, 0.1, 'square', 0.12);
  },
  punch() { this.noise(0.09, 0.3, 900); },
  pickup() {
    this.blip(520, 940, 0.14, 'sine', 0.22);
    this.blip(780, 1180, 0.12, 'sine', 0.14);
  },
  cash() {
    this.blip(880, 880, 0.07, 'triangle', 0.2);
    setTimeout(() => this.blip(1320, 1320, 0.1, 'triangle', 0.2), 70);
  },
  crash() {
    this.noise(0.35, 0.5, 700);
    this.blip(120, 45, 0.3, 'sawtooth', 0.2);
  },
  sirenBlip() { this.blip(780, 1180, 0.4, 'sine', 0.07); },
  horn() {
    this.blip(330, 330, 0.25, 'square', 0.1);
    this.blip(415, 415, 0.25, 'square', 0.08);
  },
  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, n, 0.22, 'triangle', 0.22), i * 110));
  },
  busted() { this.blip(400, 110, 0.7, 'sawtooth', 0.2); },
  click() { this.blip(900, 700, 0.05, 'square', 0.1); },

  /* A continuous engine hum while driving. Pass a 0..1 speed, or null to stop. */
  engine(speed) {
    if (!this.ctx || this.muted) return;
    if (speed === null || speed === undefined) {
      if (this.engineOsc) {
        try { this.engineOsc.stop(); } catch (e) { /* already stopped */ }
        this.engineOsc = null;
      }
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      this.engineOsc.connect(f);
      f.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    this.engineOsc.frequency.value = 55 + speed * 130;
    this.engineGain.gain.value = 0.03 + speed * 0.05;
  },

  /* A slow synthwave bass arpeggio, original and generated in code. */
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const bass = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
    const lead = [220, 261.63, 329.63, 392, 329.63, 261.63, 220, 196];
    this.musicStep = 0;
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const i = this.musicStep % 8;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = bass[i];
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(t);
      o.stop(t + 0.45);
      if (this.musicStep % 2 === 0) {
        const o2 = this.ctx.createOscillator();
        const g2 = this.ctx.createGain();
        o2.type = 'sine';
        o2.frequency.value = lead[(this.musicStep / 2) % 8];
        g2.gain.setValueAtTime(0.22, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o2.connect(g2);
        g2.connect(this.musicGain);
        o2.start(t);
        o2.stop(t + 0.52);
      }
      this.musicStep++;
    }, 300);
  },

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  },
};
