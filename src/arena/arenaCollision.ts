import * as THREE from 'three';

export type ArenaSurfaceType =
  | 'ring'
  | 'apron'
  | 'steps'
  | 'ringside'
  | 'ramp'
  | 'stage'
  | 'floor';

export interface ArenaBoxCollider {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
  minY?: number;
}

export interface BarricadeSegment {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  halfThick: number;
  height: number;
  /** Unit normal pointing toward crowd / away from ring & ramp */
  outX: number;
  outZ: number;
  length: number;
}

export interface RopePortalInfo {
  side: number; // 0:-Z, 1:+X, 2:+Z, 3:-X
  t: number; // 0..1 along rope
  ropeX: number;
  ropeZ: number;
  outX: number;
  outZ: number;
  distToRope: number;
}

export interface BarricadeHitInfo {
  segment: BarricadeSegment;
  closestX: number;
  closestZ: number;
  dist: number;
  sideSign: number; // +1 = outNormal side (crowd), -1 = ring/ramp side
}

export interface NavWaypoint {
  x: number;
  z: number;
  action?: 'normal' | 'exit-ring-between' | 'exit-ring-slide' | 'enter-ring-between' | 'enter-ring-slide' | 'barricade-vault';
  side?: number;
  t?: number;
  barricade?: BarricadeSegment;
}

export interface FloorChairPoint {
  x: number;
  z: number;
}

const ANCHOR_COORD = 3.0289;
const RING_MAT_HALF = 3.10;
const APRON_HALF = 3.42;

export const CORNER_POSTS: readonly { x: number; z: number; radius: number }[] = [
  { x: -3.34, z: -3.34, radius: 0.145 },
  { x: 3.34, z: -3.34, radius: 0.145 },
  { x: 3.34, z: 3.34, radius: 0.145 },
  { x: -3.34, z: 3.34, radius: 0.145 },
];

export const BARRICADE_SEGMENTS: readonly BarricadeSegment[] = [
  // East (+X)
  { id: 'east', x1: 7.05, z1: -7.05, x2: 7.05, z2: 7.05, halfThick: 0.16, height: 1.16, outX: 1, outZ: 0, length: 14.1 },
  // South (+Z)
  { id: 'south', x1: 7.05, z1: 7.05, x2: -7.05, z2: 7.05, halfThick: 0.16, height: 1.16, outX: 0, outZ: 1, length: 14.1 },
  // West (-X)
  { id: 'west', x1: -7.05, z1: 7.05, x2: -7.05, z2: -7.05, halfThick: 0.16, height: 1.16, outX: -1, outZ: 0, length: 14.1 },
  // North-West (-Z left of ramp)
  { id: 'nw', x1: -7.05, z1: -7.05, x2: -2.55, z2: -7.05, halfThick: 0.16, height: 1.16, outX: 0, outZ: -1, length: 4.5 },
  // North-East (-Z right of ramp)
  { id: 'ne', x1: 2.55, z1: -7.05, x2: 7.05, z2: -7.05, halfThick: 0.16, height: 1.16, outX: 0, outZ: -1, length: 4.5 },
  // Ramp West (-X side of entrance ramp)
  { id: 'rampW', x1: -2.55, z1: -7.05, x2: -2.55, z2: -18.1, halfThick: 0.16, height: 1.16, outX: -1, outZ: 0, length: 11.05 },
  // Ramp East (+X side of entrance ramp)
  { id: 'rampE', x1: 2.55, z1: -7.05, x2: 2.55, z2: -18.1, halfThick: 0.16, height: 1.16, outX: 1, outZ: 0, length: 11.05 },
];

export const RINGSIDE_OBSTACLES: readonly ArenaBoxCollider[] = [
  // Broadcast Announce Desk + 3 Chairs
  { id: 'announce-desk', minX: 4.95, maxX: 6.72, minZ: -2.90, maxZ: 0.50, maxY: 1.12 },
  // Timekeeper Table + Brass Bell
  { id: 'timekeeper-table', minX: -6.12, maxX: -5.18, minZ: 0.80, maxZ: 2.80, maxY: 1.05 },
  // Ringside Broadcast Camera + Dolly Track
  { id: 'camera-dolly', minX: -0.52, maxX: 3.32, minZ: 5.42, maxZ: 6.10, maxY: 1.65 },
];

