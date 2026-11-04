// Vanilla widget: how NCCL cuts one collective's buffer into work (the paper's Fig. 3 and Table IV).
// message → channels (one CUDA block / SM each) → outer loop iterations (one channel buffer's worth)
// → NCCL_STEPS = 8 slots, each carrying one chunk through the pipeline.
import type { Mount } from '~/widget';
import { tex } from '~/math/tex';

const KiB = 1024;
const STEPS = 8;
// Effective data per slot under the default configuration (Table IV).
const SLOT = { Simple: 512 * KiB, LL: 16 * KiB, LL128: 562.5 * KiB } as const;
const BUF = { Simple: '4 MiB', LL: '256 KiB', LL128: '≈4800 KiB' } as const;
type Proto = keyof typeof SLOT;

const W = 480;
const BAR = 30;
const ROWS = [22, 118, 214];
const H = 282;
const MAXSEG = 24;

function fmt(n: number) {
  const u = ['B', 'KiB', 'MiB', 'GiB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${Number.isInteger(n) ? n : n < 10 ? n.toFixed(2).replace(/0+$/, '') : n.toFixed(1)} ${u[i]}`;
}

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="ncp">
      <div class="ncp-ctl">
        <label class="ncp-range"><span>message</span><input class="ncp-size" type="range" min="12" max="32" value="26" /><output></output></label>
        <label class="ncp-range"><span>channels</span><input class="ncp-ch" type="range" min="0" max="5" value="3" /><output></output></label>
        <div class="ncp-seg" role="group" aria-label="Protocol">
          ${Object.keys(SLOT)
            .map((p) => `<button data-p="${p}">${p}</button>`)
            .join('')}
        </div>
      </div>
      <svg class="ncp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Message split into channels, loop iterations and slots"></svg>
      <dl class="ncp-stats"></dl>
    </div>
    <style>
      .ncp { font-size: .9rem; }
      .ncp-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.1rem; margin-bottom: .6rem; }
      .ncp-range { display: flex; align-items: center; gap: .4rem; color: var(--muted); }
      .ncp-range input { width: 6.5rem; }
      .ncp-range output { font-family: var(--mono); color: var(--text); min-width: 4.5em; }
      .ncp-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
      .ncp-seg button { font: inherit; color: var(--muted); background: var(--bg); border: 0; padding: .3rem .65rem; cursor: pointer; }
      .ncp-seg button + button { border-left: 1px solid var(--border); }
      .ncp-seg button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
      .ncp-svg { display: block; width: 100%; height: auto; }
      .ncp-stats { display: grid; grid-template-columns: max-content 1fr; gap: .2rem 1rem; margin: .5rem 0 0; font-size: .85rem; }
      .ncp-stats dt { color: var(--muted); }
      .ncp-stats dd { margin: 0; font-family: var(--mono); }
      .ncp-stats .warn { color: var(--danger); font-family: inherit; }
    </style>`;

  const svg = el.querySelector<SVGSVGElement>('.ncp-svg')!;
  const sizeIn = el.querySelector<HTMLInputElement>('.ncp-size')!;
  const chIn = el.querySelector<HTMLInputElement>('.ncp-ch')!;
  const [sizeOut, chOut] = el.querySelectorAll('output');
  const stats = el.querySelector('.ncp-stats')!;
  const buttons = [...el.querySelectorAll<HTMLButtonElement>('.ncp-seg button')];
  let proto: Proto = 'Simple';

  const L = 8;
  const R = W - 8;

  /** One bar split into `n` parts, the first one highlighted; parts beyond MAXSEG are summarised. */
  function bar(y: number, n: number, fill: (i: number) => string, label: string, partLabel: (i: number) => string) {
    const shown = Math.min(n, MAXSEG);
    const w = (R - L) / shown;
    const out: string[] = [`<text x="${L}" y="${y - 5}" font-size="14" fill="var(--muted)">${label}</text>`];
    for (let i = 0; i < shown; i++) {
      const x = L + i * w;
      const more = n > MAXSEG && i === shown - 1;
      out.push(`<rect x="${x + 0.5}" y="${y}" width="${Math.max(w - 1, 0.5)}" height="${BAR}" rx="3" fill="${more ? 'var(--border)' : fill(i)}" />`);
      if (w > 40 && !more) {
        out.push(`<text x="${x + w / 2}" y="${y + BAR / 2 + 4}" text-anchor="middle" font-size="13" fill="${i === 0 ? 'var(--bg)' : 'var(--text)'}">${partLabel(i)}</text>`);
      }
      if (more) {
        out.push(`<text x="${x + w / 2}" y="${y + BAR / 2 + 4}" text-anchor="middle" font-size="12" fill="var(--text)">…</text>`);
      }
    }
    if (n > MAXSEG) {
      out.push(`<text x="${R}" y="${y - 5}" text-anchor="end" font-size="13" fill="var(--muted)">${n.toLocaleString()} in total</text>`);
    }
    return { out, first: w };
  }
  /** Trapezoid showing that the next row zooms into the first part of this one. */
  function zoom(y0: number, wFirst: number, y1: number) {
    return `<path d="M${L} ${y0 + BAR} L${L + wFirst} ${y0 + BAR} L${R} ${y1 - 18} L${L} ${y1 - 18} Z" fill="var(--accent-soft)" fill-opacity=".5" />`;
  }

  function draw() {
    const size = 2 ** Number(sizeIn.value);
    const nCh = 2 ** Number(chIn.value);
    sizeOut.textContent = fmt(size);
    chOut.textContent = String(nCh);
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.p === proto));

    const perCh = size / nCh;
    const slot = SLOT[proto];
    const loopCap = slot * STEPS;
    const loops = Math.ceil(perCh / loopCap);
    const perLoop = Math.min(perCh, loopCap);
    const chunks = Math.ceil(perLoop / slot);
    const chunk = perLoop / chunks;

    const accent = (i: number) => (i === 0 ? 'var(--accent)' : 'var(--accent-soft)');
    const a = bar(ROWS[0], nCh, accent, `message ${fmt(size)} → ${nCh} channel${nCh > 1 ? 's' : ''} (one SM each)`, (i) => `ch ${i}`);
    const b = bar(ROWS[1], loops, accent, `channel 0: ${fmt(perCh)} → ${loops.toLocaleString()} loop${loops > 1 ? 's' : ''} of ≤ ${fmt(loopCap)}`, (i) => `loop ${i}`);
    const c = bar(
      ROWS[2],
      STEPS,
      (i) => (i < chunks ? accent(i) : 'none'),
      `loop 0: ${fmt(perLoop)} → ${STEPS} slots (NCCL_STEPS) of ${fmt(slot)}`,
      (i) => (i < chunks ? `${i}` : ''),
    );
    const empty: string[] = [];
    const sw = (R - L) / STEPS;
    for (let i = chunks; i < STEPS; i++) {
      empty.push(`<rect x="${L + i * sw + 0.5}" y="${ROWS[2]}" width="${sw - 1}" height="${BAR}" rx="3" fill="none" stroke="var(--border)" stroke-dasharray="3 3" />`);
    }
    const fillNote =
      chunk < slot
        ? `<text x="${L}" y="${ROWS[2] + BAR + 16}" font-size="13" fill="var(--danger)">each chunk ${fmt(chunk)}: slots only partly filled</text>`
        : `<text x="${L}" y="${ROWS[2] + BAR + 16}" font-size="13" fill="var(--muted)">each chunk fills its slot</text>`;

    svg.innerHTML = [
      zoom(ROWS[0], a.first, ROWS[1]),
      zoom(ROWS[1], b.first, ROWS[2]),
      ...a.out,
      ...b.out,
      ...c.out,
      ...empty,
      fillNote,
    ].join('');

    stats.innerHTML = `
      <dt>channel buffer</dt><dd>${BUF[proto]} = ${STEPS} slots × ${fmt(slot)} usable data</dd>
      <dt>elementary steps</dt><dd>${(loops * chunks).toLocaleString()} per channel, ${(loops * chunks * nCh).toLocaleString()} in total</dd>
      <dt>CUDA grid</dt><dd>(${nCh}, 1, 1): block ${tex('i')} runs channel ${tex('i')}</dd>
      ${perCh < 512 * KiB ? `<dt></dt><dd class="warn">Each channel's share is under the 512 KiB network FIFO, so a NIC proxy would send partly filled buffers. More channels isn't free.</dd>` : ''}`;
  }

  const onProto = (ev: Event) => {
    proto = (ev.currentTarget as HTMLButtonElement).dataset.p as Proto;
    draw();
  };
  for (const b of buttons) b.addEventListener('click', onProto);
  sizeIn.addEventListener('input', draw);
  chIn.addEventListener('input', draw);
  draw();

  return () => {
    for (const b of buttons) b.removeEventListener('click', onProto);
    sizeIn.removeEventListener('input', draw);
    chIn.removeEventListener('input', draw);
  };
};
