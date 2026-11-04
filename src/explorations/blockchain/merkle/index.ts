// Vanilla widget: a Merkle tree over a block's transactions. Edit a transaction to watch the change climb to the
// root; select a leaf to see its inclusion proof (the sibling hashes you'd need to check it against the root).
import type { Mount } from '~/widget';
import { sha256 } from '../lib/sha256';

const SEED = [
  'Alice → Bob 10',
  'Bob → Carol 4',
  'Carol → Dave 1',
  'Dave → Erin 7',
  'Erin → Frank 2',
  'Frank → Grace 3',
  'Grace → Heidi 5',
  'Heidi → Ivan 6',
  'Ivan → Judy 8',
  'Judy → Mallory 1',
  'Mallory → Niaj 9',
  'Niaj → Olivia 2',
  'Olivia → Peggy 4',
  'Peggy → Rupert 3',
  'Rupert → Sybil 5',
  'Sybil → Trent 1',
];

interface Node {
  hash: string;
  /** Odd node out at its level, paired with a copy of itself (Bitcoin's rule). */
  dup: boolean;
  x: number;
}

/** levels[0] = leaves, last = [root]. An odd node out is hashed with itself and flagged `dup`. */
function build(txs: string[], width: number, pad: number): Node[][] {
  const step = (width - 2 * pad) / txs.length;
  let level: Node[] = txs.map((t, i) => ({
    hash: sha256(t),
    dup: false,
    x: pad + step * (i + 0.5),
  }));
  const levels: Node[][] = [level];
  while (level.length > 1) {
    const up: Node[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i];
      const r = level[i + 1] ?? l;
      if (r === l) l.dup = true;
      up.push({
        hash: sha256(l.hash + r.hash),
        dup: false,
        x: (l.x + r.x) / 2,
      });
    }
    level = up;
    levels.push(level);
  }
  return levels;
}

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="mk">
      <div class="mk-bar">
        <label>transactions <input type="range" min="2" max="16" value="8" /> <output></output></label>
        <button type="button" class="mk-reset">reset</button>
      </div>
      <svg class="mk-svg" role="img" aria-label="Merkle tree"></svg>
      <label class="mk-edit">
        <span>tx <b></b></span>
        <input type="text" spellcheck="false" />
      </label>
      <div class="mk-proof"></div>
    </div>
    <style>
      .mk { font-size: .9rem; }
      .mk-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .4rem .8rem; color: var(--muted); }
      .mk-bar label { display: flex; align-items: center; gap: .5rem; }
      .mk-bar output { font-family: var(--mono); color: var(--text); min-width: 1.5em; }
      .mk button { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: .25rem .6rem; cursor: pointer; }
      .mk-svg { display: block; width: 100%; height: auto; margin: .6rem 0; }
      .mk-svg .n { cursor: pointer; }
      .mk-svg text { font-family: var(--mono); pointer-events: none; }
      .mk-edit { display: flex; align-items: center; gap: .5rem; }
      .mk-edit span { color: var(--muted); white-space: nowrap; }
      .mk-edit input { flex: 1; min-width: 0; font: inherit; font-family: var(--mono); color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: .3rem .5rem; }
      .mk-proof { margin-top: .7rem; font-size: .82rem; }
      .mk-proof ol { margin: .3rem 0; padding-left: 1.3rem; font-family: var(--mono); font-size: .78rem; }
      .mk-proof li { overflow-wrap: anywhere; }
      .mk-proof .muted { color: var(--muted); }
      .mk-proof .ok { color: var(--accent); font-weight: 600; }
      .mk-proof .bad { color: var(--danger); font-weight: 600; }
    </style>`;

  const slider = el.querySelector<HTMLInputElement>('.mk-bar input')!;
  const output = el.querySelector('output')!;
  const resetBtn = el.querySelector<HTMLButtonElement>('.mk-reset')!;
  const svg = el.querySelector<SVGSVGElement>('.mk-svg')!;
  const editLabel = el.querySelector('.mk-edit b')!;
  const editInput = el.querySelector<HTMLInputElement>('.mk-edit input')!;
  const proofEl = el.querySelector<HTMLDivElement>('.mk-proof')!;

  // Laid out in real pixels at the container's width, so labels stay legible on phones and just get shorter.
  let W = 640;
  const PAD = 14;
  const ROW = 62;
  const NH = 22;

  let txs = SEED.slice();
  let count = 8;
  let selected = 2;

  function draw() {
    W = Math.max(280, Math.min(720, Math.round(svg.getBoundingClientRect().width || el.clientWidth || 640)));
    output.textContent = String(count);
    const live = txs.slice(0, count);
    const levels = build(live, W, PAD);
    const pristine = build(SEED.slice(0, count), W, PAD);
    const depth = levels.length;
    const H = depth * ROW + 10;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const y = (lvl: number) => H - 26 - lvl * ROW;
    // Node box width shrinks as leaves get denser, and the hash label shortens to match.
    const nodeW = (lvl: number) => {
      const xs = levels[lvl].map((n) => n.x);
      let gap = Infinity;
      for (let i = 1; i < xs.length; i++) gap = Math.min(gap, xs[i] - xs[i - 1]);
      return Math.min(84, gap - 6);
    };
    // Too narrow for even two hex digits: draw the box without a label rather than overflow it.
    const chars = (w: number) => {
      const c = Math.floor((w - 6) / 6.8);
      return c >= 2 ? c : 0;
    };

    // Proof path: the selected leaf's ancestor indices at each level, and the sibling at each level.
    const path: number[] = [];
    const sibs: number[] = [];
    let idx = selected;
    for (let lvl = 0; lvl < depth; lvl++) {
      path.push(idx);
      sibs.push(Math.min(idx ^ 1, levels[lvl].length - 1));
      idx >>= 1;
    }

    const parts: string[] = [];
    for (let lvl = 0; lvl < depth - 1; lvl++) {
      levels[lvl].forEach((n, i) => {
        const p = levels[lvl + 1][i >> 1];
        const onPath = path[lvl] === i;
        parts.push(
          `<line x1="${n.x}" y1="${y(lvl) - NH / 2}" x2="${p.x}" y2="${y(lvl + 1) + NH / 2}" stroke="${onPath ? 'var(--accent)' : 'var(--border)'}" stroke-width="${onPath ? 2 : 1.2}" />`,
        );
      });
    }
    levels.forEach((lv, lvl) => {
      const w = nodeW(lvl);
      lv.forEach((n, i) => {
        const changed = n.hash !== pristine[lvl][i]?.hash;
        const onPath = path[lvl] === i;
        const isSib = sibs[lvl] === i && lvl < depth - 1;
        const w2 = n.dup
          ? `<text x="${n.x + w / 2 + 3}" y="${y(lvl) - NH / 2 + 2}" font-size="10" fill="var(--muted)">×2</text>`
          : '';
        const fill = onPath ? 'var(--accent-soft)' : 'var(--surface)';
        const stroke = changed ? 'var(--danger)' : onPath ? 'var(--accent)' : isSib ? 'var(--text)' : 'var(--border)';
        const label = n.hash.slice(0, chars(w));
        const leaf = lvl === 0;
        parts.push(
          `<g class="${leaf ? 'n' : ''}" data-i="${leaf ? i : ''}">` +
            `<rect x="${n.x - w / 2}" y="${y(lvl) - NH / 2}" width="${w}" height="${NH}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${isSib || changed ? 2 : 1.2}" />` +
            `<text x="${n.x}" y="${y(lvl) + 4}" text-anchor="middle" font-size="11" fill="${changed ? 'var(--danger)' : 'var(--text)'}">${label}</text>` +
            `</g>` +
            w2,
        );
        if (lvl === 0) {
          parts.push(
            `<text x="${n.x}" y="${y(0) + NH / 2 + 14}" text-anchor="middle" font-size="10" fill="${i === selected ? 'var(--accent)' : 'var(--muted)'}">${w < 30 ? i : `tx${i}`}</text>`,
          );
        }
      });
    });
    parts.push(
      `<text x="${levels[depth - 1][0].x}" y="${y(depth - 1) - NH / 2 - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">merkle root → block header</text>`,
    );
    svg.innerHTML = parts.join('');

    editLabel.textContent = String(selected);
    if (document.activeElement !== editInput) editInput.value = txs[selected];

    // Walk the proof the way a light client would: start from the tx, fold in each sibling, compare to the root.
    const steps: string[] = [];
    let h = sha256(live[selected]);
    idx = selected;
    for (let lvl = 0; lvl < depth - 1; lvl++) {
      const sib = (levels[lvl][idx ^ 1] ?? levels[lvl][idx]).hash;
      const right = (idx & 1) === 0;
      h = right ? sha256(h + sib) : sha256(sib + h);
      steps.push(
        `<li>H(${right ? 'me ‖ <b>' + sib.slice(0, 10) + '…</b>' : '<b>' + sib.slice(0, 10) + '…</b> ‖ me'}) = ${h.slice(0, 10)}…</li>`,
      );
      idx >>= 1;
    }
    const root = levels[depth - 1][0].hash;
    const pristineRoot = pristine[depth - 1][0].hash;
    proofEl.innerHTML =
      `<div class="muted">Proof that <b>tx${selected}</b> is in the block: start from H(tx${selected}) = ${sha256(live[selected]).slice(0, 10)}… and fold in ${depth - 1} sibling hash${depth - 1 === 1 ? '' : 'es'} (the boxes outlined in bold):</div>` +
      `<ol>${steps.join('')}</ol>` +
      `<div>Result matches the root in the header: ${
        root === pristineRoot
          ? '<span class="ok">yes</span>'
          : `<span class="bad">no</span> <span class="muted">— an edited tx changed the root from ${pristineRoot.slice(0, 10)}… to ${root.slice(0, 10)}…, so the published header no longer vouches for this block's contents</span>`
      }</div>`;
  }

  function onSlide() {
    count = Number(slider.value);
    if (selected >= count) selected = count - 1;
    draw();
  }
  function onClick(ev: MouseEvent) {
    const g = (ev.target as Element).closest<SVGGElement>('g.n');
    if (!g) return;
    selected = Number(g.dataset.i);
    editInput.value = txs[selected];
    draw();
  }
  function onEdit() {
    txs[selected] = editInput.value;
    draw();
  }
  function onReset() {
    txs = SEED.slice();
    editInput.value = txs[selected];
    draw();
  }

  slider.addEventListener('input', onSlide);
  svg.addEventListener('click', onClick);
  editInput.addEventListener('input', onEdit);
  resetBtn.addEventListener('click', onReset);
  draw();
  let lastW = W;
  const ro = new ResizeObserver(() => {
    const w = Math.round(svg.getBoundingClientRect().width);
    if (w && Math.abs(w - lastW) > 4) {
      draw();
      lastW = W;
    }
  });
  ro.observe(svg);

  return () => {
    ro.disconnect();
    slider.removeEventListener('input', onSlide);
    svg.removeEventListener('click', onClick);
    editInput.removeEventListener('input', onEdit);
    resetBtn.removeEventListener('click', onReset);
  };
};
