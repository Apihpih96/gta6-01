/**
 * Wanted level system: 0–5 stars, crime heat, decay, police proximity checks.
 *
 * Exports:
 *   createWantedSystem() — returns { update, addHeat, getLevel, reset, isPoliceNearby }
 */

import { WANTED } from './config.js';

/** Create the wanted level tracker. */
export function createWantedSystem() {
  let wantedLevel = 0;
  let heatAccumulator = 0;
  let lastCrimeTime = 0;
  let decayTimer = 0;
  let policeNearby = false;

  /** Add heat toward the next wanted star. Each full point = +1 star. */
  function addHeat(amount, reason) {
    heatAccumulator += Math.max(0, amount);
    lastCrimeTime = performance.now() / 1000;
    decayTimer = 0;

    while (heatAccumulator >= 1 && wantedLevel < 5) {
      wantedLevel++;
      heatAccumulator -= 1;
    }
    if (wantedLevel >= 5) {
      heatAccumulator = 0;
    }
  }

  /** Reset wanted level to 0 (e.g. after bust). */
  function reset() {
    wantedLevel = 0;
    heatAccumulator = 0;
    lastCrimeTime = 0;
    decayTimer = 0;
  }

  /** Get current wanted level (0–5). */
  function getLevel() {
    return wantedLevel;
  }

  /**
   * Update: decay stars and track police proximity.
   * -1 star every starDecayTime seconds while no crime and no police within 60m.
   * Decay only starts after the full starDecayTime has passed since the last crime.
   */
  function update(dt, state, events) {
    const now = performance.now() / 1000;
    const timeSinceCrime = now - lastCrimeTime;

    // Check police proximity
    policeNearby = false;
    if (events && events.policePositions) {
      const playerPos = state.position;
      for (const pp of events.policePositions) {
        const dx = pp.x - playerPos.x;
        const dz = pp.z - playerPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < WANTED.policeDecayRadius) {
          policeNearby = true;
          break;
        }
      }
    }

    // Decay: only when enough time has passed since last crime and no police nearby
    if (wantedLevel > 0 && timeSinceCrime > WANTED.starDecayTime && !policeNearby) {
      decayTimer += dt;
      if (decayTimer >= WANTED.starDecayTime) {
        decayTimer = 0;
        // First decay any remaining heat, then drop a star
        if (heatAccumulator > 0) {
          heatAccumulator = Math.max(0, heatAccumulator - 1);
        } else if (wantedLevel > 0) {
          wantedLevel--;
        }
      }
    } else {
      decayTimer = 0;
    }

    state.wanted = wantedLevel;
  }

  /** Set the heat accumulator and wanted level directly (for save/load). */
  function setHeatAccumulator(heat, level) {
    heatAccumulator = Math.max(0, heat);
    wantedLevel = Math.min(5, Math.max(0, level));
    lastCrimeTime = heat > 0 || level > 0 ? performance.now() / 1000 : 0;
  }

  function getHeatAccumulator() {
    return heatAccumulator;
  }

  return { update, addHeat, getLevel, reset, isPoliceNearby: () => policeNearby, setHeatAccumulator, getHeatAccumulator };
}
