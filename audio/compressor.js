// Gentle dynamics compressor with makeup gain.

const dbToLin = (db) => Math.pow(10, db / 20);

export class Compressor {
  constructor(ctx) {
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.knee.value = 12;
    this.makeup = ctx.createGain();
    this.comp.connect(this.makeup);
    this.input = this.comp;
    this.output = this.makeup;
  }

  /**
   * @param {{enabled:boolean, threshold:number, ratio:number, attack:number, release:number,
   *          makeup:number, intensity:number}} p  attack/release in ms, intensity 0..1.5
   */
  setParams(p) {
    const now = this.ctx.currentTime;
    const tc = 0.03;
    if (!p.enabled) {
      // ratio 1 = transparent; no makeup
      this.comp.threshold.setTargetAtTime(0, now, tc);
      this.comp.ratio.setTargetAtTime(1, now, tc);
      this.makeup.gain.setTargetAtTime(1, now, tc);
      return;
    }
    const k = Math.min(1.5, Math.max(0, p.intensity));
    this.comp.threshold.setTargetAtTime(p.threshold, now, tc);
    this.comp.ratio.setTargetAtTime(Math.min(20, 1 + (p.ratio - 1) * k), now, tc);
    this.comp.attack.setTargetAtTime(p.attack / 1000, now, tc);
    this.comp.release.setTargetAtTime(p.release / 1000, now, tc);
    this.makeup.gain.setTargetAtTime(dbToLin(p.makeup * k), now, tc);
  }

  get reduction() { return this.comp.reduction; }

  dispose() {
    for (const n of [this.comp, this.makeup]) {
      try { n.disconnect(); } catch { /* ignore */ }
    }
  }
}
