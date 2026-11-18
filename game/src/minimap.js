/**
 * 2D canvas top-down minimap: draws roads, water, player arrow, and mission markers.
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
      canvas.width / 2 + (wx) * scale,
      canvas.height / 2 + (wz) * scale,
    ];
  }

  /** Draw the minimap frame. */
  function draw(playerPos, colliders) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background (sand/ground)
    ctx.fillStyle = '#' + PALETTE.sand.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Water on right side
    const [waterX] = worldToMap(halfSize, 0);
    ctx.fillStyle = '#' + PALETTE.sea.toString(16).padStart(6, '0');
    ctx.fillRect(waterX, 0, canvas.width - waterX, canvas.height);

    // Roads as grey rectangles
    ctx.fillStyle = '#' + PALETTE.road.toString(16).padStart(6, '0');
    const totalBlock = CITY.blockSize + CITY.roadWidth;
    for (let i = 0; i <= CITY.blocksPerAxis; i++) {
      const pos = -halfSize + i * totalBlock;
      const [rx, rz] = worldToMap(pos, pos);
      const rw = CITY.roadWidth * scale;
      // Vertical road
      ctx.fillRect(rx - rw / 2, 0, rw, canvas.height);
      // Horizontal road
      ctx.fillRect(0, rz - rw / 2, canvas.width, rw);
    }

    // Buildings as dark blocks
    ctx.fillStyle = '#554433';
    for (const col of colliders) {
      const [x1, z1] = worldToMap(col.minX, col.minZ);
      const [x2, z2] = worldToMap(col.maxX, col.maxZ);
      ctx.fillRect(x1, z1, x2 - x1, z2 - z1);
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
