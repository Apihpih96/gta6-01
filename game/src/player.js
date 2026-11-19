/**
 * On-foot third-person character: low-poly stylised person, WASD movement
 * relative to camera, running, jumping with gravity, building collision with
 * slide-along, walk animation, faces movement direction.
 *
 * Also exports `buildPersonMesh` for reusing the same character style in
 * pedestrians and other NPCs.
 */

import * as THREE from 'three';
import { PLAYER, CAMERA } from './config.js';

/** Build a low-poly person mesh (group). Accepts optional colour overrides. */
export function buildPersonMesh(opts = {}) {
  const {
    shirtColor = 0x3366cc,
    pantsColor = 0x333355,
    skinColor = 0xd4a06a,
    shoeColor = 0x222222,
    hairColor = 0x221100,
  } = opts;

  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.8 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.6 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.9 });

  // Torso
  const torsoGeo = new THREE.BoxGeometry(0.6, 0.7, 0.35);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.position.y = 1.1;
  torso.castShadow = true;
  group.add(torso);

  // Head
  const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.65;
  head.castShadow = true;
  group.add(head);

  // Hair
  const hairGeo = new THREE.BoxGeometry(0.38, 0.15, 0.38);
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 1.85;
  group.add(hair);

  // Arms
  const armGeo = new THREE.BoxGeometry(0.18, 0.55, 0.18);
  const leftArm = new THREE.Mesh(armGeo, skinMat);
  leftArm.position.set(-0.42, 1.1, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, skinMat);
  rightArm.position.set(0.42, 1.1, 0);
  rightArm.castShadow = true;
  group.add(rightArm);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.22, 0.55, 0.22);
  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.15, 0.5, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.15, 0.5, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  // Shoes
  const shoeGeo = new THREE.BoxGeometry(0.24, 0.12, 0.35);
  const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
  leftShoe.position.set(-0.15, 0.15, 0.05);
  group.add(leftShoe);

  const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
  rightShoe.position.set(0.15, 0.15, 0.05);
  group.add(rightShoe);

  group.userData = { leftArm, rightArm, leftLeg, rightLeg };

  return group;
}

/** Create the player state and mesh. Returns { mesh, state, update, updateCamera }. */
export function createPlayer(scene, cityColliders) {
  const mesh = buildPersonMesh();
  scene.add(mesh);

  const state = {
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    onGround: true,
    health: 100,
    cash: 0,
    wanted: 0,
    speed: 0,
    yaw: 0,
    pitch: 0,
    cameraDistance: CAMERA.defaultDistance,
    walkCycle: 0,
  };

  // Find a valid spawn position (not inside a building)
  for (const col of cityColliders) {
    if (state.position.x > col.minX && state.position.x < col.maxX &&
        state.position.z > col.minZ && state.position.z < col.maxZ) {
      state.position.x = col.maxX + PLAYER.radius + 1;
      break;
    }
  }

  /** Resolve collision against building footprints with slide-along. */
  function resolveCollisions(pos) {
    for (const col of cityColliders) {
      if (pos.x + PLAYER.radius > col.minX && pos.x - PLAYER.radius < col.maxX &&
          pos.z + PLAYER.radius > col.minZ && pos.z - PLAYER.radius < col.maxZ) {
        const overlapX = Math.min(pos.x + PLAYER.radius - col.minX, col.maxX - (pos.x - PLAYER.radius));
        const overlapZ = Math.min(pos.z + PLAYER.radius - col.minZ, col.maxZ - (pos.z - PLAYER.radius));
        if (overlapX < overlapZ) {
          pos.x = pos.x < (col.minX + col.maxX) / 2 ? col.minX - PLAYER.radius : col.maxX + PLAYER.radius;
        } else {
          pos.z = pos.z < (col.minZ + col.maxZ) / 2 ? col.minZ - PLAYER.radius : col.maxZ + PLAYER.radius;
        }
      }
    }
  }

  /** Update player position and animation from actions. */
  function update(actions, dt) {
    const { forward, backward, left, right, run, jump } = actions;

    const moveDir = new THREE.Vector3();
    if (forward) moveDir.z -= 1;
    if (backward) moveDir.z += 1;
    if (left) moveDir.x -= 1;
    if (right) moveDir.x += 1;

    const isMoving = moveDir.lengthSq() > 0;
    if (isMoving) {
      moveDir.normalize();
      const cos = Math.cos(state.yaw);
      const sin = Math.sin(state.yaw);
      const rx = moveDir.x * cos - moveDir.z * sin;
      const rz = moveDir.x * sin + moveDir.z * cos;
      moveDir.set(rx, 0, rz);
    }

    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    state.speed = isMoving ? speed : 0;

    if (isMoving) {
      state.position.x += moveDir.x * speed * dt;
      state.position.z += moveDir.z * speed * dt;
    }

    if (jump && state.onGround) {
      state.velocity.y = PLAYER.jumpForce;
      state.onGround = false;
    }

    state.velocity.y -= PLAYER.gravity * dt;
    state.position.y += state.velocity.y * dt;

    if (state.position.y <= 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.onGround = true;
    }

    resolveCollisions(state.position);

    if (isMoving) {
      state.yaw = Math.atan2(moveDir.x, moveDir.z);
    }

    if (isMoving && state.onGround) {
      state.walkCycle += dt * (run ? 12 : 8);
    } else {
      state.walkCycle = 0;
    }

    const { leftArm, rightArm, leftLeg, rightLeg } = mesh.userData;
    const swing = Math.sin(state.walkCycle) * 0.5;
    leftArm.rotation.x = swing;
    rightArm.rotation.x = -swing;
    leftLeg.rotation.x = -swing;
    rightLeg.rotation.x = swing;

    mesh.position.copy(state.position);
    mesh.rotation.y = isMoving ? Math.atan2(moveDir.x, moveDir.z) : state.yaw;
  }

  /** Update the camera to orbit around the player. */
  function updateCamera(camera, actions, mouse) {
    state.yaw += mouse.dx * CAMERA.sensitivity;
    state.pitch -= mouse.dy * CAMERA.sensitivity;
    state.pitch = Math.max(-0.5, Math.min(0.8, state.pitch));

    // Smooth zoom: wheel input is accumulated per frame; apply a fraction
    state.cameraDistance += mouse.wheel * 0.005;
    state.cameraDistance = Math.max(CAMERA.minDistance, Math.min(CAMERA.maxDistance, state.cameraDistance));

    const dist = state.cameraDistance;
    const cosYaw = Math.cos(state.yaw);
    const sinYaw = Math.sin(state.yaw);
    const cosPitch = Math.cos(state.pitch);

    const camX = state.position.x + sinYaw * cosPitch * dist;
    const camY = state.position.y + CAMERA.heightOffset + Math.sin(state.pitch) * dist * 0.5;
    const camZ = state.position.z + cosYaw * cosPitch * dist;

    // Smooth camera movement to reduce jitter during fast mouse movements
    const smoothing = 0.6;
    camera.position.x += (camX - camera.position.x) * smoothing;
    camera.position.y += (camY - camera.position.y) * smoothing;
    camera.position.z += (camZ - camera.position.z) * smoothing;
    camera.lookAt(state.position.x, state.position.y + 1.2, state.position.z);
  }

  return { mesh, state, update, updateCamera };
}
