// Vanilla widget: a 16×16×16 matrix multiply broken into 4×4×4 tensor-core operations.
// Each output tile stays put in registers while the k loop streams A and B tiles past it.
import type { Mount } from '~/widget';
import { svgLabel, tex, texText } from '~/math/tex';

const T = 4; // tiles per side
const TS = 4; // elements per tile side
const CS = 15; // px per element
const M = T * TS * CS; // px per matrix side
const GAP = 14;
const PAD = 18; // room for labels
const W = M + GAP + M + 2;
const H = PAD + M + GAP + M + 2;
const TOTAL = T * T * T;

const LABEL = 'font-size: 10px; color: var(--muted)';

const at = (s: number) => ({ ti: Math.floor(s / (T * T)), tj: Math.floor(s / T) % T, kk: s % T });

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="tl">
      <div class="tl-ctl">
        <button type="button" data-a="play">Play</button>
        <button type="button" data-a="step">Step</button>
        <button type="button" data-a="reset">Reset</button>
      </div>
      <svg class="tl-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tiled matrix multiply"></svg>
      <p class="tl-read"></p>
    </div>
    <style>
      .tl { font-size: .9rem; }
      .tl-ctl { display: flex; gap: .3rem; }
      .tl-ctl button { font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: .25rem .65rem; cursor: pointer; }
      .tl-ctl button:disabled { opacity: .4; cursor: default; }
      .tl-svg { width: 100%; max-width: 440px; height: auto; display: block; margin: .75rem auto 0; font-family: var(--mono); }
      .tl-read { margin: .5rem 0 0; font-family: var(--mono); font-size: .85rem; min-height: 2.8em; white-space: pre-line; }
    </style>`;

  const svg = el.querySelector('svg')!;
  const read = el.querySelector('.tl-read')!;
  const btnPlay = el.querySelector<HTMLButtonElement>('[data-a="play"]')!;
  const btnStep = el.querySelector<HTMLButtonElement>('[data-a="step"]')!;
  const btnReset = el.querySelector<HTMLButtonElement>('[data-a="reset"]')!;

  const ax = 0;
  const ay = PAD + M + GAP;
  const bx = PAD + M + GAP - PAD; // B and D share columns
  const by = PAD;
  const dx = bx;
  const dy = ay;

  let s = 0; // MMAs completed
  let timer: ReturnType<typeof setInterval> | undefined;

  function grid(x0: number, y0: number): string {
    const out: string[] = [];
    for (let i = 0; i <= T * TS; i++) {
      const major = i % TS === 0;
      const stroke = major ? 'var(--muted)' : 'var(--border)';
      const sw = major ? 1.2 : 0.6;
      out.push(
        `<line x1="${x0}" x2="${x0 + M}" y1="${y0 + i * CS}" y2="${y0 + i * CS}" stroke="${stroke}" stroke-width="${sw}" />`,
        `<line y1="${y0}" y2="${y0 + M}" x1="${x0 + i * CS}" x2="${x0 + i * CS}" stroke="${stroke}" stroke-width="${sw}" />`,
      );
    }
    return out.join('');
  }

  const tileSize = TS * CS;
  const rect = (x0: number, y0: number, r: number, c: number, fill: string, op: number) =>
    `<rect x="${x0 + c * tileSize}" y="${y0 + r * tileSize}" width="${tileSize}" height="${tileSize}" fill="${fill}" fill-opacity="${op}" />`;
  const label = (x0: number, y0: number, r: number, c: number, text: string, fill = 'var(--muted)') =>
    `<text x="${x0 + (c + 0.5) * tileSize}" y="${y0 + (r + 0.5) * tileSize + 4}" text-anchor="middle" font-size="12" fill="${fill}">${text}</text>`;

  function draw() {
    const aReads = Array.from({ length: T }, () => new Array<number>(T).fill(0));
    const bReads = Array.from({ length: T }, () => new Array<number>(T).fill(0));
    const dDone = Array.from({ length: T }, () => new Array<number>(T).fill(0));
    for (let q = 0; q < s; q++) {
      const { ti, tj, kk } = at(q);
      aReads[ti][kk]++;
      bReads[kk][tj]++;
      dDone[ti][tj]++;
    }
    const cur = s > 0 ? at(s - 1) : null;

    const parts: string[] = [];
    for (let r = 0; r < T; r++) {
      for (let c = 0; c < T; c++) {
        if (dDone[r][c]) parts.push(rect(dx, dy, r, c, 'var(--accent)', 0.12 + (0.4 * dDone[r][c]) / T));
      }
    }
    if (cur) {
      parts.push(
        rect(ax, ay, cur.ti, cur.kk, 'var(--accent)', 0.55),
        rect(bx, by, cur.kk, cur.tj, 'var(--accent)', 0.55),
        `<rect x="${dx + cur.tj * tileSize}" y="${dy + cur.ti * tileSize}" width="${tileSize}" height="${tileSize}" fill="none" stroke="var(--accent)" stroke-width="3" />`,
      );
    }
    parts.push(grid(ax, ay), grid(bx, by), grid(dx, dy));
    for (let r = 0; r < T; r++) {
      for (let c = 0; c < T; c++) {
        if (aReads[r][c]) parts.push(label(ax, ay, r, c, `${aReads[r][c]}×`, 'var(--text)'));
        if (bReads[r][c]) parts.push(label(bx, by, r, c, `${bReads[r][c]}×`, 'var(--text)'));
        if (dDone[r][c]) parts.push(label(dx, dy, r, c, `${dDone[r][c]}/${T}`, 'var(--text)'));
      }
    }
    parts.push(
      svgLabel(bx, by - 8, tex('B \\; (16 \\times 16)'), { style: LABEL }),
      svgLabel(ax, ay - 8, tex('A \\; (16 \\times 16)'), { style: LABEL }),
      svgLabel(dx, dy - 8, tex('D = AB \\; (16 \\times 16)'), { style: LABEL }),
    );
    svg.innerHTML = parts.join('');

    if (!cur) read.innerHTML = texText('Each square is one $4 \\times 4$ tile. Press Play.');
    else
      read.innerHTML =
        `tensor-core ops: ${s} / ${TOTAL}   multiply-adds: ${s * TS ** 3} / ${TOTAL * TS ** 3}\n` +
        texText(
          `$D_{${cur.ti},${cur.tj}} \\mathrel{+}= A_{${cur.ti},${cur.kk}}\\, B_{${cur.kk},${cur.tj}}$   k-step ${cur.kk + 1} of ${T}`,
        );
    btnStep.disabled = s >= TOTAL;
    btnPlay.textContent = timer ? 'Pause' : s >= TOTAL ? 'Replay' : 'Play';
  }

  function stop() {
    clearInterval(timer);
    timer = undefined;
  }
  function step() {
    if (s < TOTAL) s++;
    if (s >= TOTAL) stop();
    draw();
  }
  function play() {
    if (timer) {
      stop();
      return draw();
    }
    if (s >= TOTAL) s = 0;
    timer = setInterval(step, 220);
    step();
  }
  function reset() {
    stop();
    s = 0;
    draw();
  }

  btnPlay.addEventListener('click', play);
  btnStep.addEventListener('click', step);
  btnReset.addEventListener('click', reset);
  draw();

  return () => {
    stop();
    btnPlay.removeEventListener('click', play);
    btnStep.removeEventListener('click', step);
    btnReset.removeEventListener('click', reset);
  };
};
