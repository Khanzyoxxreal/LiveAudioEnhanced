// Service worker: coordinates capture lifecycle. It never touches audio itself.
// State lives in chrome.storage.session so it survives service-worker restarts.

import { getYouTubeVideoId, isYouTubeShort } from '../shared/youtube.js';

const OFFSCREEN_PATH = 'offscreen/offscreen.html';
const STATE_KEY = 'liveaudioenhanced.state';
const IDLE = { status: 'off', tabId: null, title: '', videoId: null, url: null, icon: null, error: null };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- state --------------------------------------------------------------------------------

async function readState() {
  const r = await chrome.storage.session.get(STATE_KEY);
  return r[STATE_KEY] || { ...IDLE };
}

let chain = Promise.resolve();
function setState(patch) {
  chain = chain.catch(() => {}).then(async () => {
    const next = { ...(await readState()), ...patch };
    await chrome.storage.session.set({ [STATE_KEY]: next });
    updateBadge(next);
    chrome.runtime.sendMessage({ target: 'popup', type: 'state', state: next }).catch(() => {});
    return next;
  });
  return chain;
}

function updateBadge(s) {
  const map = {
    active: ['ON', '#22c55e'],
    initializing: ['...', '#f59e0b'],
    error: ['!', '#ef4444']
  };
  const [text, color] = map[s.status] || ['', '#000000'];
  chrome.action.setBadgeText({ text });
  if (text) chrome.action.setBadgeBackgroundColor({ color });
}

// ---- offscreen document -------------------------------------------------------------------

async function hasOffscreen() {
  const ctxs = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
  });
  return ctxs.length > 0;
}

let creating = null;
async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['USER_MEDIA'],
        justification: 'Process captured tab audio in real time with the Web Audio API.'
      })
      .finally(() => { creating = null; });
  }
  await creating;
}

async function closeOffscreen() {
  try {
    if (await hasOffscreen()) await chrome.offscreen.closeDocument();
  } catch { /* already closed */ }
}

// The offscreen page needs a moment to register its listener after creation.
async function sendToOffscreen(payload, retries = 25) {
  for (let i = 0; ; i++) {
    try {
      return await chrome.runtime.sendMessage({ target: 'offscreen', ...payload });
    } catch (e) {
      const retryable = /Receiving end does not exist|Could not establish connection/i.test(e?.message || '');
      if (!retryable || i >= retries) throw e;
      await sleep(60);
    }
  }
}

// ---- lifecycle ----------------------------------------------------------------------------

async function startCapture({ tabId, title, videoId, url, icon, streamId, settings }) {
  await setState({ status: 'initializing', tabId, title: title || '', videoId: videoId || null, url: url || null, icon: icon || null, error: null });
  try {
    if (!streamId) throw new Error('No capture stream id was provided.');
    await ensureOffscreen();
    const res = await sendToOffscreen({ type: 'start', streamId, settings });
    if (!res?.ok) throw new Error(res?.error || 'The audio engine did not start.');
    return { ok: true, state: await setState({ status: 'active', error: null }) };
  } catch (e) {
    const message = String(e?.message || e);
    await closeOffscreen();
    const state = await setState({ status: 'error', error: message, tabId: null, title: '', videoId: null, url: null, icon: null });
    return { ok: false, error: message, state };
  }
}

async function stopCapture() {
  try {
    if (await hasOffscreen()) await sendToOffscreen({ type: 'stop' }, 0);
  } catch { /* offscreen already gone */ }
  await closeOffscreen();
  return { ok: true, state: await setState({ ...IDLE }) };
}

async function reconcile() {
  const s = await readState();
  if (s.status === 'active' && !(await hasOffscreen())) return setState({ ...IDLE });
  return s;
}

// ---- messaging ----------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'background') return false;
  (async () => {
    switch (msg.type) {
      case 'get-state':
        return { ok: true, state: await reconcile() };
      case 'start':
        return startCapture(msg);
      case 'stop':
        return stopCapture();
      case 'status': {              // reported by the offscreen document
        await closeOffscreen();
        if (msg.status === 'error') {
          await setState({ status: 'error', error: msg.error || 'Audio error.', tabId: null, title: '', videoId: null, url: null, icon: null });
        } else {
          await setState({ ...IDLE });
        }
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown message: ${msg.type}` };
    }
  })().then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await readState();
  if ((s.status === 'active' || s.status === 'initializing') && s.tabId === tabId) await stopCapture();
});

// Capture is bound to the video that was playing when Start was pressed. If the tab navigates to a
// different video id (or to a non-video page such as the YouTube home page), capture stops.
// Same id with other URL parts (&t=, &list=, ...) keeps running.
// Exception: YouTube Shorts. Scrolling from one Short to the next changes the id, but like
// Facebook Reels or TikTok the capture keeps running and just follows the new Short.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && !changeInfo.title) return;
  const s = await readState();
  if (!(s.status === 'active' || s.status === 'initializing') || s.tabId !== tabId || !s.videoId) return;
  const inShorts = isYouTubeShort(s.url);

  if (changeInfo.url) {
    const newId = getYouTubeVideoId(changeInfo.url);
    if (newId === s.videoId) return;
    if (inShorts && isYouTubeShort(changeInfo.url)) {
      await setState({ videoId: newId, url: changeInfo.url, title: tab?.title || s.title, error: null });
      return;
    }
    await stopCapture();
    await setState({ error: 'Stopped: the tab moved to a different video. Press Start to enhance the new one.' });
    return;
  }

  // Title change only: keep the popup's title in sync while browsing Shorts.
  if (inShorts && changeInfo.title) await setState({ title: changeInfo.title });
});

// After a browser restart or extension reload no capture can be running.
chrome.runtime.onStartup.addListener(() => stopCapture());
chrome.runtime.onInstalled.addListener(() => stopCapture());
