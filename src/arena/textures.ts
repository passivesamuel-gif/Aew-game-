import * as THREE from 'three';
import type { LightingMode, ShowThemeConfig } from './types';

function configureColorTex(tex: THREE.CanvasTexture, maxAniso: number, repeatX = 1, repeatY = 1) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.needsUpdate = true;
  return tex;
}

function configureDataTex(tex: THREE.CanvasTexture, maxAniso: number, repeatX = 1, repeatY = 1) {
  tex.anisotropy = maxAniso;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Loads an uploaded image that contains a horizontal banner strip over a neutral
 * gray checkerboard background, automatically crops out the checkerboard rows,
 * and draws the crisp banner strip onto a CanvasTexture.
 */
export function createCroppedBannerTexture(
  url: string,
  maxAniso: number,
  outW: number,
  outH: number,
  repeatX = 1,
  fallbackBg = '#0b0e16',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = fallbackBg;
  ctx.fillRect(0, 0, outW, outH);

  const tex = configureColorTex(new THREE.CanvasTexture(canvas), maxAniso, repeatX, 1);

  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const probe = document.createElement('canvas');
    probe.width = w;
    probe.height = h;
    const pctx = probe.getContext('2d')!;
    pctx.drawImage(img, 0, 0);
    const data = pctx.getImageData(0, 0, w, h).data;

    // Detect non-checkerboard rows: checkerboard pixels are mid-gray (~85..155) with R≈G≈B
    let minY = h;
    let maxY = 0;
    for (let y = 0; y < h; y++) {
      let bannerPixels = 0;
      const samples = Math.floor(w / 4);
      for (let x = 0; x < w; x += 4) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = maxC - minC;
        const isDark = maxC < 52;
        const isBright = minC > 195;
        const isColored = sat > 24;
        if (isDark || isBright || isColored) {
          bannerPixels++;
        }
      }
      if (bannerPixels > samples * 0.65) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    // Trim 2px inward to ensure zero edge checkerboard artifacts
    const srcY = minY < maxY ? Math.min(h - 4, minY + 2) : Math.floor(h * 0.43);
    const srcH = minY < maxY ? Math.max(4, maxY - minY - 3) : Math.floor(h * 0.14);

    ctx.clearRect(0, 0, outW, outH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, srcY, w, srcH, 0, 0, outW, outH);
    tex.needsUpdate = true;
  };
  img.src = url;

  return tex;
}

export interface UploadedStageTextureSet {
  upperBannerTex: THREE.CanvasTexture;
  lowerWallTex: THREE.CanvasTexture;
  dispose: () => void;
}

/**
 * Loads "Entrance Stage and TitanTron.jpeg" (738x415) and slices out:
 * 1) The top curved AEW DYNAMITE header banner (arc-unwarped onto 1024x256 for 3D curved mesh)
 * 2) The lower 3-bay LED video wall (WELCOME TO AEW ALL ELITE EXPERIENCE | Blue Center | ALL ELITE)
 */
