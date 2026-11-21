import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { FLOOR_CHAIRS } from './arenaCollision';

export type CrowdArchetypeRole =
  | 'seated-cheer'
  | 'seated-idle'
  | 'stand-cheer'
  | 'stand-idle'
  | 'walker';

interface CrowdArchetype {
  id: string;
  source: 'idle2000' | 'populate';
  role: CrowdArchetypeRole;
  protoRoot: THREE.Group;
  clip: THREE.AnimationClip;
  defaultDuration: number;
}

interface CrowdAgent {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction;
  role: CrowdArchetypeRole;
  baseTimeScale: number;
  pendingDt: number;
  sphereCenter: THREE.Vector3;
  walkPath?: {
    rx: number;
    rz: number;
    centerZ: number;
    y: number;
    thetaMin: number;
    thetaMax: number;
    theta: number;
    dir: number;
    angularSpeed: number;
    currentYaw: number;
  };
}

interface PlacementSlot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  role: CrowdArchetypeRole;
  scale: number;
  preferSource?: 'idle2000' | 'populate';
}

const CROWD_GLB_IDLE_URL = '/assets/crowd/populate_idle_models_2000_frames.glb';
const CROWD_GLB_POPULATE_URL = '/assets/crowd/populate_models.glb';

// Module-scope scratch helpers — zero per-frame allocations in update()
const _projScreenMat = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();
const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpV3 = new THREE.Vector3();
const _tmpQ = new THREE.Quaternion();
const _tmpS = new THREE.Vector3();
const _invRootMat = new THREE.Matrix4();
const _anchorMatInRoot = new THREE.Matrix4();

function createSeededRand(seedInit: number): () => number {
  let seed = seedInit;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function getTriangleCount(geo: THREE.BufferGeometry): number {
  if (geo.index) return geo.index.count / 3;
  const pos = geo.attributes.position;
  return pos ? pos.count / 3 : 0;
}

function findBoneContaining(bones: THREE.Bone[], token: string): THREE.Bone | undefined {
  return bones.find((b) => b.name.includes(token));
}

function hasSeatAncestor(obj: THREE.Object3D, stopAt: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj.parent;
  while (cur && cur !== stopAt) {
    if (/^Seat\d+/i.test(cur.name)) return true;
    cur = cur.parent;
  }
  return false;
}

/**
 * Computes exact world-space minimum/maximum bounds of a posed SkinnedMesh
 * via Three.js's native applyBoneTransform + matrixWorld.
 */
function measureSkinnedBoundsAtPose(
  mesh: THREE.SkinnedMesh,
  outMin: THREE.Vector3,
  outMax: THREE.Vector3,
): void {
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  const posAttr = mesh.geometry.attributes.position;
  outMin.set(Infinity, Infinity, Infinity);
  outMax.set(-Infinity, -Infinity, -Infinity);

  const v = _tmpV1;
  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    mesh.applyBoneTransform(i, v);
    v.applyMatrix4(mesh.matrixWorld);

    if (v.x < outMin.x) outMin.x = v.x;
    if (v.y < outMin.y) outMin.y = v.y;
    if (v.z < outMin.z) outMin.z = v.z;
    if (v.x > outMax.x) outMax.x = v.x;
    if (v.y > outMax.y) outMax.y = v.y;
    if (v.z > outMax.z) outMax.z = v.z;
  }
}

function tuneCrowdMaterial(
  srcMat: THREE.Material | THREE.Material[],
  maxAniso: number,
  sharedMaterials: Set<THREE.Material>,
  sharedTextures: Set<THREE.Texture>,
): THREE.Material | THREE.Material[] {
  const process = (mat: THREE.Material): THREE.Material => {
    sharedMaterials.add(mat);
    const std = mat as THREE.MeshStandardMaterial;
    if ('roughness' in std) {
      std.roughness = 0.88;
      std.metalness = 0.0;
      std.envMapIntensity = 0.22;
    }
    if (std.map) {
      std.map.anisotropy = Math.min(4, maxAniso);
      sharedTextures.add(std.map);
    }
    if (std.normalMap) sharedTextures.add(std.normalMap);
    if (std.roughnessMap) sharedTextures.add(std.roughnessMap);
    mat.needsUpdate = true;
    return mat;
  };
  return Array.isArray(srcMat) ? srcMat.map(process) : process(srcMat);
}

function cloneBoneSubtree(
  srcBone: THREE.Bone,
  oldBoneToIndex: Map<THREE.Bone, number>,
  outBones: THREE.Bone[],
  outOldIndices: number[],
): THREE.Bone {
  const b = new THREE.Bone();
  b.name = srcBone.name;
  b.position.copy(srcBone.position);
  b.quaternion.copy(srcBone.quaternion);
  b.scale.copy(srcBone.scale);

  const oldIdx = oldBoneToIndex.get(srcBone);
  if (oldIdx !== undefined) {
    outBones.push(b);
    outOldIndices.push(oldIdx);
  }

  for (const child of srcBone.children) {
    if ((child as THREE.Bone).isBone) {
      b.add(cloneBoneSubtree(child as THREE.Bone, oldBoneToIndex, outBones, outOldIndices));
    }
  }
  return b;
}

