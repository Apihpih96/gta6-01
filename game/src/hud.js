/**
 * HUD DOM updates: health bar, cash, wanted stars, objective text,
 * speed readout, weapon slot, centre message, damage vignette,
 * interaction prompt, start screen and pause menu wiring,
 * mission banners and briefing panels.
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
  const missionBannerEl = document.getElementById('mission-banner');
  const briefingPanel = document.getElementById('briefing-panel');
  const missionSelectEl = document.getElementById('mission-select');
  const muteBtnEl = document.getElementById('mute-btn');

  let messageTimer = 0;
  let objective = OBJECTIVE_DEFAULT;
  let cashDisplayValue = 0;
  let cashTargetValue = 0;
  let cashAnimTimer = 0;

  /** Show a temporary centre message. */
  function showMessage(text, duration = 2.5) {
    messageEl.textContent = text;
    messageEl.style.opacity = '1';
    messageTimer = duration;
  }

  /** Set the persistent objective line with a maximum length to prevent overflow. */
  function setObjective(text) {
    objective = (text || 'Explore the city').slice(0, 120);
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

    // Cash — animate toward target
    if (cashEl) {
      if (cashTargetValue !== cashDisplayValue) {
        cashAnimTimer += dt;
        if (cashAnimTimer > 0.05) {
          cashAnimTimer = 0;
          const diff = cashTargetValue - cashDisplayValue;
          cashDisplayValue += Math.ceil(diff * 0.15);
          if (Math.abs(cashTargetValue - cashDisplayValue) < 10) {
            cashDisplayValue = cashTargetValue;
          }
        }
      }
      cashEl.textContent = '$' + cashDisplayValue.toLocaleString();
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

    // Objective — ensure text never overlaps with other HUD elements
    if (objectiveEl) {
      objectiveEl.textContent = objective || 'Explore the city';
    }

    // Speed — show km/h when moving or driving
    if (speedEl) {
      const kmh = Math.round((state.speed || 0) * 3.6);
      speedEl.textContent = state.mode === 'driving' ? kmh + ' km/h' : (kmh > 0 ? kmh + ' km/h' : '');
    }

    // Sync cash target from game state
    if (state.cash !== cashTargetValue) {
      cashTargetValue = state.cash;
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
    const { onStartGame, onContinue, onResume, onMissionSelect } = callbacks;
    if (newGameBtn) newGameBtn.addEventListener('click', onStartGame);
    if (continueBtn) continueBtn.addEventListener('click', onContinue);
    if (resumeBtn) resumeBtn.addEventListener('click', onResume);
    // Wire mission select buttons dynamically
    if (missionSelectEl && onMissionSelect) {
      missionSelectEl.addEventListener('click', (e) => {
        if (e.target.dataset.missionIdx !== undefined) {
          onMissionSelect(parseInt(e.target.dataset.missionIdx, 10));
        }
      });
    }
  }

  /** Show a mission banner (complete/fail/story complete). */
  function showMissionBanner(text, type) {
    if (missionBannerEl) {
      missionBannerEl.textContent = text;
      missionBannerEl.className = 'mission-banner mission-banner-' + type;
      missionBannerEl.style.display = 'block';
      missionBannerEl.style.opacity = '1';
    }
  }

  /** Hide the mission banner. */
  function hideMissionBanner() {
    if (missionBannerEl) {
      missionBannerEl.style.opacity = '0';
      setTimeout(() => {
        if (missionBannerEl) missionBannerEl.style.display = 'none';
      }, 500);
    }
  }

  /** Show a mission briefing panel. */
  function showMissionBriefing(missionName, briefingText) {
    if (briefingPanel) {
      const titleEl = briefingPanel.querySelector('.briefing-title');
      const bodyEl = briefingPanel.querySelector('.briefing-body');
      if (titleEl) titleEl.textContent = missionName;
      if (bodyEl) bodyEl.textContent = briefingText;
      briefingPanel.style.display = 'flex';
      briefingPanel.style.opacity = '0';
      requestAnimationFrame(() => {
        briefingPanel.style.transition = 'opacity 0.3s ease';
        briefingPanel.style.opacity = '1';
      });
      // Auto-hide after 5 seconds
      setTimeout(() => {
        if (briefingPanel) {
          briefingPanel.style.opacity = '0';
          setTimeout(() => {
            if (briefingPanel) briefingPanel.style.display = 'none';
          }, 300);
        }
      }, 5000);
    }
  }

  /** Update mission select panel with available missions. */
  function updateMissionSelect(unlockedIndices, missionDefs, completedIds) {
    if (!missionSelectEl) return;
    // Clear existing buttons
    missionSelectEl.innerHTML = '';
    for (const idx of unlockedIndices) {
      const def = missionDefs[idx];
      if (!def) continue;
      const btn = document.createElement('button');
      btn.dataset.missionIdx = String(idx);
      btn.className = completedIds.has(def.id) ? 'mission-btn completed' : 'mission-btn';
      btn.textContent = def.name;
      if (completedIds.has(def.id)) {
        btn.title = 'Completed ✓';
        btn.disabled = true;
      }
      missionSelectEl.appendChild(btn);
    }
  }

  /** Show or hide the mission select panel. */
  function showMissionSelect(show) {
    if (missionSelectEl) {
      missionSelectEl.style.display = show ? 'flex' : 'none';
    }
  }

  /** Set the continue button enabled/disabled state. */
  function setContinueEnabled(enabled) {
    if (continueBtn) {
      continueBtn.disabled = !enabled;
    }
  }

  /** Update the mute button icon and wire its click handler. */
  function wireMuteButton(audioEngine) {
    if (!muteBtnEl) return;
    muteBtnEl.addEventListener('click', () => {
      audioEngine.setMuted(!audioEngine.isMuted());
    });
  }

  /** Update the mute button icon to reflect current mute state. */
  function setMuted(muted) {
    if (muteBtnEl) {
      muteBtnEl.textContent = muted ? '🔇' : '🔊';
    }
  }

  return {
    update,
    showMessage,
    setObjective,
    showStartScreen,
    showPauseScreen,
    showInteractPrompt,
    wireButtons,
    showMissionBanner,
    hideMissionBanner,
    showMissionBriefing,
    updateMissionSelect,
    showMissionSelect,
    setContinueEnabled,
    wireMuteButton,
    setMuted,
  };
}