// Deterministic floor chair positions mirroring buildStadium.ts (no duplication of visuals)
export const FLOOR_CHAIRS: readonly FloorChairPoint[] = (() => {
  const chairs: FloorChairPoint[] = [];
  const bowlCenterZ = -4.0;
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let gx = -14.2; gx <= 14.2; gx += 0.78) {
    for (let gz = -14.2; gz <= 14.2; gz += 0.92) {
      if (Math.abs(gx) < 7.85 && Math.abs(gz) < 7.85) continue;
      if (gz < -5.8 && Math.abs(gx) < 3.6) continue;
      if (gz < -15.0) continue;
      if (Math.abs(gx) < 0.85 && gz > 7.5) continue;
      if (Math.abs(gz) < 0.85 && Math.abs(gx) > 7.5) continue;
      const ellip = (gx / 15.6) ** 2 + ((gz - bowlCenterZ) / 15.2) ** 2;
      if (ellip > 0.96) continue;
      if (rand() < 0.06) continue;
      const jx = gx + (rand() - 0.5) * 0.14;
      const jz = gz + (rand() - 0.5) * 0.12;
      // Consume the same remaining 3 rand() calls per fan as buildStadium.ts
      rand();
      rand();
      rand();
      chairs.push({ x: jx, z: jz });
    }
  }
  return chairs;
})();

/**
 * Exact 3D ground elevation query matching all arena floor, ramp, stage, step, and ring surfaces.
 */
export function sampleArenaSurface(
  x: number,
  z: number,
  currentY: number,
): { y: number; surface: ArenaSurfaceType } {
  // 1. Inside ring / apron footprint (only elevated if already near ring height >= 0.55m)
  if (Math.abs(x) <= APRON_HALF && Math.abs(z) <= APRON_HALF && currentY >= 0.52) {
    if (Math.abs(x) <= RING_MAT_HALF && Math.abs(z) <= RING_MAT_HALF) {
      return { y: 1.062, surface: 'ring' };
    }
    return { y: 1.064, surface: 'apron' };
  }

  // 2. Climbable Steel Ring Steps (Set 1: Back-Left -X/-Z, Set 2: Front-Right +X/+Z)
  if (x >= -4.32 && x <= -3.40 && z >= -3.08 && z <= -1.70) {
    // Low step: -2.15..-1.70 (y=0.26), Mid step: -2.55..-2.15 (y=0.52), Top: -3.08..-2.55 (y=0.78)
    if (z > -2.15) return { y: 0.26, surface: 'steps' };
    if (z > -2.55) return { y: 0.52, surface: 'steps' };
    return { y: 0.78, surface: 'steps' };
  }
  if (x >= 3.40 && x <= 4.32 && z >= 1.70 && z <= 3.08) {
    if (z < 2.15) return { y: 0.26, surface: 'steps' };
    if (z < 2.55) return { y: 0.52, surface: 'steps' };
    return { y: 0.78, surface: 'steps' };
  }

  // 3. Entrance Stage Deck (Main + Elevated Wings)
  if (Math.abs(x) <= 12.2 && z <= -18.1 && z >= -20.85) {
    // Elevated left/right wings if already climbing/on stage
    if (Math.abs(x) >= 3.45 && z <= -18.5 && currentY >= 1.2) {
      return { y: 1.66, surface: 'stage' };
    }
    if (currentY >= 0.85 || Math.abs(x) <= 2.45) {
      return { y: 1.38, surface: 'stage' };
    }
  }

  // 4. Solid Black Entrance Ramp + Transition Toe
  if (Math.abs(x) <= 2.35 && z >= -18.1 && z <= -5.1) {
    if (z >= -6.0) {
      const t = (-5.1 - z) / 0.9;
      return { y: THREE.MathUtils.lerp(0.032, 0.22, t), surface: 'ramp' };
    }
    const t = (-6.0 - z) / 12.1;
    return { y: THREE.MathUtils.lerp(0.22, 1.38, t), surface: 'ramp' };
  }

  // 5. Padded Rubber Ringside Mat
  if (Math.abs(x) <= 6.95 && Math.abs(z) <= 6.95) {
    return { y: 0.032, surface: 'ringside' };
  }

  // 6. Grey Industrial Arena Floor
  return { y: 0.0, surface: 'floor' };
}

