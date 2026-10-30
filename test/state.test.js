// test/state.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { store = {}; },
};

const {
  makeKey, initProgress, completeCell, nextCell,
  getFactStats, updateFactStats, toggleFocus,
  getSettings, saveSettings, exportState, importState,
  getLastErrors, saveLastErrors,
} = await import('../state.js');

const track = {
  id: 'tot10',
  speedTiers: [8000, 5000, 3000, 2000],
  levels: [{ id: 1 }, { id: 2 }, { id: 3 }],
};

beforeEach(() => { store = {}; });

test('initProgress unlocks only the first cell', () => {
  const p = initProgress(track);
  assert.equal(p['tot10:1:8000'], 'available');
  assert.equal(p['tot10:1:5000'], 'locked');
  assert.equal(p['tot10:3:2000'], 'locked');
  assert.equal(Object.keys(p).length, 12);
});

test('completeCell marks tier and slower tiers done, unlocks right and down', () => {
  initProgress(track);
  const p = completeCell(track, 1, 8000);
  assert.equal(p['tot10:1:8000'], 'completed');
  assert.equal(p['tot10:1:5000'], 'available');
  assert.equal(p['tot10:2:8000'], 'available');
  assert.equal(p['tot10:2:5000'], 'locked');
});

test('completeCell at fastest tier and last level does not go out of range', () => {
  initProgress(track);
  const p = completeCell(track, 3, 2000);
  assert.equal(p['tot10:3:2000'], 'completed');
  assert.equal(p['tot10:3:8000'], 'completed');
  for (const key of Object.keys(p)) {
    assert.match(key, /^tot10:[123]:(8000|5000|3000|2000)$/);
  }
});

test('nextCell returns topmost available, leftmost tier; null when none', () => {
  initProgress(track);
  assert.deepEqual(nextCell(track), { level: 1, tier: 8000 });
  completeCell(track, 1, 8000);
  assert.deepEqual(nextCell(track), { level: 1, tier: 5000 });
  for (const l of [1, 2, 3]) completeCell(track, l, 2000);
  assert.equal(nextCell(track), null);
});

test('fact stats accumulate; time only counted when correct', () => {
  updateFactStats('8+5', { correct: true, time: 2100 });
  updateFactStats('8+5', { correct: false, time: 4000 });
  const s = getFactStats('8+5');
  assert.equal(s.attempts, 2);
  assert.equal(s.correct, 1);
  assert.equal(s.totalTime, 2100);
});

test('toggleFocus flips the flag', () => {
  toggleFocus('8+5');
  assert.equal(getFactStats('8+5').focused, true);
  toggleFocus('8+5');
  assert.equal(getFactStats('8+5').focused, false);
});

test('settings defaults and roundtrip', () => {
  assert.deepEqual(getSettings(), {
    mode: 'together', itemsPerSession: 20, track: 'tot10',
    correctAnimMs: 700, wrongAnimMs: 1500, blokjes: 'erbij',
  });
  saveSettings({ mode: 'solo', itemsPerSession: 10, track: 'tafels' });
  assert.equal(getSettings().mode, 'solo');
});

test('export/import roundtrip', () => {
  initProgress(track);
  updateFactStats('8+5', { correct: true, time: 1500 });
  const blob = exportState();
  store = {};
  assert.equal(importState(blob), true);
  assert.equal(getFactStats('8+5').correct, 1);
  assert.equal(initProgress(track)['tot10:1:8000'], 'available');
});

test('importState rejects garbage and leaves state untouched', () => {
  updateFactStats('8+5', { correct: true, time: 1500 });
  assert.equal(importState('not json {'), false);
  assert.equal(importState('"a string"'), false);
  assert.equal(importState('[1,2]'), false);
  assert.equal(getFactStats('8+5').correct, 1);
});

test('corrupt localStorage falls back to defaults', () => {
  store['rekenen:settings'] = '{broken';
  assert.equal(getSettings().mode, 'together');
});

test('storage keys are namespaced so flitsen (same origin) is untouched', () => {
  saveSettings({ mode: 'solo', itemsPerSession: 10, track: 'tafels' });
  updateFactStats('8+5', { correct: true, time: 900 });
  saveLastErrors(['8+5']);
  initProgress(track);
  for (const k of Object.keys(store)) assert.match(k, /^rekenen:/);
});

test('flitsen settings under the bare key are ignored — rekenen gets its own defaults', () => {
  // flitsen's shape: no itemsPerSession, no track
  store.settings = JSON.stringify({ mode: 'together', wordsPerSession: 20, groep: 'g3', font: 'default' });
  const s = getSettings();
  assert.equal(s.itemsPerSession, 20);
  assert.equal(s.track, 'tot10');
});

