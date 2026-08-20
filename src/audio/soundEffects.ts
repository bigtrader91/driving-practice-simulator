// Ultra-Realistic Audio Engine & Korean Driving Instructor Voice System

class SoundSystem {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private skidGain: GainNode | null = null;
  private isMuted: boolean = false;
  private lastBlinkTime: number = 0;
  private lastSensorBeepTime: number = 0;
  private lastSpokenText: string = '';
  private lastSpokenTime: number = 0;

  // Gear transmission state
  private currentGearNumber: number = 1;
  private engineRpm: number = 800;

  public init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    } catch {
      console.warn('Web Audio API not supported');
    }
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.engineGain) {
      this.engineGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
    }
    if (muted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  // 1. Dual-Harmonic Engine Synthesizer with 6-Speed Transmission
  public startEngine() {
    if (this.isMuted || !this.ctx) return;
    if (this.engineOsc) return;

    try {
      this.engineOsc = this.ctx.createOscillator();
      this.engineSubOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();

      this.engineOsc.type = 'sawtooth';
      this.engineSubOsc.type = 'triangle';

      this.engineOsc.frequency.setValueAtTime(45, this.ctx.currentTime);
      this.engineSubOsc.frequency.setValueAtTime(22.5, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, this.ctx.currentTime);

      this.engineGain.gain.setValueAtTime(0.06, this.ctx.currentTime);

      this.engineOsc.connect(filter);
      this.engineSubOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);

      this.engineOsc.start();
      this.engineSubOsc.start();

      // Initialize wind rush noise
      this.initWindNoise();
    } catch (e) {
      console.warn('Engine sound init failed', e);
    }
  }

  private initWindNoise() {
    if (!this.ctx) return;
    try {
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1; // White noise
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;
      whiteNoise.loop = true;

      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.setValueAtTime(350, this.ctx.currentTime);
      windFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0, this.ctx.currentTime);

      whiteNoise.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);

      whiteNoise.start();
      this.windSource = whiteNoise;
    } catch {}
  }

  // 2. Realistic RPM & Transmission Simulation
  public updateEngine(speedKmH: number, isAccelerating: boolean, gear: string) {
    if (this.isMuted || !this.ctx || !this.engineOsc || !this.engineSubOsc || !this.engineGain) return;

    const absSpeed = Math.abs(speedKmH);

    // Calculate 6-speed automatic transmission gear ratios
    let gearNum = 1;
    let gearRatio = 3.6;
    if (absSpeed < 18) { gearNum = 1; gearRatio = 3.6; }
    else if (absSpeed < 35) { gearNum = 2; gearRatio = 2.4; }
    else if (absSpeed < 55) { gearNum = 3; gearRatio = 1.7; }
    else if (absSpeed < 75) { gearNum = 4; gearRatio = 1.25; }
    else if (absSpeed < 100) { gearNum = 5; gearRatio = 0.95; }
    else { gearNum = 6; gearRatio = 0.75; }

    this.currentGearNumber = gearNum;

    // RPM formula (Idle 800 ~ Redline 6000)
    let rpm = 800;
    if (gear === 'D') {
      rpm = 900 + (absSpeed * 45 * gearRatio);
      if (isAccelerating) rpm += 600;
    } else if (gear === 'R') {
      rpm = 900 + (absSpeed * 75);
      if (isAccelerating) rpm += 500;
    }
    rpm = Math.min(5800, Math.max(800, rpm));
    this.engineRpm = rpm;

    const fundamentalFreq = (rpm / 60) * 1.8; // 4-cylinder engine ignition pulses

    this.engineOsc.frequency.setTargetAtTime(fundamentalFreq, this.ctx.currentTime, 0.08);
    this.engineSubOsc.frequency.setTargetAtTime(fundamentalFreq * 0.5, this.ctx.currentTime, 0.08);

    const volume = isAccelerating ? 0.09 : 0.05;
    this.engineGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.08);

    // Wind Rush Noise proportional to speed
    if (this.windGain) {
      const windVol = Math.min(0.08, (absSpeed / 120) * 0.08);
      this.windGain.gain.setTargetAtTime(windVol, this.ctx.currentTime, 0.1);
    }
  }

  // 3. Korean Driving Instructor AI Voice Guidance (Web Speech API)
  public speakInstructor(text: string, force = false) {
    if (this.isMuted) return;
    const now = Date.now();
    if (!force && this.lastSpokenText === text && now - this.lastSpokenTime < 5000) return;
    this.lastSpokenText = text;
    this.lastSpokenTime = now;

    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // cancel previous utterance
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR';
        utterance.rate = 1.05; // natural speaking rate
        utterance.pitch = 1.05; // friendly tone
        window.speechSynthesis.speak(utterance);
      }
    } catch {}
  }

  public playTurnSignalClick(highTone: boolean) {
    if (this.isMuted || !this.ctx) return;
    const now = Date.now();
    if (now - this.lastBlinkTime < 200) return;
    this.lastBlinkTime = now;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(highTone ? 880 : 680, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.035);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch {}
  }

  public playSensorBeep(distanceMeters: number) {
    if (this.isMuted || !this.ctx) return;
    if (distanceMeters > 2.0 || distanceMeters <= 0) return;

    const now = Date.now();
    const interval = Math.max(70, distanceMeters * 220);
    if (now - this.lastSensorBeepTime < interval) return;
    this.lastSensorBeepTime = now;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1450, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.09, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.07);
    } catch {}
  }

  public playTireSkid() {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.linearRampToValueAtTime(950, now + 0.2);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, now);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.26);
    } catch {}
  }

  public playWarning() {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.26);
    } catch {}
  }

  public playCollision() {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.36);
    } catch {}
  }

  public playSuccess() {
    if (this.isMuted || !this.ctx) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime + idx * 0.12;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
      });
    } catch {}
  }

  public stopEngine() {
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
        this.engineOsc.disconnect();
        this.engineSubOsc?.stop();
        this.engineSubOsc?.disconnect();
        this.windSource?.stop();
        this.windSource?.disconnect();
      } catch {}
      this.engineOsc = null;
      this.engineSubOsc = null;
      this.windSource = null;
    }
  }

  public getRpm() {
    return this.engineRpm;
  }

  public getGearNumber() {
    return this.currentGearNumber;
  }
}

export const sounds = new SoundSystem();
