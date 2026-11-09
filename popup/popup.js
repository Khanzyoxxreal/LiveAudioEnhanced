import { getYouTubeVideoId } from '../shared/youtube.js';
import { EQ_BANDS } from '../audio/equalizer.js';
import {
  PRESET_ORDER, PRESETS, DEFAULT_SETTINGS,
  loadSettings, saveSettings, selectPreset, markCustom,
  saveUserPreset, updateUserPreset, deleteUserPreset, exportUserPresets, importUserPresets, userPresetById
} from '../shared/settings.js';

const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));

let settings = clone(DEFAULT_SETTINGS);
let state = { status: 'off', tabId: null, title: '', videoId: null, error: null };
let currentTab = null;
let port = null;
let saveTimer = null;
let pushQueued = false;

// ---- slider definitions ---------------------------------------------------------------------
const sign = (v) => (v > 0 ? '+' : '');
const SLIDERS = [
  { id: 'enhancement', get: (s) => s.enhancement, set: (s, v) => { s.enhancement = v; }, fmt: (v) => `${v}%`, custom: true },
  { id: 'stereoFocus', get: (s) => s.stereoFocus, set: (s, v) => { s.stereoFocus = v; }, fmt: (v) => `${v}%`, custom: true },
  { id: 'vocalCut', get: (s) => s.vocalCut, set: (s, v) => { s.vocalCut = v; }, fmt: (v) => `${v}%`, custom: true },
  { id: 'crowdCut', get: (s) => s.crowdCut, set: (s, v) => { s.crowdCut = v; }, fmt: (v) => `${v}%`, custom: true },
  { id: 'bassBoost', get: (s) => s.bassBoost, set: (s, v) => { s.bassBoost = v; }, fmt: (v) => `${v}%`, custom: true },
  { id: 'stereoWidth', get: (s) => s.stereoWidth, set: (s, v) => { s.stereoWidth = v; }, fmt: (v) => `${v}%`, custom: true },
  { id: 'harshness', get: (s) => s.harshness, set: (s, v) => { s.harshness = v; }, fmt: (v) => `${v}%`, custom: true },
  { id: 'volume', get: (s) => s.volume, set: (s, v) => { s.volume = v; }, fmt: (v) => `${v}%`, custom: false },
  { id: 'threshold', get: (s) => s.comp.threshold, set: (s, v) => { s.comp.threshold = v; }, fmt: (v) => `${v} dB`, custom: true },
  { id: 'ratio', get: (s) => s.comp.ratio, set: (s, v) => { s.comp.ratio = v; }, fmt: (v) => `${v}:1`, custom: true },
  { id: 'attack', get: (s) => s.comp.attack, set: (s, v) => { s.comp.attack = v; }, fmt: (v) => `${v} ms`, custom: true },
  { id: 'release', get: (s) => s.comp.release, set: (s, v) => { s.comp.release = v; }, fmt: (v) => `${v} ms`, custom: true },
  { id: 'makeup', get: (s) => s.comp.makeup, set: (s, v) => { s.comp.makeup = v; }, fmt: (v) => `+${v} dB`, custom: true }
];

