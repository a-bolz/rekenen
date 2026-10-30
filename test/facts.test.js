// test/facts.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKey, sampleEvenly } from '../facts.js';

test('parseKey plain plus', () => {
  assert.deepEqual(parseKey('8+5'), { op: '+', a: 8, b: 5, answer: 13, display: '8 + 5' });
});

test('parseKey minus uses true minus sign in display', () => {
  const f = parseKey('13-5');
  assert.equal(f.answer, 8);
  assert.equal(f.display, '13 − 5');
});

test('parseKey multiplication', () => {
  const f = parseKey('3x4');
  assert.equal(f.op, 'x');
  assert.equal(f.answer, 12);
  assert.equal(f.display, '3 × 4');
});

test('parseKey bond forward', () => {
  const f = parseKey('7+_=10');
  assert.equal(f.op, 'bond');
  assert.equal(f.a, 7);
  assert.equal(f.c, 10);
  assert.equal(f.answer, 3);
  assert.equal(f.display, '7 + □ = 10');
});

test('parseKey bond reversed', () => {
  const f = parseKey('10=7+_');
  assert.equal(f.answer, 3);
  assert.equal(f.display, '10 = 7 + □');
});

test('parseKey bond with answer 0', () => {
  const f = parseKey('5+_=5');
  assert.equal(f.answer, 0);
});

test('parseKey rejects garbage', () => {
  assert.throws(() => parseKey('5//2'));
});

test('sampleEvenly returns list unchanged when small enough', () => {
  const keys = ['a', 'b', 'c'];
  assert.deepEqual(sampleEvenly(keys, 25), keys);
});

test('sampleEvenly picks max unique items from the input, in input order, deterministically', () => {
  const keys = Array.from({ length: 100 }, (_, i) => `k${i}`);
  const out = sampleEvenly(keys, 25);
  assert.equal(out.length, 25);
  assert.equal(new Set(out).size, 25);
  const positions = out.map(k => keys.indexOf(k));
  for (const p of positions) assert.ok(p >= 0, 'picked key not from input');
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b),
    'picked keys must keep original list order');
  assert.deepEqual(sampleEvenly(keys, 25), out);
});

import { TRACKS } from '../facts.js';

test('four tracks with expected ids and tiers', () => {
  assert.deepEqual(TRACKS.map(t => t.id), ['tot10', 'tot20', 'tot100', 'tafels']);
  assert.deepEqual(TRACKS[0].speedTiers, [8000, 5000, 3000, 2000]);
  assert.deepEqual(TRACKS[2].speedTiers, [12000, 8000, 5000, 3000]);
  assert.equal(TRACKS[0].visual, 'tenframe');
  assert.equal(TRACKS[2].visual, 'hundredgrid');
  assert.equal(TRACKS[3].visual, 'array');
});

test('expected level counts per track', () => {
  assert.deepEqual(TRACKS.map(t => t.levels.length), [7, 8, 7, 8]);
});

test('every level: 8-25 items, no duplicates, all keys parse', () => {
  for (const track of TRACKS) {
    for (const level of track.levels) {
      assert.ok(level.keys.length >= 8 && level.keys.length <= 25,
        `${track.id} L${level.id} has ${level.keys.length} items`);
      assert.equal(new Set(level.keys).size, level.keys.length,
        `${track.id} L${level.id} has duplicate keys`);
      for (const key of level.keys) parseKey(key);
    }
  }
});

test('answers stay within range and non-negative', () => {
  for (const track of TRACKS) {
    for (const level of track.levels) {
      for (const key of level.keys) {
        const f = parseKey(key);
        assert.ok(f.answer >= 0, `${key} negative answer`);
        assert.ok(f.answer <= 100, `${key} answer over 100`);
      }
    }
  }
});

test('splitsen levels use bond format, plain levels do not', () => {
  const tot10 = TRACKS[0];
  for (const key of tot10.levels[0].keys) assert.equal(parseKey(key).op, 'bond');
  for (const key of tot10.levels[2].keys) assert.equal(parseKey(key).op, 'bond');
  for (const key of tot10.levels[4].keys) assert.equal(parseKey(key).op, '+');
});

test('bruggetje plus really crosses ten', () => {
  const brug = TRACKS[1].levels[3];
  for (const key of brug.keys) {
    const f = parseKey(key);
    assert.ok(f.a <= 9 && f.b <= 9 && f.answer >= 11, key);
  }
});

test('min met brug really borrows', () => {
  const brug = TRACKS[2].levels[5];
  for (const key of brug.keys) {
    const f = parseKey(key);
    assert.ok(f.op === '-' && f.b > f.a % 10 && f.answer >= 1, key);
  }
});

// --- Distribution regression tests (guard against stride aliasing) ---

function levelKeys(trackId, levelId) {
  return TRACKS.find(t => t.id === trackId).levels.find(l => l.id === levelId).keys;
}

test('tot100 L3 (plus/min heel tiental) spans many tens, both directions', () => {
  const plusTens = new Set(), minTens = new Set();
  for (const key of levelKeys('tot100', 3)) {
    const f = parseKey(key);
    if (f.op === '+') plusTens.add(f.b); else minTens.add(f.b);
  }
  assert.ok(plusTens.size >= 4, `plus tens addends ${[...plusTens]} span < 4`);
  assert.ok(minTens.size >= 3, `minus tens subtrahends ${[...minTens]} span < 3`);
});

