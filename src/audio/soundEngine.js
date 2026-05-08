// Centralized sound system. All sounds are synthesized via the Web Audio
// API — no external sample files. The single AudioContext is created
// lazily on the first user gesture (browsers block AudioContext until
// then). Mute state persists in localStorage across page reloads.
//
// Every named sound function below is a no-op when muted or when the
// context hasn't been initialized yet — callers don't need to guard.

const MUTE_STORAGE_KEY = "mapotofu.muted";
const MASTER_VOLUME_DEFAULT = 0.7;

const listeners = new Set();

let ctx = null;
let masterGain = null;
let muted = readMutedFromStorage();
let masterVolume = MASTER_VOLUME_DEFAULT;

function readMutedFromStorage() {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMutedToStorage(value) {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // localStorage unavailable (private browsing, etc.) — non-fatal.
  }
}

// Lazily-created single AudioContext. The first call to ensureContext()
// from inside a user gesture handler "unlocks" the context; subsequent
// calls just return it.
function ensureContext() {
  if (ctx) return ctx;
  const Ctor =
    typeof window !== "undefined" &&
    (window.AudioContext || window.webkitAudioContext);
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : masterVolume;
    masterGain.connect(ctx.destination);
  } catch (e) {
    console.warn("soundEngine: AudioContext init failed", e);
    ctx = null;
    masterGain = null;
  }
  return ctx;
}

function isReady() {
  return !!ctx && !!masterGain && !muted;
}

function now() {
  return ctx.currentTime;
}

function notifyListeners() {
  for (const fn of listeners) {
    try {
      fn(muted);
    } catch (e) {
      console.warn("soundEngine: mute listener threw", e);
    }
  }
}

// ---------- Public mute / volume API ----------

export function isMuted() {
  return muted;
}

export function setMuted(next) {
  const value = !!next;
  if (value === muted) return;
  muted = value;
  writeMutedToStorage(muted);
  if (masterGain && ctx) {
    masterGain.gain.cancelScheduledValues(now());
    masterGain.gain.setValueAtTime(muted ? 0 : masterVolume, now());
  }
  notifyListeners();
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

export function setMasterVolume(v) {
  masterVolume = Math.max(0, Math.min(1, v));
  if (masterGain && !muted) {
    masterGain.gain.setValueAtTime(masterVolume, now());
  }
}

export function onMuteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- AudioContext warm-up ----------
//
// Call once during app boot. This installs one-shot listeners on common
// user-gesture events that initialize the AudioContext — required because
// browsers block AudioContext creation/resume until a gesture happens.
export function installUserGestureUnlock(target = window) {
  if (!target || typeof target.addEventListener !== "function") return;
  const events = ["pointerdown", "mousedown", "touchstart", "keydown"];
  const handler = () => {
    const c = ensureContext();
    if (c && c.state === "suspended") {
      c.resume().catch(() => {});
    }
    for (const ev of events) target.removeEventListener(ev, handler, true);
  };
  for (const ev of events) target.addEventListener(ev, handler, true);
}

// ---------- Helpers for synthesis ----------

function makeOsc(freq, type = "sine") {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, now());
  return o;
}

function makeGain(initial = 0) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(initial, now());
  return g;
}

// Generates a buffer of white noise (mono). Reused between calls.
let _noiseBuffer = null;
function noiseBuffer() {
  if (_noiseBuffer && _noiseBuffer.sampleRate === ctx.sampleRate) {
    return _noiseBuffer;
  }
  const len = Math.floor(ctx.sampleRate * 1.0);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  _noiseBuffer = buf;
  return buf;
}

function makeNoiseSource() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  return src;
}

function envelopeAndStop(gainNode, source, attackMs, durationMs, peak = 1) {
  const t0 = now();
  const attackS = attackMs / 1000;
  const totalS = durationMs / 1000;
  const releaseS = Math.max(0.005, totalS - attackS);
  gainNode.gain.cancelScheduledValues(t0);
  gainNode.gain.setValueAtTime(0, t0);
  gainNode.gain.linearRampToValueAtTime(peak, t0 + attackS);
  // Exponential ramp for natural decay; targets a tiny floor (0.0001).
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + attackS + releaseS);
  source.start(t0);
  source.stop(t0 + totalS + 0.05);
}

// ---------- Public sound functions ----------

