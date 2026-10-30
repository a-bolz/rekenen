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

test('sampleEvenly picks max spread items, keeps ends, is deterministic', () => {
  const keys = Array.from({ length: 100 }, (_, i) => `k${i}`);
  const out = sampleEvenly(keys, 25);
  assert.equal(out.length, 25);
  assert.equal(out[0], 'k0');
  assert.equal(out[24], 'k99');
  assert.equal(new Set(out).size, 25);
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

test('generation is deterministic', async () => {
  const fresh = await import('../facts.js?fresh');
  assert.deepEqual(
    fresh.TRACKS.map(t => t.levels.map(l => l.keys)),
    TRACKS.map(t => t.levels.map(l => l.keys))
  );
});
