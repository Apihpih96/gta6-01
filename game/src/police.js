/**
 * Police system: patrol cars with flashing light bar, on-foot officers,
 * pursuit AI, ramming, bust logic, minimap blips.
 *
 * Exports:
 *   createPoliceSystem(scene, seed, colliders, roadData, hud)
 *     — returns { update, getPolicePositions, getPoliceCars, getOfficers, spawnForWanted, despawnAll, handleBust }
 */

import * as THREE from 'three';
import { createRNG, randFloat, randChoice } from './random.js';
import { buildCarMesh } from './vehicles.js';
import { buildPersonMesh } from './player.js';
import { WANTED } from './config.js';

/** Build a police car mesh (black-and-white with light bar). */
export function buildPoliceCarMesh() {
  const group = buildCarMesh('sedan', 0x111111);

  // White doors (two white panels on sides)
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5, metalness: 0.3 });
  const doorGeo = new THREE.BoxGeometry(0.05, 0.35, 1.2);

  const leftDoor = new THREE.Mesh(doorGeo, whiteMat);
  leftDoor.position.set(-0.92, 0.6, -0.2);
  group.add(leftDoor);

  const rightDoor = new THREE.Mesh(doorGeo, whiteMat);
  rightDoor.position.set(0.92, 0.6, -0.2);
  group.add(rightDoor);

  // Light bar on roof
  const lightBarGeo = new THREE.BoxGeometry(1.2, 0.12, 0.25);
  const lightBarMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
  const lightBar = new THREE.Mesh(lightBarGeo, lightBarMat);
  lightBar.position.set(0, 1.35, -0.2);
  group.add(lightBar);

  // Red and blue flashing lights
  const flashGeo = new THREE.BoxGeometry(0.35, 0.08, 0.15);
  const redMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x0000ff, emissive: 0x0000ff, emissiveIntensity: 0.5 });

  const redLight = new THREE.Mesh(flashGeo, redMat);
  redLight.position.set(-0.3, 1.42, -0.2);
  group.add(redLight);

  const blueLight = new THREE.Mesh(flashGeo, blueMat);
  blueLight.position.set(0.3, 1.42, -0.2);
  group.add(blueLight);

  group.userData = { redLight, blueLight, redMat, blueMat };

  return group;
}

/** Build an on-foot police officer mesh. */
function buildOfficerMesh() {
  const mesh = buildPersonMesh({
    shirtColor: 0x1a1a3a,  // dark blue uniform
    pantsColor: 0x1a1a3a,
    skinColor: 0xd4a06a,
    hairColor: 0x111111,
    shoeColor: 0x111111,
  });
  return mesh;
}

