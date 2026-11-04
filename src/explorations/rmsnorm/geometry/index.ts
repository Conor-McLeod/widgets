// Vanilla widget: RMSNorm and LayerNorm on a 2-D input, drawn as maps from the plane.
// RMSNorm pushes every point radially onto the circle of radius √d = √2.
// LayerNorm first projects onto the line x₁ + x₂ = 0, then scales, so it lands on one of two points.
import type { Mount } from '~/widget';
import { svgLabel, tex } from '~/math/tex';

const D = 2;
const SIZE = 320; // viewBox is SIZE × SIZE, centred on the origin
const SPAN = 3; // world units from centre to edge
const R = Math.SQRT2; // √d: radius every RMSNorm output lands on (γ = 1, ε → 0)

type Mode = 'rms' | 'layer' | 'both';

const px = (v: number) => SIZE / 2 + (v / SPAN) * (SIZE / 2 - 10);
const py = (v: number) => SIZE / 2 - (v / SPAN) * (SIZE / 2 - 10);
const toWorld = (sx: number, sy: number): [number, number] => [
  ((sx - SIZE / 2) / (SIZE / 2 - 10)) * SPAN,
  -((sy - SIZE / 2) / (SIZE / 2 - 10)) * SPAN,
];

function rmsNorm([a, b]: [number, number], eps: number): [number, number] {
  const r = Math.sqrt((a * a + b * b) / D + eps);
  return r === 0 ? [0, 0] : [a / r, b / r];
}
function layerNorm([a, b]: [number, number], eps: number): { centred: [number, number]; out: [number, number] } {
  const mu = (a + b) / D;
  const centred: [number, number] = [a - mu, b - mu];
  const s = Math.sqrt((centred[0] ** 2 + centred[1] ** 2) / D + eps);
  return { centred, out: s === 0 ? [0, 0] : [centred[0] / s, centred[1] / s] };
}

