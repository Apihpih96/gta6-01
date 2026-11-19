/**
 * Audio engine: WebAudio synthesis for Solar Coast.
 *
 * All sounds are synthesised with oscillators and noise — no audio files,
 * no downloads, zero network requests.  Created lazily on the first user
 * gesture so browsers allow AudioContext.
 *
 * Exports:
 *   createAudioEngine() — returns { init, play, startMusic, stopMusic,
 *       isMuted, setMuted, getContext }
 *
 * Sound catalogue (all original):
 *   engine        — engine hum, oscillator pitch follows speed
 *   siren         — two-tone police wail
 *   punch         — low thud
 *   pedYelp       — short filtered blip
 *   carDoor       — enter/exit blip
 *   crash         — collision thump
 *   cash          — cha-ching two-note chime
 *   missionOk     — 4-note completion jingle
 *   missionFail   — low buzz
 *   bustedSting   — BUSTED sting
 *   wastedSting   — WASTED sting
 *   uiClick       — UI button blip
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let _ctx = null;
let _masterGain = null;
let _musicGain = null;
let _sfxGain = null;
let _muted = false;
let _initialised = false;
let _musicNodes = null;
let _musicPlaying = false;
let _sirenNodes = null;

/** Ensure AudioContext + master gain exist (called on first gesture). */
function ensureCtx() {
  if (_ctx) return _ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  _ctx = new AC();
  _masterGain = _ctx.createGain();
  _masterGain.gain.value = _muted ? 0 : 1;
  _masterGain.connect(_ctx.destination);

  _musicGain = _ctx.createGain();
  _musicGain.gain.value = 0.18;
  _musicGain.connect(_masterGain);

  _sfxGain = _ctx.createGain();
  _sfxGain.gain.value = 0.6;
  _sfxGain.connect(_masterGain);

  return _ctx;
}

