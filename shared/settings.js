// Shared settings model: defaults, presets, validation and storage helpers.
// Imported by the popup (UI) and the offscreen document (audio engine).

export const STORAGE_KEY = 'liveaudioenhanced.settings.v1';
export const PRESET_ORDER = [
  'natural', 'balanced', 'music', 'vocal',
  'concert', 'band', 'acoustic', 'stadium', 'edm', 'karaoke',
  'custom'
];

export const PRESETS = {
  natural: {
    label: 'Natural',
    hint: 'Minimal processing',
    params: {
      enhancement: 20, stereoFocus: 0, harshness: 0, vocalCut: 0, crowdCut: 0, bassBoost: 0, stereoWidth: 0,
      eqGains: [0, 0, 0, 0, 0, 0, 0],
      comp: { threshold: -18, ratio: 1.5, attack: 20, release: 300, makeup: 0 }
    }
  },
  balanced: {
    label: 'Balanced',
    hint: 'Moderate music enhancement',
    params: {
      enhancement: 50, stereoFocus: 25, harshness: 0, vocalCut: 0, crowdCut: 0, bassBoost: 0, stereoWidth: 0,
      eqGains: [1, 1.5, -0.5, -1.5, 1, 2, 1.5],
      comp: { threshold: -24, ratio: 3, attack: 12, release: 250, makeup: 3 }
    }
  },
  music: {
    label: 'Music Focus',
    hint: 'Stronger stereo instrumental emphasis',
    params: {
      enhancement: 75, stereoFocus: 60, harshness: 10, vocalCut: 20, crowdCut: 0, bassBoost: 0, stereoWidth: 0,
      eqGains: [2, 2.5, -1, -3, 1.5, 3, 2.5],
      comp: { threshold: -28, ratio: 4, attack: 10, release: 220, makeup: 4 }
    }
  },
  vocal: {
    label: 'Vocal Friendly',
    hint: 'Keeps the voice clear and natural',
    params: {
      enhancement: 40, stereoFocus: 10, harshness: 15, vocalCut: 0, crowdCut: 0, bassBoost: 0, stereoWidth: 0,
      eqGains: [0.5, 1, 0, 1, 1.5, 1.5, 1],
      comp: { threshold: -22, ratio: 2.5, attack: 15, release: 280, makeup: 2 }
    }
  },
  concert: {
    label: 'Concert Hall',
    hint: 'Fuller, wider sound with the hall ambience tamed',
    params: {
      enhancement: 60, stereoFocus: 35, harshness: 10, vocalCut: 10, crowdCut: 30, bassBoost: 20, stereoWidth: 30,
      eqGains: [1.5, 2, -0.5, -1.5, 1, 2, 2],
      comp: { threshold: -26, ratio: 3.5, attack: 12, release: 250, makeup: 3 }
    }
  },
  band: {
    label: 'Live Band',
    hint: 'Punchy drums and guitars, clear instruments',
    params: {
      enhancement: 55, stereoFocus: 30, harshness: 10, vocalCut: 15, crowdCut: 20, bassBoost: 15, stereoWidth: 20,
      eqGains: [1, 2, -1, -2, 1.5, 2.5, 1.5],
      comp: { threshold: -25, ratio: 3.5, attack: 10, release: 220, makeup: 3 }
    }
  },
  acoustic: {
    label: 'Acoustic',
    hint: 'Gentle and natural for guitar, piano and quiet sets',
    params: {
      enhancement: 45, stereoFocus: 15, harshness: 15, vocalCut: 0, crowdCut: 25, bassBoost: 0, stereoWidth: 15,
      eqGains: [0, 0.5, 0, 0.5, 1.5, 2, 2],
      comp: { threshold: -22, ratio: 2, attack: 18, release: 300, makeup: 2 }
    }
  },
  stadium: {
    label: 'Stadium',
    hint: 'Strong crowd and echo reduction for big venues',
    params: {
      enhancement: 70, stereoFocus: 40, harshness: 20, vocalCut: 25, crowdCut: 60, bassBoost: 25, stereoWidth: 40,
      eqGains: [1, 1.5, -1, -1.5, 1, 2, 2],
      comp: { threshold: -28, ratio: 4, attack: 10, release: 220, makeup: 4 }
    }
  },
  edm: {
    label: 'EDM / Bass',
    hint: 'Heavy bass and a wide stereo image',
    params: {
      enhancement: 60, stereoFocus: 20, harshness: 5, vocalCut: 0, crowdCut: 10, bassBoost: 55, stereoWidth: 50,
      eqGains: [3, 3, -1, -1, 0, 2.5, 3],
      comp: { threshold: -22, ratio: 4, attack: 8, release: 150, makeup: 3 }
    }
  },
  karaoke: {
    label: 'Karaoke',
    hint: 'Pushes the original voice back as far as possible',
    params: {
      enhancement: 85, stereoFocus: 80, harshness: 10, vocalCut: 70, crowdCut: 30, bassBoost: 20, stereoWidth: 30,
      eqGains: [2, 2.5, -1.5, -3.5, 1, 3, 2.5],
      comp: { threshold: -28, ratio: 4, attack: 10, release: 220, makeup: 4 }
    }
  },
  custom: { label: 'Custom', hint: 'Your own settings', params: null }
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export const DEFAULT_SETTINGS = {
  version: 1,
  preset: 'balanced',
  enabled: true,        // false = bypass (original audio passes through)
  volume: 100,          // percent, 0..150
  muted: false,
  eqEnabled: true,
  compEnabled: true,
  ...clone(PRESETS.balanced.params),
  custom: clone(PRESETS.balanced.params),
  userPresets: [],      // presets saved by the user: {id, name, params}
  userPresetId: null    // saved preset last loaded (target of the Update button)
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, lo, hi, def) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : def);
const bool = (v, def) => (typeof v === 'boolean' ? v : def);