const f = (v: number) => (Math.abs(v) < 5e-3 ? '0.00' : v.toFixed(2));
const pt = ([a, b]: [number, number]) => `(${f(a)}, ${f(b)})`;

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="rg">
      <div class="rg-ctl">
        <div class="rg-seg" role="radiogroup" aria-label="Which normalization to show">
          <button data-mode="rms" class="on">RMSNorm</button>
          <button data-mode="layer">LayerNorm</button>
          <button data-mode="both">both</button>
        </div>
        <label class="rg-eps">
          <span>${tex('\\varepsilon')}</span>
          <input type="range" min="0" max="6" step="1" value="0" />
          <output></output>
        </label>
      </div>
      <svg class="rg-svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Drag the point x around the plane"></svg>
      <p class="rg-readout"></p>
    </div>
    <style>
      .rg { font-size: .9rem; }
      .rg-ctl { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .5rem 1rem; margin-bottom: .5rem; }
      .rg-seg { display: inline-flex; }
      .rg-seg button { font: inherit; font-size: .85rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); padding: .25rem .55rem; cursor: pointer; }
      .rg-seg button + button { border-left: none; }
      .rg-seg button:first-child { border-radius: 6px 0 0 6px; }
      .rg-seg button:last-child { border-radius: 0 6px 6px 0; }
      .rg-seg button.on { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
      .rg-eps { display: flex; align-items: center; gap: .5rem; color: var(--muted); }
      .rg-eps input { width: 8rem; }
      .rg-eps output { font-family: var(--mono); color: var(--text); font-size: .82rem; min-width: 3.5rem; }
      .rg-svg { display: block; width: 100%; max-width: 420px; height: auto; margin: 0 auto; touch-action: none; cursor: grab; }
      .rg-svg:active { cursor: grabbing; }
      .rg-readout { margin: .5rem 0 0; font-size: .82rem; line-height: 1.7; min-height: 3.4em; overflow-x: auto; }
      .rg-readout .x { color: var(--text); }
      .rg-readout .r { color: var(--accent); }
      .rg-readout .l { color: var(--danger); }
    </style>`;

  const svg = el.querySelector('svg')!;
  const readout = el.querySelector('.rg-readout')!;
  const eps = el.querySelector('input')!;
  const epsOut = el.querySelector('output')!;
  const segButtons = [...el.querySelectorAll<HTMLButtonElement>('.rg-seg button')];

  let mode: Mode = 'rms';
  let x: [number, number] = [2.2, 0.9];
  // Slider 0 → ε = 0; 1..6 → ε = 10^-5 .. 10^0.
  const epsilon = () => (Number(eps.value) === 0 ? 0 : 10 ** (Number(eps.value) - 6));

  function draw() {
    const e = epsilon();
    epsOut.innerHTML = tex(e === 0 ? '0' : `10^{${Math.round(Math.log10(e))}}`);
    const showR = mode !== 'layer';
    const showL = mode !== 'rms';
    const parts: string[] = [];

    // Grid and axes.
    for (let t = -SPAN; t <= SPAN; t++) {
      const cls = t === 0 ? 'var(--muted)' : 'var(--border)';
      parts.push(
        `<line x1="${px(t)}" x2="${px(t)}" y1="0" y2="${SIZE}" stroke="${cls}" stroke-width="${t === 0 ? 1 : 0.6}" />`,
        `<line x1="0" x2="${SIZE}" y1="${py(t)}" y2="${py(t)}" stroke="${cls}" stroke-width="${t === 0 ? 1 : 0.6}" />`,
      );
    }
    parts.push(
      svgLabel(SIZE - 6, py(0) - 12, tex('x_1'), { anchor: 'end', width: 30, style: 'font-size: 12px; color: var(--muted)' }),
      svgLabel(px(0) + 6, 12, tex('x_2'), { width: 30, style: 'font-size: 12px; color: var(--muted)' }),
    );

    // Where outputs can live.
    if (showR) {
      parts.push(
        `<circle cx="${px(0)}" cy="${py(0)}" r="${px(R) - px(0)}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5 4" opacity=".8" />`,
      );
    }
    if (showL) {
      parts.push(
        `<line x1="${px(-SPAN)}" y1="${py(SPAN)}" x2="${px(SPAN)}" y2="${py(-SPAN)}" stroke="var(--danger)" stroke-width="1" stroke-dasharray="2 4" opacity=".7" />`,
        `<line x1="${px(-SPAN)}" y1="${py(-SPAN)}" x2="${px(SPAN)}" y2="${py(SPAN)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 4" />`,
      );
      for (const s of [1, -1]) {
        parts.push(`<circle cx="${px(s)}" cy="${py(-s)}" r="5" fill="none" stroke="var(--danger)" stroke-width="1.5" />`);
      }
    }

    const lines: string[] = [`<span class="x">${tex(`x = ${pt(x)}`)}</span>`];

    if (showR) {
      const y = rmsNorm(x, e);
      parts.push(
        `<line x1="${px(0)}" y1="${py(0)}" x2="${px(x[0])}" y2="${py(x[1])}" stroke="var(--accent)" stroke-width="1" opacity=".35" />`,
        `<circle cx="${px(y[0])}" cy="${py(y[1])}" r="6" fill="var(--accent)" />`,
      );
      lines.push(
        `<span class="r">${tex(`\\operatorname{RMSNorm}(x) = ${pt(y)} \\qquad \\lVert y \\rVert = ${f(Math.hypot(...y))}`)}</span>`,
      );
    }
    if (showL) {
      const { centred, out } = layerNorm(x, e);
      parts.push(
        `<line x1="${px(x[0])}" y1="${py(x[1])}" x2="${px(centred[0])}" y2="${py(centred[1])}" stroke="var(--danger)" stroke-width="1" stroke-dasharray="3 3" />`,
        `<circle cx="${px(centred[0])}" cy="${py(centred[1])}" r="3" fill="var(--danger)" opacity=".6" />`,
        `<line x1="${px(centred[0])}" y1="${py(centred[1])}" x2="${px(out[0])}" y2="${py(out[1])}" stroke="var(--danger)" stroke-width="1" opacity=".5" />`,
        `<circle cx="${px(out[0])}" cy="${py(out[1])}" r="5" fill="var(--danger)" />`,
      );
      lines.push(
        `<span class="l">${tex(`\\operatorname{LayerNorm}(x) = ${pt(out)} \\qquad (x - \\mu = ${pt(centred)})`)}</span>`,
      );
    }

    // The draggable input on top.
    parts.push(
      `<circle cx="${px(x[0])}" cy="${py(x[1])}" r="14" fill="transparent" />`,
      `<circle cx="${px(x[0])}" cy="${py(x[1])}" r="6" fill="var(--bg)" stroke="var(--text)" stroke-width="2" />`,
      svgLabel(px(x[0]) + 9, py(x[1]) - 13, tex('x'), { width: 20, style: 'font-size: 13px; color: var(--text); pointer-events: none' }),
    );

    svg.innerHTML = parts.join('');
    readout.innerHTML = lines.join('<br>');
  }

  let dragging = false;
  function setFromEvent(ev: PointerEvent) {
    const r = svg.getBoundingClientRect();
    const [a, b] = toWorld(((ev.clientX - r.left) / r.width) * SIZE, ((ev.clientY - r.top) / r.height) * SIZE);
    x = [Math.max(-SPAN, Math.min(SPAN, a)), Math.max(-SPAN, Math.min(SPAN, b))];
    draw();
  }
  const onDown = (ev: PointerEvent) => {
    dragging = true;
    svg.setPointerCapture(ev.pointerId);
    setFromEvent(ev);
  };
  const onMove = (ev: PointerEvent) => dragging && setFromEvent(ev);
  const onUp = () => (dragging = false);

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  eps.addEventListener('input', draw);
  for (const b of segButtons) {
    b.addEventListener('click', () => {
      mode = b.dataset.mode as Mode;
      for (const o of segButtons) o.classList.toggle('on', o === b);
      draw();
    });
  }

  draw();

  return () => {
    svg.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onUp);
    eps.removeEventListener('input', draw);
    el.innerHTML = '';
  };
};
