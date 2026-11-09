// Real-time audio engine. Owns the AudioContext and the whole processing graph:
//
//   tab stream -> source -> inputGain(stereo) -+-> bypassGain ------------------------+
//                                              |                                       v
//                                              +-> StereoProcessor -> Equalizer -> Expander -> Compressor -> processedGain -> master
//   master -> limiter -> outputMeter tap -> ctx.destination
//   (inputMeter taps the source before any processing)

import { StereoProcessor } from './stereo-processor.js';
import { Equalizer, EQ_BANDS } from './equalizer.js';
import { Compressor } from './compressor.js';
import { AudioMeter } from './audio-meter.js';
import { Expander } from './expander.js';
import { SpectrumAnalyzer } from './spectrum.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AudioEngine {
  /** @param {{onEnded?: (reason:string)=>void, onError?: (msg:string)=>void}} [handlers] */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.ctx = null;
    this.stream = null;
    this.stopped = false;
    this.timer = null;
    this.settings = null;
    this._onTrackEnded = () => this.handlers.onEnded?.('The captured tab stopped providing audio.');
  }

  async start(stream, settings) {
    if (this.ctx) throw new Error('Audio engine already started.');
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('The captured tab has no audio track.');
    this.stream = stream;

    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) throw new Error('Web Audio API is not available in this browser.');
    const ctx = (this.ctx = new Ctx({ latencyHint: 'interactive' }));

    this.source = ctx.createMediaStreamSource(stream);
    this.inputGain = ctx.createGain();
    this.inputGain.channelCount = 2;
    this.inputGain.channelCountMode = 'explicit';       // always stereo (mono is up-mixed)
    this.inputGain.channelInterpretation = 'speakers';

    this.inputMeter = new AudioMeter(ctx);
    this.outputMeter = new AudioMeter(ctx);
    this.stereo = new StereoProcessor(ctx);
    this.eq = new Equalizer(ctx);
    this.expander = await Expander.create(ctx);
    this.compressor = new Compressor(ctx);
    this.inputSpectrum = new SpectrumAnalyzer(ctx);
    this.outputSpectrum = new SpectrumAnalyzer(ctx);

    this.bypassGain = ctx.createGain();
    this.bypassGain.gain.value = 0;
    this.processedGain = ctx.createGain();
    this.processedGain.gain.value = 1;
    this.master = ctx.createGain();

    // Safety limiter so boosts can never push the output into hard clipping.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.1;

    this.source.connect(this.inputGain);
    this.inputGain.connect(this.inputMeter.node);
    this.inputGain.connect(this.bypassGain).connect(this.master);
    this.inputGain.connect(this.stereo.input);
    this.stereo.output.connect(this.eq.input);
    this.eq.output.connect(this.expander.input);
    this.expander.output.connect(this.compressor.input);
    this.inputGain.connect(this.inputSpectrum.node);
    this.compressor.output.connect(this.processedGain).connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(this.outputMeter.node);
    this.limiter.connect(this.outputSpectrum.node);
    this.limiter.connect(ctx.destination);

    this.update(settings);

    await ctx.resume().catch(() => {});
    if (ctx.state !== 'running') await sleep(500);
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    if (ctx.state !== 'running') {
      throw new Error('The audio engine could not start (AudioContext is ' + ctx.state + ').');
    }

    track.addEventListener('ended', this._onTrackEnded);
    ctx.addEventListener('statechange', () => {
      if (!this.stopped && ctx.state === 'suspended') ctx.resume().catch(() => {});
    });
    this.timer = setInterval(() => this._tick(), 250);   // mono detection only
  }

  /** Apply a (validated) settings object. Safe to call at slider speed. */
  update(s) {
    if (!this.ctx || this.stopped) return;
    this.settings = s;
    const now = this.ctx.currentTime;
    // 0..100 slider -> 0..2 ; 50 (default) = 1x
    const scale = clamp(s.enhancement / 50, 0, 2);

    // Bypass = original audio straight to the output; otherwise the processed chain.
    this.processedGain.gain.setTargetAtTime(s.enabled ? 1 : 0, now, 0.015);
    this.bypassGain.gain.setTargetAtTime(s.enabled ? 0 : 1, now, 0.015);

    const gains = s.eqEnabled
      ? s.eqGains.map((g) => clamp(g * scale, -12, 12))
      : EQ_BANDS.map(() => 0);
    this.eq.setGains(gains);
    this.eq.setHarshness(s.harshness / 100);
    this.eq.setBass(clamp(s.bassBoost / 100, 0, 1));

    this.stereo.setVocalCut(clamp(s.vocalCut / 100, 0, 1));
    this.stereo.setWidth(clamp(s.stereoWidth / 100, 0, 1));
    this.stereo.setAmbience(clamp(s.crowdCut / 100, 0, 1));
    this.expander.setAmount(clamp(s.crowdCut / 100, 0, 1));
    this.stereo.setAmount(clamp((s.stereoFocus / 100) * Math.min(scale, 1.5), 0, 1));

    this.compressor.setParams({
      enabled: s.compEnabled,
      threshold: s.comp.threshold,
      ratio: s.comp.ratio,
      attack: s.comp.attack,
      release: s.comp.release,
      makeup: s.comp.makeup,
      intensity: Math.min(scale, 1.5)
    });

    this.master.gain.setTargetAtTime(s.muted ? 0 : s.volume / 100, now, 0.02);
  }

  getMeters() {
    if (!this.ctx || this.stopped) return null;
    return {
      type: 'meters',
      input: this.inputMeter.read(),
      output: this.outputMeter.read(),
      mono: this.stereo.mono,
      reductionDb: this.compressor.reduction,
      spectrum: { input: this.inputSpectrum.read(), output: this.outputSpectrum.read() },
      ctxState: this.ctx.state
    };
  }

  _tick() {
    if (this.stopped) return;
    try { this.stereo.updateMonoState(); } catch { /* analyser not ready */ }
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = null;
    const track = this.stream?.getAudioTracks()[0];
    track?.removeEventListener('ended', this._onTrackEnded);
    this.stream?.getTracks().forEach((t) => t.stop());
    const parts = [this.stereo, this.eq, this.expander, this.compressor, this.inputMeter, this.outputMeter, this.inputSpectrum, this.outputSpectrum];
    for (const p of parts) p?.dispose();
    for (const n of [this.source, this.inputGain, this.bypassGain, this.processedGain, this.master, this.limiter]) {
      try { n?.disconnect(); } catch { /* ignore */ }
    }
    try { await this.ctx?.close(); } catch { /* already closed */ }
    this.stream = null;
    this.ctx = null;
  }
}
