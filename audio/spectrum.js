// Log-spaced spectrum bars from an AnalyserNode (real data, used by the popup visualiser).

export class SpectrumAnalyzer {
  constructor(ctx, { bars = 32, fftSize = 2048, minHz = 40, maxHz = 16000 } = {}) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = 0.78;
    this.analyser.minDecibels = -100;
    this.analyser.maxDecibels = -10;
    this.buf = new Float32Array(this.analyser.frequencyBinCount);
    this.bars = bars;
    const binHz = ctx.sampleRate / fftSize;
    const top = Math.min(maxHz, ctx.sampleRate / 2 - binHz);
    this.ranges = [];
    for (let i = 0; i < bars; i++) {
      const f0 = minHz * Math.pow(top / minHz, i / bars);
      const f1 = minHz * Math.pow(top / minHz, (i + 1) / bars);
      const lo = Math.max(1, Math.floor(f0 / binHz));
      const hi = Math.max(lo, Math.ceil(f1 / binHz) - 1);
      this.ranges.push([lo, hi]);
    }
  }

  get node() { return this.analyser; }

  /** @returns {number[]} one value 0..1 per bar */
  read() {
    this.analyser.getFloatFrequencyData(this.buf);
    const out = new Array(this.bars);
    for (let i = 0; i < this.bars; i++) {
      const [lo, hi] = this.ranges[i];
      let m = -140;
      for (let k = lo; k <= hi; k++) if (this.buf[k] > m) m = this.buf[k];
      const v = (m + 90) / 60;
      out[i] = Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
    }
    return out;
  }

  dispose() {
    try { this.analyser.disconnect(); } catch { /* ignore */ }
  }
}
