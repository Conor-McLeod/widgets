// Vanilla widget: softmax on three classes, as a map from the logit plane to the probability triangle.
// Adding a constant to all three logits changes nothing, so only a 2-D plane of logits matters. We draw that
// plane with the three class directions at 120° apart, so moving towards "A" raises z_A, and the triangle's
// corners point the same way. Drag the point in either panel; the grid on the left is pushed through softmax
// and drawn on the right.
import type { Mount } from '~/widget';
import { svgLabel, tex } from '~/math/tex';

const SIZE = 300; // each panel's viewBox is SIZE × SIZE
const C = SIZE / 2;
const SPAN = 6; // logit panel: world units from centre to edge
const LSCALE = (SIZE / 2 - 14) / SPAN;
const TR = 112; // triangle circumradius in px
const NAMES = ['A', 'B', 'C'];
const COLOURS = ['var(--accent)', 'var(--danger)', 'var(--text)'];

// Unit directions for the three classes (maths orientation, y up).
const DIRS: [number, number][] = [90, 210, 330].map((d) => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)]);

type V2 = [number, number];
const dot = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1];

/** Centred logits for a point u in the plane: z_k = u · e_k, which always sum to 0. */
const logits = (u: V2) => DIRS.map((e) => dot(u, e));
function softmax(z: number[], T: number) {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp((v - m) / T));
  const s = e[0] + e[1] + e[2];
  return e.map((v) => v / s);
}
/** Point in the triangle (circumradius 1) with barycentric weights p. */
const bary = (p: number[]): V2 => [p[0] * DIRS[0][0] + p[1] * DIRS[1][0] + p[2] * DIRS[2][0], p[0] * DIRS[0][1] + p[1] * DIRS[1][1] + p[2] * DIRS[2][1]];

const lx = (u: V2) => C + u[0] * LSCALE;
const ly = (u: V2) => C - u[1] * LSCALE;
const tx = (q: V2) => C + q[0] * TR;
const TY_OFF = 22; // nudge the triangle down so its bounding box, not its centroid, is centred
const ty = (q: V2) => C - q[1] * TR + TY_OFF;

const f2 = (v: number) => (Math.abs(v) < 5e-3 ? '0.00' : v.toFixed(2));
const pf = (v: number) => (v > 0.9995 ? '1.000' : v < 0.0005 ? v.toExponential(0).replace(/e-(\d+)/, '\\times 10^{-$1}') : v.toFixed(3));

