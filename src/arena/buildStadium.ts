import * as THREE from 'three';
import type { AnimatedLedManager } from './textures';
import type { ShowThemeConfig } from './types';

export interface StadiumHandle {
  group: THREE.Group;
  applyTheme: (theme: ShowThemeConfig) => void;
  updateCrowdAndRig: (elapsed: number, isEntrance: boolean, isHouse: boolean) => void;
  dispose: () => void;
}

export function buildStadiumEnvironment(
  initialTheme: ShowThemeConfig,
  leds: AnimatedLedManager,
): StadiumHandle {
  const group = new THREE.Group();
  group.name = 'StadiumEnvironment';

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Materials
  const concreteMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x141821,
      roughness: 0.88,
      metalness: 0.06,
    }),
  );

  const concreteStepMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1d2330,
      roughness: 0.84,
      metalness: 0.08,
    }),
  );

  const wallAcousticMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0b0e15,
      roughness: 0.92,
      metalness: 0.1,
    }),
  );

  const trussMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1a1f29,
      metalness: 0.84,
      roughness: 0.36,
    }),
  );

  const stepNosingMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0x92400e,
      emissiveIntensity: 0.42,
      roughness: 0.55,
      metalness: 0.08,
    }),
  );

  const railMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.82,
      roughness: 0.34,
      envMapIntensity: 0.6,
    }),
  );

  const stadiumRibbonMat = track(
    new THREE.MeshStandardMaterial({
      map: leds.stadiumRibbonTexture,
      emissiveMap: leds.stadiumRibbonTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.85,
      roughness: 0.3,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
  );

  const jumbotronMat = track(
    new THREE.MeshStandardMaterial({
      map: leds.titanTronTexture,
      emissiveMap: leds.titanTronTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.85,
      roughness: 0.28,
      metalness: 0.05,
    }),
  );

  const rigAccentMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(initialTheme.primaryHex),
      emissive: new THREE.Color(initialTheme.primaryHex),
      emissiveIntensity: 1.05,
      roughness: 0.25,
      metalness: 0.05,
    }),
  );

  // 1. ENCLOSED INDOOR STADIUM ARCHITECTURE (Elliptical Bowl + Backstage Curtain Wall)
  // Stadium centered around (0, 0, -4) so ring + stage sit harmoniously inside
  const bowlCenterZ = -4.0;
  const outerRx = 46.0;
  const outerRz = 40.0;
  const roofY = 28.5;

  // Outer perimeter stadium shell wall (CylinderGeometry scaled into ellipse, BackSide)
  const shellGeo = track(new THREE.CylinderGeometry(1, 1, roofY, 48, 1, true));
  shellGeo.scale(outerRx, 1, outerRz);
  const shellMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x090c12,
      roughness: 0.9,
      metalness: 0.12,
      side: THREE.BackSide,
    }),
  );
  const stadiumShell = new THREE.Mesh(shellGeo, shellMat);
  stadiumShell.position.set(0, roofY / 2, bowlCenterZ);
  group.add(stadiumShell);

  // Stadium Ceiling Roof Deck
  const ceilingGeo = track(new THREE.CircleGeometry(1, 48));
  ceilingGeo.rotateX(Math.PI / 2);
  ceilingGeo.scale(outerRx, 1, outerRz);
  const ceiling = new THREE.Mesh(ceilingGeo, wallAcousticMat);
  ceiling.position.set(0, roofY, bowlCenterZ);
  group.add(ceiling);

  // Dark acoustic backstage production curtain behind the stage (z = -24.5)
  const curtainGeo = track(new THREE.BoxGeometry(36, 17.5, 0.4));
  const curtain = new THREE.Mesh(curtainGeo, wallAcousticMat);
  curtain.position.set(0, 8.75, -24.2);
  group.add(curtain);

  // 2. MULTI-TIER AUDIENCE BOWL GEOMETRY + STAIRWAYS + HANDRAILS + 360° RIBBON
  // Build stepped elliptical seating rings using angular arc segments (skipping backstage angle behind TitanTron)
  // Angle theta = atan2(x, z - bowlCenterZ). Backstage is around theta = +-PI (z < -21).
  // So audience bowl spans theta from -0.74*PI to +0.74*PI (~266 degrees) for lower bowl,
  // and slightly wider (-0.82*PI to +0.82*PI) for upper bowl!
  const lowerRows = 14;
  const lowerStartRx = 16.4;
  const lowerStartRz = 16.0;
  const rowDepth = 1.05;
  const rowRise = 0.52;

  const lowerArcStart = -Math.PI * 0.72;
  const lowerArcLen = Math.PI * 1.44;

  for (let r = 0; r < lowerRows; r++) {
    const rx = lowerStartRx + r * rowDepth;
    const rz = lowerStartRz + r * rowDepth;
    const y = 0.75 + r * rowRise;

    const ringShape = new THREE.Shape();
    const segs = 44;
    for (let i = 0; i <= segs; i++) {
      const a = lowerArcStart + (i / segs) * lowerArcLen;
      const px = Math.sin(a) * (rx + rowDepth);
      const py = Math.cos(a) * (rz + rowDepth);
      if (i === 0) ringShape.moveTo(px, py);
      else ringShape.lineTo(px, py);
    }
    for (let i = segs; i >= 0; i--) {
      const a = lowerArcStart + (i / segs) * lowerArcLen;
      const px = Math.sin(a) * rx;
      const py = Math.cos(a) * rz;
      ringShape.lineTo(px, py);
    }
    ringShape.closePath();

    const tierGeo = track(
      new THREE.ExtrudeGeometry(ringShape, { depth: rowRise + 0.05, bevelEnabled: false }),
    );
    tierGeo.rotateX(Math.PI / 2);
    const tier = new THREE.Mesh(tierGeo, r % 2 === 0 ? concreteMat : concreteStepMat);
    tier.position.set(0, y, bowlCenterZ);
    tier.receiveShadow = true;
    group.add(tier);
  }

  // Concourse Vomitory Tunnels & Stairways in Lower Bowl
  const stairAngles = [-1.75, -1.05, -0.35, 0.35, 1.05, 1.75];
  const stairStepGeo = track(new THREE.BoxGeometry(1.35, 0.16, 0.55));
  const nosingGeo = track(new THREE.BoxGeometry(1.36, 0.03, 0.06));
  const handrailPostGeo = track(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 6));

  stairAngles.forEach((a) => {
    const stairGroup = new THREE.Group();
    stairGroup.position.set(0, 0, bowlCenterZ);
    stairGroup.rotation.y = a;

    for (let r = 0; r < lowerRows; r += 1) {
      const dist = (lowerStartRx + lowerStartRz) * 0.5 + r * rowDepth;
      // Approximate elliptical radius at angle a
      const rx = lowerStartRx + r * rowDepth;
      const rz = lowerStartRz + r * rowDepth;
      const rad = (rx * rz) / Math.hypot(rz * Math.sin(a), rx * Math.cos(a));
      const y = 0.78 + r * rowRise;

      const step = new THREE.Mesh(stairStepGeo, concreteStepMat);
      step.position.set(0, y, rad + 0.45);
      stairGroup.add(step);

      const nosing = new THREE.Mesh(nosingGeo, stepNosingMat);
      nosing.position.set(0, y + 0.075, rad + 0.19);
      stairGroup.add(nosing);

      if (r % 3 === 0) {
        const post = new THREE.Mesh(handrailPostGeo, railMat);
        post.position.set(0, y + 0.5, rad + 0.45);
        stairGroup.add(post);
      }
      void dist;
    }

    // Vomitory dark portal archway at top of aisle
    const vomRad =
      ((lowerStartRx + lowerRows * rowDepth) * (lowerStartRz + lowerRows * rowDepth)) /
      Math.hypot(
        (lowerStartRz + lowerRows * rowDepth) * Math.sin(a),
        (lowerStartRx + lowerRows * rowDepth) * Math.cos(a),
      );
    const vomGeo = track(new THREE.BoxGeometry(2.6, 2.4, 1.8));
    const vom = new THREE.Mesh(vomGeo, wallAcousticMat);
    vom.position.set(0, 0.75 + lowerRows * rowRise + 1.0, vomRad + 0.6);
    stairGroup.add(vom);

    group.add(stairGroup);
  });

  // 360-DEGREE UPPER-LEVEL LED RIBBON DISPLAY (encircling the bowl above lower tier)
  const ribbonRx = lowerStartRx + lowerRows * rowDepth + 0.35;
  const ribbonRz = lowerStartRz + lowerRows * rowDepth + 0.35;
  const ribbonGeo = track(new THREE.CylinderGeometry(1, 1, 1.35, 56, 1, true));
  ribbonGeo.scale(ribbonRx, 1, ribbonRz);
  const ribbonMesh = new THREE.Mesh(ribbonGeo, stadiumRibbonMat);
  ribbonMesh.position.set(0, 8.95, bowlCenterZ);
  group.add(ribbonMesh);

  // Structural steel fascia frame above & below ribbon
  const fasciaRingGeo = track(new THREE.CylinderGeometry(1, 1, 0.25, 56, 1, true));
  fasciaRingGeo.scale(ribbonRx - 0.05, 1, ribbonRz - 0.05);
  [8.22, 9.68].forEach((fy) => {
    const fMesh = new THREE.Mesh(fasciaRingGeo, trussMat);
    fMesh.position.set(0, fy, bowlCenterZ);
    group.add(fMesh);
  });

  // UPPER BOWL TIER (200 Level)
  const upperRows = 12;
  const upperStartRx = ribbonRx + 0.6;
  const upperStartRz = ribbonRz + 0.6;
  const upperRowDepth = 1.02;
  const upperRowRise = 0.76;
  const upperArcStart = -Math.PI * 0.78;
  const upperArcLen = Math.PI * 1.56;

  for (let r = 0; r < upperRows; r++) {
    const rx = upperStartRx + r * upperRowDepth;
    const rz = upperStartRz + r * upperRowDepth;
    const y = 10.1 + r * upperRowRise;

    const ringShape = new THREE.Shape();
    const segs = 44;
    for (let i = 0; i <= segs; i++) {
      const a = upperArcStart + (i / segs) * upperArcLen;
      const px = Math.sin(a) * (rx + upperRowDepth);
      const py = Math.cos(a) * (rz + upperRowDepth);
      if (i === 0) ringShape.moveTo(px, py);
      else ringShape.lineTo(px, py);
    }
    for (let i = segs; i >= 0; i--) {
      const a = upperArcStart + (i / segs) * upperArcLen;
      const px = Math.sin(a) * rx;
      const py = Math.cos(a) * rz;
      ringShape.lineTo(px, py);
    }
    ringShape.closePath();

    const tierGeo = track(
      new THREE.ExtrudeGeometry(ringShape, { depth: upperRowRise + 0.05, bevelEnabled: false }),
    );
    tierGeo.rotateX(Math.PI / 2);
    const tier = new THREE.Mesh(tierGeo, r % 2 === 0 ? concreteMat : concreteStepMat);
    tier.position.set(0, y, bowlCenterZ);
    group.add(tier);
  }

  // 3. EMPTY RINGSIDE FLOOR FOLDING CHAIRS (all audience characters removed)
  interface FloorSeat {
    x: number;
    z: number;
    yaw: number;
  }

  const floorSeats: FloorSeat[] = [];
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let gx = -14.2; gx <= 14.2; gx += 0.78) {
    for (let gz = -14.2; gz <= 14.2; gz += 0.92) {
      // Skip inside ringside barricades
      if (Math.abs(gx) < 7.85 && Math.abs(gz) < 7.85) continue;
      // Skip entrance ramp corridor & stage area
      if (gz < -5.8 && Math.abs(gx) < 3.6) continue;
      if (gz < -15.0) continue;
      // Leave clean radial aisle walkways
      if (Math.abs(gx) < 0.85 && gz > 7.5) continue;
      if (Math.abs(gz) < 0.85 && Math.abs(gx) > 7.5) continue;

      // Elliptical outer floor clip
      const ellip = (gx / 15.6) ** 2 + ((gz - bowlCenterZ) / 15.2) ** 2;
      if (ellip > 0.96) continue;

      if (rand() < 0.06) continue;

      const jx = gx + (rand() - 0.5) * 0.14;
      const jz = gz + (rand() - 0.5) * 0.12;
      floorSeats.push({
        x: jx,
        z: jz,
        yaw: Math.atan2(-jx, -jz) + (rand() - 0.5) * 0.25,
      });
    }
  }

  const chairGeo = track(new THREE.BoxGeometry(0.46, 0.44, 0.46));
  const chairMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      roughness: 0.65,
      metalness: 0.35,
    }),
  );
  const chairInst = new THREE.InstancedMesh(chairGeo, chairMat, floorSeats.length);
  const dummy = new THREE.Object3D();
  floorSeats.forEach((seat, idx) => {
    dummy.position.set(seat.x, 0.22, seat.z);
    dummy.rotation.set(0, seat.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    chairInst.setMatrixAt(idx, dummy.matrix);
  });
  chairInst.instanceMatrix.needsUpdate = true;
  chairInst.computeBoundingSphere();
  group.add(chairInst);

  // 4. CEILING ROOF TRUSSES, PA ARRAYS & OVERHEAD RING LIGHTING RIG
  // Roof space-frame girders spanning ceiling
  const girderGeoX = track(new THREE.BoxGeometry(78, 0.85, 0.75));
  for (let z = -26; z <= 22; z += 9.5) {
    const girder = new THREE.Mesh(girderGeoX, trussMat);
    girder.position.set(0, 26.8, z);
    group.add(girder);
  }
  const girderGeoZ = track(new THREE.BoxGeometry(0.75, 0.85, 62));
  for (let x = -30; x <= 30; x += 15) {
    const girder = new THREE.Mesh(girderGeoZ, trussMat);
    girder.position.set(x, 26.2, -2);
    group.add(girder);
  }

  // Suspended Line-Array PA Speaker Clusters
  const paPodGeo = track(new THREE.BoxGeometry(1.4, 2.8, 0.9));
  [
    [-11.5, 19.5, -11.5, 0.65],
    [11.5, 19.5, -11.5, -0.65],
    [-12.5, 19.5, 10.5, 2.35],
    [12.5, 19.5, 10.5, -2.35],
  ].forEach(([px, py, pz, rotY]) => {
    const pa = new THREE.Mesh(paPodGeo, wallAcousticMat);
    pa.position.set(px, py, pz);
    pa.rotation.y = rotY;
    group.add(pa);
  });

  // MASSIVE OVERHEAD RING LIGHTING RIG (suspended directly over ring at y = 12.6m)
  const rigGroup = new THREE.Group();
  rigGroup.position.set(0, 12.6, 0);

  const rigSpan = 11.4;
  const rigBarX = track(new THREE.BoxGeometry(rigSpan + 0.6, 0.65, 0.65));
  const rigBarZ = track(new THREE.BoxGeometry(0.65, 0.65, rigSpan + 0.6));
  [-rigSpan / 2, rigSpan / 2].forEach((off) => {
    const bx = new THREE.Mesh(rigBarX, trussMat);
    bx.position.set(0, 0, off);
    rigGroup.add(bx);

    const bz = new THREE.Mesh(rigBarZ, trussMat);
    bz.position.set(off, 0, 0);
    rigGroup.add(bz);
  });

  // Glowing perimeter accent bar on underside of ring rig
  const rigGlowX = track(new THREE.BoxGeometry(rigSpan - 0.8, 0.08, 0.14));
  const rigGlowZ = track(new THREE.BoxGeometry(0.14, 0.08, rigSpan - 0.8));
  [-rigSpan / 2, rigSpan / 2].forEach((off) => {
    const gx = new THREE.Mesh(rigGlowX, rigAccentMat);
    gx.position.set(0, -0.34, off);
    rigGroup.add(gx);

    const gz = new THREE.Mesh(rigGlowZ, rigAccentMat);
    gz.position.set(off, -0.34, 0);
    rigGroup.add(gz);
  });

  // Chain hoist suspension cables up to roof trusses
  const hoistGeo = track(new THREE.CylinderGeometry(0.035, 0.035, 14.0, 6));
  [
    [-rigSpan / 2, -rigSpan / 2],
    [rigSpan / 2, -rigSpan / 2],
    [rigSpan / 2, rigSpan / 2],
    [-rigSpan / 2, rigSpan / 2],
  ].forEach(([hx, hz]) => {
    const cable = new THREE.Mesh(hoistGeo, railMat);
    cable.position.set(hx, 7.0, hz);
    rigGroup.add(cable);
  });

  // 4-sided Center-Hung Mini-Jumbotron inside the overhead truss square
  const jumboW = 4.4;
  const jumboH = 2.3;
  const jumboCoreGeo = track(new THREE.BoxGeometry(jumboW, jumboH, jumboW));
  const jumboCore = new THREE.Mesh(jumboCoreGeo, trussMat);
  jumboCore.position.y = 1.1;
  rigGroup.add(jumboCore);

  const jumboScreenGeo = track(new THREE.PlaneGeometry(jumboW - 0.25, jumboH - 0.25));
  [
    [0, 1.1, jumboW / 2 + 0.02, 0],
    [0, 1.1, -jumboW / 2 - 0.02, Math.PI],
    [jumboW / 2 + 0.02, 1.1, 0, Math.PI / 2],
    [-jumboW / 2 - 0.02, 1.1, 0, -Math.PI / 2],
  ].forEach(([sx, sy, sz, ry]) => {
    const scr = new THREE.Mesh(jumboScreenGeo, jumbotronMat);
    scr.position.set(sx, sy, sz);
    scr.rotation.y = ry;
    rigGroup.add(scr);
  });

  // Downward-facing spotlight fixtures & volumetric beam cones aimed onto the ring
  const podGeo = track(new THREE.CylinderGeometry(0.18, 0.24, 0.42, 10));
  const podLensMat = track(new THREE.MeshBasicMaterial({ color: 0xfff7ed }));
  const podLensGeo = track(new THREE.CircleGeometry(0.18, 10));

  const ringConeGeo = track(new THREE.ConeGeometry(2.6, 11.6, 20, 1, true));
  ringConeGeo.translate(0, -5.8, 0);
  const ringConeMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xfef3c7,
      transparent: true,
      opacity: 0.015,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );

  const ringCones: THREE.Mesh[] = [];
  [-3.8, 0, 3.8].forEach((px) => {
    [-5.4, 5.4].forEach((pz) => {
      const pod = new THREE.Mesh(podGeo, trussMat);
      pod.position.set(px, -0.45, pz);
      rigGroup.add(pod);

      const lens = new THREE.Mesh(podLensGeo, podLensMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(px, -0.67, pz);
      rigGroup.add(lens);

      const cone = new THREE.Mesh(ringConeGeo, ringConeMat);
      cone.position.set(px, -0.65, pz);
      const aimDir = new THREE.Vector3(-px * 0.35, -11.6, -pz * 0.4).normalize();
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), aimDir);
      rigGroup.add(cone);
      ringCones.push(cone);
    });
  });

  group.add(rigGroup);

  function applyTheme(theme: ShowThemeConfig) {
    rigAccentMat.color.set(theme.primaryHex);
    rigAccentMat.emissive.set(theme.primaryHex);
  }

  function updateCrowdAndRig(_elapsed: number, isEntrance: boolean, isHouse: boolean) {
    ringConeMat.opacity = isHouse ? 0.008 : isEntrance ? 0.028 : 0.015;
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
  }

  return { group, applyTheme, updateCrowdAndRig, dispose };
}