export function createUploadedStageTextures(maxAniso: number): UploadedStageTextureSet {
  const upperCanvas = document.createElement('canvas');
  upperCanvas.width = 1024;
  upperCanvas.height = 256;
  const uctx = upperCanvas.getContext('2d')!;
  uctx.fillStyle = '#090d1a';
  uctx.fillRect(0, 0, 1024, 256);

  const lowerCanvas = document.createElement('canvas');
  lowerCanvas.width = 1024;
  lowerCanvas.height = 320;
  const lctx = lowerCanvas.getContext('2d')!;
  lctx.fillStyle = '#090d1a';
  lctx.fillRect(0, 0, 1024, 320);

  const upperBannerTex = configureColorTex(new THREE.CanvasTexture(upperCanvas), maxAniso);
  const lowerWallTex = configureColorTex(new THREE.CanvasTexture(lowerCanvas), maxAniso);

  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    // 1. Extract & arc-unwarp the top curved AEW DYNAMITE LED banner
    // Edges sit at x ~ 9.8%..90.5%, top y ~ 6.2%..13.2% center, bottom y ~ 36.6%..39.8% center
    const leftX = w * 0.098;
    const rightX = w * 0.905;
    uctx.imageSmoothingEnabled = true;
    uctx.imageSmoothingQuality = 'high';

    for (let dx = 0; dx < 1024; dx++) {
      const t = dx / 1023;
      const sx = leftX + (rightX - leftX) * t;
      // Parabolic arch factor: 0 at ends, 1 at center
      const arch = 4 * t * (1 - t);
      const topY = h * (0.064 + 0.068 * arch);
      const botY = h * (0.366 + 0.032 * arch);
      uctx.drawImage(img, sx, topY, 1.5, botY - topY, dx, 0, 1, 256);
    }
    upperBannerTex.needsUpdate = true;

    // 2. Extract the lower 3-bay LED video wall (excluding floor light fixtures at bottom)
    const lx = w * 0.188;
    const lw = w * (0.816 - 0.188);
    const ly = h * 0.408;
    const lh = h * (0.735 - 0.408);
    lctx.imageSmoothingEnabled = true;
    lctx.imageSmoothingQuality = 'high';
    lctx.drawImage(img, lx, ly, lw, lh, 0, 0, 1024, 320);
    lowerWallTex.needsUpdate = true;
  };
  img.src = '/assets/aistudio/Entrance_Stage_and_TitanTron_efe29537.jpeg';

  return {
    upperBannerTex,
    lowerWallTex,
    dispose: () => {
      upperBannerTex.dispose();
      lowerWallTex.dispose();
    },
  };
}

export interface CanvasMatTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export function createCanvasMatTextures(maxAniso: number): CanvasMatTextureSet {
  const size = 2048;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cctx = colorCanvas.getContext('2d')!;
  // Pre-fill with matching light cool grey while image decodes
  cctx.fillStyle = '#c5cad3';
  cctx.fillRect(0, 0, size, size);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bctx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 512;
  roughCanvas.height = 512;
  const rctx = roughCanvas.getContext('2d')!;

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 512, 512);
  rctx.fillStyle = '#dcdcdc';
  rctx.fillRect(0, 0, 512, 512);

  // Fine woven canvas micro-texture
  for (let y = 0; y < 512; y += 2) {
    bctx.fillStyle = y % 4 === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    bctx.fillRect(0, y, 512, 1);
  }
  for (let x = 0; x < 512; x += 2) {
    bctx.fillStyle = x % 4 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    bctx.fillRect(x, 0, 1, 512);
  }
  const wearGrad = rctx.createRadialGradient(256, 256, 30, 256, 256, 230);
  wearGrad.addColorStop(0, 'rgba(210,210,210,0.35)');
  wearGrad.addColorStop(1, 'rgba(242,242,242,0)');
  rctx.fillStyle = wearGrad;
  rctx.fillRect(0, 0, 512, 512);

  const map = new THREE.CanvasTexture(colorCanvas);
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  configureColorTex(map, maxAniso);

  const img = new Image();
  img.onload = () => {
    cctx.clearRect(0, 0, size, size);
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, size, size);
    map.needsUpdate = true;
  };
  img.src = '/assets/aistudio/file_00000000a7c48210b4527f42e6f3b43f_e1262ead.png';

  const bumpMap = configureDataTex(new THREE.CanvasTexture(bumpCanvas), maxAniso, 3, 3);
  const roughnessMap = configureDataTex(new THREE.CanvasTexture(roughCanvas), maxAniso);

  return { map, bumpMap, roughnessMap };
}

export function createDiamondPlateTextures(maxAniso: number) {
  const size = 256;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const ctx = bumpCanvas.getContext('2d')!;

  ctx.fillStyle = '#404040';
  ctx.fillRect(0, 0, size, size);

  const step = 32;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const offset = ((y / step) % 2) * (step / 2);
      const cx = (x + offset) % size;
      const cy = y + step / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(((x / step + y / step) % 2 === 0 ? 1 : -1) * (Math.PI / 4));
      ctx.fillStyle = '#e5e5e5';
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const bumpMap = configureDataTex(new THREE.CanvasTexture(bumpCanvas), maxAniso, 3, 2);
  return { bumpMap };
}

