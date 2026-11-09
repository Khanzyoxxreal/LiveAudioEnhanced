// Mid/Side stereo processor built from native Web Audio nodes.
//
//   Mid  = (L + R) / 2      Side = (L - R) / 2
//   L'   = Mid' + Side'     R'   = Mid' - Side'
//
// With amount = 0 this is an exact identity (L' = L, R' = R).
// With amount > 0:
//   - Mid' = Mid - k * BandPass(Mid, 200 Hz .. 4 kHz)   -> centred energy is reduced only in the
//     vocal-heavy midrange. Bass, kick, and the top octaves are untouched.
//   - Side' = Side * (1 + 0.6 * amount)                 -> stereo-wide elements come forward.
// LIMITATION: this does NOT separate vocals from instruments. Anything panned to the centre in
// that frequency range (including centred guitars/keys/snare) is reduced as well.
//
// If the source is effectively mono (Side ~ 0) the effect is bypassed, because attenuating the
// Mid of a mono signal would just make everything quieter.

const MAX_MID_REDUCTION = 0.45;  // up to ~ -5 dB in the vocal band
const MAX_VOCAL_CUT = 0.5;       // extra reduction from the Vocal reduction slider (up to ~ -22 dB combined)
const MAX_SIDE_BOOST = 0.6;      // up to ~ +4 dB
const MAX_WIDTH_BOOST = 0.8;     // Stereo width slider: up to ~ +5 dB of Side
const MAX_AMBIENCE_CUT_DB = 9;   // Crowd & hall reduction: high-frequency Side cut
const BAND_LOW_HZ = 200;
const BAND_HIGH_HZ = 4000;

function rmsOf(analyser, buf) {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

export class StereoProcessor {
  constructor(ctx) {
    this.ctx = ctx;
    this.amount = 0;
    this.cut = 0;
    this.width = 0;
    this.ambience = 0;
    this.mono = false;
    this.monoVotes = 0;

    const gain = (v, channels) => {
      const g = ctx.createGain();
      g.gain.value = v;
      if (channels) {
        g.channelCount = channels;
        g.channelCountMode = 'explicit';
      }
      return g;
    };

    // Always work on a stereo signal (mono sources are up-mixed to L = R).
    this.input = gain(1, 2);
    this.input.channelInterpretation = 'speakers';
    this.output = gain(1, 2);

    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);

    const lToMid = gain(0.5, 1);
    const rToMid = gain(0.5, 1);
    const lToSide = gain(0.5, 1);
    const rToSide = gain(-0.5, 1);
    this.mid = gain(1, 1);
    this.side = gain(1, 1);

    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = BAND_LOW_HZ;
    this.hp.Q.value = Math.SQRT1_2;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = BAND_HIGH_HZ;
    this.lp.Q.value = Math.SQRT1_2;
    this.midReduce = gain(0, 1);       // negative gain, subtracts the band from Mid
    this.midOut = gain(1, 1);

    this.sideGain = gain(1, 1);
    // Ambience (crowd / room reverb) is mostly uncorrelated, so it lives in the Side signal.
    this.sideShelf = ctx.createBiquadFilter();
    this.sideShelf.type = 'highshelf';
    this.sideShelf.frequency.value = 2500;
    this.sideShelf.gain.value = 0;
    this.sideOut = gain(1, 1);
    this.sideInv = gain(-1, 1);

    // Mono-detection taps
    this.midAnalyser = ctx.createAnalyser();
    this.sideAnalyser = ctx.createAnalyser();
    this.midAnalyser.fftSize = this.sideAnalyser.fftSize = 2048;
    this.midBuf = new Float32Array(2048);
    this.sideBuf = new Float32Array(2048);

    this.nodes = [
      this.input, this.output, this.splitter, this.merger, lToMid, rToMid, lToSide, rToSide,
      this.mid, this.side, this.hp, this.lp, this.midReduce, this.midOut,
      this.sideGain, this.sideShelf, this.sideOut, this.sideInv, this.midAnalyser, this.sideAnalyser
    ];

    this.input.connect(this.splitter);
    this.splitter.connect(lToMid, 0);
    this.splitter.connect(lToSide, 0);
    this.splitter.connect(rToMid, 1);
    this.splitter.connect(rToSide, 1);
    lToMid.connect(this.mid);
    rToMid.connect(this.mid);
    lToSide.connect(this.side);
    rToSide.connect(this.side);

    this.mid.connect(this.midOut);                       // direct path
    this.mid.connect(this.hp).connect(this.lp).connect(this.midReduce).connect(this.midOut);
    this.side.connect(this.sideShelf).connect(this.sideGain).connect(this.sideOut);

    this.midOut.connect(this.merger, 0, 0);              // L = Mid + Side
    this.midOut.connect(this.merger, 0, 1);              // R = Mid - Side
    this.sideOut.connect(this.merger, 0, 0);
    this.sideOut.connect(this.sideInv).connect(this.merger, 0, 1);
    this.merger.connect(this.output);

    this.mid.connect(this.midAnalyser);
    this.side.connect(this.sideAnalyser);
  }

  /** @param {number} amount 0..1 */
  setAmount(amount) {
    this.amount = Math.min(1, Math.max(0, amount));
    this._apply();
  }

  /** @param {number} cut 0..1 extra centred mid-range reduction */
  setVocalCut(cut) {
    this.cut = Math.min(1, Math.max(0, cut));
    this._apply();
  }

  /** @param {number} w 0..1 extra stereo width (Side level) */
  setWidth(w) {
    this.width = Math.min(1, Math.max(0, w));
    this._apply();
  }

  /** @param {number} a 0..1 reduction of high-frequency Side content (crowd / hall ambience) */
  setAmbience(a) {
    this.ambience = Math.min(1, Math.max(0, a));
    this._apply();
  }

  _apply() {
    const a = this.mono ? 0 : this.amount;
    const c = this.mono ? 0 : this.cut;
    const now = this.ctx.currentTime;
    const tc = this.mono ? 0.25 : 0.04;
    this.midReduce.gain.setTargetAtTime(-Math.min(0.92, MAX_MID_REDUCTION * a + MAX_VOCAL_CUT * c), now, tc);
    const w = this.mono ? 0 : this.width;
    this.sideGain.gain.setTargetAtTime((1 + MAX_SIDE_BOOST * a) * (1 + MAX_WIDTH_BOOST * w), now, tc);
    this.sideShelf.gain.setTargetAtTime(this.mono ? 0 : -MAX_AMBIENCE_CUT_DB * this.ambience, now, tc);
  }

  /** Call periodically (~4 Hz). Returns true when the source looks mono. */
  updateMonoState() {
    const m = rmsOf(this.midAnalyser, this.midBuf);
    const s = rmsOf(this.sideAnalyser, this.sideBuf);
    if (m < 0.0005) return this.mono;               // silence: keep previous decision
    this.monoVotes = s < m * 0.01 ? Math.min(this.monoVotes + 1, 12) : 0;
    const mono = this.monoVotes >= 8;               // ~2 s of Side at -40 dB or lower
    if (mono !== this.mono) {
      this.mono = mono;
      this._apply();
    }
    return this.mono;
  }

  dispose() {
    for (const n of this.nodes) {
      try { n.disconnect(); } catch { /* ignore */ }
    }
  }
}
