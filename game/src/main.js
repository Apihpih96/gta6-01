/**
 * Solar Coast — entry point: renderer bootstrap, system wiring,
 * fixed-step game loop, shot orchestration, and debug surface.
 *
 * No exports.  This module bootstraps the entire game when the
 * browser loads index.html.  A debug handle is attached to
 * `window.__game` for console inspection.
 */

import * as THREE from 'three';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { createMinimap } from './minimap.js';
import { createHUD } from './hud.js';
import { bindInput, consumeMouse, getActions, setAudioEngine } from './input.js';
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

/* ------------------------------------------------------------------ */
/*  Renderer + scene + camera                                         */
/* ------------------------------------------------------------------ */

const domCanvas = document.getElementById('game-canvas');

const renderer = new THREE.WebGLRenderer({
  canvas: domCanvas,
  antialias: true,
  powerPreference: 'low-power',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const worldScene = new THREE.Scene();
const followCamera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);

/* ------------------------------------------------------------------ */
/*  Shot parameters (URL-driven screenshot mode)                      */
/* ------------------------------------------------------------------ */

const { scene: requestedShot, seed: urlSeed } = parseShotParams();
const worldSeed = urlSeed || hashSeed('solar-coast-1');

/* ------------------------------------------------------------------ */
/*  World generation                                                  */
/* ------------------------------------------------------------------ */

const { colliders, roadData } = buildCity(worldScene, worldSeed);

/* ------------------------------------------------------------------ */
/*  Player                                                            */
/* ------------------------------------------------------------------ */

const {
  mesh: playerMesh,
  state: playerState,
  update: stepPlayer,
  updateCamera: stepPlayerCam,
} = createPlayer(worldScene, colliders);

/* ------------------------------------------------------------------ */
/*  Systems — vehicles, traffic, walkers                              */
/* ------------------------------------------------------------------ */

const vehicles = createVehicleSystem(worldScene, worldSeed, colliders, roadData);
const traffic = createTrafficSystem(worldScene, worldSeed, roadData, colliders);
const walkers = createPedestrianSystem(worldScene, worldSeed, colliders, roadData);

/* ------------------------------------------------------------------ */
/*  Systems — crime, enforcement, combat, missions, persistence, audio*/
/* ------------------------------------------------------------------ */

const wanted = createWantedSystem();
const combat = createCombatSystem(worldScene, colliders, null, wanted);
const missions = createMissionSystem(null, wanted, combat);
const police = createPoliceSystem(worldScene, worldSeed, colliders, roadData, null);
const persistence = createSaveSystem(null);
const audio = createAudioEngine();

/* ------------------------------------------------------------------ */
/*  Runtime flags                                                     */
/* ------------------------------------------------------------------ */

const runtime = {
  active: isShotScene(requestedShot),   // running or frozen on start screen
  paused: false,
  travelMode: 'walking',               // 'walking' | 'driving'
  cash: 5000,
  activeCar: null,
  busted: false,
  wasted: false,
  respawnTick: 0,
};

/* ------------------------------------------------------------------ */
/*  Shot scene helpers                                                */
/* ------------------------------------------------------------------ */

if (isShotScene(requestedShot)) {
  setupShotScene(requestedShot, worldSeed, playerState, followCamera);

  // ── Drive shot ──────────────────────────────────────────────────
  if (requestedShot === 'drive') {
    const hero = vehicles.createCar(
      new THREE.Vector3(0, 0.6, 0),
      0,
      0xcc2222
    );
    hero.isPlayer = true;
    hero.speed = 12;
    runtime.travelMode = 'driving';
    runtime.activeCar = hero;
    playerMesh.visible = false;
  }

  // ── Chase shot ──────────────────────────────────────────────────
  if (requestedShot === 'chase') {
    const hero = vehicles.createCar(
      new THREE.Vector3(0, 0.6, 0),
      0,
      0xcc2222
    );
    hero.isPlayer = true;
    hero.speed = 15;
    runtime.travelMode = 'driving';
    runtime.activeCar = hero;
    playerMesh.visible = false;

    wanted.addHeat(3, 'chase_scene');
    runtime.cash = 5000;

    // Two pursuit cars behind
    for (let i = 0; i < 2; i++) {
      const pursuitMesh = buildPoliceCarMesh();
      const pz = 10 + i * 10;
      const px = i === 0 ? -3 : 3;
      pursuitMesh.position.set(px, 0.6, pz);
      pursuitMesh.rotation.y = 0;
      worldScene.add(pursuitMesh);

      police.getPoliceCars().push({
        mesh: pursuitMesh,
        position: new THREE.Vector3(px, 0.6, pz),
        yaw: 0,
        speed: 16 + i * 2,
        targetYaw: 0,
        state: 'pursue',
        ramCooldown: 0,
      });
    }
  }

  // ── Mission shot ────────────────────────────────────────────────
  if (requestedShot === 'mission') {
    const targetCar = vehicles.createCar(
      new THREE.Vector3(-30, 0.6, 50),
      0,
      0xcc2222
    );
    targetCar.isMissionTarget = true;
    missions.acceptMission(0);
    missions.onVehicleEnter(targetCar, runtime);
  }
}

/* ------------------------------------------------------------------ */
/*  Mission beacon (pulsing gold octahedron above objective)          */
/* ------------------------------------------------------------------ */

let beaconMesh = null;
let beaconLight = null;

function refreshBeacon(position) {
  // Tear down previous beacon
  if (beaconMesh) {
    if (beaconMesh.userData.parts) {
      for (const part of beaconMesh.userData.parts) {
        worldScene.remove(part);
      }
    }
    worldScene.remove(beaconMesh);
    beaconMesh = null;
  }
  if (beaconLight) {
    worldScene.remove(beaconLight);
    beaconLight = null;
  }
  if (!position) return;

  const now = performance.now();
  const breathe = 0.6 + 0.4 * Math.sin(now * 0.004);
  const lift = 8;

  const geo = new THREE.OctahedronGeometry(0.8 * breathe);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffdd00,
    emissive: 0xffaa00,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.9,
  });
  beaconMesh = new THREE.Mesh(geo, mat);
  beaconMesh.position.set(position.x, lift, position.z);
  beaconMesh.rotation.y = now * 0.002;
  worldScene.add(beaconMesh);

  beaconLight = new THREE.PointLight(0xffdd00, 2, 15);
  beaconLight.position.set(position.x, lift, position.z);
  worldScene.add(beaconLight);

  // Ground ring
  const ringGeo = new THREE.RingGeometry(1.5, 2.2, 16);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffdd00,
    transparent: true,
    opacity: 0.4 * breathe,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, 0.1, position.z);
  worldScene.add(ring);

  beaconMesh.userData.parts = [ring];
}

