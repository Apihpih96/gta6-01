/**
 * Seeded pseudo-random number generator — mulberry32 with helpers.
 *
 * All functions take an `rng` (the function returned by createRNG) as their
 * first argument so the caller controls which generator is used — this makes
 * every system independently reproducible from a single world seed.
 *
 * Exports:
 *   createRNG(seed)    — mulberry32 PRNG, returns a () => float function
 *   randInt(rng, min, max)      — integer in [min, max] inclusive
 *   randFloat(rng, min, max)    — float in [min, max)
 *   randChoice(rng, arr)        — random element from array
 *   shuffle(rng, arr)           — Fisher-Yates in-place
 *   hashSeed(str)               — string → 32-bit seed (djb2 variant)
 *   combineSeeds(a, b)          — merge two numeric seeds into one
 */

/** Create a mulberry32 PRNG from a 32-bit seed. */
export function createRNG(seed) {
  let s = seed | 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a random integer in [min, max] inclusive. */
export function randInt(rng, min, max) {
  if (max < min) { const tmp = min; min = max; max = tmp; }
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Pick a random float in [min, max). */
export function randFloat(rng, min, max) {
  return rng() * (max - min) + min;
}

/** Pick a random element from an array. */
export function randChoice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Shuffle an array in place (Fisher-Yates) and return it. */
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Deterministic seed from a string (simple djb2-style hash). */
export function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** Deterministic seed from two numeric seeds (used for combining scene + world seed). */
export function combineSeeds(a, b) {
  let h = a | 0;
  h = (Math.imul(31, h) + (b | 0)) | 0;
  return h >>> 0;
}
