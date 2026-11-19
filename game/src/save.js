/**
 * Save/load system: localStorage persistence for Solar Coast.
 *
 * Saves: player position, cash, health, wanted level,
 *        unlocked/completed missions, current mission + step,
 *        total earnings.
 *
 * Auto-save on mission complete and every 30 seconds.
 * "Continue" button on start screen when save exists.
 * "New Game" clears the save.
 *
 * Save versioning: the key includes a version suffix so that future format
 * changes won't load corrupt or incompatible data.
 *
 * Exports:
 *   createSaveSystem(hud)
 *     — returns { save, load, hasSave, clearSave, autoSave, getAutoSaveTimer }
 */

const SAVE_KEY = 'solar-coast-save-v1';
const AUTO_SAVE_INTERVAL = 30; // seconds

/** Create the save/load system. */
export function createSaveSystem(hud) {
  let autoSaveTimer = 0;
  let lastSaveData = null;

  /** Serialize the current game state to a save object. */
  function buildSaveData(gameState, player, wantedSystem, combatSystem, missionSystem) {
    const missionState = missionSystem ? missionSystem.getMissionState() : null;

    return {
      version: 1,
      timestamp: Date.now(),
      player: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        yaw: player.yaw || 0,
        health: combatSystem ? combatSystem.getPlayerHealthRaw() : gameState.health,
      },
      cash: gameState.cash,
      wantedLevel: wantedSystem ? wantedSystem.getLevel() : 0,
      heatAccumulator: wantedSystem ? wantedSystem.getHeatAccumulator?.() ?? 0 : 0,
      totalEarnings: missionState ? missionState.totalEarnings : 0,
      missions: {
        completed: missionState ? missionState.completed : [],
        activeMissionId: missionState?.active ? missionState.missionId : null,
        activeStepIndex: missionState?.active ? missionState.stepIndex : -1,
      },
    };
  }

  /** Save the current game state to localStorage. */
  function save(gameState, player, wantedSystem, combatSystem, missionSystem) {
    try {
      const data = buildSaveData(gameState, player, wantedSystem, combatSystem, missionSystem);
      const json = JSON.stringify(data);
      localStorage.setItem(SAVE_KEY, json);
      lastSaveData = json;
      return true;
    } catch (e) {
      // localStorage not available or full
      return false;
    }
  }

  /** Load a saved game state and apply it. Returns null if no save or corrupt. */
  function load(gameState, player, wantedSystem, combatSystem, missionSystem) {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      if (!json) return null;

      // Validate JSON structure before applying
      let data;
      try {
        data = JSON.parse(json);
      } catch {
        // Corrupt JSON — clear and start fresh
        clearSave();
        return null;
      }
      if (!data || data.version !== 1) return null; // corrupt or wrong version

      // Apply player state
      player.position.set(data.player.x, data.player.y, data.player.z);
      player.yaw = data.player.yaw || 0;

      // Apply game state
      gameState.cash = data.cash || 0;
      gameState.health = data.player.health || 100;

      // Apply wanted level
      if (wantedSystem) {
        wantedSystem.reset();
        if (data.wantedLevel > 0) {
          // Set heat accumulator directly if available
          if (wantedSystem.setHeatAccumulator) {
            wantedSystem.setHeatAccumulator(data.heatAccumulator || 0, data.wantedLevel);
          } else {
            for (let i = 0; i < data.wantedLevel; i++) {
              wantedSystem.addHeat(1, 'save_restore');
            }
          }
        }
      }

      // Apply health
      if (combatSystem && combatSystem.setPlayerHealthRaw) {
        combatSystem.setPlayerHealthRaw(data.player.health || 100);
      }

      // Apply missions
      if (missionSystem) {
        missionSystem.setCompletedMissions(data.missions.completed || []);
        missionSystem.addEarnings(data.totalEarnings || 0);

        if (data.missions.activeMissionId) {
          const def = missionSystem.getDefById(data.missions.activeMissionId);
          if (def && !missionSystem.isMissionComplete(data.missions.activeMissionId)) {
            missionSystem.acceptMission(
              missionSystem.getAllMissionDefs().indexOf(def)
            );
            if (data.missions.activeStepIndex > 0) {
              missionSystem.setCurrentMissionStep(
                data.missions.activeMissionId,
                data.missions.activeStepIndex
              );
              // Also update the HUD objective
              const step = def.steps[data.missions.activeStepIndex];
              if (step && hud) {
                hud.setObjective(step.text);
              }
            }
          }
        }
      }

      return data;
    } catch (e) {
      // Corrupt save — treat as no save
      return null;
    }
  }

  /** Check if a valid save exists. */
  function hasSave() {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      if (!json) return false;
      const data = JSON.parse(json);
      return data && data.version === 1;
    } catch {
      return false;
    }
  }

  /** Clear the save. */
  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
      lastSaveData = null;
    } catch {
      // ignore
    }
  }

  /** Auto-save tick — call every frame. */
  function autoSave(dt, gameState, player, wantedSystem, combatSystem, missionSystem) {
    autoSaveTimer += dt;
    if (autoSaveTimer >= AUTO_SAVE_INTERVAL) {
      autoSaveTimer = 0;
      save(gameState, player, wantedSystem, combatSystem, missionSystem);
    }
  }

  function getAutoSaveTimer() {
    return autoSaveTimer;
  }

  return {
    save,
    load,
    hasSave,
    clearSave,
    autoSave,
    getAutoSaveTimer,
  };
}