export function createRubberMatTextures(maxAniso: number) {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;

  cctx.fillStyle = '#15181f';
  cctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  const tile = size / 4;
  cctx.strokeStyle = '#090b0f';
  cctx.lineWidth = 3;
  bctx.strokeStyle = '#202020';
  bctx.lineWidth = 4;

  for (let i = 0; i <= 4; i++) {
    const p = i * tile;
    cctx.beginPath();
    cctx.moveTo(p, 0);
    cctx.lineTo(p, size);
    cctx.moveTo(0, p);
    cctx.lineTo(size, p);
    cctx.stroke();

    bctx.beginPath();
    bctx.moveTo(p, 0);
    bctx.lineTo(p, size);
    bctx.moveTo(0, p);
    bctx.lineTo(size, p);
    bctx.stroke();
  }

  for (let i = 0; i < 4500; i++) {
    const x = (i * 73) % size;
    const y = ((i * 197) + Math.floor(i / 7) * 13) % size;
    cctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.08)';
    cctx.fillRect(x, y, 2, 2);
    bctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    bctx.fillRect(x, y, 2, 2);
  }

  return {
    map: configureColorTex(new THREE.CanvasTexture(colorCanvas), maxAniso, 3, 3),
    bumpMap: configureDataTex(new THREE.CanvasTexture(bumpCanvas), maxAniso, 3, 3),
  };
}

/**
 * Professional grey industrial arena floor-panel texture with sharp visible panel
 * divisions, beveled seam contrast, subtle metallic grain, and corner fastener dots.
 */
export function createArenaFloorTextures(maxAniso: number) {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d')!;

  // Industrial slate-grey floor base
  cctx.fillStyle = '#343b46';
  cctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#868686';
  bctx.fillRect(0, 0, size, size);
  rctx.fillStyle = '#9a9a9a';
  rctx.fillRect(0, 0, size, size);

  // Subtle tonal panel variation across 2x2 modular floor panels
  const panelSize = size / 2;
  const panelTones = ['#313742', '#373e4a', '#353c48', '#2e343e'];
  let idx = 0;
  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const ox = px * panelSize;
      const oy = py * panelSize;
      cctx.fillStyle = panelTones[idx++];
      cctx.fillRect(ox, oy, panelSize, panelSize);

      // Subtle inner brushed steel/concrete sheen gradient
      const g = rctx.createLinearGradient(ox, oy, ox + panelSize, oy + panelSize);
      g.addColorStop(0, 'rgba(135,135,135,0.4)');
      g.addColorStop(0.5, 'rgba(170,170,170,0.2)');
      g.addColorStop(1, 'rgba(120,120,120,0.4)');
      rctx.fillStyle = g;
      rctx.fillRect(ox, oy, panelSize, panelSize);

      // Recessed corner anchor bolts
      const boltOff = 14;
      [
        [ox + boltOff, oy + boltOff],
        [ox + panelSize - boltOff, oy + boltOff],
        [ox + boltOff, oy + panelSize - boltOff],
        [ox + panelSize - boltOff, oy + panelSize - boltOff],
      ].forEach(([bx, by]) => {
        cctx.fillStyle = '#1f242c';
        cctx.beginPath();
        cctx.arc(bx, by, 3, 0, Math.PI * 2);
        cctx.fill();
        bctx.fillStyle = '#383838';
        bctx.beginPath();
        bctx.arc(bx, by, 3, 0, Math.PI * 2);
        bctx.fill();
      });
    }
  }

  // Fine industrial surface grain
  for (let i = 0; i < 6500; i++) {
    const x = (i * 89) % size;
    const y = (i * 173 + Math.floor(i / 9) * 11) % size;
    cctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.04)';
    cctx.fillRect(x, y, 2, 2);
  }

  // Sharp visible panel divisions (dark recessed seam + subtle light bevel highlight)
  for (let i = 0; i <= 2; i++) {
    const p = i * panelSize;
    // Highlight edge
    cctx.strokeStyle = 'rgba(180, 194, 212, 0.22)';
    cctx.lineWidth = 3;
    cctx.beginPath();
    cctx.moveTo(p + 2, 0);
    cctx.lineTo(p + 2, size);
    cctx.moveTo(0, p + 2);
    cctx.lineTo(size, p + 2);
    cctx.stroke();

    // Recessed dark seam
    cctx.strokeStyle = '#12151b';
    cctx.lineWidth = 4;
    cctx.beginPath();
    cctx.moveTo(p, 0);
    cctx.lineTo(p, size);
    cctx.moveTo(0, p);
    cctx.lineTo(size, p);
    cctx.stroke();

    bctx.strokeStyle = '#1c1c1c';
    bctx.lineWidth = 5;
    bctx.beginPath();
    bctx.moveTo(p, 0);
    bctx.lineTo(p, size);
    bctx.moveTo(0, p);
    bctx.lineTo(size, p);
    bctx.stroke();
  }

  return {
    map: configureColorTex(new THREE.CanvasTexture(colorCanvas), maxAniso, 18, 18),
    bumpMap: configureDataTex(new THREE.CanvasTexture(bumpCanvas), maxAniso, 18, 18),
    roughnessMap: configureDataTex(new THREE.CanvasTexture(roughCanvas), maxAniso, 18, 18),
  };
}

