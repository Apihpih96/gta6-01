import * as THREE from 'three';

export function createWeatherSystem(scene, seed) {
  const CYCLE_DURATION = 8 * 60; // 8 real minutes for a full 24h cycle
  const RAIN_PARTICLE_COUNT = 6000;

  // ---- internal clock ----
  let elapsed = 0; // real seconds elapsed
  let hour = 10; // start at 10:00 so the game opens in daylight

  // ---- lights created by this system ----
  const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.2);
  sunLight.castShadow = false;
  scene.add(sunLight);

  const moonLight = new THREE.DirectionalLight(0x8899cc, 0.0);
  scene.add(moonLight);

  // ambient that shifts with the cycle
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  // The scene ships without fog: create it here so lerpPalette can drive it.
  if (!scene.fog) {
    scene.fog = new THREE.FogExp2(0xc8ddf0, 0.0008);
  }

  // ---- rain system (inert until activated) ----
  const rainGeo = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(RAIN_PARTICLE_COUNT * 3);
  const rainVelocities = new Float32Array(RAIN_PARTICLE_COUNT);
  for (let i = 0; i < RAIN_PARTICLE_COUNT; i++) {
    rainPositions[i * 3] = (Math.random() - 0.5) * 120;
    rainPositions[i * 3 + 1] = Math.random() * 80;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 120;
    rainVelocities[i] = 0.8 + Math.random() * 0.4;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));

  const rainMat = new THREE.PointsMaterial({
    color: 0xaaaacc,
    size: 0.15,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });

  const rainPoints = new THREE.Points(rainGeo, rainMat);
  rainPoints.visible = false;
  scene.add(rainPoints);

  // ---- rain state ----
  let raining = false;
  let rainTimer = 180 + Math.random() * 120; // first rain no earlier than 3 min
  let rainDuration = 0;
  const rng = mulberry32(seed);

  // ---- palettes ----
  const palettes = {
    day: {
      bg: new THREE.Color(0x87ceeb),
      fog: 0.0008,
      ambient: 0.6,
      sunIntensity: 1.2,
      moonIntensity: 0.0,
      fogColor: new THREE.Color(0xc8ddf0),
    },
    dusk: {
      bg: new THREE.Color(0xe8843c),
      fog: 0.0015,
      ambient: 0.35,
      sunIntensity: 0.6,
      moonIntensity: 0.0,
      fogColor: new THREE.Color(0xd4a06a),
    },
    night: {
      bg: new THREE.Color(0x0a0e1a),
      fog: 0.0025,
      ambient: 0.12,
      sunIntensity: 0.0,
      moonIntensity: 0.5,
      fogColor: new THREE.Color(0x151a2e),
    },
    dawn: {
      bg: new THREE.Color(0xf0a868),
      fog: 0.0012,
      ambient: 0.3,
      sunIntensity: 0.4,
      moonIntensity: 0.05,
      fogColor: new THREE.Color(0xe0c090),
    },
  };

  let currentPalette = 'day';
  let rainActiveMessageShown = false;
  let rainClearMessageShown = false;

  function getTimeOfDay() {
    return hour;
  }

  function isRaining() {
    return raining;
  }

  function lerpPalette(t) {
    // t is 0-24 hour
    let target;
    if (t >= 6 && t < 8) {
      target = 'dawn';
    } else if (t >= 8 && t < 17) {
      target = 'day';
    } else if (t >= 17 && t < 19.5) {
      target = 'dusk';
    } else {
      target = 'night';
    }

    if (target !== currentPalette) {
      currentPalette = target;
    }

    const p = palettes[target];

    // sun position arcs across the sky
    const sunAngle = ((t - 6) / 12) * Math.PI; // rises at 6, sets at 18
    sunLight.position.set(
      Math.cos(sunAngle) * 100,
      Math.sin(sunAngle) * 100,
      50
    );
    sunLight.intensity = p.sunIntensity;

    moonLight.position.set(
      Math.cos(sunAngle + Math.PI) * 80,
      Math.sin(sunAngle + Math.PI) * 80,
      -30
    );
    moonLight.intensity = p.moonIntensity;

    scene.background = p.bg.clone();
    scene.fog.density = p.fog;
    scene.fog.color.copy(p.fogColor);
    ambientLight.intensity = p.ambient;
  }

  function updateRain(dt, cameraPos) {
    if (!raining) {
      rainPoints.visible = false;
      rainMat.opacity = 0;
      return;
    }

    rainPoints.visible = true;
    rainMat.opacity = 0.45;

    const pos = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_PARTICLE_COUNT; i++) {
      pos[i * 3 + 1] -= rainVelocities[i] * dt * 60;
      if (pos[i * 3 + 1] < 0) {
        pos[i * 3] = cameraPos.x + (Math.random() - 0.5) * 120;
        pos[i * 3 + 1] = 60 + Math.random() * 20;
        pos[i * 3 + 2] = cameraPos.z + (Math.random() - 0.5) * 120;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  function update(dt, cameraPos, hud) {
    elapsed += dt;
    hour = ((10 + (elapsed / CYCLE_DURATION) * 24) % 24);

    lerpPalette(hour);

    // ---- rain timer ----
    if (!raining) {
      rainTimer -= dt;
      if (rainTimer <= 0) {
        raining = true;
        rainDuration = 30 + rng() * 90; // 30s to 2min of rain
        rainActiveMessageShown = false;
      }
    } else {
      rainDuration -= dt;
      if (!rainActiveMessageShown && hud) {
        hud.showMessage('Rain started');
        rainActiveMessageShown = true;
      }
      if (rainDuration <= 0) {
        raining = false;
        rainTimer = 120 + rng() * 240; // 2-6 min until next rain
        rainClearMessageShown = false;
        if (hud && !rainClearMessageShown) {
          hud.showMessage('Rain cleared');
          rainClearMessageShown = true;
        }
      }
    }

    updateRain(dt, cameraPos);
  }

  return {
    update,
    getTimeOfDay,
    isRaining,
  };
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t >>> 0) / 4294967296);
  };
}
