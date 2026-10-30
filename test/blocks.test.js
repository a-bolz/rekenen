// test/blocks.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posOf, rowsNeeded, minusTargets, tensSplit, canManipulate, BLOCK, GAP, PER_ROW } from '../blocks.js';

test('posOf lays out rows of 10', () => {
  assert.deepEqual(posOf(0), { x: 0, y: 0 });
  assert.deepEqual(posOf(9), { x: 9 * (BLOCK + GAP), y: 0 });
  assert.equal(posOf(10).x, 0);
  assert.ok(posOf(10).y > 0);
  assert.equal(posOf(13).x, 3 * (BLOCK + GAP));
});

test('rowsNeeded', () => {
  assert.equal(rowsNeeded(1), 1);
  assert.equal(rowsNeeded(10), 1);
  assert.equal(rowsNeeded(11), 2);
  assert.equal(rowsNeeded(20), 2);
  assert.equal(rowsNeeded(0), 1);
});

test('minusTargets: red blocks cover the last b blues', () => {
  assert.deepEqual(minusTargets(7, 5), [2, 3, 4, 5, 6]);
  assert.deepEqual(minusTargets(13, 5), [8, 9, 10, 11, 12]);
  assert.deepEqual(minusTargets(3, 0), []);
});

test('tensSplit', () => {
  assert.deepEqual(tensSplit(12), { tens: 1, rest: 2 });
  assert.deepEqual(tensSplit(20), { tens: 2, rest: 0 });
  assert.deepEqual(tensSplit(7), { tens: 0, rest: 7 });
});

test('canManipulate: plus/min within 20 only', () => {
  assert.equal(canManipulate({ op: '+', a: 7, b: 5, answer: 12 }), true);
  assert.equal(canManipulate({ op: '-', a: 13, b: 5, answer: 8 }), true);
  assert.equal(canManipulate({ op: '-', a: 3, b: 0, answer: 3 }), true);
  assert.equal(canManipulate({ op: 'bond', a: 4, c: 5, answer: 1 }), false);
  assert.equal(canManipulate({ op: 'x', a: 3, b: 4, answer: 12 }), false);
  assert.equal(canManipulate({ op: '+', a: 47, b: 30, answer: 77 }), false);
  assert.equal(canManipulate({ op: '+', a: 12, b: 9, answer: 21 }), false);
});
