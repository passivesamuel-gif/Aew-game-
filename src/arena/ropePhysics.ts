import * as THREE from 'three';

export const ROPE_TUBULAR_SEGMENTS = 36;
export const ROPE_RADIAL_SEGMENTS = 10;
export const ROPE_NODE_COUNT = ROPE_TUBULAR_SEGMENTS + 1; // 37
export const ROPE_BASE_RADIUS = 0.021;
export const ROPE_REST_SAG = 0.018;

export interface WrestlerContactInput {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius?: number;
  minContactY?: number;
  maxContactY?: number;
  mass?: number;
}

export interface WrestlerContactResult {
  inContact: boolean;
  contactSide: number | null;
  penetration: number;
  reboundForce: THREE.Vector3;
  updatedPosition: THREE.Vector3;
  updatedVelocity: THREE.Vector3;
}

export interface RopeHitInfo {
  side: number;
  level: number;
  t: number;
  distance: number;
  point: THREE.Vector3;
}

interface RopeTuning {
  waveSpeed: number;
  cubicStiffness: number;
  bendStiffness: number;
  viscousDamping: number;
  strainDamping: number;
  maxStretch: number;
}

const LEVEL_TUNING: RopeTuning[] = [
  // Level 0 (bottom rope y=1.46m): slightly higher tension near deck
  {
    waveSpeed: 39.0,
    cubicStiffness: 310,
    bendStiffness: 16,
    viscousDamping: 4.5,
    strainDamping: 0.16,
    maxStretch: 0.62,
  },
  // Level 1 (middle rope y=1.88m): primary torso rebound elasticity
  {
    waveSpeed: 35.0,
    cubicStiffness: 245,
    bendStiffness: 14,
    viscousDamping: 4.0,
    strainDamping: 0.15,
    maxStretch: 0.74,
  },
  // Level 2 (top rope y=2.30m): responsive upper chest/shoulder flex
  {
    waveSpeed: 36.5,
    cubicStiffness: 265,
    bendStiffness: 15,
    viscousDamping: 4.1,
    strainDamping: 0.15,
    maxStretch: 0.72,
  },
];

interface SimulatedRope {
  side: number;
  level: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  spanLength: number;
  dx: number;
  tangent: THREE.Vector3;
  outNormal: THREE.Vector3;
  restY: Float32Array;
  dispOut: Float32Array;
  velOut: Float32Array;
  dispY: Float32Array;
  velY: Float32Array;
  forceOut: Float32Array;
  forceY: Float32Array;
  spine: THREE.Vector3[];
  mesh: THREE.Mesh;
  sleeveStart: THREE.Mesh;
  sleeveEnd: THREE.Mesh;
  dirty: boolean;
  maxAbsDisp: number;
}

interface ReboundTestState {
  active: boolean;
  elapsed: number;
  phase: number;
  bodyPos: THREE.Vector3;
  bodyVel: THREE.Vector3;
  lastImpactAt: number;
}

// Pre-allocated scratch vectors (zero GC in render loop)
const _up = new THREE.Vector3(0, 1, 0);
const _tangent = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _segA = new THREE.Vector3();
const _segB = new THREE.Vector3();
const _rayClosest = new THREE.Vector3();
const _segClosest = new THREE.Vector3();
const _tempImpulse = new THREE.Vector3();

export class RingRopePhysics {
  private readonly ropes: SimulatedRope[] = [];
  private readonly ropesByGrid: SimulatedRope[][] = [[], [], [], []]; // [side][level]
  private readonly anchorCoord: number;
  private readonly onImpactSound?: (strength: number) => void;

  private reboundTest: ReboundTestState = {
    active: false,
    elapsed: 0,
    phase: 0,
    bodyPos: new THREE.Vector3(),
    bodyVel: new THREE.Vector3(),
    lastImpactAt: -10,
  };

  constructor(anchorCoord = 3.0289, onImpactSound?: (strength: number) => void) {
    this.anchorCoord = anchorCoord;
    this.onImpactSound = onImpactSound;
  }