// Short, crisp tick. ~1000 Hz, ~80 ms decay.
export function buttonClick() {
  if (!isReady()) return;
  const o = makeOsc(1000, "sine");
  const g = makeGain(0);
  o.connect(g).connect(masterGain);
  envelopeAndStop(g, o, 4, 80, 0.6);
}

// Dull, low thud for disabled-button feedback.
export function buttonDisabled() {
  if (!isReady()) return;
  const o = makeOsc(200, "sine");
  const g = makeGain(0);
  o.connect(g).connect(masterGain);
  envelopeAndStop(g, o, 4, 60, 0.45);
}

// Very subtle hover blip. Easy to overlook, which is the point.
export function hoverTick() {
  if (!isReady()) return;
  const o = makeOsc(1200, "sine");
  const g = makeGain(0);
  o.connect(g).connect(masterGain);
  envelopeAndStop(g, o, 2, 30, 0.08);
}

// Smooth whoosh for scene transitions: 300 Hz → 80 Hz over 400 ms with a
// short reverb-ish tail (a second softer pass on the same envelope).
export function sceneTransition() {
  if (!isReady()) return;
  const t0 = now();
  const dur = 0.4;

  const o = makeOsc(300, "sine");
  o.frequency.setValueAtTime(300, t0);
  o.frequency.exponentialRampToValueAtTime(80, t0 + dur);
  const g = makeGain(0);
  g.gain.linearRampToValueAtTime(0.4, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(masterGain);
  o.start(t0);
  o.stop(t0 + dur + 0.05);

  // Soft tail: lowpass-filtered noise that fades right after the sweep,
  // to suggest a tiny bit of reverberation without an actual reverb node.
  const noise = makeNoiseSource();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(600, t0);
  const ng = makeGain(0);
  ng.gain.linearRampToValueAtTime(0.05, t0 + 0.08);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.2);
  noise.connect(lp).connect(ng).connect(masterGain);
  noise.start(t0);
  noise.stop(t0 + dur + 0.25);
}