function normalizeParams(src, fb) {
  const s = src && typeof src === 'object' ? src : {};
  const c = s.comp && typeof s.comp === 'object' ? s.comp : {};
  const eq = Array.isArray(s.eqGains) ? s.eqGains : [];
  return {
    enhancement: num(s.enhancement, 0, 100, fb.enhancement),
    stereoFocus: num(s.stereoFocus, 0, 100, fb.stereoFocus),
    harshness: num(s.harshness, 0, 100, fb.harshness),
    vocalCut: num(s.vocalCut, 0, 100, fb.vocalCut ?? 0),
    crowdCut: num(s.crowdCut, 0, 100, fb.crowdCut ?? 0),
    bassBoost: num(s.bassBoost, 0, 100, fb.bassBoost ?? 0),
    stereoWidth: num(s.stereoWidth, 0, 100, fb.stereoWidth ?? 0),
    eqGains: fb.eqGains.map((d, i) => num(eq[i], -12, 12, d)),
    comp: {
      threshold: num(c.threshold, -60, 0, fb.comp.threshold),
      ratio: num(c.ratio, 1, 12, fb.comp.ratio),
      attack: num(c.attack, 1, 100, fb.comp.attack),
      release: num(c.release, 50, 1000, fb.comp.release),
      makeup: num(c.makeup, 0, 12, fb.comp.makeup)
    }
  };
}

export const MAX_USER_PRESETS = 30;
const FALLBACK = PRESETS.balanced.params;
const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

function normalizeUserPresets(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const p of list) {
    if (!p || typeof p !== 'object' || typeof p.name !== 'string') continue;
    const name = p.name.trim().slice(0, 32);
    if (!name) continue;
    let id = typeof p.id === 'string' && /^[a-z0-9]{4,20}$/i.test(p.id) ? p.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    out.push({ id, name, params: normalizeParams(p.params, FALLBACK) });
    if (out.length >= MAX_USER_PRESETS) break;
  }
  return out;
}

/** Validate arbitrary input and return a complete, safe settings object. */
export function normalizeSettings(raw) {
  const d = clone(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== 'object') return d;
  const userPresets = normalizeUserPresets(raw.userPresets);
  const ids = new Set(userPresets.map((u) => u.id));
  let preset = typeof raw.preset === 'string' ? raw.preset : d.preset;
  if (preset.startsWith('user:')) {
    if (!ids.has(preset.slice(5))) preset = 'custom';
  } else if (!PRESET_ORDER.includes(preset)) {
    preset = d.preset;
  }
  return {
    version: 1,
    preset,
    userPresets,
    userPresetId: typeof raw.userPresetId === 'string' && ids.has(raw.userPresetId) ? raw.userPresetId : null,
    enabled: bool(raw.enabled, d.enabled),
    volume: num(raw.volume, 0, 150, d.volume),
    muted: bool(raw.muted, d.muted),
    eqEnabled: bool(raw.eqEnabled, d.eqEnabled),
    compEnabled: bool(raw.compEnabled, d.compEnabled),
    ...normalizeParams(raw, d),
    custom: normalizeParams(raw.custom, d.custom)
  };
}

