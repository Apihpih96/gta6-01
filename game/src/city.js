/**
 * Procedural sun-soaked coastal city built with three.js.
 *
 * Deterministic from a seed. Uses InstancedMesh for buildings, palm trees,
 * and street lamps to keep draw calls low.
 *
 * Features: downtown core (taller buildings near centre), beach props along
 * the ocean edge, height clusters, and dashed road markings.
 */

import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { createRNG, randInt, randFloat, randChoice } from './random.js';

/** Create a canvas texture for building windows. */
function makeWindowTexture(rng, width = 256, height = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const wallColor = randChoice(rng, PALETTE.buildingBase);
  ctx.fillStyle = '#' + wallColor.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, width, height);

  const winW = 24;
  const winH = 32;
  const padX = 32;
  const padY = 24;
  const cols = Math.floor((width - padX * 2) / (winW + 8));
  const rows = Math.floor((height - padY * 2) / (winH + 12));
  const startX = (width - cols * (winW + 8) + 8) / 2;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = startX + col * (winW + 8);
      const y = padY + row * (winH + 12);
      const lit = rng() > 0.3;
      ctx.fillStyle = lit ? '#' + PALETTE.windowLit.toString(16).padStart(6, '0') : '#' + PALETTE.windowDark.toString(16).padStart(6, '0');
      ctx.fillRect(x, y, winW, winH);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/** Shared materials (created once, reused across instances). */
let sharedMaterials = null;

function getSharedMaterials() {
  if (sharedMaterials) return sharedMaterials;
  sharedMaterials = {
    building: new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.9 }),
    road: new THREE.MeshStandardMaterial({ color: PALETTE.road, roughness: 0.95 }),
    roadLine: new THREE.MeshStandardMaterial({ color: PALETTE.roadLine, roughness: 0.8 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 0.9 }),
    sand: new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1.0 }),
    sea: new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.3, metalness: 0.1 }),
    palmTrunk: new THREE.MeshStandardMaterial({ color: PALETTE.palmTrunk, roughness: 0.9 }),
    palmLeaf: new THREE.MeshStandardMaterial({ color: PALETTE.palmLeaf, roughness: 0.8 }),
    lampPost: new THREE.MeshStandardMaterial({ color: PALETTE.lampPost, roughness: 0.5, metalness: 0.3 }),
    lampLight: new THREE.MeshStandardMaterial({ color: PALETTE.lampLight, emissive: PALETTE.lampLight, emissiveIntensity: 0.5 }),
  };
  return sharedMaterials;
}

