// Vanilla widget: one hidden unit over a 2D input plane. Drag the weight vectors w and v and
// compare a plain unit act(w·x), which only ever varies along w, with the gated unit
// Swish(w·x)·(v·x), which multiplies two directions together.
import type { Mount } from '~/widget';

type Vec = [number, number];
type Mode = 'relu' | 'swish' | 'swiglu' | 'bilinear';

const MODES: { id: Mode; label: string; formula: string }[] = [
  { id: 'relu', label: 'ReLU', formula: 'h = ReLU(w·x)' },
  { id: 'swish', label: 'Swish', formula: 'h = Swish(w·x)' },
  { id: 'swiglu', label: 'SwiGLU', formula: 'h = Swish(w·x) · (v·x)' },
  { id: 'bilinear', label: 'Bilinear', formula: 'h = (w·x) · (v·x)' },
];

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const swish = (x: number) => x * sigmoid(x);
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];

function unit(mode: Mode, x: Vec, w: Vec, v: Vec): number {
  const a = dot(w, x);
  const b = dot(v, x);
  switch (mode) {
    case 'relu':
      return Math.max(0, a);
    case 'swish':
      return swish(a);
    case 'swiglu':
      return swish(a) * b;
    case 'bilinear':
      return a * b;
  }
}

const S = 400; // viewBox size
const R = 3; // the plane spans [-R, R]²
const N = 50; // heatmap cells per side
const CELL = S / N;
const toPx = (p: Vec): Vec => [((p[0] + R) / (2 * R)) * S, ((R - p[1]) / (2 * R)) * S];
const toData = (px: number, py: number): Vec => [(px / S) * 2 * R - R, R - (py / S) * 2 * R];
const f2 = (n: number) => (n >= 0 ? ' ' : '') + n.toFixed(2);

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="gt">
      <div class="gt-modes" role="radiogroup" aria-label="Unit type">
        ${MODES.map((m) => `<button type="button" role="radio" data-mode="${m.id}">${m.label}</button>`).join('')}
      </div>
      <p class="gt-formula"></p>
      <svg class="gt-svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="Output of one hidden unit over a 2D input">
        <g class="gt-cells" shape-rendering="crispEdges"></g>
        <g class="gt-over"></g>
      </svg>
      <p class="gt-readout"></p>
    </div>
    <style>
      .gt { font-size: .9rem; }
      .gt-modes { display: flex; flex-wrap: wrap; gap: .4rem; }
      .gt-modes button { font: inherit; padding: .3rem .75rem; border-radius: 999px; cursor: pointer;
        border: 1px solid var(--border); background: var(--surface); color: var(--muted); }
      .gt-modes button[aria-checked=true] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
      .gt-formula { margin: .6rem 0 .4rem; font-family: var(--mono); }
      .gt-svg { width: 100%; max-width: 420px; height: auto; display: block; margin: 0 auto;
        border: 1px solid var(--border); border-radius: 6px; background: var(--surface); touch-action: none; user-select: none; }
      .gt-handle { cursor: grab; }
      .gt-readout { margin: .5rem auto 0; max-width: 420px; font-family: var(--mono); font-size: .8rem; min-height: 2.8em; white-space: pre-wrap; }
    </style>`;

  const buttons = [...el.querySelectorAll<HTMLButtonElement>('.gt-modes button')];
  const formula = el.querySelector('.gt-formula')!;
  const svg = el.querySelector('svg')!;
  const cellsG = el.querySelector('.gt-cells')!;
  const overG = el.querySelector('.gt-over')!;
  const readout = el.querySelector('.gt-readout')!;

  let mode: Mode = 'relu';
  const w: Vec = [1.4, 0.5];
  const v: Vec = [-0.5, 1.2];
  let dragging: 'w' | 'v' | null = null;
  let hover: Vec | null = null;

  // Build the grid of cells once; each frame only changes fill and opacity.
  const cells: { rect: SVGRectElement; x: Vec }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(j * CELL));
      rect.setAttribute('y', String(i * CELL));
      rect.setAttribute('width', String(CELL));
      rect.setAttribute('height', String(CELL));
      cellsG.appendChild(rect);
      cells.push({ rect, x: toData((j + 0.5) * CELL, (i + 0.5) * CELL) });
    }
  }

  // Line through the origin where u·x = 0, clipped to the square.
  function zeroLine(u: Vec, colour: string) {
    const len = Math.hypot(u[0], u[1]) || 1;
    const d: Vec = [(-u[1] / len) * R * 1.5, (u[0] / len) * R * 1.5];
    const [x1, y1] = toPx(d);
    const [x2, y2] = toPx([-d[0], -d[1]]);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colour}" stroke-width="1.5" stroke-dasharray="6 5" />`;
  }

  function arrow(u: Vec, colour: string, name: 'w' | 'v') {
    const [ox, oy] = toPx([0, 0]);
    const [tx, ty] = toPx(u);
    const lx = tx + (tx - ox) * 0.08 + 8;
    const ly = ty + (ty - oy) * 0.08 - 6;
    return `
      <line x1="${ox}" y1="${oy}" x2="${tx}" y2="${ty}" stroke="${colour}" stroke-width="3" />
      <circle class="gt-handle" data-h="${name}" cx="${tx}" cy="${ty}" r="11" fill="${colour}" stroke="var(--surface)" stroke-width="2" />
      <text x="${lx}" y="${ly}" font-size="16" font-weight="600" fill="${colour}" stroke="var(--surface)" stroke-width="3" paint-order="stroke">${name}</text>`;
  }

  function draw() {
    const gated = mode === 'swiglu' || mode === 'bilinear';
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
    formula.textContent = MODES.find((m) => m.id === mode)!.formula;

    const hs = cells.map((c) => unit(mode, c.x, w, v));
    const max = Math.max(1e-6, ...hs.map(Math.abs));
    cells.forEach((c, k) => {
      const h = hs[k];
      c.rect.setAttribute('fill', h >= 0 ? 'var(--accent)' : 'var(--danger)');
      c.rect.setAttribute('fill-opacity', (Math.abs(h) / max).toFixed(3));
    });

    const [ox, oy] = toPx([0, 0]);
    const o: string[] = [
      `<line x1="0" x2="${S}" y1="${oy}" y2="${oy}" stroke="var(--muted)" stroke-opacity=".4" />`,
      `<line x1="${ox}" x2="${ox}" y1="0" y2="${S}" stroke="var(--muted)" stroke-opacity=".4" />`,
      zeroLine(w, 'var(--text)'),
    ];
    if (gated) o.push(zeroLine(v, 'var(--muted)'));
    o.push(arrow(w, 'var(--text)', 'w'));
    if (gated) o.push(arrow(v, 'var(--muted)', 'v'));
    if (hover) {
      const [hx, hy] = toPx(hover);
      o.push(`<circle cx="${hx}" cy="${hy}" r="4" fill="none" stroke="var(--text)" stroke-width="1.5" />`);
    }
    o.push(
      `<text x="${S - 8}" y="${S - 10}" text-anchor="end" font-size="12" fill="var(--muted)" stroke="var(--surface)" stroke-width="3" paint-order="stroke">max |h| = ${max.toFixed(2)}</text>`,
    );
    overG.innerHTML = o.join('');

    if (hover) {
      const a = dot(w, hover);
      const b = dot(v, hover);
      const h = unit(mode, hover, w, v);
      readout.textContent =
        `x = (${hover[0].toFixed(2)}, ${hover[1].toFixed(2)})   w·x =${f2(a)}` +
        (gated ? `   v·x =${f2(b)}` : '') +
        `\n` +
        (mode === 'swiglu' ? `Swish(w·x) =${f2(swish(a))}   ` : '') +
        `h =${f2(h)}`;
    } else {
      readout.textContent = gated
        ? 'Drag w and v. Dashed lines are where w·x = 0 and v·x = 0.'
        : 'Drag w. The dashed line is where w·x = 0. Hover to read values.';
    }
  }

  function pointerData(ev: PointerEvent): Vec {
    const rect = svg.getBoundingClientRect();
    const p = toData(((ev.clientX - rect.left) / rect.width) * S, ((ev.clientY - rect.top) / rect.height) * S);
    return [Math.max(-R, Math.min(R, p[0])), Math.max(-R, Math.min(R, p[1]))];
  }

  function onDown(ev: PointerEvent) {
    const h = (ev.target as Element).getAttribute?.('data-h');
    if (h === 'w' || h === 'v') {
      dragging = h;
      svg.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    }
  }
  function onMove(ev: PointerEvent) {
    const p = pointerData(ev);
    if (dragging) {
      const target = dragging === 'w' ? w : v;
      target[0] = p[0];
      target[1] = p[1];
      hover = null;
    } else {
      hover = p;
    }
    draw();
  }
  function onUp(ev: PointerEvent) {
    if (dragging) svg.releasePointerCapture(ev.pointerId);
    dragging = null;
  }
  function onLeave() {
    if (dragging) return;
    hover = null;
    draw();
  }
  function onMode(ev: Event) {
    const m = (ev.currentTarget as HTMLButtonElement).dataset.mode as Mode;
    mode = m;
    draw();
  }

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  svg.addEventListener('pointerleave', onLeave);
  for (const b of buttons) b.addEventListener('click', onMode);
  draw();

  return () => {
    svg.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onUp);
    svg.removeEventListener('pointerleave', onLeave);
    for (const b of buttons) b.removeEventListener('click', onMode);
  };
};
