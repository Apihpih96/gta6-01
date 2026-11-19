import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { createRNG, randInt, randFloat, randChoice } from './random.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function paintSky() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  const top = new THREE.Color(PALETTE.skyTop);
  const bot = new THREE.Color(PALETTE.skyBottom);
  for (let y = 0; y < 512; y++) {
    const t = y / 511;
    const r = Math.round((top.r + (bot.r - top.r) * t) * 255);
    const g = Math.round((top.g + (bot.g - top.g) * t) * 255);
    const b = Math.round((top.b + (bot.b - top.b) * t) * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, 512, 1);
  }
  /* sun */
  const sun = new THREE.Color(PALETTE.sun);
  const sr = Math.round(sun.r * 255);
  const sg = Math.round(sun.g * 255);
  const sb = Math.round(sun.b * 255);
  ctx.fillStyle = `rgb(${sr},${sg},${sb})`;
  ctx.beginPath();
  ctx.arc(380, 100, 36, 0, Math.PI * 2);
  ctx.fill();
  /* glow */
  const glow = ctx.createRadialGradient(380, 100, 20, 380, 100, 80);
  glow.addColorStop(0, `rgba(${sr},${sg},${sb},0.35)`);
  glow.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(300, 20, 160, 160);
  /* clouds */
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 8; i++) {
    const cx = 40 + i * 60;
    const cy = 50 + ((i * 37) % 80);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 40 + (i % 3) * 15, 12 + (i % 2) * 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

function paintWindowTexture(baseHex, rng) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  const lit = new THREE.Color(PALETTE.windowLit);
  const dark = new THREE.Color(PALETTE.windowDark);
  const br = Math.round(base.r * 255);
  const bg = Math.round(base.g * 255);
  const bb = Math.round(base.b * 255);
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, 64, 64);
  const cols = 8;
  const rows = 12;
  const winW = 64 / cols;
  const winH = 64 / rows;
  const padX = winW * 0.2;
  const padY = winH * 0.15;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const wx = col * winW + padX;
      const wy = r * winH + padY;
      const ww = winW - padX * 2;
      const wh = winH - padY * 2;
      const wc = rng() < 0.45 ? lit : dark;
      const cr = Math.round(wc.r * 255);
      const cg = Math.round(wc.g * 255);
      const cb = Math.round(wc.b * 255);
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillRect(wx, wy, ww, wh);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Main builder                                                       */
/* ------------------------------------------------------------------ */