/**
 * Extracts normalized, standalone character archetypes (26-27 joints, 1 SkinnedMesh each,
 * centered XZ under pelvis, grounded at y=0, facing +Z, COM1 XZ drift clamped/zeroed).
 */
export function extractCrowdArchetypes(
  gltfScene: THREE.Object3D,
  animations: THREE.AnimationClip[],
  source: 'idle2000' | 'populate',
  maxAniso: number,
  sharedGeometries: Set<THREE.BufferGeometry>,
  sharedMaterials: Set<THREE.Material>,
  sharedTextures: Set<THREE.Texture>,
): CrowdArchetype[] {
  const clip = animations[0];
  if (!clip) return [];

  const rootNode = gltfScene.getObjectByName('RootNode') || gltfScene;
  gltfScene.updateMatrixWorld(true);
  _invRootMat.copy(rootNode.matrixWorld).invert();

  const srcMixer = new THREE.AnimationMixer(gltfScene);
  const srcAction = srcMixer.clipAction(clip);
  srcAction.play();

  const bodyMeshes: THREE.SkinnedMesh[] = [];
  gltfScene.traverse((obj) => {
    const sm = obj as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && getTriangleCount(sm.geometry) >= 50) {
      bodyMeshes.push(sm);
    }
  });

  interface CharMeta {
    srcMesh: THREE.SkinnedMesh;
    com1Bone: THREE.Bone;
    subtreeBones: THREE.Bone[];
    isSeated: boolean;
    maxHandY: number;
    headY: number;
  }

  const metas: CharMeta[] = bodyMeshes.map((srcMesh) => {
    const si = srcMesh.geometry.attributes.skinIndex;
    const firstBone = srcMesh.skeleton.bones[si.getX(0)];
    let com1Bone = firstBone;
    while (com1Bone && !com1Bone.name.includes('COM1') && com1Bone.parent && (com1Bone.parent as THREE.Bone).isBone) {
      com1Bone = com1Bone.parent as THREE.Bone;
    }

    const subtreeBones: THREE.Bone[] = [];
    com1Bone.traverse((n) => {
      if ((n as THREE.Bone).isBone) subtreeBones.push(n as THREE.Bone);
    });

    return {
      srcMesh,
      com1Bone,
      subtreeBones,
      isSeated: hasSeatAncestor(srcMesh, rootNode),
      maxHandY: -Infinity,
      headY: 1.5,
    };
  });

  // Sample across 3 timestamps to classify active cheering motions accurately
  const sampleTimes = [0.4, Math.min(1.8, clip.duration * 0.45), Math.min(3.5, clip.duration * 0.85)];
  for (const t of sampleTimes) {
    srcAction.time = t;
    srcMixer.update(0);
    gltfScene.updateMatrixWorld(true);

    for (const meta of metas) {
      const lHand = findBoneContaining(meta.subtreeBones, 'LHand');
      const rHand = findBoneContaining(meta.subtreeBones, 'RHand');
      const head = findBoneContaining(meta.subtreeBones, 'Head');
      if (lHand) {
        lHand.getWorldPosition(_tmpV1);
        if (_tmpV1.y > meta.maxHandY) meta.maxHandY = _tmpV1.y;
      }
      if (rHand) {
        rHand.getWorldPosition(_tmpV1);
        if (_tmpV1.y > meta.maxHandY) meta.maxHandY = _tmpV1.y;
      }
      if (head && t === sampleTimes[0]) {
        head.getWorldPosition(_tmpV1);
        meta.headY = _tmpV1.y;
      }
    }
  }

  srcMixer.stopAllAction();
  srcMixer.uncacheRoot(gltfScene);

  // Index tracks by bone name for O(1) track slicing
  const tracksByNode = new Map<string, THREE.KeyframeTrack[]>();
  for (const tr of clip.tracks) {
    const dotIdx = tr.name.indexOf('.');
    const nodeName = dotIdx >= 0 ? tr.name.slice(0, dotIdx) : tr.name;
    let list = tracksByNode.get(nodeName);
    if (!list) {
      list = [];
      tracksByNode.set(nodeName, list);
    }
    list.push(tr);
  }

  const archetypes: CrowdArchetype[] = [];

  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i];
    const { srcMesh, com1Bone, subtreeBones, isSeated, maxHandY, headY } = meta;

    const anchorNode = srcMesh.parent!;
    anchorNode.updateMatrixWorld(true);
    _anchorMatInRoot.multiplyMatrices(_invRootMat, anchorNode.matrixWorld);
    _anchorMatInRoot.decompose(_tmpV1, _tmpQ, _tmpS);
    const anchorQuat = _tmpQ.clone();
    const invAnchorQuat = anchorQuat.clone().invert();

    const boneNameSet = new Set(subtreeBones.map((b) => b.name));
    const com1Tracks = tracksByNode.get(com1Bone.name) || [];
    const com1PosTrack = com1Tracks.find((t) => t.name.endsWith('.position')) as THREE.VectorKeyframeTrack | undefined;

    let minWorldX = Infinity;
    let maxWorldX = -Infinity;
    let minWorldZ = Infinity;
    let maxWorldZ = -Infinity;
    let sumWorldX = 0;
    let sumWorldZ = 0;
    let comSampleCount = 0;

    if (com1PosTrack && com1PosTrack.values.length >= 3) {
      const vals = com1PosTrack.values;
      for (let k = 0; k < vals.length; k += 3) {
        _tmpV2.set(vals[k], vals[k + 1], vals[k + 2]).applyQuaternion(anchorQuat).multiplyScalar(0.0254);
        if (_tmpV2.x < minWorldX) minWorldX = _tmpV2.x;
        if (_tmpV2.x > maxWorldX) maxWorldX = _tmpV2.x;
        if (_tmpV2.z < minWorldZ) minWorldZ = _tmpV2.z;
        if (_tmpV2.z > maxWorldZ) maxWorldZ = _tmpV2.z;
        sumWorldX += _tmpV2.x;
        sumWorldZ += _tmpV2.z;
        comSampleCount++;
      }
    }

    const comSpanM =
      comSampleCount > 0 ? Math.hypot(maxWorldX - minWorldX, maxWorldZ - minWorldZ) : 0;
    const meanWorldXIn = comSampleCount > 0 ? (sumWorldX / comSampleCount) / 0.0254 : 0;
    const meanWorldZIn = comSampleCount > 0 ? (sumWorldZ / comSampleCount) / 0.0254 : 0;

    const isSharedObject4Walker = srcMesh.skeleton.bones.length > 32;
    let role: CrowdArchetypeRole;
    if (isSeated) {
      role = maxHandY > 0.94 ? 'seated-cheer' : 'seated-idle';
    } else if (isSharedObject4Walker || comSpanM > 1.15) {
      role = 'walker';
    } else {
      role = maxHandY > headY - 0.18 ? 'stand-cheer' : 'stand-idle';
    }

    // Isolate single-character skeleton
    const oldBoneToIndex = new Map<THREE.Bone, number>();
    srcMesh.skeleton.bones.forEach((b, idx) => oldBoneToIndex.set(b, idx));

    const clonedBones: THREE.Bone[] = [];
    const keptOldIndices: number[] = [];
    const clonedCom1Root = cloneBoneSubtree(com1Bone, oldBoneToIndex, clonedBones, keptOldIndices);

    const needsIndexRemap = isSharedObject4Walker;
    let charGeom: THREE.BufferGeometry;
    let rootJointNode: THREE.Object3D = new THREE.Group();
    rootJointNode.name = '_rootJoint';

    if (needsIndexRemap) {
      charGeom = srcMesh.geometry.clone();
      const oldToNewIdx = new Map<number, number>();
      keptOldIndices.forEach((oldIdx, newIdx) => oldToNewIdx.set(oldIdx, newIdx));

      const origSI = charGeom.attributes.skinIndex;
      const newSI = origSI.clone();
      const sw = charGeom.attributes.skinWeight;
      for (let vIdx = 0; vIdx < newSI.count; vIdx++) {
        const ix = sw.getX(vIdx) > 0 ? (oldToNewIdx.get(origSI.getX(vIdx)) ?? 0) : 0;
        const iy = sw.getY(vIdx) > 0 ? (oldToNewIdx.get(origSI.getY(vIdx)) ?? 0) : 0;
        const iz = sw.getZ(vIdx) > 0 ? (oldToNewIdx.get(origSI.getZ(vIdx)) ?? 0) : 0;
        const iw = sw.getW(vIdx) > 0 ? (oldToNewIdx.get(origSI.getW(vIdx)) ?? 0) : 0;
        newSI.setXYZW(vIdx, ix, iy, iz, iw);
      }
      newSI.needsUpdate = true;
      charGeom.setAttribute('skinIndex', newSI);
      rootJointNode.add(clonedCom1Root);
    } else {
      charGeom = srcMesh.geometry;
      const orderedBones: THREE.Bone[] = new Array(srcMesh.skeleton.bones.length);
      const cloneByName = new Map<string, THREE.Bone>();
      for (const cb of clonedBones) cloneByName.set(cb.name, cb);
      let rootBoneParent: THREE.Bone | null = null;
      for (let bi = 0; bi < srcMesh.skeleton.bones.length; bi++) {
        const origB = srcMesh.skeleton.bones[bi];
        const match = cloneByName.get(origB.name);
        if (match) {
          orderedBones[bi] = match;
        } else {
          const stub = new THREE.Bone();
          stub.name = origB.name;
          stub.position.copy(origB.position);
          stub.quaternion.copy(origB.quaternion);
          stub.scale.copy(origB.scale);
          orderedBones[bi] = stub;
          rootBoneParent = stub;
        }
      }
      if (rootBoneParent) {
        rootBoneParent.add(clonedCom1Root);
        rootJointNode = rootBoneParent;
      } else {
        rootJointNode.add(clonedCom1Root);
      }
      clonedBones.length = 0;
      clonedBones.push(...orderedBones);
      keptOldIndices.length = 0;
      for (let bi = 0; bi < srcMesh.skeleton.bones.length; bi++) keptOldIndices.push(bi);
    }

    if (!sharedGeometries.has(charGeom)) {
      if (!charGeom.boundingSphere) charGeom.computeBoundingSphere();
      if (charGeom.boundingSphere) charGeom.boundingSphere.radius *= 1.45;
      sharedGeometries.add(charGeom);
    }

    const charInverses = keptOldIndices.map((idx) => srcMesh.skeleton.boneInverses[idx].clone());
    const charMat = tuneCrowdMaterial(srcMesh.material, maxAniso, sharedMaterials, sharedTextures);

    const protoRoot = new THREE.Group();
    protoRoot.name = `${source}_${role}_${i}`;

    const yawAlign = new THREE.Group();
    const unitScale = new THREE.Group();
    unitScale.scale.setScalar(0.0254);

    const anchorGroup = new THREE.Group();
    anchorGroup.quaternion.copy(anchorQuat);
    anchorGroup.position.set(0, 0, 0);

    const charMesh = new THREE.SkinnedMesh(charGeom, charMat);
    charMesh.name = srcMesh.name;
    charMesh.castShadow = false;
    charMesh.receiveShadow = false;
    charMesh.frustumCulled = true;

    const newSkeleton = new THREE.Skeleton(clonedBones, charInverses);
    charMesh.bind(newSkeleton, new THREE.Matrix4());

    anchorGroup.add(charMesh);
    anchorGroup.add(rootJointNode);
    unitScale.add(anchorGroup);
    yawAlign.add(unitScale);
    protoRoot.add(yawAlign);

    // Slice & normalize animation tracks for this single character
    const slicedTracks: THREE.KeyframeTrack[] = [];
    for (const bName of boneNameSet) {
      const nodeTracks = tracksByNode.get(bName);
      if (!nodeTracks) continue;
      for (const tr of nodeTracks) {
        const clonedTrack = tr.clone();
        if (bName === com1Bone.name && clonedTrack.name.endsWith('.position')) {
          const vals = clonedTrack.values as Float32Array;
          const maxDevIn = role === 'walker' ? 0 : 4.2;
          for (let k = 0; k < vals.length; k += 3) {
            _tmpV2.set(vals[k], vals[k + 1], vals[k + 2]).applyQuaternion(anchorQuat);
            if (role === 'walker') {
              _tmpV2.x = 0;
              _tmpV2.z = 0;
            } else {
              const dx = THREE.MathUtils.clamp(_tmpV2.x - meanWorldXIn, -maxDevIn, maxDevIn);
              const dz = THREE.MathUtils.clamp(_tmpV2.z - meanWorldZIn, -maxDevIn, maxDevIn);
              _tmpV2.x = dx;
              _tmpV2.z = dz;
            }
            _tmpV2.applyQuaternion(invAnchorQuat);
            vals[k] = _tmpV2.x;
            vals[k + 1] = _tmpV2.y;
            vals[k + 2] = _tmpV2.z;
          }
        }
        slicedTracks.push(clonedTrack);
      }
    }

    const slicedClip = new THREE.AnimationClip(`${source}_${role}_${i}`, clip.duration, slicedTracks);

    // Normalize facing yaw (+Z), pelvis XZ origin, and exact floor contact y = 0.00m
    const testMixer = new THREE.AnimationMixer(protoRoot);
    const testAct = testMixer.clipAction(slicedClip);
    testAct.play();
    testAct.time = Math.min(0.5, slicedClip.duration * 0.25);
    testMixer.update(0);
    protoRoot.updateMatrixWorld(true);

    const lUpper = findBoneContaining(clonedBones, 'LUpperArm');
    const rUpper = findBoneContaining(clonedBones, 'RUpperArm');
    const headBone = findBoneContaining(clonedBones, 'Head');
    const pelvisBone = findBoneContaining(clonedBones, 'Pelvis') || clonedCom1Root;
    const lFootBone = findBoneContaining(clonedBones, 'LFoot');
    const lToeBone = findBoneContaining(clonedBones, 'LToe');

    let baseYaw = 0;
    if (lUpper && rUpper && headBone) {
      lUpper.getWorldPosition(_tmpV1);
      rUpper.getWorldPosition(_tmpV2);
      const armVec = _tmpV1.sub(_tmpV2);
      headBone.getWorldPosition(_tmpV2);
      pelvisBone.getWorldPosition(_tmpV3);
      const spineVec = _tmpV2.sub(_tmpV3);
      const fwd = _tmpV3.copy(armVec).cross(spineVec);
      fwd.y = 0;
      if (fwd.lengthSq() > 1e-6) {
        fwd.normalize();
        baseYaw = Math.atan2(fwd.x, fwd.z);
      } else if (lFootBone && lToeBone) {
        lToeBone.getWorldPosition(_tmpV1);
        lFootBone.getWorldPosition(_tmpV2);
        const footFwd = _tmpV1.sub(_tmpV2);
        footFwd.y = 0;
        if (footFwd.lengthSq() > 1e-6) {
          baseYaw = Math.atan2(footFwd.x, footFwd.z);
        }
      }
    }

    yawAlign.rotation.y = -baseYaw;
    protoRoot.updateMatrixWorld(true);

    pelvisBone.getWorldPosition(_tmpV3);
    const pelvisX = _tmpV3.x;
    const pelvisZ = _tmpV3.z;

    const minB = new THREE.Vector3();
    const maxB = new THREE.Vector3();
    measureSkinnedBoundsAtPose(charMesh, minB, maxB);

    if (Number.isFinite(minB.y) && Number.isFinite(pelvisX) && Number.isFinite(pelvisZ)) {
      yawAlign.position.set(-pelvisX, -minB.y, -pelvisZ);
    }

    testMixer.stopAllAction();
    testMixer.uncacheRoot(protoRoot);
    protoRoot.updateMatrixWorld(true);

    archetypes.push({
      id: `${source}_${role}_${i}`,
      source,
      role,
      protoRoot,
      clip: slicedClip,
      defaultDuration: slicedClip.duration,
    });
  }

  return archetypes;
}

