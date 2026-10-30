// app.js
import { TRACKS, parseKey } from './facts.js';
import {
  makeKey, initProgress, completeCell, nextCell,
  getFactStats, updateFactStats, toggleFocus, amendFactStat,
  getSettings, saveSettings, exportState, importState,
  getLastErrors, saveLastErrors,
} from './state.js';
import { selectKeys, shuffle, isFout } from './session.js';
import { createFlow, submitAnswer, feedbackDone } from './flow.js';
import { createKeypad } from './keypad.js';
import { renderVisual } from './visuals.js';

// --- Screen routing ---

const screens = document.querySelectorAll('.screen');

function showScreen(id) {
  screens.forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${id}`).classList.add('active');
}

// --- State ---

let current = null; // { track, level, tier, type, mode, flow, timerId, startTime, keypad }

function resolveTrack() {
  const settings = getSettings();
  return TRACKS.find(t => t.id === settings.track) || TRACKS[0];
}

// --- Home ---

function renderMatrix() {
  const track = resolveTrack();
  const progress = initProgress(track);

  document.getElementById('speed-labels').innerHTML = track.speedTiers
    .map(t => `<div class="speed-label">${t / 1000}s</div>`)
    .join('');

  const grid = document.getElementById('matrix-grid');
  grid.innerHTML = '';
  for (const level of track.levels) {
    const row = document.createElement('div');
    row.className = 'matrix-row';

    const label = document.createElement('div');
    label.className = 'level-label';
    label.textContent = level.name;
    row.appendChild(label);

    for (const tier of track.speedTiers) {
      const cell = document.createElement('div');
      const state = progress[makeKey(track.id, level.id, tier)];
      cell.className = `matrix-cell cell-${state}`;
      if (state === 'available' || state === 'completed') {
        cell.addEventListener('click', () => openCellModal(level.id, tier));
      }
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }

  const next = nextCell(track);
  const vandaag = document.getElementById('btn-vandaag');
  vandaag.disabled = !next;
  vandaag.textContent = next ? 'Vandaag' : 'Alles af!';
}

function openCellModal(levelId, tier) {
  const track = resolveTrack();
  const levelData = track.levels.find(l => l.id === levelId);
  const modal = document.getElementById('cell-modal');
  document.getElementById('modal-title').textContent = `${levelData.name} — ${tier / 1000}s`;
  modal.classList.remove('hidden');
  document.getElementById('btn-practice').onclick = () => {
    modal.classList.add('hidden');
    startSession(levelId, tier, 'practice');
  };
  document.getElementById('btn-exam').onclick = () => {
    modal.classList.add('hidden');
    startSession(levelId, tier, 'exam');
  };
  document.getElementById('btn-cancel').onclick = () => modal.classList.add('hidden');
}

function initTrackSelect() {
  const select = document.getElementById('track-select');
  for (const track of TRACKS) {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = track.name;
    select.appendChild(option);
  }
  select.value = resolveTrack().id;
  select.addEventListener('change', () => {
    saveSettings({ ...getSettings(), track: select.value });
    renderMatrix();
  });
}

function initVandaag() {
  document.getElementById('btn-vandaag').addEventListener('click', () => {
    const cell = nextCell(resolveTrack());
    if (cell) startSession(cell.level, cell.tier, 'practice');
  });
}

// --- Text fitting (ported from flitsen) ---

function fitText(el) {
  const maxWidth = el.parentElement.clientWidth - 32;
  const range = document.createRange();
  range.selectNodeContents(el);
  let size = 120;
  el.style.fontSize = size + 'px';
  while (range.getBoundingClientRect().width > maxWidth && size > 24) {
    size -= 2;
    el.style.fontSize = size + 'px';
  }
}

// --- Session ---

function startSession(levelId, tier, type, poolOverride) {
  const track = resolveTrack();
  const levelData = track.levels.find(l => l.id === levelId);
  const settings = getSettings();
  const lastErrors = getLastErrors();

  let keys;
  if (type === 'practice') {
    const pool = poolOverride && poolOverride.length ? poolOverride : levelData.keys;
    const poolErrors = poolOverride ? new Set(poolOverride) : lastErrors;
    const count = poolOverride
      ? Math.min(settings.itemsPerSession, Math.max(6, pool.length * 4))
      : settings.itemsPerSession;
    keys = selectKeys(pool, tier, count, poolErrors);
  } else {
    // Drill levels span a full table — exams sample 25 of it.
    keys = shuffle(levelData.keys);
    if (track.id === 'drill') keys = keys.slice(0, 25);
  }

  current = {
    track, level: levelId, tier, type,
    mode: settings.mode,
    blokjes: type === 'practice' ? settings.blokjes : 'uit', // toets: digits only
    flow: createFlow({
      keys,
      visualOnCorrect: track.speedTiers.indexOf(tier) === 0 && settings.correctAnimMs > 0,
      correctMs: settings.correctAnimMs,
      wrongMs: settings.wrongAnimMs,
    }),
    timerId: null,
    startTime: 0,
    keypad: null,
  };

  showScreen('session');
  renderSessionScreen();
  showItem();
}

function renderSessionScreen() {
  const container = document.getElementById('screen-session');
  const solo = current.mode === 'solo';
  container.innerHTML = `
    <div class="timer-bar" id="timer-bar"><div class="timer-fill" id="timer-fill"></div></div>
    <button class="btn-abort" id="btn-abort">×</button>
    <div class="word-display" id="fact-display"></div>
    <div class="question-visual hidden" id="question-visual"></div>
    ${solo ? '<div id="keypad-mount"></div>' : `
    <div class="session-controls" id="session-controls">
      <button class="btn-control btn-wrong" id="btn-wrong">×</button>
      <button class="btn-control btn-focus" id="btn-focus">★</button>
      <button class="btn-control btn-correct" id="btn-correct">✓</button>
    </div>`}
    <div class="session-progress" id="session-progress"></div>
  `;

  document.getElementById('btn-abort').addEventListener('click', abortSession);

  if (solo) {
    current.keypad = createKeypad(entered => {
      current.keypad.lock();
      handleAnswer(entered === parseKey(currentKey()).answer);
    });
    document.getElementById('keypad-mount').appendChild(current.keypad.element);
  } else {
    current.keypad = null;
    document.getElementById('btn-correct').addEventListener('click', () => handleAnswer(true));
    document.getElementById('btn-wrong').addEventListener('click', () => handleAnswer(false));
    document.getElementById('btn-focus').addEventListener('click', () => {
      const key = currentKey();
      toggleFocus(key);
      document.getElementById('btn-focus').classList.toggle('active');
    });
  }
}

function currentKey() {
  return current.flow.keys[current.flow.index];
}

function abortSession() {
  clearTimer();
  document.getElementById('feedback').classList.add('hidden');
  current = null;
  showScreen('home');
  renderMatrix();
}

function showItem() {
  const key = currentKey();
  const f = parseKey(key);
  const display = document.getElementById('fact-display');
  display.textContent = f.display;
  display.style.display = current.blokjes === 'alleen' ? 'none' : '';
  if (current.blokjes !== 'alleen') fitText(display);

  const qv = document.getElementById('question-visual');
  qv.classList.toggle('solo-visual', current.blokjes === 'alleen');
  if (current.blokjes !== 'uit') {
    qv.innerHTML = renderVisual(key, current.track.visual, 1, true);
    qv.classList.remove('hidden');
  } else {
    qv.innerHTML = '';
    qv.classList.add('hidden');
  }
  document.getElementById('session-progress').textContent =
    `${current.flow.index + 1} / ${current.flow.keys.length}`;

  const focusBtn = document.getElementById('btn-focus');
  if (focusBtn) focusBtn.classList.toggle('active', getFactStats(key).focused);

  if (current.keypad) current.keypad.reset(String(f.answer).length);

  current.startTime = Date.now();
  startTimer();
}

function startTimer() {
  const fill = document.getElementById('timer-fill');
  const bar = document.getElementById('timer-bar');
  const duration = current.tier;
  const start = Date.now();
  fill.style.width = '100%';
  bar.classList.remove('expired');

  clearTimer();
  current.timerId = setInterval(() => {
    const elapsed = Date.now() - start;
    fill.style.width = `${Math.max(0, 1 - elapsed / duration) * 100}%`;
    if (elapsed >= duration) {
      // Time's up: don't move on — the item stays so he can finish it.
      // The real elapsed time is recorded on answer; isFout() scores it.
      clearTimer();
      bar.classList.add('expired');
    }
  }, 50);
}

function clearTimer() {
  if (current && current.timerId) {
    clearInterval(current.timerId);
    current.timerId = null;
  }
}

function handleAnswer(correct) {
  const key = currentKey();
  const time = Date.now() - current.startTime;
  const r = submitAnswer(current.flow, correct, time);
  if (!r) return;
  clearTimer();
  updateFactStats(key, { correct, time });
  afterEvent(r, key);
}

function afterEvent(r, key) {
  if (r.feedback) {
    showFeedback(key, r.feedback, r.durationMs);
  } else if (r.done) {
    endSession();
  } else {
    showItem();
  }
}

function showFeedback(key, kind, durationMs) {
  const flow = current.flow;
  const f = parseKey(key);
  const answerText = f.op === 'bond'
    ? f.display.replace('□', String(f.answer))
    : `${f.display} = ${f.answer}`;
  const fb = document.getElementById('feedback');
  // Stretch/compress the dot reveal with the chosen duration (1 = authored timing)
  const scale = durationMs / (kind === 'correct' ? 700 : 1500);
  const isPractice = current.type === 'practice';
  fb.innerHTML = `
    <div class="feedback-answer ${kind}">${answerText}</div>
    ${renderVisual(key, current.track.visual, scale)}
    ${isPractice ? '<button class="btn btn-primary btn-verder" id="btn-verder">Verder</button>' : ''}
  `;
  fb.classList.remove('hidden');

  const proceed = () => {
    if (!current || current.flow !== flow) return; // session aborted
    fb.classList.add('hidden');
    const r = feedbackDone(current.flow);
    if (!r) return;
    if (r.done) endSession();
    else showItem();
  };

  if (isPractice) {
    // Oefenen: the animation stays until Verder is tapped.
    document.getElementById('btn-verder').addEventListener('click', proceed);
  } else {
    setTimeout(proceed, durationMs);
  }
}

// --- Results ---

function foutKeys() {
  return current.flow.results.filter(r => isFout(r, current.tier)).map(r => r.key);
}

function endSession() {
  clearTimer();
  const fouten = foutKeys();
  saveLastErrors(fouten);

  current.passed = current.type === 'exam' && fouten.length <= 1;
  if (current.passed) completeCell(current.track, current.level, current.tier);

  showScreen('results');
  renderResults();
}

function renderResults() {
  const container = document.getElementById('screen-results');
  const results = current.flow.results;
  const fouten = foutKeys();
  const goed = results.length - fouten.length;
  const total = results.length;
  const clean = fouten.length === 0;

  const rows = results.map((r, idx) => {
    const f = parseKey(r.key);
    const stats = getFactStats(r.key);
    const fout = isFout(r, current.tier);
    const slow = r.correct && !r.override && r.time !== null && r.time > current.tier;
    const statusClass = fout ? (slow ? 'slow' : 'wrong') : 'correct';
    const icon = r.correct || r.override ? '✓' : '×';
    const timeText = r.time === null ? '—'
      : (r.time / 1000).toFixed(1) + 's' + (slow ? ' · te langzaam' : '');
    return `
      <div class="result-row ${statusClass} ${fout || r.override ? 'tappable' : ''}" data-idx="${idx}">
        <span class="result-icon">${icon}</span>
        <span class="result-word">${f.display}</span>
        <span class="result-time">${timeText}${r.override ? ' · goedgekeurd' : ''}</span>
        <button class="btn-star ${stats.focused ? 'focused' : ''}" data-key="${r.key}">★</button>
      </div>`;
  }).join('');

  const header = current.type === 'exam'
    ? (current.passed ? 'Gehaald!' : `${goed} / ${total} — nog niet gehaald`)
    : `${goed} / ${total}`;

  const toetsPrompt = current.type === 'practice' && clean
    ? '<button class="btn btn-primary" id="btn-start-toets">Klaar voor de toets?</button>'
    : '';
  const foutjesBtn = fouten.length > 0
    ? '<button class="btn btn-primary" id="btn-oefen-foutjes">Oefen de foutjes</button>'
    : '';

  container.innerHTML = `
    <div class="results-header"><h2>${header}</h2>
      ${fouten.length ? '<p class="results-subtitle">Tik op een fout om hem alsnog goed te keuren</p>' : ''}
    </div>
    <div class="results-list">${rows}</div>
    ${foutjesBtn}
    ${toetsPrompt}
    <button class="btn btn-secondary" id="btn-back-home">Terug</button>
  `;

  container.querySelectorAll('.btn-star').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      // The same fact can appear in several rows — sync every star for it
      const stats = toggleFocus(btn.dataset.key);
      container.querySelectorAll('.btn-star').forEach(b => {
        if (b.dataset.key === btn.dataset.key) b.classList.toggle('focused', stats.focused);
      });
    });
  });

  // Parent override: tap a fout row to approve it (and tap again to undo)
  container.querySelectorAll('.result-row.tappable').forEach(row => {
    row.addEventListener('click', () => {
      const r = results[Number(row.dataset.idx)];
      r.override = !r.override;
      // A wrong answer flipped to goed (or back) also adjusts the fact stats;
      // a slow-but-correct answer was already counted correct.
      if (!r.correct) amendFactStat(r.key, r.override, r.time);
      const remaining = foutKeys();
      saveLastErrors(remaining);
      if (current.type === 'exam' && !current.passed && remaining.length <= 1) {
        current.passed = true;
        completeCell(current.track, current.level, current.tier);
      }
      renderResults();
    });
  });

  const foutjesEl = document.getElementById('btn-oefen-foutjes');
  if (foutjesEl) {
    foutjesEl.addEventListener('click', () =>
      startSession(current.level, current.tier, 'practice', foutKeys()));
  }

  const toetsBtn = document.getElementById('btn-start-toets');
  if (toetsBtn) {
    toetsBtn.addEventListener('click', () =>
      startSession(current.level, current.tier, 'exam'));
  }

  document.getElementById('btn-back-home').addEventListener('click', () => {
    showScreen('home');
    renderMatrix();
  });
}

// --- Settings ---

function renderSettings() {
  const container = document.getElementById('screen-settings');
  const settings = getSettings();
  container.innerHTML = `
    <header class="home-header"><h1>Instellingen</h1></header>
    <div class="settings-list">
      <div class="settings-item">
        <div>
          <div class="settings-item-label">Modus</div>
          <div class="settings-item-desc" id="mode-desc">${settings.mode === 'solo'
            ? 'Solo — antwoorden met het toetsenbord'
            : 'Samen — ouder geeft goed/fout aan'}</div>
        </div>
        <input type="checkbox" class="toggle-switch" id="setting-mode" ${settings.mode === 'solo' ? 'checked' : ''}>
      </div>
      <div class="settings-item">
        <div><div class="settings-item-label">Sommen per oefensessie</div></div>
        <div class="stepper">
          <button class="stepper-btn" id="stepper-down">−</button>
          <span class="stepper-value" id="stepper-value">${settings.itemsPerSession}</span>
          <button class="stepper-btn" id="stepper-up">+</button>
        </div>
      </div>
      <div class="settings-item">
        <div>
          <div class="settings-item-label">Animatie bij goed (ms)</div>
          <div class="settings-item-desc">Op het langzaamste tempo · 0 = uit</div>
        </div>
        <div class="stepper">
          <button class="stepper-btn" id="anim-goed-down">−</button>
          <span class="stepper-value" id="anim-goed-value">${settings.correctAnimMs}</span>
          <button class="stepper-btn" id="anim-goed-up">+</button>
        </div>
      </div>
      <div class="settings-item">
        <div>
          <div class="settings-item-label">Animatie bij fout (ms)</div>
          <div class="settings-item-desc">Tijd om het goede antwoord te zien</div>
        </div>
        <div class="stepper">
          <button class="stepper-btn" id="anim-fout-down">−</button>
          <span class="stepper-value" id="anim-fout-value">${settings.wrongAnimMs}</span>
          <button class="stepper-btn" id="anim-fout-up">+</button>
        </div>
      </div>
      <div class="settings-item">
        <div>
          <div class="settings-item-label">Blokjes bij oefenen</div>
          <div class="settings-item-desc">Blokjes naast of in plaats van de som (toets altijd zonder)</div>
        </div>
      </div>
      <div class="seg-row" id="blokjes-seg">
        <button class="seg-btn${settings.blokjes === 'uit' ? ' active' : ''}" data-v="uit">Uit</button>
        <button class="seg-btn${settings.blokjes === 'erbij' ? ' active' : ''}" data-v="erbij">Erbij</button>
        <button class="seg-btn${settings.blokjes === 'alleen' ? ' active' : ''}" data-v="alleen">Alleen blokjes</button>
      </div>
      <div class="settings-item">
        <div>
          <div class="settings-item-label">Voortgang overzetten</div>
          <div class="settings-item-desc">Kopieer deze tekst naar een ander apparaat</div>
        </div>
      </div>
      <textarea class="export-area" id="export-area"></textarea>
      <button class="btn btn-secondary" id="btn-export">Exporteren</button>
      <button class="btn btn-secondary" id="btn-import">Importeren</button>
      <div id="import-status"></div>
      <div class="settings-item">
        <div>
          <div class="settings-item-label">Versie</div>
          <div class="settings-item-desc" id="version-label">…</div>
        </div>
      </div>
    </div>
    <button class="btn btn-primary" id="btn-settings-back" style="margin:16px;">Terug</button>
  `;

  document.getElementById('setting-mode').addEventListener('change', e => {
    const mode = e.target.checked ? 'solo' : 'together';
    saveSettings({ ...getSettings(), mode });
    document.getElementById('mode-desc').textContent = mode === 'solo'
      ? 'Solo — antwoorden met het toetsenbord'
      : 'Samen — ouder geeft goed/fout aan';
  });

  function bindStepper(prefix, field, { min, max, step }) {
    const valueEl = document.getElementById(`${prefix}-value`);
    const change = delta => () => {
      const s = getSettings();
      const next = Math.min(max, Math.max(min, s[field] + delta));
      if (next !== s[field]) {
        saveSettings({ ...s, [field]: next });
        valueEl.textContent = next;
      }
    };
    document.getElementById(`${prefix}-down`).addEventListener('click', change(-step));
    document.getElementById(`${prefix}-up`).addEventListener('click', change(step));
  }

  bindStepper('stepper', 'itemsPerSession', { min: 5, max: 50, step: 5 });
  bindStepper('anim-goed', 'correctAnimMs', { min: 0, max: 3000, step: 100 });
  bindStepper('anim-fout', 'wrongAnimMs', { min: 500, max: 5000, step: 100 });

  document.querySelectorAll('#blokjes-seg .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      saveSettings({ ...getSettings(), blokjes: btn.dataset.v });
      document.querySelectorAll('#blokjes-seg .seg-btn').forEach(b =>
        b.classList.toggle('active', b === btn));
    });
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    document.getElementById('export-area').value = exportState();
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    const text = document.getElementById('export-area').value;
    const ok = importState(text);
    if (ok) {
      // Re-sync UI that was rendered from pre-import state
      document.getElementById('track-select').value = resolveTrack().id;
      renderMatrix();
      renderSettings();
      document.getElementById('export-area').value = text;
    }
    document.getElementById('import-status').textContent = ok
      ? 'Gelukt! Voortgang geladen.'
      : 'Dat lukte niet — controleer de tekst.';
  });

  document.getElementById('btn-settings-back').addEventListener('click', () => {
    showScreen('home');
    renderMatrix();
  });

  if ('caches' in window) {
    caches.keys().then(keys => {
      const label = document.getElementById('version-label');
      if (label) label.textContent = keys.filter(k => k.startsWith('rekenen-')).join(', ') || 'nog niet offline opgeslagen';
    });
  }
}

// --- Init ---

initTrackSelect();
initVandaag();
document.getElementById('btn-settings').addEventListener('click', () => {
  showScreen('settings');
  renderSettings();
});
renderMatrix();

if ('serviceWorker' in navigator) {
  // updateViaCache:'none' defeats the CDN's 10-minute cache on sw.js
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => reg.update());
  // When a new version activates, reload once so the update applies on
  // this launch instead of the next — but never mid-session.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; } // first install
    if (!current) location.reload();
  });
}