/** Create the police system. */
export function createPoliceSystem(scene, seed, colliders, roadData, hud) {
  const rng = createRNG(seed + 5555);
  const policeCars = [];  // { mesh, position, yaw, speed, targetYaw, state }
  const officers = [];    // { mesh, position, yaw, speed, state }
  let bustTriggered = false;
  let bustTimer = 0;

  /** Spawn police units based on wanted level. */
  function spawnForWanted(wantedLevel, playerPos, onRoad) {
    const targetUnits = wantedLevel; // 1 per star

    const currentUnits = policeCars.length + officers.length;
    const toSpawn = Math.max(0, targetUnits - currentUnits);

    for (let i = 0; i < toSpawn; i++) {
      // On-foot officers at wanted >= 3
      if (wantedLevel >= 3 && i < Math.floor(toSpawn / 2)) {
        spawnOfficer(playerPos);
      } else {
        spawnPoliceCar(playerPos, onRoad);
      }
    }
  }

  /** Spawn a police car off-screen near the player. */
  function spawnPoliceCar(playerPos, onRoad) {
    // Pick a spawn point on a road ~80-120 units from player
    // Use a minimum distance so police don't appear right next to the player
    const angle = rng() * Math.PI * 2;
    const dist = 80 + rng() * 40; // 80–120 units away
    const spawnX = playerPos.x + Math.cos(angle) * dist;
    const spawnZ = playerPos.z + Math.sin(angle) * dist;

    // Find nearest road
    let bestRoad = null;
    let bestRoadDist = Infinity;
    for (const road of roadData) {
      if (spawnX > road.minX && spawnX < road.maxX && spawnZ > road.minZ && spawnZ < road.maxZ) {
        const midX = (road.minX + road.maxX) / 2;
        const midZ = (road.minZ + road.maxZ) / 2;
        const d = Math.sqrt((midX - spawnX) ** 2 + (midZ - spawnZ) ** 2);
        if (d < bestRoadDist) {
          bestRoadDist = d;
          bestRoad = road;
        }
      }
    }

    if (!bestRoad) return;

    const mesh = buildPoliceCarMesh();
    const roadMidX = (bestRoad.minX + bestRoad.maxX) / 2;
    const roadMidZ = (bestRoad.minZ + bestRoad.maxZ) / 2;
    mesh.position.set(roadMidX, 0.6, roadMidZ);

    const yaw = bestRoad.axis === 'x' ? (rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() > 0.5 ? 0 : Math.PI);
    mesh.rotation.y = yaw;
    scene.add(mesh);

    policeCars.push({
      mesh,
      position: mesh.position.clone(),
      yaw,
      speed: 0,
      targetYaw: yaw,
      state: 'pursue',
      ramCooldown: 0,
    });
  }

  /** Spawn an on-foot officer near the player. */
  function spawnOfficer(playerPos) {
    // Officers spawn farther away than cars for fairer encounters
    const angle = rng() * Math.PI * 2;
    const dist = 40 + rng() * 30; // 40–70 units, not right on top of player
    const spawnX = playerPos.x + Math.cos(angle) * dist;
    const spawnZ = playerPos.z + Math.sin(angle) * dist;

    const mesh = buildOfficerMesh();
    mesh.position.set(spawnX, 0, spawnZ);
    scene.add(mesh);

    officers.push({
      mesh,
      position: new THREE.Vector3(spawnX, 0, spawnZ),
      yaw: 0,
      speed: 5, // running speed
      state: 'chase',
    });
  }

  /** Despawn all police units. */
  function despawnAll() {
    for (const car of policeCars) {
      scene.remove(car.mesh);
    }
    for (const officer of officers) {
      scene.remove(officer.mesh);
    }
    policeCars.length = 0;
    officers.length = 0;
    bustTriggered = false;
    bustTimer = 0;
  }

  /** Return true when a bust is pending and has not yet been consumed. */
  function isBustTriggered() {
    return bustTriggered;
  }

  /** Process bust: lose cash, reset wanted, respawn at station. */
  function handleBust(gameState) {
    const cashLoss = Math.floor(gameState.cash * 0.1);
    gameState.cash = Math.max(0, gameState.cash - cashLoss);
    gameState.busted = false;
    bustTriggered = false;
    bustTimer = 0;
    return cashLoss;
  }

  /** Update police AI: pursue, ram, chase. */
  function update(dt, playerPos, playerInVehicle, gameState) {
    const flashPhase = performance.now() / 1000;

    // Update police cars
    for (let i = policeCars.length - 1; i >= 0; i--) {
      const car = policeCars[i];

      // Flash lights
      if (car.mesh.userData && car.mesh.userData.redMat) {
        const flash = Math.sin(flashPhase * 6) > 0;
        car.mesh.userData.redMat.emissiveIntensity = flash ? 2 : 0.2;
        car.mesh.userData.blueMat.emissiveIntensity = flash ? 0.2 : 2;
      }

      // Pursuit: steer toward player
      const dx = playerPos.x - car.position.x;
      const dz = playerPos.z - car.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const targetAngle = Math.atan2(dx, dz);

      // Smooth turn toward player
      let yawDiff = targetAngle - car.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      car.yaw += yawDiff * dt * 2;

      // Speed: faster when far, slow to ram when close
      if (dist > 20) {
        car.speed += (18 - car.speed) * dt * 2;
      } else if (dist > 5) {
        car.speed += (12 - car.speed) * dt * 2;
      } else {
        // Ram attempt
        car.ramCooldown -= dt;
        if (car.ramCooldown <= 0) {
          car.speed = Math.min(car.speed + 5, 15);
          car.ramCooldown = 2;
        } else {
          car.speed *= 0.95;
        }
      }

      // Move
      car.position.x -= Math.sin(car.yaw) * car.speed * dt;
      car.position.z -= Math.cos(car.yaw) * car.speed * dt;

      // Building collision: bounce
      for (const col of colliders) {
        const carR = 2;
        if (car.position.x + carR > col.minX && car.position.x - carR < col.maxX &&
            car.position.z + carR > col.minZ && car.position.z - carR < col.maxZ) {
          const overlapX = Math.min(car.position.x + carR - col.minX, col.maxX - (car.position.x - carR));
          const overlapZ = Math.min(car.position.z + carR - col.minZ, col.maxZ - (car.position.z - carR));
          if (overlapX < overlapZ) {
            car.position.x = car.position.x < (col.minX + col.maxX) / 2 ? col.minX - carR : col.maxX + carR;
          } else {
            car.position.z = car.position.z < (col.minZ + col.maxZ) / 2 ? col.minZ - carR : col.maxZ + carR;
          }
          car.speed *= 0.3;
        }
      }

      // Update mesh
      car.mesh.position.set(car.position.x, 0.6, car.position.z);
      car.mesh.rotation.y = car.yaw;

      // Bust check: if player on foot and police car within 3m for 2s
      if (!playerInVehicle && dist < 3) {
        car.bustHold = (car.bustHold || 0) + dt;
        if (car.bustHold >= 2 && !bustTriggered) {
          bustTriggered = true;
        }
      } else {
        car.bustHold = 0;
      }

      // Despawn if too far
      if (dist > 200) {
        scene.remove(car.mesh);
        policeCars.splice(i, 1);
      }
    }

    // Update officers on foot
    for (let i = officers.length - 1; i >= 0; i--) {
      const officer = officers[i];
      const dx = playerPos.x - officer.position.x;
      const dz = playerPos.z - officer.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const targetAngle = Math.atan2(dx, dz);

      let yawDiff = targetAngle - officer.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      officer.yaw += yawDiff * dt * 5;

      // Run toward player
      officer.position.x += Math.sin(officer.yaw) * officer.speed * dt;
      officer.position.z += Math.cos(officer.yaw) * officer.speed * dt;

      // Building collision
      for (const col of colliders) {
        if (officer.position.x + 0.4 > col.minX && officer.position.x - 0.4 < col.maxX &&
            officer.position.z + 0.4 > col.minZ && officer.position.z - 0.4 < col.maxZ) {
          officer.position.x -= Math.sin(officer.yaw) * officer.speed * dt * 2;
          officer.position.z -= Math.cos(officer.yaw) * officer.speed * dt * 2;
          officer.yaw += Math.PI / 2;
        }
      }

      // Update mesh
      officer.mesh.position.copy(officer.position);
      officer.mesh.rotation.y = officer.yaw;

      // Walk animation
      const { leftLeg, rightLeg, leftArm, rightArm } = officer.mesh.userData;
      if (leftLeg) {
        const cycle = performance.now() * 0.01;
        const swing = Math.sin(cycle) * 0.5;
        leftLeg.rotation.x = -swing;
        rightLeg.rotation.x = swing;
        leftArm.rotation.x = swing;
        rightArm.rotation.x = -swing;
      }

      // Bust check: officer touches player on foot
      if (!playerInVehicle && dist < 1.5 && !bustTriggered) {
        bustTriggered = true;
      }

      // Despawn if too far
      if (dist > 150) {
        scene.remove(officer.mesh);
        officers.splice(i, 1);
      }
    }

    // Handle bust
    if (bustTriggered && gameState) {
      bustTimer += dt;
      if (bustTimer >= 0.5) {
        // Trigger bust overlay
        gameState.busted = true;
      }
    }
  }

  /** Get police positions for wanted system proximity check. */
  function getPolicePositions() {
    const positions = [];
    for (const car of policeCars) {
      positions.push({ x: car.position.x, z: car.position.z });
    }
    for (const officer of officers) {
      positions.push({ x: officer.position.x, z: officer.position.z });
    }
    return positions;
  }

  function getPoliceCars() {
    return policeCars;
  }

  function getOfficers() {
    return officers;
  }

  /** Process bust: lose cash, reset wanted, respawn at station. */
  function handleBust(gameState) {
    const cashLoss = Math.floor(gameState.cash * 0.1);
    gameState.cash = Math.max(0, gameState.cash - cashLoss);
    gameState.busted = false;
    bustTriggered = false;
    bustTimer = 0;
    return cashLoss;
  }

  return {
    update,
    spawnForWanted,
    despawnAll,
    getPolicePositions,
    getPoliceCars,
    getOfficers,
    handleBust,
    isBustTriggered,
  };
}
