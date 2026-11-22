import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WRESTLER_ASSET_MANIFEST, type WrestlerId } from '../assets/assetManifest';
import {
  createWrestlerRig,
  WRESTLER_PRESETS,
  type WrestlerAnimState,
  type WrestlerRig,
} from './wrestlerModel';

export type WrestlerVisualStatus = 'loading' | 'ready' | 'fallback';

const LOOPING_STATES = new Set<WrestlerAnimState>(['idle', 'walk', 'run', 'grapple-lock']);

const CLIP_MAP: Record<WrestlerId, Partial<Record<WrestlerAnimState, string>>> = {
  MJF: {
    idle: 'MJF_Idle_Brawler', walk: 'MJF_Walk_Forward', run: 'MJF_Run_Forward',
    'entrance-walk': 'MJF_SteelSteps_RingEntry', 'entrance-pose': 'MJF_Dominant_Taunt',
    'victory-pose': 'MJF_Victory_Pose', knockdown: 'MJF_Fall_Back', 'get-up': 'MJF_Get_Up',
    'corner-climb': 'MJF_Turnbuckle_Climb_Taunt', 'corner-perch': 'MJF_Turnbuckle_Climb_Taunt',
    'strike-jab': 'MJF_Jab_Cross_Combo', 'strike-chop': 'MJF_Body_Hook',
    'strike-kick': 'MJF_Big_Boot', 'strike-elbow': 'MJF_Hook_Uppercut_Flurry',
    'strike-clothesline': 'MJF_Clothesline', 'ground-stomp': 'MJF_Dominant_Stomp',
    'grapple-lock': 'MJF_Grapple_Clinch', 'whip-throw': 'MJF_IrishWhip_Attacker',
    'reverse-counter': 'MJF_Reversal_Counter', 'move-suplex': 'MJF_Snap_Suplex',
    'move-powerbomb': 'MJF_Powerbomb_Drop', 'sell-finisher': 'MJF_Fall_Back',
  },
  Ospreay: {
    idle: 'Ospreay_Agile_Stance', walk: 'Ospreay_Walk_In', run: 'Ospreay_Run_Forward',
    'entrance-walk': 'Ospreay_SteelSteps_RingEntry', 'entrance-pose': 'Ospreay_Showboat_Taunt',
    'victory-pose': 'Ospreay_Victory_Pose', knockdown: 'Ospreay_Fall_Back', 'get-up': 'Ospreay_Get_Up',
    'corner-climb': 'Ospreay_Turnbuckle_Climb_Taunt', 'corner-perch': 'Ospreay_Turnbuckle_Climb_Taunt',
    'strike-jab': 'Ospreay_Jab_Cross', 'strike-chop': 'Ospreay_Punch_Flurry',
    'strike-kick': 'Ospreay_Roundhouse_Kick', 'strike-elbow': 'Ospreay_Spinning_Heel_Kick',
    'strike-clothesline': 'Ospreay_Clothesline_Attacker', 'ground-stomp': 'Ospreay_Dropkick',
    'grapple-lock': 'Ospreay_Grapple_Clinch', 'whip-throw': 'Ospreay_IrishWhip_Solo',
    'reverse-counter': 'Ospreay_Reversal', 'move-suplex': 'Ospreay_German_Suplex_Reversal',
    'diving-attack': 'Ospreay_Flying_Crossbody', 'springboard-attack': 'Ospreay_Springboard_Clothesline',
    'sell-finisher': 'Ospreay_Fall_Back',
  },
};

function clipNameFor(id: WrestlerId, state: WrestlerAnimState, role: 'attacker' | 'victim' | null): string | undefined {
  if (id === 'MJF' && state === 'whip-throw' && role === 'attacker') return 'MJF_IrishWhip_Attacker';
  if (id === 'Ospreay' && state === 'run' && role === 'victim') return 'Ospreay_IrishWhip_Recipient';
  if (id === 'Ospreay' && state === 'strike-clothesline' && role === 'attacker') return 'Ospreay_Clothesline_Attacker';
  if (id === 'MJF' && state === 'hit-stagger' && role === 'victim') return 'MJF_Clothesline_Receiver';
  // The authored paired snap-suplex blockout is intentionally not match-ready.
  if (state === 'move-suplex' && role === 'attacker' && id === 'MJF') return undefined;
  if (state === 'sell-suplex' && role === 'victim' && id === 'Ospreay') return undefined;
  return CLIP_MAP[id][state];
}

