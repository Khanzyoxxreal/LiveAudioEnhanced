// Crowd & hall reduction: loads the expander AudioWorklet. If the worklet cannot be loaded the
// stage becomes a transparent pass-through, so the rest of the engine keeps working.

const WORKLET_URL = new URL('./expander-worklet.js', import.meta.url).href;

export class Expander {
  static async create(ctx) {
    const e = new Expander(ctx);
    try {
      await ctx.audioWorklet.addModule(WORKLET_URL);
      e.node = new AudioWorkletNode(ctx, 'liveaudioenhanced-expander', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers'
      });
      e.amountParam = e.node.parameters.get('amount');
      e.input = e.output = e.node;
    } catch (err) {
      console.warn('Live Audio Enhanced: crowd reduction unavailable', err);
      e.node = null;
      e.input = e.output = ctx.createGain();
    }
    return e;
  }

  constructor(ctx) {
    this.ctx = ctx;
    this.node = null;
    this.amountParam = null;
    this.input = null;
    this.output = null;
  }

  get available() { return !!this.node; }

  /** @param {number} amount 0..1 */
  setAmount(amount) {
    if (!this.amountParam) return;
    const a = Math.min(1, Math.max(0, amount));
    this.amountParam.setTargetAtTime(a, this.ctx.currentTime, 0.05);
  }

  dispose() {
    try { this.node?.disconnect(); } catch { /* ignore */ }
    try { this.input?.disconnect(); } catch { /* ignore */ }
  }
}