/**
 * Deterministic, obstruction-free arena crowd placement across:
 * - Ringside floor folding chairs (seated & front-row excited cheering fans)
 * - Ramp barricade standing pockets
 * - Lower concrete bowl (seated bleachers front rows, standing/cheering mid & rear)
 * - Upper concrete bowl (200-level clustered standing/cheering fans)
 * - Concourse perimeter walkways (walking fans)
 */
function buildStadiumPlacements(): {
  staticSlots: PlacementSlot[];
  walkSlots: {
    rx: number;
    rz: number;
    centerZ: number;
    y: number;
    thetaMin: number;
    thetaMax: number;
    startTheta: number;
    dir: number;
    speed: number;
    scale: number;
  }[];
} {
  const rand = createSeededRand(90421);
  const staticSlots: PlacementSlot[] = [];

  // 1. RINGSIDE FLOOR CHAIRS
  for (let i = 0; i < FLOOR_CHAIRS.length; i++) {
    const chair = FLOOR_CHAIRS[i];
    const distFromCenter = Math.hypot(chair.x, chair.z);

    const occProb = distFromCenter < 10.6 ? 0.72 : distFromCenter < 13.0 ? 0.44 : 0.24;
    if (rand() > occProb) continue;

    const ellipWalkCheck = (chair.x / 15.1) ** 2 + ((chair.z + 4.0) / 14.7) ** 2;
    if (ellipWalkCheck > 0.94 && rand() > 0.25) continue;

    const baseYaw = Math.atan2(-chair.x, -chair.z);
    const yawJitter = (rand() - 0.5) * 0.22;
    const isNearRamp = chair.z < -4.5 && Math.abs(chair.x) < 5.6;

    let role: CrowdArchetypeRole;
    if (isNearRamp && rand() < 0.35) {
      role = 'stand-cheer';
    } else if (distFromCenter < 9.5 && rand() < 0.14) {
      role = 'stand-cheer';
    } else {
      role = rand() < 0.56 ? 'seated-cheer' : 'seated-idle';
    }

    const xOff = role === 'stand-cheer' ? Math.sin(baseYaw) * 0.16 : 0;
    const zOff = role === 'stand-cheer' ? Math.cos(baseYaw) * 0.16 : 0;

    staticSlots.push({
      x: chair.x + xOff,
      y: 0.0,
      z: chair.z + zOff,
      yaw: baseYaw + yawJitter,
      role,
      scale: 0.95 + rand() * 0.10,
      preferSource: rand() < 0.45 ? 'idle2000' : 'populate',
    });
  }

  // 2. ENTRANCE RAMP BARRICADE STANDING POCKETS
  for (const side of [-1, 1]) {
    let gz = -14.2;
    while (gz <= -7.6) {
      if (rand() > 0.18) {
        const px = side * (2.98 + (rand() - 0.5) * 0.12);
        const pz = gz + (rand() - 0.5) * 0.16;
        const targetZ = gz * 0.45;
        const yaw = Math.atan2(-px, targetZ - pz) + (rand() - 0.5) * 0.22;
        staticSlots.push({
          x: px,
          y: 0.0,
          z: pz,
          yaw,
          role: rand() < 0.72 ? 'stand-cheer' : 'stand-idle',
          scale: 0.94 + rand() * 0.11,
          preferSource: rand() < 0.5 ? 'idle2000' : 'populate',
        });
      }
      gz += 0.86 + rand() * 0.34;
    }
  }

  // 3. LOWER CONCRETE BOWL (rows 0..11 populated, keeping stair aisles & top rim promenade clear)
  const bowlCenterZ = -4.0;
  const stairAngles = [-1.75, -1.05, -0.35, 0.35, 1.05, 1.75];
  const lowerStartRx = 16.4;
  const lowerStartRz = 16.0;
  const rowDepth = 1.05;
  const rowRise = 0.52;

  for (let r = 0; r <= 11; r++) {
    const rx = lowerStartRx + r * rowDepth;
    const rz = lowerStartRz + r * rowDepth;
    const tierTopY = 0.75 + r * rowRise;

    const angularStep = r < 4 ? 0.072 : r < 8 ? 0.095 : 0.125;
    for (let theta = -Math.PI * 0.68; theta <= Math.PI * 0.68; theta += angularStep) {
      if (stairAngles.some((sa) => Math.abs(theta - sa) < 0.085)) continue;

      const keepChance = r <= 3 ? 0.62 : r <= 7 ? 0.42 : 0.28;
      if (rand() > keepChance) continue;

      const tJit = theta + (rand() - 0.5) * angularStep * 0.45;
      const canSitBleacher = r >= 1 && r <= 4;
      const role: CrowdArchetypeRole = canSitBleacher && rand() < 0.48
        ? rand() < 0.58
          ? 'seated-cheer'
          : 'seated-idle'
        : rand() < 0.46
          ? 'stand-cheer'
          : 'stand-idle';

      const isSeatedRole = role === 'seated-cheer' || role === 'seated-idle';
      const radialOff = isSeatedRole ? 0.22 : 0.52 + (rand() - 0.5) * 0.12;
      const px = Math.sin(tJit) * (rx + radialOff);
      const pz = bowlCenterZ + Math.cos(tJit) * (rz + radialOff);
      const py = isSeatedRole ? tierTopY - 0.46 : tierTopY;

      const yaw = Math.atan2(-px, -pz) + (rand() - 0.5) * 0.26;
      staticSlots.push({
        x: px,
        y: py,
        z: pz,
        yaw,
        role,
        scale: 0.94 + rand() * 0.12,
        preferSource: rand() < 0.5 ? 'idle2000' : 'populate',
      });
    }
  }

  // 4. UPPER CONCRETE BOWL (200-level)
  const upperStartRx = 32.05;
  const upperStartRz = 31.65;
  const upperRowDepth = 1.02;
  const upperRowRise = 0.76;

  for (let r = 0; r <= 7; r += 1) {
    const rx = upperStartRx + r * upperRowDepth;
    const rz = upperStartRz + r * upperRowDepth;
    const tierTopY = 10.1 + r * upperRowRise;

    const angularStep = 0.14;
    for (let theta = -Math.PI * 0.70; theta <= Math.PI * 0.70; theta += angularStep) {
      if (stairAngles.some((sa) => Math.abs(theta - sa) < 0.08)) continue;
      if (rand() > (r < 3 ? 0.34 : 0.22)) continue;

      const tJit = theta + (rand() - 0.5) * 0.07;
      const radialOff = 0.5 + (rand() - 0.5) * 0.12;
      const px = Math.sin(tJit) * (rx + radialOff);
      const pz = bowlCenterZ + Math.cos(tJit) * (rz + radialOff);
      const yaw = Math.atan2(-px, -pz) + (rand() - 0.5) * 0.25;

      staticSlots.push({
        x: px,
        y: tierTopY,
        z: pz,
        yaw,
        role: rand() < 0.44 ? 'stand-cheer' : 'stand-idle',
        scale: 0.95 + rand() * 0.12,
        preferSource: rand() < 0.5 ? 'idle2000' : 'populate',
      });
    }
  }

  // 5. CONCOURSE PERIMETER WALKERS
  const walkSlots: {
    rx: number;
    rz: number;
    centerZ: number;
    y: number;
    thetaMin: number;
    thetaMax: number;
    startTheta: number;
    dir: number;
    speed: number;
    scale: number;
  }[] = [];

  for (let i = 0; i < 8; i++) {
    const startTheta = -Math.PI * 0.55 + (i / 7) * (Math.PI * 1.1);
    walkSlots.push({
      rx: 15.72 + (rand() - 0.5) * 0.16,
      rz: 15.32 + (rand() - 0.5) * 0.16,
      centerZ: bowlCenterZ,
      y: 0.0,
      thetaMin: -Math.PI * 0.62,
      thetaMax: Math.PI * 0.62,
      startTheta,
      dir: i % 2 === 0 ? 1 : -1,
      speed: 1.08 + rand() * 0.28,
      scale: 0.95 + rand() * 0.09,
    });
  }

  for (let i = 0; i < 6; i++) {
    const startTheta = -Math.PI * 0.58 + (i / 5) * (Math.PI * 1.16);
    walkSlots.push({
      rx: 30.4,
      rz: 30.0,
      centerZ: bowlCenterZ,
      y: 0.75 + 13 * 0.52,
      thetaMin: -Math.PI * 0.64,
      thetaMax: Math.PI * 0.64,
      startTheta,
      dir: i % 2 === 0 ? -1 : 1,
      speed: 1.12 + rand() * 0.25,
      scale: 0.96 + rand() * 0.08,
    });
  }

  return { staticSlots, walkSlots };
}

