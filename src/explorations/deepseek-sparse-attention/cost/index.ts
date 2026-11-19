// Vanilla widget: attention cost of producing one new token when L tokens are already in context.
// Dense attention scores every key at full price, so it grows linearly. DSA scores every key with
// the cheap indexer (ratio r of the full price) and then runs real attention on only k of them.
// Costs are counted in units of "one key through main attention".
import type { Mount } from '~/widget';
import { tex } from '~/math/tex';

const VW = 480;
const VH = 250;
const L_ = 44;
const R_ = 64;
const T_ = 14;
const B_ = 40;
const LMAX = 131072;

const dense = (L: number) => L;
const idxPart = (L: number, r: number) => r * L;
const attnPart = (L: number, k: number) => Math.min(L, k);
const dsa = (L: number, k: number, r: number) => idxPart(L, r) + attnPart(L, k);
/** Total over a whole sequence of length L (each position t = 1..L attends once), as in prefill. */
const denseTotal = (L: number) => (L * (L + 1)) / 2;
const dsaTotal = (L: number, k: number, r: number) =>
  r * denseTotal(L) + (L <= k ? denseTotal(L) : (k * (k + 1)) / 2 + (L - k) * k);

const fmtL = (L: number) => (L >= 1024 ? `${Math.round(L / 1024)}K` : String(Math.round(L)));

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="dsc">
      <div class="dsc-ctl">
        <label><span>${tex('k')}</span><input class="dsc-k" type="range" min="9" max="14" value="11" /><output></output></label>
        <label><span>indexer cost per key</span><input class="dsc-r" type="range" min="2" max="100" value="30" /><output></output></label>
        <label><input class="dsc-z" type="checkbox" /> zoom y-axis ×10</label>
      </div>
      <div class="dsc-legend">
        <span><i class="dense"></i>dense attention</span>
        <span><i class="dsa"></i>DSA total</span>
        <span><i class="idx"></i>DSA indexer part</span>
      </div>
      <svg class="dsc-svg" viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Attention cost per new token against context length"></svg>
      <p class="dsc-read" aria-live="polite"></p>
    </div>
    <style>
      .dsc { font-size: .9rem; }
      .dsc-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.25rem; margin-bottom: .5rem; }
      .dsc-ctl label { display: flex; align-items: center; gap: .4rem; color: var(--muted); }
      .dsc-ctl input[type="range"] { width: 6.5rem; }
      .dsc-ctl output { font-family: var(--mono); color: var(--text); min-width: 3em; }
      .dsc-legend { display: flex; flex-wrap: wrap; gap: .3rem 1rem; font-size: .8rem; color: var(--muted); margin-bottom: .3rem; }
      .dsc-legend i { display: inline-block; width: 16px; height: 0; border-top: 2px solid; vertical-align: middle; margin-right: .35rem; }
      .dsc-legend i.dense { border-color: var(--muted); }
      .dsc-legend i.dsa { border-color: var(--accent); }
      .dsc-legend i.idx { border-color: var(--accent); border-top-style: dashed; }
      .dsc-svg { display: block; width: 100%; height: auto; touch-action: none; cursor: crosshair; }
      .dsc-read { margin: .4rem 0 0; font-size: .85rem; min-height: 4.2em; }
      .dsc-read b { font-family: var(--mono); font-weight: 600; }
    </style>`;

  const svg = el.querySelector<SVGSVGElement>('.dsc-svg')!;
  const kIn = el.querySelector<HTMLInputElement>('.dsc-k')!;
  const rIn = el.querySelector<HTMLInputElement>('.dsc-r')!;
  const zIn = el.querySelector<HTMLInputElement>('.dsc-z')!;
  let yMax = LMAX;
  const clipId = `dsc-clip-${Math.random().toString(36).slice(2)}`;
  const [kOut, rOut] = el.querySelectorAll('output');
  const read = el.querySelector('.dsc-read')!;

  let at = 65536;

  const px = (L: number) => L_ + (L / LMAX) * (VW - L_ - R_);
  const py = (c: number) => VH - B_ - (c / yMax) * (VH - T_ - B_);

  function path(f: (L: number) => number) {
    const pts: string[] = [];
    for (let i = 0; i <= 200; i++) {
      const L = (i / 200) * LMAX;
      pts.push(`${i ? 'L' : 'M'}${px(L).toFixed(1)} ${py(f(L)).toFixed(1)}`);
    }
    return pts.join('');
  }

  function draw() {
    const k = 2 ** Number(kIn.value);
    const r = 1 / Number(rIn.value);
    kOut.textContent = fmtL(k);
    rOut.textContent = `1/${rIn.value}`;
    yMax = zIn.checked ? LMAX / 10 : LMAX;

    const parts: string[] = [
      `<clipPath id="${clipId}"><rect x="${L_}" y="${T_ - 4}" width="${VW - L_ - R_ + 2}" height="${VH - T_ - B_ + 6}" /></clipPath>`,
    ];
    for (const c of [0, 0.25, 0.5, 0.75, 1]) {
      const y = py(c * yMax);
      parts.push(
        `<line x1="${L_}" x2="${VW - R_}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-width="${c ? 0.6 : 1}" />`,
        `<text x="${L_ - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${c === 0 ? '0' : `${+(c * (yMax / LMAX) * 100).toFixed(1)}%`}</text>`,
      );
    }
    for (const L of [0, 32768, 65536, 98304, 131072]) {
      parts.push(`<text x="${px(L)}" y="${VH - B_ + 16}" text-anchor="middle" font-size="11" fill="var(--muted)">${fmtL(L)}</text>`);
    }
    parts.push(
      `<text x="${VW - R_}" y="${VH - 4}" text-anchor="end" font-size="11" fill="var(--muted)">tokens already in context →</text>`,
      `<g clip-path="url(#${clipId})"><path d="${path(dense)}" fill="none" stroke="var(--muted)" stroke-width="2" />`,
      `<path d="${path((L) => idxPart(L, r))}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 3" />`,
      `<path d="${path((L) => dsa(L, k, r))}" fill="none" stroke="var(--accent)" stroke-width="2" /></g>`,
    );
    // Direct labels at the right end.
    const yd = py(dense(LMAX));
    const ys = py(dsa(LMAX, k, r));
    const yi = py(idxPart(LMAX, r));
    const labels = [
      { y: yd, t: 'dense' },
      { y: ys, t: 'DSA' },
      { y: yi, t: 'indexer' },
    ].filter((l) => l.y >= T_ - 4);
    // Nudge apart if they collide.
    labels.sort((a, b) => b.y - a.y);
    for (let i = 1; i < labels.length; i++) if (labels[i - 1].y - labels[i].y < 13) labels[i].y = labels[i - 1].y - 13;
    for (const l of labels) {
      parts.push(`<text x="${VW - R_ + 6}" y="${l.y + 4}" font-size="11" fill="var(--text)">${l.t}</text>`);
    }

    // Crosshair.
    const x = px(at);
    parts.push(
      `<line x1="${x}" x2="${x}" y1="${T_}" y2="${VH - B_}" stroke="var(--text)" stroke-opacity=".5" stroke-dasharray="2 3" />`,
      dense(at) <= yMax
        ? `<circle cx="${x}" cy="${py(dense(at))}" r="4" fill="var(--muted)" stroke="var(--surface)" stroke-width="2" />`
        : '',
      `<circle cx="${x}" cy="${py(dsa(at, k, r))}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" />`,
    );
    svg.innerHTML = parts.join('');

    const d = dense(at);
    const s = dsa(at, k, r);
    const prefill = denseTotal(at) / dsaTotal(at, k, r);
    read.innerHTML =
      `At <b>${fmtL(at)}</b> tokens of context, one new token costs <b>${fmtL(d)}</b> key-units dense vs ` +
      `<b>${fmtL(s)}</b> with DSA (${fmtL(idxPart(at, r))} indexer + ${fmtL(attnPart(at, k))} attention): ` +
      `<b>${(d / s).toFixed(1)}×</b> cheaper.<br>Over a whole ${fmtL(at)}-token prefill: <b>${prefill.toFixed(1)}×</b> cheaper. ` +
      `Ceiling as context grows: ${tex(`1/r = ${rIn.value}`)}×.`;
  }

  function pick(ev: PointerEvent) {
    const rect = svg.getBoundingClientRect();
    const xx = ((ev.clientX - rect.left) / rect.width) * VW;
    const L = ((xx - L_) / (VW - L_ - R_)) * LMAX;
    at = Math.round(Math.min(LMAX, Math.max(1024, L)) / 1024) * 1024;
    draw();
  }

  kIn.addEventListener('input', draw);
  rIn.addEventListener('input', draw);
  zIn.addEventListener('change', draw);
  svg.addEventListener('pointermove', pick);
  svg.addEventListener('pointerdown', pick);
  draw();

  return () => {
    kIn.removeEventListener('input', draw);
    rIn.removeEventListener('input', draw);
    zIn.removeEventListener('change', draw);
    svg.removeEventListener('pointermove', pick);
    svg.removeEventListener('pointerdown', pick);
  };
};
