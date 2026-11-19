/**
 * Bootstrap: renderer, scene, camera, clock, game state, game loop
 * with fixed-step updates, city + player + HUD + minimap + shots wiring.
 * Now includes vehicles, traffic AI, pedestrians, wanted level, police,
 * combat, missions/story, and save/load.
 *
 * Exposes window.__game for debugging.
 */

import * as THREE from 'three';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { createMinimap } from './minimap.js';
import { createHUD } from './hud.js';
import { bindInput, consumeMouse, getActions, consumeKey, isKeyDown, setAudioEngine } from './input.js';
import { parseShotParams, isShotScene, setupShotScene } from './shots.js';
import { hashSeed } from './random.js';
import { createVehicleSystem } from './vehicles.js';
import { createTrafficSystem } from './traffic.js';
import { createPedestrianSystem } from './pedestrians.js';
import { VEHICLE, CAMERA, WANTED } from './config.js';
import { createWantedSystem } from './wanted.js';
import { createPoliceSystem, buildPoliceCarMesh } from './police.js';
import { createCombatSystem } from './combat.js';
import { createMissionSystem } from './missions.js';
import { createSaveSystem } from './save.js';
import { createAudioEngine } from './audio.js';

// ---- Bootstrap ----
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'low-power',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

// ---- Shot params ----
const { scene: shotScene, seed: shotSeed } = parseShotParams();
const seed = shotSeed || hashSeed('solar-coast-1');

// ---- Build city ----
const { colliders, roadData } = buildCity(scene, seed);

// ---- Create player ----
const { mesh: playerMesh, state: player, update: updatePlayer, updateCamera: updatePlayerCamera } =
  createPlayer(scene, colliders);

// ---- Vehicle system ----
const vehicleSystem = createVehicleSystem(scene, seed, colliders, roadData);

// ---- Traffic system ----
const trafficSystem = createTrafficSystem(scene, seed, roadData, colliders);

// ---- Pedestrian system ----
const pedSystem = createPedestrianSystem(scene, seed, colliders, roadData);

// ---- Wanted system ----
const wantedSystem = createWantedSystem();

// ---- Combat system ----
const combatSystem = createCombatSystem(scene, colliders, null, wantedSystem);

// ---- Mission system ----
const missionSystem = createMissionSystem(null, wantedSystem, combatSystem);

// ---- Police system ----
const policeSystem = createPoliceSystem(scene, seed, colliders, roadData, null);

// ---- Save system ----
const saveSystem = createSaveSystem(null);

// ---- Audio system ----
const audio = createAudioEngine();

// ---- Game state ----
const gameState = {
  running: isShotScene(shotScene),
  paused: false,
  mode: 'onFoot', // 'onFoot' | 'driving'
  health: player.health,
  cash: 5000,
  wanted: player.wanted,
  speed: 0,
  hasWeapon: false,
  currentVehicle: null,
  busted: false,
  wasted: false,
  respawnTimer: 0,
  respawnPos: null,
};

