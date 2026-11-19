/**
 * Procedural city builder for Solar Coast.
 *
 * Deterministic layout seeded from a number.  Uses InstancedMesh for
 * buildings, vegetation and props to minimise draw calls.
 *
 * The city is organised as a grid of blocks separated by roads.  Buildings
 * are taller near the centre (downtown) and shorter toward the suburbs.
 * The +X edge is a sandy beach with ocean beyond.
 *
 * Returns { colliders, roadData } where:
 *   colliders — array of { minX, maxX, minZ, maxZ } for collision tests
 *   roadData  — array of { minX, maxX, minZ, maxZ, axis } for traffic routing
 */

import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { createRNG, randInt, randFloat, randChoice } from './random.js';

// ---------------------------------------------------------------------------
// Texture generation
// ---------------------------------------------------------------------------

function bakeWindowTexture(rng, w = 192, h = 384) {
  const cvs = document.createElement('canvas');
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext('2d');

  const base = randChoice(rng, PALETTE.buildingBase);
  ctx.fillStyle = '#' + base.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, w, h);

  const cellW = 20;
  const cellH = 28;
  const gapX = 10;
  const gapY = 14;
  const marginX = 28;
  const marginY = 20;
  const cols = Math.floor((w - marginX * 2) / (cellW + gapX));
  const rows = Math.floor((h - marginY * 2) / (cellH + gapY));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = marginX + c * (cellW + gapX);
      const y = marginY + r * (cellH + gapY);
      ctx.fillStyle = rng() > 0.35
        ? '#' + PALETTE.windowLit.toString(16).padStart(6, '0')
        : '#' + PALETTE.windowDark.toString(16).padStart(6, '0');
      ctx.fillRect(x, y, cellW, cellH);
    }
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

// ---------------------------------------------------------------------------
// Shared materials (singleton)
// ---------------------------------------------------------------------------

let materials = null;

function getMats() {
  if (materials) return materials;
  materials = {
    road:      new THREE.MeshStandardMaterial({ color: PALETTE.road, roughness: 0.95 }),
    roadMark:  new THREE.MeshStandardMaterial({ color: PALETTE.roadLine, roughness: 0.8 }),
    sidewalk:  new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 0.9 }),
    sand:      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
    water:     new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.3, metalness: 0.1 }),
    trunk:     new THREE.MeshStandardMaterial({ color: PALETTE.palmTrunk, roughness: 0.9 }),
    canopy:    new THREE.MeshStandardMaterial({ color: PALETTE.palmLeaf, roughness: 0.8 }),
    lampPole:  new THREE.MeshStandardMaterial({ color: PALETTE.lampPost, roughness: 0.5, metalness: 0.3 }),
    lampGlow:  new THREE.MeshStandardMaterial({ color: PALETTE.lampLight, emissive: PALETTE.lampLight, emissiveIntensity: 0.5 }),
  };
  return materials;
}

// ---------------------------------------------------------------------------
// Height profile — downtown is taller
// ---------------------------------------------------------------------------