export class CrowdAudienceSystem {
  public readonly group = new THREE.Group();

  private readonly agents: CrowdAgent[] = [];
  private readonly sharedGeometries = new Set<THREE.BufferGeometry>();
  private readonly sharedMaterials = new Set<THREE.Material>();
  private readonly sharedTextures = new Set<THREE.Texture>();
  private readonly prototypes: CrowdArchetype[] = [];

  private readonly isSoftwareGl: boolean;
  private disposed = false;
  private loaded = false;

  constructor(maxAniso: number, isSoftwareGl: boolean) {
    this.group.name = 'UnifiedArenaCrowd';
    this.isSoftwareGl = isSoftwareGl;
    void this.loadAsync(maxAniso);
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public getAgentCount(): number {
    return this.agents.length;
  }

  public getArchetypeStats(): Record<CrowdArchetypeRole | 'idle2000' | 'populate', number> {
    const stats: Record<CrowdArchetypeRole | 'idle2000' | 'populate', number> = {
      'seated-cheer': 0,
      'seated-idle': 0,
      'stand-cheer': 0,
      'stand-idle': 0,
      walker: 0,
      idle2000: 0,
      populate: 0,
    };
    for (const a of this.prototypes) {
      stats[a.role]++;
      stats[a.source]++;
    }
    return stats;
  }

  private async loadAsync(maxAniso: number): Promise<void> {
    THREE.Cache.enabled = true;
    const loader = new GLTFLoader();

    const loadGlb = (url: string) =>
      new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });

