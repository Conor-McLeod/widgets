// Vanilla widget: the block tree. Every block names one parent, so blocks form a tree rooted at genesis.
// Nodes follow the tip of the longest branch; everything off that path is stale. Click any block to mine on it.
import type { Mount } from '~/widget';

interface Blk {
  id: number;
  parent: number | null;
  height: number;
  lane: number;
}

const MAX_BLOCKS = 40;

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="fk">
      <div class="fk-bar">
        <button type="button" data-act="tip">mine on the tip</button>
        <button type="button" data-act="race">start a fork at the tip's parent</button>
        <button type="button" data-act="reset">reset</button>
      </div>
      <div class="fk-wrap"><svg class="fk-svg" role="img" aria-label="Tree of blocks"></svg></div>
      <p class="fk-readout"></p>
      <p class="fk-stats"></p>
    </div>
    <style>
      .fk { font-size: .9rem; }
      .fk-bar { display: flex; flex-wrap: wrap; gap: .4rem; }
      .fk button { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: .25rem .6rem; cursor: pointer; }
      .fk button:disabled { opacity: .45; cursor: default; }
      .fk-wrap { margin: .7rem 0 .4rem; overflow-x: auto; }
      .fk-svg { display: block; height: auto; }
      .fk-svg g.b { cursor: pointer; }
      .fk-svg g.b:hover rect { stroke-width: 2.5; }
      .fk-svg text { font-family: var(--mono); pointer-events: none; }
      .fk-readout { margin: 0; min-height: 2.8em; }
      .fk-stats { margin: .2rem 0 0; color: var(--muted); font-size: .82rem; }
    </style>`;

  const svg = el.querySelector<SVGSVGElement>('.fk-svg')!;
  const wrap = el.querySelector<HTMLDivElement>('.fk-wrap')!;
  const bar = el.querySelector<HTMLDivElement>('.fk-bar')!;
  const readout = el.querySelector<HTMLParagraphElement>('.fk-readout')!;
  const stats = el.querySelector<HTMLParagraphElement>('.fk-stats')!;

  let blocks: Blk[] = [];
  let nextLane = 0;
  let focus = 0;

  function add(parent: number | null): number {
    if (blocks.length >= MAX_BLOCKS) return -1;
    const p = parent === null ? null : blocks[parent];
    // First child continues its parent's row; later children branch onto a fresh row.
    const continues = p !== null && !blocks.some((b) => b.parent === p.id && b.lane === p.lane);
    const lane = p === null ? nextLane++ : continues ? p.lane : nextLane++;
    const b: Blk = {
      id: blocks.length,
      parent,
      height: p ? p.height + 1 : 0,
      lane,
    };
    blocks.push(b);
    return b.id;
  }

  function reset() {
    blocks = [];
    nextLane = 0;
    let id = add(null);
    for (let i = 0; i < 4; i++) id = add(id);
    add(2); // a block that lost a race at height 3
    focus = id;
    draw();
  }

  /** Highest block wins; a tie goes to whichever was seen first (lower id). */
  function tip(): Blk {
    return blocks.reduce((best, b) => (b.height > best.height ? b : best), blocks[0]);
  }

  function mainChain(): Set<number> {
    const s = new Set<number>();
    for (let b: Blk | undefined = tip(); b; b = b.parent === null ? undefined : blocks[b.parent]) s.add(b.id);
    return s;
  }

  function describe(id: number, main: Set<number>, t: Blk): string {
    const b = blocks[id];
    if (b.parent === null) return '<b>Genesis</b>: the one block with no parent. Every node hard-codes its hash.';
    if (main.has(id)) {
      const conf = t.height - b.height + 1;
      return `<b>Height ${b.height}</b>, on the main chain with <b>${conf}</b> confirmation${conf === 1 ? '' : 's'}${
        id === t.id ? ' (it is the tip)' : ''
      }. To undo it, a rival branch from height ${b.height - 1} would need to outgrow ${conf} blocks.`;
    }
    const behind = t.height - b.height;
    return `<b>Height ${b.height}</b>, <span style="color:var(--danger)">stale</span>: a valid block, but not on the longest branch. Its transactions go back to the pool unless the main chain also has them${
      behind <= 1 ? '. Mine on it to make its branch longest' : `. Its branch is ${behind + 1} blocks behind`
    }.`;
  }

  function draw() {
    const t = tip();
    const main = mainChain();
    const DX = 66;
    const DY = 46;
    const BW = 46;
    const BH = 28;
    const PAD = 12;
    const maxH = Math.max(...blocks.map((b) => b.height));
    // Compact rows: renumber lanes in use, so stale rows don't leave gaps.
    const lanes = [...new Set(blocks.map((b) => b.lane))].sort((a, b) => a - b);
    const row = new Map(lanes.map((l, i) => [l, i]));
    const W = Math.max(PAD * 2 + maxH * DX + BW, 360);
    const H = PAD * 2 + (lanes.length - 1) * DY + BH;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // Fill the column, but never enlarge past natural size or shrink below 60%; past that, scroll inside the box.
    svg.style.width = `max(100%, ${Math.round(W * 0.6)}px)`;
    svg.style.maxWidth = `${W}px`;
    const cx = (b: Blk) => PAD + b.height * DX + BW / 2;
    const cy = (b: Blk) => PAD + row.get(b.lane)! * DY + BH / 2;

    const parts: string[] = [];
    for (const b of blocks) {
      if (b.parent === null) continue;
      const p = blocks[b.parent];
      const on = main.has(b.id);
      const x1 = cx(p) + BW / 2;
      const x2 = cx(b) - BW / 2;
      const midX = (x1 + x2) / 2;
      parts.push(
        `<path d="M${x2},${cy(b)} C${midX},${cy(b)} ${midX},${cy(p)} ${x1},${cy(p)}" fill="none" stroke="${on ? 'var(--accent)' : 'var(--border)'}" stroke-width="${on ? 2 : 1.5}" />`,
      );
    }
    for (const b of blocks) {
      const on = main.has(b.id);
      const isTip = b.id === t.id;
      const isFocus = b.id === focus;
      parts.push(
        `<g class="b" data-id="${b.id}">` +
          `<rect x="${cx(b) - BW / 2}" y="${cy(b) - BH / 2}" width="${BW}" height="${BH}" rx="5" ` +
          `fill="${on ? 'var(--accent-soft)' : 'var(--surface)'}" stroke="${on ? 'var(--accent)' : 'var(--muted)'}" ` +
          `stroke-width="${isFocus ? 2.5 : 1.2}" ${on ? '' : 'stroke-dasharray="4 3"'} />` +
          `<text x="${cx(b)}" y="${cy(b) + 4}" text-anchor="middle" font-size="12" fill="${on ? 'var(--accent)' : 'var(--muted)'}">${isTip ? '▲' : ''}${b.height}</text>` +
          `</g>`,
      );
    }
    svg.innerHTML = parts.join('');
    wrap.scrollLeft = wrap.scrollWidth;

    readout.innerHTML = describe(focus, main, t);
    const stale = blocks.length - main.size;
    stats.textContent = `${blocks.length} blocks mined · main chain ${main.size} long (tip ▲ at height ${t.height}) · ${stale} stale${
      blocks.length >= MAX_BLOCKS ? ' · block limit reached, reset to keep going' : ''
    }`;
    const full = blocks.length >= MAX_BLOCKS;
    bar
      .querySelectorAll<HTMLButtonElement>('[data-act="tip"],[data-act="race"]')
      .forEach((btn) => (btn.disabled = full));
  }

  function onClick(ev: MouseEvent) {
    const g = (ev.target as Element).closest<SVGGElement>('g.b');
    if (!g) return;
    const id = add(Number(g.dataset.id));
    focus = id >= 0 ? id : Number(g.dataset.id);
    draw();
  }
  function onOver(ev: PointerEvent) {
    const g = (ev.target as Element).closest<SVGGElement>('g.b');
    if (!g || ev.pointerType !== 'mouse') return;
    readout.innerHTML = describe(Number(g.dataset.id), mainChain(), tip());
  }
  function onLeave() {
    readout.innerHTML = describe(focus, mainChain(), tip());
  }
  function onBar(ev: MouseEvent) {
    const act = (ev.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.act;
    if (act === 'reset') return reset();
    const t = tip();
    const target = act === 'tip' ? t.id : act === 'race' ? (t.parent ?? t.id) : null;
    if (target === null) return;
    const id = add(target);
    if (id >= 0) focus = id;
    draw();
  }

  svg.addEventListener('click', onClick);
  svg.addEventListener('pointerover', onOver);
  svg.addEventListener('pointerleave', onLeave);
  bar.addEventListener('click', onBar);
  reset();

  return () => {
    svg.removeEventListener('click', onClick);
    svg.removeEventListener('pointerover', onOver);
    svg.removeEventListener('pointerleave', onLeave);
    bar.removeEventListener('click', onBar);
  };
};
