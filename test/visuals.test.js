// test/visuals.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderVisual, COLORS } from '../visuals.js';

const countDots = html => (html.match(/class="dot/g) || []).length;

// Hundred-grid layout: cell=13, pad=2, so row r cells sit at y = 2 + r*13.
const gridCells = html => {
  const re = /<rect class="dot" style="animation-delay:(\d+)ms" x="(\d+)" y="(\d+)"[^>]*fill="([^"]+)"/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push({ delay: +m[1], x: +m[2], y: +m[3], fill: m[4] });
  return out;
};
const rowOf = y => (y - 2) / 13;

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

test('hundredgrid tens-jump addition renders b as whole green rows below the unit row', () => {
  const html = renderVisual('47+30', 'hundredgrid');
  const cells = gridCells(html);
  const greens = cells.filter(c => c.fill === COLORS.p2);
  // no green cell in row 4 (a's partial unit row)
  assert.ok(!greens.some(c => c.y === 2 + 4 * 13));
  // green cells exist exactly at rows 5, 6, 7 — three whole rows of ten
  const greenRows = [...new Set(greens.map(c => rowOf(c.y)))].sort((a, b) => a - b);
  assert.deepEqual(greenRows, [5, 6, 7]);
  assert.equal(greens.length, 30);
  // per-row animation: all cells of one green row share a delay; rows differ
  for (const r of greenRows) {
    const delays = new Set(greens.filter(c => rowOf(c.y) === r).map(c => c.delay));
    assert.equal(delays.size, 1);
  }
  assert.equal(new Set(greens.map(c => c.delay)).size, 3);
});

test('hundredgrid tens-jump subtraction greys the last full tens rows of a', () => {
  const html = renderVisual('86-50', 'hundredgrid');
  assert.equal(countDots(html), 86);
  const cells = gridCells(html);
  // greyed cells exist exactly at rows 3..7
  const greys = cells.filter(c => c.fill === COLORS.cross);
  const greyRows = [...new Set(greys.map(c => rowOf(c.y)))].sort((a, b) => a - b);
  assert.deepEqual(greyRows, [3, 4, 5, 6, 7]);
  assert.equal(greys.length, 50);
  // the 6 unit cells in row 8 stay blue
  const unitCells = cells.filter(c => rowOf(c.y) === 8);
  assert.equal(unitCells.length, 6);
  assert.ok(unitCells.every(c => c.fill === COLORS.p1));
  // rows 0..2 stay blue
  const blueRows = [...new Set(cells.filter(c => c.fill === COLORS.p1).map(c => rowOf(c.y)))].sort((a, b) => a - b);
  assert.deepEqual(blueRows, [0, 1, 2, 8]);
  // per-row animation on greyed rows: one delay per row, rows differ
  for (const r of greyRows) {
    const delays = new Set(greys.filter(c => rowOf(c.y) === r).map(c => c.delay));
    assert.equal(delays.size, 1);
  }
  assert.equal(new Set(greys.map(c => c.delay)).size, 5);
});

test('array shows a rows of b dots', () => {
  const html = renderVisual('3x4', 'array');
  assert.equal(countDots(html), 12);
});