export function buildCity(scene, seed) {
  const { blocksPerAxis, blockSize, roadWidth, sidewalkWidth, beachEdge } = CITY;
  const halfExtent = blocksPerAxis * (blockSize + roadWidth) * 0.5;          // 444
  const pitch = blockSize + roadWidth;                                       // 74

  /* ---- scene dressing ------------------------------------------- */
  scene.background = paintSky();

  scene.add(new THREE.AmbientLight(0xffeedd, 0.55));

  const sun = new THREE.DirectionalLight(0xfff0c0, 1.15);
  sun.position.set(55, 85, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left   = -65;
  sun.shadow.camera.right  =  65;
  sun.shadow.camera.top    =  65;
  sun.shadow.camera.bottom = -65;
  sun.shadow.camera.near   = 1;
  sun.shadow.camera.far    = 220;
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0x87ceeb, 0xc2b280, 0.35));

  /* ---- ground --------------------------------------------------- */
  const groundGeo = new THREE.PlaneGeometry(halfExtent * 2.5, halfExtent * 2.5);
  const groundMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  /* ---- sea ------------------------------------------------------ */
  const seaGeo = new THREE.PlaneGeometry(400, halfExtent * 3);
  const seaMat = new THREE.MeshStandardMaterial({ color: PALETTE.sea });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(halfExtent + 200, -0.08, 0);
  sea.receiveShadow = true;
  scene.add(sea);

  /* ---- materials ------------------------------------------------ */
  const roadMat     = new THREE.MeshStandardMaterial({ color: PALETTE.road });
  const roadLineMat = new THREE.MeshStandardMaterial({ color: PALETTE.roadLine });
  const swMat       = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk });

  /* ---- geometry singletons -------------------------------------- */
  const boxGeo   = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const canopyGeo = new THREE.SphereGeometry(1, 6, 4);
  const poleGeo   = new THREE.CylinderGeometry(0.06, 0.08, 1, 6);
  poleGeo.translate(0, 0.5, 0);
  const glowGeo   = new THREE.SphereGeometry(0.2, 6, 4);
  const roadPlane = new THREE.PlaneGeometry(1, 1);
  roadPlane.rotateX(-Math.PI / 2);

  /* ---- collections ---------------------------------------------- */
  const colliders = [];
  const roadData  = [];

  /* instanced building buckets keyed by colour hex */
  const bldgBuckets = {};   // { hex: [ {x,z,w,d,h}, ... ] }

  const palmTrunks  = [];   // { x, z, h }
  const palmCanopies = [];  // { x, z }

  const lampPoles = [];     // { x, z }
  const lampGlows = [];     // { x, z }

  /* beach umbrella colours */
  const umbrellaPalette = [0xff6644, 0x44aaff, 0xffcc33, 0xff44aa, 0x44dd88];

  /* ---- iterate grid --------------------------------------------- */
  for (let bi = 0; bi < blocksPerAxis; bi++) {
    for (let bj = 0; bj < blocksPerAxis; bj++) {
      const cx = -halfExtent + bi * pitch + blockSize * 0.5;
      const cz = -halfExtent + bj * pitch + blockSize * 0.5;

      /* ---- beach edge ------------------------------------------- */
      if (bi === blocksPerAxis - 1 && beachEdge) {
        const bRng = createRNG(seed + bi * 999 + bj * 333 + 7777);
        const umbrellaCount = randInt(bRng, 3, 6);
        const uColor = randChoice(bRng, umbrellaPalette);
        const uMat = new THREE.MeshStandardMaterial({ color: uColor });
        const uPoleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 4);
        uPoleGeo.translate(0, 0.5, 0);
        const uConeGeo = new THREE.ConeGeometry(0.9, 0.35, 8);

        const uPoleMesh = new THREE.InstancedMesh(uPoleGeo, new THREE.MeshStandardMaterial({ color: PALETTE.concrete }), umbrellaCount);
        const uConeMesh = new THREE.InstancedMesh(uConeGeo, uMat, umbrellaCount);

        for (let u = 0; u < umbrellaCount; u++) {
          const ux = cx + randFloat(bRng, -20, 20);
          const uz = cz + randFloat(bRng, -20, 20);
          let m = new THREE.Matrix4();
          m.makeTranslation(ux, 0, uz);
          uPoleMesh.setMatrixAt(u, m);
          m = new THREE.Matrix4();
          m.makeTranslation(ux, 1.0, uz);
          uConeMesh.setMatrixAt(u, m);
        }
        uPoleMesh.castShadow = true;
        uConeMesh.castShadow = true;
        scene.add(uPoleMesh);
        scene.add(uConeMesh);
        continue;
      }

      /* ---- road segments for traffic AI ------------------------- */
      roadData.push({
        minX: cx - blockSize * 0.5,
        maxX: cx + blockSize * 0.5,
        minZ: cz - blockSize * 0.5 - roadWidth * 0.5,
        maxZ: cz - blockSize * 0.5 + roadWidth * 0.5 - roadWidth,
        axis: 'x',
      });
      roadData.push({
        minX: cx - blockSize * 0.5 - roadWidth * 0.5,
        maxX: cx - blockSize * 0.5 + roadWidth * 0.5 - roadWidth,
        minZ: cz - blockSize * 0.5,
        maxZ: cz + blockSize * 0.5,
        axis: 'z',
      });

      /* ---- road planes ------------------------------------------ */
      const roadY = 0.015;

      /* horizontal road — along X at top edge of block */
      const hRoad = new THREE.Mesh(roadPlane, roadMat);
      hRoad.position.set(cx, roadY, cz - blockSize * 0.5 - roadWidth * 0.5);
      hRoad.scale.set(blockSize, 1, roadWidth);
      hRoad.receiveShadow = true;
      scene.add(hRoad);

      /* vertical road — along Z at left edge of block */
      const vRoad = new THREE.Mesh(roadPlane, roadMat);
      vRoad.position.set(cx - blockSize * 0.5 - roadWidth * 0.5, roadY, cz);
      vRoad.scale.set(roadWidth, 1, blockSize);
      vRoad.receiveShadow = true;
      scene.add(vRoad);

      /* dashed centre-line */
      const dashCount = Math.floor(blockSize / 4);
      const dashMatH = roadLineMat;
      for (let d = 0; d < dashCount; d++) {
        const dash = new THREE.Mesh(roadPlane, dashMatH);
        dash.position.set(
          cx - blockSize * 0.5 + (d + 0.5) * (blockSize / dashCount),
          roadY + 0.008,
          cz - blockSize * 0.5 - roadWidth * 0.5,
        );
        dash.scale.set(blockSize / dashCount * 0.5, 1, 0.3);
        scene.add(dash);
      }
      for (let d = 0; d < dashCount; d++) {
        const dash = new THREE.Mesh(roadPlane, dashMatH);
        dash.position.set(
          cx - blockSize * 0.5 - roadWidth * 0.5,
          roadY + 0.008,
          cz - blockSize * 0.5 + (d + 0.5) * (blockSize / dashCount),
        );
        dash.scale.set(0.3, 1, blockSize / dashCount * 0.5);
        scene.add(dash);
      }

      /* sidewalk — south edge of block */
      const sw = new THREE.Mesh(roadPlane, swMat);
      sw.position.set(cx, 0.05, cz + blockSize * 0.5 + sidewalkWidth * 0.5);
      sw.scale.set(blockSize, 1, sidewalkWidth);
      sw.receiveShadow = true;
      scene.add(sw);

      /* ---- buildings -------------------------------------------- */
      const bRng = createRNG(seed + bi * 999 + bj * 333);
      const numBuildings = randInt(bRng, 1, 3);
      const inset = sidewalkWidth + 1;
      const availW = blockSize - inset * 2;
      const buildings = [];

      for (let b = 0; b < numBuildings; b++) {
        const bw = randFloat(bRng, availW * 0.5, availW * 0.8);
        const bd = randFloat(bRng, availW * 0.5, availW * 0.8);
        /* spread evenly along X, random Z */
        const spacing = availW / numBuildings;
        const bx = cx - availW * 0.5 + spacing * b + spacing * 0.5;
        const bz = cz - availW * 0.5 + randFloat(bRng, 0, availW - bd);

        /* downtown height factor */
        const dist = Math.sqrt(bi * bi + bj * bj) / (blocksPerAxis * 1.414);
        const downtownFactor = 1.0 - dist * 0.5;
        const rawH = randFloat(bRng, 8, 42) * downtownFactor;
        const bh = Math.min(rawH, 78);

        buildings.push({ x: bx, z: bz, w: bw, d: bd, h: bh });

        /* collider */
        colliders.push({
          minX: bx - bw * 0.5,
          maxX: bx + bw * 0.5,
          minZ: bz - bd * 0.5,
          maxZ: bz + bd * 0.5,
        });
      }

      /* bucket buildings by colour for instancing */
      for (const bld of buildings) {
        const clr = randChoice(bRng, PALETTE.buildingBase);
        const key = clr.toString(16);
        if (!bldgBuckets[key]) bldgBuckets[key] = [];
        bldgBuckets[key].push(bld);
      }

      /* ---- palms (~half of buildings) --------------------------- */
      const palmRng = createRNG(seed + bi * 999 + bj * 333 + 1111);
      for (const bld of buildings) {
        if (palmRng() < 0.5) {
          const palmH = randFloat(palmRng, 4.5, 6.5);
          /* place outside footprint but inside block */
          const sideX = palmRng() < 0.5 ? -1 : 1;
          const sideZ = palmRng() < 0.5 ? -1 : 1;
          const px = bld.x + sideX * (bld.w * 0.5 + randFloat(palmRng, 1.0, 2.5));
          const pz = bld.z + sideZ * (bld.d * 0.5 + randFloat(palmRng, 1.0, 2.5));
          /* clamp to block interior */
          const blockLoX = cx - blockSize * 0.5 + 1;
          const blockHiX = cx + blockSize * 0.5 - 1;
          const blockLoZ = cz - blockSize * 0.5 + 1;
          const blockHiZ = cz + blockSize * 0.5 - 1;
          const cpx = Math.max(blockLoX, Math.min(blockHiX, px));
          const cpz = Math.max(blockLoZ, Math.min(blockHiZ, pz));
          palmTrunks.push({ x: cpx, z: cpz, h: palmH });
          palmCanopies.push({ x: cpx, z: cpz });
        }
      }

      /* ---- street lamps (first & last building corners) --------- */
      if (buildings.length >= 1) {
        const first = buildings[0];
        const last  = buildings[buildings.length - 1];
        lampPoles.push({ x: first.x - first.w * 0.5 - 0.8, z: first.z });
        if (buildings.length > 1) {
          lampPoles.push({ x: last.x + last.w * 0.5 + 0.8, z: last.z });
          lampGlows.push({ x: last.x + last.w * 0.5 + 0.8, z: last.z });
        }
        lampGlows.push({ x: first.x - first.w * 0.5 - 0.8, z: first.z });
      }
    }
  }

  /* ---- create instanced building meshes ------------------------- */
  for (const key of Object.keys(bldgBuckets)) {
    const entries = bldgBuckets[key];
    const colorInt = parseInt(key, 16);
    const tex = paintWindowTexture(colorInt, createRNG(seed + colorInt));
    const mat = new THREE.MeshStandardMaterial({ color: colorInt, map: tex });
    const mesh = new THREE.InstancedMesh(boxGeo, mat, entries.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < entries.length; i++) {
      const b = entries[i];
      const m = new THREE.Matrix4();
      m.makeTranslation(b.x, 0, b.z);
      m.scale(new THREE.Vector3(b.w, b.h, b.d));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }

  /* ---- palm instanced meshes ------------------------------------ */
  if (palmTrunks.length > 0) {
    const palmTrunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.palmTrunk });
    const palmCanopyMat = new THREE.MeshStandardMaterial({ color: PALETTE.palmLeaf });
    const tMesh = new THREE.InstancedMesh(trunkGeo, palmTrunkMat, palmTrunks.length);
    const cMesh = new THREE.InstancedMesh(canopyGeo, palmCanopyMat, palmCanopies.length);
    for (let i = 0; i < palmTrunks.length; i++) {
      const p = palmTrunks[i];
      let m = new THREE.Matrix4();
      m.makeTranslation(p.x, 0, p.z);
      m.scale(new THREE.Vector3(1, p.h, 1));
      tMesh.setMatrixAt(i, m);
      m = new THREE.Matrix4();
      m.makeTranslation(p.x, p.h, p.z);
      m.scale(new THREE.Vector3(1.2, 1.2, 1.2));
      cMesh.setMatrixAt(i, m);
    }
    tMesh.castShadow = true;
    cMesh.castShadow = true;
    scene.add(tMesh);
    scene.add(cMesh);
  }

  /* ---- lamp instanced meshes ------------------------------------ */
  if (lampPoles.length > 0) {
    const poleMat = new THREE.MeshStandardMaterial({ color: PALETTE.lampPost });
    const glowMat = new THREE.MeshStandardMaterial({
      color: PALETTE.lampLight,
      emissive: PALETTE.lampLight,
      emissiveIntensity: 0.6,
    });
    const pMesh = new THREE.InstancedMesh(poleGeo, poleMat, lampPoles.length);
    const gMesh = new THREE.InstancedMesh(glowGeo, glowMat, lampGlows.length);
    for (let i = 0; i < lampPoles.length; i++) {
      const lp = lampPoles[i];
      let m = new THREE.Matrix4();
      m.makeTranslation(lp.x, 0, lp.z);
      m.scale(new THREE.Vector3(1, 4.8, 1));
      pMesh.setMatrixAt(i, m);
    }
    for (let i = 0; i < lampGlows.length; i++) {
      const lg = lampGlows[i];
      const m = new THREE.Matrix4();
      m.makeTranslation(lg.x, 4.8, lg.z);
      gMesh.setMatrixAt(i, m);
    }
    pMesh.castShadow = true;
    scene.add(pMesh);
    scene.add(gMesh);
  }

  return { colliders, roadData };
}
