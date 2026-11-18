/**
 * Bootstrap: renderer, scene, camera, clock, game state, game loop
 * with fixed-step updates, city + player + HUD + minimap + shots wiring.
 *
 * Exposes window.__game for debugging.
 */

import * as THREE from 'three';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { createMinimap } from './minimap.js';
import { createHUD } from './hud.js';
import { bindInput, consumeMouse, getActions, consumeKey } from './input.js';
import { parseShotParams, isShotScene, setupShotScene } from './shots.js';
import { hashSeed } from './random.js';

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

// ---- Game state ----
const gameState = {
  running: false,
  paused: false,
  health: 100,
  cash: 0,
  wanted: 0,
  speed: 0,
  hasWeapon: false,
};

// ---- Shot params ----
const { scene: shotScene, seed: shotSeed } = parseShotParams();
const seed = shotSeed || hashSeed('solar-coast-1');

// ---- Build city ----
const { colliders, roadData } = buildCity(scene, seed);

// ---- Create player ----
const { mesh: playerMesh, state: playerState, update: updatePlayer, updateCamera } = createPlayer(scene, colliders);

// ---- Setup shot scene if applicable ----
if (isShotScene(shotScene)) {
  gameState.running = true;
  setupShotScene(shotScene, seed, playerState, camera);
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
    // No saved game yet — start new
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

// ---- Fixed-step game loop ----
const FIXED_DT = 1 / 60;
let accumulator = 0;
let lastTime = 0;
const clock = new THREE.Clock();

function gameLoop() {
  requestAnimationFrame(gameLoop);

  const dt = Math.min(clock.getDelta(), 0.1);
  accumulator += dt;

  if (!gameState.running || gameState.paused) {
    // Still render but don't update game logic
    renderer.render(scene, camera);
    return;
  }

  // Fixed-step updates
  while (accumulator >= FIXED_DT) {
    accumulator -= FIXED_DT;

    const actions = getActions();

    // Pause toggle
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

    // Mouse consumption
    const mouse = consumeMouse();

    // Update player
    updatePlayer(actions, FIXED_DT);

    // Update camera
    updateCamera(camera, actions, mouse);

    // Sync HUD state
    gameState.health = playerState.state.health;
    gameState.cash = playerState.state.cash;
    gameState.wanted = playerState.state.wanted;
    gameState.speed = playerState.state.speed;
  }

  // Render
  renderer.render(scene, camera);

  // Update HUD
  hud.update(gameState, dt);

  // Update minimap
  minimap.draw(playerState.state.position, colliders);
}

// ---- Resize handler ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Start loop ----
requestAnimationFrame(gameLoop);

// ---- Set document title with READY ----
document.title = 'Solar Coast — READY';

// ---- Debug handle ----
window.__game = { gameState, playerState, scene, camera, renderer };
