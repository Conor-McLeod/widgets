// Vanilla widget: one block's largest magnitude, and the FP4 grid each format's scale lays over it.
// MXFP4's power-of-two scale lands the maximum anywhere in [4, 8), so it either wastes the top of
// the grid or clips; NVFP4's E4M3 scale puts it at (almost exactly) 6.
import type { Mount } from '~/widget';
import { svgLabel, tex } from '~/math/tex';
import { E2M1, E2M1_MAX, mxScale, nvScale, nvTensorScale, roundE2M1 } from '../fp4';

const H = 210;
const L = 16;
const R = 16;
const ROWS = [
  { key: 'mx', name: 'MXFP4', sub: 'scale = 2^k', y: 62 },
  { key: 'nv', name: 'NVFP4', sub: 'scale in E4M3', y: 162 },
] as const;
// Pretend the whole tensor's largest value is 16 (the slider's top), which fixes NVFP4's FP32 scale.
const TENSOR_SCALE = nvTensorScale(16);

const fmt = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(2) : v.toFixed(3)).replace(/\.?0+$/, '');

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="sc">
      <label class="sc-ctl">
        <span>largest value in the block</span>
        <input type="range" min="0" max="4" step="0.005" value="2.81" />
        <output></output>
      </label>
      <svg class="sc-svg" role="img" aria-label="FP4 grid scaled by each format's block scale"></svg>
      <table class="sc-tab">
        <thead><tr><th></th><th>scale</th><th>max ÷ scale</th><th>stored max</th><th>error</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <style>
      .sc { font-size: .9rem; }
      .sc-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem .6rem; color: var(--muted); }
      .sc-ctl input { flex: 1 1 12rem; min-width: 0; }
      .sc-ctl output { font-family: var(--mono); color: var(--text); min-width: 4.5em; }
      .sc-svg { width: 100%; height: auto; display: block; margin-top: .5rem; }
      .sc-tab { width: 100%; border-collapse: collapse; margin-top: .25rem; font-family: var(--mono); font-size: .82rem; }
      .sc-tab th { font-family: var(--font); font-weight: normal; color: var(--muted); text-align: left; padding: .15rem .3rem; border-bottom: 1px solid var(--border); }
      .sc-tab td { padding: .2rem .3rem; }
      .sc-tab td:first-child { font-family: var(--font); color: var(--muted); }
      .sc-tab .bad { color: var(--danger); }
    </style>`;

  const slider = el.querySelector('input')!;
  const output = el.querySelector('output')!;
  const svg = el.querySelector('svg')!;
  const tbody = el.querySelector('tbody')!;

  let W = 600;
  function draw() {
    W = Math.max(280, Math.round(svg.clientWidth || 600));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const a = 2 ** Number(slider.value);
    output.textContent = fmt(a);
    const D = 1.6 * a; // axis extent: always shows MXFP4's top grid point, which is at most 1.5a.
    const x = (v: number) => L + (v / D) * (W - L - R);

    const parts: string[] = [];
    const rows: string[] = [];
    for (const row of ROWS) {
      const s = row.key === 'mx' ? mxScale(a) : nvScale(a, TENSOR_SCALE);
      const q = roundE2M1(a / s) * s;
      const y = row.y;
      const top = E2M1_MAX * s;
      const err = (q - a) / a;

      parts.push(
        svgLabel(L, y - 46, `<b>${row.name}</b> <span style="color:var(--muted)">${tex(row.key === 'mx' ? '\\text{scale} = 2^{k}' : '\\text{scale} \\in \\text{E4M3}')}</span>`, {
          width: 300,
          style: 'font-size: 13px; color: var(--text)',
        }),
        // Beyond 6 × scale nothing can be represented: values there clip to the top grid point.
        `<rect x="${x(top)}" y="${y - 22}" width="${Math.max(0, x(D) - x(top))}" height="30" fill="var(--danger)" fill-opacity=".1" />`,
        `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--border)" />`,
      );
      for (const g of E2M1) {
        parts.push(`<line x1="${x(g * s)}" x2="${x(g * s)}" y1="${y - 12}" y2="${y + 4}" stroke="var(--accent)" stroke-width="1.5" />`);
        if (g >= 1 && (g !== 1.5 || x(1.5 * s) - x(s) >= 22)) {
          parts.push(`<text x="${x(g * s)}" y="${y - 16}" text-anchor="middle" font-size="11" fill="var(--accent)">${g}</text>`);
        }
      }
      // The true maximum, and the grid point it is stored as.
      parts.push(
        `<line x1="${x(a)}" x2="${x(a)}" y1="${y - 4}" y2="${y + 16}" stroke="var(--danger)" stroke-width="2" />`,
        `<path d="M ${x(a)} ${y + 16} L ${x(q)} ${y + 16}" stroke="var(--danger)" stroke-width="1.2" stroke-dasharray="3 2" />`,
        `<circle cx="${x(q)}" cy="${y}" r="4.5" fill="var(--danger)" />`,
        `<text x="${x(a)}" y="${y + 30}" text-anchor="middle" font-size="11" fill="var(--danger)">max</text>`,
      );

      rows.push(
        `<tr><td>${row.name}</td><td>${fmt(s)}</td><td class="${a / s > E2M1_MAX ? 'bad' : ''}">${(a / s).toFixed(2)}</td>` +
          `<td>${fmt(q)}</td><td class="${Math.abs(err) > 0.05 ? 'bad' : ''}">${(err * 100).toFixed(1)}%</td></tr>`,
      );
    }
    svg.innerHTML = parts.join('');
    tbody.innerHTML = rows.join('');
  }

  slider.addEventListener('input', draw);
  const ro = new ResizeObserver(() => draw());
  ro.observe(svg);
  draw();
  return () => {
    slider.removeEventListener('input', draw);
    ro.disconnect();
  };
};