test('getSettings merges defaults per-field over a partial stored object', () => {
  store['rekenen:settings'] = JSON.stringify({ mode: 'solo' });
  const s = getSettings();
  assert.equal(s.mode, 'solo');
  assert.equal(s.itemsPerSession, 20);
  assert.equal(s.track, 'tot10');
});

test('getSettings sanitizes out-of-range itemsPerSession', () => {
  store['rekenen:settings'] = JSON.stringify({ mode: 'together', itemsPerSession: 'veel', track: 'tot10' });
  assert.equal(getSettings().itemsPerSession, 20);
  store['rekenen:settings'] = JSON.stringify({ mode: 'together', itemsPerSession: 0, track: 'tot10' });
  assert.equal(getSettings().itemsPerSession, 20);
});

test('getLastErrors tolerates corrupt or non-array values', () => {
  store['rekenen:lastErrors'] = '{broken';
  assert.equal(getLastErrors().size, 0);
  store['rekenen:lastErrors'] = '42';
  assert.equal(getLastErrors().size, 0);
  saveLastErrors(['8+5', '7+_=10']);
  assert.deepEqual([...getLastErrors()].sort(), ['7+_=10', '8+5']);
});

test('importState skips malformed sections but imports the rest', () => {
  const blob = JSON.stringify({
    progress: { 'tot10:1:8000': 'completed' },
    lastErrors: 'not-an-array',
    settings: ['not', 'an', 'object'],
  });
  assert.equal(importState(blob), true);
  assert.equal(getLastErrors().size, 0);
  assert.equal(getSettings().itemsPerSession, 20);
  assert.equal(initProgress(track)['tot10:1:8000'], 'completed');
});

test('initProgress backfills levels added after first run and unlocks behind completed work', () => {
  const twoLevels = { id: 'tot10', speedTiers: [8000, 5000], levels: [{ id: 1 }, { id: 2 }] };
  initProgress(twoLevels);
  completeCell(twoLevels, 1, 8000);
  completeCell(twoLevels, 2, 8000);
  const threeLevels = { ...twoLevels, levels: [{ id: 1 }, { id: 2 }, { id: 3 }] };
  const p = initProgress(threeLevels);
  assert.equal(p['tot10:3:8000'], 'available'); // predecessor completed at this tier
  assert.equal(p['tot10:3:5000'], 'locked');    // predecessor not completed at this tier
});

test('animation durations default and are sanitized', () => {
  assert.equal(getSettings().correctAnimMs, 700);
  assert.equal(getSettings().wrongAnimMs, 1500);
  store['rekenen:settings'] = JSON.stringify({ correctAnimMs: 'snel', wrongAnimMs: 100 });
  assert.equal(getSettings().correctAnimMs, 700);  // non-numeric -> default
  assert.equal(getSettings().wrongAnimMs, 1500);   // below floor -> default
  store['rekenen:settings'] = JSON.stringify({ correctAnimMs: 0, wrongAnimMs: 3000 });
  assert.equal(getSettings().correctAnimMs, 0);    // 0 = animation off, valid
  assert.equal(getSettings().wrongAnimMs, 3000);
});

test('blokjes setting defaults and sanitizes', () => {
  assert.equal(getSettings().blokjes, 'erbij');
  store['rekenen:settings'] = JSON.stringify({ blokjes: 'misschien' });
  assert.equal(getSettings().blokjes, 'erbij');
  store['rekenen:settings'] = JSON.stringify({ blokjes: 'alleen' });
  assert.equal(getSettings().blokjes, 'alleen');
});

test('amendFactStat flips a wrong record to correct and back', async () => {
  const { amendFactStat } = await import('../state.js');
  updateFactStats('8+5', { correct: false, time: 4000 });
  let s = amendFactStat('8+5', true, 4000);
  assert.equal(s.correct, 1);
  assert.equal(s.totalTime, 4000);
  s = amendFactStat('8+5', false, 4000);
  assert.equal(s.correct, 0);
  assert.equal(s.totalTime, 0);
});

test('progress snapshot/restore reverts a retro-pass', async () => {
  const { getProgressSnapshot, restoreProgress } = await import('../state.js');
  initProgress(track);
  const before = getProgressSnapshot();
  completeCell(track, 1, 8000);
  assert.equal(initProgress(track)['tot10:1:8000'], 'completed');
  restoreProgress(before);
  assert.equal(initProgress(track)['tot10:1:8000'], 'available');
  restoreProgress('{broken'); // malformed: keeps current progress
  assert.equal(initProgress(track)['tot10:1:8000'], 'available');
});
