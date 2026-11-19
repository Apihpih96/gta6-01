/**
 * Mission system: story arc, objectives, markers, cash rewards, briefings.
 *
 * 4 missions that unlock in order:
 *   M1 "First Wheels"       — steal a car, deliver to garage
 *   M2 "Courier Run"        — timed package delivery to 2 drop-offs
 *   M3 "Shakedown"          — collect protection money from 3 shopkeepers on foot
 *   M4 "The Getaway"        — lose 3-star wanted, reach hideout
 *
 * Exports:
 *   createMissionSystem(hud, wantedSystem, combatSystem)
 *     — returns { update, acceptMission, getActiveMission, isMissionComplete,
 *                 getMissionState, tryPunchMissionPed, getUnlockedMissions,
 *                 getCompletedMissions, setCompletedMissions, setCurrentMissionStep,
 *                 getTotalEarnings, addEarnings, getMissionMarkerPositions }
 */

import * as THREE from 'three';

/** Mission definitions. */
const MISSIONS = [
  {
    id: 'm1',
    name: 'First Wheels',
    briefing:
      "Rico Valdez needs a car — a red sedan parked on 4th and Ocean. " +
      "Steal it and deliver it to his garage on the east side. Don't scratch it.",
    acceptPos: { x: 10, z: 10 }, // walk into this marker to accept
    steps: [
      { text: 'Find the red sedan near the beach', type: 'goTo', pos: { x: -30, z: 50 } },
      { text: 'Steal the red sedan (press E to enter)', type: 'stealCar' },
      { text: 'Drive the car to Rico\'s garage', type: 'goTo', pos: { x: 80, z: -40 } },
    ],
    reward: 2500,
    failOnBusted: true,
    failOnWasted: true,
  },
  {
    id: 'm2',
    name: 'Courier Run',
    briefing:
      "Rico has a package for you. Pick it up downtown, then deliver it to " +
      "two drop-off points. Be quick — and try not to attract attention.",
    acceptPos: { x: 10, z: 10 },
    steps: [
      { text: 'Pick up the package downtown', type: 'goTo', pos: { x: 30, z: 30 } },
      { text: 'Deliver to drop-off point 1 (north side)', type: 'goTo', pos: { x: -60, z: -80 } },
      { text: 'Deliver to drop-off point 2 (harbour)', type: 'goTo', pos: { x: 60, z: -100 } },
    ],
    reward: 4000,
    timer: 120, // seconds for the whole thing after pickup
    failOnBusted: true,
    failOnWasted: true,
    failOnTimer: true,
  },
  {
    id: 'm3',
    name: 'Shakedown',
    briefing:
      "Some shopkeepers owe Rico protection money. Go to each one and collect — " +
      "they'll try to run when they see you coming. " +
      "The third one doesn't pay quietly — expect a fight.",
    acceptPos: { x: 10, z: 10 },
    steps: [
      { text: 'Find and punch the first shopkeeper to collect', type: 'goTo', pos: { x: -10, z: -20 } },
      { text: 'Find and punch the second shopkeeper', type: 'goTo', pos: { x: 40, z: -10 } },
      { text: 'Find and punch the third shopkeeper (he fights back!)', type: 'goTo', pos: { x: -50, z: 40 } },
      { text: 'Return to Rico with the cash', type: 'goTo', pos: { x: 10, z: 10 } },
    ],
    reward: 3500,
    failOnBusted: true,
    failOnWasted: true,
  },
  {
    id: 'm4',
    name: 'The Getaway',
    briefing:
      "The heat is on. Rico needs you to lose the cops — survive a 3-star wanted level " +
      "until the heat dies down, then make it to the safehouse.",
    acceptPos: { x: 10, z: 10 },
    steps: [
      { text: 'Survive! Evade the police until your wanted level drops to 0', type: 'evade' },
      { text: 'Reach the safehouse to complete the story', type: 'goTo', pos: { x: -80, z: 60 } },
    ],
    reward: 10000,
    failOnBusted: true,
    failOnWasted: true,
    forceWanted: 3, // set wanted to 3 when mission starts
  },
];