/** The part of the settings that presets control. */
export function paramsOf(s) {
  return clone({
    enhancement: s.enhancement, stereoFocus: s.stereoFocus, harshness: s.harshness, vocalCut: s.vocalCut,
    crowdCut: s.crowdCut, bassBoost: s.bassBoost, stereoWidth: s.stereoWidth,
    eqGains: s.eqGains, comp: s.comp
  });
}

/** Returns a new settings object with the preset applied (volume/mute/toggles are kept). */
export function selectPreset(s, id) {
  const next = clone(s);
  let params;
  let userId = null;
  if (id === 'custom') {
    params = next.custom;
  } else if (id.startsWith('user:')) {
    const u = userPresetById(next, id.slice(5));
    if (!u) return next;
    params = u.params;
    userId = u.id;
  } else {
    params = PRESETS[id]?.params;
  }
  if (!params) return next;
  Object.assign(next, clone(params));
  next.preset = id;
  if (id !== 'custom') next.userPresetId = userId;
  return next;
}

export function userPresetById(s, id) {
  return s.userPresets.find((u) => u.id === id) || null;
}

/** Mutates s: saves the current values as a new named preset and selects it. */
export function saveUserPreset(s, name) {
  const n = String(name || '').trim().slice(0, 32);
  if (!n) throw new Error('Type a name for the preset first.');
  if (s.userPresets.length >= MAX_USER_PRESETS) throw new Error(`You can keep up to ${MAX_USER_PRESETS} saved presets.`);
  if (s.userPresets.some((u) => u.name.toLowerCase() === n.toLowerCase())) {
    throw new Error('A preset with that name already exists. Choose another name, or load it and press Update.');
  }
  const u = { id: newId(), name: n, params: paramsOf(s) };
  s.userPresets.push(u);
  s.preset = `user:${u.id}`;
  s.userPresetId = u.id;
  return u;
}

/** Mutates s: overwrites the last loaded saved preset with the current values. */
export function updateUserPreset(s) {
  const u = userPresetById(s, s.userPresetId);
  if (!u) throw new Error('Load one of your saved presets first, then press Update.');
  u.params = paramsOf(s);
  s.preset = `user:${u.id}`;
  return u;
}

/** Mutates s: removes a saved preset. */
export function deleteUserPreset(s, id) {
  const i = s.userPresets.findIndex((u) => u.id === id);
  if (i < 0) throw new Error('That preset no longer exists.');
  const [u] = s.userPresets.splice(i, 1);
  if (s.userPresetId === id) s.userPresetId = null;
  if (s.preset === `user:${id}`) s.preset = 'custom';
  return u;
}

export function exportUserPresets(s) {
  return JSON.stringify(
    { liveaudioenhanced: 1, presets: s.userPresets.map(({ name, params }) => ({ name, params })) },
    null, 2
  );
}

/** Mutates s: adds presets from exported text. Returns how many were added. */
export function importUserPresets(s, text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That text is not valid JSON.'); }
  const list = Array.isArray(data) ? data : data?.presets;
  if (!Array.isArray(list)) throw new Error('No presets were found in that text.');
  let added = 0;
  for (const item of list) {
    if (s.userPresets.length >= MAX_USER_PRESETS) break;
    if (!item || typeof item.name !== 'string') continue;
    const name = item.name.trim().slice(0, 32);
    if (!name) continue;
    let unique = name;
    let k = 2;
    while (s.userPresets.some((u) => u.name.toLowerCase() === unique.toLowerCase())) {
      unique = `${name.slice(0, 28)} ${k++}`;
    }
    s.userPresets.push({ id: newId(), name: unique, params: normalizeParams(item.params, FALLBACK) });
    added++;
  }
  if (!added) throw new Error('No valid presets were found in that text.');
  return added;
}

/** Mutates settings: the user changed a preset-controlled value, so switch to Custom. */
export function markCustom(s) {
  s.preset = 'custom';
  s.custom = paramsOf(s);
  return s;
}

export async function loadSettings() {
  try {
    const r = await chrome.storage.local.get(STORAGE_KEY);
    return normalizeSettings(r[STORAGE_KEY]);
  } catch (e) {
    console.warn('Live Audio Enhanced: could not load settings', e);
    return clone(DEFAULT_SETTINGS);
  }
}

export async function saveSettings(s) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: s });
  } catch (e) {
    console.warn('Live Audio Enhanced: could not save settings', e);
  }
}
