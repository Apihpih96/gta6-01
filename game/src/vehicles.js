/**
 * Vehicles: low-poly car meshes, parked-car placement, enter/exit logic,
 * arcade driving physics.
 *
 * Exports:
 *   buildCarMesh(style, color) — creates a car Three.js group
 *   createVehicleSystem(scene, seed, colliders, roadData) — returns { create, getClosest, update, vehicles, parkedCars }
 */

import * as THREE from 'three';
import { VEHICLE, VEHICLE_COLORS, PALETTE } from './config.js';
import { createRNG, randInt, randFloat, randChoice } from './random.js';

// Shared geometries
let sharedGeos = null;
function getGeos() {
  if (sharedGeos) return sharedGeos;
  sharedGeos = {
    box: new THREE.BoxGeometry(1, 1, 1),
    wheel: new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8),
    window: new THREE.BoxGeometry(1, 1, 1),
    headlight: new THREE.BoxGeometry(0.3, 0.2, 0.1),
    taillight: new THREE.BoxGeometry(0.3, 0.2, 0.1),
  };
  return sharedGeos;
}

/** Build a car mesh from boxes. `style` is 'sedan'|'hatchback'|'pickup'|'van'. */
export function buildCarMesh(style = 'sedan', color = 0xcc2222) {
  const group = new THREE.Group();
  const geos = getGeos();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x88bbdd, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.6 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 0.3 });
  const taillightMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 0.3 });

  let bodyW, bodyH, bodyD, cabinW, cabinH, cabinD, cabinY;

  switch (style) {
    case 'sedan':
      bodyW = 1.8; bodyH = 0.6; bodyD = 4.2;
      cabinW = 1.5; cabinH = 0.6; cabinD = 2.0;
      cabinY = bodyH + cabinH * 0.5;
      break;
    case 'hatchback':
      bodyW = 1.7; bodyH = 0.65; bodyD = 3.5;
      cabinW = 1.4; cabinH = 0.65; cabinD = 1.6;
      cabinY = bodyH + cabinH * 0.5;
      break;
    case 'pickup':
      bodyW = 2.0; bodyH = 0.55; bodyD = 5.0;
      cabinW = 1.7; cabinH = 0.7; cabinD = 1.5;
      cabinY = bodyH + cabinH * 0.5;
      break;
    case 'van':
      bodyW = 2.0; bodyH = 0.7; bodyD = 4.5;
      cabinW = 1.8; cabinH = 0.9; cabinD = 1.8;
      cabinY = bodyH + cabinH * 0.5;
      break;
    default:
      bodyW = 1.8; bodyH = 0.6; bodyD = 4.2;
      cabinW = 1.5; cabinH = 0.6; cabinD = 2.0;
      cabinY = bodyH + cabinH * 0.5;
  }

  // Body
  const body = new THREE.Mesh(geos.box, bodyMat);
  body.scale.set(bodyW, bodyH, bodyD);
  body.position.y = bodyH * 0.5 + 0.3; // wheels radius offset
  body.castShadow = true;
  group.add(body);

  // Cabin / roof
  const cabin = new THREE.Mesh(geos.box, style === 'pickup' ? bodyMat : windowMat);
  cabin.scale.set(cabinW, cabinH, cabinD);
  cabin.position.set(0, cabinY + 0.3, -bodyD * 0.08);
  cabin.castShadow = true;
  group.add(cabin);

  // Pickup bed
  if (style === 'pickup') {
    const bed = new THREE.Mesh(geos.box, bodyMat.clone());
    bed.material.color.set(0x333333);
    bed.scale.set(bodyW - 0.2, 0.3, bodyD * 0.4);
    bed.position.set(0, bodyH + 0.15 + 0.3, bodyD * 0.2);
    group.add(bed);
  }

  // Wheels
  const wheelPositions = [
    [-bodyW * 0.45, 0.3, -bodyD * 0.3],
    [bodyW * 0.45, 0.3, -bodyD * 0.3],
    [-bodyW * 0.45, 0.3, bodyD * 0.3],
    [bodyW * 0.45, 0.3, bodyD * 0.3],
  ];
  const wheels = [];
  for (const [wx, wy, wz] of wheelPositions) {
    const wheel = new THREE.Mesh(geos.wheel, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, wy, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  // Front wheels (first two) are steerable — store reference
  group.userData = { wheels, frontWheels: wheels.slice(0, 2), body, cabin };

  // Headlights
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(geos.headlight, headlightMat);
    hl.position.set(side * bodyW * 0.35, bodyH * 0.5 + 0.3, -bodyD * 0.5 - 0.05);
    group.add(hl);
  }

  // Taillights
  for (const side of [-1, 1]) {
    const tl = new THREE.Mesh(geos.taillight, taillightMat);
    tl.position.set(side * bodyW * 0.35, bodyH * 0.5 + 0.3, bodyD * 0.5 + 0.05);
    group.add(tl);
  }

  return group;
}