const fmtHz = (f) => (f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`);

const fmtHzShort = (f) => (f >= 1000 ? `${f / 1000}kHz` : `${f}Hz`);

function buildEqRows() {
  const host = $('eqBands');
  EQ_BANDS.forEach((band, i) => {
    const col = document.createElement('div');
    col.className = 'eq-band';
    const val = document.createElement('span');
    val.className = 'eq-val';
    val.id = `eq-${i}-val`;
    const slot = document.createElement('div');
    slot.className = 'eq-slot';
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `eq-${i}`;
    input.min = '-12';
    input.max = '12';
    input.step = '0.5';
    input.title = band.label;
    input.setAttribute('aria-label', `${band.label} ${fmtHz(band.freq)}`);
    slot.appendChild(input);
    const hz = document.createElement('span');
    hz.className = 'eq-hz';
    hz.textContent = fmtHzShort(band.freq);
    col.append(val, slot, hz);
    host.appendChild(col);
    SLIDERS.push({
      id: `eq-${i}`,
      get: (s) => s.eqGains[i],
      set: (s, v) => { s.eqGains[i] = v; },
      fmt: (v) => `${sign(v)}${v.toFixed(v % 1 ? 1 : 0)}`,
      custom: true,
      bipolar: true
    });
  });
}

function buildPresetSelect() {
  $('presetSelect').addEventListener('change', (e) => {
    settings = selectPreset(settings, e.target.value);
    presetMessage('');
    renderAll();
    changed();
  });
}

function fillPresetSelect() {
  const sel = $('presetSelect');
  sel.textContent = '';
  const add = (parent, value, label) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    parent.appendChild(o);
  };
  for (const id of PRESET_ORDER) add(sel, id, PRESETS[id].label);
  if (settings.userPresets.length) {
    const g = document.createElement('optgroup');
    g.label = 'My presets';
    for (const u of settings.userPresets) add(g, `user:${u.id}`, u.name);
    sel.appendChild(g);
  }
  sel.value = settings.preset;
}

// ---- rendering ------------------------------------------------------------------------------
function renderSlider(def) {
  const el = $(def.id);
  const v = def.get(settings);
  el.value = String(v);
  const pct = ((v - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100;
  const a = def.bipolar ? Math.min(50, pct) : 0;
  const b = def.bipolar ? Math.max(50, pct) : pct;
  el.style.setProperty('--a', `${a}%`);
  el.style.setProperty('--pct', `${b}%`);
  $(`${def.id}-val`).textContent = def.fmt(v);
}

function renderPresets() {
  const sel = $('presetSelect');
  if (sel.value !== settings.preset) sel.value = settings.preset;
  $('presetHint').textContent = presetHint();
}

function presetHint() {
  const id = settings.preset;
  if (id.startsWith('user:')) {
    const u = userPresetById(settings, id.slice(5));
    return u ? `Saved preset: ${u.name}` : '';
  }
  if (id === 'custom' && settings.userPresetId) {
    const u = userPresetById(settings, settings.userPresetId);
    if (u) return `Edited from "${u.name}". Press Update to keep the changes.`;
  }
  return PRESETS[id]?.hint || '';
}

function renderUserPresets() {
  fillPresetSelect();
  $('presetUpdate').disabled = !settings.userPresetId;
  $('presetDelete').disabled = !settings.userPresetId;
  $('presetExport').disabled = !settings.userPresets.length;
}

function presetMessage(text, isError = false) {
  const el = $('presetMsg');
  el.textContent = text;
  el.classList.toggle('err', isError);
}

function publicSettings() {
  const { userPresets, ...rest } = settings;   // the audio engine does not need the saved list
  return rest;
}

function renderToggles() {
  $('enabled').checked = settings.enabled;
  $('eqEnabled').checked = settings.eqEnabled;
  $('compEnabled').checked = settings.compEnabled;
  $('eqFold').classList.toggle('off', !settings.eqEnabled);
  $('compFold').classList.toggle('off', !settings.compEnabled);
  const m = $('mute');
  m.setAttribute('aria-pressed', String(settings.muted));
  m.title = settings.muted ? 'Unmute' : 'Mute';
  m.setAttribute('aria-label', m.title);
}

function renderAll() {
  SLIDERS.forEach(renderSlider);
  renderPresets();
  renderUserPresets();
  renderToggles();
}

const SITES = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'YouTube'], [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)instagram\.com$/, 'Instagram'], [/(^|\.)facebook\.com$|(^|\.)fb\.watch$/, 'Facebook'],
  [/(^|\.)twitch\.tv$/, 'Twitch'], [/(^|\.)x\.com$|(^|\.)twitter\.com$/, 'X']
];

function siteName(url) {
  try {
    const host = new URL(url).hostname;
    for (const [re, name] of SITES) if (re.test(host)) return name;
    return host.replace(/^www\./, '') || '-';
  } catch { return '-'; }
}

function setThumb({ videoId, url, title, icon }) {
  const img = $('thumbImg');
  const fav = $('favImg');
  const clean = (title || '').replace(/\s*[-|]\s*YouTube\s*$/i, '').trim();
  $('thumbTitle').textContent = clean || 'Open a video or livestream';
  $('thumbTitle').title = clean;
  const site = siteName(url);
  $('siteName').textContent = site;
  $('favLetter').textContent = site && site !== '-' ? site[0].toUpperCase() : '';
  const src = videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : '';
  if (img.dataset.src !== src) {
    img.dataset.src = src;
    img.hidden = true;
    if (src) {
      img.onload = () => { img.hidden = false; };
      img.onerror = () => { img.hidden = true; };
      img.src = src;
    } else {
      img.removeAttribute('src');
    }
  }
  const iconSrc = icon && /^(https?:|data:)/i.test(icon) ? icon : '';
  if (fav.dataset.src !== iconSrc) {
    fav.dataset.src = iconSrc;
    fav.hidden = !iconSrc;
    fav.onerror = () => { fav.hidden = true; };
    if (iconSrc) fav.src = iconSrc; else fav.removeAttribute('src');
  }
  $('favLetter').hidden = !!iconSrc && !fav.hidden;
}

function renderState() {
  const s = state.status;
  const active = s === 'active';
  $('statusCard').className = `now s-${s}`;
  $('statusTitle').textContent = { off: 'Ready', initializing: 'Starting', active: 'Enhancing', error: 'Error' }[s] || 'Ready';

  const power = $('power');
  power.disabled = s === 'initializing';
  power.classList.toggle('on', active);
  $('powerLabel').textContent = active ? 'Stop' : s === 'initializing' ? 'Starting...' : 'Start';
  power.setAttribute('aria-label', active ? 'Stop Live Audio Enhanced' : 'Start Live Audio Enhanced');

  if (active) {
    setThumb({ videoId: state.videoId, url: state.url, title: state.title, icon: state.icon });
  } else {
    setThumb({
      videoId: getYouTubeVideoId(currentTab?.url),
      url: currentTab?.url,
      title: currentTab?.title,
      icon: currentTab?.favIconUrl
    });
  }

  $('switchTab').hidden = !(active && currentTab?.id != null && currentTab.id !== state.tabId);

  const err = $('errorBox');
  err.hidden = !state.error;
  err.textContent = state.error || '';

  if (active) connectMeters();
  else { disconnectMeters(); resetMeters(); }
}

function applyState(next) {
  state = { ...state, ...next };
  renderState();
}

// ---- settings changes -----------------------------------------------------------------------
function changed() {
  scheduleSave();
  schedulePush();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSettings(settings), 250);
}

function schedulePush() {
  if (pushQueued) return;
  pushQueued = true;
  requestAnimationFrame(() => {
    pushQueued = false;
    if (state.status === 'active') {
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'settings', settings: publicSettings() }).catch(() => {});
    }
  });
}

function bindControls() {
  for (const def of SLIDERS) {
    const el = $(def.id);
    el.addEventListener('input', () => {
      def.set(settings, Number(el.value));
      if (def.custom) { markCustom(settings); renderPresets(); }
      renderSlider(def);
      changed();
    });
  }
  for (const key of ['enabled', 'eqEnabled', 'compEnabled']) {
    $(key).addEventListener('change', (e) => {
      settings[key] = e.target.checked;
      renderToggles();
      changed();
    });
  }
  $('mute').addEventListener('click', () => {
    settings.muted = !settings.muted;
    renderToggles();
    changed();
  });
  $('reset').addEventListener('click', () => {
    settings = { ...clone(DEFAULT_SETTINGS), userPresets: settings.userPresets };
    renderAll();
    saveSettings(settings);
    schedulePush();
  });
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((o) => {
      const on = o === t;
      o.classList.toggle('on', on);
      o.setAttribute('aria-selected', String(on));
      $(`tab-${o.dataset.tab}`).hidden = !on;
    });
  }));
  $('closeBtn').addEventListener('click', () => window.close());
  $('power').addEventListener('click', () => (state.status === 'active' ? stop() : start()));
  $('switchTab').addEventListener('click', start);
}

// ---- saved presets --------------------------------------------------------------------------
let deleteArmed = null;

function bindUserPresets() {
  const guard = (fn) => () => {
    try { fn(); } catch (e) { presetMessage(e.message, true); }
  };

  const save = guard(() => {
    const u = saveUserPreset(settings, $('presetName').value);
    $('presetName').value = '';
    renderAll();
    presetMessage(`Saved "${u.name}".`);
    changed();
  });
  $('presetSave').addEventListener('click', save);
  $('presetName').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

  $('presetUpdate').addEventListener('click', guard(() => {
    const u = updateUserPreset(settings);
    renderAll();
    presetMessage(`Updated "${u.name}".`);
    changed();
  }));

  $('presetDelete').addEventListener('click', guard(() => {
    const btn = $('presetDelete');
    if (!deleteArmed) {
      btn.textContent = 'Confirm delete';
      btn.classList.add('armed');
      deleteArmed = setTimeout(() => {
        deleteArmed = null;
        btn.textContent = 'Delete';
        btn.classList.remove('armed');
      }, 3000);
      return;
    }
    clearTimeout(deleteArmed);
    deleteArmed = null;
    btn.textContent = 'Delete';
    btn.classList.remove('armed');
    const u = deleteUserPreset(settings, settings.userPresetId);
    renderAll();
    presetMessage(`Deleted "${u.name}".`);
    changed();
  }));

  $('presetExport').addEventListener('click', async () => {
    const text = exportUserPresets(settings);
    $('shareBox').value = text;
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch { /* clipboard blocked */ }
    presetMessage(copied ? 'Exported and copied to the clipboard.' : 'Exported below. Select the text and copy it.');
  });

  $('presetImport').addEventListener('click', guard(() => {
    const n = importUserPresets(settings, $('shareBox').value);
    renderAll();
    presetMessage(`Imported ${n} preset${n === 1 ? '' : 's'}.`);
    changed();
  }));
}

// ---- capture control ------------------------------------------------------------------------
const send = (msg) => chrome.runtime.sendMessage({ target: 'background', ...msg });

function explain(e) {
  const m = String(e?.message || e);
  if (/activeTab|invoked|permission/i.test(m)) {
    return 'Chrome has not allowed capture for this tab yet. Click the Live Audio Enhanced icon while the tab you want is open and try again.';
  }
  if (/active stream/i.test(m)) {
    return 'This tab is already being captured. Stop Live Audio Enhanced first, then start it again.';
  }
  return m;
}

async function start() {
  const wasActive = state.status === 'active';
  const prevTabId = state.tabId;
  applyState({ status: 'initializing', error: null });
  try {
    const tab = currentTab;
    if (!tab || tab.id == null) throw new Error('No active tab was found.');
    if (/^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(tab.url || '')) {
      throw new Error('Browser pages cannot be captured. Open a normal web page and try again.');
    }
    // YouTube videos are bound to their id; every other site (TikTok, Instagram, Facebook, ...)
    // simply runs until you press Stop or close the tab.
    const videoId = getYouTubeVideoId(tab.url);
    if (wasActive && prevTabId !== tab.id) await send({ type: 'stop' });
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    const res = await send({
      type: 'start',
      tabId: tab.id,
      title: tab.title || tab.url || `Tab ${tab.id}`,
      videoId,
      url: tab.url || '',
      icon: tab.favIconUrl || '',
      streamId,
      settings: publicSettings()
    });
    if (!res?.ok) throw new Error(res?.error || 'Live Audio Enhanced could not start.');
    applyState(res.state);
  } catch (e) {
    applyState({ status: 'error', error: explain(e), tabId: null, title: '', videoId: null, url: null, icon: null });
  }
}

async function stop() {
  try {
    const res = await send({ type: 'stop' });
    applyState(res?.state || { status: 'off', tabId: null, title: '', error: null });
  } catch (e) {
    applyState({ status: 'error', error: explain(e) });
  }
}

// ---- meters ---------------------------------------------------------------------------------
const holds = { in: -100, out: -100 };

function connectMeters() {
  if (port) return;
  try {
    port = chrome.runtime.connect({ name: 'liveaudioenhanced-meters' });
  } catch { port = null; return; }
  port.onMessage.addListener(renderMeters);
  port.onDisconnect.addListener(() => { void chrome.runtime.lastError; port = null; });
}

function disconnectMeters() {
  if (!port) return;
  try { port.disconnect(); } catch { /* ignore */ }
  port = null;
}

const dbToPct = (db) => Math.min(1, Math.max(0, (db + 60) / 60));
const fmtDb = (db) => (db <= -99 ? '-inf' : `${db.toFixed(1)} dB`);

function paintMeter(key, m) {
  holds[key] = m.peakDb > holds[key] ? m.peakDb : Math.max(m.peakDb, holds[key] - 1.2);
  $(`${key}Fill`).style.transform = `scaleX(${dbToPct(m.rmsDb)})`;
  $(`${key}Hold`).style.left = `calc(${dbToPct(holds[key]) * 100}% - 2px)`;
  $(`${key}Db`).textContent = fmtDb(m.peakDb);
}

// ---- spectrum -------------------------------------------------------------------------------
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const MINI_BARS = 32;

function miniBars(arr) {
  // fold the 32 analyser bars into MINI_BARS groups (max of each group)
  const out = new Array(MINI_BARS).fill(0);
  if (!arr) return out;
  const per = arr.length / MINI_BARS;
  for (let i = 0; i < MINI_BARS; i++) {
    let m = 0;
    for (let k = Math.floor(i * per); k < Math.floor((i + 1) * per); k++) m = Math.max(m, arr[k] || 0);
    out[i] = m;
  }
  return out;
}

function drawSpectrum(spec) {
  const c = $('spectrum');
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const idle = !spec;
  const out = idle ? Array.from({ length: MINI_BARS }, (_, i) => 0.18 + 0.1 * Math.sin(i * 0.9)) : miniBars(spec.output);
  const inn = idle ? null : miniBars(spec.input);
  const gap = 2;
  const bw = (w - gap * (MINI_BARS - 1)) / MINI_BARS;
  const grad = '#ff7a50';
  const draw = (arr, fill, alpha) => {
    g.fillStyle = fill;
    g.globalAlpha = alpha;
    for (let i = 0; i < MINI_BARS; i++) {
      const bh = Math.max(2, arr[i] * (h - 2));
      g.beginPath();
      g.roundRect(i * (bw + gap), h - bh, bw, bh, Math.min(bw / 2, 2));
      g.fill();
    }
    g.globalAlpha = 1;
  };
  if (inn) draw(inn, '#ffffff', 0.16);
  draw(out, grad, idle ? 0.3 : 1);
}

function renderMeters(data) {
  if (data?.type !== 'meters') return;
  drawSpectrum(data.spectrum);
  paintMeter('in', data.input);
  paintMeter('out', data.output);
  $('clip').classList.toggle('on', data.output.clipped);
  $('monoNote').hidden = !data.mono;
}

function resetMeters() {
  holds.in = holds.out = -100;
  for (const key of ['in', 'out']) {
    $(`${key}Fill`).style.transform = 'scaleX(0)';
    $(`${key}Hold`).style.left = '0';
    $(`${key}Db`).textContent = '-inf';
  }
  $('clip').classList.remove('on');
  drawSpectrum(null);
}

// ---- init -----------------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target === 'popup' && msg.type === 'state') applyState(msg.state);
});

async function init() {
  buildEqRows();
  buildPresetSelect();
  bindControls();
  bindUserPresets();
  settings = await loadSettings();
  renderAll();

  try {
    [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch { currentTab = null; }

  try {
    const res = await send({ type: 'get-state' });
    if (res?.state) state = { ...state, ...res.state };
  } catch { /* service worker unavailable: stay OFF */ }
  try { $('version').textContent = `v${chrome.runtime.getManifest().version}`; } catch { /* ignore */ }
  renderState();
  drawSpectrum(null);
}

init();