/**
 * Resolves solid physical collisions against ring apron wall, corner posts,
 * barricades, ringside equipment, stage front, floor chairs, and stadium bowl wall.
 * Leaves zero artificial invisible walls — only real 3D geometry restricts movement.
 */
export function resolveArenaCollisions(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  radius: number,
  options: {
    ignoreRopes?: boolean;
    ignoreApron?: boolean;
    ignoreBarricadeId?: string | null;
  } = {},
): {
  touchingBarricade: BarricadeHitInfo | null;
  touchingApronSide: number | null;
} {
  let touchingBarricade: BarricadeHitInfo | null = null;
  let touchingApronSide: number | null = null;

  // 1. Solid Corner Posts (always solid at all heights)
  for (let i = 0; i < CORNER_POSTS.length; i++) {
    const post = CORNER_POSTS[i];
    const dx = pos.x - post.x;
    const dz = pos.z - post.z;
    const minDist = post.radius + radius;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDist * minDist && dSq > 1e-8) {
      const d = Math.sqrt(dSq);
      const nx = dx / d;
      const nz = dz / d;
      pos.x = post.x + nx * minDist;
      pos.z = post.z + nz * minDist;
      const vn = vel.x * nx + vel.z * nz;
      if (vn < 0) {
        vel.x -= vn * nx;
        vel.z -= vn * nz;
      }
    }
  }

  // 2. Solid Ring Apron / Skirt Box when on the floor (y < 0.72)
  if (!options.ignoreApron && pos.y < 0.72) {
    const halfApron = APRON_HALF + radius;
    if (Math.abs(pos.x) < halfApron && Math.abs(pos.z) < halfApron) {
      const penX = halfApron - Math.abs(pos.x);
      const penZ = halfApron - Math.abs(pos.z);
      if (penX < penZ) {
        const sx = pos.x >= 0 ? 1 : -1;
        pos.x = sx * halfApron;
        if (vel.x * sx < 0) vel.x = 0;
        touchingApronSide = sx > 0 ? 1 : 3;
      } else {
        const sz = pos.z >= 0 ? 1 : -1;
        pos.z = sz * halfApron;
        if (vel.z * sz < 0) vel.z = 0;
        touchingApronSide = sz > 0 ? 2 : 0;
      }
    }
  } else if (!options.ignoreApron && pos.y >= 0.72) {
    // On apron / steps height: check if near apron edge for step-up / step-down detection
    if (Math.abs(pos.x) > RING_MAT_HALF || Math.abs(pos.z) > RING_MAT_HALF) {
      if (Math.abs(pos.x) >= Math.abs(pos.z)) {
        touchingApronSide = pos.x >= 0 ? 1 : 3;
      } else {
        touchingApronSide = pos.z >= 0 ? 2 : 0;
      }
    }
  }

  // 3. Steel Ring Steps outer skirt walls (when on floor y < 0.22 and entering from side/back instead of front tread)
  if (pos.y < 0.22) {
    // Steps Left Back: x in [-4.30, -3.44], z in [-3.05, -1.73], open front at z = -1.73
    resolvePartialBoxFromSides(pos, vel, radius, -4.30, -3.44, -3.05, -1.73, 'south-open');
    // Steps Right Front: x in [3.44, 4.30], z in [1.73, 3.05], open front at z = +1.73
    resolvePartialBoxFromSides(pos, vel, radius, 3.44, 4.30, 1.73, 3.05, 'north-open');
  }

  // 4. Ramp Side Edges & Stage Front Skirt (when on floor y < 0.85)
  if (pos.y < 0.85) {
    // Stage front left & right wings (solid 1.38m stage riser)
    resolveAabb(pos, vel, radius, -12.3, -2.35, -21.5, -18.1);
    resolveAabb(pos, vel, radius, 2.35, 12.3, -21.5, -18.1);
  }
  // Keep wrestlers on ramp from walking off the sheer elevated ramp side if somehow inside ramp corridor
  if (pos.y > 0.35 && pos.z < -6.2 && pos.z > -18.1 && Math.abs(pos.x) < 2.55) {
    const limitX = 2.30 - radius * 0.5;
    if (pos.x > limitX) {
      pos.x = limitX;
      if (vel.x > 0) vel.x = 0;
    } else if (pos.x < -limitX) {
      pos.x = -limitX;
      if (vel.x < 0) vel.x = 0;
    }
  }

  // 5. Ringside Equipment (Announce Desk, Timekeeper Table, Camera Dolly)
  if (pos.y < 1.05) {
    for (let i = 0; i < RINGSIDE_OBSTACLES.length; i++) {
      const box = RINGSIDE_OBSTACLES[i];
      resolveAabb(pos, vel, radius, box.minX, box.maxX, box.minZ, box.maxZ);
    }
  }

  // 6. 7 Solid Ringside & Ramp Barricades
  for (let i = 0; i < BARRICADE_SEGMENTS.length; i++) {
    const seg = BARRICADE_SEGMENTS[i];
    if (seg.id === options.ignoreBarricadeId) continue;

    const abx = seg.x2 - seg.x1;
    const abz = seg.z2 - seg.z1;
    const lenSq = abx * abx + abz * abz;
    const t = THREE.MathUtils.clamp(
      ((pos.x - seg.x1) * abx + (pos.z - seg.z1) * abz) / lenSq,
      0,
      1,
    );
    const cx = seg.x1 + abx * t;
    const cz = seg.z1 + abz * t;
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const dist = Math.hypot(dx, dz);
    const minSep = seg.halfThick + radius;
    const sideDot = (pos.x - cx) * seg.outX + (pos.z - cz) * seg.outZ;
    const sideSign = sideDot >= 0 ? 1 : -1;

    if (dist < minSep + 0.14) {
      if (!touchingBarricade || dist < touchingBarricade.dist) {
        touchingBarricade = { segment: seg, closestX: cx, closestZ: cz, dist, sideSign };
      }
    }

    if (dist < minSep) {
      let nx: number;
      let nz: number;
      if (dist > 1e-5) {
        nx = dx / dist;
        nz = dz / dist;
      } else {
        nx = seg.outX * sideSign;
        nz = seg.outZ * sideSign;
      }
      pos.x = cx + nx * minSep;
      pos.z = cz + nz * minSep;
      const vn = vel.x * nx + vel.z * nz;
      if (vn < 0) {
        vel.x -= vn * nx;
        vel.z -= vn * nz;
      }
    }
  }

  // 7. Floor Folding Chairs outside barricades (allow walking along row gaps & aisles)
  if (pos.y < 0.55 && (Math.abs(pos.x) > 7.1 || Math.abs(pos.z) > 7.1)) {
    const chairR = 0.16 + radius * 0.58;
    const chairRSq = chairR * chairR;
    for (let i = 0; i < FLOOR_CHAIRS.length; i++) {
      const c = FLOOR_CHAIRS[i];
      if (Math.abs(pos.x - c.x) > 0.9 || Math.abs(pos.z - c.z) > 0.9) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < chairRSq && dSq > 1e-8) {
        const d = Math.sqrt(dSq);
        const nx = dx / d;
        const nz = dz / d;
        pos.x = c.x + nx * chairR;
        pos.z = c.z + nz * chairR;
        const vn = vel.x * nx + vel.z * nz;
        if (vn < 0) {
          vel.x -= vn * nx;
          vel.z -= vn * nz;
        }
      }
    }
  }

  // 8. Physical Lower Stadium Bowl Concrete Wall & Backstage Stage Wall
  if (pos.z < -20.55) {
    pos.z = -20.55;
    if (vel.z < 0) vel.z = 0;
  }
  if (Math.abs(pos.x) > 12.1 && pos.z < -17.8) {
    pos.x = Math.sign(pos.x) * 12.1;
  }
  // Elliptical concrete bowl riser perimeter (rx=16.0, rz=15.6 around z=-4.0)
  const bowlCenterZ = -4.0;
  const rx = 15.9 - radius;
  const rz = 15.5 - radius;
  const dzBowl = pos.z - bowlCenterZ;
  const angleFromFront = Math.atan2(pos.x, dzBowl);
  // Concrete lower bowl covers -0.72*PI to +0.72*PI (stage gap is behind -Z)
  if (Math.abs(angleFromFront) < Math.PI * 0.72) {
    const ellip = (pos.x / rx) ** 2 + (dzBowl / rz) ** 2;
    if (ellip > 1.0) {
      const scale = 1 / Math.sqrt(ellip);
      pos.x *= scale;
      pos.z = bowlCenterZ + dzBowl * scale;
      // Slide smoothly along elliptical tangent
      const nx = (pos.x / (rx * rx));
      const nz = ((pos.z - bowlCenterZ) / (rz * rz));
      const nLen = Math.hypot(nx, nz) || 1;
      const unx = nx / nLen;
      const unz = nz / nLen;
      const vn = vel.x * unx + vel.z * unz;
      if (vn > 0) {
        vel.x -= vn * unx;
        vel.z -= vn * unz;
      }
    }
  } else {
    // Stage-wing perimeter walls (x capped cleanly inside outer seating/curtain)
    if (pos.x > 13.8 - radius) {
      pos.x = 13.8 - radius;
      if (vel.x > 0) vel.x = 0;
    } else if (pos.x < -13.8 + radius) {
      pos.x = -13.8 + radius;
      if (vel.x < 0) vel.x = 0;
    }
  }

  return { touchingBarricade, touchingApronSide };
}

