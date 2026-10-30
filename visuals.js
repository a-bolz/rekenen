// visuals.js
import { parseKey } from './facts.js';

export const COLORS = { p1: '#3b82f6', p2: '#22c55e', cross: '#d1d5db', mark: '#b91c1c' };

function svgOpen(w, h) {
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
}

function tenFrameSVG(dots) {
  const cell = 34, pad = 2;
  const w = 5 * cell + pad * 2, h = 2 * cell + pad * 2;
  let out = svgOpen(w, h);
  for (let i = 0; i < 10; i++) {
    const x = pad + (i % 5) * cell, y = pad + Math.floor(i / 5) * cell;
    out += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="none" stroke="#999"/>`;
  }
  dots.forEach((d, i) => {
    const x = pad + (i % 5) * cell + cell / 2, y = pad + Math.floor(i / 5) * cell + cell / 2;
    const fill = COLORS[d];
    out += `<circle class="dot" style="animation-delay:${i * 40}ms" cx="${x}" cy="${y}" r="${cell * 0.36}" fill="${fill}"/>`;
    if (d === 'cross') {
      out += `<line x1="${x - 10}" y1="${y - 10}" x2="${x + 10}" y2="${y + 10}" stroke="${COLORS.mark}" stroke-width="3"/>`;
    }
  });
  return out + '</svg>';
}

function renderTenFrame(f) {
  let dots;
  if (f.op === '-') {
    dots = [...Array(f.a - f.b).fill('p1'), ...Array(f.b).fill('cross')];
  } else if (f.op === 'bond') {
    dots = [...Array(f.a).fill('p1'), ...Array(f.answer).fill('p2')];
  } else {
    dots = [...Array(f.a).fill('p1'), ...Array(f.b).fill('p2')];
  }
  const frames = [];
  for (let i = 0; i < dots.length; i += 10) frames.push(dots.slice(i, i + 10));
  return `<div class="visual">${frames.map(tenFrameSVG).join('')}</div>`;
}

function renderHundredGrid(f) {
  const cell = 13, pad = 2;
  const w = 10 * cell + pad * 2, h = 10 * cell + pad * 2;
  const linearDelay = i => Math.min(i * 8, 400);
  const cells = Array(100).fill(null); // { fill, delay } per filled cell
  const ta = Math.floor(f.a / 10), ua = f.a % 10;
  const wholeTens = f.b > 0 && f.b % 10 === 0;
  const tb = wholeTens ? f.b / 10 : 0;
  const greenStart = ua > 0 ? ta + 1 : ta; // skip a's partial unit row so green rows are whole

  if (f.op === '+' && wholeTens && greenStart + tb <= 10) {
    // a linearly as blue: full tens rows plus unit cells in row ta
    for (let i = 0; i < f.a; i++) cells[i] = { fill: COLORS.p1, delay: linearDelay(i) };
    // b as whole green rows sliding in one after another
    for (let r = 0; r < tb; r++)
      for (let c = 0; c < 10; c++)
        cells[(greenStart + r) * 10 + c] = { fill: COLORS.p2, delay: 400 + r * 150 };
  } else if (f.op === '-' && wholeTens && tb <= ta) {
    // a as blue, then the LAST tb full tens-rows of a greyed out row by row
    for (let i = 0; i < (ta - tb) * 10; i++) cells[i] = { fill: COLORS.p1, delay: linearDelay(i) };
    for (let r = 0; r < tb; r++)
      for (let c = 0; c < 10; c++)
        cells[(ta - tb + r) * 10 + c] = { fill: COLORS.cross, delay: 450 + r * 150 };
    for (let i = ta * 10; i < f.a; i++) cells[i] = { fill: COLORS.p1, delay: linearDelay(i) };
  } else {
    // all other operand shapes: existing linear fill
    const p1 = f.op === '-' ? f.a - f.b : f.a;
    const p2 = f.op === '-' ? 0 : f.b;
    const crossed = f.op === '-' ? f.b : 0;
    for (let i = 0; i < p1 + p2 + crossed; i++) {
      const fill = i < p1 ? COLORS.p1 : i < p1 + p2 ? COLORS.p2 : COLORS.cross;
      cells[i] = { fill, delay: linearDelay(i) };
    }
  }

  let out = svgOpen(w, h);
  for (let i = 0; i < 100; i++) {
    const x = pad + (i % 10) * cell, y = pad + Math.floor(i / 10) * cell;
    const c = cells[i];
    const cls = c ? ` class="dot" style="animation-delay:${c.delay}ms"` : '';
    out += `<rect${cls} x="${x}" y="${y}" width="${cell - 1}" height="${cell - 1}" fill="${c ? c.fill : '#fff'}" stroke="#ccc" stroke-width="0.5"/>`;
  }
  return `<div class="visual">${out}</svg></div>`;
}

function renderArray(f) {
  const cell = 26, pad = 4;
  const w = f.b * cell + pad * 2, h = f.a * cell + pad * 2;
  let out = svgOpen(w, h);
  for (let r = 0; r < f.a; r++)
    for (let c = 0; c < f.b; c++) {
      const x = pad + c * cell + cell / 2, y = pad + r * cell + cell / 2;
      out += `<circle class="dot" style="animation-delay:${r * 90}ms" cx="${x}" cy="${y}" r="${cell * 0.32}" fill="${COLORS.p1}"/>`;
    }
  return `<div class="visual">${out}</svg></div>`;
}

export function renderVisual(key, visualType) {
  const f = parseKey(key);
  if (visualType === 'array') return renderArray(f);
  if (visualType === 'hundredgrid') return renderHundredGrid(f);
  return renderTenFrame(f);
}
