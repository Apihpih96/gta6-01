/**
 * Tuning constants for Solar Coast — speeds, city size, palette, wanted timings.
 */

/** City grid parameters */
export const CITY = {
  /** Number of blocks along each axis */
  blocksPerAxis: 12,
  /** Width of one block (world units) */
  blockSize: 60,
  /** Width of a road between blocks */
  roadWidth: 14,
  /** Sidewalk width */
  sidewalkWidth: 3,
  /** Beach side: blocks on the +X edge become beach/water */
  beachEdge: true,
};

/** Derived: total city half-size in world units */
export const CITY_HALF_SIZE =
  CITY.blocksPerAxis * (CITY.blockSize + CITY.roadWidth) * 0.5;

/** Player movement */
export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 12,
  jumpForce: 8,
  gravity: 20,
  radius: 0.5,
  height: 1.8,
};

/** Camera */
export const CAMERA = {
  defaultDistance: 8,
  minDistance: 4,
  maxDistance: 16,
  heightOffset: 3,
  sensitivity: 0.003,
};

/** Sun-soaked coastal palette */
export const PALETTE = {
  skyTop: 0x1a6fc4,
  skyBottom: 0xf5d68a,
  sun: 0xfff4b0,
  sea: 0x1a8ab5,
  sand: 0xe8c87a,
  concrete: 0xb0b0b0,
  road: 0x444444,
  roadLine: 0xdddd44,
  sidewalk: 0xc8c0b0,
  buildingBase: [
    0xf0e0c8, 0xe8d4b8, 0xd4a87c, 0xc89070, 0xb88068,
    0xa07060, 0x906868, 0xc0a080, 0xe0c8a0, 0xd8b898,
    0xf5e8d0, 0xd0b090, 0xc8a888, 0xb89878, 0xa88868,
  ],
  windowLit: 0xfff8e0,
  windowDark: 0x334455,
  palmTrunk: 0x8b6914,
  palmLeaf: 0x2d7a2d,
  lampPost: 0x666666,
  lampLight: 0xffe8a0,
};

/** Wanted system timings (reserved for later sessions) */
export const WANTED = {
  starDecayTime: 15,
  policeSpawnDelay: 5,
};

/** Objective text */
export const OBJECTIVE_DEFAULT = "Explore the city";
