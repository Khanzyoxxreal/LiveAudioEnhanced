// 7-band equalizer (BiquadFilterNode) plus an independent harshness reducer.

export const EQ_BANDS = [
  { id: 'sub',     label: 'Sub Bass',       freq: 50,    type: 'peaking',   q: 0.9 },
  { id: 'bass',    label: 'Bass',           freq: 120,   type: 'peaking',   q: 1.0 },
  { id: 'lowmid',  label: 'Low Mid',        freq: 350,   type: 'peaking',   q: 1.0 },
  { id: 'mid',     label: 'Mid',            freq: 1000,  type: 'peaking',   q: 0.9 },
  { id: 'highmid', label: 'High Mid',       freq: 3000,  type: 'peaking',   q: 1.0 },
  { id: 'treble',  label: 'Treble',         freq: 6000,  type: 'peaking',   q: 0.9 },
  { id: 'high',    label: 'High Frequency', freq: 12000, type: 'highshelf', q: 0.7 }
];

export const EQ_LIMIT_DB = 12;
const dbToLin = (db) => Math.pow(10, db / 20);

export class Equalizer {
  constructor(ctx) {
    this.ctx = ctx;
    this.pre = ctx.createGain();   // automatic headroom compensation for boosts
    this.filters = EQ_BANDS.map((b) => {
      const f = ctx.createBiquadFilter();
      f.type = b.type;
      f.frequency.value = b.freq;
      f.Q.value = b.q;
      f.gain.value = 0;
      return f;
    });

    // Harshness reducer: gentle cut around 4.5 kHz and a soft high shelf cut.
    // Plain static filtering - no noise gate, no AI.
    this.harshPeak = ctx.createBiquadFilter();
    this.harshPeak.type = 'peaking';
    this.harshPeak.frequency.value = 4500;
    this.harshPeak.Q.value = 1.2;
    this.harshPeak.gain.value = 0;
    this.harshShelf = ctx.createBiquadFilter();
    this.harshShelf.type = 'highshelf';
    this.harshShelf.frequency.value = 9000;
    this.harshShelf.gain.value = 0;

    // Bass boost: low shelf plus a small sub-bass peak ("punch").
    this.bassShelf = ctx.createBiquadFilter();
    this.bassShelf.type = 'lowshelf';
    this.bassShelf.frequency.value = 110;
    this.bassShelf.gain.value = 0;
    this.bassPunch = ctx.createBiquadFilter();
    this.bassPunch.type = 'peaking';
    this.bassPunch.frequency.value = 60;
    this.bassPunch.Q.value = 1;
    this.bassPunch.gain.value = 0;
    this.eqMax = 0;
    this.bassDb = 0;

    this.input = this.pre;
    let node = this.pre;
    for (const f of [...this.filters, this.bassShelf, this.bassPunch, this.harshPeak, this.harshShelf]) {
      node.connect(f);
      node = f;
    }
    this.output = node;
  }

  /** @param {number[]} gainsDb one value per band (already clamped to +/-12 dB) */
  setGains(gainsDb) {
    const now = this.ctx.currentTime;
    let maxBoost = 0;
    this.filters.forEach((f, i) => {
      const g = Math.max(-EQ_LIMIT_DB, Math.min(EQ_LIMIT_DB, gainsDb[i] || 0));
      if (g > maxBoost) maxBoost = g;
      f.gain.setTargetAtTime(g, now, 0.03);
    });
    this.eqMax = maxBoost;
    this._applyHeadroom();
  }

  /** @param {number} amount 0..1  (up to +9 dB low shelf and +3 dB sub-bass punch) */
  setBass(amount) {
    const a = Math.min(1, Math.max(0, amount));
    const now = this.ctx.currentTime;
    this.bassShelf.gain.setTargetAtTime(9 * a, now, 0.03);
    this.bassPunch.gain.setTargetAtTime(3 * a, now, 0.03);
    this.bassDb = 9 * a;
    this._applyHeadroom();
  }

  // Pull the level down by half of the largest boost so the chain does not clip.
  _applyHeadroom() {
    const maxBoost = Math.max(this.eqMax, this.bassDb);
    this.pre.gain.setTargetAtTime(dbToLin(-0.5 * maxBoost), this.ctx.currentTime, 0.03);
  }

  /** @param {number} amount 0..1 */
  setHarshness(amount) {
    const a = Math.min(1, Math.max(0, amount));
    const now = this.ctx.currentTime;
    this.harshPeak.gain.setTargetAtTime(-6 * a, now, 0.03);
    this.harshShelf.gain.setTargetAtTime(-3 * a, now, 0.03);
  }

  dispose() {
    for (const n of [this.pre, ...this.filters, this.bassShelf, this.bassPunch, this.harshPeak, this.harshShelf]) {
      try { n.disconnect(); } catch { /* ignore */ }
    }
  }
}