test('tot100 L4 (zonder brug) spans many unit addends and subtrahends', () => {
  const plusUnits = new Set(), minUnits = new Set();
  for (const key of levelKeys('tot100', 4)) {
    const f = parseKey(key);
    if (f.op === '+') plusUnits.add(f.b); else minUnits.add(f.b);
  }
  assert.ok(plusUnits.size >= 5, `plus unit addends ${[...plusUnits]} span < 5`);
  assert.ok([5, 6, 7, 8].some(u => plusUnits.has(u)),
    `plus unit addends ${[...plusUnits]} missing all of +5/+6/+7/+8`);
  assert.ok(minUnits.size >= 5, `minus unit subtrahends ${[...minUnits]} span < 5`);
});

// Regenerate the mix source families exactly as facts.js builds them
// (same generator logic, same exported sampleEvenly).
const TENS = Array.from({ length: 9 }, (_, i) => (i + 1) * 10);

function plusMinTot5() {
  const keys = [];
  for (let s = 2; s <= 5; s++)
    for (let a = 1; a < s; a++) keys.push(`${a}+${s - a}`);
  for (let a = 2; a <= 5; a++)
    for (let b = 1; b < a; b++) keys.push(`${a}-${b}`);
  return keys;
}

function plusSums(sMin, sMax) {
  const keys = [];
  for (let s = sMin; s <= sMax; s++)
    for (let a = 1; a < s; a++) keys.push(`${a}+${s - a}`);
  return sampleEvenly(keys);
}

function minRange(aMin, aMax) {
  const keys = [];
  for (let a = aMin; a <= aMax; a++)
    for (let b = 1; b < a; b++) keys.push(`${a}-${b}`);
  return sampleEvenly(keys);
}

function brugPlus() {
  const keys = [];
  for (let a = 2; a <= 9; a++)
    for (let b = 2; b <= 9; b++) if (a + b >= 11) keys.push(`${a}+${b}`);
  return sampleEvenly(keys);
}

function brugMin() {
  const keys = [];
  for (let a = 11; a <= 18; a++)
    for (let b = 2; b <= 9; b++) {
      const r = a - b;
      if (r >= 2 && r <= 9) keys.push(`${a}-${b}`);
    }
  return sampleEvenly(keys);
}

function plusMinTiental() {
  const keys = [];
  for (let a = 11; a <= 89; a++) {
    if (a % 10 === 0) continue;
    for (const t of TENS) {
      if (a + t <= 99) keys.push(`${a}+${t}`);
      if (a - t >= 11) keys.push(`${a}-${t}`);
    }
  }
  return sampleEvenly(keys);
}

function eenhedenZonderBrug() {
  const keys = [];
  for (let a = 21; a <= 98; a++) {
    const u = a % 10;
    if (u === 0) continue;
    for (let e = 1; e <= 9; e++) {
      if (u + e <= 9) keys.push(`${a}+${e}`);
      if (e < u) keys.push(`${a}-${e}`);
    }
  }
  return sampleEvenly(keys);
}

function plusMetBrug() {
  const keys = [];
  for (let a = 15; a <= 95; a++) {
    const u = a % 10;
    if (u === 0) continue;
    for (let e = 2; e <= 9; e++)
      if (u + e > 9 && a + e <= 100) keys.push(`${a}+${e}`);
  }
  return sampleEvenly(keys);
}

function minMetBrug() {
  const keys = [];
  for (let a = 21; a <= 95; a++) {
    const u = a % 10;
    for (let e = 2; e <= 9; e++)
      if (e > u && a - e >= 1) keys.push(`${a}-${e}`);
  }
  return sampleEvenly(keys);
}

function tafel(n) {
  return Array.from({ length: 10 }, (_, i) => `${i + 1}x${n}`);
}

test('every mix level draws near-evenly from each source family', () => {
  const mixes = [
    { track: 'tot10', level: 7, families: [plusMinTot5(), plusSums(6, 10), minRange(6, 10)] },
    { track: 'tot20', level: 8, families: [brugPlus(), brugMin(), plusSums(11, 20), minRange(11, 20)] },
    { track: 'tot100', level: 7, families: [plusMinTiental(), eenhedenZonderBrug(), plusMetBrug(), minMetBrug()] },
    { track: 'tafels', level: 4, families: [tafel(2), tafel(5), tafel(10)] },
    { track: 'tafels', level: 8, families: [tafel(2), tafel(3), tafel(4), tafel(5), tafel(6), tafel(10)] },
  ];
  for (const { track, level, families } of mixes) {
    const keys = levelKeys(track, level);
    const minPer = Math.floor(25 / families.length) - 1;
    families.forEach((family, i) => {
      const set = new Set(family);
      const n = keys.filter(k => set.has(k)).length;
      assert.ok(n >= minPer,
        `${track} mix: family ${i} contributes ${n} items, need >= ${minPer}`);
    });
  }
});

test('generation is deterministic', async () => {
  const fresh = await import('../facts.js?fresh');
  assert.deepEqual(
    fresh.TRACKS.map(t => t.levels.map(l => l.keys)),
    TRACKS.map(t => t.levels.map(l => l.keys))
  );
});
