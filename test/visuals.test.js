// test/visuals.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderVisual } from '../visuals.js';

const countDots = html => (html.match(/class="dot/g) || []).length;

test('tenframe plus shows a+b dots across frames', () => {
  const html = renderVisual('8+5', 'tenframe');
  assert.equal(countDots(html), 13);
  assert.equal((html.match(/<svg/g) || []).length, 2); // two frames for 13
});

test('tenframe bond shows part and missing part', () => {
  const html = renderVisual('7+_=10', 'tenframe');
  assert.equal(countDots(html), 10);
  assert.equal((html.match(/<svg/g) || []).length, 1);
});

test('tenframe minus crosses out subtracted dots', () => {
  const html = renderVisual('13-5', 'tenframe');
  assert.equal(countDots(html), 13);
  assert.equal((html.match(/<line/g) || []).length, 5);
});

test('hundredgrid plus fills a+b cells', () => {
  const html = renderVisual('47+30', 'hundredgrid');
  assert.equal(countDots(html), 77);
});

test('hundredgrid minus shows minuend with subtrahend greyed', () => {
  const html = renderVisual('52-6', 'hundredgrid');
  assert.equal(countDots(html), 52);
});

test('array shows a rows of b dots', () => {
  const html = renderVisual('3x4', 'array');
  assert.equal(countDots(html), 12);
});
