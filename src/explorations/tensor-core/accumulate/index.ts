// Vanilla widget: a long dot product of FP16 inputs, summed with an FP16 accumulator vs an FP32 one.
// The FP16 running sum stalls once its spacing outgrows the products being added.
import type { Mount } from '~/widget';

/** Round to the nearest IEEE half-precision value (ties to even), including subnormals and overflow. */
function fp16(x: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const ax = Math.abs(x);
  let e = Math.floor(Math.log2(ax));
  if (2 ** e > ax) e--;
  else if (2 ** (e + 1) <= ax) e++;
  const ulp = 2 ** (Math.max(e, -14) - 10);
  const q = ax / ulp;
  const f = Math.floor(q);
  const r = q - f > 0.5 || (q - f === 0.5 && f % 2 === 1) ? f + 1 : f;
  const y = r * ulp;
  return Math.sign(x) * (y > 65504 ? Infinity : y);
}

const MAX_K = 16384;
const W = 600;
const H = 260;
const L = 48;
const R = 12;
const T = 12;
const BOT = 28;

function inputs(): number[] {
  // Products of two FP16 numbers in [0, 1). Each product is exact in float64 (and in FP32).
  return Array.from({ length: MAX_K }, () => fp16(Math.random()) * fp16(Math.random()));
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3));

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="acc">
      <div class="acc-ctl">
        <label>
          <span>length of dot product</span>
          <input type="range" min="6" max="14" step="1" value="14" />
          <output></output>
        </label>
        <button type="button">New inputs</button>
      </div>
      <svg class="acc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Running sum of the dot product for each accumulator"></svg>
      <table class="acc-tab">
        <thead><tr><th>accumulator</th><th>final sum</th><th>error</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <style>
      .acc { font-size: .9rem; }
      .acc-ctl { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .4rem 1rem; color: var(--muted); }
      .acc-ctl label { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem .6rem; }
      .acc-ctl output { font-family: var(--mono); color: var(--text); }
      .acc-ctl button { font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: .25rem .65rem; cursor: pointer; }
      .acc-svg { width: 100%; height: auto; display: block; margin-top: .75rem; }
      .acc-tab { width: 100%; border-collapse: collapse; margin-top: .5rem; font-family: var(--mono); font-size: .82rem; }
      .acc-tab th { font-family: var(--font); font-weight: normal; color: var(--muted); text-align: left; padding: .15rem .4rem; border-bottom: 1px solid var(--border); }
      .acc-tab td { padding: .2rem .4rem; }
      .acc-tab td:first-child::before { content: ''; display: inline-block; width: .8em; height: 3px; margin-right: .45em; vertical-align: middle; background: var(--c); }
    </style>`;

  const slider = el.querySelector('input')!;
  const output = el.querySelector('output')!;
  const button = el.querySelector('button')!;
  const svg = el.querySelector('svg')!;
  const tbody = el.querySelector('tbody')!;

  let data = inputs();

  function draw() {
    const K = 2 ** Number(slider.value);
    output.textContent = K.toLocaleString('en-US');

    const exact = new Float64Array(K + 1);
    const f32 = new Float64Array(K + 1);
    const f16 = new Float64Array(K + 1);
    for (let k = 0; k < K; k++) {
      const p = data[k];
      exact[k + 1] = exact[k] + p;
      f32[k + 1] = Math.fround(f32[k] + p);
      f16[k + 1] = fp16(f16[k] + p);
    }

    const yMax = exact[K] * 1.08;
    const x = (k: number) => L + (k / K) * (W - L - R);
    const y = (v: number) => T + (1 - v / yMax) * (H - T - BOT);
    const stride = Math.max(1, Math.floor(K / 400));
    const line = (arr: Float64Array) => {
      const pts: string[] = [];
      for (let k = 0; k <= K; k += stride) pts.push(`${x(k).toFixed(1)},${y(arr[k]).toFixed(1)}`);
      pts.push(`${x(K).toFixed(1)},${y(arr[K]).toFixed(1)}`);
      return pts.join(' ');
    };

    const parts: string[] = [];
    // Horizontal guides at the powers of two the FP16 sum has crossed: its spacing doubles at each one.
    for (let p = 2 ** Math.ceil(Math.log2(yMax / 8)); p < yMax; p *= 2) {
      const ulp = 2 ** (Math.floor(Math.log2(p)) - 10);
      parts.push(
        `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" stroke="var(--border)" />`,
        `<text x="${L - 6}" y="${y(p) + 4}" text-anchor="end" font-size="12" fill="var(--muted)">${p}</text>`,
        `<text x="${W - R - 4}" y="${y(p) - 4}" text-anchor="end" font-size="11" fill="var(--muted)">FP16 gap ${ulp >= 1 ? ulp : `1/${1 / ulp}`}</text>`,
      );
    }
    parts.push(
      `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)" />`,
      `<text x="${L - 6}" y="${y(0) + 4}" text-anchor="end" font-size="12" fill="var(--muted)">0</text>`,
      `<text x="${L}" y="${H - 8}" font-size="12" fill="var(--muted)">k = 0</text>`,
      `<text x="${W - R}" y="${H - 8}" text-anchor="end" font-size="12" fill="var(--muted)">k = ${K.toLocaleString('en-US')}</text>`,
      `<polyline points="${line(exact)}" fill="none" stroke="var(--muted)" stroke-width="5" stroke-opacity=".35" stroke-linejoin="round" />`,
      `<polyline points="${line(f32)}" fill="none" stroke="var(--accent)" stroke-width="1.75" stroke-linejoin="round" />`,
      `<polyline points="${line(f16)}" fill="none" stroke="var(--danger)" stroke-width="1.75" stroke-linejoin="round" />`,
    );
    svg.innerHTML = parts.join('');

    const row = (name: string, c: string, v: number) => {
      const err = (v - exact[K]) / exact[K];
      return `<tr style="--c:${c}"><td>${name}</td><td>${fmt(v)}</td><td>${(err * 100).toFixed(err === 0 ? 0 : 3)}%</td></tr>`;
    };
    tbody.innerHTML =
      row('exact', 'color-mix(in srgb, var(--muted) 50%, transparent)', exact[K]) +
      row('FP32', 'var(--accent)', f32[K]) +
      row('FP16', 'var(--danger)', f16[K]);
  }

  const reroll = () => {
    data = inputs();
    draw();
  };
  slider.addEventListener('input', draw);
  button.addEventListener('click', reroll);
  draw();

  return () => {
    slider.removeEventListener('input', draw);
    button.removeEventListener('click', reroll);
  };
};
