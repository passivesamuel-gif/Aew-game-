import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { ArenaAudioEngine } from './audio';
import { buildWrestlingRing, type RingHandle } from './buildRing';
import { buildRingsideAndRamp, type RingsideHandle } from './buildRingside';
import { buildEntranceStage, type StageHandle } from './buildStage';
import { buildStadiumEnvironment, type StadiumHandle } from './buildStadium';
import { CrowdAudienceSystem } from './crowdSystem';
import { ArenaPyroSystem } from './pyroEffects';
import { RefereeSystem } from './refereeSystem';
import { AnimatedLedManager } from './textures';
import { SHOW_THEMES } from './themes';
import type { LightingMode, ShowThemeId } from './types';
import type { WrestlerId } from '../assets/assetManifest';
import {
  WrestlerArenaController,
  type PlayerInputState,
  type WrestlerHudSnapshot,
} from './wrestlerController';

const _PLAYER_POS = new THREE.Vector3();
const _RIVAL_POS = new THREE.Vector3();
const _MID_POS = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) ?? '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class ArenaEngine {
  public readonly isSoftwareGl: boolean;
  public readonly audio = new ArenaAudioEngine();

  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private leds: AnimatedLedManager;
  private ring: RingHandle;
  private stage: StageHandle;
  private ringside: RingsideHandle;
  private stadium: StadiumHandle;
  private crowd: CrowdAudienceSystem;
  private pyro: ArenaPyroSystem;
  private referee: RefereeSystem;
  private wrestlers: WrestlerArenaController;

  // Lighting rig
  private hemiLight: THREE.HemisphereLight;
  private ringKeySpot: THREE.SpotLight;
  private ringRimSpot: THREE.SpotLight;
  private stageDirLight: THREE.DirectionalLight;
  private houseFillLight: THREE.PointLight;

  // Broadcast camera state (consistent televised framing)
  private camLookAt = new THREE.Vector3(0, 1.35, -8.5);
  private targetCamPos = new THREE.Vector3(4.2, 4.1, -2.5);
  private targetLookAt = new THREE.Vector3(0, 1.35, -8.5);

  // Animation & input state
  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;
  private contextLost = false;
  private lightingMode: LightingMode = 'entrance';
  private hudSyncAccum = 0;

  private joystickInput: PlayerInputState = {
    moveX: 0,
    moveZ: 0,
    sprint: false,
  };
  private runButtonHeld = false;
  private kbState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };
  private combinedInput: PlayerInputState = {
    moveX: 0,
    moveZ: 0,
    sprint: false,
  };

  // Optional desktop mouse rope-pull interaction (never hijacks mobile touch buttons/joystick)
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private dragPlaneHit = new THREE.Vector3();
  private activeRopeDrag: {
    pointerId: number;
    side: number;
    level: number;
    t: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
    restPoint: THREE.Vector3;
    outNormal: THREE.Vector3;
    targetOutDisp: number;
  } | null = null;

  private onContextLostCb?: (lost: boolean) => void;
  private onHudUpdateCb?: (snapshot: WrestlerHudSnapshot) => void;

  constructor(
    container: HTMLElement,
    initialThemeId: ShowThemeId = 'apex-prime',
    onContextLost?: (lost: boolean) => void,
    onHudUpdate?: (snapshot: WrestlerHudSnapshot) => void,
    playerName = 'MJF',
    rivalName = 'Will Ospreay',
    playerId: WrestlerId = 'MJF',
    rivalId: WrestlerId = 'Ospreay',
  ) {
    this.container = container;
    this.onContextLostCb = onContextLost;
    this.onHudUpdateCb = onHudUpdate;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Renderer setup (preserving existing lighting, tone-mapping, and high-res textures)
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    // Scene & Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070c);
    this.scene.fog = new THREE.FogExp2(0x05070c, 0.0055);

    // Studio IBL environment reflection
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = envRT.texture;
    this.scene.environmentIntensity = 0.32;
    roomEnv.dispose();
    pmrem.dispose();

    // Single Consistent Broadcast Perspective Camera
    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.15, 220);
    this.camera.position.set(4.2, 4.1, -11.5);
    this.camLookAt.set(0, 1.85, -18.5);
    this.camera.lookAt(this.camLookAt);

    // Build Arena Components (100% preserved existing 3D geometry & textures)
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const initialTheme = SHOW_THEMES[initialThemeId];

    this.leds = new AnimatedLedManager(maxAniso, initialTheme);
    this.ring = buildWrestlingRing(maxAniso, initialTheme, (strength) =>
      this.audio.playRopeSnap(strength),
    );
    this.stage = buildEntranceStage(maxAniso, initialTheme);
    this.ringside = buildRingsideAndRamp(maxAniso, initialTheme, this.leds);
    this.stadium = buildStadiumEnvironment(initialTheme, this.leds);
    this.crowd = new CrowdAudienceSystem(maxAniso, this.isSoftwareGl);
    this.pyro = new ArenaPyroSystem();
    this.referee = new RefereeSystem();

    // Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0x8ea4c8, 0x0d121d, 0.45);
    this.scene.add(this.hemiLight);

    this.ringKeySpot = new THREE.SpotLight(0xfff7ed, 140, 38, Math.PI / 4.4, 0.55, 1.6);
    this.ringKeySpot.position.set(2.5, 13.5, 3.0);
    this.ringKeySpot.target.position.set(0, 1.0, 0);
    this.ringKeySpot.castShadow = !this.isSoftwareGl;
    this.ringKeySpot.shadow.mapSize.set(2048, 2048);
    this.ringKeySpot.shadow.camera.near = 3;
    this.ringKeySpot.shadow.camera.far = 25;
    this.ringKeySpot.shadow.bias = -0.0004;
    this.ringKeySpot.shadow.normalBias = 0.02;
    this.scene.add(this.ringKeySpot);
    this.scene.add(this.ringKeySpot.target);

    this.ringRimSpot = new THREE.SpotLight(0xe0f2fe, 75, 38, Math.PI / 4.2, 0.65, 1.6);
    this.ringRimSpot.position.set(-4.5, 13.2, -4.5);
    this.ringRimSpot.target.position.set(0, 1.0, 0);
    this.ringRimSpot.castShadow = !this.isSoftwareGl;
    this.ringRimSpot.shadow.mapSize.set(1024, 1024);
    this.ringRimSpot.shadow.camera.near = 3;
    this.ringRimSpot.shadow.camera.far = 25;
    this.ringRimSpot.shadow.bias = -0.0004;
    this.scene.add(this.ringRimSpot);
    this.scene.add(this.ringRimSpot.target);

    this.stageDirLight = new THREE.DirectionalLight(0xf1f5f9, 0.55);
    this.stageDirLight.position.set(8, 18, -6);
    this.stageDirLight.target.position.set(0, 1.2, -12);
    this.stageDirLight.castShadow = !this.isSoftwareGl;
    this.stageDirLight.shadow.mapSize.set(1024, 1024);
    this.stageDirLight.shadow.camera.near = 2;
    this.stageDirLight.shadow.camera.far = 45;
    this.stageDirLight.shadow.camera.left = -18;
    this.stageDirLight.shadow.camera.right = 18;
    this.stageDirLight.shadow.camera.top = 18;
    this.stageDirLight.shadow.camera.bottom = -18;
    this.stageDirLight.shadow.bias = -0.0005;
    this.scene.add(this.stageDirLight);
    this.scene.add(this.stageDirLight.target);

    this.houseFillLight = new THREE.PointLight(0xdbeafe, 24, 95, 1.1);
    this.houseFillLight.position.set(0, 22, -2);
    this.scene.add(this.houseFillLight);

    // Wrestler Match Controller & Entrances
    this.wrestlers = new WrestlerArenaController(this.ring.ropePhysics, {
      onRopeImpactSound: (strength) => this.audio.playRopeSnap(strength),
      onImpactSound: (heavy) => this.audio.playImpact(heavy),
      onPyroBurst: (style, kind) => {
        if (kind === 'stage') {
          this.pyro.triggerStageBurst(style);
        } else {
          this.pyro.triggerCornerPoseBurst(style);
        }
        this.audio.playPyroBoom();
      },
      onEntranceStart: (who) => {
        this.applyLightingMode('entrance');
        this.audio.startEntranceTheme(who === 'player' ? 'challenger' : 'rival');
        this.emitHudImmediate();
      },
      onEntranceStop: () => {
        this.applyLightingMode('broadcast');
        this.audio.stopEntranceTheme();
        this.emitHudImmediate();
      },
      onRingBell: () => {
        this.audio.playRingBell();
        this.ring.ropePhysics.triggerTurnbuckleTremor(0.45);
        this.emitHudImmediate();
      },
      onRefCount: (count) => {
        this.audio.playRefCount(count);
        this.referee.setCount(count);
        this.emitHudImmediate();
      },
    }, false, playerName, rivalName, playerId, rivalId);

    this.scene.add(this.ring.group);
    this.scene.add(this.stage.group);
    this.scene.add(this.ringside.group);
    this.scene.add(this.stadium.group);
    this.scene.add(this.crowd.group);
    this.scene.add(this.pyro.group);
    this.scene.add(this.referee.group);
    this.scene.add(this.wrestlers.group);

    // Restrained Post-processing Bloom on Hardware GPU only
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.12,
        0.24,
        1.08,
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.renderer.compile(this.scene, this.camera);
    }

    this.applyLightingMode('entrance');
    this.emitHudImmediate();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.handlePointerUp);

    this.startLoop();
  }

  private emitHudImmediate() {
    if (!this.wrestlers || this.disposed) return;
    this.hudSyncAccum = 0;
    this.onHudUpdateCb?.(this.wrestlers.getHudSnapshot());
  }

  // ==================== TOUCH & ACTION CONTROLS ====================

  public setJoystickInput(moveX: number, moveZ: number, sprint: boolean) {
    this.joystickInput.moveX = moveX;
    this.joystickInput.moveZ = moveZ;
    this.joystickInput.sprint = sprint;
  }

  public setRunButtonHeld(held: boolean) {
    this.runButtonHeld = held;
  }

  public unlockAudio(): boolean {
    return this.audio.unlockAndEnable();
  }

  public triggerAttack() {
    this.wrestlers.triggerAttack();
    this.emitHudImmediate();
  }

  public triggerGrapple() {
    this.wrestlers.triggerGrapple();
    this.emitHudImmediate();
  }

  public triggerSubmission() {
    this.wrestlers.triggerSubmission();
    this.emitHudImmediate();
  }

  public triggerWhipOrTraversal() {
    this.resolveCombinedInput();
    this.wrestlers.triggerWhipOrTraversal(this.combinedInput);
    this.emitHudImmediate();
  }

  public triggerPin() {
    this.wrestlers.triggerPin();
    this.emitHudImmediate();
  }

  public triggerReverse() {
    this.wrestlers.triggerReverse();
    this.emitHudImmediate();
  }

  public triggerClimbCorner() {
    this.wrestlers.triggerClimbCorner();
    this.emitHudImmediate();
  }

  public triggerDive() {
    this.wrestlers.triggerDive();
    this.emitHudImmediate();
  }

  public triggerFinisher() {
    this.wrestlers.triggerFinisher();
    this.emitHudImmediate();
  }

  public skipEntrance() {
    this.wrestlers.skipEntrance();
    this.applyLightingMode('broadcast');
    this.emitHudImmediate();
  }

  public restartMatch() {
    this.wrestlers.startMatchWithEntrances();
    this.applyLightingMode('entrance');
    this.camera.position.set(4.2, 4.1, -11.5);
    this.camLookAt.set(0, 1.85, -18.5);
    this.camera.lookAt(this.camLookAt);
    this.emitHudImmediate();
  }

  public setWrestlerIdentities(
    playerName: string,
    rivalName: string,
    playerId: WrestlerId = 'MJF',
    rivalId: WrestlerId = 'Ospreay',
  ) {
    this.wrestlers.setWrestlerIdentities(playerName, rivalName, playerId, rivalId);
    this.emitHudImmediate();
  }

  public getHudSnapshot(): WrestlerHudSnapshot {
    return this.wrestlers.getHudSnapshot();
  }

  private applyLightingMode(mode: LightingMode) {
    this.lightingMode = mode;
    this.leds.setLightingMode(mode);
    this.audio.setLightingEnergy(mode === 'entrance');

    if (mode === 'broadcast') {
      this.hemiLight.intensity = 0.45;
      this.ringKeySpot.intensity = 140;
      this.ringRimSpot.intensity = 75;
      this.stageDirLight.intensity = 0.55;
      this.houseFillLight.intensity = 24;
      (this.scene.fog as THREE.FogExp2).density = 0.0055;
    } else {
      this.hemiLight.intensity = 0.34;
      this.ringKeySpot.intensity = 90;
      this.ringRimSpot.intensity = 55;
      this.stageDirLight.intensity = 0.74;
      this.houseFillLight.intensity = 14;
      (this.scene.fog as THREE.FogExp2).density = 0.0068;
    }
  }

  private resolveCombinedInput() {
    const joyMag = Math.hypot(this.joystickInput.moveX, this.joystickInput.moveZ);
    if (joyMag > 0.05) {
      this.combinedInput.moveX = this.joystickInput.moveX;
      this.combinedInput.moveZ = this.joystickInput.moveZ;
      this.combinedInput.sprint =
        this.joystickInput.sprint || this.runButtonHeld || this.kbState.sprint;
      return;
    }

    let kx = (this.kbState.right ? 1 : 0) - (this.kbState.left ? 1 : 0);
    let kz = (this.kbState.forward ? 1 : 0) - (this.kbState.backward ? 1 : 0);
    const kLen = Math.hypot(kx, kz);
    if (kLen > 1) {
      kx /= kLen;
      kz /= kLen;
    }
    this.combinedInput.moveX = kx;
    this.combinedInput.moveZ = kz;
    this.combinedInput.sprint = this.runButtonHeld || this.kbState.sprint;
  }

  private updateBroadcastCamera(dt: number) {
    const phase = this.wrestlers.getMatchPhase();

    if (phase === 'entrance-rival' || phase === 'entrance-player') {
      const enteringRival = phase === 'entrance-rival';
      if (enteringRival) {
        this.wrestlers.getRivalPosition(_PLAYER_POS);
      } else {
        this.wrestlers.getPlayerPosition(_PLAYER_POS);
      }

      if (_PLAYER_POS.z < -4.2) {
        // Tracking wrestler cleanly from TitanTron stage down the black ramp
        this.targetLookAt.set(
          _PLAYER_POS.x * 0.45,
          _PLAYER_POS.y + 1.25,
          _PLAYER_POS.z - 1.1,
        );
        this.targetCamPos.set(
          3.95,
          3.65,
          THREE.MathUtils.clamp(_PLAYER_POS.z + 7.2, -13.5, 9.2),
        );
      } else {
        // Wrestler entering & posing in ring -> smoothly settle onto Hard-Cam Broadcast view
        this.targetLookAt.set(_PLAYER_POS.x * 0.55, 1.38, _PLAYER_POS.z * 0.55);
        this.targetCamPos.set(1.6, 4.25, 9.4);
      }

      const lambda = this.isSoftwareGl ? 10 : 4.2;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.targetCamPos.x, lambda, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.targetCamPos.y, lambda, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.targetCamPos.z, lambda, dt);
      this.camLookAt.x = THREE.MathUtils.damp(this.camLookAt.x, this.targetLookAt.x, lambda, dt);
      this.camLookAt.y = THREE.MathUtils.damp(this.camLookAt.y, this.targetLookAt.y, lambda, dt);
      this.camLookAt.z = THREE.MathUtils.damp(this.camLookAt.z, this.targetLookAt.z, lambda, dt);
      this.camera.lookAt(this.camLookAt);
      return;
    }

    // Active / Pinning / Finished Broadcast Framing (frames both wrestlers cleanly anywhere)
    this.wrestlers.getPlayerPosition(_PLAYER_POS);
    this.wrestlers.getRivalPosition(_RIVAL_POS);
    _MID_POS.copy(_PLAYER_POS).add(_RIVAL_POS).multiplyScalar(0.5);

    const sep = Math.hypot(
      _PLAYER_POS.x - _RIVAL_POS.x,
      _PLAYER_POS.z - _RIVAL_POS.z,
    );
    const heightSpan = Math.abs(_PLAYER_POS.y - _RIVAL_POS.y);

    const isPinning = phase === 'pinning';
    const baseZoom = isPinning ? 6.15 : 7.55 + sep * 0.62 + heightSpan * 0.4;
    const zoomDist = THREE.MathUtils.clamp(baseZoom, 6.15, 14.5);

    this.targetLookAt.set(
      THREE.MathUtils.clamp(_MID_POS.x * 0.9, -12, 12),
      _MID_POS.y * 0.65 + 1.08,
      THREE.MathUtils.clamp(_MID_POS.z * 0.9, -18, 12),
    );
    this.targetCamPos.set(
      THREE.MathUtils.clamp(_MID_POS.x * 0.76 + (isPinning ? 2.1 : 1.35), -14, 14),
      _MID_POS.y * 0.5 + (isPinning ? 2.75 : 3.55) + sep * 0.14,
      THREE.MathUtils.clamp(_MID_POS.z + zoomDist, -12, 19.5),
    );

    const lambda = this.isSoftwareGl ? 12 : isPinning ? 6.5 : 5.2;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.targetCamPos.x, lambda, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.targetCamPos.y, lambda, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.targetCamPos.z, lambda, dt);
    this.camLookAt.x = THREE.MathUtils.damp(this.camLookAt.x, this.targetLookAt.x, lambda, dt);
    this.camLookAt.y = THREE.MathUtils.damp(this.camLookAt.y, this.targetLookAt.y, lambda, dt);
    this.camLookAt.z = THREE.MathUtils.damp(this.camLookAt.z, this.targetLookAt.z, lambda, dt);
    this.camera.lookAt(this.camLookAt);
  }

  // ==================== WINDOW / INPUT LISTENERS ====================

  private handleResize = () => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    this.onContextLostCb?.(true);
  };

  private handleContextRestored = () => {
    this.contextLost = false;
    this.onContextLostCb?.(false);
  };

  private updateKeyboardBit(key: string, pressed: boolean) {
    const k = key.toLowerCase();
    if (k === 'w' || key === 'arrowup') this.kbState.forward = pressed;
    else if (k === 's' || key === 'arrowdown') this.kbState.backward = pressed;
    else if (k === 'a' || key === 'arrowleft') this.kbState.left = pressed;
    else if (k === 'd' || key === 'arrowright') this.kbState.right = pressed;
    else if (key === 'Shift') this.kbState.sprint = pressed;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    this.updateKeyboardBit(e.key, true);
    if (e.shiftKey) this.kbState.sprint = true;
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.updateKeyboardBit(e.key, false);
    if (!e.shiftKey) this.kbState.sprint = false;
  };

  private handleWindowBlur = () => {
    this.kbState.forward = false;
    this.kbState.backward = false;
    this.kbState.left = false;
    this.kbState.right = false;
    this.kbState.sprint = false;
    this.joystickInput.moveX = 0;
    this.joystickInput.moveZ = 0;
    this.joystickInput.sprint = false;
    this.runButtonHeld = false;
  };

  private updatePointerNdc(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (this.disposed || e.pointerType === 'touch' || e.button !== 0) return;
    this.updatePointerNdc(e);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.ring.ropePhysics.raycastRopes(this.raycaster.ray, 0.09);
    if (!hit) return;

    const restPoint = this.ring.ropePhysics.getSpinePoint(hit.side, hit.level, hit.t);
    const outNormal = new THREE.Vector3();
    if (hit.side === 0) outNormal.set(0, 0, -1);
    else if (hit.side === 1) outNormal.set(1, 0, 0);
    else if (hit.side === 2) outNormal.set(0, 0, 1);
    else outNormal.set(-1, 0, 0);

    this.activeRopeDrag = {
      pointerId: e.pointerId,
      side: hit.side,
      level: hit.level,
      t: hit.t,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
      restPoint,
      outNormal,
      targetOutDisp: 0.12,
    };
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.disposed || !this.activeRopeDrag || e.pointerId !== this.activeRopeDrag.pointerId) {
      return;
    }
    const distPx = Math.hypot(
      e.clientX - this.activeRopeDrag.startClientX,
      e.clientY - this.activeRopeDrag.startClientY,
    );
    if (distPx > 6) this.activeRopeDrag.moved = true;

    this.updatePointerNdc(e);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    this.dragPlane.set(new THREE.Vector3(0, 1, 0), -this.activeRopeDrag.restPoint.y);
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneHit)) {
      const delta = this.dragPlaneHit.sub(this.activeRopeDrag.restPoint);
      const signedOut = delta.dot(this.activeRopeDrag.outNormal);
      this.activeRopeDrag.targetOutDisp = THREE.MathUtils.clamp(signedOut, -0.52, 0.68);
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (!this.activeRopeDrag || e.pointerId !== this.activeRopeDrag.pointerId) return;
    const drag = this.activeRopeDrag;
    this.activeRopeDrag = null;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    }
    if (!drag.moved) {
      this.ring.ropePhysics.applyImpulse(drag.side, drag.level, drag.t, 3.8, -0.42, 0.16);
      this.audio.playRopeSnap(0.65);
    } else {
      this.audio.playRopeSnap(Math.min(1, Math.abs(drag.targetOutDisp) / 0.55));
    }
  };

  // ==================== MAIN ANIMATION LOOP ====================

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private startLoop() {
    const tick = () => {
      if (this.disposed) return;

      const rawDt = this.clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const elapsed = this.clock.elapsedTime;

      if (!this.contextLost) {
        this.resolveCombinedInput();
        this.wrestlers.update(dt, this.camera, this.combinedInput);
        this.referee.update(
          dt,
          this.wrestlers.getPlayerPosition(_PLAYER_POS),
          this.wrestlers.getRivalPosition(_RIVAL_POS),
          this.wrestlers.getMatchPhase(),
          this.wrestlers.getHudSnapshot().pinCount,
        );
        this.updateBroadcastCamera(dt);

        if (this.activeRopeDrag && this.activeRopeDrag.moved) {
          this.ring.ropePhysics.applyContinuousDrag(
            this.activeRopeDrag.side,
            this.activeRopeDrag.level,
            this.activeRopeDrag.t,
            this.activeRopeDrag.targetOutDisp,
            -Math.abs(this.activeRopeDrag.targetOutDisp) * 0.08,
            dt,
          );
        }

        this.ring.update(dt);
        this.pyro.update(dt);
        this.leds.update(elapsed);
        this.stage.updateLights(elapsed, this.lightingMode === 'entrance');
        this.stadium.updateCrowdAndRig(
          elapsed,
          this.lightingMode === 'entrance',
          false,
        );
        this.crowd.update(
          dt,
          elapsed,
          this.camera,
          this.lightingMode === 'entrance',
        );

        this.hudSyncAccum += dt;
        if (this.hudSyncAccum >= 0.075) {
          this.hudSyncAccum = 0;
          this.onHudUpdateCb?.(this.wrestlers.getHudSnapshot());
        }

        if (this.composer && !this.isSoftwareGl) {
          this.composer.render();
        } else {
          this.renderer.render(this.scene, this.camera);
        }
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.handlePointerUp);

    this.wrestlers.dispose();
    this.pyro.dispose();
    this.ring.dispose();
    this.stage.dispose();
    this.ringside.dispose();
    this.stadium.dispose();
    this.crowd.dispose();
    this.referee.dispose();
    this.leds.dispose();
    this.audio.dispose();

    if (this.composer) {
      this.composer.dispose();
    }
    if (this.scene.environment) {
      this.scene.environment.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
