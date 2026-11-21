import * as THREE from 'three';
import { createUploadedStageTextures, type UploadedStageTextureSet } from './textures';
import type { ShowThemeConfig } from './types';

export interface StageHandle {
  group: THREE.Group;
  applyTheme: (theme: ShowThemeConfig) => void;
  updateLights: (elapsed: number, isEntrance: boolean) => void;
  dispose: () => void;
}

/**
 * Creates a smooth concave curved LED screen mesh with clean 0..1 left-to-right UVs
 * so the wide top curved AEW DYNAMITE header wraps forward seamlessly at both ends.
 */
function createConcaveCurvedScreenGeometry(
  width: number,
  height: number,
  curveDepth: number,
  segmentsX = 40,
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, height, segmentsX, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const halfW = width / 2;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const normX = x / halfW; // -1..+1
    const zOffset = curveDepth * (normX * normX);
    pos.setZ(i, zOffset);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function buildEntranceStage(
  maxAniso: number,
  initialTheme: ShowThemeConfig,
): StageHandle {
  const group = new THREE.Group();
  group.name = 'EntranceStage';
  // Stage centered opposite the ring along -Z
  const stageZ = -19.5;
  group.position.set(0, 0, stageZ);

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const stageTextures: UploadedStageTextureSet = createUploadedStageTextures(maxAniso);
  track(stageTextures);

  // Materials
  const stageDeckMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x101319,
      metalness: 0.25,
      roughness: 0.62,
      envMapIntensity: 0.35,
    }),
  );

  const stageFasciaMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0b0e14,
      metalness: 0.4,
      roughness: 0.56,
      envMapIntensity: 0.4,
    }),
  );

  const trussDarkMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x14171f,
      metalness: 0.78,
      roughness: 0.42,
      envMapIntensity: 0.55,
    }),
  );

  const chromeTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x7a8596,
      metalness: 0.82,
      roughness: 0.36,
      envMapIntensity: 0.6,
    }),
  );

  const upperScreenMat = track(
    new THREE.MeshStandardMaterial({
      map: stageTextures.upperBannerTex,
      emissiveMap: stageTextures.upperBannerTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.92,
      roughness: 0.32,
      metalness: 0.04,
    }),
  );

  const lowerWallMat = track(
    new THREE.MeshStandardMaterial({
      map: stageTextures.lowerWallTex,
      emissiveMap: stageTextures.lowerWallTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.90,
      roughness: 0.32,
      metalness: 0.04,
    }),
  );

  // 1. MULTI-TIER STAGE DECK & FLANKING WINGS (matching Entrance Stage and TitanTron.jpeg)
  // Main central stage platform connecting cleanly to the black entrance ramp at z = +1.4 (world -18.1)
  const mainDeckGeo = track(new THREE.BoxGeometry(24.6, 1.38, 6.4));
  const mainDeck = new THREE.Mesh(mainDeckGeo, stageDeckMat);
  mainDeck.position.set(0, 0.69, -1.8);
  mainDeck.castShadow = true;
  mainDeck.receiveShadow = true;
  group.add(mainDeck);

  // Upper rear LED-wall riser plinth behind the floor light row
  const rearPlinthGeo = track(new THREE.BoxGeometry(19.0, 0.24, 2.2));
  const rearPlinth = new THREE.Mesh(rearPlinthGeo, stageFasciaMat);
  rearPlinth.position.set(0, 1.50, -1.7);
  rearPlinth.receiveShadow = true;
  group.add(rearPlinth);

  // Stepped horizontal front fascia trim along left & right stage wings
  [-7.8, 7.8].forEach((wx) => {
    const wingUpperGeo = track(new THREE.BoxGeometry(8.8, 0.28, 3.6));
    const wingUpper = new THREE.Mesh(wingUpperGeo, stageFasciaMat);
    wingUpper.position.set(wx, 1.52, -0.8);
    wingUpper.castShadow = true;
    wingUpper.receiveShadow = true;
    group.add(wingUpper);

    const railLipGeo = track(new THREE.BoxGeometry(8.84, 0.06, 0.1));
    const railLip = new THREE.Mesh(railLipGeo, chromeTrimMat);
    railLip.position.set(wx, 1.66, 1.0);
    group.add(railLip);
  });

  // 2. LOWER 3-BAY LED VIDEO WALL ("WELCOME TO AEW ALL ELITE EXPERIENCE" | Blue Center | "ALL ELITE")
  const lowerWallW = 16.4;
  const lowerWallH = 5.1;
  const lowerWallY = 1.62 + lowerWallH / 2; // 4.17m
  const lowerWallZ = -2.0;

  // Heavy structural dark backing cabinet
  const lowerCabinetGeo = track(new THREE.BoxGeometry(lowerWallW + 0.5, lowerWallH + 0.4, 0.55));
  const lowerCabinet = new THREE.Mesh(lowerCabinetGeo, trussDarkMat);
  lowerCabinet.position.set(0, lowerWallY, lowerWallZ - 0.3);
  lowerCabinet.castShadow = true;
  group.add(lowerCabinet);

  // Main 3-bay LED wall surface
  const lowerScreenGeo = track(new THREE.PlaneGeometry(lowerWallW, lowerWallH));
  const lowerScreen = new THREE.Mesh(lowerScreenGeo, lowerWallMat);
  lowerScreen.position.set(0, lowerWallY, lowerWallZ);
  group.add(lowerScreen);

  // Subtle vertical structural framing dividers & outer side truss columns
  const sideTrussGeo = track(new THREE.BoxGeometry(0.55, 11.4, 0.65));
  [-8.6, 8.6].forEach((tx) => {
    const col = new THREE.Mesh(sideTrussGeo, trussDarkMat);
    col.position.set(tx, 5.7, lowerWallZ - 0.35);
    col.castShadow = true;
    group.add(col);
  });

  // 3. TOP CURVED CONCAVE WIDE TITANTRON BANNER ("AEW DYNAMITE")
  const upperW = 19.8;
  const upperH = 4.45;
  const upperCurveDepth = 1.55;
  const upperY = 9.05; // sits directly above lower 3-bay LED wall (top of lower = 6.72m)
  const upperZ = -1.85;

  const curvedScreenGeo = track(
    createConcaveCurvedScreenGeometry(upperW, upperH, upperCurveDepth, 44),
  );
  const curvedScreen = new THREE.Mesh(curvedScreenGeo, upperScreenMat);
  curvedScreen.position.set(0, upperY, upperZ);
  group.add(curvedScreen);

  // Curved structural backing cabinet & dark frame trim behind the upper TitanTron
  const cabinetDepth = 0.42;
  const curvedBackGeo = track(
    createConcaveCurvedScreenGeometry(upperW + 0.55, upperH + 0.45, upperCurveDepth, 44),
  );
  const curvedBackMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0f131b,
      metalness: 0.78,
      roughness: 0.44,
      side: THREE.DoubleSide,
    }),
  );
  const curvedBack = new THREE.Mesh(curvedBackGeo, curvedBackMat);
  curvedBack.position.set(0, upperY, upperZ - cabinetDepth);
  curvedBack.castShadow = true;
  group.add(curvedBack);

  // Curved top & bottom structural bezel strips bridging screen to backing cabinet
  const curvedEdgeGeo = track(new THREE.PlaneGeometry(upperW + 0.55, cabinetDepth, 44, 1));
  curvedEdgeGeo.rotateX(Math.PI / 2);
  {
    const edgePos = curvedEdgeGeo.attributes.position as THREE.BufferAttribute;
    const halfEdgeW = (upperW + 0.55) / 2;
    for (let i = 0; i < edgePos.count; i++) {
      const nx = edgePos.getX(i) / halfEdgeW;
      edgePos.setZ(i, edgePos.getZ(i) + upperCurveDepth * nx * nx);
    }
    edgePos.needsUpdate = true;
    curvedEdgeGeo.computeVertexNormals();
  }
  [upperY + upperH / 2 + 0.12, upperY - upperH / 2 - 0.12].forEach((ey) => {
    const edgeRim = new THREE.Mesh(curvedEdgeGeo, curvedBackMat);
    edgeRim.position.set(0, ey, upperZ - cabinetDepth / 2);
    group.add(edgeRim);
  });

  // Left & right endcaps sealing the curved TitanTron cabinet edges
  const endCapGeo = track(new THREE.BoxGeometry(0.28, upperH + 0.45, cabinetDepth + 0.08));
  [-1, 1].forEach((side) => {
    const cap = new THREE.Mesh(endCapGeo, trussDarkMat);
    cap.position.set(
      side * (upperW / 2 + 0.14),
      upperY,
      upperZ + upperCurveDepth - cabinetDepth / 2,
    );
    group.add(cap);
  });

  // Overhead horizontal truss rig spanning above the curved TitanTron
  const topTrussGeo = track(new THREE.BoxGeometry(21.6, 0.58, 0.75));
  const topTruss = new THREE.Mesh(topTrussGeo, trussDarkMat);
  topTruss.position.set(0, upperY + upperH / 2 + 0.55, upperZ + 0.15);
  group.add(topTruss);

  // 4. STAGE FLOOR MOVING-HEAD SPOTLIGHTS & OVERHEAD TRUSS SPOTLIGHTS
  const fixtureBodyGeo = track(new THREE.CylinderGeometry(0.12, 0.15, 0.28, 10));
  const fixtureBaseGeo = track(new THREE.BoxGeometry(0.32, 0.12, 0.28));
  const fixtureLensGeo = track(new THREE.CircleGeometry(0.11, 10));
  const lensMat = track(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(initialTheme.secondaryHex),
    }),
  );

  // 5 floor uplight cans right along the base of the center blue bay (matching photo)
  [-2.0, -1.0, 0, 1.0, 2.0].forEach((fx) => {
    const can = new THREE.Group();
    can.position.set(fx, 1.66, -1.45);
    const base = new THREE.Mesh(fixtureBaseGeo, trussDarkMat);
    can.add(base);
    const head = new THREE.Mesh(fixtureBodyGeo, trussDarkMat);
    head.position.y = 0.16;
    head.rotation.x = -0.3;
    can.add(head);
    const lens = new THREE.Mesh(fixtureLensGeo, lensMat);
    lens.position.set(0, 0.28, 0.06);
    lens.rotation.x = -Math.PI / 2 - 0.3;
    can.add(lens);
    group.add(can);
  });

  // Left & Right wing stage deck fixtures (matching photo's lower & upper wing lights)
  [-7.2, -5.6, -4.0, 4.0, 5.6, 7.2].forEach((fx) => {
    const upperCan = new THREE.Mesh(fixtureBaseGeo, trussDarkMat);
    upperCan.position.set(fx, 1.70, -1.35);
    group.add(upperCan);

    const lowerCan = new THREE.Mesh(fixtureBaseGeo, trussDarkMat);
    lowerCan.position.set(fx * 1.05, 1.44, 0.85);
    group.add(lowerCan);
  });

  // Overhead truss spotlight fixtures + gentle atmospheric beam shafts
  const stageBeams: THREE.Mesh[] = [];
  const beamGeo = track(new THREE.ConeGeometry(1.5, 11.5, 18, 1, true));
  beamGeo.translate(0, -5.75, 0);

  const beamMat = track(
    new THREE.MeshBasicMaterial({
      color: initialTheme.spotColorA,
      transparent: true,
      opacity: 0.018,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );

  [-7.6, -4.2, -1.2, 1.2, 4.2, 7.6].forEach((fx, idx) => {
    const fixture = new THREE.Group();
    fixture.position.set(fx, upperY + upperH / 2 + 0.25, upperZ + 0.55);

    const head = new THREE.Mesh(fixtureBodyGeo, trussDarkMat);
    head.rotation.x = 0.35;
    fixture.add(head);

    const lens = new THREE.Mesh(fixtureLensGeo, lensMat);
    lens.position.set(0, -0.14, 0.08);
    lens.rotation.x = Math.PI / 2 + 0.35;
    fixture.add(lens);

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.x = -0.35;
    beam.rotation.z = (idx < 3 ? -1 : 1) * 0.16;
    fixture.add(beam);
    stageBeams.push(beam);

    group.add(fixture);
  });

  // Balanced stage wash light (no overexposure)
  const stageWashLight = new THREE.PointLight(0x93c5fd, 6.5, 22, 1.6);
  stageWashLight.position.set(0, 6.2, 2.2);
  group.add(stageWashLight);

  function applyTheme(theme: ShowThemeConfig) {
    lensMat.color.set(theme.secondaryHex);
    beamMat.color.setHex(theme.spotColorA);
  }

  function updateLights(elapsed: number, isEntrance: boolean) {
    beamMat.opacity = isEntrance ? 0.04 : 0.016;
    stageWashLight.intensity = isEntrance ? 9.5 : 6.5;

    stageBeams.forEach((beam, idx) => {
      const dir = idx < 3 ? -1 : 1;
      const sway = Math.sin(elapsed * (isEntrance ? 1.2 : 0.5) + idx * 1.1) * (isEntrance ? 0.2 : 0.07);
      beam.rotation.z = dir * 0.16 + sway;
    });
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
  }

  return { group, applyTheme, updateLights, dispose };
}
