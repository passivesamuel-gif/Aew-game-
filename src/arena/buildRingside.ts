import * as THREE from 'three';
import {
  createArenaFloorTextures,
  createCroppedBannerTexture,
  createRubberMatTextures,
  type AnimatedLedManager,
} from './textures';
import type { ShowThemeConfig } from './types';

export interface RingsideHandle {
  group: THREE.Group;
  applyTheme: (theme: ShowThemeConfig) => void;
  dispose: () => void;
}

export function buildRingsideAndRamp(
  maxAniso: number,
  _initialTheme: ShowThemeConfig,
  leds: AnimatedLedManager,
): RingsideHandle {
  const group = new THREE.Group();
  group.name = 'RingsideAndRamp';

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const floorTex = createArenaFloorTextures(maxAniso);
  track(floorTex.map);
  track(floorTex.bumpMap);
  track(floorTex.roughnessMap);

  const rubberTex = createRubberMatTextures(maxAniso);
  track(rubberTex.map);
  track(rubberTex.bumpMap);

  // Uploaded Barricade texture ("Barricade.jpeg") cropped cleanly from checkerboard
  const barricadeTexLong = track(
    createCroppedBannerTexture(
      '/assets/aistudio/Barricade_cff9c88a.jpeg',
      maxAniso,
      1024,
      128,
      2,
      '#0b0c10',
    ),
  );
  const barricadeTexShort = track(
    createCroppedBannerTexture(
      '/assets/aistudio/Barricade_cff9c88a.jpeg',
      maxAniso,
      1024,
      128,
      1,
      '#0b0c10',
    ),
  );

  // Materials
  // 1. Professional Grey Industrial Floor-Panel Arena Floor
  const arenaFloorMat = track(
    new THREE.MeshStandardMaterial({
      map: floorTex.map,
      bumpMap: floorTex.bumpMap,
      bumpScale: 0.014,
      roughnessMap: floorTex.roughnessMap,
      roughness: 0.68,
      metalness: 0.14,
      envMapIntensity: 0.35,
    }),
  );

  const rubberMat = track(
    new THREE.MeshStandardMaterial({
      map: rubberTex.map,
      bumpMap: rubberTex.bumpMap,
      bumpScale: 0.012,
      roughness: 0.88,
      metalness: 0.02,
      envMapIntensity: 0.25,
    }),
  );

  // 2. Solid Black Entrance Ramp with clean professional matte-satin finish
  const solidBlackRampMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0b0d12,
      metalness: 0.12,
      roughness: 0.64,
      envMapIntensity: 0.25,
    }),
  );

  const solidBlackCurbMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x11141c,
      metalness: 0.22,
      roughness: 0.54,
      envMapIntensity: 0.3,
    }),
  );

  const steelTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.82,
      roughness: 0.34,
      envMapIntensity: 0.65,
    }),
  );

  const darkSteelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x161920,
      metalness: 0.72,
      roughness: 0.46,
      envMapIntensity: 0.45,
    }),
  );

  const barricadePadMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0e1015,
      roughness: 0.72,
      metalness: 0.04,
      envMapIntensity: 0.25,
    }),
  );

  // Barricade wrap materials using uploaded Barricade.jpeg (SHOPAEW.COM | AEW | SHOPAEW.COM)
  const barricadeWrapLongMat = track(
    new THREE.MeshStandardMaterial({
      map: barricadeTexLong,
      roughness: 0.64,
      metalness: 0.04,
      envMapIntensity: 0.25,
    }),
  );

  const barricadeWrapShortMat = track(
    new THREE.MeshStandardMaterial({
      map: barricadeTexShort,
      roughness: 0.64,
      metalness: 0.04,
      envMapIntensity: 0.25,
    }),
  );

  const monitorMat = track(
    new THREE.MeshStandardMaterial({
      map: leds.monitorTexture,
      emissiveMap: leds.monitorTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.05,
    }),
  );

  const brassMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xeab308,
      metalness: 0.94,
      roughness: 0.18,
    }),
  );

  const woodMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x5c3a21,
      roughness: 0.72,
      metalness: 0.02,
    }),
  );

  // 1. ARENA GREY INDUSTRIAL FLOOR-PANEL BASE (y = 0)
  const floorGeo = track(new THREE.PlaneGeometry(106, 94));
  const floorMesh = new THREE.Mesh(floorGeo, arenaFloorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, 0, -5);
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // 2. PADDED RUBBERIZED RINGSIDE FIGHTING AREA (y = 0.024)
  const ringsideMatGeo = track(new THREE.BoxGeometry(13.9, 0.032, 13.9));
  const ringsideMatMesh = new THREE.Mesh(ringsideMatGeo, rubberMat);
  ringsideMatMesh.position.set(0, 0.016, 0);
  ringsideMatMesh.receiveShadow = true;
  group.add(ringsideMatMesh);

  // 3. SOLID BLACK ENTRANCE RAMP (z = -18.1 -> -6.0, y = 1.38 -> 0.22)
  const rampStartZ = -18.1;
  const rampEndZ = -6.0;
  const startY = 1.38;
  const endY = 0.22;
  const rampW = 4.6;
  const dz = rampEndZ - rampStartZ;
  const dy = startY - endY;
  const rampLen = Math.hypot(dz, dy);
  const rampPitch = Math.atan2(dy, dz);

  const rampGroup = new THREE.Group();
  rampGroup.position.set(0, (startY + endY) / 2, (rampStartZ + rampEndZ) / 2);
  rampGroup.rotation.x = rampPitch;

  const rampDeckGeo = track(new THREE.BoxGeometry(rampW, 0.24, rampLen));
  const rampDeck = new THREE.Mesh(rampDeckGeo, solidBlackRampMat);
  rampDeck.position.y = -0.12;
  rampDeck.castShadow = true;
  rampDeck.receiveShadow = true;
  rampGroup.add(rampDeck);

  // Clean solid black side curbing (no glowing LED strips)
  const curbGeo = track(new THREE.BoxGeometry(0.18, 0.06, rampLen));
  [-1, 1].forEach((side) => {
    const curb = new THREE.Mesh(curbGeo, solidBlackCurbMat);
    curb.position.set(side * (rampW / 2 - 0.09), 0.03, 0);
    curb.receiveShadow = true;
    rampGroup.add(curb);
  });

  group.add(rampGroup);

  // Solid black side skirts supporting the ramp down to arena floor
  const rampSkirtShape = new THREE.Shape();
  rampSkirtShape.moveTo(rampStartZ, 0);
  rampSkirtShape.lineTo(rampEndZ, 0);
  rampSkirtShape.lineTo(rampEndZ, endY - 0.04);
  rampSkirtShape.lineTo(rampStartZ, startY - 0.04);
  rampSkirtShape.closePath();

  const rampSkirtGeo = track(
    new THREE.ExtrudeGeometry(rampSkirtShape, {
      depth: 0.16,
      bevelEnabled: false,
    }),
  );
  rampSkirtGeo.rotateY(-Math.PI / 2);

  [-1, 1].forEach((side) => {
    const skirt = new THREE.Mesh(rampSkirtGeo, solidBlackCurbMat);
    skirt.position.set(side * (rampW / 2 - 0.08), 0, 0);
    skirt.castShadow = true;
    skirt.receiveShadow = true;
    group.add(skirt);
  });

  // Short solid black transition wedge onto ringside pad
  const toeLen = Math.hypot(0.9, 0.19);
  const toeGeo = track(new THREE.BoxGeometry(rampW, 0.18, toeLen));
  const toe = new THREE.Mesh(toeGeo, solidBlackRampMat);
  toe.position.set(0, 0.045, -5.55);
  toe.rotation.x = Math.atan2(0.19, 0.9);
  toe.receiveShadow = true;
  group.add(toe);

  // 4. RINGSIDE BARRICADES USING UPLOADED "Barricade.jpeg" (SHOPAEW.COM | AEW)
  const barH = 1.12;
  const barThick = 0.28;

  function addBarricadeSegment(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    useLongRepeat: boolean,
  ) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const segGroup = new THREE.Group();
    segGroup.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    segGroup.rotation.y = angle;

    // Padded wall core
    const wallGeo = track(new THREE.BoxGeometry(barThick, barH, len));
    const wall = new THREE.Mesh(wallGeo, barricadePadMat);
    wall.position.y = barH / 2;
    wall.castShadow = true;
    wall.receiveShadow = true;
    segGroup.add(wall);

    // Top padded cap rail
    const capGeo = track(new THREE.BoxGeometry(barThick + 0.04, 0.09, len + 0.02));
    const cap = new THREE.Mesh(capGeo, darkSteelMat);
    cap.position.y = barH + 0.02;
    segGroup.add(cap);

    // Heavy steel floor base shoes
    const shoeGeo = track(new THREE.BoxGeometry(barThick + 0.22, 0.05, 0.22));
    for (let s = -len / 2 + 0.5; s <= len / 2 - 0.4; s += 1.8) {
      const shoe = new THREE.Mesh(shoeGeo, darkSteelMat);
      shoe.position.set(0, 0.025, s);
      segGroup.add(shoe);
    }

    // Apply uploaded Barricade.jpeg graphic cleanly on both ring-facing & crowd-facing sides
    const wrapMat = useLongRepeat ? barricadeWrapLongMat : barricadeWrapShortMat;
    const wrapGeo = track(new THREE.PlaneGeometry(len - 0.06, barH - 0.08));

    const ringSideWrap = new THREE.Mesh(wrapGeo, wrapMat);
    ringSideWrap.rotation.y = -Math.PI / 2;
    ringSideWrap.position.set(-barThick / 2 - 0.004, barH / 2, 0);
    ringSideWrap.receiveShadow = true;
    segGroup.add(ringSideWrap);

    const crowdSideWrap = new THREE.Mesh(wrapGeo, wrapMat);
    crowdSideWrap.rotation.y = Math.PI / 2;
    crowdSideWrap.position.set(barThick / 2 + 0.004, barH / 2, 0);
    crowdSideWrap.receiveShadow = true;
    segGroup.add(crowdSideWrap);

    group.add(segGroup);
  }

  // Ringside box perimeter (radius = 7.05m)
  addBarricadeSegment(7.05, -7.05, 7.05, 7.05, true);
  addBarricadeSegment(7.05, 7.05, -7.05, 7.05, true);
  addBarricadeSegment(-7.05, 7.05, -7.05, -7.05, true);
  addBarricadeSegment(-7.05, -7.05, -2.55, -7.05, false);
  addBarricadeSegment(2.55, -7.05, 7.05, -7.05, false);

  // Ramp side barricades flanking the solid black entrance ramp
  addBarricadeSegment(-2.55, -7.05, -2.55, -18.1, true);
  addBarricadeSegment(2.55, -7.05, 2.55, -18.1, true);

  // Matte black corner posts at ramp/ringside junction
  const stanchionGeo = track(new THREE.BoxGeometry(0.34, 1.18, 0.34));
  [-2.55, 2.55].forEach((sx) => {
    const st = new THREE.Mesh(stanchionGeo, darkSteelMat);
    st.position.set(sx, 0.59, -7.05);
    st.castShadow = true;
    group.add(st);
  });

  // 5. BROADCAST ANNOUNCE DESK (3-seat composite assembly at x=5.55, z=-1.2)
  const announceGroup = new THREE.Group();
  announceGroup.position.set(5.55, 0, -1.2);
  announceGroup.rotation.y = -Math.PI / 2;

  const deskW = 3.2;
  const deskH = 0.92;
  const deskD = 0.95;

  const deskFrameGeo = track(new THREE.BoxGeometry(deskW - 0.16, deskH - 0.08, deskD - 0.16));
  const deskFrame = new THREE.Mesh(deskFrameGeo, darkSteelMat);
  deskFrame.position.y = (deskH - 0.08) / 2;
  deskFrame.castShadow = true;
  announceGroup.add(deskFrame);

  const deskTopGeo = track(new THREE.BoxGeometry(deskW + 0.12, 0.09, deskD + 0.12));
  const deskTop = new THREE.Mesh(deskTopGeo, barricadePadMat);
  deskTop.position.y = deskH;
  deskTop.castShadow = true;
  deskTop.receiveShadow = true;
  announceGroup.add(deskTop);

  // Clean black/AEW desk front panel
  const deskApronGeo = track(new THREE.PlaneGeometry(deskW - 0.18, 0.68));
  const deskApron = new THREE.Mesh(deskApronGeo, barricadeWrapShortMat);
  deskApron.position.set(0, 0.46, deskD / 2 - 0.06);
  announceGroup.add(deskApron);

  const monHousingGeo = track(new THREE.BoxGeometry(0.54, 0.34, 0.06));
  const monScreenGeo = track(new THREE.PlaneGeometry(0.48, 0.28));
  const micStemGeo = track(new THREE.CylinderGeometry(0.01, 0.012, 0.28, 8));
  const micHeadGeo = track(new THREE.SphereGeometry(0.025, 8, 8));

  const chairSeatGeo = track(new THREE.BoxGeometry(0.48, 0.08, 0.46));
  const chairBackGeo = track(new THREE.BoxGeometry(0.46, 0.56, 0.07));
  const chairPoleGeo = track(new THREE.CylinderGeometry(0.03, 0.035, 0.48, 10));
  const chairBaseGeo = track(new THREE.CylinderGeometry(0.26, 0.28, 0.04, 12));

  [-0.95, 0, 0.95].forEach((mx) => {
    const monGroup = new THREE.Group();
    monGroup.position.set(mx, deskH + 0.18, 0.12);
    monGroup.rotation.x = -0.35;
    const housing = new THREE.Mesh(monHousingGeo, darkSteelMat);
    monGroup.add(housing);
    const screen = new THREE.Mesh(monScreenGeo, monitorMat);
    screen.position.z = -0.033;
    screen.rotation.y = Math.PI;
    monGroup.add(screen);
    announceGroup.add(monGroup);

    const micStem = new THREE.Mesh(micStemGeo, steelTrimMat);
    micStem.position.set(mx + 0.22, deskH + 0.14, -0.24);
    micStem.rotation.x = -0.25;
    announceGroup.add(micStem);
    const micHead = new THREE.Mesh(micHeadGeo, darkSteelMat);
    micHead.position.set(mx + 0.22, deskH + 0.27, -0.28);
    announceGroup.add(micHead);

    const chair = new THREE.Group();
    chair.position.set(mx, 0, -0.92);
    const base = new THREE.Mesh(chairBaseGeo, darkSteelMat);
    base.position.y = 0.02;
    chair.add(base);
    const pole = new THREE.Mesh(chairPoleGeo, steelTrimMat);
    pole.position.y = 0.26;
    chair.add(pole);
    const seat = new THREE.Mesh(chairSeatGeo, barricadePadMat);
    seat.position.y = 0.50;
    seat.castShadow = true;
    chair.add(seat);
    const back = new THREE.Mesh(chairBackGeo, barricadePadMat);
    back.position.set(0, 0.80, -0.21);
    back.rotation.x = -0.12;
    back.castShadow = true;
    chair.add(back);
    announceGroup.add(chair);
  });

  group.add(announceGroup);

  // 6. TIMEKEEPER'S TABLE & BRASS RING BELL (opposite side x=-5.65, z=1.8)
  const tkGroup = new THREE.Group();
  tkGroup.position.set(-5.65, 0, 1.8);
  tkGroup.rotation.y = Math.PI / 2;

  const tkTopGeo = track(new THREE.BoxGeometry(1.9, 0.05, 0.85));
  const tkTop = new THREE.Mesh(tkTopGeo, barricadePadMat);
  tkTop.position.y = 0.78;
  tkTop.castShadow = true;
  tkGroup.add(tkTop);

  const tkSkirtGeo = track(new THREE.BoxGeometry(1.86, 0.74, 0.81));
  const tkSkirt = new THREE.Mesh(tkSkirtGeo, darkSteelMat);
  tkSkirt.position.y = 0.38;
  tkGroup.add(tkSkirt);

  const bellBaseGeo = track(new THREE.BoxGeometry(0.32, 0.04, 0.32));
  const bellBase = new THREE.Mesh(bellBaseGeo, woodMat);
  bellBase.position.set(0.35, 0.82, 0);
  tkGroup.add(bellBase);

  const bellDomeGeo = track(new THREE.CylinderGeometry(0.08, 0.14, 0.16, 20));
  const bellDome = new THREE.Mesh(bellDomeGeo, brassMat);
  bellDome.position.set(0.35, 0.92, 0);
  tkGroup.add(bellDome);

  const malletHandleGeo = track(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8));
  const malletHandle = new THREE.Mesh(malletHandleGeo, woodMat);
  malletHandle.rotation.z = Math.PI / 2;
  malletHandle.position.set(0.05, 0.82, 0.12);
  tkGroup.add(malletHandle);

  const timerBoxGeo = track(new THREE.BoxGeometry(0.42, 0.16, 0.26));
  const timerBox = new THREE.Mesh(timerBoxGeo, darkSteelMat);
  timerBox.position.set(-0.42, 0.88, 0);
  tkGroup.add(timerBox);

  group.add(tkGroup);

  // 7. RINGSIDE BROADCAST CAMERA & DOLLY TRACK (+Z side)
  const camGroup = new THREE.Group();
  camGroup.position.set(1.4, 0, 5.75);

  const trackRailGeo = track(new THREE.BoxGeometry(3.8, 0.06, 0.55));
  const trackRail = new THREE.Mesh(trackRailGeo, steelTrimMat);
  trackRail.position.y = 0.03;
  camGroup.add(trackRail);

  const dollyGeo = track(new THREE.BoxGeometry(0.75, 0.18, 0.65));
  const dolly = new THREE.Mesh(dollyGeo, darkSteelMat);
  dolly.position.y = 0.15;
  camGroup.add(dolly);

  const tripodColGeo = track(new THREE.CylinderGeometry(0.06, 0.08, 1.15, 12));
  const tripodCol = new THREE.Mesh(tripodColGeo, darkSteelMat);
  tripodCol.position.y = 0.8;
  camGroup.add(tripodCol);

  const camBodyGeo = track(new THREE.BoxGeometry(0.28, 0.28, 0.54));
  const camBody = new THREE.Mesh(camBodyGeo, darkSteelMat);
  camBody.position.set(0, 1.48, 0);
  camBody.castShadow = true;
  camGroup.add(camBody);

  const camLensGeo = track(new THREE.CylinderGeometry(0.09, 0.075, 0.28, 14));
  const camLens = new THREE.Mesh(camLensGeo, steelTrimMat);
  camLens.rotation.x = Math.PI / 2;
  camLens.position.set(0, 1.48, -0.34);
  camGroup.add(camLens);

  group.add(camGroup);

  function applyTheme(_theme: ShowThemeConfig) {
    // Ramp remains solid black and barricades keep the exact uploaded Barricade.jpeg wrap
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
  }

  return { group, applyTheme, dispose };
}