// ---- Setup shot scene ----
if (isShotScene(shotScene)) {
  setupShotScene(shotScene, seed, player, camera);

  // For "drive" scene, create a player vehicle
  if (shotScene === 'drive') {
    const startCar = vehicleSystem.createCar(
      new THREE.Vector3(0, 0.6, 0),
      0,
      0xcc2222
    );
    startCar.isPlayer = true;
    startCar.speed = 12;
    gameState.mode = 'driving';
    gameState.currentVehicle = startCar;
    playerMesh.visible = false;
  }

  // For "chase" scene, create a player vehicle + police pursuit
  if (shotScene === 'chase') {
    const startCar = vehicleSystem.createCar(
      new THREE.Vector3(0, 0.6, 0),
      0,
      0xcc2222
    );
    startCar.isPlayer = true;
    startCar.speed = 15;
    gameState.mode = 'driving';
    gameState.currentVehicle = startCar;
    playerMesh.visible = false;

    // Set wanted level to 3 via the wanted system (not just gameState)
    wantedSystem.addHeat(3, 'chase_scene');
    gameState.wanted = wantedSystem.getLevel();

    // Spawn two police cars behind with proper police meshes
    for (let i = 0; i < 2; i++) {
      const policeMesh = buildPoliceCarMesh();
      const pz = 10 + i * 10;
      const px = (i === 0 ? -3 : 3);
      policeMesh.position.set(px, 0.6, pz);
      policeMesh.rotation.y = 0;
      scene.add(policeMesh);

      policeSystem.getPoliceCars().push({
        mesh: policeMesh,
        position: new THREE.Vector3(px, 0.6, pz),
        yaw: 0,
        speed: 16 + i * 2,
        targetYaw: 0,
        state: 'pursue',
        ramCooldown: 0,
      });
    }
  }

  // For "mission" scene, set up M1 context with a target car and marker
  if (shotScene === 'mission') {
    // Place a red sedan at the M1 objective
    const targetCar = vehicleSystem.createCar(
      new THREE.Vector3(-30, 0.6, 50),
      0,
      0xcc2222
    );
    targetCar.isMissionTarget = true;

    // Accept M1 so the marker shows
    missionSystem.acceptMission(0);
    missionSystem.onVehicleEnter(targetCar, gameState); // advance past "find car" step
  }
}

// ---- Mission 3D beacon (pulsing gold marker at active objective) ----
let missionBeacon = null;
let missionBeaconLight = null;

function updateMissionBeacon(markerPos, dt) {
  // Remove old beacon
  if (missionBeacon) {
    scene.remove(missionBeacon);
    missionBeacon = null;
  }
  if (missionBeaconLight) {
    scene.remove(missionBeaconLight);
    missionBeaconLight = null;
  }

  if (!markerPos) return;

  const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.004);
  const height = 8;

  // Gold diamond beacon
  const beaconGeo = new THREE.OctahedronGeometry(0.8 * pulse);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xffdd00,
    emissive: 0xffaa00,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.9,
  });
  missionBeacon = new THREE.Mesh(beaconGeo, beaconMat);
  missionBeacon.position.set(markerPos.x, height, markerPos.z);
  missionBeacon.rotation.y = performance.now() * 0.002;
  scene.add(missionBeacon);

  // Glow light
  missionBeaconLight = new THREE.PointLight(0xffdd00, 2, 15);
  missionBeaconLight.position.set(markerPos.x, height, markerPos.z);
  scene.add(missionBeaconLight);

  // Ground ring
  const ringGeo = new THREE.RingGeometry(1.5, 2.2, 16);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffdd00,
    transparent: true,
    opacity: 0.4 * pulse,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(markerPos.x, 0.1, markerPos.z);
  scene.add(ring);

  // Cleanup ring on next update (it's temporary)
  ring.userData.isBeaconPart = true;
  if (!missionBeacon.userData.parts) missionBeacon.userData.parts = [];
  missionBeacon.userData.parts.push(ring);
}

// ---- HUD ----
const hud = createHUD();

// Wire mute button
hud.wireMuteButton(audio);

// Check for existing save and enable continue button
if (saveSystem.hasSave()) {
  hud.setContinueEnabled(true);
}

hud.showStartScreen(!gameState.running);

hud.wireButtons({
  onStartGame() {
    audio.init();
    saveSystem.clearSave();
    gameState.running = true;
    gameState.paused = false;
    gameState.cash = 500;
    gameState.health = 100;
    hud.showStartScreen(false);
    hud.showMessage('Welcome to Solar Coast!');
    canvas.requestPointerLock();
  },
  onContinue() {
    audio.init();
    const loaded = saveSystem.load(gameState, player, wantedSystem, combatSystem, missionSystem);
    if (loaded) {
      gameState.running = true;
      gameState.paused = false;
      hud.showStartScreen(false);
      hud.showMessage('Welcome back!');
      canvas.requestPointerLock();
    } else {
      hud.showMessage('No valid save found — starting new game');
      gameState.cash = 500;
      gameState.running = true;
      gameState.paused = false;
      hud.showStartScreen(false);
      canvas.requestPointerLock();
    }
  },
  onResume() {
    gameState.paused = false;
    hud.showPauseScreen(false);
    canvas.requestPointerLock();
  },
  onMissionSelect(idx) {
    const result = missionSystem.acceptMission(idx);
    if (result) {
      hud.showPauseScreen(false);
      hud.showMessage('Mission accepted: ' + result.def.name);
      canvas.requestPointerLock();
    }
  },
});