/** Build the city scene. Returns { colliders, roadData }. */
export function buildCity(scene, seed) {
  const rng = createRNG(seed);
  const mats = getSharedMaterials();
  const { blocksPerAxis, blockSize, roadWidth, sidewalkWidth } = CITY;
  const halfSize = blocksPerAxis * (blockSize + roadWidth) * 0.5;
  const totalBlock = blockSize + roadWidth;
  const centre = halfSize; // world centre of the grid

  // ---- Sky gradient background ----
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 512;
  skyCanvas.height = 512;
  const skyCtx = skyCanvas.getContext('2d');
  const grad = skyCtx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#' + PALETTE.skyTop.toString(16).padStart(6, '0'));
  grad.addColorStop(1, '#' + PALETTE.skyBottom.toString(16).padStart(6, '0'));
  skyCtx.fillStyle = grad;
  skyCtx.fillRect(0, 0, 512, 512);
  // Sun
  skyCtx.fillStyle = '#' + PALETTE.sun.toString(16).padStart(6, '0');
  skyCtx.beginPath();
  skyCtx.arc(380, 120, 40, 0, Math.PI * 2);
  skyCtx.fill();
  // Clouds
  skyCtx.fillStyle = 'rgba(255,255,255,0.3)';
  for (let i = 0; i < 5; i++) {
    const cx = randFloat(rng, 50, 460);
    const cy = randFloat(rng, 30, 180);
    skyCtx.beginPath();
    skyCtx.ellipse(cx, cy, randFloat(rng, 30, 80), randFloat(rng, 10, 25), 0, 0, Math.PI * 2);
    skyCtx.fill();
  }
  // Distant skyline silhouette
  skyCtx.fillStyle = 'rgba(80,60,40,0.25)';
  for (let x = 0; x < 512; x += 12) {
    const h = randFloat(rng, 5, 40);
    skyCtx.fillRect(x, 512 - h - 20, 10, h);
  }
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  scene.background = skyTex;

  // ---- Lighting ----
  const ambient = new THREE.AmbientLight(0xffeedd, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff0c0, 1.2);
  sun.position.set(50, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x87ceeb, 0xc2b280, 0.4);
  scene.add(hemi);

  // ---- Ground plane (sand/beach base) ----
  const groundGeo = new THREE.PlaneGeometry(halfSize * 4, halfSize * 4);
  const ground = new THREE.Mesh(groundGeo, mats.sand);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- Sea plane on +X side ----
  const seaGeo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 3);
  const sea = new THREE.Mesh(seaGeo, mats.sea);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(halfSize + halfSize, -0.1, 0);
  scene.add(sea);

  // ---- Collision + road data ----
  const colliders = [];
  const roadData = [];

  // Geometry caches
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  buildingGeo.translate(0, 0.5, 0);
  const palmTrunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 1, 6);
  palmTrunkGeo.translate(0, 0.5, 0);
  const palmLeafGeo = new THREE.SphereGeometry(1, 6, 4);
  const lampPostGeo = new THREE.CylinderGeometry(0.05, 0.08, 1, 4);
  lampPostGeo.translate(0, 0.5, 0);
  const lampLightGeo = new THREE.SphereGeometry(0.2, 6, 4);
  const roadGeo = new THREE.PlaneGeometry(1, 1);
  roadGeo.rotateX(-Math.PI / 2);
  const roadLineGeo = new THREE.PlaneGeometry(1, 0.15);
  roadLineGeo.rotateX(-Math.PI / 2);
  const sidewalkGeo = new THREE.PlaneGeometry(1, 1);
  sidewalkGeo.rotateX(-Math.PI / 2);

  const roadMeshes = [];
  const sidewalkMeshes = [];
  const roadLineMeshes = [];

  // Instance buffers
  const buildingMatrices = [];
  const buildingColors = [];
  const palmTrunkMatrices = [];
  const palmLeafMatrices = [];
  const lampMatrices = [];
  const lampLightMatrices = [];

  // Beach props (umbrellas, lounge chairs — placed later)
  const beachUmbrellaGeo = new THREE.ConeGeometry(1.2, 0.8, 8);
  const beachUmbrellaMat = new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.9 });
  const beachUmbrellaPoleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 4);
  const beachUmbrellaPoleMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 });
  const beachMeshes = [];

  // ---- Height profile: distance-based multiplier ----
  // Downtown core: buildings near centre are taller, suburban edges are shorter
  function heightMultiplier(wx, wz) {
    const dx = (wx - centre) / halfSize;
    const dz = (wz - centre) / halfSize;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // Peak at centre (1.8x), falls to 0.5 at edges
    return 0.5 + 1.3 * Math.exp(-dist * dist * 2);
  }

  // ---- Build grid ----
  for (let bx = 0; bx < blocksPerAxis; bx++) {
    for (let bz = 0; bz < blocksPerAxis; bz++) {
      const cx = -halfSize + bx * totalBlock + totalBlock * 0.5;
      const cz = -halfSize + bz * totalBlock + totalBlock * 0.5;

      // Beach edge: skip buildings at max X
      if (bx === blocksPerAxis - 1 && CITY.beachEdge) {
        // Place beach props instead
        const beachRng = createRNG(seed + bx * 9999 + bz * 7777);
        for (let p = 0; p < 3; p++) {
          const ux = cx + randFloat(beachRng, -blockSize / 2, blockSize / 2);
          const uz = cz + randFloat(beachRng, -blockSize / 2, blockSize / 2);
          // Umbrella pole
          const pole = new THREE.Mesh(beachUmbrellaPoleGeo, beachUmbrellaPoleMat);
          pole.position.set(ux, 0.5, uz);
          beachMeshes.push(pole);
          // Umbrella canopy
          const canopy = new THREE.Mesh(beachUmbrellaGeo, beachUmbrellaMat.clone());
          canopy.material.color = new THREE.Color(randChoice(beachRng, [0xff4444, 0x44aa44, 0x4488ff, 0xffaa22]));
          canopy.position.set(ux, 1.4, uz);
          beachMeshes.push(canopy);
        }
        continue;
      }

      // Road surfaces
      const roadY = 0.02;
      const roadZTop = cz - blockSize / 2 - roadWidth / 2;
      const roadXLeft = cx - blockSize / 2 - roadWidth / 2;

      // Road mesh for top edge (X-direction road)
      const roadMeshTop = new THREE.Mesh(roadGeo, mats.road);
      roadMeshTop.position.set(cx, roadY, roadZTop);
      roadMeshTop.scale.set(blockSize + roadWidth, 1, roadWidth);
      roadMeshTop.receiveShadow = true;
      roadMeshes.push(roadMeshTop);

      // Road mesh for left edge (Z-direction road)
      const roadMeshLeft = new THREE.Mesh(roadGeo, mats.road);
      roadMeshLeft.position.set(roadXLeft, roadY, cz);
      roadMeshLeft.scale.set(roadWidth, 1, blockSize + roadWidth);
      roadMeshLeft.receiveShadow = true;
      roadMeshes.push(roadMeshLeft);

      // Lane markings
      const numDashes = Math.floor(blockSize / 4);
      for (let d = 0; d < numDashes; d++) {
        const dash = new THREE.Mesh(roadLineGeo, mats.roadLine);
        dash.position.set(
          cx - blockSize / 2 + (d + 0.5) * (blockSize / numDashes),
          roadY + 0.01,
          roadZTop
        );
        dash.scale.set(2, 1, 1);
        roadLineMeshes.push(dash);

        const dashV = new THREE.Mesh(roadLineGeo, mats.roadLine);
        dashV.position.set(
          roadXLeft,
          roadY + 0.01,
          cz - blockSize / 2 + (d + 0.5) * (blockSize / numDashes)
        );
        dashV.scale.set(1, 1, 2);
        roadLineMeshes.push(dashV);
      }

      // Sidewalks
      const swY = 0.06;
      const swMesh = new THREE.Mesh(sidewalkGeo, mats.sidewalk);
      swMesh.position.set(cx, swY, cz - blockSize / 2 - sidewalkWidth / 2);
      swMesh.scale.set(blockSize, 1, sidewalkWidth);
      swMesh.receiveShadow = true;
      sidewalkMeshes.push(swMesh);

      // Buildings on this block
      const blockRng = createRNG(seed + bx * 1000 + bz);
      const numBuildings = randInt(blockRng, 1, 3);
      const bSpacing = blockSize / numBuildings;

      for (let b = 0; b < numBuildings; b++) {
        const bWidth = randFloat(blockRng, bSpacing * 0.5, bSpacing * 0.85);
        const bDepth = randFloat(blockRng, bSpacing * 0.5, bSpacing * 0.85);
        const baseHeight = randFloat(blockRng, 6, 45);
        const hMult = heightMultiplier(cx + (-blockSize / 2 + bSpacing * b + bSpacing * 0.5), cz);
        // Clamp building height to avoid extreme towers at centre
        const bHeight = Math.min(80, baseHeight * hMult);
        const bOffX = -blockSize / 2 + sidewalkWidth + bSpacing * b + bSpacing * 0.5;
        const bOffZ = -blockSize / 2 + sidewalkWidth + bSpacing * 0.5;

        const worldX = cx + bOffX;
        const worldZ = cz + bOffZ;

        const mat = new THREE.Matrix4();
        mat.makeTranslation(worldX, 0, worldZ);
        mat.scale(new THREE.Vector3(bWidth, bHeight, bDepth));
        buildingMatrices.push(mat);

        const wallColor = randChoice(blockRng, PALETTE.buildingBase);
        buildingColors.push(wallColor);

        colliders.push({
          minX: worldX - bWidth / 2,
          maxX: worldX + bWidth / 2,
          minZ: worldZ - bDepth / 2,
          maxZ: worldZ + bDepth / 2,
        });

        // Palm trees — placed near buildings, clamped to block interior (not on roads)
        // Ensure palm is not inside the building footprint itself
        if (blockRng() > 0.5) {
          let palmX = worldX + randFloat(blockRng, bWidth * 0.5, bWidth * 0.8);
          let palmZ = worldZ + randFloat(blockRng, -bDepth * 0.2, bDepth * 0.2);
          // Clamp to block interior (2 units from edge to avoid road overlap)
          const blockMinX = cx - blockSize / 2 + 2;
          const blockMaxX = cx + blockSize / 2 - 2;
          const blockMinZ = cz - blockSize / 2 + 2;
          const blockMaxZ = cz + blockSize / 2 - 2;
          palmX = Math.max(blockMinX, Math.min(blockMaxX, palmX));
          palmZ = Math.max(blockMinZ, Math.min(blockMaxZ, palmZ));
          // Keep palm outside building footprint (push to nearest edge if inside)
          const palmHalfW = bWidth / 2 + 0.8;
          const palmHalfD = bDepth / 2 + 0.8;
          if (palmX > worldX - palmHalfW && palmX < worldX + palmHalfW &&
              palmZ > worldZ - palmHalfD && palmZ < worldZ + palmHalfD) {
            // Push palm to the right of the building
            palmX = worldX + palmHalfW + 0.5;
            palmX = Math.min(blockMaxX, palmX);
          }
          const palmH = randFloat(blockRng, 4, 7);
          const pMat = new THREE.Matrix4();
          pMat.makeTranslation(palmX, 0, palmZ);
          pMat.scale(new THREE.Vector3(0.3, palmH, 0.3));
          palmTrunkMatrices.push(pMat);

          const leafMat = new THREE.Matrix4();
          leafMat.makeTranslation(palmX, palmH + 0.5, palmZ);
          leafMat.scale(new THREE.Vector3(1.5, 0.6, 1.5));
          palmLeafMatrices.push(leafMat);
        }

        // Street lamps at block edges
        if (b === 0 || b === numBuildings - 1) {
          const lampX = worldX + (b === 0 ? -bWidth / 2 - 1 : bWidth / 2 + 1);
          const lampZ = worldZ;
          const lMat = new THREE.Matrix4();
          lMat.makeTranslation(lampX, 0, lampZ);
          lMat.scale(new THREE.Vector3(0.2, 5, 0.2));
          lampMatrices.push(lMat);

          const llMat = new THREE.Matrix4();
          llMat.makeTranslation(lampX, 5.2, lampZ);
          llMat.scale(new THREE.Vector3(1, 1, 1));
          lampLightMatrices.push(llMat);
        }
      }
    }
  }

  // ---- Instanced meshes ----
  const colorGroups = {};
  for (let i = 0; i < buildingMatrices.length; i++) {
    const c = buildingColors[i];
    if (!colorGroups[c]) colorGroups[c] = [];
    colorGroups[c].push(buildingMatrices[i]);
  }

  for (const [color, matrices] of Object.entries(colorGroups)) {
    const mat = new THREE.MeshStandardMaterial({
      color: parseInt(color),
      roughness: 0.85,
      map: makeWindowTexture(createRNG(parseInt(color)), 128, 256),
    });
    const instanced = new THREE.InstancedMesh(buildingGeo, mat, matrices.length);
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    for (let i = 0; i < matrices.length; i++) {
      instanced.setMatrixAt(i, matrices[i]);
    }
    instanced.instanceMatrix.needsUpdate = true;
    scene.add(instanced);
  }

  if (palmTrunkMatrices.length > 0) {
    const trunkInstanced = new THREE.InstancedMesh(palmTrunkGeo, mats.palmTrunk, palmTrunkMatrices.length);
    trunkInstanced.castShadow = true;
    for (let i = 0; i < palmTrunkMatrices.length; i++) {
      trunkInstanced.setMatrixAt(i, palmTrunkMatrices[i]);
    }
    trunkInstanced.instanceMatrix.needsUpdate = true;
    scene.add(trunkInstanced);

    const leafInstanced = new THREE.InstancedMesh(palmLeafGeo, mats.palmLeaf, palmLeafMatrices.length);
    leafInstanced.castShadow = true;
    for (let i = 0; i < palmLeafMatrices.length; i++) {
      leafInstanced.setMatrixAt(i, palmLeafMatrices[i]);
    }
    leafInstanced.instanceMatrix.needsUpdate = true;
    scene.add(leafInstanced);
  }

  if (lampMatrices.length > 0) {
    const lampInstanced = new THREE.InstancedMesh(lampPostGeo, mats.lampPost, lampMatrices.length);
    lampInstanced.castShadow = true;
    for (let i = 0; i < lampMatrices.length; i++) {
      lampInstanced.setMatrixAt(i, lampMatrices[i]);
    }
    lampInstanced.instanceMatrix.needsUpdate = true;
    scene.add(lampInstanced);

    const lampLightInstanced = new THREE.InstancedMesh(lampLightGeo, mats.lampLight, lampLightMatrices.length);
    for (let i = 0; i < lampLightMatrices.length; i++) {
      lampLightInstanced.setMatrixAt(i, lampLightMatrices[i]);
    }
    lampLightInstanced.instanceMatrix.needsUpdate = true;
    scene.add(lampLightInstanced);
  }

  // Beach props
  for (const m of beachMeshes) scene.add(m);

  // Road and sidewalk meshes
  for (const m of roadMeshes) scene.add(m);
  for (const m of roadLineMeshes) scene.add(m);
  for (const m of sidewalkMeshes) scene.add(m);

  // Road data for traffic AI
  for (let bx = 0; bx < blocksPerAxis; bx++) {
    for (let bz = 0; bz < blocksPerAxis; bz++) {
      const cx = -halfSize + bx * totalBlock + totalBlock * 0.5;
      const cz = -halfSize + bz * totalBlock + totalBlock * 0.5;
      roadData.push(
        { minX: cx - blockSize / 2 - roadWidth / 2, maxX: cx + blockSize / 2 + roadWidth / 2, minZ: cz - blockSize / 2 - roadWidth / 2, maxZ: cz - blockSize / 2 + roadWidth / 2, axis: 'x' },
        { minX: cx - blockSize / 2 - roadWidth / 2, maxX: cx - blockSize / 2 + roadWidth / 2, minZ: cz - blockSize / 2 - roadWidth / 2, maxZ: cz + blockSize / 2 + roadWidth / 2, axis: 'z' },
      );
    }
  }

  return { colliders, roadData };
}