function downtownFactor(wx, wz, centre, radius) {
  const dx = (wx - centre) / radius;
  const dz = (wz - centre) / radius;
  const dist = Math.sqrt(dx * dx + dz * dz);
  // Gaussian: peak 1.7 at centre, fades to 0.4 at the edge
  return 0.4 + 1.3 * Math.exp(-dist * dist * 2.2);
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildCity(scene, seed) {
  const rng = createRNG(seed);
  const mats = getMats();
  const { blocksPerAxis, blockSize, roadWidth, sidewalkWidth } = CITY;
  const halfExtent = blocksPerAxis * (blockSize + roadWidth) * 0.5;
  const pitch = blockSize + roadWidth;
  const gridCentre = halfExtent;

  // ---- Sky ----
  const skyCvs = document.createElement('canvas');
  skyCvs.width = 512;
  skyCvs.height = 512;
  const skyCtx = skyCvs.getContext('2d');
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0, '#' + PALETTE.skyTop.toString(16).padStart(6, '0'));
  skyGrad.addColorStop(1, '#' + PALETTE.skyBottom.toString(16).padStart(6, '0'));
  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0, 0, 512, 512);
  // Sun disc
  skyCtx.fillStyle = '#' + PALETTE.sun.toString(16).padStart(6, '0');
  skyCtx.beginPath();
  skyCtx.arc(390, 110, 38, 0, Math.PI * 2);
  skyCtx.fill();
  // Wispy clouds
  skyCtx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 6; i++) {
    skyCtx.beginPath();
    skyCtx.ellipse(
      randFloat(rng, 40, 470), randFloat(rng, 25, 190),
      randFloat(rng, 25, 70), randFloat(rng, 8, 22),
      0, 0, Math.PI * 2
    );
    skyCtx.fill();
  }
  // Distant silhouette
  skyCtx.fillStyle = 'rgba(70,50,30,0.2)';
  for (let x = 0; x < 512; x += 10) {
    const bh = randFloat(rng, 8, 45);
    skyCtx.fillRect(x, 512 - bh - 15, 8, bh);
  }
  scene.background = new THREE.CanvasTexture(skyCvs);

  // ---- Lights ----
  scene.add(new THREE.AmbientLight(0xffeedd, 0.55));
  const sunLight = new THREE.DirectionalLight(0xfff0c0, 1.15);
  sunLight.position.set(55, 85, 35);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -65;
  sunLight.shadow.camera.right = 65;
  sunLight.shadow.camera.top = 65;
  sunLight.shadow.camera.bottom = -65;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 220;
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0x87ceeb, 0xc2b280, 0.35));

  // ---- Ground ----
  const groundGeo = new THREE.PlaneGeometry(halfExtent * 4, halfExtent * 4);
  const ground = new THREE.Mesh(groundGeo, mats.sand);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- Sea (east side) ----
  const seaGeo = new THREE.PlaneGeometry(halfExtent * 2, halfExtent * 3);
  const sea = new THREE.Mesh(seaGeo, mats.water);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(halfExtent + halfExtent, -0.08, 0);
  scene.add(sea);

  // ---- Collision + road data ----
  const colliders = [];
  const roadData = [];

  // Geometry singletons
  const bldgGeo = new THREE.BoxGeometry(1, 1, 1);
  bldgGeo.translate(0, 0.5, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const canopyGeo = new THREE.SphereGeometry(1, 6, 4);
  const poleGeo = new THREE.CylinderGeometry(0.04, 0.07, 1, 4);
  poleGeo.translate(0, 0.5, 0);
  const glowGeo = new THREE.SphereGeometry(0.18, 6, 4);
  const roadPlane = new THREE.PlaneGeometry(1, 1);
  roadPlane.rotateX(-Math.PI / 2);
  const dashPlane = new THREE.PlaneGeometry(1, 0.12);
  dashPlane.rotateX(-Math.PI / 2);
  const swPlane = new THREE.PlaneGeometry(1, 1);
  swPlane.rotateX(-Math.PI / 2);

  // Mesh buckets
  const roadMeshes = [];
  const markMeshes = [];
  const swMeshes = [];

  // Instance arrays
  const bldgMatrixList = [];
  const bldgColorList = [];
  const trunkMatrixList = [];
  const canopyMatrixList = [];
  const poleMatrixList = [];
  const glowMatrixList = [];

  // Beach props
  const umbrellaGeo = new THREE.ConeGeometry(1.1, 0.7, 8);
  const umbrellaColors = [0xff4444, 0x44aa44, 0x4488ff, 0xffaa22];
  const poleGeo2 = new THREE.CylinderGeometry(0.04, 0.04, 1, 4);
  const beachItems = [];

  // ---- Grid layout ----
  for (let bi = 0; bi < blocksPerAxis; bi++) {
    for (let bj = 0; bj < blocksPerAxis; bj++) {
      const cx = -halfExtent + bi * pitch + pitch * 0.5;
      const cz = -halfExtent + bj * pitch + pitch * 0.5;

      // Beach strip on +X edge
      if (bi === blocksPerAxis - 1 && CITY.beachEdge) {
        const bRng = createRNG(seed + bi * 8888 + bj * 6666);
        for (let p = 0; p < 3; p++) {
          const ux = cx + randFloat(bRng, -blockSize * 0.4, blockSize * 0.4);
          const uz = cz + randFloat(bRng, -blockSize * 0.4, blockSize * 0.4);
          const pole = new THREE.Mesh(poleGeo2, new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.5 }));
          pole.position.set(ux, 0.5, uz);
          beachItems.push(pole);
          const canopy = new THREE.Mesh(umbrellaGeo, new THREE.MeshStandardMaterial({
            color: randChoice(bRng, umbrellaColors), roughness: 0.9,
          }));
          canopy.position.set(ux, 1.35, uz);
          beachItems.push(canopy);
        }
        continue;
      }

      // Road surfaces
      const roadY = 0.015;
      // Horizontal road (along X) at the top of this block
      const hRoadZ = cz - blockSize / 2 - roadWidth / 2;
      const hRoad = new THREE.Mesh(roadPlane, mats.road);
      hRoad.position.set(cx, roadY, hRoadZ);
      hRoad.scale.set(blockSize + roadWidth, 1, roadWidth);
      hRoad.receiveShadow = true;
      roadMeshes.push(hRoad);

      // Vertical road (along Z) at the left of this block
      const vRoadX = cx - blockSize / 2 - roadWidth / 2;
      const vRoad = new THREE.Mesh(roadPlane, mats.road);
      vRoad.position.set(vRoadX, roadY, cz);
      vRoad.scale.set(roadWidth, 1, blockSize + roadWidth);
      vRoad.receiveShadow = true;
      roadMeshes.push(vRoad);

      // Dashed centre-line markings
      const numDashes = Math.max(2, Math.floor(blockSize / 4));
      for (let d = 0; d < numDashes; d++) {
        const frac = (d + 0.5) / numDashes;
        const dx = new THREE.Mesh(dashPlane, mats.roadMark);
        dx.position.set(cx - blockSize / 2 + frac * blockSize, roadY + 0.008, hRoadZ);
        dx.scale.set(blockSize / numDashes * 0.55, 1, 1);
        markMeshes.push(dx);

        const dz = new THREE.Mesh(dashPlane, mats.roadMark);
        dz.position.set(vRoadX, roadY + 0.008, cz - blockSize / 2 + frac * blockSize);
        dz.scale.set(1, 1, blockSize / numDashes * 0.55);
        markMeshes.push(dz);
      }

      // Sidewalks along the south edge
      const swMesh = new THREE.Mesh(swPlane, mats.sidewalk);
      swMesh.position.set(cx, 0.05, cz - blockSize / 2 - sidewalkWidth * 0.5);
      swMesh.scale.set(blockSize, 1, sidewalkWidth);
      swMesh.receiveShadow = true;
      swMeshes.push(swMesh);

      // ---- Buildings on this block ----
      const bRng2 = createRNG(seed + bi * 999 + bj * 333);
      const numBldgs = randInt(bRng2, 1, 3);
      const spacing = blockSize / numBldgs;

      for (let b = 0; b < numBldgs; b++) {
        const bW = randFloat(bRng2, spacing * 0.5, spacing * 0.8);
        const bD = randFloat(bRng2, spacing * 0.5, spacing * 0.8);
        const rawH = randFloat(bRng2, 8, 42);
        const hFactor = downtownFactor(cx + (-blockSize / 2 + spacing * b + spacing * 0.5), cz, gridCentre, halfExtent);
        const bH = Math.min(78, rawH * hFactor);

        const localX = -blockSize / 2 + sidewalkWidth + spacing * b + spacing * 0.5;
        const localZ = -blockSize / 2 + sidewalkWidth + spacing * 0.5;
        const wx = cx + localX;
        const wz = cz + localZ;

        const m = new THREE.Matrix4();
        m.makeTranslation(wx, 0, wz);
        m.scale(new THREE.Vector3(bW, bH, bD));
        bldgMatrixList.push(m);

        const clr = randChoice(bRng2, PALETTE.buildingBase);
        bldgColorList.push(clr);

        colliders.push({
          minX: wx - bW / 2, maxX: wx + bW / 2,
          minZ: wz - bD / 2, maxZ: wz + bD / 2,
        });

        // Palm tree — positioned outside the building footprint
        if (bRng2() > 0.45) {
          let px = wx + randFloat(bRng2, bW * 0.55, bW * 0.85);
          let pz = wz + randFloat(bRng2, -bD * 0.15, bD * 0.15);

          // Clamp inside block
          const loX = cx - blockSize / 2 + 2;
          const hiX = cx + blockSize / 2 - 2;
          const loZ = cz - blockSize / 2 + 2;
          const hiZ = cz + blockSize / 2 - 2;
          px = Math.max(loX, Math.min(hiX, px));
          pz = Math.max(loZ, Math.min(hiZ, pz));

          // Push outside building if overlapping
          const margin = bW / 2 + 0.7;
          if (px > wx - margin && px < wx + margin && pz > wz - margin && pz < wz + margin) {
            px = wx + margin + 0.4;
            px = Math.min(hiX, px);
          }

          const tH = randFloat(bRng2, 4.5, 6.5);
          const tMat = new THREE.Matrix4();
          tMat.makeTranslation(px, 0, pz);
          tMat.scale(new THREE.Vector3(0.25, tH, 0.25));
          trunkMatrixList.push(tMat);

          const cMat = new THREE.Matrix4();
          cMat.makeTranslation(px, tH + 0.4, pz);
          cMat.scale(new THREE.Vector3(1.4, 0.5, 1.4));
          canopyMatrixList.push(cMat);
        }

        // Street lamps at block corners
        if (b === 0 || b === numBldgs - 1) {
          const lx = wx + (b === 0 ? -bW / 2 - 0.9 : bW / 2 + 0.9);
          const lz = wz;
          const lMat = new THREE.Matrix4();
          lMat.makeTranslation(lx, 0, lz);
          lMat.scale(new THREE.Vector3(0.18, 4.8, 0.18));
          poleMatrixList.push(lMat);

          const gMat = new THREE.Matrix4();
          gMat.makeTranslation(lx, 5, lz);
          gMat.scale(new THREE.Vector3(1, 1, 1));
          glowMatrixList.push(gMat);
        }
      }
    }
  }

  // ---- Instanced buildings grouped by colour ----
  const colourBuckets = {};
  for (let i = 0; i < bldgMatrixList.length; i++) {
    const c = bldgColorList[i];
    if (!colourBuckets[c]) colourBuckets[c] = [];
    colourBuckets[c].push(bldgMatrixList[i]);
  }
  for (const [hex, matrixArr] of Object.entries(colourBuckets)) {
    const mat = new THREE.MeshStandardMaterial({
      color: parseInt(hex),
      roughness: 0.85,
      map: bakeWindowTexture(createRNG(parseInt(hex)), 128, 256),
    });
    const inst = new THREE.InstancedMesh(bldgGeo, mat, matrixArr.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    for (let i = 0; i < matrixArr.length; i++) inst.setMatrixAt(i, matrixArr[i]);
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }

  // ---- Instanced palms ----
  if (trunkMatrixList.length > 0) {
    const trInst = new THREE.InstancedMesh(trunkGeo, mats.trunk, trunkMatrixList.length);
    trInst.castShadow = true;
    for (let i = 0; i < trunkMatrixList.length; i++) trInst.setMatrixAt(i, trunkMatrixList[i]);
    trInst.instanceMatrix.needsUpdate = true;
    scene.add(trInst);

    const cInst = new THREE.InstancedMesh(canopyGeo, mats.canopy, canopyMatrixList.length);
    cInst.castShadow = true;
    for (let i = 0; i < canopyMatrixList.length; i++) cInst.setMatrixAt(i, canopyMatrixList[i]);
    cInst.instanceMatrix.needsUpdate = true;
    scene.add(cInst);
  }

  // ---- Instanced lamps ----
  if (poleMatrixList.length > 0) {
    const pInst = new THREE.InstancedMesh(poleGeo, mats.lampPole, poleMatrixList.length);
    pInst.castShadow = true;
    for (let i = 0; i < poleMatrixList.length; i++) pInst.setMatrixAt(i, poleMatrixList[i]);
    pInst.instanceMatrix.needsUpdate = true;
    scene.add(pInst);

    const gInst = new THREE.InstancedMesh(glowGeo, mats.lampGlow, glowMatrixList.length);
    for (let i = 0; i < glowMatrixList.length; i++) gInst.setMatrixAt(i, glowMatrixList[i]);
    gInst.instanceMatrix.needsUpdate = true;
    scene.add(gInst);
  }

  // Beach items
  for (const item of beachItems) scene.add(item);

  // Roads, markings, sidewalks
  for (const m of roadMeshes) scene.add(m);
  for (const m of markMeshes) scene.add(m);
  for (const m of swMeshes) scene.add(m);

  // ---- Road data for traffic AI ----
  for (let bi = 0; bi < blocksPerAxis; bi++) {
    for (let bj = 0; bj < blocksPerAxis; bj++) {
      const cx = -halfExtent + bi * pitch + pitch * 0.5;
      const cz = -halfExtent + bj * pitch + pitch * 0.5;
      roadData.push(
        {
          minX: cx - blockSize / 2 - roadWidth / 2,
          maxX: cx + blockSize / 2 + roadWidth / 2,
          minZ: cz - blockSize / 2 - roadWidth / 2,
          maxZ: cz - blockSize / 2 + roadWidth / 2,
          axis: 'x',
        },
        {
          minX: cx - blockSize / 2 - roadWidth / 2,
          maxX: cx - blockSize / 2 + roadWidth / 2,
          minZ: cz - blockSize / 2 - roadWidth / 2,
          maxZ: cz + blockSize / 2 + roadWidth / 2,
          axis: 'z',
        },
      );
    }
  }

  // Sanity check: every road segment must have non-zero extent
  for (const r of roadData) {
    if (r.axis === 'x' && r.maxX <= r.minX) { r.maxX = r.minX + 1; }
    if (r.axis === 'z' && r.maxZ <= r.minZ) { r.maxZ = r.minZ + 1; }
  }

  return { colliders, roadData };
}
