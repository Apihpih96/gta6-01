/**
 * Solar Coast audio engine — WebAudio synthesised sounds and music.
 *
 * Zero external files.  All oscillators, noise, and filters are created
 * at runtime and only activated after a user gesture (browser policy).
 *
 * Public shape returned by createAudioEngine():
 *   { init, play, startEngine, updateEngine, stopEngine,
 *     startMusic, stopMusic, isMuted, setMuted, getContext, isInitialised }
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
let audioCtx = null;
let masterBus = null;
let musicBus = null;
let sfxBus = null;
let muted = false;
let ready = false;

// Siren state
let sirenOsc = null;
let sirenLfo = null;

// Engine hum state
let engineOsc = null;
let engineGain = null;

// Background music state
let musicRunning = false;
let musicOsc = null;
let musicGainNode = null;
let musicHatSrc = null;
let musicScheduleTime = 0;
let musicNoteIdx = 0;

// ---------------------------------------------------------------------------
// Context bootstrap
// ---------------------------------------------------------------------------

function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();

  masterBus = audioCtx.createGain();
  masterBus.gain.value = muted ? 0 : 1;
  masterBus.connect(audioCtx.destination);

  musicBus = audioCtx.createGain();
  musicBus.gain.value = 0.15;
  musicBus.connect(masterBus);

  sfxBus = audioCtx.createGain();
  sfxBus.gain.value = 0.55;
  sfxBus.connect(masterBus);

  return audioCtx;
}

// ---------------------------------------------------------------------------
// Primitive synthesiser helpers
// ---------------------------------------------------------------------------

/** Short noise burst through a low-pass filter — impacts and crashes. */
function emitNoise(lengthSec, cutoffHz, peakVol) {
  if (!audioCtx) return;
  const sampleCount = Math.max(64, Math.ceil(audioCtx.sampleRate * lengthSec));
  const buf = audioCtx.createBuffer(1, sampleCount, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1;

  const src = audioCtx.createBufferSource();
  src.buffer = buf;

  const filt = audioCtx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = cutoffHz;

  const env = audioCtx.createGain();
  const safeVol = Math.min(0.8, Math.max(0.001, peakVol));
  env.gain.setValueAtTime(safeVol, audioCtx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + lengthSec);

  src.connect(filt).connect(env).connect(sfxBus);
  src.start();
  src.stop(audioCtx.currentTime + lengthSec + 0.02);
}

/** Single oscillator tone with exponential decay envelope. */
function emitTone(freqHz, durationSec, waveType, peakVol) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  osc.type = waveType || 'sine';
  osc.frequency.value = freqHz;

  const env = audioCtx.createGain();
  const safeVol = Math.min(0.4, Math.max(0.001, peakVol || 0.25));
  env.gain.setValueAtTime(safeVol, audioCtx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationSec);

  osc.connect(env).connect(sfxBus);
  osc.start();
  osc.stop(audioCtx.currentTime + durationSec + 0.02);
}

/** Two-tone ascending chime. */
function emitChime(highFreq, lowFreq, dur, vol) {
  if (!audioCtx) return;
  emitTone(lowFreq, dur * 0.55, 'sine', vol || 0.22);
  setTimeout(() => emitTone(highFreq, dur * 0.45, 'sine', vol || 0.22), dur * 180);
}

// ---------------------------------------------------------------------------
// Individual sounds (mapped by name)
// ---------------------------------------------------------------------------