export interface AnimatedWrestlerRig extends WrestlerRig {
  readonly wrestlerId: WrestlerId;
  readonly status: WrestlerVisualStatus;
  setMoveRole: (role: 'attacker' | 'victim' | null) => void;
}

export function createAnimatedWrestlerRig(
  id: WrestlerId,
  onStatus?: (status: WrestlerVisualStatus, message?: string) => void,
): AnimatedWrestlerRig {
  const fallback = createWrestlerRig(WRESTLER_PRESETS[id === 'MJF' ? 'player' : 'rival']);
  const root = new THREE.Group();
  root.name = `Wrestler_${id}`;
  root.add(fallback.root);

  let status: WrestlerVisualStatus = 'loading';
  let visual: THREE.Object3D | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let actions = new Map<string, THREE.AnimationAction>();
  let currentAction: THREE.AnimationAction | null = null;
  let currentState: WrestlerAnimState | null = null;
  let moveRole: 'attacker' | 'victim' | null = null;
  let disposed = false;
  let modelResources: THREE.Object3D | null = null;

  const setStatus = (next: WrestlerVisualStatus, message?: string) => {
    status = next;
    onStatus?.(next, message);
  };

  const load = async () => {
    try {
      const gltf = await new GLTFLoader().loadAsync(WRESTLER_ASSET_MANIFEST[id].assetPath);
      if (disposed) return;
      const model = gltf.scene;
      modelResources = model;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = 1.88 / Math.max(size.y, 0.001);
      const visualRoot = new THREE.Group();
      visualRoot.name = `${id}_GLB_Visual`;
      visualRoot.scale.setScalar(scale);
      model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      visualRoot.rotation.y = Math.PI;
      visualRoot.add(model);
      model.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) {
          const mesh = object as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      root.add(visualRoot);
      visual = visualRoot;
      fallback.root.visible = false;
      mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) {
        actions.set(clip.name, mixer.clipAction(clip));
      }
      setStatus('ready');
    } catch (error) {
      setStatus('fallback', `Unable to load ${id} GLB; using procedural fallback.`);
      console.warn(`[AEW] ${id} wrestler asset failed to load`, error);
    }
  };
  void load();

  const play = (state: WrestlerAnimState) => {
    if (!mixer || actions.size === 0) return;
    const name = clipNameFor(id, state, moveRole);
    const next = name ? actions.get(name) : undefined;
    if (!next) return;
    if (currentAction === next) return;
    const previous = currentAction;
    currentAction = next;
    currentState = state;
    next.reset();
    next.setLoop(LOOPING_STATES.has(state) ? THREE.LoopRepeat : THREE.LoopOnce, LOOPING_STATES.has(state) ? Infinity : 1);
    next.clampWhenFinished = !LOOPING_STATES.has(state);
    next.enabled = true;
    next.fadeIn(previous ? 0.14 : 0).play();
    previous?.fadeOut(0.14);
  };

  const rig: AnimatedWrestlerRig = {
    wrestlerId: id,
    get status() { return status; },
    root,
    pelvis: fallback.pelvis,
    lowerSpine: fallback.lowerSpine,
    chest: fallback.chest,
    neck: fallback.neck,
    head: fallback.head,
    leftShoulder: fallback.leftShoulder,
    leftElbow: fallback.leftElbow,
    rightShoulder: fallback.rightShoulder,
    rightElbow: fallback.rightElbow,
    leftHip: fallback.leftHip,
    leftKnee: fallback.leftKnee,
    leftAnkle: fallback.leftAnkle,
    rightHip: fallback.rightHip,
    rightKnee: fallback.rightKnee,
    rightAnkle: fallback.rightAnkle,
    setMoveRole: (role) => { moveRole = role; },
    updateAnimation: (state, dt, phaseTime, moveSpeedRatio) => {
      if (status !== 'ready') fallback.updateAnimation(state, dt, phaseTime, moveSpeedRatio);
      if (mixer) {
        play(state);
        mixer.update(dt);
      }
    },
    dispose: () => {
      disposed = true;
      mixer?.stopAllAction();
      if (visual) root.remove(visual);
      modelResources?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
      fallback.dispose();
    },
  };
  return rig;
}
