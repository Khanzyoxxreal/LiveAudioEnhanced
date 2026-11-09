// Offscreen document: holds the captured MediaStream and the persistent AudioContext.
// (A MV3 service worker cannot run Web Audio, and it is shut down when idle.)

import { AudioEngine } from '../audio/audio-engine.js';
import { normalizeSettings } from '../shared/settings.js';

let engine = null;
const meterPorts = new Set();
let meterTimer = null;

function notifyBackground(status, error = null) {
  chrome.runtime.sendMessage({ target: 'background', type: 'status', status, error }).catch(() => {});
}

function startMeters() {
  if (meterTimer || !engine) return;
  meterTimer = setInterval(() => {
    const data = engine?.getMeters();
    if (!data) return;
    for (const p of meterPorts) {
      try { p.postMessage(data); } catch { /* port closed */ }
    }
  }, 66);
}

function stopMeters() {
  clearInterval(meterTimer);
  meterTimer = null;
}

async function destroyEngine() {
  stopMeters();
  const e = engine;
  engine = null;
  if (e) await e.stop();
}

async function handleEngineEnd(eng, reason, isError) {
  if (engine !== eng) return;
  engine = null;
  stopMeters();
  await eng.stop().catch(() => {});
  notifyBackground(isError ? 'error' : 'off', reason);
}

async function start({ streamId, settings }) {
  await destroyEngine();
  if (!streamId) throw new Error('Missing capture stream id.');

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false
    });
  } catch (e) {
    throw new Error(
      `Could not capture the tab audio (${e.name || 'Error'}: ${e.message}). ` +
      'Make sure the tab is not already captured by another extension and try again.'
    );
  }

  const eng = new AudioEngine({
    onEnded: (reason) => handleEngineEnd(eng, reason, false),
    onError: (msg) => handleEngineEnd(eng, msg, true)
  });
  try {
    await eng.start(stream, normalizeSettings(settings));
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    await eng.stop().catch(() => {});
    throw e;
  }
  engine = eng;
  if (meterPorts.size) startMeters();
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false;
  (async () => {
    switch (msg.type) {
      case 'start':
        return start(msg);
      case 'stop':
        await destroyEngine();
        return { ok: true };
      case 'settings':
        engine?.update(normalizeSettings(msg.settings));
        return { ok: !!engine };
      default:
        return { ok: false, error: `Unknown message: ${msg.type}` };
    }
  })().then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'liveaudioenhanced-meters') return;
  meterPorts.add(port);
  startMeters();
  port.onDisconnect.addListener(() => {
    meterPorts.delete(port);
    if (!meterPorts.size) stopMeters();
  });
});