/** Short noise burst — used for percussion / impacts. */
function noiseBurst(duration, filterFreq, gainVal) {
  if (!ensureCtx()) return;
  const len = Math.max(64, Math.ceil(_ctx.sampleRate * duration));
  const buf = _ctx.createBuffer(1, len, _ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = _ctx.createBufferSource();
  src.buffer = buf;
  const filt = _ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = filterFreq;
  const g = _ctx.createGain();
  // Clamp gain to avoid clipping through master bus
  const clampedGain = Math.min(1, Math.max(0.001, gainVal));
  g.gain.setValueAtTime(clampedGain, _ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, _ctx.currentTime + duration);
  src.connect(filt).connect(g).connect(_sfxGain);
  src.start();
  src.stop(_ctx.currentTime + duration + 0.01);
}

/** Simple oscillator tone. */
function tone(freq, duration, type, gainVal, detune) {
  if (!ensureCtx()) return;
  const o = _ctx.createOscillator();
  o.type = type || 'sine';
  o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  const g = _ctx.createGain();
  // Clamp gain to prevent pops from excessive volume
  const clampedGain = Math.min(0.5, Math.max(0.001, gainVal || 0.3));
  g.gain.setValueAtTime(clampedGain, _ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, _ctx.currentTime + duration);
  o.connect(g).connect(_sfxGain);
  o.start();
  o.stop(_ctx.currentTime + duration + 0.01);
}

/** Two-note chime (ascending). */
function chime(f1, f2, duration, gainVal) {
  if (!ensureCtx()) return;
  tone(f1, duration * 0.6, 'sine', gainVal || 0.25);
  setTimeout(() => tone(f2, duration * 0.5, 'sine', gainVal || 0.25), duration * 200);
}

// ---------------------------------------------------------------------------
// Music: quiet looping groove (~100 BPM) — bass line + noise hats
// ---------------------------------------------------------------------------

const BPM = 100;
const BEAT = 60 / BPM; // 0.6 s per beat
const BAR = BEAT * 4;  // 2.4 s per bar
// Original bass melody (C minor-ish): 8 eighth-notes, clearly not any known song
const BASS_NOTES = [65.41, 65.41, 77.78, 77.78, 87.31, 87.31, 98.00, 87.31]; // C2, Eb2, F2, G2, F2

function _startMusicLoop() {
  if (!_ctx || _musicPlaying) return;
  _musicPlaying = true;

  // Bass oscillator
  const bassOsc = _ctx.createOscillator();
  bassOsc.type = 'triangle';
  const bassGain = _ctx.createGain();
  bassGain.gain.value = 0;
  bassOsc.connect(bassGain).connect(_musicGain);

  // Noise hi-hats
  const hatLen = Math.ceil(_ctx.sampleRate * BAR * 4); // 4 bars of hat noise
  const hatBuf = _ctx.createBuffer(1, hatLen, _ctx.sampleRate);
  const hatData = hatBuf.getChannelData(0);
  for (let i = 0; i < hatLen; i++) hatData[i] = Math.random() * 2 - 1;
  const hatSrc = _ctx.createBufferSource();
  hatSrc.buffer = hatBuf;
  hatSrc.loop = true;
  const hatFilt = _ctx.createBiquadFilter();
  hatFilt.type = 'highpass';
  hatFilt.frequency.value = 8000;
  const hatGain = _ctx.createGain();
  hatGain.gain.value = 0.06;
  hatSrc.connect(hatFilt).connect(hatGain).connect(_musicGain);

  // Schedule bass notes (eighth-notes, looping 8 notes = 1 bar)
  function scheduleBassBar(startTime) {
    for (let i = 0; i < BASS_NOTES.length; i++) {
      const t = startTime + i * (BEAT / 2);
      bassOsc.frequency.setValueAtTime(BASS_NOTES[i], t);
      bassGain.gain.setValueAtTime(0.35, t);
      bassGain.gain.exponentialRampToValueAtTime(0.001, t + BEAT * 0.4);
    }
  }

  // Pre-schedule 4 bars, then keep extending
  let nextBarTime = _ctx.currentTime;
  function extendBass() {
    scheduleBassBar(nextBarTime);
    nextBarTime += BAR;
    if (_musicPlaying) _ctx.setTimeout(extendBass, BAR * 1000 * 0.75);
  }

  bassOsc.start();
  hatSrc.start();
  extendBass();

  _musicNodes = { bassOsc, bassGain, hatSrc, hatGain, hatFilt };
}

function _stopMusic() {
  if (!_musicNodes) return;
  try {
    _musicNodes.bassOsc.stop();
    _musicNodes.hatSrc.stop();
  } catch (_e) { /* already stopped */ }
  _musicNodes = null;
  _musicPlaying = false;
}

// ---------------------------------------------------------------------------
// Siren: two-tone wail that ducks music
// ---------------------------------------------------------------------------

function _startSiren() {
  if (!_ctx || _sirenNodes) return;
  const o = _ctx.createOscillator();
  o.type = 'sawtooth';
  const g = _ctx.createGain();
  g.gain.value = 0.08;

  // LFO to sweep between two frequencies
  const lfo = _ctx.createOscillator();
  lfo.frequency.value = 1.2; // wail speed
  const lfoGain = _ctx.createGain();
  lfoGain.gain.value = 120;  // sweep range
  lfo.connect(lfoGain).connect(o.frequency);
  o.frequency.value = 520;   // centre

  // Duck music while siren is on
  if (_musicGain) {
    _musicGain.gain.setTargetAtTime(0.06, _ctx.currentTime, 0.3);
  }

  o.connect(g).connect(_sfxGain);
  o.start();
  lfo.start();
  _sirenNodes = { o, lfo, g };
}

function _stopSiren() {
  if (!_sirenNodes) return;
  try {
    _sirenNodes.o.stop();
    _sirenNodes.lfo.stop();
  } catch (_e) { /* already stopped */ }
  _sirenNodes = null;
  if (_musicGain) {
    _musicGain.gain.setTargetAtTime(0.18, _ctx.currentTime, 0.5);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Call once on first user gesture (start button click / keypress). */
export function init() {
  if (_initialised) return;
  const ctx = ensureCtx();
  if (!ctx) return; // AudioContext not supported
  // Resume may reject if the browser still considers it a non-gesture context
  ctx.resume().catch(() => { /* will retry on next gesture */ });
  _initialised = true;
  // Start title-screen ambient music
  _startMusicLoop();
}

/**
 * Play a named sound.  Extra `opts` are sound-specific:
 *   audio.play('engine', { speed: 0.8 })  — speed 0..1 maps to pitch
 *   audio.play('siren', { on: true })     — start/stop siren
 */
export function play(name, opts) {
  if (!_initialised) return;
  if (_muted) return;

  switch (name) {
    case 'engine': {
      // Continuous hum — handled externally via start/stop engine
      return;
    }
    case 'siren': {
      if (opts && opts.on) _startSiren(); else _stopSiren();
      return;
    }
    case 'punch':
      noiseBurst(0.12, 300, 0.5);
      tone(80, 0.1, 'sine', 0.3);
      return;
    case 'pedYelp':
      tone(900, 0.15, 'square', 0.12);
      return;
    case 'carDoor':
      tone(440, 0.08, 'sine', 0.2);
      setTimeout(() => tone(520, 0.06, 'sine', 0.15), 60);
      return;
    case 'crash':
      noiseBurst(0.2, 500, 0.6);
      tone(60, 0.15, 'sine', 0.4);
      return;
    case 'cash':
      chime(880, 1175, 0.25, 0.3);
      return;
    case 'missionOk':
      // Original 4-note: C5 E5 G5 C6
      if (!ensureCtx()) return;
      tone(523.25, 0.2, 'sine', 0.25);
      setTimeout(() => tone(659.25, 0.2, 'sine', 0.25), 150);
      setTimeout(() => tone(783.99, 0.2, 'sine', 0.25), 300);
      setTimeout(() => tone(1046.5, 0.35, 'sine', 0.3), 450);
      return;
    case 'missionFail':
      tone(150, 0.5, 'sawtooth', 0.2);
      return;
    case 'bustedSting':
      if (!ensureCtx()) return;
      tone(200, 0.6, 'square', 0.25);
      setTimeout(() => tone(150, 0.8, 'square', 0.3), 200);
      return;
    case 'wastedSting':
      if (!ensureCtx()) return;
      tone(300, 0.3, 'sawtooth', 0.3);
      setTimeout(() => tone(200, 0.3, 'sawtooth', 0.3), 150);
      setTimeout(() => tone(100, 0.8, 'sawtooth', 0.35), 300);
      return;
    case 'uiClick':
      tone(660, 0.04, 'sine', 0.15);
      return;
    default:
      return;
  }
}

/** Start engine hum; call repeatedly while driving with current speed (0..1 normalised). */
let _engineOsc = null;
let _engineGain = null;

export function startEngine() {
  if (!_initialised || _muted) return;
  if (!ensureCtx()) return;
  if (_engineOsc) return;
  _engineOsc = _ctx.createOscillator();
  _engineOsc.type = 'sawtooth';
  _engineOsc.frequency.value = 60;
  _engineGain = _ctx.createGain();
  _engineGain.gain.value = 0;
  _engineOsc.connect(_engineGain).connect(_sfxGain);
  _engineOsc.start();
}

export function updateEngine(speedNorm) {
  if (!_engineOsc || !_ctx) return;
  const t = _ctx.currentTime;
  // Clamp normalised speed to [0, 1] to keep pitch in valid range
  const sn = Math.max(0, Math.min(1, speedNorm));
  const pitch = 55 + sn * 180; // 55 Hz idle → 235 Hz at full speed
  _engineOsc.frequency.setTargetAtTime(pitch, t, 0.05);
  _engineGain.gain.setTargetAtTime(0.04 + sn * 0.08, t, 0.05);
}

export function stopEngine() {
  if (_engineOsc) {
    try { _engineOsc.stop(); } catch (_e) { /* already stopped */ }
    _engineOsc = null;
    _engineGain = null;
  }
}

export function startMusic() {
  if (!_initialised) return;
  _startMusicLoop();
}

export function stopMusic() {
  _stopMusic();
}

export function isMuted() {
  return _muted;
}

export function setMuted(val) {
  _muted = val;
  if (_masterGain) {
    _masterGain.gain.setTargetAtTime(val ? 0 : 1, _ctx.currentTime, 0.05);
  }
}

export function getContext() {
  return _ctx;
}

export function isInitialised() {
  return _initialised;
}

/** Convenience: create the engine object (all functions bound). */
export function createAudioEngine() {
  return {
    init,
    play,
    startEngine,
    updateEngine,
    stopEngine,
    startMusic,
    stopMusic,
    isMuted,
    setMuted,
    getContext,
    isInitialised,
  };
}
