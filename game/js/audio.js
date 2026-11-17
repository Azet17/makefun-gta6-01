// Neon Tide — Palmera Bay: synthesized sound.
// WebAudio only — no audio files, no network. Engine hum, sirens,
// crashes, pickups and mission jingles are all oscillators and
// filtered noise built at runtime. Silent until the player first
// interacts, as browsers require.
'use strict';

function makeAudio() {
  const audio = {
    ctx: null, master: null, engineOsc: null, engineGain: null,
    sirenOsc: null, sirenGain: null, muted: false, started: false,
  };
  return audio;
}

function audioEnsure(audio) {
  if (audio.started) {
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    return true;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.5;
    audio.master.connect(audio.ctx.destination);
    // Engine: a low sawtooth whose pitch follows speed.
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 55;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    const engineFilter = audio.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    audio.engineOsc.connect(engineFilter);
    engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    // Siren: a triangle wave that wails between two notes.
    audio.sirenOsc = audio.ctx.createOscillator();
    audio.sirenOsc.type = 'triangle';
    audio.sirenOsc.frequency.value = 700;
    audio.sirenGain = audio.ctx.createGain();
    audio.sirenGain.gain.value = 0;
    audio.sirenOsc.connect(audio.sirenGain);
    audio.sirenGain.connect(audio.master);
    audio.sirenOsc.start();
    audio.started = true;
    return true;
  } catch (e) {
    return false;
  }
}

// Called every frame: engine pitch follows speed, siren wails when
// the wanted level is above zero.
function audioTick(audio, speed, wanted, dt) {
  if (!audio.started || !audio.ctx) return;
  const t = audio.ctx.currentTime;
  const target = Math.abs(speed) > 5 ? 0.05 + Math.min(0.12, Math.abs(speed) / 520 * 0.12) : 0;
  audio.engineGain.gain.setTargetAtTime(target, t, 0.1);
  audio.engineOsc.frequency.setTargetAtTime(50 + Math.abs(speed) * 0.22, t, 0.1);
  if (wanted > 0) {
    const wail = 650 + Math.sin(t * 3.2) * 260;
    audio.sirenOsc.frequency.setTargetAtTime(wail, t, 0.05);
    audio.sirenGain.gain.setTargetAtTime(0.045 + wanted * 0.008, t, 0.2);
  } else {
    audio.sirenGain.gain.setTargetAtTime(0, t, 0.2);
  }
}

function audioBlip(audio, freq, dur, type, vol) {
  if (!audio.started || !audio.ctx) return;
  try {
    const t = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.6), t + dur);
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(audio.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  } catch (e) { /* audio is best-effort */ }
}

// A short burst of filtered noise: crashes, skids, doors.
function audioNoise(audio, dur, vol, freq) {
  if (!audio.started || !audio.ctx) return;
  try {
    const t = audio.ctx.currentTime;
    const len = Math.max(1, Math.floor(audio.ctx.sampleRate * dur));
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq || 900;
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(audio.master);
    src.start(t);
  } catch (e) { /* audio is best-effort */ }
}

function audioCrash(audio) { audioNoise(audio, 0.25, 0.3, 700); audioBlip(audio, 90, 0.2, 'square', 0.12); }
function audioHorn(audio) { audioBlip(audio, 340, 0.18, 'square', 0.15); }
function audioPickup(audio) { audioBlip(audio, 880, 0.12, 'sine', 0.2); audioBlip(audio, 1320, 0.18, 'sine', 0.15); }
function audioSteal(audio) { audioNoise(audio, 0.15, 0.2, 1800); audioBlip(audio, 220, 0.25, 'sawtooth', 0.12); }
function audioMissionComplete(audio) {
  if (!audio.started) return;
  [523, 659, 784, 1046].forEach((f, i) => {
    setTimeout(() => audioBlip(audio, f, 0.22, 'triangle', 0.2), i * 110);
  });
}
function audioFail(audio) { audioBlip(audio, 220, 0.5, 'sawtooth', 0.15); audioBlip(audio, 160, 0.6, 'sawtooth', 0.12); }

function audioSetMuted(audio, muted) {
  audio.muted = muted;
  if (audio.master && audio.ctx) {
    audio.master.gain.setTargetAtTime(muted ? 0 : 0.5, audio.ctx.currentTime, 0.05);
  }
}
