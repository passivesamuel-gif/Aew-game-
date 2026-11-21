import * as THREE from 'three';

const MAX_PARTICLES = 480;

export type PyroStyle = 'gold' | 'cobalt';

export class ArenaPyroSystem {
  public readonly group = new THREE.Group();

  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly ages = new Float32Array(MAX_PARTICLES);
  private readonly lifetimes = new Float32Array(MAX_PARTICLES);

  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.PointsMaterial;
  private readonly points: THREE.Points;
  private readonly flashLeft: THREE.PointLight;
  private readonly flashRight: THREE.PointLight;

  private flashEnergy = 0;
  private cursor = 0;

  constructor() {
    this.group.name = 'ArenaPyroEffects';
    this.lifetimes.fill(-1);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.mat = new THREE.PointsMaterial({
      size: 0.24,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    this.flashLeft = new THREE.PointLight(0xfbbf24, 0, 26, 1.5);
    this.flashLeft.position.set(-4.8, 3.2, -18.0);
    this.group.add(this.flashLeft);

    this.flashRight = new THREE.PointLight(0xfbbf24, 0, 26, 1.5);
    this.flashRight.position.set(4.8, 3.2, -18.0);
    this.group.add(this.flashRight);
  }

  public triggerStageBurst(style: PyroStyle) {
    const colorHex = style === 'gold' ? 0xfbbf24 : 0x38bdf8;
    const accentHex = style === 'gold' ? 0xfef3c7 : 0xe0f2fe;
    this.flashLeft.color.setHex(colorHex);
    this.flashRight.color.setHex(colorHex);
    this.flashEnergy = 32;

    // 4 stage wing pyro pots + 2 overhead truss waterfall cannons
    const emitters: [number, number, number, number, number][] = [
      [-6.8, 1.72, -18.3, 9.5, 0.28],
      [-3.7, 1.72, -18.3, 10.5, 0.22],
      [3.7, 1.72, -18.3, 10.5, 0.22],
      [6.8, 1.72, -18.3, 9.5, 0.28],
      [-5.2, 11.2, -18.7, 3.2, 0.95],
      [5.2, 11.2, -18.7, 3.2, 0.95],
    ];

    const cMain = new THREE.Color(colorHex);
    const cBright = new THREE.Color(accentHex);

    for (let e = 0; e < emitters.length; e++) {
      const [ox, oy, oz, upSpeed, spread] = emitters[e];
      const count = 42;
      for (let i = 0; i < count; i++) {
        const idx = this.cursor;
        this.cursor = (this.cursor + 1) % MAX_PARTICLES;

        const i3 = idx * 3;
        this.positions[i3] = ox + (Math.random() - 0.5) * 0.22;
        this.positions[i3 + 1] = oy;
        this.positions[i3 + 2] = oz + (Math.random() - 0.5) * 0.22;

        const angle = Math.random() * Math.PI * 2;
        const radial = (0.3 + Math.random() * 0.9) * spread * 4.5;
        this.velocities[i3] = Math.cos(angle) * radial + (ox < 0 ? -0.4 : 0.4);
        this.velocities[i3 + 1] = upSpeed * (0.65 + Math.random() * 0.55);
        this.velocities[i3 + 2] = Math.sin(angle) * radial + 0.6;

        const c = Math.random() > 0.35 ? cMain : cBright;
        this.colors[i3] = c.r;
        this.colors[i3 + 1] = c.g;
        this.colors[i3 + 2] = c.b;

        this.ages[idx] = 0;
        this.lifetimes[idx] = 0.85 + Math.random() * 0.75;
      }
    }

    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  public triggerCornerPoseBurst(style: PyroStyle) {
    const colorHex = style === 'gold' ? 0xf59e0b : 0x60a5fa;
    this.flashLeft.color.setHex(colorHex);
    this.flashRight.color.setHex(colorHex);
    this.flashEnergy = 20;

    const c = new THREE.Color(colorHex);
    const emitters: [number, number, number][] = [
      [-3.34, 2.65, -3.34],
      [3.34, 2.65, -3.34],
      [3.34, 2.65, 3.34],
      [-3.34, 2.65, 3.34],
    ];

    for (let e = 0; e < emitters.length; e++) {
      const [ox, oy, oz] = emitters[e];
      for (let i = 0; i < 28; i++) {
        const idx = this.cursor;
        this.cursor = (this.cursor + 1) % MAX_PARTICLES;
        const i3 = idx * 3;
        this.positions[i3] = ox;
        this.positions[i3 + 1] = oy;
        this.positions[i3 + 2] = oz;

        const a = Math.random() * Math.PI * 2;
        const spd = 1.1 + Math.random() * 1.9;
        this.velocities[i3] = Math.cos(a) * spd;
        this.velocities[i3 + 1] = 4.6 + Math.random() * 3.4;
        this.velocities[i3 + 2] = Math.sin(a) * spd;

        this.colors[i3] = c.r;
        this.colors[i3 + 1] = c.g;
        this.colors[i3 + 2] = c.b;
        this.ages[idx] = 0;
        this.lifetimes[idx] = 0.65 + Math.random() * 0.45;
      }
    }

    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  public update(dt: number) {
    let anyActive = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const life = this.lifetimes[i];
      if (life <= 0) continue;

      this.ages[i] += dt;
      if (this.ages[i] >= life) {
        this.lifetimes[i] = -1;
        this.positions[i * 3 + 1] = -50; // hide cleanly under arena floor
        anyActive = true;
        continue;
      }

      anyActive = true;
      const i3 = i * 3;
      this.velocities[i3 + 1] -= 9.8 * dt;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      const fade = Math.max(0, 1 - this.ages[i] / life);
      this.colors[i3] *= 0.992;
      this.colors[i3 + 1] *= 0.985;
      this.colors[i3 + 2] *= 0.975 + 0.02 * fade;
    }

    if (anyActive) {
      (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }

    if (this.flashEnergy > 0.05) {
      this.flashEnergy *= Math.exp(-8 * dt);
      this.flashLeft.intensity = this.flashEnergy;
      this.flashRight.intensity = this.flashEnergy;
    } else {
      this.flashEnergy = 0;
      this.flashLeft.intensity = 0;
      this.flashRight.intensity = 0;
    }
  }

  public dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
