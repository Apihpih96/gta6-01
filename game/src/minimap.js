/**
 * 2D canvas top-down minimap: draws roads, water, player arrow,
 * traffic dots, pedestrian dots, and parked-car markers.
 */

import { CITY, PALETTE } from './config.js';

/** Create the minimap canvas element and its 2D context. */
export function createMinimap(container) {
  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 180;
  canvas.id = 'minimap-canvas';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const halfSize = CITY.blocksPerAxis * (CITY.blockSize + CITY.roadWidth) * 0.5;
  const scale = canvas.width / (halfSize * 2.2);

  function worldToMap(wx, wz) {
    return [
      canvas.width / 2 + wx * scale,
      canvas.height / 2 + wz * scale,
    ];
  }

  /** Convert a palette colour number to a CSS hex string. */
  function hexColor(num) {
    return '#' + Math.max(0, Math.min(0xffffff, num)).toString(16).padStart(6, '0');
  }

  /** Draw one frame of the minimap. */
  function draw(playerPos, colliders, trafficCars, pedestrians, parkedCars, policeCars, officers, missionMarkers) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background (sand)
    ctx.fillStyle = hexColor(PALETTE.sand);
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Water on right side
    const [waterX] = worldToMap(halfSize, 0);
    ctx.fillStyle = hexColor(PALETTE.sea);
    ctx.fillRect(waterX, 0, canvas.width - waterX, canvas.height);

    // Roads as grey rectangles
    ctx.fillStyle = hexColor(PALETTE.road);
    const totalBlock = CITY.blockSize + CITY.roadWidth;
    for (let i = 0; i <= CITY.blocksPerAxis; i++) {
      const pos = -halfSize + i * totalBlock;
      const [rx, rz] = worldToMap(pos, pos);
      const rw = CITY.roadWidth * scale;
      ctx.fillRect(rx - rw / 2, 0, rw, canvas.height);
      ctx.fillRect(0, rz - rw / 2, canvas.width, rw);
    }

    // Buildings as dark blocks
    ctx.fillStyle = '#554433';
    for (const col of colliders) {
      const [x1, z1] = worldToMap(col.minX, col.minZ);
      const [x2, z2] = worldToMap(col.maxX, col.maxZ);
      ctx.fillRect(x1, z1, x2 - x1, z2 - z1);
    }

    // Parked car markers (small grey squares)
    if (parkedCars) {
      ctx.fillStyle = 'rgba(150,150,150,0.5)';
      for (const car of parkedCars) {
        const [cx, cz] = worldToMap(car.position.x, car.position.z);
        ctx.fillRect(cx - 2, cz - 2, 4, 4);
      }
    }

    // Traffic cars (small coloured dots)
    if (trafficCars) {
      for (const car of trafficCars) {
        const [cx, cz] = worldToMap(car.position.x, car.position.z);
        ctx.fillStyle = hexColor(car.color);
        ctx.beginPath();
        ctx.arc(cx, cz, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Pedestrians (tiny white dots)
    if (pedestrians) {
      ctx.fillStyle = 'rgba(255,255,200,0.7)';
      for (const p of pedestrians) {
        const [px, pz] = worldToMap(p.position.x, p.position.z);
        ctx.fillRect(px - 1, pz - 1, 2, 2);
      }
    }

    // Police cars (blue flashing dots) — use config radius for legend clarity
    if (policeCars && policeCars.length > 0) {
      const flash = Math.sin(performance.now() * 0.008) > 0;
      ctx.fillStyle = flash ? '#4488ff' : '#2244aa';
      for (const pc of policeCars) {
        const [cx, cz] = worldToMap(pc.position.x, pc.position.z);
        ctx.beginPath();
        ctx.arc(cx, cz, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Officers on foot (small blue squares) — larger than regular peds for clarity
    if (officers && officers.length > 0) {
      const flash = Math.sin(performance.now() * 0.008) > 0;
      ctx.fillStyle = flash ? '#4488ff' : '#2244aa';
      for (const o of officers) {
        const [ox, oz] = worldToMap(o.position.x, o.position.z);
        ctx.fillRect(ox - 2, oz - 2, 4, 4);
      }
    }

    // Mission markers (gold diamond)
    if (missionMarkers && missionMarkers.length > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
      for (const mm of missionMarkers) {
        const [mx, mz] = worldToMap(mm.x, mm.z);
        ctx.save();
        ctx.translate(mx, mz);
        ctx.rotate(Math.PI / 4);
        const size = 5 + pulse * 2;
        ctx.fillStyle = mm.type === 'accept' ? '#ffaa00' : '#ffdd00';
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeStyle = '#aa6600';
        ctx.lineWidth = 1;
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        ctx.restore();
      }
    }

    // Player arrow
    const [px, pz] = worldToMap(playerPos.x, playerPos.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-playerPos.yaw || 0);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5, 6);
    ctx.lineTo(5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  }

  return { canvas, ctx, draw };
}
