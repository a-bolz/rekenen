// state.js

// Flitsen lives on the same origin (a-bolz.github.io) and uses the bare
// key names — the prefix keeps the two apps from corrupting each other.
const NS = 'rekenen:';

function load(key) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(key, data) {
  localStorage.setItem(NS + key, JSON.stringify(data));
}

export function makeKey(trackId, levelId, tier) {
  return `${trackId}:${levelId}:${tier}`;
}

export function initProgress(track) {
  const progress = load('progress') || {};
  let changed = false;

  // Backfill cells for levels/tiers added after the track was first run
  for (const level of track.levels)
    for (const tier of track.speedTiers) {
      const key = makeKey(track.id, level.id, tier);
      if (progress[key] === undefined) {
        progress[key] = 'locked';
        changed = true;
      }
    }

  // Fresh track: open the first cell
  const anyActive = track.levels.some(l => track.speedTiers.some(t => {
    const s = progress[makeKey(track.id, l.id, t)];
    return s === 'available' || s === 'completed';
  }));
  if (!anyActive) {
    progress[makeKey(track.id, track.levels[0].id, track.speedTiers[0])] = 'available';
    changed = true;
  }

  // Repair pass: backfilled cells never saw completeCell's cascade, so
  // unlock any locked cell whose unlock condition is already met.
  for (const level of track.levels)
    for (let ti = 1; ti < track.speedTiers.length; ti++) {
      const slower = progress[makeKey(track.id, level.id, track.speedTiers[ti - 1])];
      const key = makeKey(track.id, level.id, track.speedTiers[ti]);
      if (slower === 'completed' && progress[key] === 'locked') {
        progress[key] = 'available';
        changed = true;
      }
    }
  for (let li = 1; li < track.levels.length; li++)
    for (const tier of track.speedTiers) {
      const prev = progress[makeKey(track.id, track.levels[li - 1].id, tier)];
      const key = makeKey(track.id, track.levels[li].id, tier);
      if (prev === 'completed' && progress[key] === 'locked') {
        progress[key] = 'available';
        changed = true;
      }
    }

  if (changed) save('progress', progress);
  return progress;
}

export function completeCell(track, levelId, tier) {
  const progress = load('progress') || {};
  const tierIdx = track.speedTiers.indexOf(tier);

  for (let i = 0; i <= tierIdx; i++)
    progress[makeKey(track.id, levelId, track.speedTiers[i])] = 'completed';

  if (tierIdx < track.speedTiers.length - 1) {
    const right = makeKey(track.id, levelId, track.speedTiers[tierIdx + 1]);
    if (progress[right] === 'locked') progress[right] = 'available';
  }

  const levelIdx = track.levels.findIndex(l => l.id === levelId);
  if (levelIdx >= 0 && levelIdx < track.levels.length - 1) {
    const nextLevelId = track.levels[levelIdx + 1].id;
    for (let i = 0; i <= tierIdx; i++) {
      const down = makeKey(track.id, nextLevelId, track.speedTiers[i]);
      if (progress[down] === 'locked') progress[down] = 'available';
    }
  }

  save('progress', progress);
  return progress;
}

export function nextCell(track) {
  const progress = load('progress') || {};
  for (const level of track.levels)
    for (const tier of track.speedTiers)
      if (progress[makeKey(track.id, level.id, tier)] === 'available')
        return { level: level.id, tier };
  return null;
}

const EMPTY_STATS = { attempts: 0, correct: 0, totalTime: 0, focused: false };

export function getFactStats(key) {
  const all = load('factStats') || {};
  return all[key] || { ...EMPTY_STATS };
}

export function updateFactStats(key, result) {
  const all = load('factStats') || {};
  const stats = all[key] || { ...EMPTY_STATS };
  stats.attempts += 1;
  if (result.correct) {
    stats.correct += 1;
    stats.totalTime += result.time;
  }
  all[key] = stats;
  save('factStats', all);
  return stats;
}

export function toggleFocus(key) {
  const all = load('factStats') || {};
  const stats = all[key] || { ...EMPTY_STATS };
  stats.focused = !stats.focused;
  all[key] = stats;
  save('factStats', all);
  return stats;
}

const DEFAULT_SETTINGS = { mode: 'together', itemsPerSession: 20, track: 'tot10' };

export function getSettings() {
  // Merge per-field so a foreign or outdated settings object can never
  // produce undefined fields (which would silently break sessions).
  const settings = { ...DEFAULT_SETTINGS, ...(load('settings') || {}) };
  if (!Number.isFinite(settings.itemsPerSession)
    || settings.itemsPerSession < 5 || settings.itemsPerSession > 50) {
    settings.itemsPerSession = DEFAULT_SETTINGS.itemsPerSession;
  }
  return settings;
}

export function saveSettings(settings) {
  save('settings', settings);
}

export function getLastErrors() {
  const v = load('lastErrors');
  return new Set(Array.isArray(v) ? v : []);
}

export function saveLastErrors(keys) {
  save('lastErrors', [...keys]);
}

const STATE_KEYS = ['progress', 'factStats', 'settings', 'lastErrors'];

export function exportState() {
  const out = {};
  for (const k of STATE_KEYS) {
    const v = load(k);
    if (v !== null) out[k] = v;
  }
  return JSON.stringify(out);
}

export function importState(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return false;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  for (const k of STATE_KEYS) {
    const v = data[k];
    if (v === undefined) continue;
    if (k === 'lastErrors' && !Array.isArray(v)) continue;
    if (k !== 'lastErrors' && (typeof v !== 'object' || v === null || Array.isArray(v))) continue;
    save(k, v);
  }
  return true;
}
