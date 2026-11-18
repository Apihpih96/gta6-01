/**
 * Bootstrap: renderer, scene, camera, clock, game state, game loop
 * with fixed-step updates, city + player + HUD + minimap + shots wiring.
 * Now includes vehicles, traffic AI and pedestrians.
 *
 * Exposes window.__game for debugging.
 */

import * as THREE from 'three';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { createMinimap } from './minimap.js';
import { createHUD } from './hud.js';
import { bindInput, consumeMouse, getActions, consumeKey, isKeyDown } from './input.js';
import { parseShotParams, isShotScene, setupShotScene } from './shots.js';
import { hashSeed } from './random.js';
import { createVehicleSystem } from './vehicles.js';
import { createTrafficSystem } from './traffic.js';
import { createPedestrianSystem } from './pedestrians.js';
import { VEHICLE, CAMERA } from './config.js';

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

// ---- Game state ----
const gameState = {
  running: isShotScene(shotScene),
  paused: false,
  mode: 'onFoot', // 'onFoot' | 'driving'
  health: player.health,
  cash: player.cash,
  wanted: player.wanted,
  speed: 0,
  hasWeapon: false,
  currentVehicle: null,
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
}

// ---- HUD ----
const hud = createHUD();
hud.showStartScreen(!gameState.running);

hud.wireButtons({
  onStartGame() {
    gameState.running = true;
    gameState.paused = false;
    hud.showStartScreen(false);
    hud.showMessage('Welcome to Solar Coast!');
    canvas.requestPointerLock();
  },
  onContinue() {
    gameState.running = true;
    gameState.paused = false;
    hud.showStartScreen(false);
    hud.showMessage('Welcome to Solar Coast!');
    canvas.requestPointerLock();
  },
  onResume() {
    gameState.paused = false;
    hud.showPauseScreen(false);
    canvas.requestPointerLock();
  },
});

// ---- Minimap ----
const minimapContainer = document.getElementById('minimap-container');
const minimap = createMinimap(minimapContainer);

// ---- Input ----
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
}

// ---- Fixed-step game loop ----
const FIXED_DT = 1 / 60;
let accumulator = 0;
const clock = new THREE.Clock();

function gameLoop() {
  requestAnimationFrame(gameLoop);

  const dt = Math.min(clock.getDelta(), 0.1);
  accumulator += dt;

  if (!gameState.running || gameState.paused) {
    renderer.render(scene, camera);
    return;
  }

  while (accumulator >= FIXED_DT) {
    accumulator -= FIXED_DT;

    const actions = getActions();

    if (actions.pause) {
      gameState.paused = !gameState.paused;
      hud.showPauseScreen(gameState.paused);
      if (gameState.paused) {
        document.exitPointerLock();
      } else {
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

    // Update systems
    if (gameState.mode === 'onFoot') {
      updatePlayer(actions, FIXED_DT);
      updatePlayerCamera(camera, actions, mouse);
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
          v.speed *= 0.7;
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

      // Camera
      updateDriveCamera(camera, v, mouse);

      // Sync player position to vehicle (for minimap)
      player.position.copy(v.position);
      player.yaw = v.yaw;
    }

    // Traffic
    const playerPos = gameState.mode === 'driving' && gameState.currentVehicle
      ? gameState.currentVehicle.position
      : player.position;
    trafficSystem.update(FIXED_DT, playerPos);

    // Pedestrians
    const nearbyVehicle = gameState.mode === 'driving' ? gameState.currentVehicle : null;
    const playerSpeed = gameState.currentVehicle ? Math.abs(gameState.currentVehicle.speed) : player.speed;
    pedSystem.update(FIXED_DT, playerPos, playerSpeed, nearbyVehicle);

    // Vehicle system update (for parked cars)
    vehicleSystem.update(FIXED_DT, actions, player, gameState);

    // Interact prompt
    if (gameState.mode === 'onFoot') {
      const nearby = vehicleSystem.getClosest(player.position);
      hud.showInteractPrompt(nearby ? 'Press E to enter' : '');
    } else {
      hud.showInteractPrompt('Press E to exit');
    }

    // Sync HUD
    gameState.health = player.health;
    gameState.cash = player.cash;
    gameState.wanted = player.wanted;
    gameState.speed = gameState.currentVehicle ? Math.abs(gameState.currentVehicle.speed) : player.speed;
  }

  // Render
  renderer.render(scene, camera);

  // HUD update
  hud.update(gameState, dt);

  // Minimap
  const mapPos = gameState.mode === 'driving' && gameState.currentVehicle
    ? { x: gameState.currentVehicle.position.x, z: gameState.currentVehicle.position.z, yaw: gameState.currentVehicle.yaw }
    : { x: player.position.x, z: player.position.z, yaw: player.yaw };

  minimap.draw(mapPos, colliders,
    trafficSystem.getTrafficCars(),
    pedSystem.getPedestrians(),
    vehicleSystem.parkedCars
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
window.__game = { gameState, player, scene, camera, renderer };

// Mark ready
requestAnimationFrame(() => {
  document.title = 'Solar Coast — READY';
});
