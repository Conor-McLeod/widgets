// Vanilla widget: the full positional-encoding matrix as a heatmap. Each column is a position,
// each row a dimension (sines then cosines, or interleaved), coloured from -1 (danger) through 0 (surface) to +1 (accent).
// One canvas pixel per entry, scaled up with nearest-neighbour so the stripes stay crisp.
import type { Mount } from '~/widget';
import { tex } from '~/math/tex';

const N = 128; // positions shown
const DIMS = [16, 32, 64, 128, 256, 512];
const BASES = [10, 100, 1000, 10000, 100000];

type RGB = [number, number, number];

// Which frequency and function a row shows. Interleaved is the paper's layout (sin, cos, sin, cos, ...);
// split puts all the sines first, then all the cosines, as many implementations do.
function row(dim: number, d: number, interleaved: boolean) {
  return interleaved
    ? { i: Math.floor(dim / 2), sin: dim % 2 === 0 }
    : { i: dim % (d / 2), sin: dim < d / 2 };
}
function pe(pos: number, dim: number, d: number, base: number, interleaved: boolean) {
  const { i, sin } = row(dim, d, interleaved);
  const a = pos * base ** (-(2 * i) / d);
  return sin ? Math.sin(a) : Math.cos(a);
}

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="ph">
      <div class="ph-ctl">
        <label><span>${tex('d_{\\text{model}}')}</span>
          <input class="ph-d" type="range" min="0" max="${DIMS.length - 1}" step="1" value="3" /><output class="ph-dv"></output></label>
        <label><span>base</span>
          <input class="ph-b" type="range" min="0" max="${BASES.length - 1}" step="1" value="3" /><output class="ph-bv"></output></label>
        <label><input class="ph-il" type="checkbox" /><span>interleave sin and cos</span></label>
      </div>
      <div class="ph-plot">
        <div class="ph-ylab">dimension ↓</div>
        <div class="ph-wrap">
          <canvas class="ph-cv"></canvas>
          <div class="ph-cross"></div>
        </div>
      </div>
      <div class="ph-xlab"><span>0</span><span>position →</span><span>${N - 1}</span></div>
      <div class="ph-legend"><span>−1</span><i></i><span>+1</span></div>
      <p class="ph-readout">Hover the map.</p>
    </div>
    <style>
      .ph { font-size: .9rem; }
      .ph-ctl { display: flex; flex-wrap: wrap; gap: .4rem 1.4rem; color: var(--muted); margin-bottom: .6rem; }
      .ph-ctl label { display: flex; align-items: center; gap: .5rem; }
      .ph-ctl input[type=range] { width: 8rem; }
      .ph-ctl output { font-family: var(--mono); color: var(--text); min-width: 6ch; }
      .ph-plot { display: flex; gap: .4rem; align-items: stretch; }
      .ph-ylab { writing-mode: vertical-rl; transform: rotate(180deg); font-size: .8rem; color: var(--muted); text-align: right; }
      .ph-wrap { position: relative; flex: 1; min-width: 0; }
      .ph-cv { display: block; width: 100%; aspect-ratio: 2 / 1; image-rendering: pixelated; border: 1px solid var(--border);
        border-radius: 4px; cursor: crosshair; touch-action: none; }
      .ph-cross { position: absolute; pointer-events: none; border: 1.5px solid var(--text); display: none; }
      .ph-xlab { display: flex; justify-content: space-between; font-size: .8rem; color: var(--muted); margin: .2rem 0 0 1.6rem; }
      .ph-legend { display: flex; align-items: center; gap: .5rem; font-family: var(--mono); font-size: .8rem; color: var(--muted);
        margin: .4rem 0 0 1.6rem; }
      .ph-legend i { width: 8rem; height: .6rem; border: 1px solid var(--border); border-radius: 3px;
        background: linear-gradient(to right, var(--danger), var(--surface), var(--accent)); }
      .ph-readout { margin: .5rem 0 0; font-family: var(--mono); font-size: .82rem; min-height: 2.8em; }
    </style>`;

  const dIn = el.querySelector<HTMLInputElement>('.ph-d')!;
  const bIn = el.querySelector<HTMLInputElement>('.ph-b')!;
  const ilIn = el.querySelector<HTMLInputElement>('.ph-il')!;
  const dOut = el.querySelector('.ph-dv')!;
  const bOut = el.querySelector('.ph-bv')!;
  const cv = el.querySelector('canvas')!;
  const cross = el.querySelector<HTMLDivElement>('.ph-cross')!;
  const readout = el.querySelector('.ph-readout')!;
  const ctx = cv.getContext('2d')!;

  // Resolve theme tokens to RGB by letting the canvas parse them.
  function color(name: string): RGB {
    const css = getComputedStyle(el).getPropertyValue(name).trim() || '#888';
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    const hex = String(ctx.fillStyle);
    if (hex.startsWith('#')) return [1, 3, 5].map((j) => parseInt(hex.slice(j, j + 2), 16)) as RGB;
    const m = hex.match(/\d+(\.\d+)?/g)!.map(Number);
    return [m[0], m[1], m[2]];
  }

  const params = () => ({ d: DIMS[Number(dIn.value)], base: BASES[Number(bIn.value)], il: ilIn.checked });

  function draw() {
    const { d, base, il } = params();
    dOut.textContent = String(d);
    bOut.textContent = base.toLocaleString('en');
    const neg = color('--danger');
    const mid = color('--surface');
    const pos = color('--accent');
    cv.width = N;
    cv.height = d;
    const img = ctx.createImageData(N, d);
    for (let dim = 0; dim < d; dim++) {
      for (let x = 0; x < N; x++) {
        const v = pe(x, dim, d, base, il);
        const [to, t] = v < 0 ? [neg, -v] : [pos, v];
        const o = (dim * N + x) * 4;
        for (let c = 0; c < 3; c++) img.data[o + c] = mid[c] + (to[c] - mid[c]) * t;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    cross.style.display = 'none';
    readout.textContent = 'Hover the map.';
  }

  function onMove(ev: PointerEvent) {
    const { d, base, il } = params();
    const r = cv.getBoundingClientRect();
    const x = Math.min(N - 1, Math.max(0, Math.floor(((ev.clientX - r.left) / r.width) * N)));
    const dim = Math.min(d - 1, Math.max(0, Math.floor(((ev.clientY - r.top) / r.height) * d)));
    const { i, sin } = row(dim, d, il);
    const w = base ** (-(2 * i) / d);
    const period = (2 * Math.PI) / w;
    const cw = r.width / N;
    const ch = r.height / d;
    Object.assign(cross.style, {
      display: 'block',
      left: `${x * cw - 1}px`,
      top: `${dim * ch - 1}px`,
      width: `${Math.max(cw, 3) + 2}px`,
      height: `${Math.max(ch, 3) + 2}px`,
    });
    const fn = sin ? 'sin' : 'cos';
    readout.textContent =
      `pos ${x}, dim ${dim} = ${fn}(${x} · ω${i}) = ${pe(x, dim, d, base, il).toFixed(3)}\n` +
      `ω${i} = ${w.toPrecision(3)}, wavelength ${period < 1000 ? period.toFixed(1) : Math.round(period).toLocaleString('en')} positions`;
  }
  const onLeave = () => {
    cross.style.display = 'none';
  };

  readout.setAttribute('style', 'white-space: pre-line');
  const mq = matchMedia('(prefers-color-scheme: dark)');
  dIn.addEventListener('input', draw);
  bIn.addEventListener('input', draw);
  ilIn.addEventListener('change', draw);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerdown', onMove);
  cv.addEventListener('pointerleave', onLeave);
  mq.addEventListener('change', draw);
  draw();

  return () => {
    dIn.removeEventListener('input', draw);
    bIn.removeEventListener('input', draw);
    ilIn.removeEventListener('change', draw);
    cv.removeEventListener('pointermove', onMove);
    cv.removeEventListener('pointerdown', onMove);
    cv.removeEventListener('pointerleave', onLeave);
    mq.removeEventListener('change', draw);
  };
};
