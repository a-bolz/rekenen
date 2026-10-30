// blocks.js — interactive block manipulative, shown in practice when the
// timer expires. Minus: drag the red group onto the blues; pairs cancel and
// the remainder stands. Plus: drag to connect; blocks re-flow into tens
// structure (full rows of 10 + remainder).

export const BLOCK = 30, GAP = 4, PER_ROW = 10;
const ROW_H = BLOCK + GAP + 2;

export function posOf(i) {
  return { x: (i % PER_ROW) * (BLOCK + GAP), y: Math.floor(i / PER_ROW) * ROW_H };
}

export function rowsNeeded(n) {
  return Math.max(1, Math.ceil(n / PER_ROW));
}

// Minus: the b red blocks land on the LAST b blue positions.
export function minusTargets(a, b) {
  const out = [];
  for (let j = 0; j < b; j++) out.push(a - b + j);
  return out;
}

export function tensSplit(n) {
  return { tens: Math.floor(n / PER_ROW), rest: n % PER_ROW };
}

export function canManipulate(f) {
  return (f.op === '+' || f.op === '-')
    && f.a <= 20 && f.b <= 20 && f.answer >= 0 && f.answer <= 20;
}

function makeBlock(cls, i) {
  const d = document.createElement('div');
  d.className = `block ${cls}`;
  const p = posOf(i);
  d.style.transform = `translate(${p.x}px, ${p.y}px)`;
  return d;
}

export function createManipulative(f, onReset) {
  const plus = f.op === '+';
  const { a, b } = f;

  const wrap = document.createElement('div');
  wrap.className = 'blocks-wrap';

  const stage = document.createElement('div');
  stage.className = 'blocks-stage';
  const stageW = PER_ROW * (BLOCK + GAP) - GAP;
  stage.style.width = `${stageW}px`;

  const aBlocks = [], bBlocks = [];
  for (let i = 0; i < a; i++) {
    const d = makeBlock('block-a', i);
    stage.appendChild(d);
    aBlocks.push(d);
  }
  const aHeight = rowsNeeded(a) * ROW_H;

  const grp = document.createElement('div');
  grp.className = 'block-group';
  const restY = aHeight + 26;
  let gx = 0, gy = restY;
  grp.style.transform = `translate(0px, ${restY}px)`;
  for (let j = 0; j < b; j++) {
    const d = makeBlock(plus ? 'block-plus' : 'block-min', j);
    grp.appendChild(d);
    bBlocks.push(d);
  }
  stage.appendChild(grp);
  stage.style.height = `${restY + rowsNeeded(b) * ROW_H + 6}px`;

  let merged = false;
  let drag = null;

  function merge() {
    merged = true;
    stage.classList.add('merged');
    grp.style.transition = '';
    grp.style.transform = 'translate(0px, 0px)';
    if (plus) {
      bBlocks.forEach((d, j) => {
        const p = posOf(a + j);
        d.style.transform = `translate(${p.x}px, ${p.y}px)`;
      });
      const { tens } = tensSplit(a + b);
      for (let t = 0; t < tens; t++) {
        const ten = document.createElement('div');
        ten.className = 'ten-row';
        ten.style.width = `${stageW + 8}px`;
        ten.style.transform = `translate(-4px, ${t * ROW_H - 4}px)`;
        stage.appendChild(ten);
      }
      stage.style.height = `${rowsNeeded(a + b) * ROW_H + 6}px`;
    } else {
      const targets = minusTargets(a, b);
      bBlocks.forEach((d, j) => {
        const p = posOf(targets[j]);
        d.style.transform = `translate(${p.x}px, ${p.y}px)`;
        d.classList.add('cancel');
        aBlocks[targets[j]].classList.add('cancelled');
      });
      stage.style.height = `${aHeight + 6}px`;
    }
  }

  grp.addEventListener('pointerdown', e => {
    // Ignore extra fingers: one pointer owns the drag until it lifts
    if (merged || b === 0 || drag) return;
    e.preventDefault();
    try { grp.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: gx, oy: gy };
    grp.classList.add('dragging');
  });
  const onMove = e => {
    if (!drag || e.pointerId !== drag.id) return;
    gx = drag.ox + (e.clientX - drag.sx);
    gy = drag.oy + (e.clientY - drag.sy);
    grp.style.transition = 'none';
    grp.style.transform = `translate(${gx}px, ${gy}px)`;
  };
  const onUp = e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    grp.classList.remove('dragging');
    grp.style.transition = '';
    if (gy < aHeight + 8) {
      merge();
    } else {
      gx = 0;
      gy = restY;
      grp.style.transform = `translate(0px, ${restY}px)`;
    }
  };
  // System gestures (notification swipe, app switcher, palm rejection) fire
  // pointercancel instead of pointerup — always spring back, never merge.
  const onCancel = e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    grp.classList.remove('dragging');
    grp.style.transition = '';
    gx = 0;
    gy = restY;
    grp.style.transform = `translate(0px, ${restY}px)`;
  };
  grp.addEventListener('pointermove', onMove);
  grp.addEventListener('pointerup', onUp);
  grp.addEventListener('pointercancel', onCancel);
  // Fallback for environments where pointer capture is unavailable
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onCancel);

  wrap.appendChild(stage);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'blocks-reset';
  resetBtn.textContent = '↺';
  resetBtn.addEventListener('click', () => onReset && onReset());
  wrap.appendChild(resetBtn);

  // Shrink to the viewport: the fixed 10-wide stage plus reset button must
  // fit portrait phones (320-430px), and in solo mode the keypad must stay
  // reachable, so vertical overflow also folds into the zoom. Applied once
  // mounted; the session screen's overflow-y:auto remains the backstop.
  requestAnimationFrame(() => {
    const host = wrap.parentElement;
    if (!host) return;
    const availW = host.clientWidth - 56; // reset button + gaps
    let zoom = availW > 0 ? Math.min(1, availW / stageW) : 1;
    const scr = document.getElementById('screen-session');
    if (scr && scr.contains(host) && scr.scrollHeight > scr.clientHeight) {
      const stageH = stage.offsetHeight;
      const targetH = stageH - (scr.scrollHeight - scr.clientHeight);
      if (stageH > 0 && targetH < stageH) zoom = Math.min(zoom, targetH / stageH);
    }
    if (zoom < 1) stage.style.zoom = Math.max(0.55, zoom);
  });

  return wrap;
}
