import * as THREE from 'three';

export type WrestlerAnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'rope-rebound'
  | 'rope-exit-between'
  | 'rope-slide-under'
  | 'rope-enter-between'
  | 'rope-enter-slide'
  | 'apron-step-down'
  | 'apron-step-up'
  | 'barricade-lean'
  | 'barricade-climb'
  | 'barricade-fall'
  | 'knockdown'
  | 'get-up'
  | 'entrance-walk'
  | 'entrance-pose'
  | 'victory-pose'
  | 'corner-climb'
  | 'corner-perch'
  | 'diving-attack'
  | 'springboard-attack'
  | 'strike-jab'
  | 'strike-chop'
  | 'strike-kick'
  | 'strike-elbow'
  | 'strike-clothesline'
  | 'ground-stomp'
  | 'grapple-lock'
  | 'whip-throw'
  | 'move-suplex'
  | 'sell-suplex'
  | 'move-ddt'
  | 'sell-ddt'
  | 'move-slam'
  | 'sell-slam'
  | 'move-powerbomb'
  | 'sell-powerbomb'
  | 'move-neckbreaker'
  | 'sell-neckbreaker'
  | 'finisher-exec'
  | 'sell-finisher'
  | 'reverse-counter'
  | 'hit-stagger'
  | 'pin-cover'
  | 'pin-trapped';

export interface WrestlerAppearance {
  name: string;
  skinHex: number;
  gearPrimaryHex: number;
  gearAccentHex: number;
  bootHex: number;
  hairHex: number;
}

export const WRESTLER_PRESETS: Record<'player' | 'rival', WrestlerAppearance> = {
  player: {
    name: 'Challenger',
    skinHex: 0xd9a17c,
    gearPrimaryHex: 0x161922,
    gearAccentHex: 0xd97706,
    bootHex: 0x111319,
    hairHex: 0x1c1917,
  },
  rival: {
    name: 'Vortex',
    skinHex: 0xc68863,
    gearPrimaryHex: 0x1d4ed8,
    gearAccentHex: 0xe2e8f0,
    bootHex: 0x0f172a,
    hairHex: 0x292524,
  },
};