// Light "pop" upward for picking up an item: 300 Hz → 600 Hz over 100 ms.
export function itemPickup() {
  if (!isReady()) return;
  const t0 = now();
  const dur = 0.1;
  const o = makeOsc(300, "sine");
  o.frequency.setValueAtTime(300, t0);
  o.frequency.exponentialRampToValueAtTime(600, t0 + dur);
  const g = makeGain(0);
  g.gain.linearRampToValueAtTime(0.45, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(masterGain);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// Soft "plop" for dropping into the basket: ~350 Hz with a short tail.
export function itemDropBasket() {
  if (!isReady()) return;
  const t0 = now();
  const dur = 0.2;
  const o = makeOsc(380, "sine");
  o.frequency.setValueAtTime(380, t0);
  o.frequency.exponentialRampToValueAtTime(280, t0 + dur);
  const g = makeGain(0);
  g.gain.linearRampToValueAtTime(0.5, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(masterGain);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// Wet "sploosh" for dropping into the pot: low thud + filtered noise sizzle.
export function itemDropPot() {
  if (!isReady()) return;
  const t0 = now();

  // Layer 1 — low thud
  const o = makeOsc(200, "sine");
  o.frequency.setValueAtTime(220, t0);
  o.frequency.exponentialRampToValueAtTime(140, t0 + 0.08);
  const g = makeGain(0);
  g.gain.linearRampToValueAtTime(0.5, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
  o.connect(g).connect(masterGain);
  o.start(t0);
  o.stop(t0 + 0.1);

  // Layer 2 — sizzle: bandpass-filtered noise burst
  const noise = makeNoiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(2000, t0);
  bp.Q.setValueAtTime(0.8, t0);
  const ng = makeGain(0);
  ng.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
  noise.connect(bp).connect(ng).connect(masterGain);
  noise.start(t0);
  noise.stop(t0 + 0.32);
}

// Quick descending "bloop" for rejected drops: 500 Hz → 250 Hz over 150 ms.
export function itemRejected() {
  if (!isReady()) return;
  const t0 = now();
  const dur = 0.15;
  const o = makeOsc(500, "sine");
  o.frequency.setValueAtTime(500, t0);
  o.frequency.exponentialRampToValueAtTime(250, t0 + dur);
  const g = makeGain(0);
  g.gain.linearRampToValueAtTime(0.4, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(masterGain);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// Internal helper: a clang at frequency `freq` with a long resonant tail
// of `tailMs`. Used for cookwareLand() and lidPlace().
function clang(freq, tailMs) {
  const t0 = now();
  const tailS = tailMs / 1000;

  // Sharp attack on a sine, with two harmonics to give it metal character.
  const fundamental = makeOsc(freq, "sine");
  const partial2 = makeOsc(freq * 2.7, "sine"); // inharmonic 2nd partial
  const partial3 = makeOsc(freq * 5.4, "sine"); // inharmonic 3rd partial

  const gFund = makeGain(0);
  const gP2 = makeGain(0);
  const gP3 = makeGain(0);

  gFund.gain.linearRampToValueAtTime(0.55, t0 + 0.005);
  gFund.gain.exponentialRampToValueAtTime(0.0001, t0 + tailS);
  gP2.gain.linearRampToValueAtTime(0.18, t0 + 0.005);
  gP2.gain.exponentialRampToValueAtTime(0.0001, t0 + tailS * 0.7);
  gP3.gain.linearRampToValueAtTime(0.08, t0 + 0.005);
  gP3.gain.exponentialRampToValueAtTime(0.0001, t0 + tailS * 0.5);

  fundamental.connect(gFund).connect(masterGain);
  partial2.connect(gP2).connect(masterGain);
  partial3.connect(gP3).connect(masterGain);

  fundamental.start(t0);
  partial2.start(t0);
  partial3.start(t0);
  fundamental.stop(t0 + tailS + 0.05);
  partial2.stop(t0 + tailS + 0.05);
  partial3.stop(t0 + tailS + 0.05);
}

// Metallic clang with resonance for cookware landing on the stove.
export function cookwareLand() {
  if (!isReady()) return;
  clang(800, 600);
}

// Deeper, longer clang for placing a lid on a pot.
export function lidPlace() {
  if (!isReady()) return;
  clang(500, 800);
}

// Subtle crackle whose intensity scales with the fire level (0–1).
export function fireAdjust(level = 0.5) {
  if (!isReady()) return;
  const lv = Math.max(0, Math.min(1, level));
  const t0 = now();
  const dur = 0.15;

  const noise = makeNoiseSource();
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  // Cutoff scales from ~600 Hz (low fire) to ~2400 Hz (high fire).
  const cutoff = 600 + lv * 1800;
  filter.frequency.setValueAtTime(cutoff, t0);
  filter.Q.setValueAtTime(1.2, t0);

  const g = makeGain(0);
  const peak = 0.05 + lv * 0.18; // quiet at low levels, crackly at max
  g.gain.linearRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  noise.connect(filter).connect(g).connect(masterGain);
  noise.start(t0);
  noise.stop(t0 + dur + 0.05);
}

// Internal: play a sine "note" at `freq` with given duration, starting at
// `tOffset` seconds after now(). Soft attack/release for a warm tone.
function chimeNote(freq, durMs, tOffsetS = 0, peak = 0.4) {
  const t0 = now() + tOffsetS;
  const durS = durMs / 1000;
  const o = makeOsc(freq, "sine");
  const g = makeGain(0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
  o.connect(g).connect(masterGain);
  o.start(t0);
  o.stop(t0 + durS + 0.05);
}

// Warm 3-note chime for completing a cook: C5 → E5 → G5.
export function cookingComplete() {
  if (!isReady()) return;
  const noteMs = 150;
  const overlapS = 0.1; // each note starts 100 ms after the previous
  chimeNote(523.25, noteMs, 0, 0.35);
  chimeNote(659.25, noteMs, overlapS, 0.35);
  chimeNote(783.99, noteMs, overlapS * 2, 0.35);
}

// Gentle shimmer: high sine sweep 600 → 1200 Hz over 500 ms at low gain.
export function imageReveal() {
  if (!isReady()) return;
  const t0 = now();
  const dur = 0.5;
  const o = makeOsc(600, "sine");
  o.frequency.setValueAtTime(600, t0);
  o.frequency.exponentialRampToValueAtTime(1200, t0 + dur);
  const g = makeGain(0);
  g.gain.linearRampToValueAtTime(0.3, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(masterGain);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// Warm two-note chime for "Add to Gallery": C5 then G5.
export function addToGallery() {
  if (!isReady()) return;
  chimeNote(523.25, 200, 0, 0.4);
  chimeNote(783.99, 200, 0.18, 0.4);
}

// Soft single chime ping for a new gallery entry appearing in real time.
export function newGalleryEntry() {
  if (!isReady()) return;
  chimeNote(880, 300, 0, 0.25);
}