/** Create the mission system. */
export function createMissionSystem(hud, wantedSystem, combatSystem) {
  const completedMissions = new Set();
  let activeMission = null; // { def, stepIndex, timer }
  let totalEarnings = 0;
  let missionBanner = null; // { text, timer, type }
  let m3Shopkeepers = []; // tracked for M3
  let m1TargetCar = null; // tracked for M1

  /** Get list of unlocked mission indices (0 = always, n = if n-1 completed). */
  function getUnlockedMissions() {
    const unlocked = [];
    for (let i = 0; i < MISSIONS.length; i++) {
      if (i === 0 || completedMissions.has(MISSIONS[i - 1].id)) {
        unlocked.push(i);
      }
    }
    return unlocked;
  }

  function getCompletedMissions() {
    return new Set(completedMissions);
  }

  function setCompletedMissions(ids) {
    completedMissions.clear();
    for (const id of ids) completedMissions.add(id);
  }

  function setCurrentMissionStep(missionId, stepIndex) {
    if (activeMission && activeMission.def.id === missionId) {
      activeMission.stepIndex = stepIndex;
    }
  }

  function getTotalEarnings() {
    return totalEarnings;
  }

  function addEarnings(amount) {
    totalEarnings += amount;
  }

  /** Get the position of the current active objective marker. */
  function getActiveMarkerPos() {
    if (!activeMission) return null;
    const def = activeMission.def;
    const step = def.steps[activeMission.stepIndex];
    if (!step) return null;
    if (step.type === 'goTo') return step.pos;
    if (step.type === 'stealCar') return m1TargetCar ? { x: m1TargetCar.position.x, z: m1TargetCar.position.z } : def.steps[0].pos;
    if (step.type === 'evade') return null; // no marker during evade
    if (step.pos) return step.pos;
    return def.acceptPos;
  }

  function getMissionMarkerPositions() {
    const positions = [];
    // Active mission marker
    const markerPos = getActiveMarkerPos();
    if (markerPos) {
      positions.push({
        x: markerPos.x,
        z: markerPos.z,
        type: 'active',
        missionName: activeMission.def.name,
        stepText: activeMission.def.steps[activeMission.stepIndex]?.text || '',
      });
    }
    // Mission accept marker (if no active mission and missions remain)
    if (!activeMission && getUnlockedMissions().length > 0) {
      const nextIdx = getUnlockedMissions()[0];
      const nextMission = MISSIONS[nextIdx];
      if (!completedMissions.has(nextMission.id)) {
        positions.push({
          x: nextMission.acceptPos.x,
          z: nextMission.acceptPos.z,
          type: 'accept',
          missionName: nextMission.name,
        });
    }
    }
    return positions;
  }

  function getActiveMission() {
    return activeMission;
  }

  function isMissionComplete(missionId) {
    return completedMissions.has(missionId);
  }

  function getMissionState() {
    if (!activeMission) return { active: false, completed: [...completedMissions], totalEarnings };
    const def = activeMission.def;
    const step = def.steps[activeMission.stepIndex];
    return {
      active: true,
      missionId: def.id,
      missionName: def.name,
      stepIndex: activeMission.stepIndex,
      stepText: step ? step.text : 'Complete!',
      stepType: step ? step.type : null,
      timer: activeMission.timer,
      completed: [...completedMissions],
      totalEarnings,
    };
  }

  /** Show a mission banner (complete/fail). */
  function showBanner(text, type) {
    missionBanner = { text, type, timer: 3 };
    if (hud) hud.showMissionBanner(text, type);
  }

  /** Complete the active mission. */
  function completeMission() {
    if (!activeMission) return;
    const def = activeMission.def;
    completedMissions.add(def.id);
    totalEarnings += def.reward;

    showBanner(def.name + ' COMPLETE! +$' + def.reward.toLocaleString(), 'complete');

    // Update HUD objective
    if (hud) {
      hud.setObjective('Explore the city');
    }

    if (def.id === 'm4') {
      // Story complete — total earnings include all mission rewards
      setTimeout(() => {
        showBanner('STORY COMPLETE! Total earnings: $' + totalEarnings.toLocaleString(), 'storyComplete');
      }, 3500);
    }

    activeMission = null;
  }

  /** Fail the active mission. */
  function failMission(reason) {
    if (!activeMission) return;
    showBanner(activeMission.def.name + ' FAILED — ' + reason, 'fail');

    if (hud) {
      hud.setObjective('Explore the city');
    }

    // Reset forced wanted for M4
    if (activeMission.def.forceWanted) {
      // Don't reset wanted — let player deal with consequences
    }

    activeMission = null;
  }

  /** Accept a mission by index in MISSIONS array. */
  function acceptMission(index) {
    if (index < 0 || index >= MISSIONS.length) return null;
    if (completedMissions.has(MISSIONS[index].id)) return null;
    if (index > 0 && !completedMissions.has(MISSIONS[index - 1].id)) return null;
    if (activeMission) return null; // already have an active mission

    const def = MISSIONS[index];
    activeMission = { def, stepIndex: 0, timer: null };

    // Show briefing
    if (hud) {
      hud.showMissionBriefing(def.name, def.briefing);
      hud.setObjective(def.steps[0].text);
    }

    // Force wanted level for M4
    if (def.forceWanted && wantedSystem) {
      // Reset then set wanted level
      wantedSystem.reset();
      while (wantedSystem.getLevel() < def.forceWanted) {
        wantedSystem.addHeat(1, 'mission_force');
      }
    }

    // Setup M3 shopkeepers
    if (def.id === 'm3' && !m3Shopkeepers.length) {
      m3Shopkeepers = def.steps.slice(0, 3).map((s, i) => ({
        pos: { ...s.pos },
        collected: false,
        fightingBack: i === 2, // third one fights back
      }));
    }

    return activeMission;
  }

  /** Check if player is near a position. */
  function isNear(playerPos, targetPos, radius) {
    const dx = playerPos.x - targetPos.x;
    const dz = playerPos.z - targetPos.z;
    return Math.sqrt(dx * dx + dz * dz) < radius;
  }

  /** Try to punch a mission-related pedestrian (M3 shakedown). */
  function tryPunchMissionPed(playerPos, punchResult) {
    if (!activeMission || activeMission.def.id !== 'm3') return false;
    if (!punchResult || !punchResult.hit) return false;

    const step = activeMission.def.steps[activeMission.stepIndex];
    if (!step || step.type !== 'goTo') return false;

    // Check if punched ped is near the current shopkeeper target
    const skIdx = activeMission.stepIndex;
    if (skIdx >= m3Shopkeepers.length) return false;
    const sk = m3Shopkeepers[skIdx];
    if (sk.collected) return false;

    const dx = punchResult.pedPos ? punchResult.pedPos.x - sk.pos.x : 0;
    const dz = punchResult.pedPos ? punchResult.pedPos.z - sk.pos.z : 0;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 8) { // generous radius — any punch near the marker counts
      sk.collected = true;

      // If this was the last shopkeeper, advance to "return to Rico"
      const allCollected = m3Shopkeepers.every(s => s.collected);
      if (allCollected) {
        advanceStep();
      } else {
        advanceStep();
      }
      return true;
    }
    return false;
  }

  /** Advance to the next mission step. */
  function advanceStep() {
    if (!activeMission) return;
    activeMission.stepIndex++;

    const def = activeMission.def;
    if (activeMission.stepIndex >= def.steps.length) {
      completeMission();
      return;
    }

    const step = def.steps[activeMission.stepIndex];
    if (hud) hud.setObjective(step.text);

    // Start timer for M2 after pickup
    if (def.id === 'm2' && activeMission.stepIndex === 1 && !activeMission.timer) {
      activeMission.timer = def.timer;
    }
  }

  /** Update: check step conditions, timer, fail states. */
  function update(dt, gameState, playerPos) {
    // Update banner
    if (missionBanner) {
      missionBanner.timer -= dt;
      if (missionBanner.timer <= 0) {
        if (hud) hud.hideMissionBanner();
        missionBanner = null;
      }
    }

    if (!activeMission) {
      // Check if player walked into mission accept marker
      const unlocked = getUnlockedMissions();
      for (const idx of unlocked) {
        const def = MISSIONS[idx];
        if (completedMissions.has(def.id)) continue;
        if (isNear(playerPos, def.acceptPos, 4)) {
          acceptMission(idx);
          return;
        }
      }
      return;
    }

    const def = activeMission.def;
    const step = def.steps[activeMission.stepIndex];
    if (!step) return;

    // Fail on busted/wasted
    if (def.failOnBusted && gameState.busted) {
      failMission('BUSTED');
      return;
    }
    if (def.failOnWasted && gameState.wasted) {
      failMission('WASTED');
      return;
    }

    // Timer
    if (def.failOnTimer && activeMission.timer !== null) {
      activeMission.timer -= dt;
      if (activeMission.timer <= 0) {
        failMission('TIME\'S UP');
        return;
      }
    }

    // Step conditions
    if (step.type === 'goTo' && step.pos) {
      if (isNear(playerPos, step.pos, 5)) {
        advanceStep();
      }
    }

    if (step.type === 'stealCar') {
      // Check if player is driving any car
      if (gameState.mode === 'driving' && gameState.currentVehicle) {
        advanceStep();
      }
    }

    if (step.type === 'evade') {
      // Check if wanted level has dropped to 0
      if (wantedSystem && wantedSystem.getLevel() === 0) {
        advanceStep();
      }
    }
  }

  /** Called when the player enters a vehicle — check M1 steal. */
  function onVehicleEnter(vehicle, gameState) {
    if (!activeMission || activeMission.def.id !== 'm1') return;
    const step = activeMission.def.steps[activeMission.stepIndex];
    if (step && step.type === 'stealCar') {
      advanceStep();
    }
  }

  return {
    update,
    acceptMission,
    getActiveMission,
    isMissionComplete,
    getMissionState,
    getUnlockedMissions,
    getCompletedMissions,
    setCompletedMissions,
    setCurrentMissionStep,
    getTotalEarnings,
    addEarnings,
    getActiveMarkerPos,
    getMissionMarkerPositions,
    tryPunchMissionPed,
    onVehicleEnter,
    showBanner,
    // For save/load
    getDefById(id) {
      return MISSIONS.find(m => m.id === id);
    },
    getAllMissionDefs() {
      return MISSIONS;
    },
  };
}
