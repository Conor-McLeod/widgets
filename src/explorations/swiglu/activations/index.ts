// Vanilla widget: ReLU, GELU and Swish_β on one plot, with a β slider so you can watch
// Swish slide between x/2 (β = 0), SiLU (β = 1) and ReLU (β → ∞).
import type { Mount } from '~/widget';

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const relu = (x: number) => Math.max(0, x);
const gelu = (x: number) => 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x ** 3)));
const swish = (x: number, b: number) => x * sigmoid(b * x);

// Derivatives, for the "slope" view.
const dRelu = (x: number) => (x > 0 ? 1 : 0);
const dGelu = (x: number) => (gelu(x + 1e-4) - gelu(x - 1e-4)) / 2e-4;
const dSwish = (x: number, b: number) => {
  const s = sigmoid(b * x);
  return s + b * x * s * (1 - s);
};

// SiLU's minimum: x* solves 1 + x(1 − σ(x)) = 0. Swish_β(x) = SiLU(βx)/β scales it by 1/β.
const SILU_MIN_X = -1.278464542761074;
const SILU_MIN_Y = SILU_MIN_X * sigmoid(SILU_MIN_X);

const W = 600;
const H = 340;
const PAD = 28;
const X0 = -4;
const X1 = 4;

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="act">
      <div class="act-ctl">
        <label>β <input type="range" min="0" max="8" step="0.05" value="1" /> <output></output></label>
        <label class="act-check"><input type="checkbox" /> show slope instead</label>
      </div>
      <svg class="act-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Activation functions"></svg>
      <div class="act-legend">
        <span><i class="k-swish"></i>Swish<sub>β</sub>(x) = x·σ(βx)</span>
        <span><i class="k-gelu"></i>GELU</span>
        <span><i class="k-relu"></i>ReLU</span>
      </div>
      <p class="act-readout"></p>
    </div>
    <style>
      .act { font-size: .9rem; }
      .act-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem 1.2rem; color: var(--muted); }
      .act-ctl label { display: flex; align-items: center; gap: .5rem; }
      .act-ctl input[type=range] { width: min(14rem, 50vw); }
      .act-ctl output { font-family: var(--mono); color: var(--text); min-width: 3.5rem; }
      .act-svg { width: 100%; height: auto; display: block; margin-top: .5rem; touch-action: none; }
      .act-legend { display: flex; flex-wrap: wrap; gap: .3rem 1.2rem; color: var(--muted); font-size: .85rem; }
      .act-legend i { display: inline-block; width: 1.2rem; height: 0; border-top: 2.5px solid; vertical-align: middle; margin-right: .4rem; }
      .act-legend .k-swish { border-color: var(--accent); }
      .act-legend .k-gelu { border-color: var(--danger); border-top-width: 1.5px; }
      .act-legend .k-relu { border-color: var(--muted); border-top-style: dashed; border-top-width: 1.5px; }
      .act-readout { margin: .4rem 0 0; font-family: var(--mono); font-size: .82rem; min-height: 2.8em; white-space: pre-wrap; }
    </style>`;

  const slider = el.querySelector<HTMLInputElement>('input[type=range]')!;
  const check = el.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  const output = el.querySelector('output')!;
  const svg = el.querySelector('svg')!;
  const readout = el.querySelector('.act-readout')!;

  let hoverX: number | null = null;

  function draw() {
    const b = Number(slider.value);
    const slope = check.checked;
    output.textContent = b.toFixed(2);

    const [Y0, Y1] = slope ? [-0.3, 1.3] : [-1, 3.2];
    const sx = (x: number) => PAD + ((x - X0) / (X1 - X0)) * (W - 2 * PAD);
    const sy = (y: number) => H - PAD - ((y - Y0) / (Y1 - Y0)) * (H - 2 * PAD);
    const path = (f: (x: number) => number) => {
      const pts: string[] = [];
      for (let i = 0; i <= 400; i++) {
        const x = X0 + ((X1 - X0) * i) / 400;
        const y = Math.max(Y0 - 1, Math.min(Y1 + 1, f(x)));
        pts.push(`${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
      }
      return pts.join('');
    };

    const p: string[] = [`<defs><clipPath id="act-clip"><rect x="${PAD}" y="${PAD}" width="${W - 2 * PAD}" height="${H - 2 * PAD}" /></clipPath></defs>`];
    // Grid and axes.
    for (let x = X0; x <= X1; x++) {
      p.push(`<line x1="${sx(x)}" x2="${sx(x)}" y1="${PAD}" y2="${H - PAD}" stroke="var(--border)" stroke-width="${x === 0 ? 1.5 : 0.75}" />`);
      if (x !== 0) p.push(`<text x="${sx(x)}" y="${H - PAD + 16}" text-anchor="middle" font-size="12" fill="var(--muted)">${x}</text>`);
    }
    const yStep = slope ? 0.5 : 1;
    for (let y = Math.ceil(Y0 / yStep) * yStep; y <= Y1; y += yStep) {
      p.push(`<line x1="${PAD}" x2="${W - PAD}" y1="${sy(y)}" y2="${sy(y)}" stroke="var(--border)" stroke-width="${y === 0 ? 1.5 : 0.75}" />`);
      if (y !== 0) p.push(`<text x="${sx(0) - 6}" y="${sy(y) + 4}" text-anchor="end" font-size="12" fill="var(--muted)">${y}</text>`);
    }

    p.push(`<g clip-path="url(#act-clip)" fill="none">`);
    p.push(`<path d="${path(slope ? dRelu : relu)}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5 4" />`);
    p.push(`<path d="${path(slope ? dGelu : gelu)}" stroke="var(--danger)" stroke-width="1.5" />`);
    p.push(`<path d="${path((x) => (slope ? dSwish(x, b) : swish(x, b)))}" stroke="var(--accent)" stroke-width="2.5" />`);

    // Mark Swish's minimum: the dip below zero that ReLU doesn't have.
    if (!slope && b > 0.15) {
      const mx = SILU_MIN_X / b;
      const my = SILU_MIN_Y / b;
      if (mx >= X0) {
        p.push(`<circle cx="${sx(mx)}" cy="${sy(my)}" r="4" fill="var(--accent)" />`);
        p.push(`<text x="${sx(mx)}" y="${sy(my) + 20}" text-anchor="middle" font-size="12" fill="var(--accent)">min ${my.toFixed(3)}</text>`);
      }
    }

    if (hoverX !== null) {
      p.push(`<line x1="${sx(hoverX)}" x2="${sx(hoverX)}" y1="${PAD}" y2="${H - PAD}" stroke="var(--text)" stroke-opacity=".35" />`);
    }
    p.push('</g>');
    svg.innerHTML = p.join('');

    if (hoverX === null) {
      readout.textContent = b === 0 ? 'β = 0: σ(0) = ½ everywhere, so Swish is just the line x/2.' : 'Hover the plot to read off values.';
    } else {
      const x = hoverX;
      const g = sigmoid(b * x);
      readout.textContent = slope
        ? `x = ${x.toFixed(2)}   slope: Swish ${dSwish(x, b).toFixed(3)}   GELU ${dGelu(x).toFixed(3)}   ReLU ${dRelu(x)}`
        : `x = ${x.toFixed(2)}   gate σ(βx) = ${g.toFixed(3)}\nSwish ${swish(x, b).toFixed(3)}   GELU ${gelu(x).toFixed(3)}   ReLU ${relu(x).toFixed(3)}`;
    }
  }

  function onMove(ev: PointerEvent) {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    hoverX = Math.max(X0, Math.min(X1, X0 + ((px - PAD) / (W - 2 * PAD)) * (X1 - X0)));
    draw();
  }
  function onLeave() {
    hoverX = null;
    draw();
  }

  slider.addEventListener('input', draw);
  check.addEventListener('change', draw);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerleave', onLeave);
  draw();

  return () => {
    slider.removeEventListener('input', draw);
    check.removeEventListener('change', draw);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerleave', onLeave);
  };
};
