/** Mixes several audio sources into one track via Web Audio. */
export class AudioMixer {
  private readonly ctx: AudioContext;
  private readonly destination: MediaStreamAudioDestinationNode;
  private readonly gains = new Map<string, GainNode>();
  private readonly sources: MediaStreamAudioSourceNode[] = [];

  constructor() {
    this.ctx = new AudioContext();
    this.destination = this.ctx.createMediaStreamDestination();
  }

  /** Adds the first audio track of `stream` under `name`. Returns false if it had none. */
  add(name: string, stream: MediaStream, gain = 1): boolean {
    const track = stream.getAudioTracks()[0];
    if (!track) return false;
    const source = this.ctx.createMediaStreamSource(new MediaStream([track]));
    const node = this.ctx.createGain();
    node.gain.value = gain;
    source.connect(node).connect(this.destination);
    this.sources.push(source);
    this.gains.set(name, node);
    return true;
  }

  get hasSources(): boolean {
    return this.gains.size > 0;
  }

  setGain(name: string, value: number): void {
    const node = this.gains.get(name);
    if (node) node.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  get track(): MediaStreamTrack | null {
    return this.hasSources ? this.destination.stream.getAudioTracks()[0] ?? null : null;
  }

  async close(): Promise<void> {
    this.sources.forEach((s) => s.disconnect());
    this.gains.forEach((g) => g.disconnect());
    this.destination.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx.state !== "closed") await this.ctx.close();
  }
}

/** Live input level (0..1) for a mic test meter. Call `stop()` when done. */
export function createLevelMeter(stream: MediaStream, onLevel: (level: number) => void): { stop: () => void } {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  let raf = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    // Perceptual-ish scale: -60 dB → 0, 0 dB → 1.
    const db = 20 * Math.log10(rms || 1e-8);
    onLevel(Math.min(1, Math.max(0, (db + 60) / 60)));
    raf = requestAnimationFrame(tick);
  };
  void ctx.resume().then(tick);
  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      source.disconnect();
      void ctx.close();
    },
  };
}