/* ------------------------------------------------------------------ */
/*  HUD + minimap                                                     */
/* ------------------------------------------------------------------ */

const hud = createHUD();
hud.wireMuteButton(audio);

if (persistence.hasSave()) {
  hud.setContinueEnabled(true);
}

hud.showStartScreen(!runtime.active);

hud.wireButtons({
  onStartGame() {
    audio.init();
    persistence.clearSave();
    runtime.active = true;
    runtime.paused = false;
    runtime.cash = 500;
    hud.showStartScreen(false);
    hud.showMessage('Welcome to Solar Coast!');
    domCanvas.requestPointerLock();
  },
  onContinue() {
    audio.init();
    const ok = persistence.load(runtime, playerState, wanted, combat, missions);
    if (ok) {
      runtime.active = true;
      runtime.paused = false;
      hud.showStartScreen(false);
      hud.showMessage('Welcome back!');
      domCanvas.requestPointerLock();
    } else {
      hud.showMessage('No valid save found — starting new game');
      runtime.cash = 500;
      runtime.active = true;
      runtime.paused = false;
      hud.showStartScreen(false);
      domCanvas.requestPointerLock();
    }
  },
  onResume() {
    runtime.paused = false;
    hud.showPauseScreen(false);
    domCanvas.requestPointerLock();
  },
  onMissionSelect(idx) {
    const result = missions.acceptMission(idx);
    if (result) {
      hud.showPauseScreen(false);
      hud.showMessage('Mission accepted: ' + result.def.title);
      domCanvas.requestPointerLock();
    }
  },
});

// Direct references so HUD can reach mission/save data
hud._missionSystem = missions;
hud._saveSystem = persistence;

const minimapRoot = document.getElementById('minimap-container');
const minimap = createMinimap(minimapRoot);

/* ------------------------------------------------------------------ */
/*  Input                                                             */
/* ------------------------------------------------------------------ */

setAudioEngine(audio);
bindInput(domCanvas);

/* ------------------------------------------------------------------ */
/*  Camera smoothing state                                            */
/* ------------------------------------------------------------------ */

const camPosBuf = new THREE.Vector3();
const camLookBuf = new THREE.Vector3();
let camReady = false;

