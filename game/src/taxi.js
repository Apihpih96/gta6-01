import * as THREE from 'three';

export function createTaxiSystem(scene, runtime, vehicles, hud, audio) {
  const IDLE_DELAY = 15; // seconds of driving before a fare appears
  const PICKUP_RADIUS = 8; // units from the car to the pickup marker
  const DESTINATION_RADIUS = 8;
  const FARE_BASE = 200;
  const FARE_PER_UNIT = 3;
  const TIP_TIME_THRESHOLD = 40; // seconds remaining for a tip
  const TIP_AMOUNT = 100;
  const FARE_DURATION_BASE = 60;
  const FARE_DURATION_PER_DIST = 0.15;

  // ---- state ----
  let idleTimer = 0;
  let fareState = 'none'; // 'none' | 'pickup' | 'riding'
  let pickupMarker = null;
  let destinationMarker = null;
  let pickupPos = null;
  let destinationPos = null;
  let fareTimer = 0;
  let fareStartDistance = 0;
  let hudCooldown = 0;

  // ---- helpers ----
  function clearFare() {
    if (pickupMarker) {
      scene.remove(pickupMarker);
      pickupMarker.geometry.dispose();
      pickupMarker.material.dispose();
      pickupMarker = null;
    }
    if (destinationMarker) {
      scene.remove(destinationMarker);
      destinationMarker.geometry.dispose();
      destinationMarker.material.dispose();
      destinationMarker = null;
    }
    pickupPos = null;
    destinationPos = null;
    fareState = 'none';
    idleTimer = 0;
  }

  function randomRoadPosition() {
    // Pick a random block centre and offset to road level
    const gridSize = 74;
    const halfCity = 12;
    const bx = Math.floor(Math.random() * halfCity * 2) - halfCity;
    const bz = Math.floor(Math.random() * halfCity * 2) - halfCity;
    // Road centre between blocks: offset by half grid
    const x = bx * gridSize + gridSize / 2;
    const z = bz * gridSize + gridSize / 2;
    return new THREE.Vector3(x, 1.5, z);
  }

  function createBeacon(color) {
    const geo = new THREE.OctahedronGeometry(1.2, 0);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
  }

  function distToPickup(carPos) {
    if (!pickupPos) return Infinity;
    return carPos.distanceTo(pickupPos);
  }

  function distToDestination(carPos) {
    if (!destinationPos) return Infinity;
    return carPos.distanceTo(destinationPos);
  }

  function showMessage(text) {
    if (hud) {
      hud.showMessage(text);
    }
  }

  function update(dt, actions) {
    hudCooldown = Math.max(0, hudCooldown - dt);

    // No fares when paused, busted, or wasted
    if (runtime.paused || runtime.busted || runtime.wasted || !runtime.active) {
      if (fareState !== 'none') {
        clearFare();
      }
      return;
    }

    const isDriving = runtime.travelMode === 'driving';
    const car = runtime.activeCar;

    // If fare is active but player left the car, cancel it
    if (fareState !== 'none' && !isDriving) {
      showMessage('Fare cancelled — passenger left');
      clearFare();
      return;
    }

    if (!isDriving || !car) {
      idleTimer = 0;
      return;
    }

    const carPos = car.position || new THREE.Vector3();

    // ---- idle: wait for a fare to appear ----
    if (fareState === 'none') {
      idleTimer += dt;
      if (idleTimer >= IDLE_DELAY) {
        // Spawn a pickup
        pickupPos = randomRoadPosition();
        pickupMarker = createBeacon(0xffcc00);
        pickupMarker.position.copy(pickupPos);
        pickupMarker.position.y = 5;
        scene.add(pickupMarker);
        fareState = 'pickup';
        idleTimer = 0;
        if (hudCooldown <= 0) {
          showMessage('New fare! Drive to the yellow marker and press E');
          hudCooldown = 3;
        }
      }
      return;
    }

    // ---- pickup phase: drive near the marker and press E ----
    if (fareState === 'pickup') {
      // Animate pickup beacon
      if (pickupMarker) {
        pickupMarker.position.y = 5 + Math.sin(Date.now() * 0.004) * 0.5;
        pickupMarker.rotation.y += dt * 2;
      }

      if (distToPickup(carPos) < PICKUP_RADIUS && actions && actions.interact) {
        // Passenger boards
        scene.remove(pickupMarker);
        pickupMarker = null;

        destinationPos = randomRoadPosition();
        // Make sure destination is far enough from pickup
        while (destinationPos.distanceTo(pickupPos) < 80) {
          destinationPos = randomRoadPosition();
        }

        destinationMarker = createBeacon(0x00ff88);
        destinationMarker.position.copy(destinationPos);
        destinationMarker.position.y = 5;
        scene.add(destinationMarker);

        const dist = pickupPos.distanceTo(destinationPos);
        fareTimer = FARE_DURATION_BASE + dist * FARE_DURATION_PER_DIST;
        fareStartDistance = dist;

        fareState = 'riding';
        if (hudCooldown <= 0) {
          showMessage('Passenger on board — drive to the green marker!');
          hudCooldown = 3;
        }
      }
      return;
    }

    // ---- riding phase: reach destination before time runs out ----
    if (fareState === 'riding') {
      if (destinationMarker) {
        destinationMarker.position.y = 5 + Math.sin(Date.now() * 0.005) * 0.6;
        destinationMarker.rotation.y += dt * 2.5;
      }

      fareTimer -= dt;

      if (distToDestination(carPos) < DESTINATION_RADIUS) {
        // Success
        const distTraveled = fareStartDistance;
        let pay = FARE_BASE + Math.round(distTraveled * FARE_PER_UNIT);
        if (fareTimer > TIP_TIME_THRESHOLD) {
          pay += TIP_AMOUNT;
        }
        runtime.cash += pay;
        if (audio) {
          audio.play('cash');
        }
        if (hudCooldown <= 0) {
          showMessage(`Fare complete! +$${pay}`);
          hudCooldown = 3;
        }
        clearFare();
        return;
      }

      if (fareTimer <= 0) {
        showMessage('Fare expired — passenger left angry');
        clearFare();
        return;
      }
    }
  }

  return {
    update,
  };
}
