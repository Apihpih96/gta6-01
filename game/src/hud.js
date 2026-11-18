/**
 * HUD DOM updates: health bar, cash, wanted stars, objective text,
 * speed readout, weapon slot, centre message, damage vignette,
 * interaction prompt, start screen and pause menu wiring.
 */

import { OBJECTIVE_DEFAULT } from './config.js';

/** Grab references to all HUD elements and wire up buttons. */
export function createHUD() {
  const healthBar = document.getElementById('health-bar-fill');
  const cashEl = document.getElementById('cash');
  const wantedEl = document.getElementById('wanted-stars');
  const objectiveEl = document.getElementById('objective');
  const speedEl = document.getElementById('speed');
  const weaponEl = document.getElementById('weapon-slot');
  const messageEl = document.getElementById('center-message');
  const damageVignette = document.getElementById('damage-vignette');
  const startScreen = document.getElementById('start-screen');
  const pauseScreen = document.getElementById('pause-screen');
  const newGameBtn = document.getElementById('new-game-btn');
  const continueBtn = document.getElementById('continue-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const interactPrompt = document.getElementById('interact-prompt');

  let messageTimer = 0;
  let objective = OBJECTIVE_DEFAULT;

  /** Show a temporary centre message. */
  function showMessage(text, duration = 2.5) {
    messageEl.textContent = text;
    messageEl.style.opacity = '1';
    messageTimer = duration;
  }

  /** Set the persistent objective line. */
  function setObjective(text) {
    objective = text;
  }

  /** Show or hide the contextual interaction prompt. */
  function showInteractPrompt(text) {
    if (interactPrompt) {
      interactPrompt.textContent = text;
      interactPrompt.style.opacity = text ? '1' : '0';
    }
  }

  /** Update HUD from game state. */
  function update(state, dt) {
    // Health bar
    if (healthBar) {
      healthBar.style.width = Math.max(0, state.health) + '%';
      if (state.health < 30) {
        healthBar.style.background = '#cc3333';
      } else if (state.health < 60) {
        healthBar.style.background = '#ccaa33';
      } else {
        healthBar.style.background = '#44cc44';
      }
    }

    // Cash
    if (cashEl) {
      cashEl.textContent = '$' + state.cash.toLocaleString();
    }

    // Wanted stars
    if (wantedEl) {
      let stars = '';
      for (let i = 0; i < 5; i++) {
        stars += i < state.wanted ? '★' : '☆';
      }
      wantedEl.textContent = stars;
      wantedEl.style.color = state.wanted > 0 ? '#ffcc00' : '#888888';
    }

    // Objective
    if (objectiveEl) {
      objectiveEl.textContent = objective;
    }

    // Speed — show km/h when moving or driving
    if (speedEl) {
      const kmh = Math.round((state.speed || 0) * 3.6);
      speedEl.textContent = state.mode === 'driving' ? kmh + ' km/h' : (kmh > 0 ? kmh + ' km/h' : '');
    }

    // Weapon / vehicle indicator
    if (weaponEl) {
      if (state.mode === 'driving') {
        weaponEl.textContent = '🚗';
      } else {
        weaponEl.textContent = state.hasWeapon ? '🔫' : '👊';
      }
    }

    // Message fade
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) {
        messageEl.style.opacity = '0';
        messageTimer = 0;
      } else if (messageTimer < 0.5) {
        messageEl.style.opacity = String(messageTimer / 0.5);
      }
    }

    // Damage vignette
    if (damageVignette) {
      const damageAlpha = state.health < 30 ? 0.3 + (1 - state.health / 30) * 0.4 : 0;
      damageVignette.style.opacity = String(damageAlpha);
    }
  }

  /** Show or hide the start screen overlay. */
  function showStartScreen(show) {
    if (startScreen) {
      startScreen.style.display = show ? 'flex' : 'none';
    }
  }

  /** Show or hide the pause overlay. */
  function showPauseScreen(show) {
    if (pauseScreen) {
      pauseScreen.style.display = show ? 'flex' : 'none';
    }
  }

  /** Register button callbacks. */
  function wireButtons(callbacks) {
    const { onStartGame, onContinue, onResume } = callbacks;
    if (newGameBtn) newGameBtn.addEventListener('click', onStartGame);
    if (continueBtn) continueBtn.addEventListener('click', onContinue);
    if (resumeBtn) resumeBtn.addEventListener('click', onResume);
  }

  return {
    update,
    showMessage,
    setObjective,
    showStartScreen,
    showPauseScreen,
    showInteractPrompt,
    wireButtons,
  };
}