/** Follow a vehicle from behind with smooth interpolation. */
function smoothFollowCamera(cam, car, mouse) {
  const desiredYaw = car.yaw + mouse.dx * CAMERA.sensitivity * 0.5;
  const dist = VEHICLE.cameraDistance;
  const height = VEHICLE.cameraHeight;

  const ideal = new THREE.Vector3(
    car.position.x + Math.sin(desiredYaw) * Math.cos(0.1) * dist,
    car.position.y + height,
    car.position.z + Math.cos(desiredYaw) * Math.cos(0.1) * dist
  );
  const lookAt = new THREE.Vector3(
    car.position.x,
    car.position.y + 1.5,
    car.position.z - 10
  );

  if (!camReady) {
    camPosBuf.copy(ideal);
    camLookBuf.copy(lookAt);
    camReady = true;
  }

  const t = VEHICLE.cameraSmoothing;
  camPosBuf.lerp(ideal, t);
  camLookBuf.lerp(lookAt, t);

  cam.position.copy(camPosBuf);
  cam.lookAt(camLookBuf);
}

/* ------------------------------------------------------------------ */
/*  Vehicle enter / exit                                              */
/* ------------------------------------------------------------------ */

function getIntoVehicle(parkedCar) {
  parkedCar.occupied = true;
  const active = vehicles.createCar(
    parkedCar.position.clone(),
    parkedCar.yaw,
    parkedCar.color
  );
  active.isPlayer = true;
  active.steerAngle = 0;
  runtime.travelMode = 'driving';
  runtime.activeCar = active;
  playerMesh.visible = false;
  camReady = false;
  hud.showMessage('Press E to exit');
  audio.play('carDoor');
  audio.startEngine();
  wanted.addHeat(1, 'stolen_vehicle');
  missions.onVehicleEnter(active, runtime);
}

function getOutOfVehicle() {
  const car = runtime.activeCar;
  if (!car) return;

  // Drop player beside the car
  const exitX = car.position.x + Math.cos(car.yaw) * 2.5;
  const exitZ = car.position.z - Math.sin(car.yaw) * 2.5;
  const side = new THREE.Vector3(exitX, 0, exitZ);
  playerState.position.copy(side);
  playerMesh.position.copy(side);
  playerMesh.visible = true;

  // Remove active vehicle from scene and list
  worldScene.remove(car.mesh);
  const idx = vehicles.vehicles.indexOf(car);
  if (idx >= 0) vehicles.vehicles.splice(idx, 1);

  // Free the matching parked car
  for (const pc of vehicles.parkedCars) {
    if (pc.occupied) {
      const dx = pc.position.x - car.position.x;
      const dz = pc.position.z - car.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < 5) {
        pc.occupied = false;
        break;
      }
    }
  }

  runtime.travelMode = 'walking';
  runtime.activeCar = null;
  camReady = false;
  hud.showMessage('On foot again');
  audio.stopEngine();
  audio.play('carDoor');
}

/* ------------------------------------------------------------------ */
/*  Respawn after bust or death                                       */
/* ------------------------------------------------------------------ */

function respawnPlayer(at, note) {
  playerState.position.copy(at);
  playerMesh.position.copy(at);
  playerMesh.visible = true;
  runtime.travelMode = 'walking';

  // Clean up lingering vehicle reference
  if (runtime.activeCar) {
    worldScene.remove(runtime.activeCar.mesh);
    const idx = vehicles.vehicles.indexOf(runtime.activeCar);
    if (idx >= 0) vehicles.vehicles.splice(idx, 1);
    runtime.activeCar = null;
  }

  camReady = false;
  hud.showMessage(note);
}

/* ------------------------------------------------------------------ */
/*  Fixed-step loop                                                   */
/* ------------------------------------------------------------------ */

const FIXED_DT = 1 / 60;
let accumulator = 0;
const tickClock = new THREE.Clock();
let trackerPos = new THREE.Vector3();

// Hook HUD objective setter
hud._updateObjective = hud.setObjective;

