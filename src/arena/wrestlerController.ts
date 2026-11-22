import * as THREE from 'three';
import {
  ArenaNavGrid,
  CORNER_POSTS,
  findNearestRopePortal,
  resolveArenaCollisions,
  sampleArenaSurface,
  type ArenaSurfaceType,
  type BarricadeSegment,
  type NavWaypoint,
} from './arenaCollision';
import type { PyroStyle } from './pyroEffects';
import type { RingRopePhysics } from './ropePhysics';
import {
  WRESTLER_PRESETS,
  type WrestlerAnimState,
  type WrestlerRig,
} from './wrestlerModel';
import { createAnimatedWrestlerRig } from './animatedWrestlerRig';
import type { WrestlerId } from '../assets/assetManifest';

export interface PlayerInputState {
  /** Normalized 360-degree analog vector in screen/camera space (-1..1) */
  moveX: number;
  moveZ: number;
  sprint: boolean;
}

export type MatchPhase =
  | 'entrance-rival'
  | 'entrance-player'
  | 'active'
  | 'pinning'
  | 'finished';

export interface ContextualActionSpec {
  visible: boolean;
  label: string;
  highlighted?: boolean;
}

export interface WrestlerHudSnapshot {
  matchPhase: MatchPhase;
  playerName: string;
  rivalName: string;
  entranceName: string | null;
  entranceSubtitle: string | null;
  pinCount: 0 | 1 | 2 | 3;
  winnerName: string | null;
  playerHp: number;
  playerStamina: number;
  playerMomentum: number;
  rivalHp: number;
  rivalStamina: number;
  rivalMomentum: number;
  playerSurface: ArenaSurfaceType;
  inRing: boolean;
  isSprinting: boolean;
  lastMoveBanner: string | null;
  actions: {
    attack: ContextualActionSpec;
    grapple: ContextualActionSpec;
    whip: ContextualActionSpec;
    pin: ContextualActionSpec;
    reverse: ContextualActionSpec;
    climb: ContextualActionSpec;
    dive: ContextualActionSpec;
    finisher: ContextualActionSpec;
    run: ContextualActionSpec;
  };
}

export interface MatchCallbacks {
  onRopeImpactSound?: (strength: number) => void;
  onImpactSound?: (heavy: boolean) => void;
  onPyroBurst?: (style: PyroStyle, kind: 'stage' | 'corner') => void;
  onEntranceStart?: (who: 'player' | 'rival') => void;
  onEntranceStop?: () => void;
  onRingBell?: () => void;
  onRefCount?: (count: 1 | 2 | 3) => void;
}

interface TraversalScript {
  kind:
    | 'exit-between'
    | 'exit-slide'
    | 'enter-between'
    | 'enter-slide'
    | 'apron-step-down'
    | 'apron-step-up'
    | 'barricade-climb'
    | 'barricade-fall'
    | 'corner-climb'
    | 'corner-descend'
    | 'diving-attack'
    | 'springboard-attack';
  elapsed: number;
  duration: number;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startYaw: number;
  endYaw: number;
  side: number;
  t: number;
  outX: number;
  outZ: number;
  barricade?: BarricadeSegment;
  impactDelivered?: boolean;
  queuedNext?:
    | 'apron-step-down'
    | 'rope-enter-between'
    | 'rope-enter-slide'
    | 'knockdown'
    | 'corner-perch';
}

interface ActiveMove {
  role: 'attacker' | 'victim';
  moveName: string;
  anim: WrestlerAnimState;
  elapsed: number;
  duration: number;
  hitTime: number;
  hitApplied: boolean;
  damage: number;
  heavyKnockdown: boolean;
  range: number;
  partner: WrestlerActor;
  throwOffset?: THREE.Vector3;
  whipDirX?: number;
  whipDirZ?: number;
}

interface WrestlerActor {
  id: 'player' | 'rival';
  displayName: string;
  rig: WrestlerRig;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  radius: number;
  inRingSide: boolean;
  surface: ArenaSurfaceType;
  state: WrestlerAnimState;
  stateTimer: number;
  phaseDuration: number;
  hp: number;
  stamina: number;
  momentum: number;
  navQueue: NavWaypoint[];
  script: TraversalScript | null;
  move: ActiveMove | null;
  inGrappleWith: WrestlerActor | null;
  grappleTimer: number;
  perchedCornerIdx: number | null;
  nearCornerIdx: number | null;
  nearRopeSide: number | null;
  nearRopeT: number;
  nearBarricadeSeg: BarricadeSegment | null;
  nearBarricadeClosestX: number;
  nearBarricadeClosestZ: number;
  nearBarricadeSideSign: number;
  whipTimer: number;
  lastImpactAt: number;
  strikeCursor: number;
  grappleCursor: number;
  attackCooldown: number;
  reverseCooldown: number;
  aiDecisionTimer: number;
  aiPlan: 'approach' | 'circle' | 'retreat' | 'idle';
  entranceStageStep: number;
  entranceStepTimer: number;
}

const _camDir = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _moveVec = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _tempGoal = new THREE.Vector3();

const TURNBUCKLE_PERCHES: readonly { x: number; z: number }[] = [
  { x: -2.92, z: -2.92 },
  { x: 2.92, z: -2.92 },
  { x: 2.92, z: 2.92 },
  { x: -2.92, z: 2.92 },
];

const STANDING_STRIKES: readonly {
  anim: WrestlerAnimState;
  name: string;
  dur: number;
  hit: number;
  dmg: number;
}[] = [
  { anim: 'strike-jab', name: 'Right Hand', dur: 0.34, hit: 0.16, dmg: 6 },
  { anim: 'strike-chop', name: 'Knife-Edge Chop', dur: 0.4, hit: 0.2, dmg: 7 },
  { anim: 'strike-kick', name: 'Roundhouse Kick', dur: 0.44, hit: 0.21, dmg: 8 },
  { anim: 'strike-elbow', name: 'Spinning Back Elbow', dur: 0.42, hit: 0.2, dmg: 8 },
];

const GRAPPLE_THROWS: readonly {
  atkAnim: WrestlerAnimState;
  vicAnim: WrestlerAnimState;
  name: string;
  dur: number;
  dmg: number;
  offsetZ: number;
}[] = [
  { atkAnim: 'move-suplex', vicAnim: 'sell-suplex', name: 'Vertical Suplex', dur: 0.86, dmg: 14, offsetZ: 0.72 },
  { atkAnim: 'move-ddt', vicAnim: 'sell-ddt', name: 'Snap DDT', dur: 0.72, dmg: 13, offsetZ: 0.72 },
  { atkAnim: 'move-slam', vicAnim: 'sell-slam', name: 'Scoop Body Slam', dur: 0.76, dmg: 12, offsetZ: 0.68 },
  { atkAnim: 'move-neckbreaker', vicAnim: 'sell-neckbreaker', name: 'Swinging Neckbreaker', dur: 0.74, dmg: 13, offsetZ: 0.68 },
  { atkAnim: 'move-powerbomb', vicAnim: 'sell-powerbomb', name: 'Sit-Out Powerbomb', dur: 0.88, dmg: 16, offsetZ: 0.74 },
];

