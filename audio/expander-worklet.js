// AudioWorklet: stereo-linked downward expander used for "Crowd & hall reduction".
//
// It lowers the level of quiet, sustained material (crowd murmur, applause tails, room reverb
// between notes) relative to the recent loud level of the stream. Plain DSP, no AI.
//
//   threshold = slow-moving peak reference - offset      (adapts to stream loudness)
//   below the threshold the signal is turned down by (distance * (ratio - 1)), capped at maxAtt
//   opens fast (6 ms) so note attacks are untouched, closes slowly (250 ms) to avoid pumping.
//
// amount = 0 is an exact pass-through.

export class ExpanderCore {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.pow = 0;             // smoothed mean square
    this.refDb = -60;         // slow peak reference (dB)
    this.grDb = 0;            // current attenuation (dB, >= 0)
    this.cPow = 1 - Math.exp(-1 / (sampleRate * 0.01));
    this.cOpen = 1 - Math.exp(-1 / (sampleRate * 0.006));
    this.cClose = 1 - Math.exp(-1 / (sampleRate * 0.25));
    this.decay = 3 / sampleRate;   // reference falls 3 dB per second
  }

  /** @param {number} amount 0..1 */
  process(inL, inR, outL, outR, n, amount) {
    const a = amount < 0 ? 0 : amount > 1 ? 1 : amount;
    const maxAtt = 20 * a;
    const ratioMinus1 = 2.5 * a;
    const offset = 30 - 14 * a;
    for (let i = 0; i < n; i++) {
      const l = inL[i];
      const r = inR[i];
      this.pow += this.cPow * ((l * l + r * r) * 0.5 - this.pow);
      const lvl = 10 * Math.log10(this.pow + 1e-12);
      const ref = this.refDb - this.decay;
      this.refDb = lvl > ref ? lvl : ref < -50 ? -50 : ref;
      const under = this.refDb - offset - lvl;
      let target = under > 0 ? under * ratioMinus1 : 0;
      if (target > maxAtt) target = maxAtt;
      this.grDb += (target > this.grDb ? this.cClose : this.cOpen) * (target - this.grDb);
      const g = this.grDb < 1e-4 ? 1 : Math.pow(10, -this.grDb / 20);
      outL[i] = l * g;
      outR[i] = r * g;
    }
  }
}

if (typeof AudioWorkletProcessor === 'function' && typeof registerProcessor === 'function') {
  class ExpanderProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [{ name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }];
    }

    constructor() {
      super();
      this.core = new ExpanderCore(sampleRate);
    }

    process(inputs, outputs, parameters) {
      const input = inputs[0];
      const output = outputs[0];
      if (!output || output.length === 0) return true;
      if (!input || input.length === 0) {
        for (const ch of output) ch.fill(0);
        return true;
      }
      const inL = input[0];
      const inR = input[1] || input[0];
      const outL = output[0];
      const outR = output[1] || output[0];
      this.core.process(inL, inR, outL, outR, outL.length, parameters.amount[0]);
      return true;
    }
  }
  registerProcessor('liveaudioenhanced-expander', ExpanderProcessor);
}