function tick() {
  requestAnimationFrame(tick);

  const rawDt = Math.min(tickClock.getDelta(), 0.1);
  accumulator += rawDt;

  // ── Paused or not yet started ───────────────────────────────────
  if (!runtime.active || runtime.paused) {
    const mPos = missions.getActiveMarkerPos();
    refreshBeacon(mPos, rawDt);
    renderer.render(worldScene, followCamera);
    return;
  }

  // Auto-save guard
  persistence.autoSave(rawDt, runtime, playerState, wanted, combat, missions);

  // Busted overlay
  if (runtime.busted) {
    runtime.respawnTick += rawDt;
    if (runtime.respawnTick > 2) {
      const penalty = police.handleBust(runtime);
      hud.showMessage('BUSTED! Lost $' + penalty.toLocaleString());
      audio.play('bustedSting');
      respawnPlayer(new THREE.Vector3(20, 0, 20), 'Released from station');
      wanted.reset();
      police.despawnAll();
      runtime.busted = false;
      runtime.respawnTick = 0;
    }
  }

  // Wasted overlay
  if (runtime.wasted) {
    runtime.respawnTick += rawDt;
    if (runtime.respawnTick > 2) {
      const penalty = combat.handleWasted(runtime);
      hud.showMessage('WASTED! Lost $' + penalty.toLocaleString());
      audio.play('wastedSting');
      respawnPlayer(new THREE.Vector3(-30, 0, -30), 'Released from hospital');
      runtime.wasted = false;
      runtime.respawnTick = 0;
    }
  }

  // ── Fixed-step update ───────────────────────────────────────────
  while (accumulator >= FIXED_DT) {
    accumulator -= FIXED_DT;

    if (runtime.busted || runtime.wasted) continue;

    const actions = getActions();

    // Pause toggle
    if (actions.pause) {
      runtime.paused = !runtime.paused;
      hud.showPauseScreen(runtime.paused);
      if (runtime.paused) {
        document.exitPointerLock();
        const unlocked = missions.getUnlockedMissions();
        const defs = missions.getAllMissionDefs();
        const done = missions.getCompletedMissions();
        hud.updateMissionSelect(unlocked, defs, done);
        hud.showMissionSelect(true);
      } else {
        hud.showMissionSelect(false);
        domCanvas.requestPointerLock();
      }
      continue;
    }

    const mouse = consumeMouse();

    // Interact (enter / exit vehicle)
    if (actions.interact) {
      if (runtime.travelMode === 'walking') {
        const nearest = vehicles.getClosest(playerState.position);
        if (nearest) getIntoVehicle(nearest);
      } else {
        getOutOfVehicle();
      }
    }

    // Punch
    if (actions.punch && runtime.travelMode === 'walking') {
      audio.play('punch');
      const result = combat.tryPunch(
        playerState.position,
        playerState.yaw,
        walkers.getPedestrians()
      );
      if (result && result.hit && result.ped) {
        combat.handlePedHit(result.ped, walkers.getPedestrians());
        audio.play('pedYelp');

        const pedPos = result.ped.position;
        const missionPunch = missions.tryPunchMissionPed(playerState.position, {
          hit: true,
          pedPos,
        });

        // Crime heat (skip if mission-collect punch)
        if (!missionPunch) {
          wanted.addHeat(1, 'assault');
          const cops = police.getPolicePositions();
          for (const cp of cops) {
            const dx = cp.x - playerState.position.x;
            const dz = cp.z - playerState.position.z;
            if (Math.sqrt(dx * dx + dz * dz) < WANTED.policeHeatRadius) {
              wanted.addHeat(1, 'crime_witnessed');
              break;
            }
          }
        }
      }
    }

    // ── Player on foot ────────────────────────────────────────────
    if (runtime.travelMode === 'walking') {
      stepPlayer(actions, FIXED_DT);
      stepPlayerCam(followCamera, actions, mouse);
      playerState.health = combat.getPlayerHealthRaw();
    }

    // ── Driving ───────────────────────────────────────────────────
    if (runtime.travelMode === 'driving' && runtime.activeCar) {
      const v = runtime.activeCar;
      const { forward, backward, left, right, handbrake } = actions;

      // Throttle / brake
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

      // Steering
      const steerFade = Math.min(1, Math.abs(v.speed) / VEHICLE.steerFadeSpeed);
      const steer = VEHICLE.steerMax * (1 - steerFade * 0.6);
      if (left) {
        v.yaw += steer * Math.sign(v.speed || 0.1);
        v.steerAngle = Math.min(v.steerAngle + 0.1, 0.4);
      } else if (right) {
        v.yaw -= steer * Math.sign(v.speed || 0.1);
        v.steerAngle = Math.max(v.steerAngle - 0.1, -0.4);
      } else {
        v.steerAngle *= 0.85;
      }

      // Translate
      v.position.x -= Math.sin(v.yaw) * v.speed * FIXED_DT;
      v.position.z -= Math.cos(v.yaw) * v.speed * FIXED_DT;

      // Building collision
      for (const col of colliders) {
        const r = 2;
        if (v.position.x + r > col.minX && v.position.x - r < col.maxX &&
            v.position.z + r > col.minZ && v.position.z - r < col.maxZ) {
          const ox = Math.min(v.position.x + r - col.minX, col.maxX - (v.position.x - r));
          const oz = Math.min(v.position.z + r - col.minZ, col.maxZ - (v.position.z - r));
          if (ox < oz) {
            v.position.x = v.position.x < (col.minX + col.maxX) / 2
              ? col.minX - r : col.maxX + r;
          } else {
            v.position.z = v.position.z < (col.minZ + col.maxZ) / 2
              ? col.minZ - r : col.maxZ + r;
          }
          if (Math.abs(v.speed) > 3) audio.play('crash');
          v.speed *= 0.5;
        }
      }

      // Car-car collision
      for (const tc of traffic.getTrafficCars()) {
        const dx = v.position.x - tc.position.x;
        const dz = v.position.z - tc.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 3.5 && dist > 0) {
          const push = (3.5 - dist) / 2;
          v.position.x += (dx / dist) * push;
          v.position.z += (dz / dist) * push;
          if (Math.abs(v.speed) > 5) {
            audio.play('crash');
            wanted.addHeat(0.5, 'hit_vehicle');
          }
          v.speed *= 0.7;
        }
      }

      // Run over pedestrians
      for (const ped of walkers.getPedestrians()) {
        const dx = ped.position.x - v.position.x;
        const dz = ped.position.z - v.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 2.5 && Math.abs(v.speed) > 3) {
          audio.play('pedYelp');
          combat.handlePlayerDamage(10);
          wanted.addHeat(1, 'hit_pedestrian');
          ped.position.x += (dx / dist) * 3;
          ped.position.z += (dz / dist) * 3;
          ped.state = 'flee';
          ped.timer = 5;
        }
      }

      // Update mesh
      v.mesh.position.set(v.position.x, 0.6, v.position.z);
      v.mesh.rotation.y = v.yaw;
      if (v.mesh.userData && v.mesh.userData.frontWheels) {
        for (const fw of v.mesh.userData.frontWheels) {
          fw.rotation.y = v.steerAngle;
        }
      }

      audio.updateEngine(Math.abs(v.speed) / VEHICLE.maxSpeed);
      smoothFollowCamera(followCamera, v, mouse);

      // Sync player position to car for minimap
      playerState.position.copy(v.position);
      playerState.yaw = v.yaw;
    }

    // ── System updates ────────────────────────────────────────────
    trackerPos = runtime.travelMode === 'driving' && runtime.activeCar
      ? runtime.activeCar.position
      : playerState.position;

    traffic.update(FIXED_DT, trackerPos);

    const nearbyCar = runtime.travelMode === 'driving' ? runtime.activeCar : null;
    const spd = runtime.activeCar
      ? Math.abs(runtime.activeCar.speed)
      : playerState.speed;
    walkers.update(FIXED_DT, trackerPos, spd, nearbyCar);

    vehicles.update(FIXED_DT, actions, playerState, runtime);

    const cops = police.getPolicePositions();
    wanted.update(FIXED_DT, playerState, { policePositions: cops });

    const wLevel = wanted.getLevel();
    if (wLevel > 0) {
      police.spawnForWanted(wLevel, trackerPos, runtime.activeCar);
      audio.play('siren', { on: true });
    } else {
      police.despawnAll();
      audio.play('siren', { on: false });
    }
    police.update(FIXED_DT, trackerPos, runtime.travelMode === 'driving', runtime);

    combat.update(FIXED_DT, trackerPos, walkers.getPedestrians());

    const missionWasActive = missions.getMissionState()?.active;
    missions.update(FIXED_DT, runtime, trackerPos);
    const missionNow = missions.getMissionState();

    // Detect mission completion / failure for audio cues
    if (missionWasActive && (!missionNow || !missionNow.active)) {
      const ms = missions.getMissionState();
      if (ms && ms.completed.length > (audio._prevCompleted || 0)) {
        audio.play('missionOk');
        audio.play('cash');
      } else {
        audio.play('missionFail');
      }
      audio._prevCompleted = ms ? ms.completed.length : 0;
    } else if (!missionWasActive && missionNow && missionNow.active) {
      audio._prevCompleted = missionNow.completed.length;
    }

    // Wasted check
    if (combat.isWasted() && !runtime.wasted) {
      runtime.wasted = true;
      runtime.respawnTick = 0;
    }

    // Bust check
    if (police.isBustTriggered() && !runtime.busted && !runtime.wasted) {
      runtime.busted = true;
      runtime.respawnTick = 0;
    }

    // Police ram player on foot
    if (runtime.travelMode === 'walking') {
      for (const pc of police.getPoliceCars()) {
        const dx = pc.position.x - playerState.position.x;
        const dz = pc.position.z - playerState.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 2.5 && Math.abs(pc.speed) > 3) {
          combat.handlePlayerDamage(8);
        }
      }
    }

    // Interact prompt
    if (runtime.travelMode === 'walking') {
      const near = vehicles.getClosest(playerState.position);
      const activeMis = missions.getActiveMission();
      if (activeMis) {
        const obj = activeMis.def.objectives[activeMis.stepIdx];
        hud.showInteractPrompt(obj ? obj.text : '');
      } else {
        hud.showInteractPrompt(near ? 'Press E to enter' : '');
      }
    } else {
      hud.showInteractPrompt('Press E to exit');
    }

    // Sync HUD state
    runtime.cash = runtime.cash; // cash updated by missions/combat
    runtime.health = combat.getPlayerHealthRaw();
    runtime.wanted = wanted.getLevel();
    runtime.speed = runtime.activeCar
      ? Math.abs(runtime.activeCar.speed)
      : playerState.speed;

    // Auto-save on mission completion
    const mState = missions.getMissionState();
    if (mState && !mState.active) {
      const prev = runtime._lastSavedMissionCount || 0;
      if (mState.completed.length > prev) {
        persistence.save(runtime, playerState, wanted, combat, missions);
        runtime._lastSavedMissionCount = mState.completed.length;
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────
  renderer.render(worldScene, followCamera);

  // Beacon
  const mPos = missions.getActiveMarkerPos();
  refreshBeacon(mPos, rawDt);

  // HUD
  hud.update(runtime, rawDt);
  hud.setMuted(audio.isMuted());

  // Objective from mission step text
  const ms = missions.getMissionState();
  if (ms && ms.active) {
    hud.setObjective(ms.stepText);
  }

  // Overlays
  const bustedEl = document.getElementById('busted-overlay');
  if (bustedEl) bustedEl.style.display = runtime.busted ? 'flex' : 'none';

  const wastedEl = document.getElementById('wasted-overlay');
  if (wastedEl) wastedEl.style.display = runtime.wasted ? 'flex' : 'none';

  // Police nearby warning
  const polEl = document.getElementById('police-nearby');
  if (polEl) {
    const cops = police.getPolicePositions();
    let nearCop = false;
    for (const cp of cops) {
      const dx = cp.x - trackerPos.x;
      const dz = cp.z - trackerPos.z;
      if (Math.sqrt(dx * dx + dz * dz) < 50) {
        nearCop = true;
        break;
      }
    }
    if (nearCop && wanted.getLevel() > 0) {
      polEl.textContent = '⚠ POLICE NEARBY';
      polEl.style.opacity = '1';
    } else {
      polEl.style.opacity = '0';
    }
  }

  // Minimap
  const mapAnchor = runtime.travelMode === 'driving' && runtime.activeCar
    ? runtime.activeCar
    : playerState;
  const mapPos = { x: mapAnchor.position.x, z: mapAnchor.position.z, yaw: mapAnchor.yaw };
  const markers = missions.getMissionMarkerPositions();
  minimap.draw(
    mapPos, colliders,
    traffic.getTrafficCars(),
    walkers.getPedestrians(),
    vehicles.parkedCars,
    police.getPoliceCars(),
    police.getOfficers(),
    markers
  );
}

/* ------------------------------------------------------------------ */
/*  Resize                                                            */
/* ------------------------------------------------------------------ */

window.addEventListener('resize', () => {
  followCamera.aspect = window.innerWidth / window.innerHeight;
  followCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ */
/*  Kick off                                                          */
/* ------------------------------------------------------------------ */

requestAnimationFrame(tick);

window.__game = {
  runtime,
  player: playerState,
  scene: worldScene,
  camera: followCamera,
  renderer,
  missionSystem: missions,
  saveSystem: persistence,
  wantedSystem: wanted,
  combatSystem: combat,
};

requestAnimationFrame(() => {
  document.title = 'Solar Coast — READY';
});
