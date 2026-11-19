/**
 * Pedestrians: low-poly walkers on sidewalks, wandering, pausing,
 * fleeing from fast-moving cars. Deterministic from the seed.
 *
 * Reuses buildPersonMesh from player.js for shared character style.
 */

import * as THREE from 'three';
import { PEDESTRIANS, PALETTE, CITY } from './config.js';
import { createRNG, randFloat, randChoice, randInt, shuffle } from './random.js';
import { buildPersonMesh } from './player.js';

/** Create the pedestrian system. */
export function createPedestrianSystem(scene, seed, colliders, roadData) {
  const rng = createRNG(seed + 777);
  const pedestrians = []; // { mesh, position, yaw, state, timer }

  // Compute sidewalk positions (along road edges, near blocks)
  const sidewalkSpots = [];
  const { blocksPerAxis, blockSize, roadWidth, sidewalkWidth } = CITY;
  const halfSize = blocksPerAxis * (blockSize + roadWidth) * 0.5;
  const totalBlock = blockSize + roadWidth;

  for (let bx = 0; bx < blocksPerAxis; bx++) {
    for (let bz = 0; bz < blocksPerAxis; bz++) {
      // Beach edge: no sidewalks
      if (bx === blocksPerAxis - 1 && CITY.beachEdge) continue;

      const cx = -halfSize + bx * totalBlock + totalBlock * 0.5;
      const cz = -halfSize + bz * totalBlock + totalBlock * 0.5;

      // Sidewalk spots along the south edge of each block
      for (let s = 0; s < 3; s++) {
        sidewalkSpots.push({
          x: cx - blockSize / 2 + (s + 0.5) * (blockSize / 3),
          z: cz - blockSize / 2 - sidewalkWidth * 0.5,
        });
      }
    }
  }

  shuffle(rng, sidewalkSpots);

  /** Spawn a single pedestrian. */
  function spawnPed(playerPos) {
    if (pedestrians.length >= PEDESTRIANS.maxPeds) return;
    if (sidewalkSpots.length === 0) return;

    // Pick a sidewalk spot near enough to player
    let bestSpot = null;
    let bestDist = PEDESTRIANS.spawnDistance;

    for (const spot of sidewalkSpots) {
      const dx = spot.x - playerPos.x;
      const dz = spot.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist && dist > 10) {
        bestDist = dist;
        bestSpot = spot;
      }
    }

    if (!bestSpot) return;

    // Random appearance
    const skinColors = [0xd4a06a, 0x8d5524, 0xc68642, 0xf1c27d, 0xffdbac];
    const shirtColors = [0x3366cc, 0xcc3333, 0x33aa33, 0xcccc33, 0xff6633, 0x663399, 0x333333, 0xffffff];
    const pantsColors = [0x333355, 0x222222, 0x445566, 0x554433, 0x334433];
    const hairColors = [0x221100, 0x443322, 0xaa8844, 0x222222, 0xcc9933];

    const mesh = buildPersonMesh({
      skinColor: randChoice(rng, skinColors),
      shirtColor: randChoice(rng, shirtColors),
      pantsColor: randChoice(rng, pantsColors),
      hairColor: randChoice(rng, hairColors),
    });
    mesh.position.set(bestSpot.x, 0, bestSpot.z);
    scene.add(mesh);

    pedestrians.push({
      mesh,
      position: new THREE.Vector3(bestSpot.x, 0, bestSpot.z),
      yaw: randFloat(rng, 0, Math.PI * 2),
      speed: 0,
      speedVariation: rng(), // 0..1 → maps to 0.8x–1.2x walk speed
      state: 'walk', // 'walk' | 'pause' | 'flee'
      timer: randFloat(rng, 2, 6),
      targetYaw: randFloat(rng, 0, Math.PI * 2),
    });
  }

  /** Update pedestrians: wander, pause, flee from nearby fast cars. */
  function update(dt, playerPos, playerSpeed, nearbyVehicle) {
    // Despawn far peds
    for (let i = pedestrians.length - 1; i >= 0; i--) {
      const p = pedestrians[i];
      const dx = p.position.x - playerPos.x;
      const dz = p.position.z - playerPos.z;
      if (Math.sqrt(dx * dx + dz * dz) > PEDESTRIANS.despawnDistance) {
        scene.remove(p.mesh);
        pedestrians.splice(i, 1);
      }
    }

    // Spawn
    if (pedestrians.length < PEDESTRIANS.maxPeds && rng() < 0.08) {
      spawnPed(playerPos);
    }

    for (const p of pedestrians) {
      p.timer -= dt;

      // Check if car is nearby and fast — flee!
      if (nearbyVehicle && playerSpeed > 8) {
        const vdx = p.position.x - nearbyVehicle.position.x;
        const vdz = p.position.z - nearbyVehicle.position.z;
        const vDist = Math.sqrt(vdx * vdx + vdz * vdz);
        if (vDist < PEDESTRIANS.fleeRadius) {
          p.state = 'flee';
          p.targetYaw = Math.atan2(vdx, vdz);
          p.timer = 2;
        }
      }

      // State transitions
      if (p.timer <= 0) {
        if (p.state === 'walk') {
          if (rng() < PEDESTRIANS.pauseChance * 60) {
            p.state = 'pause';
          } else {
            p.targetYaw = randFloat(rng, 0, Math.PI * 2);
          }
          p.timer = randFloat(rng, 1, 4);
        } else if (p.state === 'pause') {
          p.state = 'walk';
          p.targetYaw = randFloat(rng, 0, Math.PI * 2);
          p.timer = randFloat(rng, 3, 8);
        } else if (p.state === 'flee') {
          p.state = 'walk';
          p.timer = randFloat(rng, 2, 5);
        }
      }

      // Movement — vary speed per pedestrian so the sidewalk feels alive
      const baseSpeed = p.state === 'flee'
        ? PEDESTRIANS.fleeSpeed
        : p.state === 'pause' ? 0 : PEDESTRIANS.walkSpeed;
      // Each pedestrian walks slightly faster or slower (±20%)
      const speedVariation = 0.8 + (p.speedVariation || 1.0) * 0.4;
      const targetSpeed = baseSpeed * speedVariation;

      p.speed += (targetSpeed - p.speed) * dt * 5;

      // Smooth yaw toward target
      let yawDiff = p.targetYaw - p.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      p.yaw += yawDiff * dt * 3;

      // Move
      p.position.x += Math.sin(p.yaw) * p.speed * dt;
      p.position.z += Math.cos(p.yaw) * p.speed * dt;

      // Building collision — stop and turn
      for (const col of colliders) {
        if (p.position.x + 0.4 > col.minX && p.position.x - 0.4 < col.maxX &&
            p.position.z + 0.4 > col.minZ && p.position.z - 0.4 < col.maxZ) {
          p.position.x -= Math.sin(p.yaw) * p.speed * dt * 2;
          p.position.z -= Math.cos(p.yaw) * p.speed * dt * 2;
          p.targetYaw = p.yaw + Math.PI / 2 * (rng() > 0.5 ? 1 : -1);
          p.state = 'walk';
          break;
        }
      }

      // Keep within city bounds
      const bound = halfSize + roadWidth;
      p.position.x = Math.max(-bound, Math.min(bound, p.position.x));
      p.position.z = Math.max(-bound, Math.min(bound, p.position.z));

      // Clamp NaN positions that can arise from invalid movement vectors
      if (Number.isNaN(p.position.x)) p.position.x = 0;
      if (Number.isNaN(p.position.z)) p.position.z = 0;

      // Update mesh
      p.mesh.position.copy(p.position);
      p.mesh.rotation.y = p.yaw;

      // Walk animation
      const { leftLeg, rightLeg, leftArm, rightArm } = p.mesh.userData;
      const isMoving = p.speed > 0.3;
      if (isMoving) {
        const cycle = performance.now() * 0.005 * (p.state === 'flee' ? 2 : 1);
        const swing = Math.sin(cycle) * 0.4;
        leftLeg.rotation.x = -swing;
        rightLeg.rotation.x = swing;
        leftArm.rotation.x = swing;
        rightArm.rotation.x = -swing;
      } else {
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        leftArm.rotation.x = 0;
        rightArm.rotation.x = 0;
      }
    }
  }

  function getPedestrians() {
    return pedestrians;
  }

  return { update, getPedestrians };
}
