// Vanilla widget: the frequencies ω_i = 10000^(−2i/d) of every dimension pair, for a chosen d_model.
// The x axis is placed by 2i/d rather than i, so every d_model samples the same curve 10000^(−x):
// a bigger model just takes more, closer-spaced samples between ω = 1 and ω ≈ 1/10000.
import type { Mount } from '~/widget';
import { svgLabel, tex } from '~/math/tex';

const BASE = 10000;
const DIMS = [2, 4, 8, 16, 32, 64, 128, 256, 512];

const W = 600;
const H = 280;
const L = 74;
const R = 14;
const T = 14;
const B = 40;
const LOG_MIN = -4; // log10 of the smallest ω shown

// x = 2i/d ∈ [0, 1).
const sx = (x: number) => L + x * (W - L - R);
const omega = (i: number, d: number) => BASE ** (-(2 * i) / d);

// Number as TeX: plain decimals down to 0.001, scientific notation below that.
function numTex(v: number) {
  if (v >= 0.001) return v >= 100 ? String(Math.round(v)) : v.toPrecision(3);
  const e = Math.floor(Math.log10(v));
  return `${(v / 10 ** e).toFixed(2)} \\times 10^{${e}}`;
}

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="po">
      <div class="po-ctl">
        <label><span>${tex('d_{\\text{model}}')}</span>
          <input class="po-d" type="range" min="0" max="${DIMS.length - 1}" step="1" value="3" /><output class="po-dv"></output></label>
        <label><span>${tex('i')}</span>
          <input class="po-i" type="range" min="0" max="7" step="1" value="2" /><output class="po-iv"></output></label>
        <label class="po-check"><input class="po-log" type="checkbox" checked /><span>log scale</span></label>
      </div>
      <svg class="po-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="The frequency of each dimension pair"></svg>
      <div class="po-readout"><span class="po-r1"></span><span class="po-r2"></span></div>
    </div>
    <style>
      .po { font-size: .9rem; }
      .po-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem 1.4rem; color: var(--muted); }
      .po-ctl label { display: flex; align-items: center; gap: .5rem; }
      .po-ctl input[type=range] { width: 8rem; }
      .po-ctl output { font-family: var(--mono); color: var(--text); min-width: 3.5ch; }
      .po-check { cursor: pointer; }
      .po-svg { width: 100%; height: auto; display: block; margin-top: .6rem; cursor: pointer; touch-action: none; }
      .po-readout { display: flex; flex-wrap: wrap; gap: .2rem 1.6rem; margin-top: .3rem; min-height: 1.6em; }
    </style>`;

  const dIn = el.querySelector<HTMLInputElement>('.po-d')!;
  const iIn = el.querySelector<HTMLInputElement>('.po-i')!;
  const logIn = el.querySelector<HTMLInputElement>('.po-log')!;
  const dOut = el.querySelector('.po-dv')!;
  const iOut = el.querySelector('.po-iv')!;
  const r1 = el.querySelector('.po-r1')!;
  const r2 = el.querySelector('.po-r2')!;
  const svg = el.querySelector('svg')!;

  let dragging = false;

  function draw() {
    const d = DIMS[Number(dIn.value)];
    const pairs = d / 2;
    // Keep i where it is when d_model changes, unless the new model has no pair i.
    iIn.max = String(pairs - 1);
    if (Number(iIn.value) > pairs - 1) iIn.value = String(pairs - 1);
    const sel = Number(iIn.value);
    const log = logIn.checked;
    dOut.textContent = String(d);
    iOut.textContent = String(sel);

    const sy = (w: number) => {
      const f = log ? Math.log10(w) / LOG_MIN : 1 - w; // 0 at the top (ω = 1), 1 at the bottom
      return T + f * (H - T - B);
    };

    const parts: string[] = [];
    const label = (x: number, y: number, t: string, anchor: 'start' | 'middle' | 'end', w = 60) =>
      svgLabel(x, y, tex(t), { anchor, width: w, style: 'font-size: 13px; color: var(--muted)' });

    // y grid: decades on the log scale, quarters on the linear one.
    const yTicks = log ? [0, -1, -2, -3, -4].map((e) => [10 ** e, `10^{${e}}`] as const) : [1, 0.75, 0.5, 0.25, 0].map((v) => [v, String(v)] as const);
    for (const [v, t] of yTicks) {
      const y = log ? sy(v) : T + (1 - v) * (H - T - B);
      parts.push(
        `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--border)" ${v === (log ? 1e-4 : 0) ? '' : 'stroke-dasharray="2 4"'} />`,
        label(L - 6, y, t, 'end', 50),
      );
    }
    parts.push(label(14, T + (H - T - B) / 2, '\\omega_i', 'middle', 30));

    // x ticks in units of i: every pair when there are few, otherwise eight evenly spaced plus the last.
    const step = Math.max(1, pairs / 8);
    const xTicks = new Set<number>();
    for (let i = 0; i < pairs; i += step) xTicks.add(i);
    xTicks.add(pairs - 1);
    for (const i of xTicks) {
      const x = sx((2 * i) / d);
      parts.push(
        `<line x1="${x}" x2="${x}" y1="${H - B}" y2="${H - B + 4}" stroke="var(--border)" />`,
        label(x, H - B + 16, String(i), 'middle', 40),
      );
    }
    parts.push(svgLabel(W - R, H - 6, `pair index ${tex('i')}`, { anchor: 'end', width: 140, style: 'font-size: 12px; color: var(--muted)' }));

    // The continuous curve every d_model samples from.
    const curve: string[] = [];
    for (let k = 0; k <= 200; k++) {
      const x = k / 200;
      curve.push(`${sx(x).toFixed(1)},${sy(BASE ** -x).toFixed(1)}`);
    }
    parts.push(`<polyline points="${curve.join(' ')}" fill="none" stroke="var(--border)" stroke-width="1.5" />`);

    const w = omega(sel, d);
    const selX = sx((2 * sel) / d);
    const selY = sy(w);
    parts.push(
      `<line x1="${L}" x2="${selX}" y1="${selY}" y2="${selY}" stroke="var(--danger)" stroke-dasharray="4 3" opacity=".7" />`,
      `<line x1="${selX}" x2="${selX}" y1="${selY}" y2="${H - B}" stroke="var(--danger)" stroke-dasharray="4 3" opacity=".7" />`,
    );

    const r = d <= 32 ? 4.5 : d <= 128 ? 3 : 2;
    for (let i = 0; i < pairs; i++) {
      if (i === sel) continue;
      parts.push(`<circle cx="${sx((2 * i) / d).toFixed(1)}" cy="${sy(omega(i, d)).toFixed(1)}" r="${r}" fill="var(--accent)" />`);
    }
    parts.push(`<circle cx="${selX}" cy="${selY}" r="${Math.max(r + 2, 5.5)}" fill="var(--danger)" stroke="var(--bg)" stroke-width="1.5" />`);
    svg.innerHTML = parts.join('');

    r1.innerHTML = tex(`\\omega_{${sel}} = 10000^{-${2 * sel}/${d}} = ${numTex(w)}`);
    r2.innerHTML = tex(`\\lambda_{${sel}} = 2\\pi / \\omega_{${sel}} \\approx ${numTex((2 * Math.PI) / w)}`);
  }

  function pick(ev: PointerEvent) {
    const d = DIMS[Number(dIn.value)];
    const rect = svg.getBoundingClientRect();
    const x = (((ev.clientX - rect.left) / rect.width) * W - L) / (W - L - R);
    iIn.value = String(Math.round(Math.min(d / 2 - 1, Math.max(0, (x * d) / 2))));
    draw();
  }
  const onDown = (ev: PointerEvent) => {
    dragging = true;
    svg.setPointerCapture(ev.pointerId);
    pick(ev);
  };
  const onMove = (ev: PointerEvent) => {
    if (dragging) pick(ev);
  };
  const onUp = () => {
    dragging = false;
  };

  for (const c of [dIn, iIn, logIn]) c.addEventListener('input', draw);
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  draw();

  return () => {
    for (const c of [dIn, iIn, logIn]) c.removeEventListener('input', draw);
    svg.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
  };
};