export function createSkirtTextures(maxAniso: number) {
  const size = 256;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const ctx = bumpCanvas.getContext('2d')!;

  const pleats = 16;
  for (let x = 0; x < size; x++) {
    const v = Math.sin((x / size) * Math.PI * 2 * pleats) * 0.5 + 0.5;
    const lum = Math.round(70 + v * 150);
    ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
    ctx.fillRect(x, 0, 1, size);
  }

  const bumpMap = configureDataTex(new THREE.CanvasTexture(bumpCanvas), maxAniso, 4, 1);
  return { bumpMap };
}

export function createRopeTexture(maxAniso: number) {
  const size = 128;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const ctx = bumpCanvas.getContext('2d')!;

  ctx.fillStyle = '#909090';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#d8d8d8';
  ctx.lineWidth = 4;
  for (let i = -size; i < size * 2; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }

  return configureDataTex(new THREE.CanvasTexture(bumpCanvas), maxAniso, 24, 1);
}

export class AnimatedLedManager {
  public readonly titanTronTexture: THREE.CanvasTexture;
  public readonly sidePillarTexture: THREE.CanvasTexture;
  public readonly apronRibbonTexture: THREE.CanvasTexture;
  public readonly stadiumRibbonTexture: THREE.CanvasTexture;
  public readonly monitorTexture: THREE.CanvasTexture;

  private titanCanvas: HTMLCanvasElement;
  private titanCtx: CanvasRenderingContext2D;

  private pillarCanvas: HTMLCanvasElement;
  private pillarCtx: CanvasRenderingContext2D;

  private apronCanvas: HTMLCanvasElement;
  private apronCtx: CanvasRenderingContext2D;

  private ribbonCanvas: HTMLCanvasElement;
  private ribbonCtx: CanvasRenderingContext2D;

  private monitorCanvas: HTMLCanvasElement;
  private monitorCtx: CanvasRenderingContext2D;

  private theme: ShowThemeConfig;
  private lightingMode: LightingMode = 'broadcast';
  private lastDrawTime = -1;