function shortestAngleDiff(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function dampYaw(current: number, target: number, lambda: number, dt: number): number {
  const diff = shortestAngleDiff(current, target);
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export class WrestlerArenaController {
  public readonly group = new THREE.Group();
  public readonly navGrid = new ArenaNavGrid();

  private readonly ropePhysics: RingRopePhysics;
  private readonly callbacks: MatchCallbacks;
  private readonly player: WrestlerActor;
  private readonly rival: WrestlerActor;
  private readonly actors: WrestlerActor[];

  private matchPhase: MatchPhase = 'entrance-rival';
  private clockElapsed = 0;
  private pinElapsed = 0;
  private pinCount: 0 | 1 | 2 | 3 = 0;
  private pinAttacker: WrestlerActor | null = null;
  private pinDefender: WrestlerActor | null = null;
  private pinWillKickout = true;
  private winnerName: string | null = null;

  private lastMoveBanner: string | null = null;
  private moveBannerTimer = 0;

  constructor(
    ropePhysics: RingRopePhysics,
    callbacks: MatchCallbacks = {},
    startImmediatelyActive = false,
    playerName = WRESTLER_PRESETS.player.name,
    rivalName = WRESTLER_PRESETS.rival.name,
    playerId: WrestlerId = 'MJF',
    rivalId: WrestlerId = 'Ospreay',
  ) {
    this.ropePhysics = ropePhysics;
    this.callbacks = callbacks;
    this.group.name = 'ArenaWrestlers';

    this.player = this.createActor(
      'player',
      playerName.toUpperCase(),
      new THREE.Vector3(-1.2, 1.062, 0.25),
      Math.PI * 0.5,
      playerId,
    );
    this.rival = this.createActor(
      'rival',
      rivalName.toUpperCase(),
      new THREE.Vector3(1.2, 1.062, -0.25),
      -Math.PI * 0.5,
      rivalId,
    );
    this.actors = [this.player, this.rival];

    this.group.add(this.player.rig.root);
    this.group.add(this.rival.rig.root);

    if (startImmediatelyActive) {
      this.skipEntrance();
    } else {
      this.startMatchWithEntrances();
    }
  }

  public setWrestlerIdentities(
    playerName: string,
    rivalName: string,
    playerId: WrestlerId = this.player.rig instanceof Object && 'wrestlerId' in this.player.rig ? (this.player.rig as { wrestlerId: WrestlerId }).wrestlerId : 'MJF',
    rivalId: WrestlerId = this.rival.rig instanceof Object && 'wrestlerId' in this.rival.rig ? (this.rival.rig as { wrestlerId: WrestlerId }).wrestlerId : 'Ospreay',
  ) {
    this.player.displayName = playerName.toUpperCase();
    this.rival.displayName = rivalName.toUpperCase();
    this.swapActorVisual(this.player, playerId);
    this.swapActorVisual(this.rival, rivalId);
  }

  private swapActorVisual(actor: WrestlerActor, id: WrestlerId) {
    const current = actor.rig as WrestlerRig & { wrestlerId?: WrestlerId };
    if (current.wrestlerId === id) return;
    const previous = actor.rig;
    const next = createAnimatedWrestlerRig(id, (status, message) => {
      if (status === 'fallback') console.warn(message);
    });
    next.root.position.copy(actor.pos);
    next.root.rotation.y = actor.yaw;
    this.group.add(next.root);
    actor.rig = next;
    this.group.remove(previous.root);
    previous.dispose();
  }

  private createActor(
    id: 'player' | 'rival',
    displayName: string,
    startPos: THREE.Vector3,
    yaw: number,
    assetId: WrestlerId,
  ): WrestlerActor {
    const rig = createAnimatedWrestlerRig(assetId, (status, message) => {
      if (status === 'fallback') console.warn(message);
    });
    rig.root.position.copy(startPos);
    rig.root.rotation.y = yaw;
    return {
      id,
      displayName,
      rig,
      pos: startPos.clone(),
      vel: new THREE.Vector3(),
      yaw,
      radius: 0.34,
      inRingSide: true,
      surface: 'ring',
      state: 'idle',
      stateTimer: 0,
      phaseDuration: 0.4,
      hp: 100,
      stamina: 100,
      momentum: 0,
      navQueue: [],
      script: null,
      move: null,
      inGrappleWith: null,
      grappleTimer: 0,
      perchedCornerIdx: null,
      nearCornerIdx: null,
      nearRopeSide: null,
      nearRopeT: 0.5,
      nearBarricadeSeg: null,
      nearBarricadeClosestX: 0,
      nearBarricadeClosestZ: 0,
      nearBarricadeSideSign: 1,
      whipTimer: 0,
      lastImpactAt: -10,
      strikeCursor: 0,
      grappleCursor: 0,
      attackCooldown: 0,
      reverseCooldown: 0,
      aiDecisionTimer: 0.5,
      aiPlan: 'approach',
      entranceStageStep: 0,
      entranceStepTimer: 0,
    };
  }

  private resetActorForMatch(
    actor: WrestlerActor,
    pos: THREE.Vector3,
    yaw: number,
    inRingSide = true,
  ) {
    actor.pos.copy(pos);
    actor.vel.set(0, 0, 0);
    actor.yaw = yaw;
    actor.inRingSide = inRingSide;
    actor.state = 'idle';
    actor.stateTimer = 0;
    actor.phaseDuration = 0.4;
    actor.hp = 100;
    actor.stamina = 100;
    actor.momentum = 0;
    actor.navQueue.length = 0;
    actor.script = null;
    actor.move = null;
    actor.inGrappleWith = null;
    actor.grappleTimer = 0;
    actor.perchedCornerIdx = null;
    actor.nearCornerIdx = null;
    actor.whipTimer = 0;
    actor.attackCooldown = 0;
    actor.reverseCooldown = 0;
    actor.entranceStageStep = 0;
    actor.entranceStepTimer = 0;
    actor.rig.root.visible = true;
    actor.rig.root.position.copy(actor.pos);
    actor.rig.root.rotation.y = actor.yaw;
  }

  /**
   * Starts full televised match sequence with both wrestlers' entrances, stage pyro, and music.
   */
  public startMatchWithEntrances() {
    this.matchPhase = 'entrance-rival';
    this.winnerName = null;
    this.pinCount = 0;
    this.pinAttacker = null;
    this.pinDefender = null;
    this.lastMoveBanner = null;

    this.resetActorForMatch(this.rival, new THREE.Vector3(0, 1.38, -20.1), 0, false);
    this.resetActorForMatch(this.player, new THREE.Vector3(0, 1.38, -20.3), 0, false);
    this.player.rig.root.visible = false; // waits backstage behind LED curtain until own entrance!

    this.rival.entranceStageStep = 0;
    this.rival.entranceStepTimer = 0;
    this.callbacks.onEntranceStart?.('rival');
    this.callbacks.onPyroBurst?.('cobalt', 'stage');
  }

  /**
   * Skips remaining entrance choreography and opens the match bell immediately.
   */
  public skipEntrance() {
    this.callbacks.onEntranceStop?.();
    this.resetActorForMatch(this.player, new THREE.Vector3(-1.35, 1.062, 0.2), Math.PI * 0.5, true);
    this.resetActorForMatch(this.rival, new THREE.Vector3(1.35, 1.062, -0.2), -Math.PI * 0.5, true);
    this.matchPhase = 'active';
    this.callbacks.onRingBell?.();
    this.setMoveBanner('MATCH START');
  }

  private setMoveBanner(label: string) {
    this.lastMoveBanner = label;
    this.moveBannerTimer = 1.65;
  }

  public getMatchPhase(): MatchPhase {
    return this.matchPhase;
  }

  public getPlayerPosition(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(this.player.pos);
  }

  public getRivalPosition(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(this.rival.pos);
  }

  public getPlayerState(): WrestlerAnimState {
    return this.player.state;
  }

  public isPlayerInRing(): boolean {
    return this.isActorInRing(this.player);
  }

  public getPlayerHp(): number {
    return this.player.hp;
  }

  public getRivalHp(): number {
    return this.rival.hp;
  }

  public getPlayerMomentum(): number {
    return this.player.momentum;
  }

  public setMomentumForTest(who: 'player' | 'rival', val: number) {
    const actor = who === 'player' ? this.player : this.rival;
    actor.momentum = THREE.MathUtils.clamp(val, 0, 100);
  }

  private isActorInRing(actor: WrestlerActor): boolean {
    return actor.inRingSide && actor.pos.y >= 0.72;
  }

  private isActorOnApron(actor: WrestlerActor): boolean {
    return (
      !actor.inRingSide &&
      actor.pos.y >= 0.72 &&
      Math.abs(actor.pos.x) <= 3.55 &&
      Math.abs(actor.pos.z) <= 3.55
    );
  }

  private isActorBusy(actor: WrestlerActor): boolean {
    return (
      actor.script !== null ||
      actor.move !== null ||
      actor.state === 'knockdown' ||
      actor.state === 'get-up' ||
      actor.state === 'pin-cover' ||
      actor.state === 'pin-trapped' ||
      actor.state === 'hit-stagger' ||
      actor.state === 'rope-rebound'
    );
  }

  // ==================== PLAYER CONTEXTUAL ACTION TRIGGERS ====================

  public triggerAttack() {
    if (this.matchPhase !== 'active') return;
    const p = this.player;
    const r = this.rival;

    // 1. If perched on top turnbuckle -> ATTACK also triggers Aerial Dive!
    if (p.perchedCornerIdx !== null) {
      this.triggerDive();
      return;
    }

    if (this.isActorBusy(p) || p.attackCooldown > 0) return;

    // 2. If inside Grapple Lock -> perform DDT or Neckbreaker!
    if (p.inGrappleWith === r) {
      const choice = p.grappleCursor % 2 === 0 ? GRAPPLE_THROWS[1] : GRAPPLE_THROWS[3];
      p.grappleCursor++;
      this.executeGrappleThrow(p, r, choice);
      return;
    }

    const dx = r.pos.x - p.pos.x;
    const dz = r.pos.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    const sameHeight = Math.abs(r.pos.y - p.pos.y) < 0.75;

    // 3. Opponent lying on mat -> Ground Stomp
    if (r.state === 'knockdown' && dist < 2.1 && sameHeight) {
      p.yaw = Math.atan2(dx, dz);
      p.vel.set(0, 0, 0);
      p.attackCooldown = 0.45;
      p.move = {
        role: 'attacker',
        moveName: 'Stomp',
        anim: 'ground-stomp',
        elapsed: 0,
        duration: 0.38,
        hitTime: 0.19,
        hitApplied: false,
        damage: 6,
        heavyKnockdown: false,
        range: 1.9,
        partner: r,
      };
      p.state = 'ground-stomp';
      p.stateTimer = 0;
      p.phaseDuration = 0.38;
      return;
    }

    // 4. Running at high speed -> Clothesline!
    const speed = Math.hypot(p.vel.x, p.vel.z);
    if (speed > 4.0) {
      if (dist < 3.2 && sameHeight) {
        p.yaw = Math.atan2(dx, dz);
      }
      p.attackCooldown = 0.55;
      p.move = {
        role: 'attacker',
        moveName: 'Clothesline',
        anim: 'strike-clothesline',
        elapsed: 0,
        duration: 0.46,
        hitTime: 0.21,
        hitApplied: false,
        damage: 11,
        heavyKnockdown: true,
        range: 1.95,
        partner: r,
      };
      p.state = 'strike-clothesline';
      p.stateTimer = 0;
      p.phaseDuration = 0.46;
      return;
    }

    // 5. Standing varied strike combo (never repeats same strike twice)
    const spec = STANDING_STRIKES[p.strikeCursor % STANDING_STRIKES.length];
    p.strikeCursor++;
    if (dist < 2.8 && sameHeight) {
      p.yaw = Math.atan2(dx, dz);
    }
    // Slight athletic step forward into strike
    p.vel.set(Math.sin(p.yaw) * 1.4, 0, Math.cos(p.yaw) * 1.4);
    p.attackCooldown = spec.dur + 0.08;
    p.move = {
      role: 'attacker',
      moveName: spec.name,
      anim: spec.anim,
      elapsed: 0,
      duration: spec.dur,
      hitTime: spec.hit,
      hitApplied: false,
      damage: spec.dmg,
      heavyKnockdown: false,
      range: 1.85,
      partner: r,
    };
    p.state = spec.anim;
    p.stateTimer = 0;
    p.phaseDuration = spec.dur;
  }

  public triggerGrapple() {
    if (this.matchPhase !== 'active') return;
    const p = this.player;
    const r = this.rival;
    if (p.perchedCornerIdx !== null || this.isActorBusy(p)) return;

    // If ALREADY in grapple lock -> execute varied Suplex / Slam / Powerbomb throw!
    if (p.inGrappleWith === r) {
      const throwsPool = [GRAPPLE_THROWS[0], GRAPPLE_THROWS[2], GRAPPLE_THROWS[4]];
      const choice = throwsPool[p.grappleCursor % throwsPool.length];
      p.grappleCursor++;
      this.executeGrappleThrow(p, r, choice);
      return;
    }

    const dx = r.pos.x - p.pos.x;
    const dz = r.pos.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    if (
      dist <= 1.95 &&
      Math.abs(r.pos.y - p.pos.y) < 0.7 &&
      !this.isActorBusy(r) &&
      r.perchedCornerIdx === null
    ) {
      this.startGrappleLock(p, r);
    }
  }

  public triggerWhipOrTraversal(input?: PlayerInputState) {
    if (this.matchPhase !== 'active') return;
    const p = this.player;
    const r = this.rival;

    // 1. Perched on turnbuckle -> climb safely back down to mat
    if (p.perchedCornerIdx !== null) {
      this.descendFromTurnbuckle(p);
      return;
    }

    if (this.isActorBusy(p)) return;

    // 2. Inside grapple lock -> execute Irish Whip toward ropes or corner!
    if (p.inGrappleWith === r) {
      let dirX = Math.sin(p.yaw);
      let dirZ = Math.cos(p.yaw);
      if (input && Math.hypot(input.moveX, input.moveZ) > 0.2) {
        const len = Math.hypot(input.moveX, input.moveZ);
        dirX = input.moveX / len;
        dirZ = input.moveZ / len;
      }
      this.executeIrishWhip(p, r, dirX, dirZ);
      return;
    }

    // 3. Touching barricade -> climb/vault over!
    if (p.nearBarricadeSeg) {
      const speed = Math.hypot(p.vel.x, p.vel.z);
      this.startBarricadeTraversal(
        p,
        p.nearBarricadeSeg,
        p.nearBarricadeClosestX,
        p.nearBarricadeClosestZ,
        p.nearBarricadeSideSign,
        speed > 4.6,
      );
      return;
    }

    // 4. Inside ring near ropes -> exit smoothly (step between or slide under)
    if (this.isActorInRing(p)) {
      const portal = findNearestRopePortal(p.pos.x, p.pos.z);
      if (portal.distToRope < 2.2) {
        this.startRingExit(p, portal.side, portal.t, Math.hypot(p.vel.x, p.vel.z) > 3.2);
      }
      return;
    }

    // 5. On apron or outside near ring -> step up & enter smoothly
    if (this.isActorOnApron(p)) {
      const portal = findNearestRopePortal(p.pos.x, p.pos.z);
      this.startRingEnter(p, portal.side, portal.t, false);
      return;
    }

    const portal = findNearestRopePortal(p.pos.x, p.pos.z);
    if (portal.distToRope < 1.95) {
      if (p.pos.y >= 0.72) {
        this.startRingEnter(p, portal.side, portal.t, false);
      } else {
        this.startApronStepUp(p, portal, false);
      }
    }
  }

  public triggerPin() {
    if (this.matchPhase !== 'active') return;
    const p = this.player;
    const r = this.rival;
    if (this.isActorBusy(p) || p.perchedCornerIdx !== null) return;
    if (!this.isActorInRing(p) || !this.isActorInRing(r)) return;

    const dist = Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z);
    if ((r.state === 'knockdown' || r.state === 'get-up') && dist < 2.2) {
      this.startPinAttempt(p, r);
    }
  }

  public triggerReverse() {
    if (this.matchPhase !== 'active') return;
    const p = this.player;
    const r = this.rival;
    if (p.script || p.perchedCornerIdx !== null || p.reverseCooldown > 0) return;

    p.reverseCooldown = 0.75;

    // Check if opponent is actively winding up an attack, grapple, or diving into us!
    const dist = Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z);
    const rivalAttacking =
      (r.move !== null && r.move.role === 'attacker' && !r.move.hitApplied) ||
      r.inGrappleWith === p ||
      (r.script?.kind === 'diving-attack' && dist < 2.8);

    if (rivalAttacking && dist < 2.6) {
      // Clean wrestling reversal counter!
      this.breakGrappleIfAny(p, r);
      r.move = null;
      r.script = null;
      r.vel.set(Math.sin(p.yaw) * -3.5, 0, Math.cos(p.yaw) * -3.5);
      r.state = 'hit-stagger';
      r.stateTimer = 0;
      r.phaseDuration = 0.55;
      r.hp = Math.max(0, r.hp - 7);

      p.move = null;
      p.state = 'reverse-counter';
      p.stateTimer = 0;
      p.phaseDuration = 0.42;
      p.yaw = Math.atan2(r.pos.x - p.pos.x, r.pos.z - p.pos.z);
      p.momentum = Math.min(100, p.momentum + 22);
      this.callbacks.onImpactSound?.(false);
      this.setMoveBanner('REVERSAL!');
      return;
    }

    // Outside enemy swing -> crisp evade sidestep + parry pose
    if (!this.isActorBusy(p)) {
      p.state = 'reverse-counter';
      p.stateTimer = 0;
      p.phaseDuration = 0.34;
      p.vel.set(-Math.sin(p.yaw) * 2.4, 0, -Math.cos(p.yaw) * 2.4);
    }
  }

  public triggerClimbCorner() {
    if (this.matchPhase !== 'active') return;
    const p = this.player;
    if (this.isActorBusy(p) || p.perchedCornerIdx !== null || !this.isActorInRing(p)) return;
    if (p.nearCornerIdx === null) return;

    this.breakGrappleIfAny(p, this.rival);
    this.startCornerClimb(p, p.nearCornerIdx);
  }

  public triggerDive() {
    if (this.matchPhase !== 'active') return;
    const p = this.player;
    const r = this.rival;

    // 1. Perched on top turnbuckle -> Launch soaring aerial attack toward opponent!
    if (p.perchedCornerIdx !== null) {
      this.launchTopRopeDive(p, r);
      return;
    }

    // 2. Inside ring near ropes while opponent is outside at ringside -> Springboard / Suicide Dive!
    if (
      !this.isActorBusy(p) &&
      this.isActorInRing(p) &&
      !this.isActorInRing(r) &&
      r.pos.y < 0.7 &&
      p.nearRopeSide !== null &&
      Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z) < 4.6
    ) {
      this.launchSpringboardDive(p, r);
    }
  }

  public triggerFinisher() {
    if (this.matchPhase !== 'active') return;
    const p = this.player;
    const r = this.rival;
    if (p.momentum < 100 || this.isActorBusy(p) || p.perchedCornerIdx !== null) return;

    const dist = Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z);
    if (dist > 2.25 || Math.abs(r.pos.y - p.pos.y) > 0.75) return;
    if (r.state === 'knockdown' || r.script) return;

    this.breakGrappleIfAny(p, r);
    p.momentum = 0;
    this.executeGrappleThrow(p, r, {
      atkAnim: 'finisher-exec',
      vicAnim: 'sell-finisher',
      name: 'FINISHER: TITANIUM BOMB',
      dur: 0.96,
      dmg: 32,
      offsetZ: 0.74,
    });
  }

  // ==================== SHARED WRESTLING MECHANICS ====================

  private breakGrappleIfAny(a: WrestlerActor, b: WrestlerActor) {
    if (a.inGrappleWith === b) {
      a.inGrappleWith = null;
      a.grappleTimer = 0;
      if (a.state === 'grapple-lock') a.state = 'idle';
    }
    if (b.inGrappleWith === a) {
      b.inGrappleWith = null;
      b.grappleTimer = 0;
      if (b.state === 'grapple-lock') b.state = 'idle';
    }
  }

  private startGrappleLock(attacker: WrestlerActor, defender: WrestlerActor) {
    attacker.vel.set(0, 0, 0);
    defender.vel.set(0, 0, 0);
    attacker.navQueue.length = 0;
    defender.navQueue.length = 0;

    const dx = defender.pos.x - attacker.pos.x;
    const dz = defender.pos.z - attacker.pos.z;
    const yaw = Math.atan2(dx, dz);
    attacker.yaw = yaw;
    defender.yaw = yaw + Math.PI;

    // Pull smoothly into lockup spacing (~0.76m apart) without clipping ropes
    const midX = (attacker.pos.x + defender.pos.x) * 0.5;
    const midZ = (attacker.pos.z + defender.pos.z) * 0.5;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    attacker.pos.x = midX - fx * 0.38;
    attacker.pos.z = midZ - fz * 0.38;
    defender.pos.x = midX + fx * 0.38;
    defender.pos.z = midZ + fz * 0.38;

    attacker.inGrappleWith = defender;
    defender.inGrappleWith = attacker;
    attacker.grappleTimer = 2.6;
    defender.grappleTimer = 2.6;
    attacker.state = 'grapple-lock';
    defender.state = 'grapple-lock';
    if (attacker.id === 'player') {
      this.setMoveBanner('COLLAR & ELBOW TIE-UP');
    }
  }

  private executeGrappleThrow(
    attacker: WrestlerActor,
    victim: WrestlerActor,
    spec: {
      atkAnim: WrestlerAnimState;
      vicAnim: WrestlerAnimState;
      name: string;
      dur: number;
      dmg: number;
      offsetZ: number;
    },
  ) {
    this.breakGrappleIfAny(attacker, victim);
    attacker.vel.set(0, 0, 0);
    victim.vel.set(0, 0, 0);

    const yaw = Math.atan2(victim.pos.x - attacker.pos.x, victim.pos.z - attacker.pos.z);
    attacker.yaw = yaw;
    victim.yaw = yaw + Math.PI;

    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    victim.pos.x = attacker.pos.x + fx * spec.offsetZ;
    victim.pos.z = attacker.pos.z + fz * spec.offsetZ;

    attacker.attackCooldown = spec.dur + 0.2;
    attacker.move = {
      role: 'attacker',
      moveName: spec.name,
      anim: spec.atkAnim,
      elapsed: 0,
      duration: spec.dur,
      hitTime: spec.dur * 0.65,
      hitApplied: false,
      damage: spec.dmg,
      heavyKnockdown: true,
      range: 2.0,
      partner: victim,
    };
    attacker.state = spec.atkAnim;
    attacker.stateTimer = 0;
    attacker.phaseDuration = spec.dur;

    victim.move = {
      role: 'victim',
      moveName: spec.name,
      anim: spec.vicAnim,
      elapsed: 0,
      duration: spec.dur,
      hitTime: spec.dur * 0.65,
      hitApplied: false,
      damage: spec.dmg,
      heavyKnockdown: true,
      range: 2.0,
      partner: attacker,
    };
    victim.state = spec.vicAnim;
    victim.stateTimer = 0;
    victim.phaseDuration = spec.dur;

    this.setMoveBanner(spec.name.toUpperCase());
  }

  private executeIrishWhip(
    attacker: WrestlerActor,
    victim: WrestlerActor,
    dirX: number,
    dirZ: number,
  ) {
    this.breakGrappleIfAny(attacker, victim);
    attacker.vel.set(0, 0, 0);
    attacker.yaw = Math.atan2(dirX, dirZ);
    attacker.state = 'whip-throw';
    attacker.stateTimer = 0;
    attacker.phaseDuration = 0.42;
    attacker.move = {
      role: 'attacker',
      moveName: 'Irish Whip',
      anim: 'whip-throw',
      elapsed: 0,
      duration: 0.42,
      hitTime: 0.18,
      hitApplied: false,
      damage: 2,
      heavyKnockdown: false,
      range: 2.5,
      partner: victim,
    };

    victim.script = null;
    victim.move = null;
    victim.whipTimer = 1.25;
    victim.vel.set(dirX * 6.4, 0, dirZ * 6.4);
    victim.yaw = Math.atan2(dirX, dirZ);
    victim.state = 'run';
    victim.momentum = Math.max(0, victim.momentum - 4);
    attacker.momentum = Math.min(100, attacker.momentum + 10);
    this.callbacks.onRopeImpactSound?.(0.35);
    this.setMoveBanner('IRISH WHIP');
  }

  private startCornerClimb(actor: WrestlerActor, cornerIdx: number) {
    const perch = TURNBUCKLE_PERCHES[cornerIdx];
    actor.vel.set(0, 0, 0);
    actor.navQueue.length = 0;
    actor.perchedCornerIdx = cornerIdx;
    const faceRingYaw = Math.atan2(-perch.x, -perch.z);

    actor.state = 'corner-climb';
    actor.stateTimer = 0;
    actor.phaseDuration = 0.56;
    actor.script = {
      kind: 'corner-climb',
      elapsed: 0,
      duration: 0.56,
      startPos: actor.pos.clone(),
      endPos: new THREE.Vector3(perch.x, 2.28, perch.z),
      startYaw: actor.yaw,
      endYaw: faceRingYaw,
      side: 0,
      t: 0.5,
      outX: 0,
      outZ: 0,
      queuedNext: 'corner-perch',
    };
    if (actor.id === 'player') {
      this.setMoveBanner('CLIMBING TOP ROPE');
    }
  }

  private descendFromTurnbuckle(actor: WrestlerActor) {
    const cIdx = actor.perchedCornerIdx ?? 0;
    const perch = TURNBUCKLE_PERCHES[cIdx];
    const inDirX = -Math.sign(perch.x);
    const inDirZ = -Math.sign(perch.z);
    actor.perchedCornerIdx = null;
    actor.state = 'apron-step-down';
    actor.stateTimer = 0;
    actor.phaseDuration = 0.48;
    actor.script = {
      kind: 'corner-descend',
      elapsed: 0,
      duration: 0.48,
      startPos: actor.pos.clone(),
      endPos: new THREE.Vector3(perch.x + inDirX * 0.65, 1.062, perch.z + inDirZ * 0.65),
      startYaw: actor.yaw,
      endYaw: Math.atan2(inDirX, inDirZ),
      side: 0,
      t: 0.5,
      outX: 0,
      outZ: 0,
    };
  }

  private launchTopRopeDive(attacker: WrestlerActor, target: WrestlerActor) {
    attacker.perchedCornerIdx = null;
    const dx = target.pos.x - attacker.pos.x;
    const dz = target.pos.z - attacker.pos.z;
    const dist = Math.max(0.5, Math.hypot(dx, dz));
    const maxDiveDist = 5.4;
    const clampScale = dist > maxDiveDist ? maxDiveDist / dist : 1;

    const landX = attacker.pos.x + dx * clampScale;
    const landZ = attacker.pos.z + dz * clampScale;
    const landSurf = sampleArenaSurface(landX, landZ, Math.abs(landX) < 3.1 && Math.abs(landZ) < 3.1 ? 1.06 : 0.2);

    const endPos = new THREE.Vector3(landX, landSurf.y, landZ);
    const dum = new THREE.Vector3();
    resolveArenaCollisions(endPos, dum, attacker.radius);

    const dur = THREE.MathUtils.clamp(0.45 + dist * 0.08, 0.54, 0.84);
    attacker.state = 'diving-attack';
    attacker.stateTimer = 0;
    attacker.phaseDuration = dur;
    attacker.script = {
      kind: 'diving-attack',
      elapsed: 0,
      duration: dur,
      startPos: attacker.pos.clone(),
      endPos,
      startYaw: attacker.yaw,
      endYaw: Math.atan2(dx, dz),
      side: 0,
      t: 0.5,
      outX: 0,
      outZ: 0,
      impactDelivered: false,
    };
    this.setMoveBanner('TOP-ROPE FLYING CROSSBODY!');
  }

  private launchSpringboardDive(attacker: WrestlerActor, target: WrestlerActor) {
    const dx = target.pos.x - attacker.pos.x;
    const dz = target.pos.z - attacker.pos.z;
    const landX = THREE.MathUtils.clamp(target.pos.x, -6.5, 6.5);
    const landZ = THREE.MathUtils.clamp(target.pos.z, -6.5, 6.5);
    const landSurf = sampleArenaSurface(landX, landZ, 0.1);
    const endPos = new THREE.Vector3(landX, landSurf.y, landZ);
    const dum = new THREE.Vector3();
    resolveArenaCollisions(endPos, dum, attacker.radius);

    attacker.state = 'springboard-attack';
    attacker.stateTimer = 0;
    attacker.phaseDuration = 0.68;
    attacker.script = {
      kind: 'springboard-attack',
      elapsed: 0,
      duration: 0.68,
      startPos: attacker.pos.clone(),
      endPos,
      startYaw: attacker.yaw,
      endYaw: Math.atan2(dx, dz),
      side: 0,
      t: 0.5,
      outX: 0,
      outZ: 0,
      impactDelivered: false,
    };
    this.setMoveBanner('SUICIDE DIVE TO RINGSIDE!');
  }

  private startPinAttempt(attacker: WrestlerActor, defender: WrestlerActor) {
    this.matchPhase = 'pinning';
    this.pinElapsed = 0;
    this.pinCount = 0;
    this.pinAttacker = attacker;
    this.pinDefender = defender;
    // Kickout chance scales cleanly with defender HP: >32 HP almost always kicks out at 2!
    this.pinWillKickout = defender.hp > 28;

    attacker.vel.set(0, 0, 0);
    defender.vel.set(0, 0, 0);
    attacker.navQueue.length = 0;
    defender.navQueue.length = 0;

    attacker.pos.x = defender.pos.x - Math.sin(defender.yaw) * 0.45;
    attacker.pos.z = defender.pos.z - Math.cos(defender.yaw) * 0.45;
    attacker.yaw = Math.atan2(defender.pos.x - attacker.pos.x, defender.pos.z - attacker.pos.z);

    attacker.state = 'pin-cover';
    defender.state = 'pin-trapped';
    this.setMoveBanner('PIN ATTEMPT!');
  }

  // ==================== MAIN UPDATE LOOP ====================

  public update(dt: number, camera: THREE.Camera, input: PlayerInputState) {
    const clampedDt = Math.min(Math.max(dt, 0.001), 0.045);
    this.clockElapsed += clampedDt;

    if (this.moveBannerTimer > 0) {
      this.moveBannerTimer = Math.max(0, this.moveBannerTimer - clampedDt);
      if (this.moveBannerTimer === 0) this.lastMoveBanner = null;
    }

    // Regenerate stamina gently when not sprinting/attacking
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (a.attackCooldown > 0) a.attackCooldown = Math.max(0, a.attackCooldown - clampedDt);
      if (a.reverseCooldown > 0) a.reverseCooldown = Math.max(0, a.reverseCooldown - clampedDt);
      if (a.state !== 'run' && !a.move && a.script === null) {
        a.stamina = Math.min(100, a.stamina + 14 * clampedDt);
      }
    }

    if (this.matchPhase === 'entrance-rival' || this.matchPhase === 'entrance-player') {
      this.stepEntranceChoreography(clampedDt);
    } else if (this.matchPhase === 'pinning') {
      this.stepPinningSequence(clampedDt);
    } else if (this.matchPhase === 'active') {
      this.stepPlayerIntent(clampedDt, camera, input);
      this.stepRivalAi(clampedDt);
    } else if (this.matchPhase === 'finished') {
      // Winner holds victory pose while loser recovers gently
      for (let i = 0; i < this.actors.length; i++) {
        this.actors[i].vel.multiplyScalar(Math.exp(-8 * clampedDt));
      }
    }

    for (let i = 0; i < this.actors.length; i++) {
      this.stepActiveMove(this.actors[i], clampedDt);
      this.stepActorPhysics(this.actors[i], clampedDt);
    }

    this.resolveActorPairCollision();

    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      const speed = Math.hypot(a.vel.x, a.vel.z);
      const phaseRatio = a.phaseDuration > 0 ? a.stateTimer / a.phaseDuration : 0;
      a.rig.setMoveRole?.(a.move?.role ?? null);
      a.rig.updateAnimation(a.state, clampedDt, phaseRatio, speed / 5.8);
      a.rig.root.position.copy(a.pos);
      a.rig.root.rotation.y = a.yaw;
    }
  }

  private stepEntranceChoreography(dt: number) {
    const actor = this.matchPhase === 'entrance-rival' ? this.rival : this.player;
    const style: PyroStyle = this.matchPhase === 'entrance-rival' ? 'cobalt' : 'gold';
    const targetCorner =
      this.matchPhase === 'entrance-rival'
        ? new THREE.Vector3(1.35, 1.062, -0.2)
        : new THREE.Vector3(-1.35, 1.062, 0.2);

    actor.entranceStepTimer += dt;

    if (actor.entranceStageStep === 0) {
      // Step 0: Walk onto stage lip & strike entrance pose with pyro!
      actor.rig.root.visible = true;
      actor.pos.z = THREE.MathUtils.damp(actor.pos.z, -18.5, 4.5, dt);
      actor.pos.y = 1.38;
      actor.yaw = 0;
      actor.state = actor.entranceStepTimer < 0.7 ? 'entrance-walk' : 'entrance-pose';
      actor.stateTimer = Math.max(0, actor.entranceStepTimer - 0.7);
      actor.phaseDuration = 1.4;
      if (actor.entranceStepTimer >= 2.0) {
        actor.entranceStageStep = 1;
        actor.entranceStepTimer = 0;
      }
    } else if (actor.entranceStageStep === 1) {
      // Step 1: Walk smoothly down the solid black ramp to ringside mat
      const walkSpeed = 3.25;
      actor.vel.set(0, 0, walkSpeed);
      actor.yaw = 0;
      actor.state = 'entrance-walk';
      if (actor.pos.z >= -4.85) {
        actor.vel.set(0, 0, 0);
        actor.entranceStageStep = 2;
        actor.entranceStepTimer = 0;
        // Slide smoothly under bottom North (-Z) rope into the ring!
        const portal = findNearestRopePortal(0, -3.03);
        this.startApronStepUp(actor, portal, true);
      }
    } else if (actor.entranceStageStep === 2) {
      // Wait for step-up + slide-under-rope traversal into ring to complete
      if (actor.script === null && this.isActorInRing(actor)) {
        actor.entranceStageStep = 3;
        actor.entranceStepTimer = 0;
        actor.yaw = 0;
        actor.state = 'entrance-pose';
        actor.phaseDuration = 1.35;
        this.callbacks.onPyroBurst?.(style, 'corner');
      }
    } else if (actor.entranceStageStep === 3) {
      // Center-ring pose then take match starting position
      actor.state = 'entrance-pose';
      actor.stateTimer = actor.entranceStepTimer;
      if (actor.entranceStepTimer >= 1.25) {
        actor.entranceStageStep = 4;
        actor.entranceStepTimer = 0;
        actor.navQueue = [{ x: targetCorner.x, z: targetCorner.z, action: 'normal' }];
      }
    } else if (actor.entranceStageStep === 4) {
      if (actor.navQueue.length > 0) {
        this.followNavQueue(actor, dt, 2.5);
      } else {
        actor.vel.set(0, 0, 0);
        actor.state = 'idle';
        actor.yaw = this.matchPhase === 'entrance-rival' ? -Math.PI * 0.5 : Math.PI * 0.5;
        if (this.matchPhase === 'entrance-rival') {
          // Next up: Player Entrance!
          this.matchPhase = 'entrance-player';
          this.player.rig.root.visible = true;
          this.player.pos.set(0, 1.38, -20.2);
          this.player.entranceStageStep = 0;
          this.player.entranceStepTimer = 0;
          this.callbacks.onEntranceStart?.('player');
          this.callbacks.onPyroBurst?.('gold', 'stage');
        } else {
          // Both wrestlers ready inside the ring -> Start the match!
          this.callbacks.onEntranceStop?.();
          this.rival.yaw = -Math.PI * 0.5;
          this.player.yaw = Math.PI * 0.5;
          this.matchPhase = 'active';
          this.callbacks.onRingBell?.();
          this.setMoveBanner('BELL RINGS — FIGHT!');
        }
      }
    }
  }

  private stepPinningSequence(dt: number) {
    this.pinElapsed += dt;
    const atk = this.pinAttacker;
    const def = this.pinDefender;
    if (!atk || !def) {
      this.matchPhase = 'active';
      return;
    }

    atk.state = 'pin-cover';
    def.state = 'pin-trapped';

    if (this.pinCount === 0 && this.pinElapsed >= 0.7) {
      this.pinCount = 1;
      this.callbacks.onRefCount?.(1);
    } else if (this.pinCount === 1 && this.pinElapsed >= 1.65) {
      this.pinCount = 2;
      this.callbacks.onRefCount?.(2);
    } else if (this.pinCount === 2 && this.pinWillKickout && this.pinElapsed >= 2.25) {
      // Dramatic 2-count kickout!
      this.matchPhase = 'active';
      this.pinCount = 0;
      atk.state = 'idle';
      atk.vel.set(-Math.sin(atk.yaw) * 2.5, 0, -Math.cos(atk.yaw) * 2.5);
      def.state = 'get-up';
      def.stateTimer = 0;
      def.phaseDuration = 0.58;
      def.momentum = Math.min(100, def.momentum + 18);
      this.callbacks.onImpactSound?.(false);
      this.setMoveBanner(`${def.displayName} KICKS OUT AT 2!`);
      this.pinAttacker = null;
      this.pinDefender = null;
      return;
    } else if (this.pinCount === 2 && !this.pinWillKickout && this.pinElapsed >= 2.65) {
      // 1... 2... 3!! Match won!
      this.pinCount = 3;
      this.callbacks.onRefCount?.(3);
      this.callbacks.onRingBell?.();
      this.matchPhase = 'finished';
      this.winnerName = atk.displayName;
      atk.state = 'victory-pose';
      atk.stateTimer = 0;
      atk.phaseDuration = 2.0;
      def.state = 'knockdown';
      this.callbacks.onPyroBurst?.(atk.id === 'player' ? 'gold' : 'cobalt', 'corner');
      this.setMoveBanner(`WINNER: ${atk.displayName}`);
    }
  }

  private stepPlayerIntent(dt: number, camera: THREE.Camera, input: PlayerInputState) {
    const p = this.player;
    if (
      p.script ||
      p.move ||
      p.inGrappleWith ||
      p.perchedCornerIdx !== null ||
      p.state === 'knockdown' ||
      p.state === 'get-up' ||
      p.state === 'hit-stagger' ||
      p.state === 'reverse-counter' ||
      p.state === 'rope-rebound'
    ) {
      if (p.inGrappleWith) {
        p.grappleTimer -= dt;
        if (p.grappleTimer <= 0) {
          this.breakGrappleIfAny(p, p.inGrappleWith);
        }
      }
      // Pressing joystick back toward center while perched climbs down cleanly
      if (p.perchedCornerIdx !== null && Math.hypot(input.moveX, input.moveZ) > 0.65) {
        this.descendFromTurnbuckle(p);
      }
      return;
    }

    const rawMag = Math.min(1, Math.hypot(input.moveX, input.moveZ));
    if (rawMag > 0.08) {
      camera.getWorldDirection(_camDir);
      _camDir.y = 0;
      if (_camDir.lengthSq() < 1e-6) _camDir.set(0, 0, -1);
      _camDir.normalize();
      _camRight.crossVectors(_camDir, _upAxis).normalize();

      // Convert joystick (moveX right, moveZ forward-up) to camera-relative world vector
      _moveVec.set(0, 0, 0);
      _moveVec.addScaledVector(_camDir, input.moveZ);
      _moveVec.addScaledVector(_camRight, input.moveX);
      _moveVec.normalize();

      const wantsSprint = (input.sprint || rawMag > 0.86) && p.stamina > 6;
      if (wantsSprint) {
        p.stamina = Math.max(0, p.stamina - 16 * dt);
      }
      const targetSpeed = wantsSprint ? 5.85 : THREE.MathUtils.lerp(1.5, 3.0, rawMag);
      p.vel.x = THREE.MathUtils.damp(p.vel.x, _moveVec.x * targetSpeed, 16, dt);
      p.vel.z = THREE.MathUtils.damp(p.vel.z, _moveVec.z * targetSpeed, 16, dt);
      p.yaw = dampYaw(p.yaw, Math.atan2(_moveVec.x, _moveVec.z), 15, dt);
      p.state = wantsSprint ? 'run' : 'walk';
    } else if (p.whipTimer <= 0) {
      p.vel.x = THREE.MathUtils.damp(p.vel.x, 0, 15, dt);
      p.vel.z = THREE.MathUtils.damp(p.vel.z, 0, 15, dt);
      if (Math.hypot(p.vel.x, p.vel.z) < 0.15) {
        p.vel.set(0, 0, 0);
        if (p.state !== 'barricade-lean') p.state = 'idle';
      } else {
        p.state = 'walk';
      }
    }
  }

  private stepRivalAi(dt: number) {
    const r = this.rival;
    const p = this.player;

    if (r.inGrappleWith) {
      r.grappleTimer -= dt;
      // AI executes a throw or whip ~0.65s after initiating tie-up unless player acts first!
      if (r.grappleTimer < 1.95 && r.grappleTimer > 1.7 && r.attackCooldown <= 0) {
        const roll = Math.random();
        if (roll < 0.3) {
          const toRope = findNearestRopePortal(r.pos.x, r.pos.z);
          this.executeIrishWhip(r, p, toRope.outX, toRope.outZ);
        } else {
          const moveSpec = GRAPPLE_THROWS[r.grappleCursor % GRAPPLE_THROWS.length];
          r.grappleCursor++;
          this.executeGrappleThrow(r, p, moveSpec);
        }
      } else if (r.grappleTimer <= 0) {
        this.breakGrappleIfAny(r, p);
      }
      return;
    }

    if (r.perchedCornerIdx !== null) {
      // Perched AI launches top-rope dive after brief dramatic beat!
      r.aiDecisionTimer -= dt;
      if (r.aiDecisionTimer <= 0) {
        this.launchTopRopeDive(r, p);
      }
      return;
    }

    if (this.isActorBusy(r) || r.whipTimer > 0) {
      if (r.whipTimer > 0) r.state = 'run';
      return;
    }

    const dx = p.pos.x - r.pos.x;
    const dz = p.pos.z - r.pos.z;
    const dist = Math.hypot(dx, dz);
    const sameZone = this.isActorInRing(r) === this.isActorInRing(p);

    // If player is knocked down inside ring with low HP -> AI goes for pin!
    if (
      p.state === 'knockdown' &&
      this.isActorInRing(r) &&
      this.isActorInRing(p) &&
      p.hp <= 42 &&
      dist < 2.2
    ) {
      this.startPinAttempt(r, p);
      return;
    }

    // If opponent & player are separated across ring/barricade, pathfind smartly!
    if (!sameZone || dist > 3.6) {
      r.aiDecisionTimer -= dt;
      if (r.aiDecisionTimer <= 0 || r.navQueue.length === 0) {
        r.aiDecisionTimer = 0.65;
        const ang = Math.atan2(r.pos.x - p.pos.x, r.pos.z - p.pos.z);
        _tempGoal.set(p.pos.x + Math.sin(ang) * 1.3, p.pos.y, p.pos.z + Math.cos(ang) * 1.3);
        r.navQueue = this.navGrid.findPath(r.pos.x, r.pos.z, _tempGoal.x, _tempGoal.z, false);
      }
      if (r.navQueue.length > 0) {
        this.followNavQueue(r, dt, dist > 4.2 ? 4.3 : 2.65);
        return;
      }
    } else {
      r.navQueue.length = 0;
    }

    // Within ring/brawl proximity: tactical pacing & varied wrestling offense
    r.yaw = dampYaw(r.yaw, Math.atan2(dx, dz), 9, dt);
    r.aiDecisionTimer -= dt;

    if (r.aiDecisionTimer <= 0 && r.attackCooldown <= 0) {
      r.aiDecisionTimer = 0.65 + Math.random() * 0.55;

      // Occasional turnbuckle climb when player is knocked down near center!
      if (
        p.state === 'knockdown' &&
        r.nearCornerIdx !== null &&
        this.isActorInRing(r) &&
        Math.random() < 0.45
      ) {
        this.startCornerClimb(r, r.nearCornerIdx);
        r.aiDecisionTimer = 0.42;
        return;
      }

      if (dist <= 1.75 && !this.isActorBusy(p) && p.perchedCornerIdx === null) {
        const roll = Math.random();
        if (r.momentum >= 100 && roll < 0.5) {
          r.momentum = 0;
          this.executeGrappleThrow(r, p, {
            atkAnim: 'finisher-exec',
            vicAnim: 'sell-finisher',
            name: 'VORTEX FINISHER',
            dur: 0.96,
            dmg: 28,
            offsetZ: 0.74,
          });
          return;
        }
        if (roll < 0.36) {
          this.startGrappleLock(r, p);
          return;
        }
        if (roll < 0.85) {
          const spec = STANDING_STRIKES[r.strikeCursor % STANDING_STRIKES.length];
          r.strikeCursor++;
          r.attackCooldown = spec.dur + 0.38;
          r.move = {
            role: 'attacker',
            moveName: spec.name,
            anim: spec.anim,
            elapsed: 0,
            duration: spec.dur + 0.14, // slightly longer readable windup so player can Reverse!
            hitTime: spec.hit + 0.12,
            hitApplied: false,
            damage: spec.dmg,
            heavyKnockdown: false,
            range: 1.85,
            partner: p,
          };
          r.state = spec.anim;
          r.stateTimer = 0;
          r.phaseDuration = spec.dur + 0.14;
          return;
        }
      }
      r.aiPlan = dist > 1.75 ? 'approach' : Math.random() < 0.5 ? 'circle' : 'approach';
    }

    if (dist > 1.55 || r.aiPlan === 'approach') {
      const inv = 1 / Math.max(0.1, dist);
      r.vel.x = THREE.MathUtils.damp(r.vel.x, dx * inv * 2.45, 10, dt);
      r.vel.z = THREE.MathUtils.damp(r.vel.z, dz * inv * 2.45, 10, dt);
      r.state = 'walk';
    } else if (r.aiPlan === 'circle') {
      const inv = 1 / Math.max(0.1, dist);
      r.vel.x = THREE.MathUtils.damp(r.vel.x, -dz * inv * 1.4, 8, dt);
      r.vel.z = THREE.MathUtils.damp(r.vel.z, dx * inv * 1.4, 8, dt);
      r.state = 'walk';
    } else {
      r.vel.x = THREE.MathUtils.damp(r.vel.x, 0, 12, dt);
      r.vel.z = THREE.MathUtils.damp(r.vel.z, 0, 12, dt);
      r.state = 'idle';
    }
  }

  private stepActiveMove(actor: WrestlerActor, dt: number) {
    const m = actor.move;
    if (!m) return;

    m.elapsed += dt;
    actor.state = m.anim;
    actor.stateTimer = m.elapsed;
    actor.phaseDuration = m.duration;

    if (m.role === 'attacker' && !m.hitApplied && m.elapsed >= m.hitTime) {
      m.hitApplied = true;
      const target = m.partner;
      const dist = Math.hypot(target.pos.x - actor.pos.x, target.pos.z - actor.pos.z);

      if (
        dist <= m.range &&
        Math.abs(target.pos.y - actor.pos.y) < 1.1 &&
        target.state !== 'reverse-counter' &&
        target.script?.kind !== 'diving-attack'
      ) {
        target.hp = Math.max(0, target.hp - m.damage);
        actor.momentum = Math.min(100, actor.momentum + m.damage * 1.15);
        target.momentum = Math.min(100, target.momentum + m.damage * 0.4);
        this.callbacks.onImpactSound?.(m.heavyKnockdown);

        // Apply hit reaction only for non-synchronized throws (synchronized throws already animate seller!)
        if (!target.move) {
          if (m.heavyKnockdown) {
            const nx = Math.sin(actor.yaw);
            const nz = Math.cos(actor.yaw);
            target.state = 'knockdown';
            target.stateTimer = 0;
            target.phaseDuration = 1.65;
            target.vel.set(nx * 3.8, 0, nz * 3.8);
            this.setMoveBanner(m.moveName.toUpperCase());
          } else {
            target.state = 'hit-stagger';
            target.stateTimer = 0;
            target.phaseDuration = 0.36;
            target.vel.set(Math.sin(actor.yaw) * 1.6, 0, Math.cos(actor.yaw) * 1.6);
          }
        }
      }
    }

    if (m.elapsed >= m.duration) {
      const wasVictimThrow = m.role === 'victim';
      const wasHeavyAtk = m.role === 'attacker' && m.heavyKnockdown;
      actor.move = null;
      actor.vel.set(0, 0, 0);

      if (wasVictimThrow) {
        actor.state = 'knockdown';
        actor.stateTimer = 0;
        actor.phaseDuration = 1.95;
      } else if (wasHeavyAtk && (m.anim === 'move-suplex' || m.anim === 'move-ddt' || m.anim === 'move-neckbreaker')) {
        actor.state = 'get-up';
        actor.stateTimer = 0;
        actor.phaseDuration = 0.45;
      } else {
        actor.state = 'idle';
        actor.stateTimer = 0;
      }
    }
  }

  private followNavQueue(actor: WrestlerActor, dt: number, moveSpeed: number) {
    const wp = actor.navQueue[0];
    if (!wp) return;

    const dx = wp.x - actor.pos.x;
    const dz = wp.z - actor.pos.z;
    const dist = Math.hypot(dx, dz);

    if (wp.action && wp.action !== 'normal') {
      if (wp.action === 'exit-ring-between' || wp.action === 'exit-ring-slide') {
        if (dist < 0.72 && this.isActorInRing(actor)) {
          actor.navQueue.shift();
          const portal = findNearestRopePortal(wp.x, wp.z);
          this.startRingExit(
            actor,
            wp.side ?? portal.side,
            wp.t ?? portal.t,
            wp.action === 'exit-ring-slide',
          );
          return;
        }
      } else if (wp.action === 'enter-ring-between' || wp.action === 'enter-ring-slide') {
        if (dist < 0.95 && !this.isActorInRing(actor)) {
          actor.navQueue.shift();
          const portal = findNearestRopePortal(wp.x, wp.z);
          const slide = wp.action === 'enter-ring-slide';
          if (actor.pos.y >= 0.72) {
            this.startRingEnter(actor, portal.side, portal.t, slide);
          } else {
            this.startApronStepUp(actor, portal, slide);
          }
          return;
        }
      } else if (wp.action === 'barricade-vault' && wp.barricade) {
        if (dist < 1.08) {
          actor.navQueue.shift();
          const seg = wp.barricade;
          const abx = seg.x2 - seg.x1;
          const abz = seg.z2 - seg.z1;
          const t = THREE.MathUtils.clamp(
            ((actor.pos.x - seg.x1) * abx + (actor.pos.z - seg.z1) * abz) /
              (abx * abx + abz * abz),
            0.08,
            0.92,
          );
          const cx = seg.x1 + abx * t;
          const cz = seg.z1 + abz * t;
          const sideDot = (actor.pos.x - cx) * seg.outX + (actor.pos.z - cz) * seg.outZ;
          const sideSign = sideDot >= 0 ? 1 : -1;
          this.startBarricadeTraversal(actor, seg, cx, cz, sideSign, false);
          return;
        }
      }
    }

    if (dist < 0.32) {
      actor.navQueue.shift();
      return;
    }

    const nx = dx / dist;
    const nz = dz / dist;
    actor.vel.x = THREE.MathUtils.damp(actor.vel.x, nx * moveSpeed, 14, dt);
    actor.vel.z = THREE.MathUtils.damp(actor.vel.z, nz * moveSpeed, 14, dt);
    actor.yaw = dampYaw(actor.yaw, Math.atan2(nx, nz), 12, dt);
    actor.state = this.matchPhase !== 'active' ? 'entrance-walk' : moveSpeed > 3.6 ? 'run' : 'walk';
  }

  private stepActorPhysics(actor: WrestlerActor, dt: number) {
    if (actor.whipTimer > 0) actor.whipTimer = Math.max(0, actor.whipTimer - dt);

    // Held on top turnbuckle perch
    if (actor.perchedCornerIdx !== null && !actor.script) {
      const perch = TURNBUCKLE_PERCHES[actor.perchedCornerIdx];
      actor.pos.set(perch.x, 2.28, perch.z);
      actor.vel.set(0, 0, 0);
      const other = actor.id === 'player' ? this.rival : this.player;
      actor.yaw = dampYaw(actor.yaw, Math.atan2(other.pos.x - perch.x, other.pos.z - perch.z), 10, dt);
      actor.state = 'corner-perch';
      return;
    }

    if (actor.script) {
      this.stepTraversalScript(actor, actor.script, dt);
      return;
    }

    if (actor.state === 'rope-rebound' || actor.state === 'hit-stagger' || actor.state === 'reverse-counter') {
      actor.stateTimer += dt;
      if (actor.state !== 'rope-rebound') {
        const damp = Math.exp(-7 * dt);
        actor.vel.x *= damp;
        actor.vel.z *= damp;
      }
      if (actor.stateTimer >= actor.phaseDuration) {
        actor.state = Math.hypot(actor.vel.x, actor.vel.z) > 3.3 ? 'run' : 'idle';
      }
    } else if (actor.state === 'knockdown') {
      actor.stateTimer += dt;
      const damp = Math.exp(-5.2 * dt);
      actor.vel.x *= damp;
      actor.vel.z *= damp;
      if (actor.stateTimer >= actor.phaseDuration) {
        actor.state = 'get-up';
        actor.stateTimer = 0;
        actor.phaseDuration = 0.62;
      }
    } else if (actor.state === 'get-up') {
      actor.stateTimer += dt;
      actor.vel.x *= Math.exp(-10 * dt);
      actor.vel.z *= Math.exp(-10 * dt);
      if (actor.stateTimer >= actor.phaseDuration) {
        actor.state = 'idle';
        actor.stateTimer = 0;
      }
    }

    const inRingFootprint =
      actor.pos.y >= 0.72 && Math.abs(actor.pos.x) <= 3.75 && Math.abs(actor.pos.z) <= 3.75;

    if (inRingFootprint && actor.state !== 'pin-cover' && actor.state !== 'pin-trapped') {
      if (this.isActorInRing(actor)) {
        const contact = this.ropePhysics.stepWrestlerContact(
          {
            position: actor.pos,
            velocity: actor.vel,
            radius: actor.radius,
            minContactY: actor.state === 'knockdown' || actor.state === 'get-up' ? 1.15 : 1.38,
            maxContactY: 2.38,
            mass: 95,
          },
          dt,
        );

        actor.pos.x = contact.updatedPosition.x;
        actor.pos.z = contact.updatedPosition.z;
        actor.vel.x = contact.updatedVelocity.x;
        actor.vel.z = contact.updatedVelocity.z;

        if (contact.inContact && contact.contactSide !== null) {
          const outSpeed =
            actor.vel.x * (contact.contactSide === 1 ? 1 : contact.contactSide === 3 ? -1 : 0) +
            actor.vel.z * (contact.contactSide === 2 ? 1 : contact.contactSide === 0 ? -1 : 0);

          if (this.clockElapsed - actor.lastImpactAt > 0.35 && contact.penetration > 0.08) {
            actor.lastImpactAt = this.clockElapsed;
            this.callbacks.onRopeImpactSound?.(Math.min(1, 0.25 + contact.penetration));
          }

          const wasFast = actor.whipTimer > 0 || actor.state === 'run';
          if (
            actor.state !== 'knockdown' &&
            actor.state !== 'get-up' &&
            wasFast &&
            (contact.penetration >= 0.24 || outSpeed <= 0.8)
          ) {
            const side = contact.contactSide;
            const inX = side === 1 ? -1 : side === 3 ? 1 : 0;
            const inZ = side === 2 ? -1 : side === 0 ? 1 : 0;
            actor.vel.x = inX * 5.2 + actor.vel.x * 0.25;
            actor.vel.z = inZ * 5.2 + actor.vel.z * 0.25;
            actor.yaw = Math.atan2(actor.vel.x, actor.vel.z);
            actor.whipTimer = 0;
            actor.state = 'rope-rebound';
            actor.stateTimer = 0;
            actor.phaseDuration = 0.22;
          }
        }
      } else {
        const apMargin = 3.03 + actor.radius * 0.85;
        if (Math.abs(actor.pos.x) < apMargin && Math.abs(actor.pos.z) < apMargin) {
          const px = apMargin - Math.abs(actor.pos.x);
          const pz = apMargin - Math.abs(actor.pos.z);
          if (px < pz) {
            const sx = actor.pos.x >= 0 ? 1 : -1;
            actor.pos.x = sx * apMargin;
            if (actor.vel.x * sx < 0) actor.vel.x = 0;
          } else {
            const sz = actor.pos.z >= 0 ? 1 : -1;
            actor.pos.z = sz * apMargin;
            if (actor.vel.z * sz < 0) actor.vel.z = 0;
          }
        }
      }
    }

    actor.pos.x += actor.vel.x * dt;
    actor.pos.z += actor.vel.z * dt;

    // Guarantee actors inside the ring can stretch ropes slightly without ever slipping out onto the apron
    if (this.isActorInRing(actor) && actor.state !== 'pin-cover' && actor.state !== 'pin-trapped') {
      const ropeOuterLimit = 3.24;
      if (actor.pos.x > ropeOuterLimit) {
        actor.pos.x = ropeOuterLimit;
        if (actor.vel.x > 0) actor.vel.x = 0;
      } else if (actor.pos.x < -ropeOuterLimit) {
        actor.pos.x = -ropeOuterLimit;
        if (actor.vel.x < 0) actor.vel.x = 0;
      }
      if (actor.pos.z > ropeOuterLimit) {
        actor.pos.z = ropeOuterLimit;
        if (actor.vel.z > 0) actor.vel.z = 0;
      } else if (actor.pos.z < -ropeOuterLimit) {
        actor.pos.z = -ropeOuterLimit;
        if (actor.vel.z < 0) actor.vel.z = 0;
      }
    }

    const collision = resolveArenaCollisions(actor.pos, actor.vel, actor.radius);

    // Check corner turnbuckle proximity inside ring
    actor.nearCornerIdx = null;
    if (this.isActorInRing(actor)) {
      let bestC = Infinity;
      for (let i = 0; i < CORNER_POSTS.length; i++) {
        const d = Math.hypot(actor.pos.x - CORNER_POSTS[i].x, actor.pos.z - CORNER_POSTS[i].z);
        if (d < 1.55 && d < bestC) {
          bestC = d;
          actor.nearCornerIdx = i;
        }
      }
    }

    const portal = findNearestRopePortal(actor.pos.x, actor.pos.z);
    if (
      (this.isActorInRing(actor) && portal.distToRope < 1.35) ||
      (!this.isActorInRing(actor) && portal.distToRope < 1.6 && actor.pos.y < 1.35)
    ) {
      actor.nearRopeSide = portal.side;
      actor.nearRopeT = portal.t;
    } else {
      actor.nearRopeSide = null;
    }

    if (collision.touchingBarricade) {
      const hit = collision.touchingBarricade;
      actor.nearBarricadeSeg = hit.segment;
      actor.nearBarricadeClosestX = hit.closestX;
      actor.nearBarricadeClosestZ = hit.closestZ;
      actor.nearBarricadeSideSign = hit.sideSign;

      if (
        actor.id === 'player' &&
        (actor.state === 'walk' || actor.state === 'idle') &&
        hit.dist < hit.segment.halfThick + actor.radius + 0.05 &&
        Math.hypot(actor.vel.x, actor.vel.z) < 0.65
      ) {
        actor.state = 'barricade-lean';
        actor.yaw = Math.atan2(-hit.segment.outX * hit.sideSign, -hit.segment.outZ * hit.sideSign);
      }
    } else {
      actor.nearBarricadeSeg = null;
      if (actor.state === 'barricade-lean') actor.state = 'idle';
    }

    const ground = sampleArenaSurface(actor.pos.x, actor.pos.z, actor.pos.y);
    actor.surface = ground.surface;
    const dy = ground.y - actor.pos.y;
    if (dy >= -0.35 && dy <= 0.38) {
      actor.pos.y = THREE.MathUtils.damp(actor.pos.y, ground.y, 26, dt);
      actor.vel.y = 0;
    } else if (dy < -0.35) {
      actor.vel.y -= 18.0 * dt;
      actor.pos.y += actor.vel.y * dt;
      if (actor.pos.y <= ground.y) {
        actor.pos.y = ground.y;
        actor.vel.y = 0;
      }
    } else {
      actor.pos.y = ground.y;
      actor.vel.y = 0;
    }
  }

  private startRingExit(actor: WrestlerActor, side: number, t: number, slideUnder: boolean) {
    const portal = findNearestRopePortal(
      side === 0 || side === 2
        ? side === 0
          ? -3.03 + t * 6.06
          : 3.03 - t * 6.06
        : side === 1
          ? 3.03
          : -3.03,
      side === 1 || side === 3
        ? side === 1
          ? -3.03 + t * 6.06
          : 3.03 - t * 6.06
        : side === 2
          ? 3.03
          : -3.03,
    );
    actor.vel.set(0, 0, 0);
    actor.whipTimer = 0;
    actor.inRingSide = false;
    const faceOutYaw = Math.atan2(portal.outX, portal.outZ);

    if (slideUnder) {
      actor.state = 'rope-slide-under';
      actor.stateTimer = 0;
      actor.phaseDuration = 0.64;
      const startP = actor.pos.clone();
      startP.y = 1.062;
      actor.script = {
        kind: 'exit-slide',
        elapsed: 0,
        duration: 0.64,
        startPos: startP,
        endPos: new THREE.Vector3(
          portal.ropeX + portal.outX * 0.8,
          0.032,
          portal.ropeZ + portal.outZ * 0.8,
        ),
        startYaw: actor.yaw,
        endYaw: faceOutYaw,
        side: portal.side,
        t: portal.t,
        outX: portal.outX,
        outZ: portal.outZ,
      };
    } else {
      actor.state = 'rope-exit-between';
      actor.stateTimer = 0;
      actor.phaseDuration = 0.56;
      actor.script = {
        kind: 'exit-between',
        elapsed: 0,
        duration: 0.56,
        startPos: actor.pos.clone(),
        endPos: new THREE.Vector3(
          portal.ropeX + portal.outX * 0.24,
          1.064,
          portal.ropeZ + portal.outZ * 0.24,
        ),
        startYaw: actor.yaw,
        endYaw: faceOutYaw,
        side: portal.side,
        t: portal.t,
        outX: portal.outX,
        outZ: portal.outZ,
        queuedNext: 'apron-step-down',
      };
    }
  }

  private startApronStepDown(actor: WrestlerActor, portal: ReturnType<typeof findNearestRopePortal>) {
    actor.vel.set(0, 0, 0);
    actor.state = 'apron-step-down';
    actor.stateTimer = 0;
    actor.phaseDuration = 0.42;
    actor.script = {
      kind: 'apron-step-down',
      elapsed: 0,
      duration: 0.42,
      startPos: actor.pos.clone(),
      endPos: new THREE.Vector3(
        portal.ropeX + portal.outX * 0.82,
        0.032,
        portal.ropeZ + portal.outZ * 0.82,
      ),
      startYaw: actor.yaw,
      endYaw: Math.atan2(portal.outX, portal.outZ),
      side: portal.side,
      t: portal.t,
      outX: portal.outX,
      outZ: portal.outZ,
    };
  }

  private startApronStepUp(
    actor: WrestlerActor,
    portal: ReturnType<typeof findNearestRopePortal>,
    slideUnder: boolean,
  ) {
    actor.vel.set(0, 0, 0);
    actor.state = 'apron-step-up';
    actor.stateTimer = 0;
    actor.phaseDuration = 0.42;
    actor.script = {
      kind: 'apron-step-up',
      elapsed: 0,
      duration: 0.42,
      startPos: actor.pos.clone(),
      endPos: new THREE.Vector3(
        portal.ropeX + portal.outX * 0.24,
        1.064,
        portal.ropeZ + portal.outZ * 0.24,
      ),
      startYaw: actor.yaw,
      endYaw: Math.atan2(-portal.outX, -portal.outZ),
      side: portal.side,
      t: portal.t,
      outX: portal.outX,
      outZ: portal.outZ,
      queuedNext: slideUnder ? 'rope-enter-slide' : 'rope-enter-between',
    };
  }

  private startRingEnter(actor: WrestlerActor, side: number, t: number, slideUnder: boolean) {
    const portal = findNearestRopePortal(actor.pos.x, actor.pos.z);
    const useSide = side ?? portal.side;
    const useT = t ?? portal.t;
    const faceInYaw = Math.atan2(-portal.outX, -portal.outZ);
    actor.vel.set(0, 0, 0);

    actor.state = slideUnder ? 'rope-enter-slide' : 'rope-enter-between';
    actor.stateTimer = 0;
    actor.phaseDuration = slideUnder ? 0.56 : 0.54;
    actor.script = {
      kind: slideUnder ? 'enter-slide' : 'enter-between',
      elapsed: 0,
      duration: actor.phaseDuration,
      startPos: actor.pos.clone(),
      endPos: new THREE.Vector3(
        portal.ropeX - portal.outX * 0.58,
        1.062,
        portal.ropeZ - portal.outZ * 0.58,
      ),
      startYaw: actor.yaw,
      endYaw: faceInYaw,
      side: useSide,
      t: useT,
      outX: portal.outX,
      outZ: portal.outZ,
    };
  }

  private startBarricadeTraversal(
    actor: WrestlerActor,
    seg: BarricadeSegment,
    closestX: number,
    closestZ: number,
    sideSign: number,
    heavyTumble: boolean,
  ) {
    const dirX = -seg.outX * sideSign;
    const dirZ = -seg.outZ * sideSign;
    const crossDist = seg.halfThick + 0.54;

    const landPos = new THREE.Vector3(
      closestX + dirX * crossDist,
      sampleArenaSurface(closestX + dirX * crossDist, closestZ + dirZ * crossDist, 0.1).y,
      closestZ + dirZ * crossDist,
    );

    const dummyVel = new THREE.Vector3();
    resolveArenaCollisions(landPos, dummyVel, actor.radius, { ignoreBarricadeId: seg.id });

    actor.vel.set(0, 0, 0);
    actor.whipTimer = 0;
    actor.state = heavyTumble ? 'barricade-fall' : 'barricade-climb';
    actor.stateTimer = 0;
    actor.phaseDuration = heavyTumble ? 0.68 : 0.62;
    actor.script = {
      kind: heavyTumble ? 'barricade-fall' : 'barricade-climb',
      elapsed: 0,
      duration: actor.phaseDuration,
      startPos: actor.pos.clone(),
      endPos: landPos,
      startYaw: actor.yaw,
      endYaw: Math.atan2(dirX, dirZ),
      side: 0,
      t: 0.5,
      outX: dirX,
      outZ: dirZ,
      barricade: seg,
      queuedNext: heavyTumble ? 'knockdown' : undefined,
    };
  }

  private stepTraversalScript(actor: WrestlerActor, sc: TraversalScript, dt: number) {
    sc.elapsed += dt;
    const rawP = THREE.MathUtils.clamp(sc.elapsed / sc.duration, 0, 1);
    const p = rawP * rawP * (3 - 2 * rawP);

    actor.stateTimer = sc.elapsed;
    actor.pos.x = THREE.MathUtils.lerp(sc.startPos.x, sc.endPos.x, p);
    actor.pos.z = THREE.MathUtils.lerp(sc.startPos.z, sc.endPos.z, p);
    actor.yaw = dampYaw(actor.yaw, sc.endYaw, 18, dt);

    if (sc.kind === 'exit-between' || sc.kind === 'enter-between') {
      actor.pos.y = THREE.MathUtils.lerp(sc.startPos.y, sc.endPos.y, p);
      const part = Math.sin(rawP * Math.PI);
      this.ropePhysics.pushRopeAside(sc.side, 1, sc.t, -0.14 * part, -0.19 * part, dt);
      this.ropePhysics.pushRopeAside(sc.side, 2, sc.t, 0.2 * part, 0.21 * part, dt);
    } else if (sc.kind === 'exit-slide') {
      const dropP = THREE.MathUtils.clamp((rawP - 0.48) / 0.52, 0, 1);
      const smoothDrop = dropP * dropP * (3 - 2 * dropP);
      actor.pos.y = THREE.MathUtils.lerp(sc.startPos.y, sc.endPos.y, smoothDrop);
      const lift = Math.sin(Math.min(1, rawP / 0.65) * Math.PI);
      this.ropePhysics.pushRopeAside(sc.side, 0, sc.t, 0.14 * lift, 0.16 * lift, dt);
    } else if (sc.kind === 'enter-slide') {
      actor.pos.y = THREE.MathUtils.lerp(sc.startPos.y, sc.endPos.y, p);
      const lift = Math.sin(rawP * Math.PI);
      this.ropePhysics.pushRopeAside(sc.side, 0, sc.t, -0.12 * lift, 0.16 * lift, dt);
    } else if (sc.kind === 'apron-step-down' || sc.kind === 'apron-step-up' || sc.kind === 'corner-descend') {
      const baseLine = THREE.MathUtils.lerp(sc.startPos.y, sc.endPos.y, p);
      actor.pos.y = baseLine + Math.sin(rawP * Math.PI) * 0.14;
    } else if (sc.kind === 'corner-climb') {
      actor.pos.y = THREE.MathUtils.lerp(sc.startPos.y, sc.endPos.y, p);
    } else if (sc.kind === 'diving-attack' || sc.kind === 'springboard-attack') {
      const baseLine = THREE.MathUtils.lerp(sc.startPos.y, sc.endPos.y, rawP);
      const apex = sc.kind === 'diving-attack' ? 1.15 : 1.35;
      actor.pos.y = baseLine + Math.sin(rawP * Math.PI) * apex;

      if (!sc.impactDelivered && rawP >= 0.85) {
        sc.impactDelivered = true;
        const opp = actor.id === 'player' ? this.rival : this.player;
        const d = Math.hypot(opp.pos.x - sc.endPos.x, opp.pos.z - sc.endPos.z);
        if (d < 1.55 && opp.state !== 'reverse-counter') {
          const dmg = sc.kind === 'diving-attack' ? 20 : 17;
          opp.hp = Math.max(0, opp.hp - dmg);
          actor.momentum = Math.min(100, actor.momentum + 20);
          opp.state = 'knockdown';
          opp.stateTimer = 0;
          opp.phaseDuration = 1.85;
          opp.vel.set(Math.sin(sc.endYaw) * 2.5, 0, Math.cos(sc.endYaw) * 2.5);
          this.callbacks.onImpactSound?.(true);
        } else {
          this.callbacks.onImpactSound?.(false);
        }
      }
    } else if (sc.kind === 'barricade-climb' || sc.kind === 'barricade-fall') {
      const baseLine = THREE.MathUtils.lerp(sc.startPos.y, sc.endPos.y, p);
      const arch = sc.kind === 'barricade-fall' ? 0.58 : 0.72;
      actor.pos.y = baseLine + Math.sin(rawP * Math.PI) * arch;
    }

    if (rawP >= 1) {
      actor.pos.copy(sc.endPos);
      actor.yaw = sc.endYaw;
      const queued = sc.queuedNext;
      const portal = findNearestRopePortal(actor.pos.x, actor.pos.z);
      const wasDive = sc.kind === 'diving-attack' || sc.kind === 'springboard-attack';
      const enteredRing = sc.kind === 'enter-between' || sc.kind === 'enter-slide';
      actor.script = null;

      if (enteredRing) {
        actor.inRingSide = true;
      } else if (wasDive) {
        actor.inRingSide =
          sc.endPos.y >= 0.72 &&
          Math.abs(sc.endPos.x) <= 3.05 &&
          Math.abs(sc.endPos.z) <= 3.05;
      }

      if (queued === 'apron-step-down') {
        this.startApronStepDown(actor, portal);
      } else if (queued === 'rope-enter-between') {
        this.startRingEnter(actor, portal.side, portal.t, false);
      } else if (queued === 'rope-enter-slide') {
        this.startRingEnter(actor, portal.side, portal.t, true);
      } else if (queued === 'knockdown') {
        actor.state = 'knockdown';
        actor.stateTimer = 0;
        actor.phaseDuration = 1.05;
      } else if (queued === 'corner-perch') {
        actor.state = 'corner-perch';
        actor.stateTimer = 0;
      } else if (wasDive) {
        actor.state = 'get-up';
        actor.stateTimer = 0;
        actor.phaseDuration = 0.45;
      } else {
        actor.state = 'idle';
        actor.stateTimer = 0;
      }
    }
  }

  private resolveActorPairCollision() {
    if (this.matchPhase !== 'active') return;
    if (this.player.script || this.rival.script) return;
    if (this.player.move || this.rival.move) return;
    if (this.player.inGrappleWith || this.rival.inGrappleWith) return;
    if (Math.abs(this.player.pos.y - this.rival.pos.y) > 0.85) return;

    const dx = this.rival.pos.x - this.player.pos.x;
    const dz = this.rival.pos.z - this.player.pos.z;
    const minDist = this.player.radius + this.rival.radius;
    const dSq = dx * dx + dz * dz;

    if (dSq < minDist * minDist && dSq > 1e-6) {
      const d = Math.sqrt(dSq);
      const nx = dx / d;
      const nz = dz / d;
      const overlap = minDist - d;

      this.player.pos.x -= nx * overlap * 0.5;
      this.player.pos.z -= nz * overlap * 0.5;
      this.rival.pos.x += nx * overlap * 0.5;
      this.rival.pos.z += nz * overlap * 0.5;

      // Running collision knockdown ONLY when sprinting fast or Irish-whipped into partner
      const pSpeed = Math.hypot(this.player.vel.x, this.player.vel.z);
      const rSpeed = Math.hypot(this.rival.vel.x, this.rival.vel.z);
      const pTowards = this.player.vel.x * nx + this.player.vel.z * nz;
      const rTowards = -(this.rival.vel.x * nx + this.rival.vel.z * nz);

      if (this.rival.whipTimer > 0 && pTowards < 1.5 && this.player.state !== 'knockdown') {
        // Rebounding off ropes into player -> shoulder collision!
        this.rival.whipTimer = 0;
      } else if (
        pSpeed > 5.0 &&
        pTowards > 4.0 &&
        this.rival.state !== 'knockdown' &&
        this.rival.state !== 'get-up'
      ) {
        this.rival.state = 'knockdown';
        this.rival.stateTimer = 0;
        this.rival.phaseDuration = 1.45;
        this.rival.hp = Math.max(0, this.rival.hp - 7);
        this.rival.vel.set(nx * 3.8, 0, nz * 3.8);
        this.player.vel.multiplyScalar(0.35);
        this.callbacks.onImpactSound?.(true);
        this.setMoveBanner('RUNNING SHOULDER TACKLE');
      } else if (
        rSpeed > 5.0 &&
        rTowards > 4.0 &&
        this.player.state !== 'knockdown' &&
        this.player.state !== 'get-up'
      ) {
        this.player.state = 'knockdown';
        this.player.stateTimer = 0;
        this.player.phaseDuration = 1.45;
        this.player.hp = Math.max(0, this.player.hp - 7);
        this.player.vel.set(-nx * 3.8, 0, -nz * 3.8);
        this.rival.vel.multiplyScalar(0.35);
        this.callbacks.onImpactSound?.(true);
      } else {
        const relVn =
          (this.rival.vel.x - this.player.vel.x) * nx +
          (this.rival.vel.z - this.player.vel.z) * nz;
        if (relVn < 0) {
          this.player.vel.x += nx * relVn * 0.5;
          this.player.vel.z += nz * relVn * 0.5;
          this.rival.vel.x -= nx * relVn * 0.5;
          this.rival.vel.z -= nz * relVn * 0.5;
        }
      }
    }
  }

  // ==================== CONTEXTUAL HUD SNAPSHOT ====================

  public getHudSnapshot(): WrestlerHudSnapshot {
    const p = this.player;
    const r = this.rival;
    const dist = Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z);
    const sameHeight = Math.abs(r.pos.y - p.pos.y) < 0.75;
    const inActive = this.matchPhase === 'active';
    const busy = this.isActorBusy(p);
    const perched = p.perchedCornerIdx !== null;
    const inGrapple = p.inGrappleWith === r;

    const rivalAttackingSoon =
      (r.move !== null && r.move.role === 'attacker' && !r.move.hitApplied) ||
      r.inGrappleWith === p ||
      (r.script?.kind === 'diving-attack' && dist < 3.0);

    const canPin =
      inActive &&
      !busy &&
      !perched &&
      this.isActorInRing(p) &&
      this.isActorInRing(r) &&
      (r.state === 'knockdown' || r.state === 'get-up') &&
      dist < 2.2;

    const canDive =
      inActive &&
      (perched ||
        (!busy &&
          this.isActorInRing(p) &&
          !this.isActorInRing(r) &&
          r.pos.y < 0.7 &&
          p.nearRopeSide !== null &&
          dist < 4.6));

    const canClimb =
      inActive && !busy && !perched && this.isActorInRing(p) && p.nearCornerIdx !== null;

    const canGrapple =
      inActive &&
      !busy &&
      !perched &&
      (inGrapple ||
        (dist <= 1.95 && sameHeight && !this.isActorBusy(r) && r.perchedCornerIdx === null));

    const canWhipOrCross =
      inActive &&
      (perched ||
        inGrapple ||
        (!busy && (p.nearBarricadeSeg !== null || p.nearRopeSide !== null)));

    const canFinisher =
      inActive &&
      !busy &&
      !perched &&
      p.momentum >= 100 &&
      dist <= 2.25 &&
      sameHeight &&
      r.state !== 'knockdown' &&
      !r.script;

    const speed = Math.hypot(p.vel.x, p.vel.z);

    let attackLabel = 'Strike';
    if (perched) attackLabel = 'Dive';
    else if (inGrapple) attackLabel = 'DDT';
    else if (r.state === 'knockdown' && dist < 2.1 && sameHeight) attackLabel = 'Stomp';
    else if (speed > 4.0) attackLabel = 'Lariat';

    let whipLabel = 'Whip';
    if (perched) whipLabel = 'Step Down';
    else if (inGrapple) whipLabel = 'Whip';
    else if (p.nearBarricadeSeg) whipLabel = 'Vault';
    else if (this.isActorInRing(p)) whipLabel = 'Exit Ring';
    else whipLabel = 'Enter Ring';

    const entranceName =
      this.matchPhase === 'entrance-rival'
        ? this.rival.displayName
        : this.matchPhase === 'entrance-player'
          ? this.player.displayName
          : null;

    const entranceSubtitle =
      this.matchPhase === 'entrance-rival'
        ? 'THE BLUEPRINT · CHALLENGING TONIGHT'
        : this.matchPhase === 'entrance-player'
          ? 'THE PEOPLE’S CONTENDER'
          : null;

    return {
      matchPhase: this.matchPhase,
      playerName: p.displayName,
      rivalName: r.displayName,
      entranceName,
      entranceSubtitle,
      pinCount: this.pinCount,
      winnerName: this.winnerName,
      playerHp: Math.round(p.hp),
      playerStamina: Math.round(p.stamina),
      playerMomentum: Math.round(p.momentum),
      rivalHp: Math.round(r.hp),
      rivalStamina: Math.round(r.stamina),
      rivalMomentum: Math.round(r.momentum),
      playerSurface: p.surface,
      inRing: this.isActorInRing(p),
      isSprinting: p.state === 'run',
      lastMoveBanner: this.lastMoveBanner,
      actions: {
        attack: {
          visible: inActive && (!busy || perched),
          label: attackLabel,
        },
        grapple: {
          visible: canGrapple,
          label: inGrapple ? (p.grappleCursor % 3 === 2 ? 'Powerbomb' : p.grappleCursor % 3 === 1 ? 'Slam' : 'Suplex') : 'Grapple',
        },
        whip: {
          visible: canWhipOrCross,
          label: whipLabel,
        },
        pin: {
          visible: canPin,
          label: 'Pin',
          highlighted: canPin,
        },
        reverse: {
          visible: inActive && !perched && p.reverseCooldown <= 0,
          label: rivalAttackingSoon ? 'Counter!' : 'Reverse',
          highlighted: rivalAttackingSoon,
        },
        climb: {
          visible: canClimb,
          label: 'Climb',
        },
        dive: {
          visible: canDive,
          label: 'Dive',
          highlighted: canDive,
        },
        finisher: {
          visible: canFinisher,
          label: 'Finisher',
          highlighted: true,
        },
        run: {
          visible: inActive && !perched && !inGrapple,
          label: 'Run',
        },
      },
    };
  }

  public dispose() {
    this.player.rig.dispose();
    this.rival.rig.dispose();
  }
}
