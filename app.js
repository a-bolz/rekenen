// app.js
import { TRACKS, parseKey } from './facts.js';
import {
  makeKey, initProgress, completeCell, nextCell,
  getFactStats, updateFactStats, toggleFocus,
  getSettings, saveSettings, exportState, importState,
  getLastErrors, saveLastErrors,
} from './state.js';
import { selectKeys, shuffle } from './session.js';
import { createFlow, submitAnswer, flowTimeout, feedbackDone } from './flow.js';
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

function startSession(levelId, tier, type) {
  const track = resolveTrack();
  const levelData = track.levels.find(l => l.id === levelId);
  const settings = getSettings();
  const lastErrors = getLastErrors();

  const keys = type === 'practice'
    ? selectKeys(levelData.keys, tier, settings.itemsPerSession, lastErrors)
    : shuffle(levelData.keys);

  current = {
    track, level: levelId, tier, type,
    mode: settings.mode,
    flow: createFlow({ keys, visualOnCorrect: track.speedTiers.indexOf(tier) === 0 }),
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
    <div class="timer-bar"><div class="timer-fill" id="timer-fill"></div></div>
    <button class="btn-abort" id="btn-abort">×</button>
    <div class="word-display" id="fact-display"></div>
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
  fitText(display);
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
  const duration = current.tier;
  const start = Date.now();
  fill.style.width = '100%';

  clearTimer();
  current.timerId = setInterval(() => {
    const elapsed = Date.now() - start;
    fill.style.width = `${Math.max(0, 1 - elapsed / duration) * 100}%`;
    if (elapsed >= duration) handleTimeout();
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

function handleTimeout() {
  const key = currentKey();
  const r = flowTimeout(current.flow);
  if (!r) return;
  clearTimer();
  updateFactStats(key, { correct: false, time: current.tier });
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
  fb.innerHTML = `
    <div class="feedback-answer ${kind}">${answerText}</div>
    ${renderVisual(key, current.track.visual)}
  `;
  fb.classList.remove('hidden');
  setTimeout(() => {
    if (!current || current.flow !== flow) return; // session aborted
    fb.classList.add('hidden');
    const r = feedbackDone(current.flow);
    if (!r) return;
    if (r.done) endSession();
    else showItem();
  }, durationMs);
}

// --- Results ---

function endSession() {
  clearTimer();
  const results = current.flow.results;
  const errors = results.filter(r => !r.correct).map(r => r.key);
  saveLastErrors(errors);

  current.passed = current.type === 'exam' && errors.length <= 1;
  if (current.passed) completeCell(current.track, current.level, current.tier);

  showScreen('results');
  renderResults();
}

function renderResults() {
  const container = document.getElementById('screen-results');
  const results = current.flow.results;
  const correct = results.filter(r => r.correct).length;
  const total = results.length;
  const clean = correct === total;

  const rows = results.map(r => {
    const f = parseKey(r.key);
    const stats = getFactStats(r.key);
    const slow = r.correct && r.time !== null && r.time > current.tier * 0.8;
    const statusClass = r.correct ? (slow ? 'slow' : 'correct') : 'wrong';
    return `
      <div class="result-row ${statusClass}">
        <span class="result-icon">${r.correct ? '✓' : '×'}</span>
        <span class="result-word">${f.display}</span>
        <span class="result-time">${r.time === null ? '—' : (r.time / 1000).toFixed(1) + 's'}</span>
        <button class="btn-star ${stats.focused ? 'focused' : ''}" data-key="${r.key}">★</button>
      </div>`;
  }).join('');

  const header = current.type === 'exam'
    ? (current.passed ? 'Gehaald!' : `${correct} / ${total} — nog niet gehaald`)
    : `${correct} / ${total}`;

  const toetsPrompt = current.type === 'practice' && clean
    ? '<button class="btn btn-primary" id="btn-start-toets">Klaar voor de toets?</button>'
    : '';

  container.innerHTML = `
    <div class="results-header"><h2>${header}</h2></div>
    <div class="results-list">${rows}</div>
    ${toetsPrompt}
    <button class="btn btn-secondary" id="btn-back-home">Terug</button>
  `;

  container.querySelectorAll('.btn-star').forEach(btn => {
    btn.addEventListener('click', () => {
      // The same fact can appear in several rows — sync every star for it
      const stats = toggleFocus(btn.dataset.key);
      container.querySelectorAll('.btn-star').forEach(b => {
        if (b.dataset.key === btn.dataset.key) b.classList.toggle('focused', stats.focused);
      });
    });
  });

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
          <div class="settings-item-label">Voortgang overzetten</div>
          <div class="settings-item-desc">Kopieer deze tekst naar een ander apparaat</div>
        </div>
      </div>
      <textarea class="export-area" id="export-area"></textarea>
      <button class="btn btn-secondary" id="btn-export">Exporteren</button>
      <button class="btn btn-secondary" id="btn-import">Importeren</button>
      <div id="import-status"></div>
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

  document.getElementById('stepper-down').addEventListener('click', () => {
    const s = getSettings();
    if (s.itemsPerSession > 5) {
      saveSettings({ ...s, itemsPerSession: s.itemsPerSession - 5 });
      document.getElementById('stepper-value').textContent = s.itemsPerSession - 5;
    }
  });

  document.getElementById('stepper-up').addEventListener('click', () => {
    const s = getSettings();
    if (s.itemsPerSession < 50) {
      saveSettings({ ...s, itemsPerSession: s.itemsPerSession + 5 });
      document.getElementById('stepper-value').textContent = s.itemsPerSession + 5;
    }
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
}

// --- Init ---

initTrackSelect();
initVandaag();
document.getElementById('btn-settings').addEventListener('click', () => {
  showScreen('settings');
  renderSettings();
});
renderMatrix();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