function resolvePartialBoxFromSides(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  radius: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  openSide: 'north-open' | 'south-open',
) {
  const eMinX = minX - radius;
  const eMaxX = maxX + radius;
  const eMinZ = minZ - radius;
  const eMaxZ = maxZ + radius;
  if (pos.x <= eMinX || pos.x >= eMaxX || pos.z <= eMinZ || pos.z >= eMaxZ) return;

  // Allow unobstructed entry from the open climbable step end
  if (openSide === 'south-open' && pos.z > maxZ - 0.15) return;
  if (openSide === 'north-open' && pos.z < minZ + 0.15) return;

  const dLeft = pos.x - eMinX;
  const dRight = eMaxX - pos.x;
  const dBack = openSide === 'south-open' ? pos.z - eMinZ : eMaxZ - pos.z;

  const minPen = Math.min(dLeft, dRight, dBack);
  if (minPen === dLeft) {
    pos.x = eMinX;
    if (vel.x > 0) vel.x = 0;
  } else if (minPen === dRight) {
    pos.x = eMaxX;
    if (vel.x < 0) vel.x = 0;
  } else if (openSide === 'south-open') {
    pos.z = eMinZ;
    if (vel.z > 0) vel.z = 0;
  } else {
    pos.z = eMaxZ;
    if (vel.z < 0) vel.z = 0;
  }
}