export const mount: Mount = (el) => {
  const uid = Math.random().toString(36).slice(2, 8); // unique ids if mounted twice on a page
  el.innerHTML = `
    <div class="sx">
      <div class="sx-ctl">
        <label class="sx-t">
          <span>temperature ${tex('T')}</span>
          <input type="range" min="-1" max="1" step="0.01" value="0" aria-label="Temperature" />
          <output></output>
        </label>
        <button class="sx-reset">reset</button>
      </div>
      <div class="sx-panels">
        <figure>
          <svg class="sx-l" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Logit plane, drag the point"></svg>
          <figcaption>logits (up to a constant)</figcaption>
        </figure>
        <figure>
          <svg class="sx-r" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Probability triangle, drag the point"></svg>
          <figcaption>probabilities</figcaption>
        </figure>
      </div>
      <p class="sx-readout"></p>
    </div>
    <style>
      .sx { font-size: .9rem; }
      .sx-ctl { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .5rem 1rem; margin-bottom: .5rem; }
      .sx-t { display: flex; align-items: center; gap: .5rem; color: var(--muted); }
      .sx-t input { width: 8rem; }
      .sx-t output { font-family: var(--mono); font-size: .82rem; color: var(--text); min-width: 2.5rem; }
      .sx button { font: inherit; font-size: .85rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: .25rem .55rem; cursor: pointer; }
      .sx-panels { display: flex; flex-wrap: wrap; gap: .75rem; justify-content: center; }
      .sx-panels figure { margin: 0; flex: 1 1 240px; max-width: 340px; }
      .sx-panels figcaption { text-align: center; color: var(--muted); font-size: .8rem; margin-top: .15rem; }
      .sx-panels svg { display: block; width: 100%; height: auto; touch-action: none; cursor: grab; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
      .sx-panels svg:active { cursor: grabbing; }
      .sx-readout { margin: .5rem 0 0; font-size: .85rem; line-height: 1.8; overflow-x: auto; }
    </style>`;

  const left = el.querySelector<SVGSVGElement>('.sx-l')!;
  const right = el.querySelector<SVGSVGElement>('.sx-r')!;
  const slider = el.querySelector<HTMLInputElement>('.sx-t input')!;
  const tOut = el.querySelector('.sx-t output')!;
  const readout = el.querySelector('.sx-readout')!;
  const reset = el.querySelector<HTMLButtonElement>('.sx-reset')!;

  const START: V2 = [1.2, 0.7];
  let u: V2 = [...START];
  const temp = () => 10 ** Number(slider.value);

  // Grid lines of the logit panel, as sampled polylines in world coordinates.
  const gridLines: { pts: V2[]; major: boolean }[] = [];
  for (let c = -SPAN; c <= SPAN; c += 1) {
    const a: V2[] = [];
    const b: V2[] = [];
    for (let t = -SPAN; t <= SPAN + 1e-9; t += 0.1) {
      a.push([c, t]);
      b.push([t, c]);
    }
    gridLines.push({ pts: a, major: c === 0 }, { pts: b, major: c === 0 });
  }
  // Decision boundaries z_j = z_k: rays from the origin opposite each class direction.
  const boundaries: V2[][] = DIRS.map((e) => {
    const pts: V2[] = [];
    for (let r = 0; r <= SPAN * 1.5; r += 0.1) pts.push([-e[0] * r, -e[1] * r]);
    return pts;
  });

  const path = (pts: V2[], X: (v: V2) => number, Y: (v: V2) => number) =>
    pts.map((v, i) => `${i ? 'L' : 'M'}${X(v).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const toTri = (T: number) => (v: V2) => bary(softmax(logits(v), T));

  function draw() {
    const T = temp();
    tOut.textContent = T.toFixed(2);
    const map = toTri(T);
    const L: string[] = [];
    const R: string[] = [];

    L.push(`<defs><clipPath id="sx-clip-${uid}"><rect x="${lx([-SPAN, 0])}" y="${ly([0, SPAN])}" width="${2 * SPAN * LSCALE}" height="${2 * SPAN * LSCALE}" /></clipPath></defs><g clip-path="url(#sx-clip-${uid})">`);
    for (const g of gridLines) {
      const st = g.major ? 'stroke="var(--muted)" stroke-width="1"' : 'stroke="var(--muted)" stroke-width=".6" stroke-opacity=".35"';
      L.push(`<path d="${path(g.pts, lx, ly)}" fill="none" ${st} />`);
      R.push(`<path d="${path(g.pts.map(map), tx, ty)}" fill="none" ${st} />`);
    }
    for (const b of boundaries) {
      L.push(`<path d="${path(b, lx, ly)}" fill="none" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="4 4" />`);
      R.push(`<path d="${path(b.map(map), tx, ty)}" fill="none" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="4 4" />`);
    }
    L.push('</g>');

    // Class directions and triangle corners.
    const corners = DIRS.map((e) => [tx(e), ty(e)]);
    R.unshift(`<polygon points="${corners.map((c) => c.join(',')).join(' ')}" fill="var(--bg)" stroke="var(--muted)" stroke-width="1.2" />`);
    DIRS.forEach((e, k) => {
      const end: V2 = [e[0] * (SPAN - 0.6), e[1] * (SPAN - 0.6)];
      L.push(
        `<line x1="${lx([0, 0])}" y1="${ly([0, 0])}" x2="${lx(end)}" y2="${ly(end)}" stroke="${COLOURS[k]}" stroke-width="1.5" opacity=".6" marker-end="url(#sx-arrow-${uid})" />`,
        svgLabel(lx(end) + (e[0] > 0 ? -8 : 8), ly(end) + (e[1] > 0 ? 2 : -12), tex(`z_${NAMES[k]}`), {
          anchor: e[0] > 0.1 ? 'end' : e[0] < -0.1 ? 'start' : 'middle',
          width: 40,
          style: `font-size: 13px; color: ${COLOURS[k]}`,
        }),
      );
      const lbl = tex(`p_${NAMES[k]} = 1`);
      const below = e[1] < 0;
      R.push(svgLabel(corners[k][0], corners[k][1] + (below ? 16 : -14), lbl, { anchor: 'middle', width: 70, style: `font-size: 12px; color: ${COLOURS[k]}` }));
    });
    L.unshift(
      `<defs><marker id="sx-arrow-${uid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" /></marker></defs>`,
    );

    // The point.
    const z = logits(u);
    const p = softmax(z, T);
    const q = bary(p);
    const dotSvg = (x: number, y: number) =>
      `<circle cx="${x}" cy="${y}" r="14" fill="transparent" /><circle cx="${x}" cy="${y}" r="6" fill="var(--bg)" stroke="var(--text)" stroke-width="2.2" />`;
    L.push(dotSvg(lx(u), ly(u)));
    R.push(dotSvg(tx(q), ty(q)));

    left.innerHTML = L.join('');
    right.innerHTML = R.join('');

    readout.innerHTML =
      tex(`z = (${z.map(f2).join(',\\ ')}) + c`) +
      '<br>' +
      tex(`p = (${p.map(pf).join(',\\ ')})`) +
      '<br>' +
      tex(`p_A + p_B + p_C = ${(p[0] + p[1] + p[2]).toFixed(3)}`);
  }

  // Dragging. Left: set u directly. Right: invert softmax (z = T log p, centred).
  function svgPoint(svg: SVGSVGElement, ev: PointerEvent): V2 {
    const r = svg.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * SIZE, ((ev.clientY - r.top) / r.height) * SIZE];
  }
  const clampU = (v: V2): V2 => [Math.max(-SPAN, Math.min(SPAN, v[0])), Math.max(-SPAN, Math.min(SPAN, v[1]))];
  function fromLeft(ev: PointerEvent) {
    const [sx, sy] = svgPoint(left, ev);
    u = clampU([(sx - C) / LSCALE, (C - sy) / LSCALE]);
    draw();
  }
  function fromRight(ev: PointerEvent) {
    const [sx, sy] = svgPoint(right, ev);
    const q: V2 = [(sx - C) / TR, (C + TY_OFF - sy) / TR];
    // Barycentric weights of q; clamp just inside the triangle (softmax never reaches its edge).
    let p = DIRS.map((e) => Math.max(1e-6, (1 + 2 * dot(q, e)) / 3));
    const s = p[0] + p[1] + p[2];
    p = p.map((v) => v / s);
    const lp = p.map(Math.log);
    const mean = (lp[0] + lp[1] + lp[2]) / 3;
    const z = lp.map((v) => temp() * (v - mean));
    // Recover u from centred logits: sum_k z_k e_k = (3/2) u.
    u = clampU([(2 / 3) * (z[0] * DIRS[0][0] + z[1] * DIRS[1][0] + z[2] * DIRS[2][0]), (2 / 3) * (z[0] * DIRS[0][1] + z[1] * DIRS[1][1] + z[2] * DIRS[2][1])]);
    draw();
  }

  const handlers: [SVGSVGElement, (ev: PointerEvent) => void][] = [
    [left, fromLeft],
    [right, fromRight],
  ];
  const cleanups: (() => void)[] = [];
  for (const [svg, set] of handlers) {
    let dragging = false;
    const down = (ev: PointerEvent) => {
      dragging = true;
      svg.setPointerCapture(ev.pointerId);
      set(ev);
    };
    const move = (ev: PointerEvent) => dragging && set(ev);
    const up = () => (dragging = false);
    svg.addEventListener('pointerdown', down);
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    cleanups.push(() => {
      svg.removeEventListener('pointerdown', down);
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', up);
      svg.removeEventListener('pointercancel', up);
    });
  }
  const onReset = () => {
    u = [...START];
    slider.value = '0';
    draw();
  };
  slider.addEventListener('input', draw);
  reset.addEventListener('click', onReset);

  draw();

  return () => {
    for (const c of cleanups) c();
    slider.removeEventListener('input', draw);
    reset.removeEventListener('click', onReset);
    el.innerHTML = '';
  };
};
