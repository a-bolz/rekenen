// facts.js
export function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

// Fixed-seed PRNG (mulberry32) so sampling is deterministic across runs.
// Shuffling before taking strided picks breaks the phase-locking between
// the sampling stride and the generators' block structure.
const SAMPLE_SEED = 0xc0ffee;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleEvenly(keys, max = 25) {
  if (keys.length <= max) return keys;
  const rand = mulberry32(SAMPLE_SEED);
  const shuffled = keys.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked = new Set();
  for (let i = 0; i < max; i++) {
    picked.add(shuffled[Math.round((i * (shuffled.length - 1)) / (max - 1))]);
  }
  // Keep the level listing human-readable: original list order.
  return keys.filter(k => picked.has(k));
}

export function parseKey(key) {
  let m;
  if ((m = key.match(/^(\d+)\+_=(\d+)$/))) {
    const a = +m[1], c = +m[2];
    return { op: 'bond', a, c, answer: c - a, display: `${a} + □ = ${c}` };
  }
  if ((m = key.match(/^(\d+)=(\d+)\+_$/))) {
    const c = +m[1], a = +m[2];
    return { op: 'bond', a, c, answer: c - a, display: `${c} = ${a} + □` };
  }
  if ((m = key.match(/^(\d+)\+(\d+)$/))) {
    const a = +m[1], b = +m[2];
    return { op: '+', a, b, answer: a + b, display: `${a} + ${b}` };
  }
  if ((m = key.match(/^(\d+)-(\d+)$/))) {
    const a = +m[1], b = +m[2];
    return { op: '-', a, b, answer: a - b, display: `${a} − ${b}` };
  }
  if ((m = key.match(/^(\d+)x(\d+)$/))) {
    const a = +m[1], b = +m[2];
    return { op: 'x', a, b, answer: a * b, display: `${a} × ${b}` };
  }
  throw new Error(`Bad fact key: ${key}`);
}

// --- Generators ---

function splitsen(nMin, nMax, aMin) {
  const keys = [];
  for (let n = nMin; n <= nMax; n++)
    for (let a = aMin; a <= n - aMin; a++) keys.push(`${a}+_=${n}`);
  return sampleEvenly(keys);
}

function splitsenVan10() {
  return [...range(0, 10).map(a => `${a}+_=10`), ...range(1, 9).map(a => `10=${a}+_`)];
}

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

function interleave(lists) {
  const out = [];
  const longest = Math.max(...lists.map(l => l.length));
  for (let i = 0; i < longest; i++)
    for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

function mix(lists) {
  // Sample each source family first so every family is evenly represented
  // and spread across its own range, then interleave, dedupe and cap.
  const per = Math.ceil(25 / lists.length);
  const sampled = lists.map(l => sampleEvenly(l, per));
  return [...new Set(interleave(sampled))].slice(0, 25);
}

function dubbelen() { return range(1, 10).map(a => `${a}+${a}`); }

function bijnaDubbelen() {
  return range(1, 9).flatMap(a => [`${a}+${a + 1}`, `${a + 1}+${a}`]);
}

function plus10() { return range(1, 9).flatMap(n => [`10+${n}`, `${n}+10`]); }

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

const TENS = range(1, 9).map(t => t * 10);

function tientallen() {
  const keys = [];
  for (const a of TENS)
    for (const b of TENS) {
      if (a + b <= 100) keys.push(`${a}+${b}`);
      if (a - b >= 10) keys.push(`${a}-${b}`);
    }
  return sampleEvenly(keys);
}

function tientalEenheden() {
  const keys = [];
  for (const t of TENS)
    for (let e = 1; e <= 9; e++) keys.push(`${t}+${e}`, `${t + e}-${e}`, `${t + e}-${t}`);
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

function tafel(n) { return range(1, 10).map(a => `${a}x${n}`); }

export const TRACKS = [
  {
    id: 'tot10', name: 'Tot 10', speedTiers: [8000, 5000, 3000, 2000], visual: 'tenframe',
    levels: [
      { id: 1, name: 'Splitsen tot 5', keys: splitsen(2, 5, 0) },
      { id: 2, name: 'Plus en min tot 5', keys: plusMinTot5() },
      { id: 3, name: 'Splitsen van 10', keys: splitsenVan10() },
      { id: 4, name: 'Splitsen van 6 t/m 9', keys: splitsen(6, 9, 1) },
      { id: 5, name: 'Plus tot 10', keys: plusSums(6, 10) },
      { id: 6, name: 'Min tot 10', keys: minRange(6, 10) },
      { id: 7, name: 'Mix tot 10', keys: mix([plusMinTot5(), plusSums(6, 10), minRange(6, 10)]) },
    ],
  },
  {
    id: 'tot20', name: 'Tot 20', speedTiers: [8000, 5000, 3000, 2000], visual: 'tenframe',
    levels: [
      { id: 1, name: 'Dubbelen', keys: dubbelen() },
      { id: 2, name: 'Bijna-dubbelen', keys: bijnaDubbelen() },
      { id: 3, name: '10 plus iets', keys: plus10() },
      { id: 4, name: 'Bruggetje plus', keys: brugPlus() },
      { id: 5, name: 'Bruggetje min', keys: brugMin() },
      { id: 6, name: 'Plus tot 20', keys: plusSums(11, 20) },
      { id: 7, name: 'Min tot 20', keys: minRange(11, 20) },
      { id: 8, name: 'Mix tot 20', keys: mix([brugPlus(), brugMin(), plusSums(11, 20), minRange(11, 20)]) },
    ],
  },
  {
    id: 'tot100', name: 'Tot 100', speedTiers: [12000, 8000, 5000, 3000], visual: 'hundredgrid',
    levels: [
      { id: 1, name: 'Tientallen', keys: tientallen() },
      { id: 2, name: 'Tiental en eenheden', keys: tientalEenheden() },
      { id: 3, name: 'Plus en min heel tiental', keys: plusMinTiental() },
      { id: 4, name: 'Zonder brug', keys: eenhedenZonderBrug() },
      { id: 5, name: 'Plus met brug', keys: plusMetBrug() },
      { id: 6, name: 'Min met brug', keys: minMetBrug() },
      { id: 7, name: 'Mix tot 100', keys: mix([plusMinTiental(), eenhedenZonderBrug(), plusMetBrug(), minMetBrug()]) },
    ],
  },
  {
    id: 'tafels', name: 'Tafels', speedTiers: [12000, 8000, 5000, 3000], visual: 'array',
    levels: [
      { id: 1, name: 'Tafel van 10', keys: tafel(10) },
      { id: 2, name: 'Tafel van 2', keys: tafel(2) },
      { id: 3, name: 'Tafel van 5', keys: tafel(5) },
      { id: 4, name: 'Mix 2, 5 en 10', keys: mix([tafel(2), tafel(5), tafel(10)]) },
      { id: 5, name: 'Tafel van 4', keys: tafel(4) },
      { id: 6, name: 'Tafel van 3', keys: tafel(3) },
      { id: 7, name: 'Tafel van 6', keys: tafel(6) },
      { id: 8, name: 'Mix t/m 6', keys: mix([tafel(2), tafel(3), tafel(4), tafel(5), tafel(6), tafel(10)]) },
    ],
  },
];
