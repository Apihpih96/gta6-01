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
  walkSpeed: 5,
  runSpeed: 10,
  jumpForce: 7,
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

/** Vehicle driving */
export const VEHICLE = {
  /** Max forward speed (m/s) */
  maxSpeed: 30,
  /** Reverse max speed */
  reverseSpeed: 8,
  /** Acceleration rate (m/s²) */
  acceleration: 15,
  /** Braking rate (m/s²) */
  brakeForce: 20,
  /** Handbrake deceleration */
  handbrakeForce: 30,
  /** Steer sensitivity at low speed (radians) */
  steerMax: 0.04,
  /** Speed above which steering fades */
  steerFadeSpeed: 20,
  /** Drag coefficient */
  drag: 0.98,
  /** Enter/exit radius */
  interactRadius: 3,
  /** Camera distance behind car */
  cameraDistance: 12,
  /** Camera height above car */
  cameraHeight: 4,
  /** Camera smoothing */
  cameraSmoothing: 0.06,
};

/** Traffic AI */
export const TRAFFIC = {
  /** Max active traffic cars */
  maxCars: 15,
  /** Spawn distance from player (world units) */
  spawnDistance: 120,
  /** Despawn distance */
  despawnDistance: 160,
  /** Base speed (m/s) */
  speed: 8,
  /** Speed variation */
  speedVariation: 4,
  /** Minimum gap to car ahead (world units) */
  minGap: 8,
};

/** Pedestrians */
export const PEDESTRIANS = {
  /** Max active pedestrians */
  maxPeds: 20,
  /** Walk speed */
  walkSpeed: 1.5,
  /** Run (flee) speed */
  fleeSpeed: 4,
  /** Flee radius from car */
  fleeRadius: 10,
  /** Pause probability per step */
  pauseChance: 0.02,
  /** Spawn distance */
  spawnDistance: 80,
  /** Despawn distance */
  despawnDistance: 100,
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

/** Vehicle paint colours */
export const VEHICLE_COLORS = [
  0xcc2222, // red
  0x2244aa, // blue
  0x22aa44, // green
  0xdddd22, // yellow
  0xeeeeee, // white
  0x333333, // black
  0xcc8833, // orange-brown
  0x8833aa, // purple
];

/** Wanted system timings */
export const WANTED = {
  /** Seconds without crime before a wanted star decays */
  starDecayTime: 25,
  /** Police proximity radius for decay block (m) */
  policeDecayRadius: 60,
  /** Police proximity radius for extra heat (m) */
  policeHeatRadius: 40,
};

/** Police system constants */
export const POLICE = {
  /** Speed of police cars in pursuit (m/s) */
  carSpeed: 18,
  /** Speed of on-foot officers (m/s) */
  officerSpeed: 5,
  /** Distance for bust trigger when on foot (m) */
  bustDistance: 3,
  /** Seconds police must be within bustDistance to trigger bust */
  bustHoldTime: 2,
  /** Minimap blip radius */
  minimapBlipRadius: 3,
};

/** Combat system constants */
export const COMBAT = {
  /** Punch range (m) */
  punchRange: 2.2,
  /** Punch cooldown (s) */
  punchCooldown: 0.45,
  /** Punch lunge animation duration (s) */
  punchLungeTime: 0.2,
  /** Pedestrian health (punches to KO) */
  pedHealth: 3,
  /** Damage from fighting pedestrian per hit */
  pedDamage: 5,
  /** Fighting back probability (1 in N) */
  fightBackChance: 5,
  /** Health regeneration rate (per second) */
  regenRate: 2,
  /** Seconds without damage before regen starts */
  regenDelay: 8,
};

/** Objective text */
export const OBJECTIVE_DEFAULT = 'Explore the city';