/** Create the vehicle system. */
export function createVehicleSystem(scene, seed, colliders, roadData) {
  const rng = createRNG(seed + 42);
  const styles = ['sedan', 'hatchback', 'pickup', 'van'];
  const vehicles = []; // active drivable vehicles
  const parkedCars = []; // parked, stealable cars

  // Place parked cars deterministically along roads
  for (const road of roadData) {
    if (rng() > 0.25) continue; // 25% chance of a parked car per road segment
    const midX = (road.minX + road.maxX) / 2;
    const midZ = (road.minZ + road.maxZ) / 2;
    const len = road.axis === 'x' ? road.maxX - road.minX : road.maxZ - road.minZ;
    if (len < 20) continue;

    const style = randChoice(rng, styles);
    const color = randChoice(rng, VEHICLE_COLORS);
    const mesh = buildCarMesh(style, color);

    if (road.axis === 'x') {
      mesh.position.set(midX, 0.6, road.minZ + 1.5);
      mesh.rotation.y = rng() > 0.5 ? 0 : Math.PI;
    } else {
      mesh.position.set(road.minX + 1.5, 0.6, midZ);
      mesh.rotation.y = rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }

    scene.add(mesh);
    parkedCars.push({
      mesh,
      position: mesh.position.clone(),
      yaw: mesh.rotation.y,
      style,
      color,
      occupied: false,
    });
  }

  /** Get closest parked car to a position, within interact radius. */
  function getClosest(pos) {
    let best = null;
    let bestDist = VEHICLE.interactRadius;
    for (const car of parkedCars) {
      if (car.occupied) continue;
      const dx = pos.x - car.position.x;
      const dz = pos.z - car.position.z;
      // Squared-distance check first to avoid sqrt for far-away cars
      if (dx * dx + dz * dz >= bestDist * bestDist) continue;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = car;
      }
    }
    return best;
  }

  /** Create an active vehicle (for traffic or player driving). */
  function createCar(position, yaw, color) {
    const style = randChoice(rng, styles);
    const c = color || randChoice(rng, VEHICLE_COLORS);
    const mesh = buildCarMesh(style, c);
    mesh.position.copy(position);
    mesh.rotation.y = yaw;
    scene.add(mesh);

    const v = {
      mesh,
      position: mesh.position.clone(),
      yaw,
      speed: 0,
      style,
      color: c,
      isPlayer: false,
      steerAngle: 0,
    };
    vehicles.push(v);
    return v;
  }

  /** Update all active vehicles (physics, collision). */
  function update(dt, playerActions, playerState, gameState) {
    for (const v of vehicles) {
      if (v.isPlayer) {
        // Player driving
        const { forward, backward, left, right, handbrake } = playerActions;

        if (forward) {
          v.speed = Math.min(v.speed + VEHICLE.acceleration * dt, VEHICLE.maxSpeed);
        } else if (backward) {
          v.speed = Math.max(v.speed - VEHICLE.brakeForce * dt, -VEHICLE.reverseSpeed);
        } else {
          v.speed *= VEHICLE.drag;
          if (Math.abs(v.speed) < 0.1) v.speed = 0;
        }

        if (handbrake) {
          v.speed *= Math.pow(0.9, dt * 60);
        }

        // Speed-sensitive steering — reduced handbrake slide for more control
        const steerFactor = Math.min(1, Math.abs(v.speed) / VEHICLE.steerFadeSpeed);
        const steerAmount = VEHICLE.steerMax * (1 - steerFactor * 0.5); // less falloff at high speed
        if (left) v.yaw += steerAmount * Math.sign(v.speed || 0.1);
        if (right) v.yaw -= steerAmount * Math.sign(v.speed || 0.1);

      } else {
        // Traffic AI — simple forward motion (traffic.js handles steering)
      }

      // Move
      v.position.x -= Math.sin(v.yaw) * v.speed * dt;
      v.position.z -= Math.cos(v.yaw) * v.speed * dt;

      // Building collision: slide
      for (const col of colliders) {
        const carR = 2;
        if (v.position.x + carR > col.minX && v.position.x - carR < col.maxX &&
            v.position.z + carR > col.minZ && v.position.z - carR < col.maxZ) {
          // Push out and lose speed
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

      // Car-car collision
      for (const other of vehicles) {
        if (other === v) continue;
        const dx = v.position.x - other.position.x;
        const dz = v.position.z - other.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 3.5 && dist > 0) {
          const push = (3.5 - dist) / 2;
          v.position.x += (dx / dist) * push;
          v.position.z += (dz / dist) * push;
          v.speed *= 0.7;
        }
      }

      // Update mesh
      v.mesh.position.set(v.position.x, 0.6, v.position.z);
      v.mesh.rotation.y = v.yaw;

      // Steer visual on front wheels
      if (v.mesh.userData && v.mesh.userData.frontWheels) {
        const visualSteer = v.isPlayer ? v.steerAngle * 3 : 0;
        for (const fw of v.mesh.userData.frontWheels) {
          fw.rotation.y = visualSteer;
        }
      }
    }

    // Remove despawned vehicles (traffic does this)
  }

  return { createCar, getClosest, update, vehicles, parkedCars };
}