  public registerRope(
    side: number,
    level: number,
    start: THREE.Vector3,
    end: THREE.Vector3,
    mesh: THREE.Mesh,
    sleeveStart: THREE.Mesh,
    sleeveEnd: THREE.Mesh,
  ) {
    const spanVec = end.clone().sub(start);
    const spanLength = spanVec.length();
    const tangent = spanVec.clone().normalize();
    // Outward horizontal normal for sides: 0:-Z, 1:+X, 2:+Z, 3:-X
    // tangent x (0,1,0): for side 0 (+X) -> (0,0,+1) inward, so (0,1,0) x tangent points outward!
    const outNormal = new THREE.Vector3().crossVectors(_up, tangent).normalize();

    const restY = new Float32Array(ROPE_NODE_COUNT);
    const spine: THREE.Vector3[] = [];
    for (let i = 0; i < ROPE_NODE_COUNT; i++) {
      const u = i / ROPE_TUBULAR_SEGMENTS;
      const p = start.clone().lerp(end, u);
      const sag = -ROPE_REST_SAG * 4 * u * (1 - u);
      p.y += sag;
      restY[i] = p.y;
      spine.push(p);
    }

    const rope: SimulatedRope = {
      side,
      level,
      start: start.clone(),
      end: end.clone(),
      spanLength,
      dx: spanLength / ROPE_TUBULAR_SEGMENTS,
      tangent,
      outNormal,
      restY,
      dispOut: new Float32Array(ROPE_NODE_COUNT),
      velOut: new Float32Array(ROPE_NODE_COUNT),
      dispY: new Float32Array(ROPE_NODE_COUNT),
      velY: new Float32Array(ROPE_NODE_COUNT),
      forceOut: new Float32Array(ROPE_NODE_COUNT),
      forceY: new Float32Array(ROPE_NODE_COUNT),
      spine,
      mesh,
      sleeveStart,
      sleeveEnd,
      dirty: true,
      maxAbsDisp: 0,
    };

    this.ropes.push(rope);
    this.ropesByGrid[side][level] = rope;
    this.syncRopeGeometry(rope);
  }

  public applyImpulse(
    side: number,
    level: number,
    tNormalized: number,
    outwardVelocityImpulse: number,
    verticalVelocityImpulse = -0.35,
    spread = 0.16,
  ) {
    const rope = this.ropesByGrid[side]?.[level];
    if (!rope) return;

    const clampedT = THREE.MathUtils.clamp(tNormalized, 0.06, 0.94);
    for (let i = 1; i < ROPE_NODE_COUNT - 1; i++) {
      const u = i / ROPE_TUBULAR_SEGMENTS;
      const dist = (u - clampedT) / spread;
      const weight = Math.exp(-dist * dist * 1.4);
      if (weight > 0.02) {
        // Taper cleanly near turnbuckles
        const endFade = Math.sin(u * Math.PI);
        rope.velOut[i] += outwardVelocityImpulse * weight * endFade;
        rope.velY[i] += verticalVelocityImpulse * weight * endFade;
      }
    }
    rope.dirty = true;
  }

