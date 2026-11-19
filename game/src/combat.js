/**
 * Combat system: punch with F / left-click, pedestrian health, flee response,
 * fighting back, player damage, health regeneration, WASTED state.
 *
 * Exports:
 *   createCombatSystem(scene, colliders, hud, wantedSystem)
 *     — returns { update, tryPunch, handlePedHit, handlePlayerDamage, isWasted, handleWasted, getHitFlashes }
 */

import * as THREE from 'three';

/** Create the combat system. */
export function createCombatSystem(scene, colliders, hud, wantedSystem) {
  let punchCooldown = 0;
  let playerLungeTime = 0;
  let playerHealth = 100;
  let lastDamageTime = 0;
  let wasted = false;
  let wastedTimer = 0;
  const hitFlashes = []; // { mesh, timer, originalColor }

  /** Try to punch. Returns { hit, hitPed } if successful. */
  function tryPunch(playerPos, playerYaw, pedestrians) {
    if (punchCooldown > 0 || wasted) return null;

    punchCooldown = 0.4; // reduced from 0.45 for more responsive combat
    playerLungeTime = 0.2; // lunge animation duration

    // Check for pedestrians in range (~2.2 m)
    const punchRange = 2.2;
    const punchDir = new THREE.Vector3(
      Math.sin(playerYaw),
      0,
      Math.cos(playerYaw)
    );

    let closestPed = null;
    let closestDist = punchRange;

    for (const ped of pedestrians) {
      const dx = ped.position.x - playerPos.x;
      const dz = ped.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < closestDist) {
        // Check if facing roughly the right direction
        const toPed = new THREE.Vector3(dx, 0, dz).normalize();
        const dot = punchDir.dot(toPed);
        if (dot > 0.3) {
          closestDist = dist;
          closestPed = ped;
        }
      }
    }

    return closestPed ? { hit: true, ped: closestPed } : { hit: false, ped: null };
  }

  /** Handle a pedestrian being hit. Returns events that occurred. */
  function handlePedHit(ped, pedestrians) {
    const events = [];

    // Guard against already-removed pedestrians
    if (!ped || !ped.mesh) return events;

    if (!ped.health) ped.health = 3; // 3 punches to KO
    ped.health--;

    // Hit flash
    hitFlashes.push({ mesh: ped.mesh, timer: 0.15 });

    if (ped.health <= 0) {
      // KO'd — remove from scene
      events.push({ type: 'ko', ped });
    } else {
      // Flee!
      ped.state = 'flee';
      ped.timer = 3;
      events.push({ type: 'flee', ped });

      // 1 in 5 fights back
      if (Math.random() < 0.2) {
        ped.fightingBack = true;
        ped.fightTimer = 5;
        events.push({ type: 'fightBack', ped });
      }
    }

    return events;
  }

  /** Apply damage to the player. */
  function handlePlayerDamage(amount) {
    playerHealth -= amount;
    lastDamageTime = performance.now() / 1000;

    if (playerHealth <= 0) {
      playerHealth = 0;
      wasted = true;
      wastedTimer = 0;
    }
  }

  /** Update: cooldowns, regeneration, fighting peds, hit flashes. */
  function update(dt, playerPos, pedestrians) {
    const now = performance.now() / 1000;

    // Punch cooldown
    if (punchCooldown > 0) {
      punchCooldown -= dt;
    }

    // Lunge animation timer
    if (playerLungeTime > 0) {
      playerLungeTime -= dt;
    }

    // Hit flash timers
    for (let i = hitFlashes.length - 1; i >= 0; i--) {
      hitFlashes[i].timer -= dt;
      if (hitFlashes[i].timer <= 0) {
        hitFlashes.splice(i, 1);
      }
    }

    // Health regeneration: 2/s after 8 s without damage
    if (playerHealth < 100 && now - lastDamageTime > 8) {
      playerHealth = Math.min(100, playerHealth + 2 * dt);
    }

    // Fighting pedestrians
    for (const ped of pedestrians) {
      if (ped.fightingBack) {
        ped.fightTimer -= dt;
        if (ped.fightTimer <= 0) {
          ped.fightingBack = false;
          continue;
        }

        // Chase player and punch
        const dx = playerPos.x - ped.position.x;
        const dz = playerPos.z - ped.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 2.0) {
          // Punch the player — add knockback to give player a chance to escape
          if (!ped.punchCooldown || ped.punchCooldown <= 0) {
            handlePlayerDamage(5); // weak punches
            ped.punchCooldown = 1.0; // increased from 0.8 for fairer spacing
          }
        }

        // Move toward player
        const targetYaw = Math.atan2(dx, dz);
        let yawDiff = targetYaw - ped.yaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        ped.yaw += yawDiff * dt * 3;

        ped.position.x += Math.sin(ped.yaw) * 3 * dt;
        ped.position.z += Math.cos(ped.yaw) * 3 * dt;
      }

      if (ped.punchCooldown) {
        ped.punchCooldown -= dt;
      }
    }

    // Wasted state timer
    if (wasted) {
      wastedTimer += dt;
    }
  }

  /** Handle wasted: lose cash, respawn at hospital with full health. */
  function handleWasted(gameState) {
    const cashLoss = Math.floor(gameState.cash * 0.1);
    gameState.cash = Math.max(0, gameState.cash - cashLoss);
    playerHealth = 100;
    wasted = false;
    wastedTimer = 0;
    gameState.health = playerHealth;
    return cashLoss;
  }

  /** Check if player is wasted (dead). */
  function isWasted() {
    return wasted;
  }

  function getWastedTimer() {
    return wastedTimer;
  }

  function getPlayerHealth() {
    return playerHealth;
  }

  function isLunging() {
    return playerLungeTime > 0;
  }

  function hasHitFlash(mesh) {
    return hitFlashes.some(hf => hf.mesh === mesh);
  }

  return {
    update,
    tryPunch,
    handlePedHit,
    handlePlayerDamage,
    handleWasted,
    isWasted,
    getWastedTimer,
    getPlayerHealth,
    isLunging,
    hasHitFlash,
    getPlayerHealthRaw: () => playerHealth,
    setPlayerHealthRaw: (h) => { playerHealth = Math.max(0, Math.min(100, h)); },
  };
}
