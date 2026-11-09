// Real level meter built on an AnalyserNode (no simulated data).

export function toDb(v) {
  return v > 1e-5 ? 20 * Math.log10(v) : -100;
}

export class AudioMeter {
  /**
   * @param {BaseAudioContext} ctx
   * @param {{fftSize?: number, holdMs?: number, clipThreshold?: number}} [opts]
   */
  constructor(ctx, { fftSize = 4096, holdMs = 1500, clipThreshold = 0.99 } = {}) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = 0;
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.holdMs = holdMs;
    this.clipThreshold = clipThreshold;
    this.clipUntil = 0;
  }

  /** Connect a node to this to tap its signal (the meter has no audible output). */
  get node() { return this.analyser; }

  read(now = performance.now()) {
    const buf = this.buffer;
    this.analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    if (peak >= this.clipThreshold) this.clipUntil = now + this.holdMs;
    return { peak, rms, peakDb: toDb(peak), rmsDb: toDb(rms), clipped: now < this.clipUntil };
  }

  dispose() {
    try { this.analyser.disconnect(); } catch { /* already disconnected */ }
  }
}
