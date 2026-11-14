// Vanilla widget: the dot product PE(p)·PE(q) for one fixed p against every q, normalised by d/2.
// Because sin·sin + cos·cos = cos(difference), the sum is Σ_i cos((p − q)ω_i): it depends only on
// p − q, so dragging p just slides the same curve along.
import type { Mount } from '~/widget';
import { svgLabel, tex } from '~/math/tex';

const N = 160;
const DIMS = [2, 4, 8, 16, 32, 64, 128, 256, 512];
const BASES = [10, 100, 1000, 10000, 100000];

const W = 600;
const H = 260;
const L = 44;
const R = 12;
const T = 14;
const B = 34;
const sx = (q: number) => L + (q / (N - 1)) * (W - L - R);
const sy = (v: number) => T + ((1 - v) / 2) * (H - T - B);

function sim(p: number, q: number, d: number, base: number) {
  let s = 0;
  for (let i = 0; i < d / 2; i++) s += Math.cos((p - q) * base ** (-(2 * i) / d));
  return s / (d / 2);
}

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="ps">
      <div class="ps-ctl">
        <label><span>${tex('p')}</span>
          <input class="ps-p" type="range" min="0" max="${N - 1}" step="1" value="40" /><output class="ps-pv"></output></label>
        <label><span>${tex('d_{\\text{model}}')}</span>
          <input class="ps-d" type="range" min="0" max="${DIMS.length - 1}" step="1" value="6" /><output class="ps-dv"></output></label>
        <label><span>base</span>
          <input class="ps-b" type="range" min="0" max="${BASES.length - 1}" step="1" value="3" /><output class="ps-bv"></output></label>
      </div>
      <svg class="ps-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Similarity of position p to every other position"></svg>
      <p class="ps-readout"></p>
    </div>
    <style>
      .ps { font-size: .9rem; }
      .ps-ctl { display: flex; flex-wrap: wrap; gap: .4rem 1.4rem; color: var(--muted); }
      .ps-ctl label { display: flex; align-items: center; gap: .5rem; }
      .ps-ctl input { width: 7.5rem; }
      .ps-ctl output { font-family: var(--mono); color: var(--text); min-width: 6ch; }
      .ps-svg { width: 100%; height: auto; display: block; margin-top: .6rem; cursor: crosshair; touch-action: none; }
      .ps-readout { margin: .3rem 0 0; font-family: var(--mono); font-size: .82rem; min-height: 1.4em; }
    </style>`;

  const pIn = el.querySelector<HTMLInputElement>('.ps-p')!;
  const dIn = el.querySelector<HTMLInputElement>('.ps-d')!;
  const bIn = el.querySelector<HTMLInputElement>('.ps-b')!;
  const pOut = el.querySelector('.ps-pv')!;
  const dOut = el.querySelector('.ps-dv')!;
  const bOut = el.querySelector('.ps-bv')!;
  const svg = el.querySelector('svg')!;
  const readout = el.querySelector('.ps-readout')!;

  let hoverQ: number | null = null;
  let dragging = false;

  const params = () => ({ p: Number(pIn.value), d: DIMS[Number(dIn.value)], base: BASES[Number(bIn.value)] });

  // The largest similarity any position at least `gap` steps away reaches: how distinguishable p is from far-off positions.
  function impostor(p: number, d: number, base: number, gap = 4) {
    let best = -Infinity;
    let at = -1;
    for (let q = 0; q < N; q++) {
      if (Math.abs(q - p) < gap) continue;
      const v = sim(p, q, d, base);
      if (v > best) [best, at] = [v, q];
    }
    return { best, at };
  }

  function draw() {
    const { p, d, base } = params();
    pOut.textContent = String(p);
    dOut.textContent = String(d);
    bOut.textContent = base.toLocaleString('en');

    const parts: string[] = [];
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      parts.push(
        `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--border)" ${v === 0 ? '' : 'stroke-dasharray="2 4"'} />`,
        svgLabel(L - 6, sy(v), tex(String(v)), { anchor: 'end', width: 34, style: 'font-size: 13px; color: var(--muted)' }),
      );
    }
    for (let q = 0; q < N; q += 20) {
      parts.push(svgLabel(sx(q), H - B + 14, tex(String(q)), { anchor: 'middle', width: 40, style: 'font-size: 13px; color: var(--muted)' }));
    }
    parts.push(svgLabel(W - R, H - 6, 'position <i>q</i>', { anchor: 'end', width: 120, style: 'font-size: 12px; color: var(--muted)' }));

    parts.push(`<line x1="${sx(p)}" x2="${sx(p)}" y1="${T}" y2="${H - B}" stroke="var(--accent)" stroke-dasharray="4 3" />`);

    const pts: string[] = [];
    for (let q = 0; q < N; q++) pts.push(`${sx(q).toFixed(1)},${sy(sim(p, q, d, base)).toFixed(1)}`);
    parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" />`);

    const imp = impostor(p, d, base);
    if (imp.at >= 0) {
      parts.push(`<circle cx="${sx(imp.at)}" cy="${sy(imp.best)}" r="4.5" fill="none" stroke="var(--danger)" stroke-width="2" />`);
    }

    if (hoverQ !== null) {
      const v = sim(p, hoverQ, d, base);
      parts.push(`<circle cx="${sx(hoverQ)}" cy="${sy(v)}" r="4" fill="var(--text)" />`);
      readout.textContent = `q = ${hoverQ}   p − q = ${p - hoverQ}   similarity = ${v.toFixed(3)}`;
    } else {
      readout.textContent =
        imp.at >= 0 ? `most similar position ≥ 4 away: q = ${imp.at} (similarity ${imp.best.toFixed(3)})` : '';
    }
    readout.setAttribute('style', `color: ${hoverQ === null ? 'var(--danger)' : 'var(--text)'}`);
    svg.innerHTML = parts.join('');
  }

  function qAt(ev: PointerEvent) {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    return Math.round(Math.min(N - 1, Math.max(0, ((x - L) / (W - L - R)) * (N - 1))));
  }
  const onMove = (ev: PointerEvent) => {
    hoverQ = qAt(ev);
    if (dragging) pIn.value = String(hoverQ);
    draw();
  };
  const onDown = (ev: PointerEvent) => {
    dragging = true;
    svg.setPointerCapture(ev.pointerId);
    onMove(ev);
  };
  const onUp = () => {
    dragging = false;
  };
  const onLeave = () => {
    if (dragging) return;
    hoverQ = null;
    draw();
  };

  for (const i of [pIn, dIn, bIn]) i.addEventListener('input', draw);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointerleave', onLeave);
  draw();

  return () => {
    for (const i of [pIn, dIn, bIn]) i.removeEventListener('input', draw);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointerleave', onLeave);
  };
};
