const MUTE_KEY = "neon-drift-mute";

const BASS = [110, 110, 130.81, 98, 110, 146.83, 130.81, 87.31];

export class MenuMusic {
  muted = localStorage.getItem(MUTE_KEY) === "1";
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer = 0;
  private step = 0;
  private racing = false;
  private started = false;

  async start() {
    if (this.muted) return;
    const ctx = this.ensure();
    if (ctx.state === "suspended") await ctx.resume();
    this.started = true;
    this.applyLevel();
  }

  toggle() {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    if (this.muted) {
      this.applyLevel();
      return;
    }
    void this.start();
  }

  setRacing(racing: boolean) {
    this.racing = racing;
    this.applyLevel();
  }

  private ensure() {
    if (this.ctx && this.master) return this.ctx;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1600;
    master.connect(filter);
    filter.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.timer = window.setInterval(() => this.tick(), 240);
    return ctx;
  }

  private applyLevel() {
    if (!this.master || !this.ctx) return;
    const level = this.muted || !this.started ? 0 : this.racing ? 0.045 : 0.11;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(level, this.ctx.currentTime + 0.2);
  }

  private tick() {
    if (!this.ctx || !this.master || this.muted || !this.started) return;
    const now = this.ctx.currentTime;
    const note = BASS[this.step % BASS.length];
    if (this.step % 2 === 0) this.tone(note / 2, now, 0.22, "sawtooth", 0.07);
    if (this.step % 4 === 0) {
      this.tone(note, now, 0.16, "triangle", 0.035);
      this.tone(note * 1.5, now + 0.03, 0.14, "sine", 0.025);
    }
    this.noise(now, 0.025, this.step % 2 === 0 ? 0.018 : 0.006);
    this.step += 1;
  }

  private tone(freq: number, when: number, duration: number, type: OscillatorType, gain: number) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(gain, when + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private noise(when: number, duration: number, gain: number) {
    if (!this.ctx || !this.master) return;
    const length = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    const amp = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = 4000;
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start(when);
    source.stop(when + duration);
  }
}