// Wire HUD to mission and save systems
hud._missionSystem = missionSystem;
hud._saveSystem = saveSystem;

// ---- Minimap ----
const minimapContainer = document.getElementById('minimap-container');
const minimap = createMinimap(minimapContainer);

// ---- Input ----
setAudioEngine(audio);
bindInput(canvas);

// ---- Camera smoothing (for vehicle follow) ----
const camSmoothPos = new THREE.Vector3();
const camSmoothTarget = new THREE.Vector3();
let camInitialized = false;

/** Update camera for driving mode (follow behind the car). */
function updateDriveCamera(camera, vehicle, mouse) {
  const targetYaw = vehicle.yaw + mouse.dx * CAMERA.sensitivity * 0.5;
  const dist = VEHICLE.cameraDistance;
  const height = VEHICLE.cameraHeight;

  const idealPos = new THREE.Vector3(
    vehicle.position.x + Math.sin(targetYaw) * Math.cos(0.1) * dist,
    vehicle.position.y + height,
    vehicle.position.z + Math.cos(targetYaw) * Math.cos(0.1) * dist
  );
  const lookTarget = new THREE.Vector3(
    vehicle.position.x,
    vehicle.position.y + 1.5,
    vehicle.position.z - 10
  );

  if (!camInitialized) {
    camSmoothPos.copy(idealPos);
    camSmoothTarget.copy(lookTarget);
    camInitialized = true;
  }

  const s = VEHICLE.cameraSmoothing;
  camSmoothPos.lerp(idealPos, s);
  camSmoothTarget.lerp(lookTarget, s);

  camera.position.copy(camSmoothPos);
  camera.lookAt(camSmoothTarget);
}

/** Enter a parked vehicle. */
function enterVehicle(car) {
  car.occupied = true;
  const activeCar = vehicleSystem.createCar(
    car.position.clone(),
    car.yaw,
    car.color
  );
  activeCar.isPlayer = true;
  activeCar.steerAngle = 0;
  gameState.mode = 'driving';
  gameState.currentVehicle = activeCar;
  playerMesh.visible = false;
  camInitialized = false;
  hud.showMessage('Press E to exit');
  audio.play('carDoor');
  audio.startEngine();

  // Crime: stealing a car
  wantedSystem.addHeat(1, 'stolen_vehicle');

  // Check mission: M1 step — steal the car
  missionSystem.onVehicleEnter(activeCar, gameState);
}

/** Exit the current vehicle. */
function exitVehicle() {
  const v = gameState.currentVehicle;
  if (!v) return;

  // Place player beside the car
  const side = new THREE.Vector3(
    v.position.x + Math.cos(v.yaw) * 2.5,
    0,
    v.position.z - Math.sin(v.yaw) * 2.5
  );
  player.position.copy(side);
  playerMesh.position.copy(side);
  playerMesh.visible = true;

  // Remove the active vehicle, restore the parked one
  scene.remove(v.mesh);
  const idx = vehicleSystem.vehicles.indexOf(v);
  if (idx >= 0) vehicleSystem.vehicles.splice(idx, 1);

  // Find the matching parked car and free it
  for (const pc of vehicleSystem.parkedCars) {
    if (pc.occupied) {
      const dx = pc.position.x - v.position.x;
      const dz = pc.position.z - v.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < 5) {
        pc.occupied = false;
        break;
      }
    }
  }

  gameState.mode = 'onFoot';
  gameState.currentVehicle = null;
  camInitialized = false;
  hud.showMessage('On foot again');
  audio.stopEngine();
  audio.play('carDoor');
}

