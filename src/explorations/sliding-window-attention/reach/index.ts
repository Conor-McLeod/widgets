// Vanilla widget: how far back a token can "see" through a stack of sliding-window layers.
// Each layer lets information hop at most W−1 positions, so the receptive field is a cone that
// widens by W−1 per layer. A global layer anywhere in the stack opens it to the whole prefix.
import type { Mount } from '~/widget';

const N = 24;
const VW = 480;
const VH = 290;
const LEFT = 82;
const RIGHT = 12;
const TOP = 22;
const BOTTOM = 22;
const MAX_LAYERS = 6;
const dx = (VW - LEFT - RIGHT) / (N - 1);

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="swr">
      <div class="swr-ctl">
        <label><span>window W</span><input class="swr-w" type="range" min="1" max="8" value="4" /><output></output></label>
        <label><span>layers</span><input class="swr-l" type="range" min="1" max="${MAX_LAYERS}" value="3" /><output></output></label>
        <label><span>global layers</span>
          <select class="swr-g">
            <option value="0">none</option>
            <option value="2">every 2nd</option>
            <option value="3">every 3rd</option>
          </select>
        </label>
      </div>
      <svg class="swr-svg" viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Receptive field through stacked layers"></svg>
      <p class="swr-read" aria-live="polite"></p>
    </div>
    <style>
      .swr { font-size: .9rem; }
      .swr-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.25rem; margin-bottom: .5rem; }
      .swr-ctl label { display: flex; align-items: center; gap: .4rem; color: var(--muted); }
      .swr-ctl input { width: 6.5rem; }
      .swr-ctl output { font-family: var(--mono); color: var(--text); min-width: 1em; }
      .swr-ctl select { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: .2rem .3rem; }
      .swr-svg { display: block; width: 100%; height: auto; touch-action: none; }
      .swr-read { margin: .4rem 0 0; font-family: var(--mono); font-size: .85rem; min-height: 2.8em; }
    </style>`;

  const svg = el.querySelector<SVGSVGElement>('.swr-svg')!;
  const wIn = el.querySelector<HTMLInputElement>('.swr-w')!;
  const lIn = el.querySelector<HTMLInputElement>('.swr-l')!;
  const gIn = el.querySelector<HTMLSelectElement>('.swr-g')!;
  const [wOut, lOut] = el.querySelectorAll('output');
  const read = el.querySelector('.swr-read')!;

  let target = N - 1;

  const x = (p: number) => LEFT + p * dx;

  function draw() {
    const W = Number(wIn.value);
    const L = Number(lIn.value);
    const every = Number(gIn.value);
    wOut.textContent = String(W);
    lOut.textContent = String(L);

    const isGlobal = (l: number) => l > 0 && every > 0 && l % every === 0;
    // Row r = 0 is the input embeddings, row r = l is the output of layer l.
    const y = (r: number) => VH - BOTTOM - (r / L) * (VH - TOP - BOTTOM);

    // lo[r]: earliest position in row r that can influence the target at the top.
    const lo: number[] = new Array(L + 1);
    lo[L] = target;
    for (let l = L; l >= 1; l--) lo[l - 1] = isGlobal(l) ? 0 : Math.max(0, lo[l] - (W - 1));

    const parts: string[] = [];

    // The cone, drawn as one polygon from the top token down to the input row.
    const pts: string[] = [];
    for (let r = L; r >= 0; r--) pts.push(`${x(lo[r]) - 7},${y(r)}`);
    for (let r = 0; r <= L; r++) pts.push(`${x(target) + 7},${y(r)}`);
    parts.push(`<polygon points="${pts.join(' ')}" fill="var(--accent-soft)" stroke="none" />`);

    // Edges for the top layer: the target reads its window (or everything, if global).
    const topLo = lo[L - 1];
    for (let k = topLo; k <= target; k++) {
      parts.push(
        `<line x1="${x(target)}" y1="${y(L)}" x2="${x(k)}" y2="${y(L - 1)}" stroke="var(--accent)" stroke-opacity=".55" />`,
      );
    }

    for (let r = 0; r <= L; r++) {
      const label = r === 0 ? 'input' : `L${r}${isGlobal(r) ? ' global' : ' local'}`;
      parts.push(
        `<text x="4" y="${y(r) + 4}" font-size="13" fill="${isGlobal(r) ? 'var(--danger)' : 'var(--muted)'}">${label}</text>`,
      );
      for (let p = 0; p < N; p++) {
        const on = p >= lo[r] && p <= target;
        const isT = r === L && p === target;
        parts.push(
          `<circle cx="${x(p)}" cy="${y(r)}" r="${isT ? 6.5 : 4.5}" fill="${on ? 'var(--accent)' : 'var(--border)'}"${
            r === L ? ` data-p="${p}" style="cursor:pointer"` : ''
          } />`,
        );
      }
    }
    for (let p = 0; p < N; p += 4) {
      parts.push(`<text x="${x(p)}" y="${VH - 4}" text-anchor="middle" font-size="11" fill="var(--muted)">${p}</text>`);
    }
    svg.innerHTML = parts.join('');

    const span = target - lo[0] + 1;
    const anyGlobal = Array.from({ length: L }, (_, i) => isGlobal(i + 1)).some(Boolean);
    const formula = anyGlobal
      ? 'a global layer sees the whole prefix'
      : `1 + L·(W−1) = 1 + ${L}·${W - 1} = ${1 + L * (W - 1)}` +
        (1 + L * (W - 1) > target + 1 ? ', cut off by the start of the text' : '');
    read.innerHTML = `output ${target} depends on inputs ${lo[0]}–${target} (${span} tokens)<br>reach: ${formula}`;
  }

  function pick(ev: PointerEvent) {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * VW;
    const p = Math.round((px - LEFT) / dx);
    if (p >= 0 && p < N && p !== target) {
      target = p;
      draw();
    }
  }

  wIn.addEventListener('input', draw);
  lIn.addEventListener('input', draw);
  gIn.addEventListener('change', draw);
  svg.addEventListener('pointermove', pick);
  svg.addEventListener('pointerdown', pick);
  draw();

  return () => {
    wIn.removeEventListener('input', draw);
    lIn.removeEventListener('input', draw);
    gIn.removeEventListener('change', draw);
    svg.removeEventListener('pointermove', pick);
    svg.removeEventListener('pointerdown', pick);
  };
};