  public applyContinuousDrag(
    side: number,
    level: number,
    tNormalized: number,
    targetOutDisp: number,
    targetYDisp: number,
    dt: number,
  ) {
    const rope = this.ropesByGrid[side]?.[level];
    if (!rope || dt <= 0) return;

    const tuning = LEVEL_TUNING[level];
    const clampedT = THREE.MathUtils.clamp(tNormalized, 0.08, 0.92);
    const clampedOut = THREE.MathUtils.clamp(
      targetOutDisp,
      -tuning.maxStretch * 0.75,
      tuning.maxStretch,
    );
    const clampedY = THREE.MathUtils.clamp(targetYDisp, -0.22, 0.18);

    const springGain = 420;
    const dampGain = 18;

    for (let i = 1; i < ROPE_NODE_COUNT - 1; i++) {
      const u = i / ROPE_TUBULAR_SEGMENTS;
      const dist = (u - clampedT) / 0.14;
      const weight = Math.exp(-dist * dist * 1.5) * Math.sin(u * Math.PI);
      if (weight > 0.04) {
        const targetNodeOut = clampedOut * weight;
        const targetNodeY = clampedY * weight;
        const accelOut =
          ((targetNodeOut - rope.dispOut[i]) * springGain - rope.velOut[i] * dampGain) * weight;
        const accelY =
          ((targetNodeY - rope.dispY[i]) * springGain - rope.velY[i] * dampGain) * weight;
        rope.velOut[i] += accelOut * dt;
        rope.velY[i] += accelY * dt;
      }
    }
    rope.dirty = true;
  }

  /**
   * Gently parts or lifts a rope while a wrestler climbs between or slides under it.
   */
  public pushRopeAside(
    side: number,
    level: number,
    tNormalized: number,
    targetOutDisp: number,
    targetYDisp: number,
    dt: number,
    spread = 0.16,
  ) {
    const rope = this.ropesByGrid[side]?.[level];
    if (!rope || dt <= 0) return;

    const clampedT = THREE.MathUtils.clamp(tNormalized, 0.08, 0.92);
    for (let i = 1; i < ROPE_NODE_COUNT - 1; i++) {
      const u = i / ROPE_TUBULAR_SEGMENTS;
      const dist = (u - clampedT) / spread;
      const weight = Math.exp(-dist * dist * 1.4) * Math.sin(u * Math.PI);
      if (weight > 0.03) {
        const accelOut = ((targetOutDisp * weight - rope.dispOut[i]) * 520 - rope.velOut[i] * 20) * weight;
        const accelY = ((targetYDisp * weight - rope.dispY[i]) * 520 - rope.velY[i] * 20) * weight;
        rope.velOut[i] += accelOut * dt;
        rope.velY[i] += accelY * dt;
      }
    }
    rope.dirty = true;
  }