const soundMap = {
  punch() {
    emitNoise(0.1, 350, 0.45);
    emitTone(85, 0.09, 'sine', 0.28);
  },
  pedYelp() {
    emitTone(880, 0.12, 'square', 0.1);
  },
  carDoor() {
    emitTone(420, 0.07, 'sine', 0.18);
    setTimeout(() => emitTone(500, 0.05, 'sine', 0.14), 55);
  },
  crash() {
    emitNoise(0.18, 450, 0.55);
    emitTone(65, 0.14, 'sine', 0.35);
  },
  cash() {
    emitChime(1175, 880, 0.22, 0.28);
  },
  missionOk() {
    // Original ascending arpeggio: C5 → E5 → G5 → C6
    if (!audioCtx) return;
    emitTone(523.25, 0.18, 'sine', 0.22);
    setTimeout(() => emitTone(659.25, 0.18, 'sine', 0.22), 140);
    setTimeout(() => emitTone(783.99, 0.18, 'sine', 0.22), 280);
    setTimeout(() => emitTone(1046.5, 0.3, 'sine', 0.28), 420);
  },
  missionFail() {
    emitTone(155, 0.45, 'sawtooth', 0.18);
  },
  bustedSting() {
    if (!audioCtx) return;
    emitTone(210, 0.5, 'square', 0.22);
    setTimeout(() => emitTone(155, 0.7, 'square', 0.28), 180);
  },
  wastedSting() {
    if (!audioCtx) return;
    emitTone(290, 0.25, 'sawtooth', 0.28);
    setTimeout(() => emitTone(195, 0.25, 'sawtooth', 0.28), 140);
    setTimeout(() => emitTone(105, 0.7, 'sawtooth', 0.32), 280);
  },
  uiClick() {
    emitTone(640, 0.035, 'sine', 0.12);
  },
};

// ---------------------------------------------------------------------------
// Engine hum (continuous while driving)
// ---------------------------------------------------------------------------

function igniteEngine() {
  if (!audioCtx || muted || engineOsc) return;
  engineOsc = audioCtx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 58;
  engineGain = audioCtx.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(engineGain).connect(sfxBus);
  engineOsc.start();
}

function tuneEngine(normalisedSpeed) {
  if (!engineOsc || !audioCtx) return;
  const sn = Math.max(0, Math.min(1, normalisedSpeed));
  const t = audioCtx.currentTime;
  const pitch = 55 + sn * 175;
  const vol = 0.035 + sn * 0.075;
  engineOsc.frequency.setTargetAtTime(pitch, t, 0.04);
  engineGain.gain.setTargetAtTime(vol, t, 0.04);
}

function killEngine() {
  if (engineOsc) {
    try { engineOsc.stop(); } catch (_) { /* already stopped */ }
    engineOsc = null;
    engineGain = null;
  }
}

// ---------------------------------------------------------------------------
// Siren (two-tone wail that ducks music volume)
// ---------------------------------------------------------------------------

function igniteSiren() {
  if (!audioCtx || sirenOsc) return;

  sirenOsc = audioCtx.createOscillator();
  sirenOsc.type = 'sawtooth';
  sirenOsc.frequency.value = 510;

  const sirenVol = audioCtx.createGain();
  sirenVol.gain.value = 0.07;

  sirenLfo = audioCtx.createOscillator();
  sirenLfo.frequency.value = 1.1;
  const lfoDepth = audioCtx.createGain();
  lfoDepth.gain.value = 110;
  sirenLfo.connect(lfoDepth).connect(sirenOsc.frequency);

  // Duck the music while siren is active
  if (musicBus) {
    musicBus.gain.setTargetAtTime(0.05, audioCtx.currentTime, 0.25);
  }

  sirenOsc.connect(sirenVol).connect(sfxBus);
  sirenOsc.start();
  sirenLfo.start();
}

function killSiren() {
  if (!sirenOsc) return;
  try { sirenOsc.stop(); sirenLfo.stop(); } catch (_) {}
  sirenOsc = null;
  sirenLfo = null;

  if (musicBus) {
    musicBus.gain.setTargetAtTime(0.15, audioCtx.currentTime, 0.4);
  }
}

// ---------------------------------------------------------------------------
// Background music loop (~96 BPM, C minor-ish bass + noise hats)
// ---------------------------------------------------------------------------

const MUSIC_BPM = 96;
const BEAT_SEC = 60 / MUSIC_BPM;
const BAR_SEC = BEAT_SEC * 4;
// Original 8-note bass pattern (eighth-notes)
const BASS_SEQ = [65.41, 77.78, 65.41, 87.31, 77.78, 98.00, 87.31, 77.78];