  constructor(maxAniso: number, initialTheme: ShowThemeConfig) {
    this.theme = initialTheme;

    this.titanCanvas = document.createElement('canvas');
    this.titanCanvas.width = 1024;
    this.titanCanvas.height = 512;
    this.titanCtx = this.titanCanvas.getContext('2d')!;
    this.titanTronTexture = configureColorTex(new THREE.CanvasTexture(this.titanCanvas), maxAniso);

    this.pillarCanvas = document.createElement('canvas');
    this.pillarCanvas.width = 256;
    this.pillarCanvas.height = 512;
    this.pillarCtx = this.pillarCanvas.getContext('2d')!;
    this.sidePillarTexture = configureColorTex(new THREE.CanvasTexture(this.pillarCanvas), maxAniso);

    this.apronCanvas = document.createElement('canvas');
    this.apronCanvas.width = 1024;
    this.apronCanvas.height = 128;
    this.apronCtx = this.apronCanvas.getContext('2d')!;
    this.apronRibbonTexture = configureColorTex(new THREE.CanvasTexture(this.apronCanvas), maxAniso);

    this.ribbonCanvas = document.createElement('canvas');
    this.ribbonCanvas.width = 1024;
    this.ribbonCanvas.height = 128;
    this.ribbonCtx = this.ribbonCanvas.getContext('2d')!;
    this.stadiumRibbonTexture = configureColorTex(
      new THREE.CanvasTexture(this.ribbonCanvas),
      maxAniso,
      4,
      1,
    );

    this.monitorCanvas = document.createElement('canvas');
    this.monitorCanvas.width = 512;
    this.monitorCanvas.height = 256;
    this.monitorCtx = this.monitorCanvas.getContext('2d')!;
    this.monitorTexture = configureColorTex(new THREE.CanvasTexture(this.monitorCanvas), maxAniso);

    this.update(0, true);
  }

  public setTheme(theme: ShowThemeConfig) {
    this.theme = theme;
    this.update(this.lastDrawTime < 0 ? 0 : this.lastDrawTime, true);
  }

  public setLightingMode(mode: LightingMode) {
    this.lightingMode = mode;
    this.update(this.lastDrawTime < 0 ? 0 : this.lastDrawTime, true);
  }

  public update(elapsed: number, force = false) {
    if (!force && elapsed - this.lastDrawTime < 1 / 24) {
      return;
    }
    this.lastDrawTime = elapsed;

    this.drawTitanTron(elapsed);
    this.drawSidePillar(elapsed);
    this.drawApronRibbon(elapsed);
    this.drawStadiumRibbon(elapsed);
    this.drawMonitor(elapsed);
  }

