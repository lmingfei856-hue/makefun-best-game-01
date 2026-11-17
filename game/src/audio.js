// All sound is synthesised with WebAudio: no audio files, no network.
// The context starts on the first user gesture; every call before that is a
// safe no-op, so headless renders never throw.
let ctx = null;
let master = null;
let humNodes = null;

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function tone(freq, dur, type, vol, slideTo = null, delay = 0) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, vol, filterFreq, delay = 0) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t0);
}

export const sfx = {
  shoot(kind) {
    if (kind === 'smg') { tone(920, 0.07, 'square', 0.16, 320); noise(0.05, 0.08, 3200); }
    else if (kind === 'shotgun') { tone(180, 0.16, 'sawtooth', 0.3, 60); noise(0.14, 0.28, 1400); }
    else if (kind === 'rail') { tone(1400, 0.22, 'sawtooth', 0.24, 120); noise(0.18, 0.2, 5200); }
    else { tone(740, 0.09, 'square', 0.2, 240); noise(0.06, 0.1, 2800); }
  },
  dryFire() { tone(300, 0.04, 'square', 0.08, 200); },
  reload() { tone(520, 0.06, 'square', 0.1, 380); tone(660, 0.06, 'square', 0.1, 520, 0.09); },
  hit() { tone(1250, 0.05, 'sine', 0.22, 900); },
  kill() { tone(880, 0.1, 'sine', 0.22, 220); tone(1320, 0.08, 'sine', 0.12, 660, 0.05); },
  explosion() { noise(0.5, 0.4, 900); tone(90, 0.4, 'sine', 0.34, 35); },
  hurt() { tone(140, 0.18, 'sawtooth', 0.26, 70); },
  droneShot() { tone(340, 0.14, 'sawtooth', 0.1, 180); },
  telegraph() { tone(1800, 0.3, 'sine', 0.07, 2400); },
  buy() { tone(880, 0.08, 'sine', 0.2); tone(1318, 0.12, 'sine', 0.2, null, 0.08); },
  denied() { tone(220, 0.14, 'square', 0.14, 160); },
  roundStart() { tone(220, 0.35, 'sawtooth', 0.2, 440); tone(440, 0.4, 'sawtooth', 0.16, 880, 0.1); },
  roundClear() { [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'sine', 0.18, null, i * 0.09)); },
  victory() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.2, null, i * 0.11)); },
  defeat() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.18, null, i * 0.16)); },
};

export function startHum() {
  const c = ensure();
  if (!c || humNodes) return;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 55;
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.11;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.012;
  const gain = c.createGain();
  gain.gain.value = 0.05;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  osc.connect(gain);
  gain.connect(master);
  osc.start();
  lfo.start();
  humNodes = { osc, lfo };
}