function resolveAabb(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  radius: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
) {
  const cx = THREE.MathUtils.clamp(pos.x, minX, maxX);
  const cz = THREE.MathUtils.clamp(pos.z, minZ, maxZ);
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const dSq = dx * dx + dz * dz;
  if (dSq >= radius * radius) return;

  if (dSq > 1e-8) {
    const d = Math.sqrt(dSq);
    const nx = dx / d;
    const nz = dz / d;
    pos.x = cx + nx * radius;
    pos.z = cz + nz * radius;
    const vn = vel.x * nx + vel.z * nz;
    if (vn < 0) {
      vel.x -= vn * nx;
      vel.z -= vn * nz;
    }
  } else {
    // Center inside box — push out nearest face
    const pLeft = pos.x - minX;
    const pRight = maxX - pos.x;
    const pTop = pos.z - minZ;
    const pBot = maxZ - pos.z;
    const m = Math.min(pLeft, pRight, pTop, pBot);
    if (m === pLeft) {
      pos.x = minX - radius;
      if (vel.x > 0) vel.x = 0;
    } else if (m === pRight) {
      pos.x = maxX + radius;
      if (vel.x < 0) vel.x = 0;
    } else if (m === pTop) {
      pos.z = minZ - radius;
      if (vel.z > 0) vel.z = 0;
    } else {
      pos.z = maxZ + radius;
      if (vel.z < 0) vel.z = 0;
    }
  }
}

/**
 * Finds the nearest valid rope crossing point for exiting or entering the ring.
 */
