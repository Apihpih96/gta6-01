/**
 * Traffic AI: cars driving on the road grid, keeping gaps, spawning/despawning.
 * Deterministic from the seed. Uses roadData from city.js.
 */

import * as THREE from 'three';
import { TRAFFIC, VEHICLE_COLORS } from './config.js';
import { createRNG, randFloat, randChoice, randInt } from './random.js';
import { buildCarMesh } from './vehicles.js';

/** Create the traffic system. */
export function createTrafficSystem(scene, seed, roadData, colliders) {
  const rng = createRNG(seed + 99);
  const trafficCars = []; // { mesh, position, yaw, speed, road, t, axis }

  // Pre-select road segments for spawning
  const roadSegments = roadData.filter(r => {
    const len = r.axis === 'x' ? r.maxX - r.minX : r.maxZ - r.minZ;
    return len > 20; // only use substantial road segments
  });

  if (roadSegments.length === 0) return { update: () => {}, getTrafficCars: () => [] };

  /** Spawn a single traffic car. */
  function spawnCar(playerPos) {
    if (trafficCars.length >= TRAFFIC.maxCars) return;

    // Pick a road segment
    const road = randChoice(rng, roadSegments);
    const len = road.axis === 'x' ? road.maxX - road.minX : road.maxZ - road.minZ;
    const mid = len * 0.5;

    // Position along the road (with some offset for direction)
    const t = rng();
    const direction = rng() > 0.5 ? 1 : -1;

    const pos = new THREE.Vector3();
    let yaw;

    if (road.axis === 'x') {
      pos.x = road.minX + t * len;
      pos.z = road.minZ + (direction > 0 ? roadWidthOffset() : -roadWidthOffset());
      yaw = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      pos.z = road.minZ + t * len;
      pos.x = road.minX + (direction > 0 ? roadWidthOffset() : -roadWidthOffset());
      yaw = direction > 0 ? 0 : Math.PI;
    }

    // Check not too close to player
    const dx = pos.x - playerPos.x;
    const dz = pos.z - playerPos.z;
    if (Math.sqrt(dx * dx + dz * dz) < TRAFFIC.spawnDistance * 0.5) return;

    // Create mesh
    const style = randChoice(rng, ['sedan', 'hatchback', 'pickup', 'van']);
    const color = randChoice(rng, VEHICLE_COLORS);
    const mesh = buildCarMesh(style, color);
    mesh.position.copy(pos);
    mesh.position.y = 0.6;
    mesh.rotation.y = yaw;
    scene.add(mesh);

    trafficCars.push({
      mesh,
      position: pos.clone(),
      yaw,
      speed: TRAFFIC.speed + randFloat(rng, -TRAFFIC.speedVariation, TRAFFIC.speedVariation),
      road,
      t,
      direction,
      axis: road.axis,
      style,
      color,
    });
  }

  function roadWidthOffset() {
    return 2.5; // lane offset from road centre
  }

  /** Update traffic cars: move, check gaps, despawn far cars, spawn new ones. */
  function update(dt, playerPos) {
    // Despawn far cars
    for (let i = trafficCars.length - 1; i >= 0; i--) {
      const car = trafficCars[i];
      const dx = car.position.x - playerPos.x;
      const dz = car.position.z - playerPos.z;
      if (Math.sqrt(dx * dx + dz * dz) > TRAFFIC.despawnDistance) {
        scene.remove(car.mesh);
        trafficCars.splice(i, 1);
      }
    }

    // Spawn new cars
    if (trafficCars.length < TRAFFIC.maxCars && rng() < 0.05) {
      spawnCar(playerPos);
    }

    // Update each car
    for (const car of trafficCars) {
      // Check gap to car ahead
      let gapClear = true;
      for (const other of trafficCars) {
        if (other === car) continue;
        if (other.axis !== car.axis || other.road !== car.road) continue;
        if (other.direction !== car.direction) continue;

        const dx = other.position.x - car.position.x;
        const dz = other.position.z - car.position.z;
        const dist = car.axis === 'x'
          ? car.direction > 0 ? dx : -dx
          : car.direction > 0 ? dz : -dz;

        if (dist > 0 && dist < TRAFFIC.minGap) {
          gapClear = false;
          // Slow down to match gap
          car.speed = Math.max(car.speed * 0.95, 1);
          break;
        }
      }

      if (gapClear) {
        // Accelerate back to target speed
        const targetSpeed = TRAFFIC.speed + randFloat(rng, -1, 1);
        car.speed += (targetSpeed - car.speed) * dt * 0.5;
      }

      // Move along road
      car.position.x -= Math.sin(car.yaw) * car.speed * dt;
      car.position.z -= Math.cos(car.yaw) * car.speed * dt;
      car.t += (car.speed * dt * car.direction) / (car.axis === 'x'
        ? car.road.maxX - car.road.minX
        : car.road.maxZ - car.road.minZ);

      // Wrap around road (simple respawn at other end)
      if (car.t > 1.2 || car.t < -0.2) {
        const len = car.axis === 'x'
          ? car.road.maxX - car.road.minX
          : car.road.maxZ - car.road.minZ;
        if (car.axis === 'x') {
          car.position.x = car.road.minX + ((car.t % 1 + 1) % 1) * len;
        } else {
          car.position.z = car.road.minZ + ((car.t % 1 + 1) % 1) * len;
        }
        car.t = ((car.t % 1 + 1) % 1);
      }

      // Update mesh
      car.mesh.position.copy(car.position);
      car.mesh.position.y = 0.6;
      car.mesh.rotation.y = car.yaw;
    }
  }

  function getTrafficCars() {
    return trafficCars;
  }

  return { update, getTrafficCars };
}
