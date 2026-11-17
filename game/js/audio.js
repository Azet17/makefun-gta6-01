// Neon Tide: Palmera Bay — synthesized sound.
// No audio files: every sound is a WebAudio oscillator or noise buffer
// built at runtime. The engine hums with speed, sirens wail two-tone,
// and pickups, punches and mission jingles are short blips.

export function makeAudio() {
  const audio = {
    ctx: null, master: null, engineOsc: null, engineGain: null,
    sirenOsc: null, sirenGain: null, muted: false, started: false,
  };

  audio.ensure = function () {
    if (audio.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(audio.ctx.destination);
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'triangle';
      audio.sirenOsc.frequency.value = 700;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      audio.started = true;
    } catch (e) {
      audio.started = false;
    }
  };

  audio.setMuted = function (muted) {
    audio.muted = muted;
    if (audio.master && audio.ctx) audio.master.gain.value = muted ? 0 : 0.5;
  };

  // Continuous engine tone: pitch and loudness follow the car's speed.
  audio.engine = function (speed, inCar) {
    if (!audio.started || !audio.ctx) return;
    const target = inCar ? 0.05 + Math.min(0.16, Math.abs(speed) / 560 * 0.16) : 0;
    audio.engineGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.08);
    audio.engineOsc.frequency.setTargetAtTime(52 + Math.abs(speed) * 0.22, audio.ctx.currentTime, 0.08);
  };

  // Two-tone siren while any police car is close.
  audio.siren = function (on, time) {
    if (!audio.started || !audio.ctx) return;
    audio.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, audio.ctx.currentTime, 0.15);
    if (on) audio.sirenOsc.frequency.setTargetAtTime(Math.floor(time * 1.4) % 2 === 0 ? 720 : 540, audio.ctx.currentTime, 0.05);
  };

  audio.blip = function (freq, dur, type, vol) {
    if (!audio.started || !audio.ctx) return;
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.value = vol || 0.12;
    g.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + (dur || 0.12));
    o.connect(g); g.connect(audio.master);
    o.start();
    o.stop(audio.ctx.currentTime + (dur || 0.12));
  };

  audio.pickup = function () { audio.blip(880, 0.1, 'square', 0.12); setTimeout(() => audio.blip(1320, 0.14, 'square', 0.1), 70); };
  audio.punch = function () { audio.blip(160, 0.09, 'sawtooth', 0.16); };
  audio.crash = function () { audio.blip(70, 0.25, 'sawtooth', 0.2); };
  audio.horn = function () { audio.blip(330, 0.22, 'square', 0.14); };
  audio.jingle = function () {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => audio.blip(f, 0.16, 'triangle', 0.14), i * 110));
  };
  audio.busted = function () {
    [392, 330, 262].forEach((f, i) => setTimeout(() => audio.blip(f, 0.22, 'sawtooth', 0.14), i * 160));
  };

  return audio;
}

// Audio pass 2: a tiny noise burst for skids and crashes, built from a
// one-shot buffer so no sound file is ever fetched.

export function makeNoiseBurst(audio, dur, vol) {
  if (!audio.started || !audio.ctx) return;
  const len = Math.floor(audio.ctx.sampleRate * (dur || 0.2));
  const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audio.ctx.createBufferSource();
  src.buffer = buf;
  const g = audio.ctx.createGain();
  g.gain.value = vol || 0.15;
  src.connect(g); g.connect(audio.master);
  src.start();
}
