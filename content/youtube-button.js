// Live Audio Enhanced: adds a button right before the settings (gear) button of the YouTube player
// while a video or livestream is open. The button opens the same control panel as the toolbar popup,
// shown inside the player (popup.html in an iframe).
(() => {
  'use strict';

  const BTN_ID = 'lae-player-btn';
  const PANEL_W = 340;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let btn = null;
  let panel = null;
  let frame = null;
  const PANEL_H = 396;
  let myTabId = null;
  let state = { status: 'off', tabId: null };
  let extOrigin = '';

  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const isVideoPage = () => location.pathname === '/watch' || location.pathname.startsWith('/live/');
  const player = () => document.getElementById('movie_player');

  // ---- button ---------------------------------------------------------------------------------
  function createButton() {
    const b = document.createElement('button');
    b.id = BTN_ID;
    b.type = 'button';
    b.className = 'ytp-button lae-btn';
    b.setAttribute('aria-label', 'Live Audio Enhanced');
    b.setAttribute('aria-haspopup', 'true');
    b.setAttribute('aria-expanded', 'false');
    b.title = 'Live Audio Enhanced';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 20');
    svg.setAttribute('aria-hidden', 'true');
    [[1, 8, 3, 6, 1.5], [6, 3, 3, 14, 1.5], [11, 0, 3, 20, 1.5], [16, 5, 3, 10, 1.5], [21, 8, 2.4, 5, 1.2]].forEach(([x, y, w, h, r]) => {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', w); rect.setAttribute('height', h);
      rect.setAttribute('rx', r);
      svg.appendChild(rect);
    });
    b.appendChild(svg);

    b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); togglePanel(); });
    b.addEventListener('dblclick', (e) => e.stopPropagation());
    return b;
  }

  function paintButton() {
    if (!btn) return;
    const mine = myTabId != null && state.tabId === myTabId;
    btn.classList.toggle('lae-on', mine && state.status === 'active');
    btn.classList.toggle('lae-busy', mine && state.status === 'initializing');
  }

  function ensureButton() {
    const existing = document.getElementById(BTN_ID);
    if (!isVideoPage()) {
      existing?.remove();
      closePanel();
      btn = null;
      return;
    }
    const gear = document.querySelector('#movie_player .ytp-settings-button');
    if (!gear || !gear.parentElement) return;
    btn = existing || btn || createButton();
    if (btn.parentElement !== gear.parentElement || btn.nextElementSibling !== gear) {
      gear.parentElement.insertBefore(btn, gear);
    }
    paintButton();
  }

  // ---- panel ----------------------------------------------------------------------------------
  function layout() {
    const p = player();
    if (!panel || !p) return;
    const bar = p.querySelector('.ytp-chrome-bottom');
    const bottom = (bar ? bar.offsetHeight : 48) + 12;
    const r = p.getBoundingClientRect();
    const scale = Math.min(1, (r.width - 24) / PANEL_W, (r.height - bottom - 12) / PANEL_H);
    panel.style.bottom = `${bottom}px`;
    panel.style.transform = scale < 1 ? `scale(${Math.max(scale, 0.4)})` : '';
  }

  function openPanel() {
    const p = player();
    if (!p || panel || !alive()) return;
    panel = document.createElement('div');
    panel.id = 'lae-player-panel';
    for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'contextmenu', 'keydown', 'keyup', 'wheel']) {
      panel.addEventListener(type, (e) => e.stopPropagation());
    }
    frame = document.createElement('iframe');
    frame.title = 'Live Audio Enhanced';
    frame.src = chrome.runtime.getURL('popup/popup.html');
    panel.appendChild(frame);
    p.appendChild(panel);
    btn?.setAttribute('aria-expanded', 'true');
    layout();
  }

  function closePanel() {
    if (!panel) return;
    panel.remove();   // removing the iframe also disconnects its meter port
    panel = null;
    frame = null;
    btn?.setAttribute('aria-expanded', 'false');
  }

  function togglePanel() { if (panel) closePanel(); else openPanel(); }

  window.addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== extOrigin) return;
    const d = e.data;
    if (!d || d.lae !== true) return;
    if (d.type === 'close') closePanel();
  });

  // Close when clicking anywhere else (clicks inside the iframe never reach this document).
  document.addEventListener('pointerdown', (e) => {
    if (!panel) return;
    if (panel.contains(e.target) || btn?.contains(e.target)) return;
    closePanel();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); }, true);
  window.addEventListener('resize', layout);
  document.addEventListener('fullscreenchange', () => setTimeout(layout, 100));

  // ---- keep the button in place (YouTube re-renders its controls) ------------------------------
  let timer = null;
  const schedule = () => { if (!timer) timer = setTimeout(() => { timer = null; ensureButton(); }, 250); };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  for (const ev of ['yt-navigate-finish', 'yt-page-data-updated', 'popstate']) window.addEventListener(ev, () => { closePanel(); schedule(); });

  // ---- in-page audio engine ---------------------------------------------------------------------
  // On YouTube the audio is processed right here, from the page's own <video> element, so no tab
  // capture (and no "click the toolbar icon first" permission) is needed.
  const url = (p) => chrome.runtime.getURL(p);
  let mods = null;
  let engine = null;
  let status = 'off';
  let lastError = null;
  let boundId = null;   // the video / livestream id processing was started on
  const ports = new Set();
  let meterTimer = null;

  const loadMods = () => (mods ||= Promise.all([import(url('audio/audio-engine.js')), import(url('shared/settings.js'))])
    .then(([a, b]) => ({ AudioEngine: a.AudioEngine, normalizeSettings: b.normalizeSettings })));

  function videoId() {
    const u = new URL(location.href);
    return u.pathname === '/watch' ? u.searchParams.get('v') : (u.pathname.match(/^\/live\/([^/?#]+)/) || [])[1] || null;
  }
  const title = () => document.title.replace(/^\(\d+\)\s*/, '');

  function snapshot() {
    const on = status === 'active' || status === 'initializing';
    return {
      status, error: lastError, tabId: on ? myTabId : null,
      title: on ? title() : '', videoId: on ? (boundId || videoId()) : null, url: on ? location.href : null, icon: on ? '/favicon.ico' : null
    };
  }

  function broadcast() {
    state = snapshot();
    paintButton();
    for (const p of ports) { try { p.postMessage({ type: 'state', state }); } catch { /* closed */ } }
    updateMeterTimer();
  }

  function updateMeterTimer() {
    const need = engine && status === 'active' && ports.size > 0;
    if (need && !meterTimer) {
      meterTimer = setInterval(() => {
        const data = engine?.getMeters();
        if (!data) return;
        for (const p of ports) { try { p.postMessage(data); } catch { /* closed */ } }
      }, 66);
    } else if (!need && meterTimer) { clearInterval(meterTimer); meterTimer = null; }
  }

  async function startEngine(settings) {
    const { AudioEngine, normalizeSettings } = await loadMods();
    if (engine) { engine.update(normalizeSettings(settings)); return; }
    const video = document.querySelector('#movie_player video') || document.querySelector('video');
    if (!video) throw new Error('No video was found on this page.');
    boundId = videoId();
    status = 'initializing'; lastError = null; broadcast();
    const eng = new AudioEngine({
      onError: (msg) => { engine = null; status = 'error'; lastError = msg; broadcast(); },
      onEnded: () => { engine = null; status = 'off'; broadcast(); }
    });
    engine = eng;
    try {
      await eng.start(video, normalizeSettings(settings));
      status = 'active';
    } catch (e) {
      await eng.stop().catch(() => {});   // reconnects the video to the speakers
      engine = null; boundId = null; status = 'error'; lastError = String(e?.message || e);
    }
    broadcast();
  }

  async function stopEngine() {
    const e = engine;
    engine = null; boundId = null;
    if (e) await e.stop().catch(() => {});
    status = 'off'; lastError = null;
    broadcast();
  }

  async function handle(m) {
    switch (m.cmd) {
      case 'get-state': return { ok: true, state: snapshot() };
      case 'start': await startEngine(m.settings); return { ok: status === 'active', error: lastError, state: snapshot() };
      case 'stop': await stopEngine(); return { ok: true, state: snapshot() };
      case 'settings': {
        if (engine) engine.update((await loadMods()).normalizeSettings(m.settings));
        return { ok: !!engine };
      }
      default: return { ok: false, error: `Unknown command: ${m.cmd}` };
    }
  }

  function listen() {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== 'lae-page') return;
      ports.add(port);
      port.onMessage.addListener(async (m) => {
        let res;
        try { res = await handle(m); } catch (e) { res = { ok: false, error: String(e?.message || e) }; }
        if (m.id) { try { port.postMessage({ id: m.id, ...res }); } catch { /* closed */ } }
      });
      port.onDisconnect.addListener(() => { void chrome.runtime.lastError; ports.delete(port); updateMeterTimer(); });
      try { port.postMessage({ type: 'state', state: snapshot() }); } catch { /* closed */ }
      updateMeterTimer();
    });
    chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
      if (msg?.lae === 'ping') sendResponse({ ok: true });
    });
    // Processing is bound to the video / livestream it was started on. Same id (e.g. &t= or a
    // reload) keeps running; a different id, or leaving the video page, stops it.
    const checkBound = async () => {
      if (!engine || !boundId) return;
      if (isVideoPage() && videoId() === boundId) { broadcast(); return; }
      await stopEngine();
      lastError = 'Stopped: the tab moved to a different video. Press Start to enhance the new one.';
      broadcast();
    };
    window.addEventListener('yt-navigate-finish', checkBound);
    window.addEventListener('popstate', () => setTimeout(checkBound, 300));
  }

  async function init() {
    if (!alive()) return;
    extOrigin = new URL(chrome.runtime.getURL('/')).origin;
    try {
      const t = await chrome.runtime.sendMessage({ target: 'background', type: 'get-tab' });
      myTabId = t?.tab?.id ?? null;
    } catch { /* service worker unavailable */ }
    listen();
    ensureButton();
  }
  init();
})();