/** Respawn player at a location after bust or death. */
function respawnAt(position, message) {
  player.position.copy(position);
  playerMesh.position.copy(position);
  playerMesh.visible = true;
  gameState.mode = 'onFoot';
  // Clean up any remaining vehicle reference
  if (gameState.currentVehicle) {
    scene.remove(gameState.currentVehicle.mesh);
    const idx = vehicleSystem.vehicles.indexOf(gameState.currentVehicle);
    if (idx >= 0) vehicleSystem.vehicles.splice(idx, 1);
    gameState.currentVehicle = null;
  }
  camInitialized = false;
  hud.showMessage(message);
}

// ---- Fixed-step game loop ----
const FIXED_DT = 1 / 60;
let accumulator = 0;
const clock = new THREE.Clock();
let playerPos = new THREE.Vector3(); // Track for HUD/minimap outside the update loop

// Re-wire HUD to use mission/save
hud._updateObjective = hud.setObjective;

function gameLoop() {
  requestAnimationFrame(gameLoop);

  const dt = Math.min(clock.getDelta(), 0.1);
  accumulator += dt;

  if (!gameState.running || gameState.paused) {
    // Update mission beacon even when paused (for screenshots)
    if (isShotScene(shotScene) || gameState.paused) {
      const markerPos = missionSystem.getActiveMarkerPos();
      updateMissionBeacon(markerPos, dt);
    }
    renderer.render(scene, camera);
    return;
  }

  // Auto-save
  saveSystem.autoSave(dt, gameState, player, wantedSystem, combatSystem, missionSystem);

  // Handle busted state
  if (gameState.busted) {
    gameState.respawnTimer += dt;
    if (gameState.respawnTimer > 2) {
      const cashLost = policeSystem.handleBust(gameState);
      hud.showMessage('BUSTED! Lost $' + cashLost.toLocaleString());
      audio.play('bustedSting');
      // Respawn at police station (downtown)
      respawnAt(new THREE.Vector3(20, 0, 20), 'Released from station');
      wantedSystem.reset();
      policeSystem.despawnAll();
      gameState.busted = false;
      gameState.respawnTimer = 0;
      gameState.respawnPos = null;
    }
  }

  // Handle wasted state
  if (gameState.wasted) {
    gameState.respawnTimer += dt;
    if (gameState.respawnTimer > 2) {
      const cashLost = combatSystem.handleWasted(gameState);
      hud.showMessage('WASTED! Lost $' + cashLost.toLocaleString());
      audio.play('wastedSting');
      // Respawn at hospital (edge of town)
      respawnAt(new THREE.Vector3(-30, 0, -30), 'Released from hospital');
      // Wanted unchanged
      gameState.wasted = false;
      gameState.respawnTimer = 0;
    }
  }

  while (accumulator >= FIXED_DT) {
    accumulator -= FIXED_DT;

    // Skip updates during bust/wasted overlay
    if (gameState.busted || gameState.wasted) {
      continue;
    }

    const actions = getActions();

    if (actions.pause) {
      gameState.paused = !gameState.paused;
      hud.showPauseScreen(gameState.paused);
      if (gameState.paused) {
        document.exitPointerLock();
        // Show mission select on start screen
        const unlocked = missionSystem.getUnlockedMissions();
        const missionDefs = missionSystem.getAllMissionDefs();
        const completed = missionSystem.getCompletedMissions();
        hud.updateMissionSelect(unlocked, missionDefs, completed);
        hud.showMissionSelect(true);
      } else {
        hud.showMissionSelect(false);
        canvas.requestPointerLock();
      }
      continue;
    }

    const mouse = consumeMouse();

    // Enter / exit vehicle
    if (actions.interact) {
      if (gameState.mode === 'onFoot') {
        const nearby = vehicleSystem.getClosest(player.position);
        if (nearby) enterVehicle(nearby);
      } else if (gameState.mode === 'driving') {
        exitVehicle();
      }
    }

    // Punch action
    if (actions.punch && gameState.mode === 'onFoot') {
      audio.play('punch');
      const punchResult = combatSystem.tryPunch(player.position, player.yaw, pedSystem.getPedestrians());
      if (punchResult && punchResult.hit && punchResult.ped) {
        const events = combatSystem.handlePedHit(punchResult.ped, pedSystem.getPedestrians());
        audio.play('pedYelp');

        // Check mission: M3 shakedown
        const pedPos = punchResult.ped.position;
        const missionPunch = missionSystem.tryPunchMissionPed(player.position, {
          hit: true,
          pedPos,
        });

        // Crime: punching a pedestrian (only if not a mission-collect punch)
        if (!missionPunch) {
          wantedSystem.addHeat(1, 'assault');

          // Check if police nearby for extra heat
          const policePositions = policeSystem.getPolicePositions();
          for (const pp of policePositions) {
            const dx = pp.x - player.position.x;
            const dz = pp.z - player.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < WANTED.policeHeatRadius) {
              wantedSystem.addHeat(1, 'crime_witnessed');
              break;
            }
          }
        }
      }
    }

    // Update player
    if (gameState.mode === 'onFoot') {
      updatePlayer(actions, FIXED_DT);
      updatePlayerCamera(camera, actions, mouse);

      // Sync health from combat system
      player.health = combatSystem.getPlayerHealthRaw();
    }

    // Update systems
    if (gameState.mode === 'onFoot') {
      // Player already updated above
    } else if (gameState.mode === 'driving' && gameState.currentVehicle) {
      const v = gameState.currentVehicle;
      // Drive physics
      const { forward, backward, left, right, handbrake } = actions;

      if (forward) {
        v.speed = Math.min(v.speed + VEHICLE.acceleration * FIXED_DT, VEHICLE.maxSpeed);
      } else if (backward) {
        v.speed = Math.max(v.speed - VEHICLE.brakeForce * FIXED_DT, -VEHICLE.reverseSpeed);
      } else {
        v.speed *= Math.pow(VEHICLE.drag, FIXED_DT * 60);
        if (Math.abs(v.speed) < 0.1) v.speed = 0;
      }

      if (handbrake) {
        v.speed *= Math.pow(0.9, FIXED_DT * 60);
      }

      // Speed-sensitive steering
      const steerFactor = Math.min(1, Math.abs(v.speed) / VEHICLE.steerFadeSpeed);
      const steerAmount = VEHICLE.steerMax * (1 - steerFactor * 0.6);
      if (left) {
        v.yaw += steerAmount * Math.sign(v.speed || 0.1);
        v.steerAngle = Math.min(v.steerAngle + 0.1, 0.4);
      } else if (right) {
        v.yaw -= steerAmount * Math.sign(v.speed || 0.1);
        v.steerAngle = Math.max(v.steerAngle - 0.1, -0.4);
      } else {
        v.steerAngle *= 0.85;
      }

      // Move
      v.position.x -= Math.sin(v.yaw) * v.speed * FIXED_DT;
      v.position.z -= Math.cos(v.yaw) * v.speed * FIXED_DT;

      // Building collision
      for (const col of colliders) {
        const carR = 2;
        if (v.position.x + carR > col.minX && v.position.x - carR < col.maxX &&
            v.position.z + carR > col.minZ && v.position.z - carR < col.maxZ) {
          const overlapX = Math.min(v.position.x + carR - col.minX, col.maxX - (v.position.x - carR));
          const overlapZ = Math.min(v.position.z + carR - col.minZ, col.maxZ - (v.position.z - carR));
          if (overlapX < overlapZ) {
            v.position.x = v.position.x < (col.minX + col.maxX) / 2 ? col.minX - carR : col.maxX + carR;
          } else {
            v.position.z = v.position.z < (col.minZ + col.maxZ) / 2 ? col.minZ - carR : col.maxZ + carR;
          }
          if (Math.abs(v.speed) > 3) {
            audio.play('crash');
          }
          v.speed *= 0.5;
        }
      }

      // Car-car collision with traffic
      const trafficCars = trafficSystem.getTrafficCars();
      for (const tc of trafficCars) {
        const dx = v.position.x - tc.position.x;
        const dz = v.position.z - tc.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 3.5 && dist > 0) {
          const push = (3.5 - dist) / 2;
          v.position.x += (dx / dist) * push;
          v.position.z += (dz / dist) * push;
          if (Math.abs(v.speed) > 5) {
            audio.play('crash');
            // Crime: hitting a traffic car
            wantedSystem.addHeat(0.5, 'hit_vehicle');
          }
          v.speed *= 0.7;
        }
      }

      // Hit pedestrians with car
      for (const ped of pedSystem.getPedestrians()) {
        const dx = ped.position.x - v.position.x;
        const dz = ped.position.z - v.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 2.5 && Math.abs(v.speed) > 3) {
          // Hit!
          audio.play('pedYelp');
          combatSystem.handlePlayerDamage(10);
          wantedSystem.addHeat(1, 'hit_pedestrian');
          // Push pedestrian away
          ped.position.x += (dx / dist) * 3;
          ped.position.z += (dz / dist) * 3;
          ped.state = 'flee';
          ped.timer = 5;
        }
      }

      // Update vehicle mesh
      v.mesh.position.set(v.position.x, 0.6, v.position.z);
      v.mesh.rotation.y = v.yaw;
      if (v.mesh.userData && v.mesh.userData.frontWheels) {
        for (const fw of v.mesh.userData.frontWheels) {
          fw.rotation.y = v.steerAngle;
        }
      }

      // Engine hum follows speed
      audio.updateEngine(Math.abs(v.speed) / VEHICLE.maxSpeed);

      // Camera
      updateDriveCamera(camera, v, mouse);

      // Sync player position to vehicle (for minimap)
      player.position.copy(v.position);
      player.yaw = v.yaw;
    }

    // Traffic
    playerPos = gameState.mode === 'driving' && gameState.currentVehicle
      ? gameState.currentVehicle.position
      : player.position;
    trafficSystem.update(FIXED_DT, playerPos);

    // Pedestrians
    const nearbyVehicle = gameState.mode === 'driving' ? gameState.currentVehicle : null;
    const playerSpeed = gameState.currentVehicle ? Math.abs(gameState.currentVehicle.speed) : player.speed;
    pedSystem.update(FIXED_DT, playerPos, playerSpeed, nearbyVehicle);

    // Vehicle system update (for parked cars)
    vehicleSystem.update(FIXED_DT, actions, player, gameState);

    // Wanted system update
    const policePositions = policeSystem.getPolicePositions();
    wantedSystem.update(FIXED_DT, player, { policePositions });

    // Police system update
    const wantedLevel = wantedSystem.getLevel();
    if (wantedLevel > 0) {
      policeSystem.spawnForWanted(wantedLevel, playerPos, gameState.currentVehicle);
      audio.play('siren', { on: true });
    } else {
      // Despawn all police when wanted hits 0
      policeSystem.despawnAll();
      audio.play('siren', { on: false });
    }
    policeSystem.update(FIXED_DT, playerPos, gameState.mode === 'driving', gameState);

    // Combat system update
    combatSystem.update(FIXED_DT, playerPos, pedSystem.getPedestrians());

    // Mission system update
    const prevMissionActive = missionSystem.getMissionState()?.active;
    missionSystem.update(FIXED_DT, gameState, playerPos);
    const postMissionState = missionSystem.getMissionState();

    // Detect mission completion or failure
    if (prevMissionActive && (!postMissionState || !postMissionState.active)) {
      // Check if it was a completion (completed list grew)
      const ms = missionSystem.getMissionState();
      if (ms && ms.completed.length > (audio._prevCompleted || 0)) {
        audio.play('missionOk');
        audio.play('cash');
      } else {
        audio.play('missionFail');
      }
      audio._prevCompleted = ms ? ms.completed.length : 0;
    } else if (!prevMissionActive && postMissionState && postMissionState.active) {
      audio._prevCompleted = postMissionState.completed.length;
    }

    // Check for wasted
    if (combatSystem.isWasted() && !gameState.wasted) {
      gameState.wasted = true;
      gameState.respawnTimer = 0;
    }

    // Check for busted (from police system)
    if (policeSystem.isBustTriggered() && !gameState.busted && !gameState.wasted) {
      gameState.busted = true;
      gameState.respawnTimer = 0;
    }

    // Police damage to player (ramming)
    if (gameState.mode === 'onFoot') {
      for (const pc of policeSystem.getPoliceCars()) {
        const dx = pc.position.x - player.position.x;
        const dz = pc.position.z - player.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 2.5 && Math.abs(pc.speed) > 3) {
          combatSystem.handlePlayerDamage(8);
        }
      }
    }

    // Interact prompt
    if (gameState.mode === 'onFoot') {
      const nearby = vehicleSystem.getClosest(player.position);
      // Check if near mission accept marker
      const activeMission = missionSystem.getActiveMission();
      if (activeMission) {
        hud.showInteractPrompt(activeMission.def.steps[activeMission.stepIndex]?.text || '');
      } else {
        hud.showInteractPrompt(nearby ? 'Press E to enter' : '');
      }
    } else {
      hud.showInteractPrompt('Press E to exit');
    }

    // Sync HUD
    gameState.health = combatSystem.getPlayerHealthRaw();
    gameState.wanted = wantedSystem.getLevel();
    gameState.speed = gameState.currentVehicle ? Math.abs(gameState.currentVehicle.speed) : player.speed;

    // Auto-save on mission complete (only when count increases)
    const missionState = missionSystem.getMissionState();
    if (missionState && !missionState.active && missionState.completed.length > 0) {
      const prevCount = gameState._lastSavedMissionCount || 0;
      if (missionState.completed.length > prevCount) {
        saveSystem.save(gameState, player, wantedSystem, combatSystem, missionSystem);
        gameState._lastSavedMissionCount = missionState.completed.length;
      }
    }
  }

  // Render
  renderer.render(scene, camera);

  // Update mission beacon
  const markerPos = missionSystem.getActiveMarkerPos();
  updateMissionBeacon(markerPos, dt);

  // HUD update
  hud.update(gameState, dt);
  hud.setMuted(audio.isMuted());

  // Update objective line with mission step text
  const ms = missionSystem.getMissionState();
  if (ms && ms.active) {
    hud.setObjective(ms.stepText);
  }

  // Show BUSTED overlay
  const bustedOverlay = document.getElementById('busted-overlay');
  if (bustedOverlay) {
    bustedOverlay.style.display = gameState.busted ? 'flex' : 'none';
  }

  // Show WASTED overlay
  const wastedOverlay = document.getElementById('wasted-overlay');
  if (wastedOverlay) {
    wastedOverlay.style.display = gameState.wasted ? 'flex' : 'none';
  }

  // Police nearby indicator
  const policeNearbyEl = document.getElementById('police-nearby');
  if (policeNearbyEl) {
    const policePositions = policeSystem.getPolicePositions();
    let nearPolice = false;
    for (const pp of policePositions) {
      const dx = pp.x - playerPos.x;
      const dz = pp.z - playerPos.z;
      if (Math.sqrt(dx * dx + dz * dz) < 50) {
        nearPolice = true;
        break;
      }
    }
    if (nearPolice && wantedSystem.getLevel() > 0) {
      policeNearbyEl.textContent = '⚠ POLICE NEARBY';
      policeNearbyEl.style.opacity = '1';
    } else {
      policeNearbyEl.style.opacity = '0';
    }
  }

  // Minimap
  const mapPos = gameState.mode === 'driving' && gameState.currentVehicle
    ? { x: gameState.currentVehicle.position.x, z: gameState.currentVehicle.position.z, yaw: gameState.currentVehicle.yaw }
    : { x: player.position.x, z: player.position.z, yaw: player.yaw };

  const missionMarkers = missionSystem.getMissionMarkerPositions();
  minimap.draw(mapPos, colliders,
    trafficSystem.getTrafficCars(),
    pedSystem.getPedestrians(),
    vehicleSystem.parkedCars,
    policeSystem.getPoliceCars(),
    policeSystem.getOfficers(),
    missionMarkers
  );
}

// ---- Resize handler ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Start loop ----
requestAnimationFrame(gameLoop);

// ---- Debug handle ----
window.__game = {
  gameState, player, scene, camera, renderer,
  missionSystem, saveSystem, wantedSystem, combatSystem,
};

// Mark ready
requestAnimationFrame(() => {
  document.title = 'Solar Coast — READY';
});
