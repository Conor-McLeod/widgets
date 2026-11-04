// Vanilla widget: error of finite-difference derivatives of sin at x = 1, on log–log axes,
// as the step h shrinks. Truncation error falls with h until rounding error takes over.
import type { Mount } from '~/widget';

const X0 = 1;
const EXACT = Math.cos(X0);
const H_MIN = -16;
const H_MAX = 0;
const E_MIN = -17;
const E_MAX = 0;
const N = 400;

const W = 600;
const H = 300;
const L = 46;
const R = 12;
const T = 12;
const B = 34;

const fwd = (h: number) => (Math.sin(X0 + h) - Math.sin(X0)) / h;
const ctr = (h: number) => (Math.sin(X0 + h) - Math.sin(X0 - h)) / (2 * h);

const px = (lh: number) => L + ((lh - H_MIN) / (H_MAX - H_MIN)) * (W - L - R);
const py = (le: number) => T + ((E_MAX - Math.max(E_MIN, le)) / (E_MAX - E_MIN)) * (H - T - B);

function series(f: (h: number) => number) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const lh = H_MIN + ((H_MAX - H_MIN) * i) / N;
    const err = Math.abs(f(10 ** lh) - EXACT);
    pts.push([lh, err === 0 ? E_MIN : Math.log10(err)]);
  }
  return pts;
}

const path = (pts: [number, number][]) =>
  pts.map(([a, b], i) => `${i ? 'L' : 'M'}${px(a).toFixed(1)},${py(b).toFixed(1)}`).join('');

export const mount: Mount = (el) => {
  const grid: string[] = [];
  for (let e = H_MIN; e <= H_MAX; e += 2) {
    grid.push(
      `<line x1="${px(e)}" x2="${px(e)}" y1="${T}" y2="${H - B}" class="fd-grid"/>`,
      `<text x="${px(e)}" y="${H - B + 16}" text-anchor="middle" class="fd-tick">1e${e}</text>`,
    );
  }
  for (let e = E_MIN + 1; e <= E_MAX; e += 4) {
    grid.push(
      `<line x1="${L}" x2="${W - R}" y1="${py(e)}" y2="${py(e)}" class="fd-grid"/>`,
      `<text x="${L - 6}" y="${py(e) + 4}" text-anchor="end" class="fd-tick">1e${e}</text>`,
    );
  }

  el.innerHTML = `
    <div class="fd">
      <div class="fd-legend">
        <span class="fd-k fwd">forward difference (f(x+h) − f(x)) / h</span>
        <span class="fd-k ctr">central difference (f(x+h) − f(x−h)) / 2h</span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Error of finite differences against step size">
        ${grid.join('')}
        <text x="${(L + W - R) / 2}" y="${H - 3}" text-anchor="middle" class="fd-axis">step size h →</text>
        <text x="12" y="${(T + H - B) / 2}" text-anchor="middle" class="fd-axis" transform="rotate(-90 12 ${(T + H - B) / 2})">error</text>
        <path d="${path(series(fwd))}" class="fd-line fwd"/>
        <path d="${path(series(ctr))}" class="fd-line ctr"/>
        <line class="fd-cursor" y1="${T}" y2="${H - B}" visibility="hidden"/>
        <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="fd-hit"/>
      </svg>
      <dl class="fd-read">
        <dt>exact cos(1)</dt><dd>${EXACT.toPrecision(17)}</dd>
        <dt>h</dt><dd class="r-h">hover or drag the chart</dd>
        <dt>forward</dt><dd class="r-f">—</dd>
        <dt>central</dt><dd class="r-c">—</dd>
      </dl>
    </div>
    <style>
      .fd svg { display: block; width: 100%; height: auto; touch-action: none; font-family: var(--mono); }
      .fd-grid { stroke: var(--border); stroke-width: 1; }
      .fd-tick { fill: var(--muted); font-size: 11px; }
      .fd-axis { fill: var(--muted); font-size: 12px; font-family: var(--font); }
      .fd-line { fill: none; stroke-width: 1.6; stroke-linejoin: round; }
      .fd-line.fwd, .fd-k.fwd::before { stroke: var(--danger); background: var(--danger); }
      .fd-line.ctr, .fd-k.ctr::before { stroke: var(--accent); background: var(--accent); }
      .fd-cursor { stroke: var(--text); stroke-dasharray: 3 3; }
      .fd-legend { display: flex; flex-wrap: wrap; gap: .25rem 1.25rem; font-size: .82rem; color: var(--muted); margin-bottom: .5rem; }
      .fd-k::before { content: ''; display: inline-block; width: 14px; height: 3px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
      .fd-read { display: grid; grid-template-columns: max-content 1fr; gap: .15rem 1rem; margin: .6rem 0 0; font-size: .82rem; }
      .fd-read dt { color: var(--muted); }
      .fd-read dd { margin: 0; font-family: var(--mono); overflow-wrap: anywhere; }
    </style>`;

  const svg = el.querySelector('svg')!;
  const cursor = el.querySelector<SVGLineElement>('.fd-cursor')!;
  const rh = el.querySelector('.r-h')!;
  const rf = el.querySelector('.r-f')!;
  const rc = el.querySelector('.r-c')!;

  // Show the digits that agree with the exact value, then the rest dimmed.
  const show = (v: number) => {
    const s = v.toPrecision(17);
    const e = EXACT.toPrecision(17);
    let i = 0;
    while (i < s.length && s[i] === e[i]) i++;
    const err = Math.abs(v - EXACT);
    return `${s.slice(0, i)}<span style="color:var(--danger)">${s.slice(i)}</span>  (error ${err === 0 ? '0' : err.toExponential(1)})`;
  };

  function onMove(ev: PointerEvent) {
    const rect = svg.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * W;
    const lh = Math.min(H_MAX, Math.max(H_MIN, H_MIN + ((x - L) / (W - L - R)) * (H_MAX - H_MIN)));
    const h = 10 ** lh;
    cursor.setAttribute('x1', String(px(lh)));
    cursor.setAttribute('x2', String(px(lh)));
    cursor.setAttribute('visibility', 'visible');
    rh.textContent = h.toExponential(2);
    rf.innerHTML = show(fwd(h));
    rc.innerHTML = show(ctr(h));
  }

  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerdown', onMove);
  return () => {
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerdown', onMove);
  };
};
