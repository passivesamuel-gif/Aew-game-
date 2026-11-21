export class ArenaAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  private enabled = false;
  private entranceTimer: number | null = null;
  private entranceStep = 0;

  private ensureContext(): boolean {
    if (!this.ctx) {
      this.init();
    }
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return true;
  }

  public unlockAndEnable(): boolean {
    this.ensureContext();
    if (!this.enabled) {
      this.enabled = true;
      if (this.ctx && this.masterGain) {
        this.masterGain.gain.setTargetAtTime(0.18, this.ctx.currentTime, 0.12);
      }
    }
    return this.enabled;
  }

  public toggle(): boolean {
    this.ensureContext();
    this.enabled = !this.enabled;
    if (this.ctx && this.masterGain) {
      const target = this.enabled ? 0.18 : 0.0001;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
    }
    if (!this.enabled) {
      this.stopEntranceTheme();
    }
    return this.enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private init() {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.0001;
    this.masterGain.connect(this.ctx.destination);

    // Procedural pink noise crowd murmur bed
    const bufferSize = this.ctx.sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    this.crowdFilter = this.ctx.createBiquadFilter();
    this.crowdFilter.type = 'bandpass';
    this.crowdFilter.frequency.value = 420;
    this.crowdFilter.Q.value = 0.65;

    noiseSource.connect(this.crowdFilter);
    this.crowdFilter.connect(this.masterGain);
    noiseSource.start();
  }

  public setLightingEnergy(highEnergy: boolean) {
    if (!this.ctx || !this.crowdFilter || !this.enabled) return;
    this.crowdFilter.frequency.setTargetAtTime(highEnergy ? 720 : 420, this.ctx.currentTime, 0.35);
  }

  public startEntranceTheme(variant: 'challenger' | 'rival') {
    this.stopEntranceTheme();
    if (!this.enabled || !this.ensureContext()) return;

    // Driving arena entrance bass/synth groove (8-step pattern at ~128 BPM -> 235ms per eighth note)
    const bassPattern =
      variant === 'challenger'
        ? [82.41, 82.41, 98.0, 110.0, 82.41, 82.41, 123.47, 110.0] // E2 heroic rock drive
        : [73.42, 73.42, 87.31, 73.42, 103.83, 98.0, 73.42, 65.41]; // D2 heavy heel motif
    const leadPattern =
      variant === 'challenger'
        ? [329.63, 0, 392.0, 440.0, 0, 493.88, 440.0, 392.0]
        : [293.66, 0, 349.23, 0, 415.3, 392.0, 349.23, 261.63];

    this.entranceStep = 0;
    const playStep = () => {
      if (!this.enabled || !this.ctx) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const stepIdx = this.entranceStep % bassPattern.length;
      this.entranceStep++;

      // Heavy Arena Bass Pulse
      const bassOsc = ctx.createOscillator();
      const bassFilter = ctx.createBiquadFilter();
      const bassGain = ctx.createGain();
      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(bassPattern[stepIdx], now);
      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(480, now);
      bassGain.gain.setValueAtTime(0.095, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(ctx.destination);
      bassOsc.start(now);
      bassOsc.stop(now + 0.22);

      // Punchy Kick Drum on beats 0, 2, 4, 6
      if (stepIdx % 2 === 0) {
        const kick = ctx.createOscillator();
        const kGain = ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(125, now);
        kick.frequency.exponentialRampToValueAtTime(42, now + 0.11);
        kGain.gain.setValueAtTime(0.16, now);
        kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        kick.connect(kGain);
        kGain.connect(ctx.destination);
        kick.start(now);
        kick.stop(now + 0.14);
      }

      // Arena Lead Synth Accent
      const leadFreq = leadPattern[stepIdx];
      if (leadFreq > 0) {
        const lead = ctx.createOscillator();
        const lGain = ctx.createGain();
        lead.type = variant === 'challenger' ? 'square' : 'sawtooth';
        lead.frequency.setValueAtTime(leadFreq, now);
        lGain.gain.setValueAtTime(0.04, now);
        lGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        lead.connect(lGain);
        lGain.connect(ctx.destination);
        lead.start(now);
        lead.stop(now + 0.21);
      }
    };

    playStep();
    this.entranceTimer = window.setInterval(playStep, 235);
  }

  public stopEntranceTheme() {
    if (this.entranceTimer !== null) {
      clearInterval(this.entranceTimer);
      this.entranceTimer = null;
    }
  }

  public playPyroBoom() {
    if (!this.enabled || !this.ensureContext() || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Deep concussion thump
    const boom = ctx.createOscillator();
    const bGain = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(95, now);
    boom.frequency.exponentialRampToValueAtTime(28, now + 0.42);
    bGain.gain.setValueAtTime(0.32, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    boom.connect(bGain);
    bGain.connect(ctx.destination);
    boom.start(now);
    boom.stop(now + 0.5);

    // Filtered pyrotechnic hiss/crackle
    const len = Math.floor(ctx.sampleRate * 0.55);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.18));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'highpass';
    bp.frequency.value = 900;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.2, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
    src.connect(bp);
    bp.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
  }

  public playImpact(heavy = false) {
    if (!this.enabled || !this.ensureContext() || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = heavy ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(heavy ? 120 : 165, now);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 32 : 52, now + (heavy ? 0.24 : 0.12));
    gain.gain.setValueAtTime(heavy ? 0.30 : 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.26 : 0.14));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (heavy ? 0.27 : 0.15));
  }

  public playRefCount(count: 1 | 2 | 3) {
    if (!this.enabled || !this.ensureContext() || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const slap = ctx.createOscillator();
    const gain = ctx.createGain();
    slap.type = 'sine';
    slap.frequency.setValueAtTime(140 + count * 20, now);
    slap.frequency.exponentialRampToValueAtTime(45, now + 0.11);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    slap.connect(gain);
    gain.connect(ctx.destination);
    slap.start(now);
    slap.stop(now + 0.13);
  }

  public playRingBell() {
    if (!this.enabled || !this.ensureContext() || !this.ctx) return;

    const now = this.ctx.currentTime;
    const bellBus = this.ctx.createGain();
    bellBus.gain.setValueAtTime(0.28, now);
    bellBus.gain.exponentialRampToValueAtTime(0.001, now + 2.4);
    bellBus.connect(this.ctx.destination);

    // Metallic ring bell partials
    const partials = [880, 1318.5, 1760, 2489, 3136];
    partials.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(1 / (idx + 1.2), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (2.2 - idx * 0.25));
      osc.connect(gain);
      gain.connect(bellBus);
      osc.start(now);
      osc.stop(now + 2.4);
    });
  }

  public playRopeSnap(intensity = 0.7) {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    const clamped = Math.min(1, Math.max(0.15, intensity));

    const thumpOsc = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(115, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
    thumpGain.gain.setValueAtTime(0.24 * clamped, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    thumpOsc.connect(thumpGain);
    thumpGain.connect(this.ctx.destination);
    thumpOsc.start(now);
    thumpOsc.stop(now + 0.17);

    const springOsc = this.ctx.createOscillator();
    const springGain = this.ctx.createGain();
    springOsc.type = 'triangle';
    springOsc.frequency.setValueAtTime(210, now);
    springOsc.frequency.exponentialRampToValueAtTime(145, now + 0.22);
    springGain.gain.setValueAtTime(0.055 * clamped, now);
    springGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    springOsc.connect(springGain);
    springGain.connect(this.ctx.destination);
    springOsc.start(now);
    springOsc.stop(now + 0.25);
  }

  public dispose() {
    this.stopEntranceTheme();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