  /**
   * Solves physical wrestler-to-rope contact, bending/stretching under body pressure,
   * and returns the elastic rebound acceleration + clamped body state.
   */
  public stepWrestlerContact(input: WrestlerContactInput, dt: number): WrestlerContactResult {
    const pos = input.position.clone();
    const vel = input.velocity.clone();
    const radius = input.radius ?? 0.34;
    const minY = input.minContactY ?? 1.38;
    const maxY = input.maxContactY ?? 2.38;
    const mass = input.mass ?? 95;
    const reboundForce = new THREE.Vector3();

    let inContact = false;
    let contactSide: number | null = null;
    let maxPenetration = 0;

    // Check each of the 4 sides: 0:-Z, 1:+X, 2:+Z, 3:-X
    for (let side = 0; side < 4; side++) {
      const sideRopes = this.ropesByGrid[side];
      if (!sideRopes || sideRopes.length === 0) continue;

      const refRope = sideRopes[1] ?? sideRopes[0];
      // Compute wrestler center coordinate along side's outward normal and tangent span
      let coordOut = 0;
      let velOut = 0;
      let lateralCoord = 0;

      if (side === 0) {
        // -Z side (start -X -> end +X)
        coordOut = -pos.z;
        velOut = -vel.z;
        lateralCoord = pos.x;
      } else if (side === 1) {
        // +X side (start -Z -> end +Z)
        coordOut = pos.x;
        velOut = vel.x;
        lateralCoord = pos.z;
      } else if (side === 2) {
        // +Z side (start +X -> end -X)
        coordOut = pos.z;
        velOut = vel.z;
        lateralCoord = -pos.x;
      } else {
        // -X side (start +Z -> end -Z)
        coordOut = -pos.x;
        velOut = -vel.x;
        lateralCoord = -pos.z;
      }

      const t = (lateralCoord + this.anchorCoord) / (this.anchorCoord * 2);
      if (t < 0.05 || t > 0.95) continue;

      // Sample current average rope outward deflection at t across contacting levels
      const nodeIdx = THREE.MathUtils.clamp(
        Math.round(t * ROPE_TUBULAR_SEGMENTS),
        1,
        ROPE_NODE_COUNT - 2,
      );

      let activeLevelCount = 0;
      let avgRopeOut = 0;
      let avgRopeVel = 0;
      for (let lvl = 0; lvl < sideRopes.length; lvl++) {
        const rope = sideRopes[lvl];
        const ry = rope.start.y;
        if (ry >= minY && ry <= maxY) {
          avgRopeOut += rope.dispOut[nodeIdx];
          avgRopeVel += rope.velOut[nodeIdx];
          activeLevelCount++;
        }
      }
      if (activeLevelCount === 0) continue;
      avgRopeOut /= activeLevelCount;
      avgRopeVel /= activeLevelCount;

      const bodyFront = coordOut + radius;
      const ropeLine = this.anchorCoord + avgRopeOut;
      const overlap = bodyFront - this.anchorCoord;

      // Body has crossed the rest rope line or is pushing into the flexed rope
      if (overlap > 0 && bodyFront >= ropeLine - 0.06) {
        inContact = true;
        contactSide = side;
        const targetDeflect = THREE.MathUtils.clamp(overlap, 0, 0.78);
        if (targetDeflect > maxPenetration) {
          maxPenetration = targetDeflect;
        }

        // 1. Push the contacting ropes outward & apply subtle downward lean sag
        for (let lvl = 0; lvl < sideRopes.length; lvl++) {
          const rope = sideRopes[lvl];
          const ry = rope.start.y;
          if (ry < minY || ry > maxY) continue;

          // Higher weight on middle/top ropes for upright body contact
          const heightWeight = lvl === 1 ? 1.0 : lvl === 2 ? 0.92 : 0.65;
          const tuning = LEVEL_TUNING[lvl];
          const clampedTarget = Math.min(targetDeflect * heightWeight, tuning.maxStretch);

          for (let i = 1; i < ROPE_NODE_COUNT - 1; i++) {
            const u = i / ROPE_TUBULAR_SEGMENTS;
            const dist = (u - t) / 0.13;
            const shape = Math.exp(-dist * dist * 1.6) * Math.sin(u * Math.PI);
            if (shape > 0.03) {
              const desired = clampedTarget * shape;
              const diff = desired - rope.dispOut[i];
              if (diff > -0.04) {
                let accelOut = diff * 980 * shape;
                // Couple outward momentum cleanly into the rope
                if (velOut > avgRopeVel) {
                  accelOut += (velOut - rope.velOut[i]) * 38 * shape;
                }
                const accelY = (-0.055 * shape - rope.dispY[i]) * 200 * shape;
                rope.velOut[i] += accelOut * dt;
                rope.velY[i] += accelY * dt;
              }
            }
          }
          rope.dirty = true;
        }

        // 2. Elastic restoring rebound force acting back onto the wrestler body
        // Hardening cable spring prevents tunneling & launches crisp Irish-whip rebound
        const stiffnessNPerM = 2250;
        const cubicNPerM3 = 4800;
        const forceMag =
          stiffnessNPerM * targetDeflect +
          cubicNPerM3 * targetDeflect * targetDeflect * targetDeflect;
        // Slight damping against rope velocity during compression, minimal damping on release
        const dampForce = velOut > 0 ? velOut * 165 : velOut * 45;
        const totalInwardAccel = Math.max(0, (forceMag + dampForce) / mass);

        reboundForce.addScaledVector(refRope.outNormal, -totalInwardAccel);
        vel.addScaledVector(refRope.outNormal, -totalInwardAccel * dt);

        // Hard safety limit so body can never pass outside max rope stretch (0.78m)
        const maxBodyFront = this.anchorCoord + 0.78;
        if (bodyFront > maxBodyFront) {
          const excess = bodyFront - maxBodyFront;
          pos.addScaledVector(refRope.outNormal, -excess);
          const vDot = vel.dot(refRope.outNormal);
          if (vDot > 0) {
            vel.addScaledVector(refRope.outNormal, -vDot * 1.75);
          }
        }
      }
    }

    return {
      inContact,
      contactSide,
      penetration: maxPenetration,
      reboundForce,
      updatedPosition: pos,
      updatedVelocity: vel,
    };
  }

