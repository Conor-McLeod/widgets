// Vanilla widget: a d = 16 sinusoidal positional encoding drawn as 8 clock hands, one per
// (sin, cos) pair. Hand i sits at angle p·ω_i, so the fast hands spin and the slow ones barely move.
// An optional offset k draws a ghost hand at p + k; the arc between them is k·ω_i whatever p is.
import type { Mount } from '~/widget';
import { svgLabel, tex } from '~/math/tex';

const D = 16;
const PAIRS = D / 2;
const BASE = 10000;
const MAX_POS = 200;
const omega = (i: number) => BASE ** (-(2 * i) / D);

const CELL_W = 150;
const CELL_H = 178;
const R = 50;
const CX = CELL_W / 2;
const CY = 68;

const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2));

export const mount: Mount = (el) => {
  // Four dials per row normally, two on a narrow column so the labels stay legible.
  const colsFor = () => (el.clientWidth && el.clientWidth < 480 ? 2 : 4);
  let COLS = colsFor();
  el.innerHTML = `
    <div class="pc">
      <div class="pc-ctl">
        <button class="pc-play" type="button">play</button>
        <label>
          <span>position ${tex('p')}</span>
          <input class="pc-p" type="range" min="0" max="${MAX_POS}" step="1" value="0" />
          <output class="pc-pv"></output>
        </label>
        <label>
          <span>offset ${tex('k')}</span>
          <input class="pc-k" type="range" min="0" max="20" step="1" value="0" />
          <output class="pc-kv"></output>
        </label>
      </div>
      <svg class="pc-svg" role="img"
        aria-label="Eight clock hands, one per frequency of the positional encoding"></svg>
    </div>
    <style>
      .pc { font-size: .9rem; }
      .pc-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem 1.2rem; color: var(--muted); }
      .pc-ctl label { display: flex; align-items: center; gap: .5rem; }
      .pc-ctl input { width: 9rem; }
      .pc-ctl output { font-family: var(--mono); color: var(--text); min-width: 3.5ch; }
      .pc-play { font: inherit; font-size: .85rem; color: var(--text); background: var(--bg); border: 1px solid var(--border);
        border-radius: 6px; padding: .25rem .7rem; cursor: pointer; min-width: 4.2rem; }
      .pc-play:hover { border-color: var(--accent); }
      .pc-svg { width: 100%; height: auto; display: block; margin-top: .6rem; }
      .pc-svg .num { font-family: var(--mono); font-size: 12px; fill: var(--muted); }
    </style>`;

  const pIn = el.querySelector<HTMLInputElement>('.pc-p')!;
  const kIn = el.querySelector<HTMLInputElement>('.pc-k')!;
  const pOut = el.querySelector('.pc-pv')!;
  const kOut = el.querySelector('.pc-kv')!;
  const play = el.querySelector<HTMLButtonElement>('.pc-play')!;
  const svg = el.querySelector('svg')!;

  let p = 0;
  let raf = 0;
  let last = 0;

  // Angle measured clockwise from 12 o'clock, so the hand's tip is (sin θ, cos θ) = (PE_2i, PE_2i+1).
  const tip = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];

  function arc(cx: number, cy: number, r: number, a0: number, delta: number) {
    const d = ((delta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (d < 1e-3) return '';
    const [x0, y0] = tip(cx, cy, r, a0);
    const [x1, y1] = tip(cx, cy, r, a0 + d);
    return `<path d="M${x0} ${y0} A${r} ${r} 0 ${d > Math.PI ? 1 : 0} 1 ${x1} ${y1}" fill="none"
      stroke="var(--danger)" stroke-width="3" stroke-linecap="round" opacity=".8" />`;
  }

  function draw() {
    const k = Number(kIn.value);
    pOut.textContent = Number.isInteger(p) ? String(p) : p.toFixed(1);
    kOut.textContent = String(k);

    svg.setAttribute('viewBox', `0 0 ${COLS * CELL_W} ${Math.ceil(PAIRS / COLS) * CELL_H}`);
    const parts: string[] = [];
    for (let i = 0; i < PAIRS; i++) {
      const ox = (i % COLS) * CELL_W;
      const oy = Math.floor(i / COLS) * CELL_H;
      const cx = ox + CX;
      const cy = oy + CY;
      const w = omega(i);
      const a = p * w;

      parts.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />`);
      for (let t = 0; t < 12; t++) {
        const [x0, y0] = tip(cx, cy, R - 4, (t * Math.PI) / 6);
        const [x1, y1] = tip(cx, cy, R, (t * Math.PI) / 6);
        parts.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="var(--border)" stroke-width="1.5" />`);
      }

      if (k > 0) {
        const kw = k * w;
        parts.push(arc(cx, cy, R + 7, a, kw));
        const [gx, gy] = tip(cx, cy, R - 8, a + kw);
        parts.push(`<line x1="${cx}" y1="${cy}" x2="${gx}" y2="${gy}" stroke="var(--danger)" stroke-width="2.5"
          stroke-linecap="round" stroke-dasharray="4 3" />`);
      }
      const [hx, hy] = tip(cx, cy, R - 8, a);
      parts.push(
        `<line x1="${cx}" y1="${cy}" x2="${hx}" y2="${hy}" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round" />`,
        `<circle cx="${cx}" cy="${cy}" r="3.5" fill="var(--text)" />`,
      );

      const period = (2 * Math.PI) / w;
      parts.push(
        svgLabel(cx, oy + 134, tex(`i=${i},\\ \\lambda \\approx ${period < 100 ? period.toFixed(1) : Math.round(period)}`), {
          anchor: 'middle',
          width: CELL_W,
          style: 'font-size: 12.5px; color: var(--text)',
        }),
      );
      const deg = (k * w * 180) / Math.PI;
      const sub =
        k > 0
          ? `k\\omega_{${i}} = ${deg >= 360 ? `${(deg / 360).toFixed(1)}\\text{ turns}` : `${deg.toFixed(deg < 10 ? 1 : 0)}^\\circ`}`
          : `(${fmt(Math.sin(a))},\\ ${fmt(Math.cos(a))})`;
      parts.push(
        svgLabel(cx, oy + 156, tex(sub), {
          anchor: 'middle',
          width: CELL_W,
          style: `font-size: 11.5px; color: ${k > 0 ? 'var(--danger)' : 'var(--muted)'}`,
        }),
      );
    }
    svg.innerHTML = parts.join('');
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    play.textContent = 'play';
  }
  function step(t: number) {
    const dt = last ? Math.min(t - last, 100) : 16;
    last = t;
    p += dt / 250; // four positions per second
    if (p >= MAX_POS) {
      p = MAX_POS;
      pIn.value = String(p);
      draw();
      stop();
      return;
    }
    pIn.value = String(Math.round(p));
    draw();
    raf = requestAnimationFrame(step);
  }

  const onPlay = () => {
    if (raf) return stop();
    if (p >= MAX_POS) p = 0;
    last = 0;
    play.textContent = 'pause';
    raf = requestAnimationFrame(step);
  };
  const onP = () => {
    stop();
    p = Number(pIn.value);
    draw();
  };

  play.addEventListener('click', onPlay);
  pIn.addEventListener('input', onP);
  kIn.addEventListener('input', draw);
  const ro = new ResizeObserver(() => {
    const c = colsFor();
    if (c !== COLS) {
      COLS = c;
      draw();
    }
  });
  ro.observe(el);
  draw();

  return () => {
    ro.disconnect();
    stop();
    play.removeEventListener('click', onPlay);
    pIn.removeEventListener('input', onP);
    kIn.removeEventListener('input', draw);
  };
};
