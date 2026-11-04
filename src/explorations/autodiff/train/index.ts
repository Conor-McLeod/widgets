// Vanilla widget: train a 2 → H → 1 network with the reverse-mode engine in ../lib/engine.ts.
// Left: the data and the network's decision regions. Right: the network, with edges drawn by
// weight or by the gradient the last backward pass produced.
import type { Mount } from '~/widget';
import { Value, sum } from '../lib/engine';

type Point = { x: number; y: number; t: 0 | 1 };
type Dataset = 'xor' | 'circle' | 'moons';

const N_POINTS = 120;
const DOMAIN = 1.25;
const GRID = 48;
const STEPS_PER_FRAME = 2;
const HISTORY = 400;

function rng(seed: number) {
  // mulberry32
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

function makeData(kind: Dataset): Point[] {
  const r = rng(7);
  const pts: Point[] = [];
  for (let i = 0; i < N_POINTS; i++) {
    if (kind === 'xor') {
      const sx = r() < 0.5 ? -1 : 1;
      const sy = r() < 0.5 ? -1 : 1;
      pts.push({ x: sx * 0.55 + gauss(r) * 0.18, y: sy * 0.55 + gauss(r) * 0.18, t: sx * sy > 0 ? 1 : 0 });
    } else if (kind === 'circle') {
      const inner = i % 2 === 0;
      const rad = inner ? Math.sqrt(r()) * 0.42 : 0.65 + r() * 0.35;
      const a = r() * 2 * Math.PI;
      pts.push({ x: rad * Math.cos(a), y: rad * Math.sin(a), t: inner ? 1 : 0 });
    } else {
      const upper = i % 2 === 0;
      const a = r() * Math.PI;
      const x = upper ? Math.cos(a) : 1 - Math.cos(a);
      const y = upper ? Math.sin(a) : 0.5 - Math.sin(a);
      // Centre the two moons on the origin and scale into the domain.
      pts.push({ x: (x - 0.5) * 0.85 + gauss(r) * 0.06, y: (y - 0.25) * 0.85 + gauss(r) * 0.06, t: upper ? 1 : 0 });
    }
  }
  return pts;
}

interface Net {
  w1: [Value, Value][];
  b1: Value[];
  w2: Value[];
  b2: Value;
}

function makeNet(hidden: number, seed: number): Net {
  const r = rng(seed);
  const u = (s: number) => new Value((r() * 2 - 1) * s);
  return {
    w1: Array.from({ length: hidden }, () => [u(1.5), u(1.5)] as [Value, Value]),
    b1: Array.from({ length: hidden }, () => u(0.5)),
    w2: Array.from({ length: hidden }, () => u(1)),
    b2: u(0.1),
  };
}

const allParams = (n: Net) => [...n.w1.flat(), ...n.b1, ...n.w2, n.b2];

/** The network as a function of Values: one tape per call. */
function logit(n: Net, x: number, y: number): Value {
  const h = n.w1.map(([a, b], j) => a.mul(x).add(b.mul(y)).add(n.b1[j]).tanh());
  return sum(h.map((hj, j) => hj.mul(n.w2[j]))).add(n.b2);
}

/** The same function on plain numbers, for drawing the decision regions quickly. */
function logitFast(n: Net, x: number, y: number): number {
  let z = n.b2.data;
  for (let j = 0; j < n.w1.length; j++) {
    z += n.w2[j].data * Math.tanh(n.w1[j][0].data * x + n.w1[j][1].data * y + n.b1[j].data);
  }
  return z;
}

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="tr">
      <div class="tr-bar">
        <button class="tr-play primary">▶ train</button>
        <button class="tr-step">step</button>
        <button class="tr-reset" title="New random weights">reset</button>
        <label><span>data</span>
          <select class="tr-data"><option value="xor">xor</option><option value="circle">circle</option><option value="moons">moons</option></select>
        </label>
        <label><span>hidden</span>
          <select class="tr-hidden">${[2, 3, 4, 6, 8].map((h) => `<option ${h === 4 ? 'selected' : ''}>${h}</option>`).join('')}</select>
        </label>
        <label class="tr-lr"><span>learning rate</span><input type="range" min="-2" max="0.5" step="0.05" value="-0.3" /><output></output></label>
      </div>
      <div class="tr-main">
        <div class="tr-panel">
          <canvas class="tr-canvas" role="img" aria-label="Training data and decision regions"></canvas>
          <svg class="tr-loss" viewBox="0 0 300 60" preserveAspectRatio="none" aria-label="Loss over time"></svg>
        </div>
        <div class="tr-panel">
          <div class="tr-seg" role="group" aria-label="Edge thickness shows">
            <span>edges show</span>
            <button data-view="weights" aria-pressed="true">weights</button>
            <button data-view="grads" aria-pressed="false">gradients</button>
          </div>
          <svg class="tr-net" viewBox="0 0 300 250" role="img" aria-label="Network diagram"></svg>
        </div>
      </div>
      <p class="tr-stats" aria-live="polite"></p>
    </div>
    <style>
      .tr { font-size: .88rem; }
      .tr-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem .75rem; margin-bottom: .75rem; }
      .tr-bar label { display: flex; align-items: center; gap: .35rem; color: var(--muted); }
      .tr-lr input { width: 7rem; accent-color: var(--accent); }
      .tr-lr output { font-family: var(--mono); color: var(--text); min-width: 3.2em; }
      .tr button, .tr select { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: .28rem .6rem; cursor: pointer; }
      .tr button.primary, .tr button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
      .tr-main { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; }
      @media (max-width: 560px) { .tr-main { grid-template-columns: minmax(0, 1fr); } }
      .tr-canvas { display: block; width: 100%; aspect-ratio: 1; border-radius: 6px; border: 1px solid var(--border); }
      .tr-loss { display: block; width: 100%; height: 48px; margin-top: .4rem; }
      .tr-seg { display: flex; align-items: center; gap: .35rem; color: var(--muted); font-size: .82rem; }
      .tr-net { display: block; width: 100%; height: auto; margin-top: .4rem; font-family: var(--mono); }
      .tr-stats { margin: .75rem 0 0; font-family: var(--mono); font-size: .8rem; color: var(--muted); overflow-wrap: anywhere; }
      .tr-stats b { color: var(--text); font-weight: 600; }
    </style>`;

  const $ = <T extends Element>(s: string) => el.querySelector<T>(s)!;
  const canvas = $<HTMLCanvasElement>('.tr-canvas');
  const ctx = canvas.getContext('2d')!;
  const off = document.createElement('canvas');
  off.width = off.height = GRID;
  const small = off.getContext('2d')!;
  const lossSvg = $<SVGSVGElement>('.tr-loss');
  const netSvg = $<SVGSVGElement>('.tr-net');
  const stats = $<HTMLParagraphElement>('.tr-stats');
  const playBtn = $<HTMLButtonElement>('.tr-play');
  const dataSel = $<HTMLSelectElement>('.tr-data');
  const hiddenSel = $<HTMLSelectElement>('.tr-hidden');
  const lrInput = $<HTMLInputElement>('.tr-lr input');
  const lrOut = $<HTMLOutputElement>('.tr-lr output');

  let data = makeData('xor');
  let seed = 1;
  let net = makeNet(4, seed);
  let steps = 0;
  let loss = NaN;
  let acc = NaN;
  let tape = 0;
  let history: number[] = [];
  let view: 'weights' | 'grads' = 'weights';
  let playing = false;
  let raf = 0;

  const lr = () => 10 ** Number(lrInput.value);

  /** Build the loss on the tape, run backward, and return without updating. */
  function computeGrads() {
    let correct = 0;
    const terms = data.map((p) => {
      const z = logit(net, p.x, p.y);
      if ((z.data > 0 ? 1 : 0) === p.t) correct++;
      // Binary cross-entropy on the logit: softplus(z) − t·z.
      return z.softplus().add(z.mul(-p.t));
    });
    const L = sum(terms).mul(1 / data.length);
    tape = L.backward();
    loss = L.data;
    acc = correct / data.length;
  }

  function train(k: number) {
    for (let i = 0; i < k; i++) {
      // The gradients from the previous computeGrads() are current, so step then recompute.
      for (const p of allParams(net)) p.data -= lr() * p.grad;
      computeGrads();
      steps++;
      history.push(loss);
      if (history.length > HISTORY) history.shift();
    }
  }

  function reset() {
    seed++;
    net = makeNet(Number(hiddenSel.value), seed);
    steps = 0;
    history = [];
    computeGrads();
    history.push(loss);
    draw();
  }

  // Drawing ---------------------------------------------------------------------------------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr);
    draw();
  }

  function drawRegions() {
    const cs = getComputedStyle(el);
    const c1 = cs.getPropertyValue('--accent').trim() || '#2f5fd0';
    const c0 = cs.getPropertyValue('--danger').trim() || '#b3261e';
    const bg = cs.getPropertyValue('--surface').trim() || '#fff';
    const S = canvas.width;
    const toPx = (v: number) => ((v + DOMAIN) / (2 * DOMAIN)) * S;
    // One pixel per grid cell on a small canvas, then scaled up smoothly.
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const x = -DOMAIN + ((i + 0.5) / GRID) * 2 * DOMAIN;
        const y = DOMAIN - ((j + 0.5) / GRID) * 2 * DOMAIN;
        const p = 1 / (1 + Math.exp(-logitFast(net, x, y)));
        small.globalAlpha = 1;
        small.fillStyle = bg;
        small.fillRect(i, j, 1, 1);
        small.globalAlpha = Math.abs(p - 0.5) * 0.55;
        small.fillStyle = p > 0.5 ? c1 : c0;
        small.fillRect(i, j, 1, 1);
      }
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(small.canvas, 0, 0, S, S);
    ctx.globalAlpha = 1;
    const r = Math.max(3, S / 90);
    ctx.lineWidth = Math.max(1, S / 300);
    ctx.strokeStyle = bg;
    for (const p of data) {
      ctx.beginPath();
      ctx.arc(toPx(p.x), S - toPx(p.y), r, 0, 2 * Math.PI);
      ctx.fillStyle = p.t ? c1 : c0;
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawLoss() {
    if (history.length < 2) {
      lossSvg.innerHTML = '';
      return;
    }
    const max = Math.max(...history, 0.01);
    const pts = history.map((l, i) => `${((i / (HISTORY - 1)) * 300).toFixed(1)},${(58 - (l / max) * 54).toFixed(1)}`);
    lossSvg.innerHTML = `
      <line x1="0" x2="300" y1="58" y2="58" stroke="var(--border)" vector-effect="non-scaling-stroke"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="var(--text)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  }

  function drawNet() {
    const H = net.w1.length;
    const yAt = (i: number, n: number) => 125 + (i - (n - 1) / 2) * Math.min(48, 220 / Math.max(1, n - 1));
    const IX = 36;
    const HX = 150;
    const OX = 264;
    const ins = [yAt(0, 2), yAt(1, 2)];
    const hs = Array.from({ length: H }, (_, j) => yAt(j, H));
    const oy = 125;

    const edges: { x1: number; y1: number; x2: number; y2: number; w: Value }[] = [];
    net.w1.forEach(([a, b], j) => {
      edges.push({ x1: IX, y1: ins[0], x2: HX, y2: hs[j], w: a }, { x1: IX, y1: ins[1], x2: HX, y2: hs[j], w: b });
    });
    net.w2.forEach((w, j) => edges.push({ x1: HX, y1: hs[j], x2: OX, y2: oy, w }));

    const mag = (w: Value) => Math.abs(view === 'weights' ? w.data : w.grad);
    const sign = (w: Value) => (view === 'weights' ? w.data : -w.grad) >= 0;
    const scale = view === 'weights' ? 1.6 : Math.max(1e-9, ...edges.map((e) => mag(e.w))) / 3;

    const parts: string[] = [];
    for (const e of edges) {
      const width = Math.min(9, 0.4 + (mag(e.w) / scale) * 2);
      parts.push(
        `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${sign(e.w) ? 'var(--accent)' : 'var(--danger)'}" stroke-width="${width.toFixed(2)}" stroke-linecap="round" opacity="0.8"/>`,
      );
    }
    const node = (x: number, y: number, text: string) =>
      `<circle cx="${x}" cy="${y}" r="13" fill="var(--surface)" stroke="var(--muted)" stroke-width="1.5"/>` +
      `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" fill="var(--text)">${text}</text>`;
    parts.push(node(IX, ins[0], 'x₁'), node(IX, ins[1], 'x₂'));
    hs.forEach((y, j) => parts.push(node(HX, y, `h${'₁₂₃₄₅₆₇₈'[j]}`)));
    parts.push(node(OX, oy, 'z'));
    parts.push(
      `<text x="150" y="246" text-anchor="middle" font-size="10" fill="var(--muted)">${
        view === 'weights' ? 'blue +, red −; thickness |w|' : 'blue: increase w, red: decrease; thickness |∂L/∂w|'
      }</text>`,
    );
    netSvg.innerHTML = parts.join('');
  }

  function drawStats() {
    const nParams = allParams(net).length;
    stats.innerHTML =
      `step <b>${steps}</b> · loss <b>${loss.toFixed(4)}</b> · accuracy <b>${Math.round(acc * 100)}%</b><br>` +
      `each step records <b>${tape.toLocaleString()}</b> operations on the tape, then one backward pass gives all <b>${nParams}</b> gradients`;
  }

  function draw() {
    drawRegions();
    drawLoss();
    drawNet();
    drawStats();
  }

  function frame() {
    train(STEPS_PER_FRAME);
    draw();
    if (playing) raf = requestAnimationFrame(frame);
  }

  function setPlaying(on: boolean) {
    playing = on;
    playBtn.textContent = on ? '❚❚ pause' : '▶ train';
    cancelAnimationFrame(raf);
    if (on) raf = requestAnimationFrame(frame);
  }

  // Events ----------------------------------------------------------------------------------
  const onPlay = () => setPlaying(!playing);
  const onStep = () => {
    setPlaying(false);
    train(1);
    draw();
  };
  const onReset = () => {
    setPlaying(false);
    reset();
  };
  const onData = () => {
    data = makeData(dataSel.value as Dataset);
    onReset();
  };
  const onLr = () => (lrOut.textContent = lr().toPrecision(2));
  const onView = (ev: Event) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>('button[data-view]');
    if (!b) return;
    view = b.dataset.view as typeof view;
    el.querySelectorAll('button[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    drawNet();
  };
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');

  playBtn.addEventListener('click', onPlay);
  $('.tr-step').addEventListener('click', onStep);
  $('.tr-reset').addEventListener('click', onReset);
  dataSel.addEventListener('change', onData);
  hiddenSel.addEventListener('change', onReset);
  lrInput.addEventListener('input', onLr);
  $('.tr-seg').addEventListener('click', onView);
  scheme.addEventListener('change', draw);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  onLr();
  computeGrads();
  history.push(loss);
  resize();

  return () => {
    setPlaying(false);
    ro.disconnect();
    scheme.removeEventListener('change', draw);
  };
};
