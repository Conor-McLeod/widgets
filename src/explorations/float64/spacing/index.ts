// Vanilla widget: every representable positive number in a toy float format,
// drawn on a linear number line, so the spacing doubling at each power of two is visible.
import type { Mount } from '~/widget';

const MAX = 8;
const MIN_EXP = -2;
const LABELS: Record<number, string> = { 0.25: '¼', 0.5: '½' };

function representable(p: number): number[] {
  // Normal numbers 1.m × 2^e with p mantissa bits, e from MIN_EXP up to below MAX.
  const out: number[] = [];
  for (let e = MIN_EXP; 2 ** e < MAX; e++) {
    for (let m = 0; m < 2 ** p; m++) out.push((1 + m / 2 ** p) * 2 ** e);
  }
  return out;
}

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="sp">
      <label class="sp-ctl">
        <span>mantissa bits</span>
        <input type="range" min="0" max="5" value="2" />
        <output></output>
      </label>
      <svg class="sp-svg" viewBox="0 0 600 120" role="img"></svg>
      <p class="sp-readout">Hover the line.</p>
    </div>
    <style>
      .sp-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem .6rem; font-size: .9rem; color: var(--muted); }
      .sp-ctl output { font-family: var(--mono); color: var(--text); }
      .sp-svg { width: 100%; height: auto; display: block; margin-top: .75rem; touch-action: none; }
      .sp-readout { margin: .5rem 0 0; font-family: var(--mono); font-size: .85rem; min-height: 1.4em; }
    </style>`;

  const slider = el.querySelector('input')!;
  const output = el.querySelector('output')!;
  const svg = el.querySelector('svg')!;
  const readout = el.querySelector('.sp-readout')!;

  const W = 600;
  const PAD = 20;
  const x = (v: number) => PAD + (v / MAX) * (W - 2 * PAD);
  const v = (px: number) => ((px - PAD) / (W - 2 * PAD)) * MAX;

  let values: number[] = [];

  function draw() {
    const p = Number(slider.value);
    output.textContent = `${p} → ${2 ** p} per power of two`;
    values = representable(p);

    const parts: string[] = [`<line x1="${PAD}" x2="${W - PAD}" y1="70" y2="70" stroke="var(--border)" />`];
    for (let e = MIN_EXP; 2 ** e <= MAX; e++) {
      const b = 2 ** e;
      parts.push(
        `<line x1="${x(b)}" x2="${x(b)}" y1="30" y2="95" stroke="var(--muted)" stroke-dasharray="2 3" />`,
        `<text x="${x(b)}" y="112" text-anchor="middle" font-size="13" fill="var(--muted)">${LABELS[b] ?? b}</text>`,
      );
    }
    for (const val of values) {
      parts.push(`<line x1="${x(val)}" x2="${x(val)}" y1="55" y2="85" stroke="var(--accent)" stroke-width="1.5" />`);
    }
    parts.push(`<line class="hover" y1="40" y2="90" stroke="var(--danger)" stroke-width="2" visibility="hidden" />`);
    svg.innerHTML = parts.join('');
  }

  function onMove(ev: PointerEvent) {
    const rect = svg.getBoundingClientRect();
    const target = v(((ev.clientX - rect.left) / rect.width) * W);
    let best = values[0];
    for (const val of values) if (Math.abs(val - target) < Math.abs(best - target)) best = val;
    const i = values.indexOf(best);
    const gap = i + 1 < values.length ? values[i + 1] - best : NaN;
    const hover = svg.querySelector('.hover')!;
    hover.setAttribute('x1', String(x(best)));
    hover.setAttribute('x2', String(x(best)));
    hover.setAttribute('visibility', 'visible');
    readout.textContent = `nearest = ${best}   gap to next = ${Number.isNaN(gap) ? '—' : gap}`;
  }

  slider.addEventListener('input', draw);
  svg.addEventListener('pointermove', onMove);
  draw();

  return () => {
    slider.removeEventListener('input', draw);
    svg.removeEventListener('pointermove', onMove);
  };
};