  /**
   * Analytical ray-to-rope-spine picker for direct viewport push/pull interaction.
   * Prefers front-most ropes along the camera ray when front & back sides overlap in screen space.
   */
  public raycastRopes(ray: THREE.Ray, maxHitDist = 0.085): RopeHitInfo | null {
    let best: RopeHitInfo | null = null;
    let bestScore = Infinity;
    const maxHitDistSq = maxHitDist * maxHitDist;

    for (let r = 0; r < this.ropes.length; r++) {
      const rope = this.ropes[r];
      // Step by 2 spine points for fast ~18-segment test per rope
      for (let i = 0; i < ROPE_NODE_COUNT - 1; i += 2) {
        const nextIdx = Math.min(ROPE_NODE_COUNT - 1, i + 2);
        _segA.copy(rope.spine[i]);
        _segB.copy(rope.spine[nextIdx]);
        const distSq = ray.distanceSqToSegment(_segA, _segB, _rayClosest, _segClosest);
        if (distSq < maxHitDistSq) {
          const camDist = ray.origin.distanceTo(_rayClosest);
          const radialDist = Math.sqrt(distSq);
          // Favor closest rope to camera, with radial precision breaking ties among adjacent levels
          const score = camDist + radialDist * 12;
          if (score < bestScore) {
            bestScore = score;
            const segRatio =
              _segA.distanceToSquared(_segB) > 1e-6
                ? _segClosest.distanceTo(_segA) / _segA.distanceTo(_segB)
                : 0;
            const t = (i + segRatio * (nextIdx - i)) / ROPE_TUBULAR_SEGMENTS;
            best = {
              side: rope.side,
              level: rope.level,
              t: THREE.MathUtils.clamp(t, 0.06, 0.94),
              distance: radialDist,
              point: _segClosest.clone(),
            };
          }
        }
      }
    }

    return best;
  }

  /**
   * Triggers a realistic multi-side wrestler-to-rope rebound physics sequence
   * so rope flex, rebound, and recovery can be observed immediately in the viewport.
   */
  public triggerReboundTest() {
    this.reboundTest = {
      active: true,
      elapsed: 0,
      phase: 0,
      // Start near center ring and sprint straight toward -Z stage-side ropes
      bodyPos: new THREE.Vector3(-0.32, 1.06, 0.25),
      bodyVel: new THREE.Vector3(-0.2, 0, -6.1),
      lastImpactAt: -10,
    };
  }

  public isReboundTestActive(): boolean {
    return this.reboundTest.active;
  }

  /**
   * Subtle turnbuckle frame tremor when the brass ring bell or corner impact occurs.
   */
  public triggerTurnbuckleTremor(strength = 0.55) {
    for (let s = 0; s < 4; s++) {
      for (let l = 0; l < 3; l++) {
        this.applyImpulse(s, l, 0.5, strength * (l === 1 ? 1.0 : 0.75), -0.15 * strength, 0.28);
      }
    }
  }

