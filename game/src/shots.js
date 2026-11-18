/**
 * Deterministic screenshot staging.
 *
 * Read URL params ?shot=<scene>&seed=<n>.
 * Scenes: "start" (title over city), "roam" (player on street), "drive" (behind a car).
 * Fully deterministic: same seed => same frame.
 */

import { hashSeed } from './random.js';

/** Parse shot params from URL. Returns { scene: string|null, seed: number }. */
export function parseShotParams() {
  const params = new URLSearchParams(window.location.search);
  const scene = params.get('shot');
  const seed = parseInt(params.get('seed') || '1', 10);
  return { scene: scene || null, seed: isNaN(seed) ? 1 : seed };
}

/** Check if we are in a shot scene (auto-start, no title screen blocking). */
export function isShotScene(scene) {
  return scene === 'start' || scene === 'roam' || scene === 'drive';
}

/** Apply shot-specific camera and player positioning. */
export function setupShotScene(scene, seed, playerState, camera) {
  const rngSeed = hashSeed(scene + seed);

  if (scene === 'start') {
    // Title screen: camera looking over the city from an elevated vantage point
    // The city is visible through the semi-transparent title overlay
    camera.position.set(45, 30, 45);
    camera.lookAt(0, 8, 0);
    playerState.position.set(0, 0, 0);
  } else if (scene === 'roam') {
    // Player on a busy street corner at fixed camera angle
    playerState.position.set(7, 0, 7);
    playerState.yaw = 0.5;
    playerState.pitch = 0.2;
    playerState.cameraDistance = 10;

    camera.position.set(
      playerState.position.x + Math.sin(playerState.yaw) * Math.cos(playerState.pitch) * playerState.cameraDistance,
      playerState.position.y + 3 + Math.sin(playerState.pitch) * playerState.cameraDistance * 0.5,
      playerState.position.z + Math.cos(playerState.yaw) * Math.cos(playerState.pitch) * playerState.cameraDistance
    );
    camera.lookAt(playerState.position.x, playerState.position.y + 1.2, playerState.position.z);
  } else if (scene === 'drive') {
    // Player driving down a main street — camera behind the car
    playerState.position.set(0, 0, 0);
    playerState.yaw = 0;
    playerState.pitch = 0.1;
    playerState.cameraDistance = 12;

    camera.position.set(
      playerState.position.x,
      playerState.position.y + 4,
      playerState.position.z + 12
    );
    camera.lookAt(playerState.position.x, playerState.position.y + 1.5, playerState.position.z - 20);
  }
}