export function findNearestRopePortal(x: number, z: number): RopePortalInfo {
  const candidates: RopePortalInfo[] = [
    {
      side: 0,
      t: THREE.MathUtils.clamp((x + ANCHOR_COORD) / (ANCHOR_COORD * 2), 0.14, 0.86),
      ropeX: THREE.MathUtils.clamp(x, -2.15, 2.15),
      ropeZ: -ANCHOR_COORD,
      outX: 0,
      outZ: -1,
      distToRope: 0,
    },
    {
      side: 1,
      t: THREE.MathUtils.clamp((z + ANCHOR_COORD) / (ANCHOR_COORD * 2), 0.14, 0.86),
      ropeX: ANCHOR_COORD,
      ropeZ: THREE.MathUtils.clamp(z, -2.15, 2.15),
      outX: 1,
      outZ: 0,
      distToRope: 0,
    },
    {
      side: 2,
      t: THREE.MathUtils.clamp((-x + ANCHOR_COORD) / (ANCHOR_COORD * 2), 0.14, 0.86),
      ropeX: THREE.MathUtils.clamp(x, -2.15, 2.15),
      ropeZ: ANCHOR_COORD,
      outX: 0,
      outZ: 1,
      distToRope: 0,
    },
    {
      side: 3,
      t: THREE.MathUtils.clamp((-z + ANCHOR_COORD) / (ANCHOR_COORD * 2), 0.14, 0.86),
      ropeX: -ANCHOR_COORD,
      ropeZ: THREE.MathUtils.clamp(z, -2.15, 2.15),
      outX: -1,
      outZ: 0,
      distToRope: 0,
    },
  ];

  let best = candidates[0];
  let bestD = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(x - c.ropeX, z - c.ropeZ);
    c.distToRope = d;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Geometry-aware A* Arena Navigation Pathfinder.
 * Builds a grid directly from the real 3D arena geometry (obstacles, chairs,
 * ramp, stage, steel steps, ropes, barricades) so wrestlers navigate around
 * obstacles and cross ring/barricade boundaries naturally without getting stuck.
 */
export class ArenaNavGrid {
  private readonly cellSize = 0.5;
  private readonly minX = -15.5;
  private readonly minZ = -21.0;
  private readonly cols = 62; // -15.5 .. +15.5
  private readonly rows = 68; // -21.0 .. +13.0
  // 0 = blocked, 1 = floor/ringside/ramp/stage, 2 = ring, 3 = barricade portal, 4 = rope/apron portal
  private readonly cellKind: Uint8Array;

  constructor() {
    this.cellKind = new Uint8Array(this.cols * this.rows);
    this.buildGrid();
  }

  private idx(c: number, r: number) {
    return r * this.cols + c;
  }

  private worldToCell(x: number, z: number): [number, number] {
    const c = THREE.MathUtils.clamp(Math.floor((x - this.minX) / this.cellSize), 0, this.cols - 1);
    const r = THREE.MathUtils.clamp(Math.floor((z - this.minZ) / this.cellSize), 0, this.rows - 1);
    return [c, r];
  }

  private cellToWorld(c: number, r: number): [number, number] {
    return [this.minX + (c + 0.5) * this.cellSize, this.minZ + (r + 0.5) * this.cellSize];
  }

  private buildGrid() {
    const bowlCenterZ = -4.0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const [wx, wz] = this.cellToWorld(c, r);
        const index = this.idx(c, r);

        // Inside Ring Mat
        if (Math.abs(wx) <= 2.65 && Math.abs(wz) <= 2.65) {
          this.cellKind[index] = 2;
          continue;
        }
        // Ring Apron / Rope boundary transition strip (crossable via rope portal!)
        if (Math.abs(wx) <= 3.72 && Math.abs(wz) <= 3.72) {
          // Corner posts are blocked
          const nearPost = CORNER_POSTS.some((p) => Math.hypot(wx - p.x, wz - p.z) < 0.55);
          if (nearPost) {
            this.cellKind[index] = 0;
          } else {
            this.cellKind[index] = 4;
          }
          continue;
        }

        // Backstage / Wall check
        if (wz < -20.5) {
          this.cellKind[index] = 0;
          continue;
        }
        // Stage front wall (except ramp opening |x| <= 2.1)
        if (wz >= -20.5 && wz <= -18.1 && Math.abs(wx) > 2.2) {
          if (wz > -18.6) {
            this.cellKind[index] = 0;
            continue;
          }
        }
        if (Math.abs(wx) > 12.0 && wz < -17.8) {
          this.cellKind[index] = 0;
          continue;
        }

        // Stadium Bowl outer perimeter
        const dzBowl = wz - bowlCenterZ;
        const angleFromFront = Math.atan2(wx, dzBowl);
        if (Math.abs(angleFromFront) < Math.PI * 0.72) {
          if ((wx / 15.3) ** 2 + (dzBowl / 14.9) ** 2 > 1.0) {
            this.cellKind[index] = 0;
            continue;
          }
        } else if (Math.abs(wx) > 13.3) {
          this.cellKind[index] = 0;
          continue;
        }

        // Ringside Tables & Camera Dolly
        let blocked = false;
        for (const box of RINGSIDE_OBSTACLES) {
          if (
            wx >= box.minX - 0.35 &&
            wx <= box.maxX + 0.35 &&
            wz >= box.minZ - 0.35 &&
            wz <= box.maxZ + 0.35
          ) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          this.cellKind[index] = 0;
          continue;
        }

        // Floor folding chairs (compact 0.28m radius footprint so aisles & row gaps remain passable)
        for (let i = 0; i < FLOOR_CHAIRS.length; i++) {
          const ch = FLOOR_CHAIRS[i];
          if (Math.abs(wx - ch.x) < 0.27 && Math.abs(wz - ch.z) < 0.24) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          this.cellKind[index] = 0;
          continue;
        }

        // Barricade climbable cells
        let nearBarricade = false;
        for (const seg of BARRICADE_SEGMENTS) {
          const abx = seg.x2 - seg.x1;
          const abz = seg.z2 - seg.z1;
          const t = THREE.MathUtils.clamp(
            ((wx - seg.x1) * abx + (wz - seg.z1) * abz) / (abx * abx + abz * abz),
            0,
            1,
          );
          const d = Math.hypot(wx - (seg.x1 + abx * t), wz - (seg.z1 + abz * t));
          if (d < 0.42) {
            nearBarricade = true;
            break;
          }
        }

        this.cellKind[index] = nearBarricade ? 3 : 1;
      }
    }
  }

  public isWalkable(x: number, z: number): boolean {
    const [c, r] = this.worldToCell(x, z);
    return this.cellKind[this.idx(c, r)] !== 0;
  }

  /**
   * Computes a smooth multi-region arena path from (sx, sz) to (gx, gz),
   * naturally routing around ringside equipment, chairs, corner posts, and
   * tagging rope/barricade crossings with explicit traversal actions.
   */
  public findPath(
    sx: number,
    sz: number,
    gx: number,
    gz: number,
    preferSlideUnder = false,
  ): NavWaypoint[] {
    const [sc, sr] = this.worldToCell(sx, sz);
    let [gc, gr] = this.worldToCell(gx, gz);

    // If goal cell is inside an obstacle, snap to nearest walkable neighbor cell
    if (this.cellKind[this.idx(gc, gr)] === 0) {
      let bestDist = Infinity;
      let found: [number, number] | null = null;
      for (let dr = -4; dr <= 4; dr++) {
        for (let dc = -4; dc <= 4; dc++) {
          const nc = gc + dc;
          const nr = gr + dr;
          if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
          if (this.cellKind[this.idx(nc, nr)] !== 0) {
            const d = dc * dc + dr * dr;
            if (d < bestDist) {
              bestDist = d;
              found = [nc, nr];
            }
          }
        }
      }
      if (!found) return [{ x: gx, z: gz, action: 'normal' }];
      gc = found[0];
      gr = found[1];
    }

    const total = this.cols * this.rows;
    const gScore = new Float32Array(total).fill(Infinity);
    const fScore = new Float32Array(total).fill(Infinity);
    const cameFrom = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const open: number[] = [];

    const startIdx = this.idx(sc, sr);
    const goalIdx = this.idx(gc, gr);
    gScore[startIdx] = 0;
    fScore[startIdx] = Math.hypot(gc - sc, gr - sr);
    open.push(startIdx);

    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.414],
      [-1, 1, 1.414],
      [1, -1, 1.414],
      [-1, -1, 1.414],
    ];

    let iterations = 0;
    while (open.length > 0 && iterations < 5500) {
      iterations++;
      let bestOpenPos = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore[open[i]] < fScore[open[bestOpenPos]]) bestOpenPos = i;
      }
      const current = open[bestOpenPos];
      open[bestOpenPos] = open[open.length - 1];
      open.pop();

      if (current === goalIdx) break;
      if (closed[current]) continue;
      closed[current] = 1;

      const cc = current % this.cols;
      const cr = Math.floor(current / this.cols);

      for (let d = 0; d < dirs.length; d++) {
        const nc = cc + dirs[d][0];
        const nr = cr + dirs[d][1];
        if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
        const nIdx = this.idx(nc, nr);
        if (closed[nIdx]) continue;

        const kind = this.cellKind[nIdx];
        if (kind === 0) continue;

        const traversalPenalty = kind === 3 ? 3.5 : kind === 4 ? 4.0 : 0;
        const tentativeG = gScore[current] + dirs[d][2] + traversalPenalty;
        if (tentativeG < gScore[nIdx]) {
          cameFrom[nIdx] = current;
          gScore[nIdx] = tentativeG;
          fScore[nIdx] = tentativeG + Math.hypot(gc - nc, gr - nr);
          open.push(nIdx);
        }
      }
    }

    if (cameFrom[goalIdx] === -1 && startIdx !== goalIdx) {
      return [{ x: gx, z: gz, action: 'normal' }];
    }

    // Reconstruct cell chain
    const rawCells: number[] = [];
    let curr = goalIdx;
    while (curr !== -1) {
      rawCells.push(curr);
      if (curr === startIdx) break;
      curr = cameFrom[curr];
    }
    rawCells.reverse();

    // Downsample straight runs & detect rope/barricade crossings cleanly
    const waypoints: NavWaypoint[] = [];
    let prevKind = this.cellKind[rawCells[0]];

    for (let i = 1; i < rawCells.length; i++) {
      const idx = rawCells[i];
      const kind = this.cellKind[idx];
      const cc = idx % this.cols;
      const cr = Math.floor(idx / this.cols);
      const [wx, wz] = this.cellToWorld(cc, cr);

      if (kind === 4) {
        if (prevKind === 2) {
          // Exiting ring!
          const portal = findNearestRopePortal(wx, wz);
          waypoints.push({
            x: portal.ropeX - portal.outX * 0.45,
            z: portal.ropeZ - portal.outZ * 0.45,
            action: preferSlideUnder ? 'exit-ring-slide' : 'exit-ring-between',
            side: portal.side,
            t: portal.t,
          });
        } else if (prevKind === 1) {
          // Entering ring from outside!
          const portal = findNearestRopePortal(wx, wz);
          waypoints.push({
            x: portal.ropeX + portal.outX * 0.72,
            z: portal.ropeZ + portal.outZ * 0.72,
            action: preferSlideUnder ? 'enter-ring-slide' : 'enter-ring-between',
            side: portal.side,
            t: portal.t,
          });
        }
        prevKind = kind;
        continue;
      }

      if (kind === 3) {
        if (prevKind !== 3) {
          // Climbing over barricade!
          let nearestSeg = BARRICADE_SEGMENTS[0];
          let minD = Infinity;
          for (const seg of BARRICADE_SEGMENTS) {
            const abx = seg.x2 - seg.x1;
            const abz = seg.z2 - seg.z1;
            const t = THREE.MathUtils.clamp(
              ((wx - seg.x1) * abx + (wz - seg.z1) * abz) / (abx * abx + abz * abz),
              0.08,
              0.92,
            );
            const d = Math.hypot(wx - (seg.x1 + abx * t), wz - (seg.z1 + abz * t));
            if (d < minD) {
              minD = d;
              nearestSeg = seg;
            }
          }
          waypoints.push({
            x: wx,
            z: wz,
            action: 'barricade-vault',
            barricade: nearestSeg,
          });
        }
        prevKind = kind;
        continue;
      }

      if (i % 3 === 0 || i === rawCells.length - 1) {
        waypoints.push({ x: wx, z: wz, action: 'normal' });
      }
      prevKind = kind;
    }

    // Ensure final exact target coordinate
    const [endWx, endWz] = this.cellToWorld(gc, gr);
    if (
      waypoints.length === 0 ||
      Math.hypot(waypoints[waypoints.length - 1].x - endWx, waypoints[waypoints.length - 1].z - endWz) > 0.25
    ) {
      waypoints.push({ x: endWx, z: endWz, action: 'normal' });
    }

    return waypoints;
  }
}