  public update(dt: number) {
    const clampedDt = Math.min(Math.max(dt, 0.0001), 0.033);

    // 1. Advance built-in wrestler-to-rope physics rebound sequence if active
    if (this.reboundTest.active) {
      this.stepReboundTest(clampedDt);
    }

    // 2. Sub-stepped elastic cable wave solver across all 12 ropes
    const substeps = Math.max(8, Math.ceil(clampedDt / 0.0018));
    const subDt = clampedDt / substeps;

    for (let step = 0; step < substeps; step++) {
      // Compute accelerations & integrate velocities + displacements
      for (let r = 0; r < this.ropes.length; r++) {
        const rope = this.ropes[r];
        if (!rope.dirty && step === 0) continue;

        const tuning = LEVEL_TUNING[rope.level];
        const invDx2 = 1 / (rope.dx * rope.dx);
        const c2 = tuning.waveSpeed * tuning.waveSpeed;
        const cY2 = c2 * 0.55;
        const dOut = rope.dispOut;
        const vOut = rope.velOut;
        const dY = rope.dispY;
        const vY = rope.velY;

        for (let i = 1; i < ROPE_NODE_COUNT - 1; i++) {
          const lapOut = dOut[i - 1] - 2 * dOut[i] + dOut[i + 1];
          const lapY = dY[i - 1] - 2 * dY[i] + dY[i + 1];

          // 4th-order smoothing / bending stiffness around adjacent span
          const left2 = i >= 2 ? dOut[i - 2] : 0;
          const right2 = i <= ROPE_NODE_COUNT - 3 ? dOut[i + 2] : 0;
          const biharmonicOut = left2 - 4 * dOut[i - 1] + 6 * dOut[i] - 4 * dOut[i + 1] + right2;

          // Kelvin-Voigt internal strain damping suppresses unphysical high-frequency zigzags
          const strainOut = (vOut[i - 1] - 2 * vOut[i] + vOut[i + 1]) * tuning.strainDamping * invDx2;
          const strainY = (vY[i - 1] - 2 * vY[i] + vY[i + 1]) * tuning.strainDamping * invDx2;

          const curOut = dOut[i];
          const curY = dY[i];

          // Nonlinear cubic cable hardening prevents excessive stretching
          const cubicRestore = tuning.cubicStiffness * curOut * curOut * curOut;

          const accelOut =
            c2 * lapOut * invDx2 -
            tuning.bendStiffness * biharmonicOut -
            cubicRestore -
            tuning.viscousDamping * vOut[i] +
            strainOut +
            rope.forceOut[i];

          const accelY =
            cY2 * lapY * invDx2 -
            45.0 * curY -
            (tuning.viscousDamping + 0.9) * vY[i] +
            strainY +
            rope.forceY[i];

          vOut[i] += accelOut * subDt;
          vY[i] += accelY * subDt;
        }

        // Update positions after velocity step & enforce physical hard stretch cap
        let maxAbs = 0;
        for (let i = 1; i < ROPE_NODE_COUNT - 1; i++) {
          dOut[i] += vOut[i] * subDt;
          dY[i] += vY[i] * subDt;

          if (dOut[i] > tuning.maxStretch) {
            dOut[i] = tuning.maxStretch;
            if (vOut[i] > 0) vOut[i] *= -0.35;
          } else if (dOut[i] < -tuning.maxStretch * 0.8) {
            dOut[i] = -tuning.maxStretch * 0.8;
            if (vOut[i] < 0) vOut[i] *= -0.35;
          }

          if (dY[i] > 0.25) {
            dY[i] = 0.25;
            if (vY[i] > 0) vY[i] = 0;
          } else if (dY[i] < -0.25) {
            dY[i] = -0.25;
            if (vY[i] < 0) vY[i] = 0;
          }

          const absMag = Math.abs(dOut[i]) + Math.abs(dY[i]) + Math.abs(vOut[i]) * 0.04;
          if (absMag > maxAbs) maxAbs = absMag;
        }
        rope.maxAbsDisp = maxAbs;
      }

      // Subtle sympathetic coupling across turnbuckles on the same side
      for (let side = 0; side < 4; side++) {
        const sRopes = this.ropesByGrid[side];
        if (sRopes.length < 3) continue;
        const r0 = sRopes[0];
        const r1 = sRopes[1];
        const r2 = sRopes[2];
        if (!r0.dirty && !r1.dirty && !r2.dirty) continue;

        const couple = 0.28 * subDt;
        for (let i = 1; i < ROPE_NODE_COUNT - 1; i++) {
          const avgV = (r0.velOut[i] + r1.velOut[i] + r2.velOut[i]) / 3;
          r0.velOut[i] += (avgV - r0.velOut[i]) * couple;
          r1.velOut[i] += (avgV - r1.velOut[i]) * couple;
          r2.velOut[i] += (avgV - r2.velOut[i]) * couple;
        }
        r0.dirty = true;
        r1.dirty = true;
        r2.dirty = true;
      }
    }

    // Clear per-frame external forces & sync 3D TubeGeometry vertices + sleeves
    for (let r = 0; r < this.ropes.length; r++) {
      const rope = this.ropes[r];
      rope.forceOut.fill(0);
      rope.forceY.fill(0);

      if (!rope.dirty) continue;

      if (rope.maxAbsDisp < 0.00025) {
        // Snap cleanly back to exact rest state once oscillation finishes
        rope.dispOut.fill(0);
        rope.velOut.fill(0);
        rope.dispY.fill(0);
        rope.velY.fill(0);
        this.syncRopeGeometry(rope);
        rope.dirty = false;
      } else {
        this.syncRopeGeometry(rope);
      }
    }
  }