function startGroove() {
  if (!audioCtx || musicRunning) return;
  musicRunning = true;

  // Bass oscillator
  musicOsc = audioCtx.createOscillator();
  musicOsc.type = 'triangle';
  musicGainNode = audioCtx.createGain();
  musicGainNode.gain.value = 0;
  musicOsc.connect(musicGainNode).connect(musicBus);

  // Hi-hat: looped noise buffer
  const hatLen = Math.ceil(audioCtx.sampleRate * BAR_SEC * 4);
  const hatBuf = audioCtx.createBuffer(1, hatLen, audioCtx.sampleRate);
  const hatData = hatBuf.getChannelData(0);
  for (let i = 0; i < hatLen; i++) hatData[i] = Math.random() * 2 - 1;
  musicHatSrc = audioCtx.createBufferSource();
  musicHatSrc.buffer = hatBuf;
  musicHatSrc.loop = true;
  const hatFilt = audioCtx.createBiquadFilter();
  hatFilt.type = 'highpass';
  hatFilt.frequency.value = 7500;
  const hatVol = audioCtx.createGain();
  hatVol.gain.value = 0.055;
  musicHatSrc.connect(hatFilt).connect(hatVol).connect(musicBus);

  musicOsc.start();
  musicHatSrc.start();

  musicScheduleTime = audioCtx.currentTime;
  musicNoteIdx = 0;
  scheduleBassAhead();
}

/** Pre-schedule one bar of bass notes, then re-schedule via timeout. */
function scheduleBassAhead() {
  for (let i = 0; i < BASS_SEQ.length; i++) {
    const t = musicScheduleTime + i * (BEAT_SEC / 2);
    musicOsc.frequency.setValueAtTime(BASS_SEQ[i], t);
    musicGainNode.gain.setValueAtTime(0.32, t);
    musicGainNode.gain.exponentialRampToValueAtTime(0.001, t + BEAT_SEC * 0.38);
  }
  musicScheduleTime += BAR_SEC;
  musicNoteIdx = (musicNoteIdx + 1) % 4;
  if (musicRunning) {
    setTimeout(scheduleBassAhead, BAR_SEC * 700);
  }
}

function stopGroove() {
  if (!musicOsc) return;
  try { musicOsc.stop(); musicHatSrc.stop(); } catch (_) {}
  musicOsc = null;
  musicGainNode = null;
  musicHatSrc = null;
  musicRunning = false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Must be called from a user gesture (click / keypress). */
export function init() {
  if (ready) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  ctx.resume().catch(() => {});
  ready = true;
  startGroove();
}

/**
 * Play a named sound.  Optional `opts` object for sound-specific params:
 *   play('siren', { on: true })   — toggle siren on/off
 */
export function play(name, opts) {
  if (!ready || muted) return;

  if (name === 'siren') {
    if (opts && opts.on) igniteSiren(); else killSiren();
    return;
  }
  if (name === 'engine') return; // handled by startEngine / updateEngine

  const fn = soundMap[name];
  if (fn) fn();
}

export function startEngine() { igniteEngine(); }
export function updateEngine(n) { tuneEngine(n); }
export function stopEngine() { killEngine(); }
export function startMusic() { startGroove(); }
export function stopMusic() { stopGroove(); }
export function isMuted() { return muted; }

export function setMuted(val) {
  muted = !!val;
  if (masterBus && audioCtx) {
    masterBus.gain.setTargetAtTime(val ? 0 : 1, audioCtx.currentTime, 0.04);
  }
}

export function getContext() { return audioCtx; }
export function isInitialised() { return ready; }

/** Factory: return a single object with all methods bound. */
export function createAudioEngine() {
  return {
    init, play, startEngine, updateEngine, stopEngine,
    startMusic, stopMusic, isMuted, setMuted, getContext, isInitialised,
  };
}
