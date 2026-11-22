import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { REFEREE_ASSET_MANIFEST } from '../assets/assetManifest';
import type { MatchPhase } from './wrestlerController';

const RING_FLOOR_Y = 1.062;
const REFEREE_HEIGHT = 1.78;

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export class RefereeSystem {
  public readonly group = new THREE.Group();
  private readonly fallback: THREE.Group;
  private mixer: THREE.AnimationMixer | null = null;
  private disposed = false;
  private countPulse = 0;
  private officiatingElapsed = 0;
  private readonly gestureRoot = new THREE.Group();

  constructor() {
    this.group.name = 'MatchReferee';
    this.fallback = this.createFallback();
    this.group.add(this.fallback);
    this.createGestureOverlay();
    this.group.add(this.gestureRoot);
    this.group.visible = false;
    void this.loadModel();
  }

  private createFallback() {
    const root = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.72 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.62 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98d6b, roughness: 0.72 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.56 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.38 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.48, 5, 12), shirt);
    body.position.y = 0.98;
    root.add(body);
    for (const y of [1.08, 0.9]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.07, 0.4), stripe);
      band.position.set(0, y, 0.02);
      band.rotation.z = y > 1 ? 0.18 : -0.18;
      root.add(band);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin);
    head.position.y = 1.42;
    root.add(head);
    const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.24), pants);
    shorts.position.y = 0.59;
    root.add(shorts);
    for (const x of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.36, 10), pants);
      leg.position.set(x, 0.34, 0);
      root.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.25), shoe);
      boot.position.set(x, 0.11, 0.035);
      root.add(boot);
    }
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return root;
  }

  private createGestureOverlay() {
    this.gestureRoot.name = 'ProceduralOfficiatingGestures';
    const glove = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });
    for (const x of [-0.22, 0.22]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.34, 4, 8), glove);
      arm.position.set(x, 0.9, 0.18);
      arm.rotation.z = x < 0 ? -0.35 : 0.35;
      arm.castShadow = true;
      this.gestureRoot.add(arm);
    }
  }

  private async loadModel() {
    try {
      const gltf = await new GLTFLoader().loadAsync(REFEREE_ASSET_MANIFEST.assetPath);
      if (this.disposed) return;
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = REFEREE_HEIGHT / Math.max(size.y, 0.001);
      const visualRoot = new THREE.Group();
      visualRoot.name = 'DanielBrooksRefereeModel';
      visualRoot.scale.setScalar(scale);
      model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      visualRoot.rotation.y = Math.PI;
      visualRoot.add(model);
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      this.group.add(visualRoot);
      this.fallback.visible = false;
      if (gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(model);
        const clip = gltf.animations.find((item) => /idle|stand|walk/i.test(item.name)) ?? gltf.animations[0];
        this.mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
      }
    } catch (error) {
      console.warn('[AEW] Referee GLB unavailable; using procedural fallback.', error);
    }
  }

  public update(dt: number, player: THREE.Vector3, rival: THREE.Vector3, phase: MatchPhase, pinCount: 0 | 1 | 2 | 3) {
    if (this.disposed) return;
    this.mixer?.update(dt);
    this.group.visible =
      phase === 'active' || phase === 'pinning' || phase === 'submitting' || phase === 'finished';
    if (!this.group.visible) return;
    this.officiatingElapsed += dt;

    const midpoint = new THREE.Vector3().addVectors(player, rival).multiplyScalar(0.5);
    const action = new THREE.Vector3().subVectors(rival, player);
    if (action.lengthSq() < 0.01) action.set(1, 0, 0);
    action.normalize();
    const side = new THREE.Vector3(-action.z, 0, action.x);
    const isOfficiatingHold = phase === 'pinning' || phase === 'submitting';
    const offset = isOfficiatingHold ? 1.72 : phase === 'finished' ? 1.45 : 2.05;
    const target = new THREE.Vector3(
      THREE.MathUtils.clamp(midpoint.x + side.x * offset, -2.48, 2.48),
      RING_FLOOR_Y,
      THREE.MathUtils.clamp(midpoint.z + side.z * offset, -2.48, 2.48),
    );
    this.group.position.x = THREE.MathUtils.damp(this.group.position.x, target.x, 5.5, dt);
    const kneelOffset = isOfficiatingHold ? -0.28 : 0;
    this.group.position.y = target.y + kneelOffset;
    this.group.position.z = THREE.MathUtils.damp(this.group.position.z, target.z, 5.5, dt);
    const yaw = Math.atan2(midpoint.x - this.group.position.x, midpoint.z - this.group.position.z);
    this.group.rotation.y = dampAngle(this.group.rotation.y, yaw, 7, dt);
    // The supplied referee file does not advertise authored kneeling or hand-raise
    // clips. Keep those moments procedural and conservative instead of mislabeling
    // an idle clip as a custom officiating animation.
    const targetLean = isOfficiatingHold ? -0.18 : phase === 'finished' ? 0.12 : 0;
    this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, targetLean, 5, dt);
    const leftArm = this.gestureRoot.children[0];
    const rightArm = this.gestureRoot.children[1];
    if (leftArm && rightArm) {
      if (phase === 'pinning') {
        leftArm.position.y = 0.9 - (pinCount > 0 ? Math.max(0, Math.sin(this.officiatingElapsed * 18)) * 0.55 : 0);
        rightArm.position.y = 0.92;
      } else if (phase === 'submitting') {
        leftArm.position.y = 1.18 + Math.sin(this.officiatingElapsed * 7) * 0.08;
        rightArm.position.y = 0.88;
        leftArm.rotation.z = -0.08;
      } else {
        leftArm.position.y = 0.9;
        rightArm.position.y = 0.9;
      }
    }
    if (pinCount > 0) this.countPulse = Math.max(this.countPulse, 0.18);
    this.countPulse = Math.max(0, this.countPulse - dt);
    this.group.scale.setScalar(1 + this.countPulse * 0.06);
  }

  public setCount(count: 1 | 2 | 3) {
    if (count > 0) this.countPulse = 0.24;
  }

  public isWeaponWitnessing(attacker: THREE.Vector3, defender: THREE.Vector3): boolean {
    if (!this.group.visible) return false;
    const midpoint = new THREE.Vector3().addVectors(attacker, defender).multiplyScalar(0.5);
    return this.group.position.distanceTo(midpoint) < 5.5 && Math.abs(attacker.y - this.group.position.y) < 2.2;
  }

  public dispose() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material?.dispose();
    });
  }
}
