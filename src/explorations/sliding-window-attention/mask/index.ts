// Vanilla widget: the attention mask as an N×N grid (rows = queries, columns = keys).
// Compare full causal attention with a sliding window, optionally keeping a few "sink" tokens
// at the start visible to everyone. Hover or tap a row to see what that query can look at.
import type { Mount } from '~/widget';

const N = 24;
const SIZE = 400;
const M = 26; // margin for axis labels
const CELL = (SIZE - M) / N;

type Mode = 'full' | 'window';

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="swm">
      <div class="swm-ctl">
        <div class="swm-seg" role="group" aria-label="Attention pattern">
          <button data-mode="full">full causal</button>
          <button data-mode="window">sliding window</button>
        </div>
        <label class="swm-range"><span>window W</span><input class="swm-w" type="range" min="1" max="${N}" value="6" /><output></output></label>
        <label class="swm-range"><span>sink tokens</span><input class="swm-s" type="range" min="0" max="4" value="0" /><output></output></label>
      </div>
      <svg class="swm-svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Attention mask: rows are queries, columns are keys"></svg>
      <p class="swm-row" aria-live="polite"></p>
      <dl class="swm-stats"></dl>
    </div>
    <style>
      .swm { font-size: .9rem; }
      .swm-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.25rem; margin-bottom: .75rem; }
      .swm-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
      .swm-seg button { font: inherit; color: var(--muted); background: var(--bg); border: 0; padding: .3rem .7rem; cursor: pointer; }
      .swm-seg button + button { border-left: 1px solid var(--border); }
      .swm-seg button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
      .swm-range { display: flex; align-items: center; gap: .4rem; color: var(--muted); }
      .swm-range input { width: 7rem; }
      .swm-range output { font-family: var(--mono); color: var(--text); min-width: 1.5em; }
      .swm-range.off { opacity: .4; }
      .swm-svg { display: block; width: 100%; max-width: ${SIZE}px; height: auto; margin: 0 auto; touch-action: none; cursor: crosshair; }
      .swm-row { margin: .6rem 0 .4rem; font-family: var(--mono); font-size: .85rem; min-height: 1.4em; }
      .swm-stats { display: grid; grid-template-columns: max-content 1fr; gap: .2rem 1rem; margin: 0; font-size: .85rem; }
      .swm-stats dt { color: var(--muted); }
      .swm-stats dd { margin: 0; font-family: var(--mono); }
    </style>`;

  const svg = el.querySelector<SVGSVGElement>('.swm-svg')!;
  const wInput = el.querySelector<HTMLInputElement>('.swm-w')!;
  const sInput = el.querySelector<HTMLInputElement>('.swm-s')!;
  const [wOut, sOut] = el.querySelectorAll('output');
  const rowText = el.querySelector('.swm-row')!;
  const stats = el.querySelector('.swm-stats')!;
  const modeButtons = [...el.querySelectorAll<HTMLButtonElement>('.swm-seg button')];

  let mode: Mode = 'window';
  let query = N - 1;

  const W = () => Number(wInput.value);
  const S = () => Number(sInput.value);

  /** Can query q attend to key k? */
  function sees(q: number, k: number): 'window' | 'sink' | null {
    if (k > q) return null;
    if (mode === 'full') return 'window';
    if (k > q - W()) return 'window';
    if (k < S()) return 'sink';
    return null;
  }

  function draw() {
    const w = W();
    const s = S();
    wOut.textContent = String(w);
    sOut.textContent = String(s);
    for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    for (const r of el.querySelectorAll('.swm-range')) r.classList.toggle('off', mode === 'full');
    wInput.disabled = sInput.disabled = mode === 'full';

    const parts: string[] = [];
    let computed = 0;
    for (let q = 0; q < N; q++) {
      for (let k = 0; k < N; k++) {
        const v = sees(q, k);
        if (v) computed++;
        const x = M + k * CELL;
        const y = M + q * CELL;
        const sel = q === query;
        let fill = 'transparent';
        let op = 1;
        if (v) {
          fill = v === 'sink' ? 'var(--danger)' : 'var(--accent)';
          op = sel ? 1 : 0.45;
        } else if (k <= q) {
          // In the past but outside the window: dropped by the sliding window.
          fill = 'var(--border)';
          op = sel ? 0.9 : 0.5;
        }
        parts.push(
          `<rect x="${x + 0.75}" y="${y + 0.75}" width="${CELL - 1.5}" height="${CELL - 1.5}" rx="2" fill="${fill}" fill-opacity="${op}" />`,
        );
      }
    }
    // Faint diagonal marking the future (always masked by causality).
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

    // Readout for the selected row.
    const keys: number[] = [];
    for (let k = 0; k <= query; k++) if (sees(query, k)) keys.push(k);
    const lo = mode === 'full' ? 0 : Math.max(0, query - w + 1);
    const sinks = keys.filter((k) => k < lo);
    rowText.textContent =
      `token ${query} → keys ${lo}–${query}` +
      (sinks.length ? ` + sinks ${sinks.join(', ')}` : '') +
      `  (${keys.length} of ${query + 1})`;

    const full = (N * (N + 1)) / 2;
    const kv = mode === 'full' ? N : Math.min(N, w + s);
    stats.innerHTML = `
      <dt>scores computed</dt><dd>${computed} of ${full} for full causal (${Math.round((100 * computed) / full)}%)</dd>
      <dt>keys/values to keep</dt><dd>${kv} of ${N}${mode === 'window' ? ' — constant once the sequence is longer than W' : ' — grows with every token'}</dd>`;
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
    const m = (ev.currentTarget as HTMLButtonElement).dataset.mode as Mode;
    mode = m;
    draw();
  };

  for (const b of modeButtons) b.addEventListener('click', onMode);
  wInput.addEventListener('input', draw);
  sInput.addEventListener('input', draw);
  svg.addEventListener('pointermove', pick);
  svg.addEventListener('pointerdown', pick);
  draw();

  return () => {
    for (const b of modeButtons) b.removeEventListener('click', onMode);
    wInput.removeEventListener('input', draw);
    sInput.removeEventListener('input', draw);
    svg.removeEventListener('pointermove', pick);
    svg.removeEventListener('pointerdown', pick);
  };
};