export interface WrestlerRig {
  root: THREE.Group;
  pelvis: THREE.Group;
  lowerSpine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  leftAnkle: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  rightAnkle: THREE.Group;
  updateAnimation: (
    state: WrestlerAnimState,
    dt: number,
    phaseTime: number,
    moveSpeedRatio: number,
  ) => void;
  dispose: () => void;
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

/**
 * Builds an articulated multi-part 3D pro-wrestler rig (~1.88m tall, bottom-center pivot at y=0).
 */
export function createWrestlerRig(appearance: WrestlerAppearance): WrestlerRig {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const skinMat = track(
    new THREE.MeshStandardMaterial({
      color: appearance.skinHex,
      roughness: 0.62,
      metalness: 0.02,
      envMapIntensity: 0.3,
    }),
  );
  const gearMat = track(
    new THREE.MeshStandardMaterial({
      color: appearance.gearPrimaryHex,
      roughness: 0.42,
      metalness: 0.14,
      envMapIntensity: 0.45,
    }),
  );
  const accentMat = track(
    new THREE.MeshStandardMaterial({
      color: appearance.gearAccentHex,
      roughness: 0.32,
      metalness: 0.65,
      envMapIntensity: 0.65,
    }),
  );
  const bootMat = track(
    new THREE.MeshStandardMaterial({
      color: appearance.bootHex,
      roughness: 0.36,
      metalness: 0.18,
      envMapIntensity: 0.4,
    }),
  );
  const tapeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.88,
      metalness: 0.02,
    }),
  );
  const hairMat = track(
    new THREE.MeshStandardMaterial({
      color: appearance.hairHex,
      roughness: 0.78,
      metalness: 0.05,
    }),
  );

  const root = new THREE.Group();
  root.name = `Wrestler_${appearance.name}`;

  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.96, 0);
  root.add(pelvis);

  const pelvisGeo = track(new THREE.CylinderGeometry(0.175, 0.155, 0.2, 14));
  const pelvisMesh = new THREE.Mesh(pelvisGeo, gearMat);
  pelvisMesh.scale.set(1.12, 1, 0.78);
  pelvis.add(pelvisMesh);

  const beltGeo = track(new THREE.CylinderGeometry(0.18, 0.18, 0.045, 14));
  const beltMesh = new THREE.Mesh(beltGeo, accentMat);
  beltMesh.position.y = 0.085;
  beltMesh.scale.set(1.12, 1, 0.78);
  pelvis.add(beltMesh);

  const lowerSpine = new THREE.Group();
  lowerSpine.position.set(0, 0.1, 0);
  pelvis.add(lowerSpine);

  const absGeo = track(new THREE.CylinderGeometry(0.185, 0.165, 0.22, 14));
  const absMesh = new THREE.Mesh(absGeo, skinMat);
  absMesh.position.y = 0.1;
  absMesh.scale.set(1.1, 1, 0.74);
  lowerSpine.add(absMesh);

  const chest = new THREE.Group();
  chest.position.set(0, 0.2, 0);
  lowerSpine.add(chest);

  const torsoGeo = track(new THREE.CylinderGeometry(0.24, 0.185, 0.3, 14));
  const torsoMesh = new THREE.Mesh(torsoGeo, skinMat);
  torsoMesh.position.y = 0.15;
  torsoMesh.scale.set(1.14, 1, 0.72);
  chest.add(torsoMesh);

  const pecGeo = track(new THREE.SphereGeometry(0.11, 12, 10));
  [-0.085, 0.085].forEach((px) => {
    const pec = new THREE.Mesh(pecGeo, skinMat);
    pec.position.set(px, 0.19, 0.085);
    pec.scale.set(1.05, 0.85, 0.65);
    chest.add(pec);
  });

  const neck = new THREE.Group();
  neck.position.set(0, 0.31, 0);
  chest.add(neck);

  const neckGeo = track(new THREE.CylinderGeometry(0.068, 0.085, 0.1, 12));
  const neckMesh = new THREE.Mesh(neckGeo, skinMat);
  neckMesh.position.y = 0.04;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.set(0, 0.1, 0);
  neck.add(head);

  const craniumGeo = track(new THREE.SphereGeometry(0.115, 16, 14));
  const cranium = new THREE.Mesh(craniumGeo, skinMat);
  cranium.position.y = 0.095;
  cranium.scale.set(0.92, 1.08, 0.98);
  head.add(cranium);

  const jawGeo = track(new THREE.BoxGeometry(0.13, 0.095, 0.14));
  const jaw = new THREE.Mesh(jawGeo, skinMat);
  jaw.position.set(0, 0.04, 0.025);
  head.add(jaw);

  const hairGeo = track(
    new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
  );
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.set(0, 0.11, -0.012);
  hair.scale.set(0.95, 1.05, 1.02);
  hair.rotation.x = -0.22;
  head.add(hair);

  const deltGeo = track(new THREE.SphereGeometry(0.085, 12, 10));
  const upperArmGeo = track(new THREE.CylinderGeometry(0.064, 0.056, 0.28, 12));
  const elbowPadGeo = track(new THREE.SphereGeometry(0.058, 10, 10));
  const forearmGeo = track(new THREE.CylinderGeometry(0.055, 0.042, 0.25, 12));
  const wristTapeGeo = track(new THREE.CylinderGeometry(0.045, 0.043, 0.075, 12));
  const handGeo = track(new THREE.BoxGeometry(0.065, 0.085, 0.075));

  function buildArm(sideSign: number) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideSign * 0.275, 0.24, 0);
    chest.add(shoulder);

    const delt = new THREE.Mesh(deltGeo, skinMat);
    delt.scale.set(1.0, 0.95, 0.92);
    shoulder.add(delt);

    const upperArm = new THREE.Mesh(upperArmGeo, skinMat);
    upperArm.position.y = -0.14;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.28, 0);
    shoulder.add(elbow);

    const elbowCap = new THREE.Mesh(elbowPadGeo, skinMat);
    elbow.add(elbowCap);

    const forearm = new THREE.Mesh(forearmGeo, skinMat);
    forearm.position.y = -0.125;
    elbow.add(forearm);

    const tape = new THREE.Mesh(wristTapeGeo, tapeMat);
    tape.position.y = -0.22;
    elbow.add(tape);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.y = -0.28;
    elbow.add(hand);

    return { shoulder, elbow };
  }

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  const thighGeo = track(new THREE.CylinderGeometry(0.098, 0.076, 0.42, 12));
  const kneePadGeo = track(new THREE.CylinderGeometry(0.08, 0.078, 0.13, 12));
  const shinGeo = track(new THREE.CylinderGeometry(0.074, 0.056, 0.24, 12));
  const bootShaftGeo = track(new THREE.CylinderGeometry(0.068, 0.058, 0.22, 12));
  const bootAccentGeo = track(new THREE.CylinderGeometry(0.07, 0.068, 0.035, 12));
  const bootSoleGeo = track(new THREE.BoxGeometry(0.115, 0.065, 0.24));

  function buildLeg(sideSign: number) {
    const hip = new THREE.Group();
    hip.position.set(sideSign * 0.115, -0.04, 0);
    pelvis.add(hip);

    const thigh = new THREE.Mesh(thighGeo, skinMat);
    thigh.position.y = -0.21;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.43, 0);
    hip.add(knee);

    const kneePad = new THREE.Mesh(kneePadGeo, gearMat);
    kneePad.position.z = 0.008;
    knee.add(kneePad);

    const shin = new THREE.Mesh(shinGeo, skinMat);
    shin.position.y = -0.11;
    knee.add(shin);

    const bootShaft = new THREE.Mesh(bootShaftGeo, bootMat);
    bootShaft.position.y = -0.3;
    knee.add(bootShaft);

    const bootTrim = new THREE.Mesh(bootAccentGeo, accentMat);
    bootTrim.position.y = -0.2;
    knee.add(bootTrim);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.44, 0);
    knee.add(ankle);

    const sole = new THREE.Mesh(bootSoleGeo, bootMat);
    sole.position.set(0, -0.015, 0.055);
    ankle.add(sole);

    return { hip, knee, ankle };
  }

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  let animClock = 0;

  function updateAnimation(
    state: WrestlerAnimState,
    dt: number,
    phaseTime: number,
    moveSpeedRatio: number,
  ) {
    animClock += dt;
    const dampSpeed =
      state === 'rope-slide-under' ||
      state === 'barricade-climb' ||
      state.startsWith('strike-') ||
      state.startsWith('move-') ||
      state.startsWith('sell-') ||
      state === 'finisher-exec' ||
      state === 'sell-finisher'
        ? 22
        : 14;

    const p = THREE.MathUtils.clamp(phaseTime, 0, 1);

    // Target bone angles (default neutral standing)
    let pelvisY = 0.96;
    let pelvisZ = 0;
    let pelvisRx = 0;
    let pelvisRy = 0;
    let pelvisRz = 0;

    let spineRx = 0.04;
    let spineRy = 0;
    let chestRx = 0.04;
    let chestRy = 0;
    let neckRx = -0.04;

    let lShoulderX = 0.18;
    let lShoulderZ = -0.22;
    let lElbowX = -0.55;
    let rShoulderX = 0.18;
    let rShoulderZ = 0.22;
    let rElbowX = -0.55;

    let lHipX = -0.06;
    let lHipZ = -0.05;
    let lKneeX = 0.12;
    let lAnkleX = -0.06;
    let rHipX = -0.06;
    let rHipZ = 0.05;
    let rKneeX = 0.12;
    let rAnkleX = -0.06;

    if (state === 'idle') {
      const breathe = Math.sin(animClock * 2.5) * 0.025;
      pelvisY = 0.94 + breathe * 0.25;
      spineRx = 0.11 + breathe;
      chestRx = 0.08 + breathe;
      lShoulderX = -0.45;
      lShoulderZ = -0.28;
      lElbowX = -1.25;
      rShoulderX = -0.45;
      rShoulderZ = 0.28;
      rElbowX = -1.25;
      lHipX = -0.2;
      lHipZ = -0.11;
      lKneeX = 0.34;
      lAnkleX = -0.14;
      rHipX = 0.08;
      rHipZ = 0.11;
      rKneeX = 0.22;
      rAnkleX = -0.26;
    } else if (state === 'walk' || state === 'run' || state === 'entrance-walk') {
      const isRun = state === 'run';
      const isEntrance = state === 'entrance-walk';
      const freq = isRun ? 10.5 : isEntrance ? 5.6 : 6.4;
      const amp = isRun
        ? 0.85
        : (isEntrance ? 0.42 : 0.48) * THREE.MathUtils.clamp(moveSpeedRatio, 0.35, 1);
      const t = animClock * freq;
      const swing = Math.sin(t);
      const liftL = Math.max(0, Math.cos(t));
      const liftR = Math.max(0, -Math.cos(t));

      pelvisY = (isRun ? 0.88 : 0.93) + Math.abs(Math.sin(t)) * (isRun ? 0.065 : 0.03);
      pelvisRx = isRun ? 0.22 : isEntrance ? -0.03 : 0.06;
      pelvisRy = swing * (isRun ? 0.14 : isEntrance ? 0.12 : 0.08);

      spineRx = isRun ? 0.16 : isEntrance ? -0.04 : 0.06;
      chestRy = -swing * (isRun ? 0.22 : 0.14);
      neckRx = isRun ? -0.26 : -0.06;

      lHipX = -swing * amp - (isRun ? 0.12 : 0);
      lKneeX = (isRun ? 0.28 : 0.14) + liftL * (isRun ? 1.15 : 0.65);
      lAnkleX = -lHipX * 0.45 - lKneeX * 0.4;

      rHipX = swing * amp - (isRun ? 0.12 : 0);
      rKneeX = (isRun ? 0.28 : 0.14) + liftR * (isRun ? 1.15 : 0.65);
      rAnkleX = -rHipX * 0.45 - rKneeX * 0.4;

      lShoulderX = swing * (isRun ? 0.85 : 0.45) - (isRun ? 0.15 : 0);
      lShoulderZ = isEntrance ? -0.32 : -0.22;
      lElbowX = isRun ? -1.45 : -0.55;
      rShoulderX = -swing * (isRun ? 0.85 : 0.45) - (isRun ? 0.15 : 0);
      rShoulderZ = isEntrance ? 0.32 : 0.22;
      rElbowX = isRun ? -1.45 : -0.55;
    } else if (state === 'entrance-pose' || state === 'victory-pose') {
      const swell = Math.sin(p * Math.PI);
      pelvisY = 0.96;
      spineRx = -0.14 * swell;
      chestRx = -0.12;
      neckRx = -0.22;
      lShoulderX = -2.45;
      lShoulderZ = -0.55;
      lElbowX = -0.35;
      rShoulderX = -2.45;
      rShoulderZ = 0.55;
      rElbowX = -0.35;
      lHipZ = -0.14;
      rHipZ = 0.14;
    } else if (state === 'corner-climb') {
      const step = Math.sin(p * Math.PI * 3);
      pelvisY = 0.9 + Math.abs(step) * 0.08;
      pelvisRx = 0.18;
      spineRx = 0.15;
      lShoulderX = -2.1 + step * 0.4;
      lShoulderZ = -0.25;
      lElbowX = -0.9;
      rShoulderX = -2.1 - step * 0.4;
      rShoulderZ = 0.25;
      rElbowX = -0.9;
      lHipX = -0.75 * Math.max(0, step) - 0.2;
      lKneeX = 1.05 * Math.max(0, step) + 0.3;
      rHipX = -0.75 * Math.max(0, -step) - 0.2;
      rKneeX = 1.05 * Math.max(0, -step) + 0.3;
    } else if (state === 'corner-perch') {
      // Poised crouched on top turnbuckle ready to fly
      const bounce = Math.sin(animClock * 4.5) * 0.02;
      pelvisY = 0.8 + bounce;
      pelvisRx = 0.26;
      spineRx = 0.32;
      neckRx = -0.38;
      lShoulderX = -0.8;
      lShoulderZ = -0.95;
      lElbowX = -0.45;
      rShoulderX = -0.8;
      rShoulderZ = 0.95;
      rElbowX = -0.45;
      lHipX = -0.78;
      lHipZ = -0.16;
      lKneeX = 1.18;
      lAnkleX = -0.35;
      rHipX = -0.78;
      rHipZ = 0.16;
      rKneeX = 1.18;
      rAnkleX = -0.35;
    } else if (state === 'diving-attack' || state === 'springboard-attack') {
      // Soaring horizontal flying splash / crossbody / elbow drop pose
      const tuck = Math.sin(p * Math.PI);
      pelvisY = 0.88;
      pelvisRx = THREE.MathUtils.lerp(0.25, 1.38, Math.min(1, p * 1.4));
      spineRx = -0.15 * tuck;
      neckRx = -0.65;
      lShoulderX = -1.1;
      lShoulderZ = -1.25 * tuck - 0.2;
      lElbowX = -0.5;
      rShoulderX = -1.1;
      rShoulderZ = 1.25 * tuck + 0.2;
      rElbowX = -0.5;
      lHipX = 0.28;
      lKneeX = 0.42 * tuck;
      rHipX = 0.28;
      rKneeX = 0.42 * tuck;
    } else if (state === 'strike-jab') {
      const snap = Math.sin(p * Math.PI);
      pelvisY = 0.92;
      pelvisRy = -0.42 * snap;
      chestRy = 0.65 * snap;
      spineRx = 0.15 * snap;
      rShoulderX = -1.52 * snap - 0.25;
      rShoulderZ = 0.15;
      rElbowX = -0.15;
      lShoulderX = -0.55;
      lShoulderZ = -0.35;
      lElbowX = -1.4;
      lHipX = -0.25;
      lKneeX = 0.42;
      rHipX = 0.15;
      rKneeX = 0.22;
    } else if (state === 'strike-chop') {
      const arc = Math.sin(p * Math.PI);
      pelvisY = 0.94;
      pelvisRy = THREE.MathUtils.lerp(-0.45, 0.55, p);
      chestRy = THREE.MathUtils.lerp(-0.5, 0.72, p);
      rShoulderX = -1.35 * arc - 0.2;
      rShoulderZ = THREE.MathUtils.lerp(1.45, -0.35, p);
      rElbowX = -0.22;
      lShoulderX = -0.45;
      lShoulderZ = -0.35;
      lElbowX = -1.1;
    } else if (state === 'strike-kick') {
      const kick = Math.sin(p * Math.PI);
      pelvisY = 0.94;
      pelvisRx = -0.22 * kick;
      pelvisRz = -0.18 * kick;
      rHipX = -1.68 * kick;
      rKneeX = 0.18;
      rAnkleX = 0.25;
      lHipX = -0.05;
      lKneeX = 0.18;
      lShoulderX = -0.45;
      lShoulderZ = -0.65 * kick - 0.2;
      rShoulderX = -0.3;
      rShoulderZ = 0.55 * kick + 0.2;
    } else if (state === 'strike-elbow') {
      const whip = Math.sin(p * Math.PI);
      pelvisY = 0.9;
      pelvisRy = THREE.MathUtils.lerp(-0.6, 0.85, p);
      chestRy = THREE.MathUtils.lerp(-0.3, 0.65, p);
      rShoulderX = -1.45 * whip;
      rShoulderZ = 0.85 * whip;
      rElbowX = -1.85; // bent forearm smash
      lShoulderX = -0.4;
      lElbowX = -1.2;
    } else if (state === 'strike-clothesline') {
      const swing = Math.sin(p * Math.PI);
      pelvisY = 0.88;
      pelvisRx = 0.26;
      chestRy = THREE.MathUtils.lerp(-0.4, 0.65, p);
      rShoulderX = -1.55;
      rShoulderZ = THREE.MathUtils.lerp(1.4, -0.2, p) * swing;
      rElbowX = -0.15;
      lShoulderX = 0.25;
      lShoulderZ = -0.45;
      lHipX = -0.45 * swing;
      lKneeX = 0.6;
      rHipX = 0.35;
    } else if (state === 'ground-stomp') {
      const stomp = Math.sin(p * Math.PI);
      pelvisY = 0.94;
      spineRx = 0.28;
      rHipX = -1.05 * stomp;
      rKneeX = 1.1 * (1 - p * 0.6);
      lShoulderZ = -0.5;
      rShoulderZ = 0.5;
    } else if (state === 'grapple-lock') {
      const wrestle = Math.sin(animClock * 7.5) * 0.08;
      pelvisY = 0.86;
      pelvisRx = 0.22;
      spineRx = 0.28 + wrestle;
      chestRy = wrestle;
      lShoulderX = -1.32;
      lShoulderZ = 0.16;
      lElbowX = -0.95;
      rShoulderX = -1.32;
      rShoulderZ = -0.16;
      rElbowX = -0.95;
      lHipX = -0.42;
      lKneeX = 0.68;
      rHipX = 0.12;
      rKneeX = 0.38;
    } else if (state === 'whip-throw') {
      const whip = Math.sin(p * Math.PI);
      pelvisY = 0.9;
      pelvisRy = THREE.MathUtils.lerp(-0.5, 0.95, p);
      chestRy = 0.4 * whip;
      lShoulderX = -1.35 * whip;
      rShoulderX = -1.35 * whip;
      rShoulderZ = 0.85 * whip;
      lElbowX = -0.4;
      rElbowX = -0.4;
    } else if (state === 'move-suplex') {
      // Attacker hooks neck/waist, lifts vertically, then arches backward onto mat!
      if (p < 0.45) {
        const up = p / 0.45;
        pelvisY = 0.88 + up * 0.08;
        pelvisRx = THREE.MathUtils.lerp(0.2, -0.35, up);
        spineRx = THREE.MathUtils.lerp(0.25, -0.45, up);
        lShoulderX = -2.2 * up - 0.6;
        rShoulderX = -2.2 * up - 0.6;
      } else {
        const arch = (p - 0.45) / 0.55;
        pelvisY = THREE.MathUtils.lerp(0.96, 0.24, arch);
        pelvisRx = THREE.MathUtils.lerp(-0.35, -1.45, arch);
        spineRx = -0.25;
        lShoulderX = -1.8;
        rShoulderX = -1.8;
      }
      lHipX = -0.25;
      rHipX = -0.25;
    } else if (state === 'sell-suplex') {
      // Victim lifted upside-down in air, then crashes flat onto back!
      if (p < 0.45) {
        const lift = p / 0.45;
        pelvisY = THREE.MathUtils.lerp(0.92, 1.55, lift);
        pelvisRx = THREE.MathUtils.lerp(0.1, -Math.PI * 0.95, lift);
        lHipX = -0.1;
        rHipX = -0.1;
      } else {
        const slam = (p - 0.45) / 0.55;
        pelvisY = THREE.MathUtils.lerp(1.55, 0.16, slam);
        pelvisRx = THREE.MathUtils.lerp(-Math.PI * 0.95, -1.48, slam);
      }
      lShoulderX = -1.4;
      lShoulderZ = -0.6;
      rShoulderX = -1.4;
      rShoulderZ = 0.6;
    } else if (state === 'move-ddt') {
      // Attacker snaps opponent's head down while dropping backward to mat
      const drop = Math.sin(Math.min(1, p * 1.2) * Math.PI * 0.5);
      pelvisY = THREE.MathUtils.lerp(0.92, 0.24, drop);
      pelvisRx = THREE.MathUtils.lerp(0.2, -1.35, drop);
      lShoulderX = -1.2;
      rShoulderX = -1.2;
      lElbowX = -1.2;
      rElbowX = -1.2;
    } else if (state === 'sell-ddt') {
      // Victim spiked head-first then flops supine
      if (p < 0.55) {
        const spike = p / 0.55;
        pelvisY = THREE.MathUtils.lerp(0.9, 0.65, spike);
        pelvisRx = THREE.MathUtils.lerp(0.3, 1.45, spike);
      } else {
        const flop = (p - 0.55) / 0.45;
        pelvisY = THREE.MathUtils.lerp(0.65, 0.16, flop);
        pelvisRx = THREE.MathUtils.lerp(1.45, -1.45, flop);
      }
    } else if (state === 'move-slam' || state === 'move-neckbreaker') {
      const heave = Math.sin(p * Math.PI);
      pelvisY = 0.88 - 0.14 * heave;
      pelvisRx = state === 'move-neckbreaker' ? THREE.MathUtils.lerp(0.1, -1.25, p) : 0.25 * heave;
      pelvisRy = state === 'move-slam' ? (p - 0.5) * 1.2 : 0;
      lShoulderX = -1.9 * heave - 0.5;
      rShoulderX = -1.9 * heave - 0.5;
      lHipX = -0.35 * heave;
      lKneeX = 0.7 * heave + 0.15;
    } else if (state === 'sell-slam' || state === 'sell-neckbreaker') {
      if (p < 0.5) {
        const up = p / 0.5;
        pelvisY = THREE.MathUtils.lerp(0.92, 1.38, up);
        pelvisRx = THREE.MathUtils.lerp(0.1, -0.7, up);
        pelvisRz = 0.7 * up;
      } else {
        const down = (p - 0.5) / 0.5;
        pelvisY = THREE.MathUtils.lerp(1.38, 0.16, down);
        pelvisRx = THREE.MathUtils.lerp(-0.7, -1.48, down);
        pelvisRz = 0;
      }
      lShoulderZ = -0.85;
      rShoulderZ = 0.85;
    } else if (state === 'move-powerbomb' || state === 'finisher-exec') {
      // Lift opponent high overhead then sit-out slam / spinning cutter impact!
      if (p < 0.5) {
        const lift = p / 0.5;
        pelvisY = 0.88 + lift * 0.1;
        pelvisRx = -0.25 * lift;
        lShoulderX = -2.65 * lift - 0.4;
        rShoulderX = -2.65 * lift - 0.4;
        lElbowX = -0.45;
        rElbowX = -0.45;
      } else {
        const slam = (p - 0.5) / 0.5;
        pelvisY = THREE.MathUtils.lerp(0.98, 0.34, slam);
        pelvisRx = THREE.MathUtils.lerp(-0.25, 0.25, slam);
        lShoulderX = THREE.MathUtils.lerp(-2.9, -0.45, slam);
        rShoulderX = THREE.MathUtils.lerp(-2.9, -0.45, slam);
        lHipX = -1.15 * slam;
        lKneeX = 0.45;
        rHipX = -1.15 * slam;
        rKneeX = 0.45;
      }
    } else if (state === 'sell-powerbomb' || state === 'sell-finisher') {
      if (p < 0.5) {
        const lift = p / 0.5;
        pelvisY = THREE.MathUtils.lerp(0.95, 1.85, lift);
        pelvisRx = THREE.MathUtils.lerp(0.2, -0.85, lift);
      } else {
        const impact = (p - 0.5) / 0.5;
        pelvisY = THREE.MathUtils.lerp(1.85, 0.16, impact);
        pelvisRx = THREE.MathUtils.lerp(-0.85, -1.5, impact);
      }
      lShoulderZ = -1.1;
      rShoulderZ = 1.1;
    } else if (state === 'reverse-counter') {
      const spin = Math.sin(p * Math.PI);
      pelvisY = 0.84;
      pelvisRy = p * Math.PI * 1.1;
      spineRx = 0.22 * spin;
      lShoulderX = -1.25 * spin;
      lShoulderZ = -0.85;
      rShoulderX = -1.25 * spin;
      rShoulderZ = 0.85;
    } else if (state === 'hit-stagger') {
      const snap = Math.sin(p * Math.PI);
      pelvisY = 0.91;
      pelvisRx = -0.28 * snap;
      spineRx = -0.35 * snap;
      neckRx = 0.42 * snap;
      lShoulderX = -0.4;
      lShoulderZ = -0.75 * snap - 0.2;
      rShoulderX = -0.4;
      rShoulderZ = 0.75 * snap + 0.2;
    } else if (state === 'pin-cover') {
      // Kneeling across opponent's chest hooking the leg
      pelvisY = 0.36;
      pelvisRx = 0.78;
      spineRx = 0.35;
      lShoulderX = -1.1;
      lShoulderZ = -0.35;
      rShoulderX = -1.1;
      rShoulderZ = 0.35;
      lHipX = -0.95;
      lKneeX = 1.75;
      rHipX = -0.55;
      rKneeX = 1.45;
    } else if (state === 'pin-trapped') {
      const struggle = Math.sin(animClock * 18) * 0.08;
      pelvisY = 0.16;
      pelvisRx = -1.48;
      pelvisRz = struggle;
      lShoulderZ = -0.95;
      rShoulderZ = 0.95;
      lHipX = -0.35 + struggle;
      lKneeX = 0.65;
    } else if (state === 'rope-rebound') {
      pelvisY = 0.9;
      pelvisRx = -0.18;
      spineRx = -0.24;
      chestRx = -0.16;
      neckRx = 0.22;
      lShoulderX = -0.65;
      lShoulderZ = -1.05;
      lElbowX = -0.45;
      rShoulderX = -0.65;
      rShoulderZ = 1.05;
      rElbowX = -0.45;
      lHipX = -0.28;
      lKneeX = 0.52;
      lAnkleX = -0.24;
      rHipX = 0.18;
      rKneeX = 0.35;
      rAnkleX = -0.42;
    } else if (state === 'rope-exit-between' || state === 'rope-enter-between') {
      const stepArc = Math.sin(p * Math.PI);
      pelvisY = 0.84 + stepArc * 0.12;
      pelvisRx = 0.32 * stepArc;
      spineRx = 0.48 * stepArc;
      chestRx = 0.24 * stepArc;
      neckRx = -0.38 * stepArc;
      lShoulderX = -1.05 * stepArc - 0.25;
      lShoulderZ = -0.78 * stepArc - 0.2;
      lElbowX = -0.75;
      rShoulderX = -1.05 * stepArc - 0.25;
      rShoulderZ = 0.78 * stepArc + 0.2;
      rElbowX = -0.75;
      const firstHalf = p < 0.5 ? Math.sin(p * 2 * Math.PI) : 0;
      const secondHalf = p >= 0.5 ? Math.sin((p - 0.5) * 2 * Math.PI) : 0;
      lHipX = -1.25 * firstHalf - 0.15;
      lKneeX = 1.45 * firstHalf + 0.25;
      rHipX = -1.25 * secondHalf - 0.15;
      rKneeX = 1.45 * secondHalf + 0.25;
    } else if (state === 'rope-slide-under' || state === 'rope-enter-slide') {
      const flat = Math.sin(p * Math.PI);
      const flatStrong = Math.min(1, flat * 1.45);
      pelvisY = THREE.MathUtils.lerp(0.94, 0.2, flatStrong);
      pelvisRx = THREE.MathUtils.lerp(0.08, -1.32, flatStrong);
      spineRx = 0.22 * flatStrong;
      neckRx = 0.45 * flatStrong;
      lShoulderX = -0.65 * flatStrong;
      lShoulderZ = -0.45;
      lElbowX = -0.85;
      rShoulderX = 0.35 * flatStrong;
      rShoulderZ = 0.42;
      rElbowX = -0.6;
      lHipX = -0.22 * flatStrong;
      lKneeX = 0.25 * flatStrong;
      rHipX = -0.75 * flatStrong;
      rKneeX = 1.35 * flatStrong;
    } else if (state === 'apron-step-down' || state === 'apron-step-up') {
      const lift = Math.sin(p * Math.PI);
      pelvisY = 0.88 + lift * 0.06;
      spineRx = 0.18;
      lHipX = -0.65 * lift - 0.12;
      lKneeX = 0.95 * lift + 0.25;
      rHipX = -0.25 * (1 - lift) - 0.1;
      rKneeX = 0.45;
      lShoulderX = -0.35;
      lShoulderZ = -0.42;
      rShoulderX = -0.35;
      rShoulderZ = 0.42;
    } else if (state === 'barricade-lean') {
      pelvisY = 0.93;
      pelvisRx = 0.14;
      spineRx = 0.22;
      lShoulderX = -1.05;
      lShoulderZ = -0.18;
      lElbowX = -0.45;
      rShoulderX = -1.05;
      rShoulderZ = 0.18;
      rElbowX = -0.45;
      lHipX = -0.22;
      lKneeX = 0.32;
      rHipX = 0.12;
      rKneeX = 0.18;
    } else if (state === 'barricade-climb') {
      const arc = Math.sin(p * Math.PI);
      pelvisY = 0.92 + arc * 0.42;
      pelvisRx = 0.45 * arc;
      spineRx = 0.28 * arc;
      neckRx = -0.35 * arc;
      lShoulderX = -1.25 * (1 - p * 0.6);
      lShoulderZ = -0.34;
      lElbowX = -0.35;
      rShoulderX = -1.25 * (1 - p * 0.6);
      rShoulderZ = 0.34;
      rElbowX = -0.35;
      lHipX = -1.35 * arc - 0.15;
      lKneeX = 1.65 * arc + 0.28;
      rHipX = -1.22 * arc - 0.15;
      rKneeX = 1.55 * arc + 0.28;
    } else if (state === 'barricade-fall') {
      pelvisY = THREE.MathUtils.lerp(1.25, 0.18, p);
      pelvisRx = THREE.MathUtils.lerp(0.6, -1.48, p);
      pelvisZ = 0.05;
      spineRx = -0.15;
      lShoulderX = -1.1;
      lShoulderZ = -0.85;
      lElbowX = -0.4;
      rShoulderX = -0.9;
      rShoulderZ = 0.95;
      rElbowX = -0.4;
      lHipX = -0.45;
      lKneeX = 0.85;
      rHipX = -0.2;
      rKneeX = 0.4;
    } else if (state === 'knockdown') {
      pelvisY = 0.16;
      pelvisRx = -1.46;
      pelvisRz = 0.08;
      spineRx = -0.06;
      chestRx = 0.05;
      neckRx = 0.32;
      lShoulderX = -0.25;
      lShoulderZ = -0.95;
      lElbowX = -0.45;
      rShoulderX = -0.15;
      rShoulderZ = 0.88;
      rElbowX = -0.6;
      lHipX = -0.18;
      lKneeX = 0.42;
      rHipX = -0.08;
      rKneeX = 0.25;
    } else if (state === 'get-up') {
      pelvisY = THREE.MathUtils.lerp(0.18, 0.94, p);
      pelvisRx = THREE.MathUtils.lerp(-1.35, 0.08, p);
      spineRx = Math.sin(p * Math.PI) * 0.55;
      lShoulderX = -0.85 * (1 - p) - 0.35 * p;
      lShoulderZ = -0.35;
      lElbowX = -0.9;
      rShoulderX = -0.85 * (1 - p) - 0.35 * p;
      rShoulderZ = 0.35;
      rElbowX = -0.9;
      lHipX = -0.85 * Math.sin(p * Math.PI) - 0.12;
      lKneeX = 1.15 * Math.sin(p * Math.PI) + 0.22;
      rHipX = -0.25;
      rKneeX = 0.45;
    }

    pelvis.position.y = dampAngle(pelvis.position.y, pelvisY, dampSpeed, dt);
    pelvis.position.z = dampAngle(pelvis.position.z, pelvisZ, dampSpeed, dt);
    pelvis.rotation.x = dampAngle(pelvis.rotation.x, pelvisRx, dampSpeed, dt);
    pelvis.rotation.y = dampAngle(pelvis.rotation.y, pelvisRy, dampSpeed, dt);
    pelvis.rotation.z = dampAngle(pelvis.rotation.z, pelvisRz, dampSpeed, dt);

    lowerSpine.rotation.x = dampAngle(lowerSpine.rotation.x, spineRx, dampSpeed, dt);
    lowerSpine.rotation.y = dampAngle(lowerSpine.rotation.y, spineRy, dampSpeed, dt);
    chest.rotation.x = dampAngle(chest.rotation.x, chestRx, dampSpeed, dt);
    chest.rotation.y = dampAngle(chest.rotation.y, chestRy, dampSpeed, dt);
    neck.rotation.x = dampAngle(neck.rotation.x, neckRx, dampSpeed, dt);

    leftArm.shoulder.rotation.x = dampAngle(leftArm.shoulder.rotation.x, lShoulderX, dampSpeed, dt);
    leftArm.shoulder.rotation.z = dampAngle(leftArm.shoulder.rotation.z, lShoulderZ, dampSpeed, dt);
    leftArm.elbow.rotation.x = dampAngle(leftArm.elbow.rotation.x, lElbowX, dampSpeed, dt);

    rightArm.shoulder.rotation.x = dampAngle(
      rightArm.shoulder.rotation.x,
      rShoulderX,
      dampSpeed,
      dt,
    );
    rightArm.shoulder.rotation.z = dampAngle(
      rightArm.shoulder.rotation.z,
      rShoulderZ,
      dampSpeed,
      dt,
    );
    rightArm.elbow.rotation.x = dampAngle(rightArm.elbow.rotation.x, rElbowX, dampSpeed, dt);

    leftLeg.hip.rotation.x = dampAngle(leftLeg.hip.rotation.x, lHipX, dampSpeed, dt);
    leftLeg.hip.rotation.z = dampAngle(leftLeg.hip.rotation.z, lHipZ, dampSpeed, dt);
    leftLeg.knee.rotation.x = dampAngle(leftLeg.knee.rotation.x, lKneeX, dampSpeed, dt);
    leftLeg.ankle.rotation.x = dampAngle(leftLeg.ankle.rotation.x, lAnkleX, dampSpeed, dt);

    rightLeg.hip.rotation.x = dampAngle(rightLeg.hip.rotation.x, rHipX, dampSpeed, dt);
    rightLeg.hip.rotation.z = dampAngle(rightLeg.hip.rotation.z, rHipZ, dampSpeed, dt);
    rightLeg.knee.rotation.x = dampAngle(rightLeg.knee.rotation.x, rKneeX, dampSpeed, dt);
    rightLeg.ankle.rotation.x = dampAngle(rightLeg.ankle.rotation.x, rAnkleX, dampSpeed, dt);
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
  }

  return {
    root,
    pelvis,
    lowerSpine,
    chest,
    neck,
    head,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    leftAnkle: leftLeg.ankle,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    rightAnkle: rightLeg.ankle,
    updateAnimation,
    dispose,
  };
}