  private stepReboundTest(dt: number) {
    const test = this.reboundTest;
    test.elapsed += dt;

    // Sub-step body physics for crisp contact & rebound
    const steps = 4;
    const subDt = dt / steps;
    for (let s = 0; s < steps; s++) {
      const res = this.stepWrestlerContact(
        {
          position: test.bodyPos,
          velocity: test.bodyVel,
          radius: 0.34,
          minContactY: 1.42,
          maxContactY: 2.36,
          mass: 95,
        },
        subDt,
      );

      test.bodyPos.copy(res.updatedPosition);
      test.bodyVel.copy(res.updatedVelocity);

      if (res.inContact && test.elapsed - test.lastImpactAt > 0.35) {
        test.lastImpactAt = test.elapsed;
        this.onImpactSound?.(Math.min(1, test.bodyVel.length() / 6.5));
      }

      // Integrate body motion across mat
      test.bodyPos.addScaledVector(test.bodyVel, subDt);

      // Phase transitions when rebounding back across ring center
      if (test.phase === 0 && res.inContact && res.contactSide === 0) {
        test.phase = 1; // Heading toward +Z side now after -Z rebound
      } else if (test.phase === 1 && test.bodyPos.z > 0.5 && test.bodyVel.z > 0.5) {
        // Maintain momentum across ring into +Z ropes
        test.bodyVel.z = Math.max(test.bodyVel.z, 5.4);
      } else if (test.phase === 1 && res.inContact && res.contactSide === 2) {
        test.phase = 2; // Redirect after +Z rebound into +X ropes
      } else if (test.phase === 2 && test.bodyPos.z < 0.8 && test.bodyVel.z < -0.5) {
        test.bodyVel.set(5.7, 0, -0.35);
        test.phase = 3;
      } else if (test.phase === 3 && res.inContact && res.contactSide === 1) {
        test.phase = 4;
      } else if (test.phase === 4 && test.bodyPos.x < 0.4) {
        // Decelerate to stop at center ring and let ropes finish oscillating
        test.bodyVel.multiplyScalar(0.88);
      }
    }

    if (test.elapsed > 3.6) {
      test.active = false;
    }
  }

