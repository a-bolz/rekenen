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
  assert.deepEqual(getSettings(), { mode: 'together', itemsPerSession: 20, track: 'tot10' });
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
  store.settings = '{broken';
  assert.equal(getSettings().mode, 'together');
});
