import * as THREE from 'three';
import {
  createCanvasMatTextures,
  createCroppedBannerTexture,
  createDiamondPlateTextures,
  createRopeTexture,
  type CanvasMatTextureSet,
} from './textures';
import {
  ROPE_BASE_RADIUS,
  ROPE_RADIAL_SEGMENTS,
  ROPE_REST_SAG,
  ROPE_TUBULAR_SEGMENTS,
  RingRopePhysics,
} from './ropePhysics';
import type { ShowThemeConfig } from './types';

export interface RingHandle {
  group: THREE.Group;
  ropePhysics: RingRopePhysics;
  update: (dt: number) => void;
  applyTheme: (theme: ShowThemeConfig) => void;
  dispose: () => void;
}

export function buildWrestlingRing(
  maxAniso: number,
  initialTheme: ShowThemeConfig,
  onRopeImpact?: (strength: number) => void,
): RingHandle {
  const group = new THREE.Group();
  group.name = 'WrestlingRing';

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Dimensions (1 unit = 1 meter, realistic 20x20ft pro wrestling ring)
  const matSize = 6.2;
  const apronSize = 6.84;
  const matY = 1.06;
  const deckThickness = 0.14;
  const postOffset = 3.34;
  const postHeight = 2.58;
  const ropeHeights = [1.46, 1.88, 2.30];

  // Uploaded AEW Ring Canvas texture
  const canvasTextures: CanvasMatTextureSet = createCanvasMatTextures(maxAniso);
  track(canvasTextures.map);
  track(canvasTextures.bumpMap);
  track(canvasTextures.roughnessMap);

  // Uploaded Ring Apron texture ("Ring Apron for all 4 sides.jpeg") cropped cleanly from checkerboard
  const uploadedApronTex = track(
    createCroppedBannerTexture(
      '/assets/aistudio/Ring_Apron_for_all_4_sides_d251cbeb.jpeg',
      maxAniso,
      1024,
      128,
      1,
      '#0b132b',
    ),
  );

  const diamondTex = createDiamondPlateTextures(maxAniso);
  track(diamondTex.bumpMap);

  const ropeBump = createRopeTexture(maxAniso);
  track(ropeBump);

  // Shared materials
  const steelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x262b34,
      metalness: 0.82,
      roughness: 0.36,
      envMapIntensity: 0.6,
    }),
  );

  const postSteelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x11141a,
      metalness: 0.72,
      roughness: 0.36,
      envMapIntensity: 0.65,
    }),
  );

  const chromeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.88,
      roughness: 0.26,
      envMapIntensity: 0.75,
    }),
  );

  const woodDeckMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x7c5c3e,
      metalness: 0.0,
      roughness: 0.88,
      envMapIntensity: 0.3,
    }),
  );

  const canvasMat = track(
    new THREE.MeshStandardMaterial({
      map: canvasTextures.map,
      bumpMap: canvasTextures.bumpMap,
      bumpScale: 0.005,
      roughnessMap: canvasTextures.roughnessMap,
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.18,
    }),
  );

  const apronPadMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x121620,
      roughness: 0.64,
      metalness: 0.05,
      envMapIntensity: 0.35,
    }),
  );

  // Printed fabric/vinyl AEW DYNAMITE apron banner applied to all 4 sides
  const apronBannerMat = track(
    new THREE.MeshStandardMaterial({
      map: uploadedApronTex,
      roughness: 0.68,
      metalness: 0.04,
      envMapIntensity: 0.25,
    }),
  );

  const turnbucklePadMat = track(
    new THREE.MeshStandardMaterial({
      color: initialTheme.turnbuckleColor,
      roughness: 0.52,
      metalness: 0.05,
      envMapIntensity: 0.4,
    }),
  );

  const ropeMaterials = initialTheme.ropeColors.map((col) =>
    track(
      new THREE.MeshStandardMaterial({
        color: col,
        bumpMap: ropeBump,
        bumpScale: 0.012,
        roughness: 0.52,
        metalness: 0.04,
        envMapIntensity: 0.4,
      }),
    ),
  );

  const tapeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.62,
      metalness: 0.04,
    }),
  );

  const stepSteelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x7a8594,
      bumpMap: diamondTex.bumpMap,
      bumpScale: 0.018,
      metalness: 0.84,
      roughness: 0.38,
      envMapIntensity: 0.65,
    }),
  );

  const stepTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x4b5563,
      metalness: 0.85,
      roughness: 0.34,
      envMapIntensity: 0.6,
    }),
  );

  // 1. VISIBLE UNDER-RING STEEL SUPPORT STRUCTURE
  const underStructure = new THREE.Group();
  underStructure.name = 'UnderRingStructure';

  const centerPlateGeo = track(new THREE.BoxGeometry(0.95, 0.05, 0.95));
  const centerPlate = new THREE.Mesh(centerPlateGeo, steelMat);
  centerPlate.position.set(0, 0.025, 0);
  centerPlate.receiveShadow = true;
  underStructure.add(centerPlate);

  const centerJackGeo = track(new THREE.CylinderGeometry(0.14, 0.18, 0.88, 16));
  const centerJack = new THREE.Mesh(centerJackGeo, steelMat);
  centerJack.position.set(0, 0.46, 0);
  centerJack.castShadow = true;
  underStructure.add(centerJack);

  const centerCollarGeo = track(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16));
  const centerCollar = new THREE.Mesh(centerCollarGeo, chromeMat);
  centerCollar.position.set(0, 0.86, 0);
  underStructure.add(centerCollar);

  const beamSpan = apronSize - 0.32;
  const beamGeoX = track(new THREE.BoxGeometry(beamSpan, 0.14, 0.11));
  const beamGeoZ = track(new THREE.BoxGeometry(0.11, 0.14, beamSpan));
  [-beamSpan / 2, beamSpan / 2].forEach((offset) => {
    const bx = new THREE.Mesh(beamGeoX, steelMat);
    bx.position.set(0, 0.84, offset);
    bx.castShadow = true;
    underStructure.add(bx);

    const bz = new THREE.Mesh(beamGeoZ, steelMat);
    bz.position.set(offset, 0.84, 0);
    bz.castShadow = true;
    underStructure.add(bz);
  });

  const joistGeo = track(new THREE.BoxGeometry(beamSpan - 0.1, 0.11, 0.08));
  for (let i = -2; i <= 2; i++) {
    const joist = new THREE.Mesh(joistGeo, steelMat);
    joist.position.set(0, 0.85, i * 1.3);
    underStructure.add(joist);
  }

  const legGeo = track(new THREE.CylinderGeometry(0.06, 0.065, 0.84, 12));
  const legShoeGeo = track(new THREE.BoxGeometry(0.32, 0.04, 0.32));
  const braceGeo = track(new THREE.BoxGeometry(0.07, 0.07, 1.45));

  [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].forEach(([sx, sz]) => {
    const lx = sx * (beamSpan / 2 - 0.15);
    const lz = sz * (beamSpan / 2 - 0.15);

    const leg = new THREE.Mesh(legGeo, steelMat);
    leg.position.set(lx, 0.42, lz);
    leg.castShadow = true;
    underStructure.add(leg);

    const shoe = new THREE.Mesh(legShoeGeo, steelMat);
    shoe.position.set(lx, 0.02, lz);
    underStructure.add(shoe);

    const brace = new THREE.Mesh(braceGeo, steelMat);
    brace.position.set(lx * 0.52, 0.56, lz * 0.52);
    brace.lookAt(0, 0.25, 0);
    underStructure.add(brace);

    const outriggerGeo = track(new THREE.BoxGeometry(0.14, 0.14, 0.65));
    const outrigger = new THREE.Mesh(outriggerGeo, steelMat);
    outrigger.position.set(sx * (postOffset - 0.18), 0.86, sz * (postOffset - 0.18));
    outrigger.rotation.y = Math.atan2(sx, sz);
    underStructure.add(outrigger);
  });

  const plankGeo = track(new THREE.BoxGeometry(apronSize - 0.3, 0.035, 0.42));
  for (let p = -6; p <= 6; p++) {
    const plank = new THREE.Mesh(plankGeo, woodDeckMat);
    plank.position.set(0, 0.935, p * 0.48);
    underStructure.add(plank);
  }

  group.add(underStructure);

  // 2. RING DECK, PADDED APRON & CANVAS MAT
  const deckGeo = track(new THREE.BoxGeometry(apronSize, deckThickness, apronSize));
  const deckMesh = new THREE.Mesh(deckGeo, apronPadMat);
  deckMesh.position.set(0, matY - deckThickness / 2 - 0.015, 0);
  deckMesh.castShadow = true;
  deckMesh.receiveShadow = true;
  group.add(deckMesh);

  const rimThickness = (apronSize - matSize) / 2;
  const rimH = 0.055;
  const rimLongGeo = track(new THREE.BoxGeometry(apronSize, rimH, rimThickness));
  const rimShortGeo = track(new THREE.BoxGeometry(rimThickness, rimH, matSize));

  [
    [0, -apronSize / 2 + rimThickness / 2, rimLongGeo],
    [0, apronSize / 2 - rimThickness / 2, rimLongGeo],
    [-apronSize / 2 + rimThickness / 2, 0, rimShortGeo],
    [apronSize / 2 - rimThickness / 2, 0, rimShortGeo],
  ].forEach(([rx, rz, geo]) => {
    const rim = new THREE.Mesh(geo as THREE.BufferGeometry, apronPadMat);
    rim.position.set(rx as number, matY - rimH / 2 + 0.004, rz as number);
    rim.receiveShadow = true;
    group.add(rim);
  });

  const canvasGeo = track(new THREE.BoxGeometry(matSize, 0.045, matSize));
  const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat);
  canvasMesh.position.set(0, matY - 0.02, 0);
  canvasMesh.receiveShadow = true;
  canvasMesh.castShadow = false;
  group.add(canvasMesh);

  // 3. RING APRON GRAPHIC ON ALL 4 SIDES ("Ring Apron for all 4 sides.jpeg")
  const apronWidth = apronSize - 0.18; // 6.66m cleanly spanning between corner posts
  const apronHeight = 0.80; // sits flush below padded deck overhang (y = 0.105..0.905)
  const apronCenterY = 0.505;
  const apronPlaneOffset = apronSize / 2 - 0.002;

  const apronBannerGeo = track(new THREE.PlaneGeometry(apronWidth, apronHeight));
  const apronBackingGeo = track(new THREE.BoxGeometry(apronWidth, apronHeight, 0.03));

  const allFourSides: { pos: [number, number, number]; rotY: number }[] = [
    { pos: [0, apronCenterY, apronPlaneOffset], rotY: 0 }, // +Z Front
    { pos: [0, apronCenterY, -apronPlaneOffset], rotY: Math.PI }, // -Z Stage-facing Back
    { pos: [apronPlaneOffset, apronCenterY, 0], rotY: Math.PI / 2 }, // +X Hard-Cam Right
    { pos: [-apronPlaneOffset, apronCenterY, 0], rotY: -Math.PI / 2 }, // -X Left
  ];

  allFourSides.forEach(({ pos, rotY }) => {
    const sideGroup = new THREE.Group();
    sideGroup.position.set(pos[0], pos[1], pos[2]);
    sideGroup.rotation.y = rotY;

    const backing = new THREE.Mesh(apronBackingGeo, apronPadMat);
    backing.position.z = -0.016;
    backing.castShadow = true;
    backing.receiveShadow = true;
    sideGroup.add(backing);

    const banner = new THREE.Mesh(apronBannerGeo, apronBannerMat);
    banner.position.z = 0.002;
    banner.receiveShadow = true;
    sideGroup.add(banner);

    group.add(sideGroup);
  });

  // 4. FOUR TALL BLACK STEEL CORNER POSTS + FINIALS + TURNBUCKLES
  const postRadius = 0.072;
  const postGeo = track(new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 20));
  const postCapGeo = track(new THREE.CylinderGeometry(0.088, 0.076, 0.08, 20));
  const postBaseGeo = track(new THREE.BoxGeometry(0.26, 0.06, 0.26));
  const eyeletCollarGeo = track(new THREE.CylinderGeometry(0.09, 0.09, 0.055, 16));
  const eyeBoltGeo = track(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8));
  const barrelGeo = track(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 10));
  const padGeo = track(new THREE.CylinderGeometry(0.082, 0.082, 0.34, 16));
  const strapGeo = track(new THREE.BoxGeometry(0.18, 0.03, 0.16));

  const corners: [number, number][] = [
    [-postOffset, -postOffset],
    [postOffset, -postOffset],
    [postOffset, postOffset],
    [-postOffset, postOffset],
  ];

  const ropeAnchors: THREE.Vector3[][] = ropeHeights.map(() => []);

  corners.forEach(([cx, cz]) => {
    const postGroup = new THREE.Group();
    postGroup.position.set(cx, 0, cz);

    const post = new THREE.Mesh(postGeo, postSteelMat);
    post.position.y = postHeight / 2;
    post.castShadow = true;
    post.receiveShadow = true;
    postGroup.add(post);

    const cap = new THREE.Mesh(postCapGeo, steelMat);
    cap.position.y = postHeight + 0.03;
    postGroup.add(cap);

    const base = new THREE.Mesh(postBaseGeo, steelMat);
    base.position.y = 0.03;
    base.receiveShadow = true;
    postGroup.add(base);

    const inwardAngle = Math.atan2(-cx, -cz);

    ropeHeights.forEach((ry, levelIdx) => {
      const collar = new THREE.Mesh(eyeletCollarGeo, steelMat);
      collar.position.y = ry;
      postGroup.add(collar);

      const tbGroup = new THREE.Group();
      tbGroup.position.set(0, ry, 0);
      tbGroup.rotation.y = inwardAngle;

      const eyeBolt = new THREE.Mesh(eyeBoltGeo, chromeMat);
      eyeBolt.rotation.x = Math.PI / 2;
      eyeBolt.position.z = 0.15;
      tbGroup.add(eyeBolt);

      const barrel = new THREE.Mesh(barrelGeo, chromeMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.24;
      tbGroup.add(barrel);

      const pad = new THREE.Mesh(padGeo, turnbucklePadMat);
      pad.rotation.x = Math.PI / 2;
      pad.position.z = 0.31;
      pad.castShadow = true;
      tbGroup.add(pad);

      const strap = new THREE.Mesh(strapGeo, tapeMat);
      strap.position.z = 0.20;
      tbGroup.add(strap);

      postGroup.add(tbGroup);

      const anchorDist = 0.44;
      const ax = cx + Math.sin(inwardAngle) * anchorDist;
      const az = cz + Math.cos(inwardAngle) * anchorDist;
      ropeAnchors[levelIdx].push(new THREE.Vector3(ax, ry, az));
    });

    group.add(postGroup);
  });

  // 5. THREE SEPARATE ELASTIC TENSIONED ROPES ON EVERY SIDE
  const ropePhysics = new RingRopePhysics(
    postOffset - 0.44 * Math.SQRT1_2,
    onRopeImpact,
  );
  const sleeveGeo = track(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 12));

  ropeHeights.forEach((_, levelIdx) => {
    const anchors = ropeAnchors[levelIdx];
    const mat = ropeMaterials[levelIdx];

    for (let side = 0; side < 4; side++) {
      const start = anchors[side];
      const end = anchors[(side + 1) % 4];
      const mid = start.clone().lerp(end, 0.5);
      mid.y -= ROPE_REST_SAG;

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const ropeGeo = track(
        new THREE.TubeGeometry(
          curve,
          ROPE_TUBULAR_SEGMENTS,
          ROPE_BASE_RADIUS,
          ROPE_RADIAL_SEGMENTS,
          false,
        ),
      );
      const ropeMesh = new THREE.Mesh(ropeGeo, mat);
      ropeMesh.castShadow = true;
      group.add(ropeMesh);

      const sleeveStart = new THREE.Mesh(sleeveGeo, tapeMat);
      const sleeveEnd = new THREE.Mesh(sleeveGeo, tapeMat);
      group.add(sleeveStart);
      group.add(sleeveEnd);

      ropePhysics.registerRope(
        side,
        levelIdx,
        start,
        end,
        ropeMesh,
        sleeveStart,
        sleeveEnd,
      );
    }
  });

  // 6. REALISTIC PRO WRESTLING STEEL STEPS (2-piece interlocking diamond-plate, no handrails)
  // Top platform sits right beside the corner post & flush against the apron edge;
  // Individual climbable steps descend cleanly along the apron side.
  function createProWrestlingSteelSteps(): THREE.Group {
    const stepsGroup = new THREE.Group();
    const width = 0.86;

    // Upper 2-Step Solid Steel Unit (Top landing at z = 0..+0.48, Middle step at z = -0.40..0)
    // Height: Top platform y = 0.78m (one step below 1.06m ring mat), Middle step y = 0.52m
    const topDeckGeo = track(new THREE.BoxGeometry(width, 0.045, 0.50));
    const topDeck = new THREE.Mesh(topDeckGeo, stepSteelMat);
    topDeck.position.set(0, 0.758, 0.25);
    topDeck.castShadow = true;
    topDeck.receiveShadow = true;
    stepsGroup.add(topDeck);

    const midDeckGeo = track(new THREE.BoxGeometry(width, 0.045, 0.40));
    const midDeck = new THREE.Mesh(midDeckGeo, stepSteelMat);
    midDeck.position.set(0, 0.498, -0.20);
    midDeck.castShadow = true;
    midDeck.receiveShadow = true;
    stepsGroup.add(midDeck);

    // Welded vertical riser plates for Upper Unit
    const topRiserGeo = track(new THREE.BoxGeometry(width - 0.02, 0.26, 0.035));
    const topRiser = new THREE.Mesh(topRiserGeo, stepTrimMat);
    topRiser.position.set(0, 0.65, 0.0);
    topRiser.castShadow = true;
    stepsGroup.add(topRiser);

    const midRiserGeo = track(new THREE.BoxGeometry(width - 0.02, 0.50, 0.035));
    const midRiser = new THREE.Mesh(midRiserGeo, stepTrimMat);
    midRiser.position.set(0, 0.27, -0.39);
    midRiser.castShadow = true;
    stepsGroup.add(midRiser);

    const backPlateGeo = track(new THREE.BoxGeometry(width - 0.02, 0.76, 0.04));
    const backPlate = new THREE.Mesh(backPlateGeo, stepTrimMat);
    backPlate.position.set(0, 0.39, 0.48);
    backPlate.castShadow = true;
    stepsGroup.add(backPlate);

    // Solid side wall gussets for Upper Unit (stepped profile)
    const sideUpperShape = new THREE.Shape();
    sideUpperShape.moveTo(-0.40, 0.02);
    sideUpperShape.lineTo(0.50, 0.02);
    sideUpperShape.lineTo(0.50, 0.78);
    sideUpperShape.lineTo(0.0, 0.78);
    sideUpperShape.lineTo(0.0, 0.52);
    sideUpperShape.lineTo(-0.40, 0.52);
    sideUpperShape.closePath();

    const sideUpperGeo = track(
      new THREE.ExtrudeGeometry(sideUpperShape, { depth: 0.035, bevelEnabled: false }),
    );
    sideUpperGeo.rotateY(-Math.PI / 2);

    [-width / 2 + 0.035, width / 2].forEach((sx) => {
      const wall = new THREE.Mesh(sideUpperGeo, stepTrimMat);
      wall.position.set(sx, 0, 0);
      wall.castShadow = true;
      wall.receiveShadow = true;
      stepsGroup.add(wall);
    });

    // Lower Detachable Single Step Unit (butted cleanly in front of Upper Unit: z = -0.82..-0.40, y = 0.26m)
    const lowDeckGeo = track(new THREE.BoxGeometry(width, 0.045, 0.42));
    const lowDeck = new THREE.Mesh(lowDeckGeo, stepSteelMat);
    lowDeck.position.set(0, 0.238, -0.61);
    lowDeck.castShadow = true;
    lowDeck.receiveShadow = true;
    stepsGroup.add(lowDeck);

    const lowFrontRiserGeo = track(new THREE.BoxGeometry(width - 0.02, 0.22, 0.035));
    const lowFrontRiser = new THREE.Mesh(lowFrontRiserGeo, stepTrimMat);
    lowFrontRiser.position.set(0, 0.13, -0.81);
    lowFrontRiser.castShadow = true;
    stepsGroup.add(lowFrontRiser);

    const lowSideGeo = track(new THREE.BoxGeometry(0.035, 0.24, 0.42));
    [-width / 2 + 0.0175, width / 2 - 0.0175].forEach((sx) => {
      const lSide = new THREE.Mesh(lowSideGeo, stepTrimMat);
      lSide.position.set(sx, 0.14, -0.61);
      lSide.castShadow = true;
      stepsGroup.add(lSide);
    });

    // Heavy rubber floor anti-slip feet
    const footGeo = track(new THREE.BoxGeometry(0.08, 0.025, 0.08));
    [
      [-width / 2 + 0.05, -0.78],
      [width / 2 - 0.05, -0.78],
      [-width / 2 + 0.05, 0.46],
      [width / 2 - 0.05, 0.46],
    ].forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(footGeo, tapeMat);
      foot.position.set(fx, 0.012, fz);
      stepsGroup.add(foot);
    });

    return stepsGroup;
  }

  // Place Set 1 directly beside the Back-Left (-X, -Z) corner post, aligned flush with the -X ring apron
  const stepsLeftBack = createProWrestlingSteelSteps();
  stepsLeftBack.position.set(-(apronSize / 2 + 0.45), 0, -2.55);
  stepsLeftBack.rotation.y = Math.PI; // Top platform at z = -3.05 beside corner post, descending toward +Z (-1.73)
  group.add(stepsLeftBack);

  // Place Set 2 directly beside the Front-Right (+X, +Z) corner post, aligned flush with the +X ring apron
  const stepsRightFront = createProWrestlingSteelSteps();
  stepsRightFront.position.set(apronSize / 2 + 0.45, 0, 2.55);
  stepsRightFront.rotation.y = 0; // Top platform at z = +3.05 beside corner post, descending toward -Z (+1.73)
  group.add(stepsRightFront);

  function update(dt: number) {
    ropePhysics.update(dt);
  }

  function applyTheme(theme: ShowThemeConfig) {
    turnbucklePadMat.color.setHex(theme.turnbuckleColor);
    ropeMaterials.forEach((mat, i) => {
      mat.color.setHex(theme.ropeColors[i]);
    });
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
  }

  return { group, ropePhysics, update, applyTheme, dispose };
}