    try {
      const [idleGltf, popGltf] = await Promise.all([
        loadGlb(CROWD_GLB_IDLE_URL),
        loadGlb(CROWD_GLB_POPULATE_URL),
      ]);

      if (this.disposed) return;

      this.initFromLoadedScenes(
        idleGltf.scene,
        idleGltf.animations,
        popGltf.scene,
        popGltf.animations,
        maxAniso,
      );
    } catch (err) {
      if (!this.disposed) {
        console.warn('[CrowdAudienceSystem] Failed loading crowd GLB assets:', err);
      }
    }
  }

  public initFromLoadedScenes(
    idleScene: THREE.Object3D,
    idleAnims: THREE.AnimationClip[],
    popScene: THREE.Object3D,
    popAnims: THREE.AnimationClip[],
    maxAniso: number,
  ): void {
    if (this.disposed || this.loaded) return;

    const archIdle = extractCrowdArchetypes(
      idleScene,
      idleAnims,
      'idle2000',
      maxAniso,
      this.sharedGeometries,
      this.sharedMaterials,
      this.sharedTextures,
    );
    const archPop = extractCrowdArchetypes(
      popScene,
      popAnims,
      'populate',
      maxAniso,
      this.sharedGeometries,
      this.sharedMaterials,
      this.sharedTextures,
    );

    this.prototypes.push(...archIdle, ...archPop);

    const byRole = new Map<CrowdArchetypeRole, CrowdArchetype[]>();
    const bySourceRole = new Map<string, CrowdArchetype[]>();
    const roles: CrowdArchetypeRole[] = [
      'seated-cheer',
      'seated-idle',
      'stand-cheer',
      'stand-idle',
      'walker',
    ];
    for (const r of roles) byRole.set(r, []);
    for (const arch of this.prototypes) {
      byRole.get(arch.role)?.push(arch);
      const key = `${arch.source}:${arch.role}`;
      let list = bySourceRole.get(key);
      if (!list) {
        list = [];
        bySourceRole.set(key, list);
      }
      list.push(arch);
    }

    const pickArchetype = (
      role: CrowdArchetypeRole,
      rand: () => number,
      preferSource?: 'idle2000' | 'populate',
    ): CrowdArchetype | undefined => {
      if (preferSource) {
        const preferred = bySourceRole.get(`${preferSource}:${role}`);
        if (preferred && preferred.length > 0) {
          return preferred[Math.floor(rand() * preferred.length)];
        }
      }
      const pool = byRole.get(role);
      if (pool && pool.length > 0) {
        return pool[Math.floor(rand() * pool.length)];
      }
      const fallback = byRole.get('stand-idle');
      if (fallback && fallback.length > 0) {
        return fallback[Math.floor(rand() * fallback.length)];
      }
      return this.prototypes[0];
    };

    const { staticSlots, walkSlots } = buildStadiumPlacements();
    const rand = createSeededRand(77419);

    for (const slot of staticSlots) {
      const arch = pickArchetype(slot.role, rand, slot.preferSource);
      if (!arch) continue;

      const clone = SkeletonUtils.clone(arch.protoRoot) as THREE.Object3D;
      clone.position.set(slot.x, slot.y, slot.z);
      clone.rotation.set(0, slot.yaw, 0);
      clone.scale.setScalar(slot.scale);

      const mixer = new THREE.AnimationMixer(clone);
      const action = mixer.clipAction(arch.clip);
      action.play();
      action.time = rand() * arch.defaultDuration;
      const baseTimeScale =
        slot.role === 'stand-cheer' || slot.role === 'seated-cheer'
          ? 0.92 + rand() * 0.22
          : 0.88 + rand() * 0.22;
      action.timeScale = baseTimeScale;
      mixer.update(0);

      this.group.add(clone);
      this.agents.push({
        root: clone,
        mixer,
        action,
        role: arch.role,
        baseTimeScale,
        pendingDt: 0,
        sphereCenter: new THREE.Vector3(slot.x, slot.y + 0.9, slot.z),
      });
    }

    const walkIdle = bySourceRole.get('idle2000:walker') || [];
    const walkPop = bySourceRole.get('populate:walker') || [];
    const walkPool: CrowdArchetype[] = [];
    const maxWLen = Math.max(walkIdle.length, walkPop.length);
    for (let k = 0; k < maxWLen; k++) {
      if (k < walkPop.length) walkPool.push(walkPop[k]);
      if (k < walkIdle.length) walkPool.push(walkIdle[k]);
    }

    for (let wi = 0; wi < walkSlots.length && walkPool.length > 0; wi++) {
      const wSlot = walkSlots[wi];
      const arch = walkPool[wi % walkPool.length];

      const clone = SkeletonUtils.clone(arch.protoRoot) as THREE.Object3D;
      const px = Math.sin(wSlot.startTheta) * wSlot.rx;
      const pz = wSlot.centerZ + Math.cos(wSlot.startTheta) * wSlot.rz;

      const tx = Math.cos(wSlot.startTheta) * wSlot.rx * wSlot.dir;
      const tz = -Math.sin(wSlot.startTheta) * wSlot.rz * wSlot.dir;
      const startYaw = Math.atan2(tx, tz);

      clone.position.set(px, wSlot.y, pz);
      clone.rotation.set(0, startYaw, 0);
      clone.scale.setScalar(wSlot.scale);

      const mixer = new THREE.AnimationMixer(clone);
      const action = mixer.clipAction(arch.clip);
      action.play();
      action.time = rand() * arch.defaultDuration;
      const baseTimeScale = wSlot.speed / 1.15;
      action.timeScale = baseTimeScale;
      mixer.update(0);

      this.group.add(clone);

      const avgR = (wSlot.rx + wSlot.rz) * 0.5;
      this.agents.push({
        root: clone,
        mixer,
        action,
        role: 'walker',
        baseTimeScale,
        pendingDt: 0,
        sphereCenter: new THREE.Vector3(px, wSlot.y + 0.9, pz),
        walkPath: {
          rx: wSlot.rx,
          rz: wSlot.rz,
          centerZ: wSlot.centerZ,
          y: wSlot.y,
          thetaMin: wSlot.thetaMin,
          thetaMax: wSlot.thetaMax,
          theta: wSlot.startTheta,
          dir: wSlot.dir,
          angularSpeed: wSlot.speed / avgR,
          currentYaw: startYaw,
        },
      });
    }

    this.loaded = true;
  }

  public update(dt: number, _elapsed: number, camera: THREE.Camera, isEntrance: boolean): void {
    if (this.disposed || !this.loaded || this.agents.length === 0) return;

    camera.updateMatrixWorld();
    _projScreenMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMat);

    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];

      if (agent.walkPath) {
        const wp = agent.walkPath;
        wp.theta += wp.dir * wp.angularSpeed * dt;
        if (wp.theta >= wp.thetaMax) {
          wp.theta = wp.thetaMax;
          wp.dir = -1;
        } else if (wp.theta <= wp.thetaMin) {
          wp.theta = wp.thetaMin;
          wp.dir = 1;
        }

        const px = Math.sin(wp.theta) * wp.rx;
        const pz = wp.centerZ + Math.cos(wp.theta) * wp.rz;
        const tx = Math.cos(wp.theta) * wp.rx * wp.dir;
        const tz = -Math.sin(wp.theta) * wp.rz * wp.dir;
        const targetYaw = Math.atan2(tx, tz);

        let diff = targetYaw - wp.currentYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        wp.currentYaw += diff * Math.min(1, dt * 6);

        agent.root.position.set(px, wp.y, pz);
        agent.root.rotation.y = wp.currentYaw;
        agent.sphereCenter.set(px, wp.y + 0.9, pz);
      }

      agent.pendingDt += dt;
      if (agent.pendingDt > 0.45) agent.pendingDt = 0.45;

      _sphere.center.copy(agent.sphereCenter);
      _sphere.radius = 1.25;
      if (!_frustum.intersectsSphere(_sphere)) {
        continue;
      }

      const dx = agent.sphereCenter.x - camX;
      const dy = agent.sphereCenter.y - camY;
      const dz = agent.sphereCenter.z - camZ;
      const dSq = dx * dx + dy * dy + dz * dz;

      const interval = this.isSoftwareGl
        ? 0.16
        : dSq < 18 * 18
          ? 0.033
          : dSq < 32 * 32
            ? 0.075
            : 0.14;

      if (agent.pendingDt >= interval) {
        if (agent.role === 'stand-cheer' || agent.role === 'seated-cheer') {
          agent.action.timeScale = agent.baseTimeScale * (isEntrance ? 1.15 : 1.0);
        }
        agent.mixer.update(agent.pendingDt);
        agent.pendingDt = 0;
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    for (const agent of this.agents) {
      agent.mixer.stopAllAction();
      agent.mixer.uncacheRoot(agent.root);
    }
    this.agents.length = 0;
    this.prototypes.length = 0;

    for (const geo of this.sharedGeometries) geo.dispose();
    this.sharedGeometries.clear();

    for (const tex of this.sharedTextures) tex.dispose();
    this.sharedTextures.clear();

    for (const mat of this.sharedMaterials) mat.dispose();
    this.sharedMaterials.clear();
  }
}