  private drawLedPixelMask(ctx: CanvasRenderingContext2D, w: number, h: number, step: number) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    for (let y = 0; y < h; y += step) {
      ctx.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += step) {
      ctx.fillRect(x, 0, 1, h);
    }
  }

  private drawTitanTron(t: number) {
    const ctx = this.titanCtx;
    const w = 1024;
    const h = 512;
    const { primaryHex, secondaryHex, accentHex, eventTitle, eventSubtitle } = this.theme;
    const speed = this.lightingMode === 'entrance' ? 1.5 : 0.75;
    const phase = t * speed;

    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#070b18');
    bg.addColorStop(0.5, '#111833');
    bg.addColorStop(1, '#070b18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle diagonal Dynamite color streaks
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const x = ((phase * 110 + i * 260) % (w + 300)) - 150;
      ctx.fillStyle = i % 2 === 0 ? primaryHex : secondaryHex;
      ctx.globalAlpha = 0.24;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 90, 0);
      ctx.lineTo(x - 120, h);
      ctx.lineTo(x - 210, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 72px "Arial Narrow", Impact, sans-serif';
    ctx.fillText(eventTitle, w * 0.5, 226);

    ctx.fillStyle = accentHex;
    ctx.font = '700 26px "Arial Narrow", Arial, sans-serif';
    ctx.fillText(eventSubtitle, w * 0.5, 294);
    ctx.restore();

    this.drawLedPixelMask(ctx, w, h, 8);
    this.titanTronTexture.needsUpdate = true;
  }

  private drawSidePillar(t: number) {
    const ctx = this.pillarCtx;
    const w = 256;
    const h = 512;
    const { primaryHex, secondaryHex } = this.theme;
    const phase = t * 0.8;

    ctx.fillStyle = '#070a14';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 6; i++) {
      const y = ((h - ((phase * 110 + i * 95) % (h + 100))) + h) % (h + 100) - 50;
      ctx.strokeStyle = i % 2 === 0 ? primaryHex : secondaryHex;
      ctx.lineWidth = 10;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(24, y + 32);
      ctx.lineTo(w * 0.5, y);
      ctx.lineTo(w - 24, y + 32);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.sidePillarTexture.needsUpdate = true;
  }

  private drawApronRibbon(t: number) {
    const ctx = this.apronCtx;
    const w = 1024;
    const h = 128;
    const { primaryHex, secondaryHex, eventTitle } = this.theme;
    const phase = t * 0.7;

    ctx.fillStyle = '#090e1e';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 4; i++) {
      const x = ((phase * 140 + i * 260) % (w + 180)) - 90;
      ctx.fillStyle = i % 2 === 0 ? primaryHex : secondaryHex;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 48, 0);
      ctx.lineTo(x + 12, h);
      ctx.lineTo(x - 36, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 50px "Arial Narrow", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(eventTitle, w * 0.5, h * 0.5 + 2);

    this.apronRibbonTexture.needsUpdate = true;
  }

  private drawStadiumRibbon(t: number) {
    const ctx = this.ribbonCtx;
    const w = 1024;
    const h = 128;
    const { primaryHex, secondaryHex, eventTitle } = this.theme;
    const phase = t * 0.65;

    ctx.fillStyle = '#070a15';
    ctx.fillRect(0, 0, w, h);

    const scroll = (phase * 95) % w;
    ctx.save();
    for (let rep = -1; rep <= 1; rep++) {
      const ox = rep * w - scroll;
      ctx.fillStyle = primaryHex;
      ctx.fillRect(ox + 20, 18, 12, h - 36);
      ctx.fillStyle = secondaryHex;
      ctx.fillRect(ox + 42, 28, 8, h - 56);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '900 50px "Arial Narrow", Impact, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(eventTitle, ox + 72, h * 0.5);

      ctx.fillStyle = secondaryHex;
      ctx.font = '700 28px "Arial Narrow", Arial, sans-serif';
      ctx.fillText('ALL ELITE WRESTLING', ox + 590, h * 0.5);
    }
    ctx.restore();

    ctx.fillStyle = primaryHex;
    ctx.fillRect(0, 0, w, 5);
    ctx.fillRect(0, h - 5, w, 5);

    this.drawLedPixelMask(ctx, w, h, 6);
    this.stadiumRibbonTexture.needsUpdate = true;
  }

  private drawMonitor(t: number) {
    const ctx = this.monitorCtx;
    const w = 512;
    const h = 256;
    const { primaryHex, secondaryHex, eventTitle } = this.theme;

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = primaryHex;
    ctx.fillRect(0, 0, w, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 18px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`PROGRAM FEED  //  ${eventTitle}`, 14, 18);

    for (let c = 0; c < 6; c++) {
      const lvl = 0.35 + Math.abs(Math.sin(t * 4.5 + c * 0.9)) * 0.6;
      const barH = lvl * 150;
      ctx.fillStyle = secondaryHex;
      ctx.fillRect(390 + c * 18, 215 - barH, 12, barH);
    }

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 54, 150, 150);
    ctx.strokeStyle = primaryHex;
    ctx.strokeRect(48, 78, 102, 102);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 16px monospace';
    ctx.fillText('CAM A: HARD', 198, 78);
    ctx.fillText('CAM B: RINGSIDE', 198, 110);
    ctx.fillText('CAM C: STAGE', 198, 142);
    ctx.fillStyle = secondaryHex;
    ctx.fillText('AUDIO: 48kHz STEREO', 198, 182);

    this.monitorTexture.needsUpdate = true;
  }

  public dispose() {
    this.titanTronTexture.dispose();
    this.sidePillarTexture.dispose();
    this.apronRibbonTexture.dispose();
    this.stadiumRibbonTexture.dispose();
    this.monitorTexture.dispose();
  }
}
