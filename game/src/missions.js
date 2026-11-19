/**
 * Mission system for Solar Coast.
 *
 * Four missions that unlock sequentially:
 *   M1 "First Wheels"   — steal a red sedan, deliver to Rico's garage
 *   M2 "Courier Run"    — timed package run with two drop-offs
 *   M3 "Shakedown"      — collect protection money from three shopkeepers
 *   M4 "The Getaway"    — survive 3-star heat, reach the safehouse
 *
 * Exported factory:
 *   createMissionSystem(hud, wantedSystem, combatSystem)
 *     → { update, acceptMission, getActiveMission, isMissionComplete,
 *         getMissionState, tryPunchMissionPed, getUnlockedMissions,
 *         getCompletedMissions, setCompletedMissions, setCurrentMissionStep,
 *         getTotalEarnings, addEarnings, getMissionMarkerPositions,
 *         onVehicleEnter, showBanner, getDefById, getAllMissionDefs }
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Mission catalogue
// ---------------------------------------------------------------------------

const STORY = [
  {
    id: 'm1',
    title: 'First Wheels',
    intro:
      "Rico Valdez needs a ride — a red sedan sitting on 4th and Ocean. " +
      "Grab it and bring it to his garage on the east side. Keep it clean.",
    acceptMarker: { x: 10, z: 10 },
    objectives: [
      { text: 'Locate the red sedan near the beach', kind: 'navigate', pos: { x: -30, z: 50 } },
      { text: 'Enter the red sedan (press E)', kind: 'stealVehicle' },
      { text: 'Deliver the car to Rico\'s garage', kind: 'navigate', pos: { x: 80, z: -40 } },
    ],
    payout: 2500,
    failIfBusted: true,
    failIfWasted: true,
  },
  {
    id: 'm2',
    title: 'Courier Run',
    intro:
      "Rico has a package waiting downtown. Pick it up, then make two " +
      "deliveries around town. Keep a low profile — and hurry.",
    acceptMarker: { x: 10, z: 10 },
    objectives: [
      { text: 'Collect the package downtown', kind: 'navigate', pos: { x: 30, z: 30 } },
      { text: 'Drop-off point 1 (north side)', kind: 'navigate', pos: { x: -60, z: -80 } },
      { text: 'Drop-off point 2 (harbour)', kind: 'navigate', pos: { x: 60, z: -100 } },
    ],
    payout: 4000,
    timeLimit: 120, // seconds once package is picked up
    failIfBusted: true,
    failIfWasted: true,
    failIfTimeout: true,
  },
  {
    id: 'm3',
    title: 'Shakedown',
    intro:
      "Three shopkeepers are behind on their protection payments. " +
      "Visit each one and collect — they'll bolt when they see you. " +
      "The last one doesn't go quietly.",
    acceptMarker: { x: 10, z: 10 },
    objectives: [
      { text: 'Punch the first shopkeeper to collect', kind: 'navigate', pos: { x: -10, z: -20 } },
      { text: 'Punch the second shopkeeper', kind: 'navigate', pos: { x: 40, z: -10 } },
      { text: 'Punch the third shopkeeper (he fights back!)', kind: 'navigate', pos: { x: -50, z: 40 } },
      { text: 'Return to Rico with the cash', kind: 'navigate', pos: { x: 10, z: 10 } },
    ],
    payout: 3500,
    failIfBusted: true,
    failIfWasted: true,
  },
  {
    id: 'm4',
    title: 'The Getaway',
    intro:
      "The cops are onto you. Shake a 3-star wanted level, then head " +
      "to the safehouse. Don't get caught.",
    acceptMarker: { x: 10, z: 10 },
    objectives: [
      { text: 'Evade the police until your wanted level clears', kind: 'evade' },
      { text: 'Reach the safehouse to finish the story', kind: 'navigate', pos: { x: -80, z: 60 } },
    ],
    payout: 10000,
    failIfBusted: true,
    failIfWasted: true,
    forceWantedLevel: 3,
  },
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMissionSystem(hud, wantedSystem, combatSystem) {
  const completed = new Set();
  let current = null; // { def, stepIdx, timer }
  let earnings = 0;
  let bannerState = null; // { text, type, remaining }
  const m3Targets = []; // M3 shopkeeper positions + collected flags

  // ---- Query helpers ---------------------------------------------------

  function unlockedIndices() {
    const out = [];
    for (let i = 0; i < STORY.length; i++) {
      if (i === 0 || completed.has(STORY[i - 1].id)) out.push(i);
    }
    return out;
  }

  function completedIds() {
    return new Set(completed);
  }

  function overwriteCompleted(ids) {
    completed.clear();
    for (const id of ids) completed.add(id);
  }

  function setStepForMission(missionId, stepIdx) {
    if (current && current.def.id === missionId) current.stepIdx = stepIdx;
  }

  function totalEarnings() {
    return earnings;
  }

  function addEarnings(n) {
    earnings += n;
  }

  function activeMarkerPos() {
    if (!current) return null;
    const def = current.def;
    const obj = def.objectives[current.stepIdx];
    if (!obj) return null;
    if (obj.kind === 'navigate') return obj.pos;
    if (obj.kind === 'stealVehicle') {
      // Use the first objective position as proxy
      return def.objectives[0]?.pos || null;
    }
    if (obj.kind === 'evade') return null;
    return obj.pos || null;
  }

  function markerList() {
    const markers = [];
    const pos = activeMarkerPos();
    if (pos) {
      markers.push({
        x: pos.x, z: pos.z, type: 'active',
        missionName: current.def.title,
        stepText: current.def.objectives[current.stepIdx]?.text || '',
      });
    }
    // Accept marker if no active mission and next mission exists
    if (!current) {
      const nextIdx = unlockedIndices()[0];
      if (nextIdx !== undefined) {
        const nextDef = STORY[nextIdx];
        if (!completed.has(nextDef.id)) {
          markers.push({
            x: nextDef.acceptMarker.x, z: nextDef.acceptMarker.z,
            type: 'accept', missionName: nextDef.title,
          });
        }
      }
    }
    return markers;
  }

  function getActive() { return current; }

  function isDone(id) { return completed.has(id); }

  function stateSnapshot() {
    if (!current) {
      return { active: false, completed: [...completed], totalEarnings: earnings };
    }
    const obj = current.def.objectives[current.stepIdx];
    return {
      active: true,
      missionId: current.def.id,
      missionName: current.def.title,
      stepIndex: current.stepIdx,
      stepText: obj ? obj.text : 'Complete!',
      stepType: obj ? obj.kind : null,
      timer: current.timer,
      completed: [...completed],
      totalEarnings: earnings,
    };
  }

  // ---- Banner ----------------------------------------------------------

  function showBanner(text, type) {
    bannerState = { text, type, remaining: 3 };
    if (hud) hud.showMissionBanner(text, type);
  }

  function finishMission() {
    if (!current) return;
    const def = current.def;
    completed.add(def.id);
    earnings += def.payout;

    showBanner(def.title + ' COMPLETE! +$' + def.payout.toLocaleString(), 'complete');
    if (hud) hud.setObjective('Explore the city');

    if (def.id === 'm4') {
      setTimeout(() => {
        showBanner('STORY COMPLETE! Total earnings: $' + earnings.toLocaleString(), 'storyComplete');
      }, 3500);
    }
    current = null;
  }

  function abortMission(reason) {
    if (!current) return;
    showBanner(current.def.title + ' FAILED — ' + reason, 'fail');
    if (hud) hud.setObjective('Explore the city');
    current = null;
  }

  // ---- Accept ----------------------------------------------------------

  function acceptMission(idx) {
    if (idx < 0 || idx >= STORY.length) return null;
    if (completed.has(STORY[idx].id)) return null;
    if (idx > 0 && !completed.has(STORY[idx - 1].id)) return null;
    if (current) return null; // already in a mission

    const def = STORY[idx];
    current = { def, stepIdx: 0, timer: null };

    if (hud) {
      hud.showMissionBriefing(def.title, def.intro);
      hud.setObjective(def.objectives[0].text);
    }

    // Force wanted level for M4
    if (def.forceWantedLevel && wantedSystem) {
      wantedSystem.reset();
      while (wantedSystem.getLevel() < def.forceWantedLevel) {
        wantedSystem.addHeat(1, 'mission_force');
      }
    }

    // Seed M3 targets
    if (def.id === 'm3' && m3Targets.length === 0) {
      for (let i = 0; i < 3; i++) {
        m3Targets.push({
          pos: { ...def.objectives[i].pos },
          collected: false,
          hostile: i === 2, // third fights back
        });
      }
    }

    return current;
  }

  // ---- Step advancement ------------------------------------------------

  function advance() {
    if (!current) return;
    current.stepIdx++;

    const def = current.def;
    if (current.stepIdx >= def.objectives.length) {
      finishMission();
      return;
    }

    const obj = def.objectives[current.stepIdx];
    if (hud) hud.setObjective(obj.text);

    // Start timer for M2 after pickup
    if (def.id === 'm2' && current.stepIdx === 1 && current.timer === null) {
      current.timer = def.timeLimit;
    }
  }

  // ---- Proximity check -------------------------------------------------

  function nearPlayer(pos, playerPos, radius) {
    const dx = playerPos.x - pos.x;
    const dz = playerPos.z - pos.z;
    return Math.sqrt(dx * dx + dz * dz) < radius;
  }

  // ---- M3 punch interception -------------------------------------------

  function interceptPunch(playerPos, punchResult) {
    if (!current || current.def.id !== 'm3') return false;
    if (!punchResult || !punchResult.hit) return false;

    const obj = current.def.objectives[current.stepIdx];
    if (!obj || obj.kind !== 'navigate') return false;

    const skIdx = current.stepIdx;
    if (skIdx >= m3Targets.length) return false;
    if (m3Targets[skIdx].collected) return false;

    const dx = punchResult.pedPos ? punchResult.pedPos.x - m3Targets[skIdx].pos.x : 0;
    const dz = punchResult.pedPos ? punchResult.pedPos.z - m3Targets[skIdx].pos.z : 0;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 8) {
      m3Targets[skIdx].collected = true;
      advance();
      return true;
    }
    return false;
  }

  // ---- Vehicle enter (M1 steal) ----------------------------------------

  function onVehicleEnter(_vehicle, gameState) {
    if (!current || current.def.id !== 'm1') return;
    const obj = current.def.objectives[current.stepIdx];
    if (obj && obj.kind === 'stealVehicle') advance();
  }

  // ---- Per-frame update ------------------------------------------------

  function tick(dt, gameState, playerPos) {
    // Banner countdown
    if (bannerState) {
      bannerState.remaining -= dt;
      if (bannerState.remaining <= 0) {
        if (hud) hud.hideMissionBanner();
        bannerState = null;
      }
    }

    // No active mission — check accept marker
    if (!current) {
      for (const idx of unlockedIndices()) {
        const def = STORY[idx];
        if (completed.has(def.id)) continue;
        if (nearPlayer(def.acceptMarker, playerPos, 4)) {
          // Guard: don't re-accept if already in progress (by ID)
          if (current && current.def.id === def.id) return;
          acceptMission(idx);
          return;
        }
      }
      return;
    }

    const def = current.def;
    const obj = def.objectives[current.stepIdx];
    if (!obj) return;

    // Fail conditions
    if (def.failIfBusted && gameState.busted) { abortMission('BUSTED'); return; }
    if (def.failIfWasted && gameState.wasted) { abortMission('WASTED'); return; }

    // Timer
    if (def.failIfTimeout && current.timer !== null) {
      current.timer -= dt;
      if (current.timer <= 0) { abortMission('TIME\'S UP'); return; }
    }

    // Objective checks
    if (obj.kind === 'navigate' && obj.pos) {
      if (nearPlayer(obj.pos, playerPos, 5)) advance();
    }
    if (obj.kind === 'stealVehicle') {
      if (gameState.travelMode === 'driving' && gameState.activeCar) advance();
    }
    if (obj.kind === 'evade') {
      if (wantedSystem && wantedSystem.getLevel() === 0) advance();
    }
  }

  // ---- Return interface ------------------------------------------------

  return {
    update: tick,
    acceptMission,
    getActiveMission: getActive,
    isMissionComplete: isDone,
    getMissionState: stateSnapshot,
    tryPunchMissionPed: interceptPunch,
    getUnlockedMissions: unlockedIndices,
    getCompletedMissions: completedIds,
    setCompletedMissions: overwriteCompleted,
    setCurrentMissionStep: setStepForMission,
    getTotalEarnings: totalEarnings,
    addEarnings,
    getActiveMarkerPos: activeMarkerPos,
    getMissionMarkerPositions: markerList,
    onVehicleEnter,
    showBanner,
    getDefById(id) { return STORY.find(m => m.id === id); },
    getAllMissionDefs() { return STORY; },
  };
}