  private syncRopeGeometry(rope: SimulatedRope) {
    // 1. Update spine positions
    let deformedSpanLength = 0;
    for (let i = 0; i < ROPE_NODE_COUNT; i++) {
      const u = i / ROPE_TUBULAR_SEGMENTS;
      const p = rope.spine[i];
      p.lerpVectors(rope.start, rope.end, u);
      p.y = rope.restY[i] + rope.dispY[i];
      p.addScaledVector(rope.outNormal, rope.dispOut[i]);
      if (i > 0) {
        deformedSpanLength += p.distanceTo(rope.spine[i - 1]);
      }
    }

    // Subtle volume-preserving Poisson thinning as rope stretches
    const stretchRatio = Math.max(0.85, rope.spanLength / Math.max(rope.spanLength, deformedSpanLength));
    const r = ROPE_BASE_RADIUS * Math.sqrt(stretchRatio);

    const geo = rope.mesh.geometry;
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const normAttr = geo.attributes.normal as THREE.BufferAttribute;

    let vIdx = 0;
    for (let i = 0; i < ROPE_NODE_COUNT; i++) {
      const prevIdx = i === 0 ? 0 : i - 1;
      const nextIdx = i === ROPE_NODE_COUNT - 1 ? ROPE_NODE_COUNT - 1 : i + 1;

      _tangent.subVectors(rope.spine[nextIdx], rope.spine[prevIdx]).normalize();
      // Exact right-handed twist-free frame matching THREE.TubeGeometry outward winding:
      // E1 = normalize(T x Up), E2 = normalize(E1 x T)
      _e1.crossVectors(_tangent, _up).normalize();
      _e2.crossVectors(_e1, _tangent).normalize();

      const center = rope.spine[i];
      for (let j = 0; j <= ROPE_RADIAL_SEGMENTS; j++) {
        const theta = (j / ROPE_RADIAL_SEGMENTS) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const nx = cosT * _e1.x + sinT * _e2.x;
        const ny = cosT * _e1.y + sinT * _e2.y;
        const nz = cosT * _e1.z + sinT * _e2.z;

        posAttr.setXYZ(vIdx, center.x + r * nx, center.y + r * ny, center.z + r * nz);
        normAttr.setXYZ(vIdx, nx, ny, nz);
        vIdx++;
      }
    }

    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
    geo.computeBoundingSphere();

    // 2. Keep turnbuckle tape sleeves aligned cleanly with live rope ends
    this.alignSleeve(rope, rope.sleeveStart, 0.04);
    this.alignSleeve(rope, rope.sleeveEnd, 0.96);
  }

  private alignSleeve(rope: SimulatedRope, sleeve: THREE.Mesh, t: number) {
    const fIdx = t * ROPE_TUBULAR_SEGMENTS;
    const i0 = Math.min(ROPE_NODE_COUNT - 2, Math.floor(fIdx));
    const frac = fIdx - i0;
    sleeve.position.lerpVectors(rope.spine[i0], rope.spine[i0 + 1], frac);

    const prev = Math.max(0, i0 - 1);
    const next = Math.min(ROPE_NODE_COUNT - 1, i0 + 2);
    _tangent.subVectors(rope.spine[next], rope.spine[prev]).normalize();
    sleeve.quaternion.setFromUnitVectors(_up, _tangent);
  }

  public getMaxDisplacement(side?: number, level?: number): number {
    let maxVal = 0;
    for (let r = 0; r < this.ropes.length; r++) {
      const rope = this.ropes[r];
      if (side !== undefined && rope.side !== side) continue;
      if (level !== undefined && rope.level !== level) continue;
      for (let i = 1; i < ROPE_NODE_COUNT - 1; i++) {
        const d = Math.abs(rope.dispOut[i]);
        if (d > maxVal) maxVal = d;
      }
    }
    return maxVal;
  }

  public getSpinePoint(side: number, level: number, t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const rope = this.ropesByGrid[side]?.[level];
    if (!rope) return target.set(0, 0, 0);
    const fIdx = THREE.MathUtils.clamp(t, 0, 1) * ROPE_TUBULAR_SEGMENTS;
    const i0 = Math.min(ROPE_NODE_COUNT - 2, Math.floor(fIdx));
    const frac = fIdx - i0;
    return target.lerpVectors(rope.spine[i0], rope.spine[i0 + 1], frac);
  }
}

export { _tempImpulse };
