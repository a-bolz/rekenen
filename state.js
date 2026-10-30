// state.js
function load(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function makeKey(trackId, levelId, tier) {
  return `${trackId}:${levelId}:${tier}`;
}

export function initProgress(track) {
  const progress = load('progress') || {};
  const firstKey = makeKey(track.id, track.levels[0].id, track.speedTiers[0]);
  if (progress[firstKey] === undefined) {
    for (const level of track.levels)
      for (const tier of track.speedTiers)
        progress[makeKey(track.id, level.id, tier)] = 'locked';
    progress[firstKey] = 'available';
    save('progress', progress);
  }
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

export function getSettings() {
  return load('settings') || { mode: 'together', itemsPerSession: 20, track: 'tot10' };
}

export function saveSettings(settings) {
  save('settings', settings);
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
  for (const k of STATE_KEYS) if (data[k] !== undefined) save(k, data[k]);
  return true;
}
