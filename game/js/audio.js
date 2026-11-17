// Neon Tide — Palmera Bay: sound, synthesized live with WebAudio.
// No audio files: every sound is an oscillator or a burst of filtered
// noise, so the game ships zero bytes of audio and still roars.

const AudioSys = (function () {
  const sys = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenLfo: null,
    muted: false,
    started: false,
    lastHorn: 0,
  };

  // Create the context on the first user gesture (browsers demand it).
  function ensure() {
    if (sys.ctx) {
      if (sys.ctx.state === 'suspended') sys.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      sys.ctx = new AC();
      sys.master = sys.ctx.createGain();
      sys.master.gain.value = sys.muted ? 0 : 0.5;
      sys.master.connect(sys.ctx.destination);
      // Engine: a sawtooth whose pitch follows speed, always running.
      sys.engineOsc = sys.ctx.createOscillator();
      sys.engineOsc.type = 'sawtooth';
      sys.engineOsc.frequency.value = 55;
      const engineFilter = sys.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 900;
      sys.engineGain = sys.ctx.createGain();
      sys.engineGain.gain.value = 0.0;
      sys.engineOsc.connect(engineFilter);
      engineFilter.connect(sys.engineGain);
      sys.engineGain.connect(sys.master);
      sys.engineOsc.start();
      // Siren: a triangle wave wobbling between two notes.
      sys.sirenOsc = sys.ctx.createOscillator();
      sys.sirenOsc.type = 'triangle';
      sys.sirenOsc.frequency.value = 720;
      sys.sirenGain = sys.ctx.createGain();
      sys.sirenGain.gain.value = 0.0;
      sys.sirenLfo = sys.ctx.createOscillator();
      sys.sirenLfo.type = 'square';
      sys.sirenLfo.frequency.value = 0.9;
      const lfoGain = sys.ctx.createGain();
      lfoGain.gain.value = 180;
      sys.sirenLfo.connect(lfoGain);
      lfoGain.connect(sys.sirenOsc.frequency);
      sys.sirenOsc.connect(sys.sirenGain);
      sys.sirenGain.connect(sys.master);
      sys.sirenOsc.start();
      sys.sirenLfo.start();
      sys.started = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  // Per-frame update: engine pitch from the player car's speed, siren
  // volume from the nearest police distance.
  function update(playerSpeed, nearestPoliceDist, dt) {
    if (!sys.ctx || sys.muted) return;
    const t = sys.ctx.currentTime;
    const speedNorm = clamp(Math.abs(playerSpeed || 0) / CONFIG.playerMaxSpeed, 0, 1);
    sys.engineOsc.frequency.setTargetAtTime(52 + speedNorm * 165, t, 0.08);
    sys.engineGain.gain.setTargetAtTime(0.02 + speedNorm * 0.075, t, 0.1);
    const sirenOn = nearestPoliceDist !== null && nearestPoliceDist < POLICE.sirenRange;
    const sirenVol = sirenOn ? clamp(1 - nearestPoliceDist / POLICE.sirenRange, 0, 1) * 0.05 : 0;
    sys.sirenGain.gain.setTargetAtTime(sirenVol, t, 0.2);
  }

  // A short filtered-noise burst: crashes, skids and door slams.
  function noiseBurst(duration, filterFreq, volume, type) {
    if (!sys.ctx || sys.muted) return;
    const t = sys.ctx.currentTime;
    const len = Math.max(1, Math.floor(sys.ctx.sampleRate * duration));
    const buffer = sys.ctx.createBuffer(1, len, sys.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = sys.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = sys.ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = sys.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sys.master);
    src.start(t);
    src.stop(t + duration);
  }

  // A single note: pickups, UI clicks and jingles.
  function blip(freq, duration, volume, type, when) {
    if (!sys.ctx || sys.muted) return;
    const t = sys.ctx.currentTime + (when || 0);
    const osc = sys.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = sys.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(sys.master);
    osc.start(t);
    osc.stop(t + duration);
  }

  function crash() { noiseBurst(0.28, 700, 0.5); blip(70, 0.2, 0.3, 'sine'); }
  function skid() { noiseBurst(0.18, 2400, 0.12, 'bandpass'); }
  function horn() {
    const now = performance.now();
    if (now - sys.lastHorn < 350) return;
    sys.lastHorn = now;
    blip(370, 0.28, 0.16, 'square');
    blip(466, 0.28, 0.12, 'square');
  }
  function pickup() { blip(660, 0.09, 0.2); blip(990, 0.14, 0.2, 'sine', 0.08); }
  function doorSlam() { noiseBurst(0.1, 500, 0.3); }
  function busted() {
    blip(220, 0.5, 0.25, 'sawtooth');
    blip(174, 0.7, 0.25, 'sawtooth', 0.35);
  }
  function missionComplete() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => blip(n, 0.22, 0.2, 'triangle', i * 0.11));
  }
  function missionFailed() {
    blip(392, 0.3, 0.2, 'sawtooth');
    blip(311, 0.45, 0.2, 'sawtooth', 0.25);
  }

  // A two-note police sting when the wanted level climbs.
  function wantedUp() {
    blip(587, 0.16, 0.2, 'square');
    blip(440, 0.26, 0.2, 'square', 0.14);
  }

  // A quick engine rev when the player climbs into a car.
  function engineStart() {
    if (!sys.ctx || sys.muted) return;
    const t = sys.ctx.currentTime;
    sys.engineOsc.frequency.setValueAtTime(48, t);
    sys.engineOsc.frequency.exponentialRampToValueAtTime(190, t + 0.35);
    sys.engineOsc.frequency.exponentialRampToValueAtTime(70, t + 0.7);
  }

  function toggleMute() {
    sys.muted = !sys.muted;
    if (sys.master) sys.master.gain.value = sys.muted ? 0 : 0.5;
    return sys.muted;
  }

  return {
    sys, ensure, update, crash, skid, horn, pickup, doorSlam,
    busted, missionComplete, missionFailed, wantedUp, engineStart, toggleMute,
  };
})();
