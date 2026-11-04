// Vanilla widget: the attention mask as an N×N grid (rows = queries, columns = keys), for dense
// attention, a sliding window, and DSA's per-query top-k. Cell shade is the weight dense attention
// would give that key. Blue cells are read; red cells are weight that is skipped.
import type { Mount } from '~/widget';
import { tex } from '~/math/tex';
import { type Method, select, softmax, trueLogits } from '../toy';

const N = 32;
const SIZE = 400;
const M = 26;
const CELL = (SIZE - M) / N;
const STEPS = 1000; // a fully warmed-up indexer

type Mode = 'dense' | 'window' | 'dsa';

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="dsm">
      <div class="dsm-ctl">
        <div class="dsm-seg" role="group" aria-label="Attention pattern">
          <button data-mode="dense">dense</button>
          <button data-mode="window">sliding window</button>
          <button data-mode="dsa">DSA top-k</button>
        </div>
        <label class="dsm-range"><span>${tex('k')} (keys per query)</span><input class="dsm-k" type="range" min="1" max="16" value="6" /><output></output></label>
      </div>
      <svg class="dsm-svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Attention mask: rows are queries, columns are keys"></svg>
      <p class="dsm-row" aria-live="polite"></p>
      <dl class="dsm-stats"></dl>
    </div>
    <style>
      .dsm { font-size: .9rem; }
      .dsm-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.25rem; margin-bottom: .75rem; }
      .dsm-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
      .dsm-seg button { font: inherit; color: var(--muted); background: var(--bg); border: 0; padding: .3rem .7rem; cursor: pointer; }
      .dsm-seg button + button { border-left: 1px solid var(--border); }
      .dsm-seg button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
      .dsm-range { display: flex; align-items: center; gap: .4rem; color: var(--muted); }
      .dsm-range input { width: 7rem; }
      .dsm-range output { font-family: var(--mono); color: var(--text); min-width: 1.5em; }
      .dsm-range.off { opacity: .4; }
      .dsm-svg { display: block; width: 100%; max-width: ${SIZE}px; height: auto; margin: 0 auto; touch-action: none; cursor: crosshair; }
      .dsm-row { margin: .6rem 0 .4rem; font-family: var(--mono); font-size: .82rem; min-height: 2.8em; }
      .dsm-stats { display: grid; grid-template-columns: max-content 1fr; gap: .2rem 1rem; margin: 0; font-size: .85rem; }
      .dsm-stats dt { color: var(--muted); }
      .dsm-stats dd { margin: 0; font-family: var(--mono); }
    </style>`;

  const svg = el.querySelector<SVGSVGElement>('.dsm-svg')!;
  const kIn = el.querySelector<HTMLInputElement>('.dsm-k')!;
  const kOut = el.querySelector('output')!;
  const rowText = el.querySelector('.dsm-row')!;
  const stats = el.querySelector('.dsm-stats')!;
  const modeButtons = [...el.querySelectorAll<HTMLButtonElement>('.dsm-seg button')];

  let mode: Mode = 'dsa';
  let query = N - 1;

  const weights = Array.from({ length: N }, (_, q) => softmax(trueLogits(q, 3)));

  function chosen(q: number, k: number): Set<number> {
    if (mode === 'dense') return new Set(Array.from({ length: q + 1 }, (_, i) => i));
    const m: Method = mode === 'window' ? 'window' : 'indexer';
    return select(m, q, k, STEPS, 3);
  }

  function draw() {
    const k = Number(kIn.value);
    kOut.textContent = String(k);
    for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    el.querySelector('.dsm-range')!.classList.toggle('off', mode === 'dense');
    kIn.disabled = mode === 'dense';

    const parts: string[] = [];
    let read = 0;
    let keptSum = 0;
    let farSum = 0;
    for (let q = 0; q < N; q++) {
      const sel = chosen(q, k);
      read += sel.size;
      const w = weights[q];
      let kept = 0;
      for (let s = 0; s <= q; s++) {
        const on = sel.has(s);
        if (on) kept += w[s];
        if (on && q - s >= k) farSum++;
        const xx = M + s * CELL;
        const yy = M + q * CELL;
        const shade = 0.12 + 0.88 * Math.sqrt(w[s] / Math.max(...w));
        const isRow = q === query;
        const fill = on ? 'var(--accent)' : 'var(--danger)';
        const op = on ? shade : shade * 0.55;
        parts.push(
          `<rect x="${xx + 0.75}" y="${yy + 0.75}" width="${CELL - 1.5}" height="${CELL - 1.5}" rx="2" fill="${fill}" fill-opacity="${
            isRow ? Math.min(1, op + 0.15) : op
          }" />`,
        );
        if (!on) {
          parts.push(
            `<rect x="${xx + 0.75}" y="${yy + 0.75}" width="${CELL - 1.5}" height="${CELL - 1.5}" rx="2" fill="none" stroke="var(--border)" stroke-width=".8" />`,
          );
        }
      }
      keptSum += kept;
    }
    parts.push(
      `<path d="M${M} ${M} L${M + N * CELL} ${M + N * CELL}" stroke="var(--border)" stroke-dasharray="3 3" />`,
      `<rect x="${M - 1}" y="${M + query * CELL - 0.5}" width="${N * CELL + 2}" height="${CELL + 1}" fill="none" stroke="var(--text)" stroke-width="1.5" rx="3" />`,
    );
    for (let i = 0; i < N; i += 4) {
      const c = M + i * CELL + CELL / 2;
      parts.push(
        `<text x="${c}" y="${M - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${i}</text>`,
        `<text x="${M - 6}" y="${c + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${i}</text>`,
      );
    }
    parts.push(
      `<text x="${M + N * CELL}" y="${M - 8}" text-anchor="end" font-size="11" fill="var(--muted)">key →</text>`,
      `<text x="2" y="11" font-size="10" fill="var(--muted)">q↓</text>`,
    );
    svg.innerHTML = parts.join('');

    const sel = [...chosen(query, k)].sort((a, b) => a - b);
    const w = weights[query];
    const kept = sel.reduce((a, s) => a + w[s], 0);
    rowText.textContent =
      `query ${query} reads ${sel.length} of ${query + 1}: ` +
      (mode === 'dense' ? `all of 0–${query}` : sel.join(', ')) +
      `\ncovers ${(100 * kept).toFixed(1)}% of its dense attention weight`;
    (rowText as HTMLElement).style.whiteSpace = 'pre-line';

    const full = (N * (N + 1)) / 2;
    stats.innerHTML = `
      <dt>main-attention scores</dt><dd>${read} of ${full} (${Math.round((100 * read) / full)}%)</dd>
      <dt>indexer scores</dt><dd>${mode === 'dsa' ? `${full}, but each is far cheaper` : 'none'}</dd>
      <dt>avg weight covered</dt><dd>${((100 * keptSum) / N).toFixed(1)}%</dd>
      <dt>reads beyond the last ${tex('k')}</dt><dd>${farSum}</dd>`;
  }

  function pick(ev: PointerEvent) {
    const rect = svg.getBoundingClientRect();
    const y = ((ev.clientY - rect.top) / rect.height) * SIZE;
    const q = Math.floor((y - M) / CELL);
    if (q >= 0 && q < N && q !== query) {
      query = q;
      draw();
    }
  }

  const onMode = (ev: Event) => {
    mode = (ev.currentTarget as HTMLButtonElement).dataset.mode as Mode;
    draw();
  };

  for (const b of modeButtons) b.addEventListener('click', onMode);
  kIn.addEventListener('input', draw);
  svg.addEventListener('pointermove', pick);
  svg.addEventListener('pointerdown', pick);
  draw();

  return () => {
    for (const b of modeButtons) b.removeEventListener('click', onMode);
    kIn.removeEventListener('input', draw);
    svg.removeEventListener('pointermove', pick);
    svg.removeEventListener('pointerdown', pick);
  };
};
