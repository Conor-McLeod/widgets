// Vanilla widget: a toy latency/bandwidth model of NCCL's three protocols on one hop.
// time(n) = alpha + n / (eta * B), using the per-hop latency and bandwidth efficiency from the
// paper's Table I. Plots achieved bandwidth against message size and shades who wins where.
import type { Mount } from '~/widget';
import { tex } from '~/math/tex';

interface Proto {
  name: string;
  alpha: number; // seconds per hop
  eta: () => number; // fraction of link bandwidth carrying data
  color: string;
  dash?: string;
}

const LINKS = {
  nvlink: { label: 'intra-node, 150 GB/s', B: 150e9 },
  net: { label: 'inter-node, 25 GB/s', B: 25e9 },
} as const;
type Link = keyof typeof LINKS;

const W = 520;
const H = 320;
const PAD = { l: 46, r: 12, t: 14, b: 58 };
const X0 = Math.log2(64); // 64 B
const X1 = Math.log2(2 ** 30); // 1 GiB

function fmtBytes(n: number) {
  const u = ['B', 'KiB', 'MiB', 'GiB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2).replace(/\.?0+$/, '')} ${u[i]}`;
}
function fmtTime(s: number) {
  if (s < 1e-3) return `${(s * 1e6).toFixed(s < 1e-5 ? 2 : 1)} µs`;
  if (s < 1) return `${(s * 1e3).toFixed(2)} ms`;
  return `${s.toFixed(2)} s`;
}

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="ncx">
      <div class="ncx-ctl">
        <div class="ncx-seg" role="group" aria-label="Link">
          ${Object.entries(LINKS)
            .map(([k, v]) => `<button data-link="${k}">${v.label}</button>`)
            .join('')}
        </div>
        <label class="ncx-range"><span>LL efficiency</span><input class="ncx-eta" type="range" min="25" max="50" value="50" /><output></output></label>
        <label class="ncx-check"><input class="ncx-l128" type="checkbox" checked /> 128-byte atomic stores (LL128 allowed)</label>
      </div>
      <svg class="ncx-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Achieved bandwidth against message size for Simple, LL and LL128"></svg>
      <p class="ncx-read" aria-live="polite"></p>
      <p class="ncx-cross"></p>
    </div>
    <style>
      .ncx { font-size: .9rem; }
      .ncx-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.1rem; margin-bottom: .6rem; }
      .ncx-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
      .ncx-seg button { font: inherit; color: var(--muted); background: var(--bg); border: 0; padding: .3rem .65rem; cursor: pointer; }
      .ncx-seg button + button { border-left: 1px solid var(--border); }
      .ncx-seg button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
      .ncx-range, .ncx-check { display: flex; align-items: center; gap: .4rem; color: var(--muted); }
      .ncx-range input { width: 6rem; }
      .ncx-range output { font-family: var(--mono); color: var(--text); min-width: 2.5em; }
      .ncx-svg { display: block; width: 100%; height: auto; touch-action: none; cursor: crosshair; }
      .ncx-read { font-family: var(--mono); font-size: .8rem; margin: .4rem 0 .2rem; min-height: 2.8em; }
      .ncx-read b { font-weight: 600; }
      .ncx-cross { color: var(--muted); font-size: .85rem; margin: 0; }
    </style>`;

  const svg = el.querySelector<SVGSVGElement>('.ncx-svg')!;
  const etaIn = el.querySelector<HTMLInputElement>('.ncx-eta')!;
  const etaOut = el.querySelector('output')!;
  const l128In = el.querySelector<HTMLInputElement>('.ncx-l128')!;
  const read = el.querySelector('.ncx-read')!;
  const cross = el.querySelector('.ncx-cross')!;
  const linkButtons = [...el.querySelectorAll<HTMLButtonElement>('.ncx-seg button')];

  let link: Link = 'nvlink';
  let hover = Math.log2(64 * 1024);

  const PROTOS: Proto[] = [
    { name: 'Simple', alpha: 6e-6, eta: () => 1, color: 'var(--text)' },
    { name: 'LL', alpha: 1e-6, eta: () => Number(etaIn.value) / 100, color: 'var(--danger)' },
    { name: 'LL128', alpha: 2e-6, eta: () => 0.95, color: 'var(--accent)', dash: '' },
  ];
  const active = () => PROTOS.filter((p) => p.name !== 'LL128' || l128In.checked);
  const time = (p: Proto, n: number) => p.alpha + n / (p.eta() * LINKS[link].B);

  const xs = (lg: number) => PAD.l + ((lg - X0) / (X1 - X0)) * (W - PAD.l - PAD.r);
  const inv = (x: number) => X0 + ((x - PAD.l) / (W - PAD.l - PAD.r)) * (X1 - X0);

  function winner(n: number) {
    let best = active()[0];
    for (const p of active()) if (time(p, n) < time(best, n)) best = p;
    return best;
  }

  function draw() {
    etaOut.textContent = `${etaIn.value}%`;
    for (const b of linkButtons) b.setAttribute('aria-pressed', String(b.dataset.link === link));
    const B = LINKS[link].B;
    const yMax = (B / 1e9) * 1.05;
    const ys = (gbs: number) => H - PAD.b - (gbs / yMax) * (H - PAD.t - PAD.b);
    const parts: string[] = [];

    // Grid + axes.
    const step = B > 100e9 ? 25 : 5;
    for (let g = 0; g <= yMax; g += step) {
      parts.push(
        `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${ys(g)}" y2="${ys(g)}" stroke="var(--border)" stroke-width="${g === 0 ? 1 : 0.5}" />`,
        `<text x="${PAD.l - 6}" y="${ys(g) + 4}" text-anchor="end" font-size="13" fill="var(--muted)">${g}</text>`,
      );
    }
    for (let lg = 6; lg <= 30; lg += 4) {
      const x = xs(lg);
      parts.push(
        `<line x1="${x}" x2="${x}" y1="${PAD.t}" y2="${H - PAD.b}" stroke="var(--border)" stroke-width=".5" />`,
        `<text x="${x}" y="${H - PAD.b + 14}" text-anchor="middle" font-size="13" fill="var(--muted)">${fmtBytes(2 ** lg)}</text>`,
      );
    }
    parts.push(
      `<text x="${PAD.l}" y="${PAD.t - 2}" font-size="13" fill="var(--muted)">GB/s achieved</text>`,
      `<text x="${W - PAD.r}" y="${H - PAD.b + 30}" text-anchor="end" font-size="13" fill="var(--muted)">message size →</text>`,
    );

    // Winner strip under the axis.
    const N = 160;
    const sy = H - 16;
    for (let i = 0; i < N; i++) {
      const lg = X0 + ((i + 0.5) / N) * (X1 - X0);
      const w = winner(2 ** lg);
      const x = xs(X0 + (i / N) * (X1 - X0));
      parts.push(`<rect x="${x}" y="${sy}" width="${(W - PAD.l - PAD.r) / N + 0.5}" height="8" fill="${w.color}" fill-opacity=".75" />`);
    }
    parts.push(`<text x="${PAD.l - 6}" y="${sy + 8}" text-anchor="end" font-size="12" fill="var(--muted)">fastest</text>`);

    // Curves.
    for (const p of active()) {
      let d = '';
      for (let i = 0; i <= 200; i++) {
        const lg = X0 + (i / 200) * (X1 - X0);
        const n = 2 ** lg;
        d += `${i ? 'L' : 'M'}${xs(lg).toFixed(1)} ${ys(n / time(p, n) / 1e9).toFixed(1)}`;
      }
      parts.push(`<path d="${d}" fill="none" stroke="${p.color}" stroke-width="2" />`);
    }
    // End-of-line labels, pushed apart so close curves don't overlap.
    const nEnd = 2 ** X1;
    const labels = active()
      .map((p) => ({ p, y: ys(nEnd / time(p, nEnd) / 1e9) - 5 }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);
    for (const { p, y } of labels) {
      parts.push(`<text x="${W - PAD.r - 4}" y="${y}" text-anchor="end" font-size="13" fill="${p.color}">${p.name}</text>`);
    }

    // Hover line.
    const hx = xs(hover);
    parts.push(`<line x1="${hx}" x2="${hx}" y1="${PAD.t}" y2="${H - PAD.b}" stroke="var(--muted)" stroke-dasharray="3 3" />`);
    const n = 2 ** hover;
    for (const p of active()) {
      parts.push(`<circle cx="${hx}" cy="${ys(n / time(p, n) / 1e9)}" r="3.5" fill="${p.color}" />`);
    }
    svg.innerHTML = parts.join('');

    const w = winner(n);
    read.innerHTML =
      `<b>${fmtBytes(n)}</b>: ` +
      active()
        .map((p) => `<span style="color:${p.color}">${p.name} ${fmtTime(time(p, n))}${p === w ? ' ✓' : ''}</span>`)
        .join(' · ');

    // Crossovers: alpha_a + n/(eta_a B) = alpha_b + n/(eta_b B).
    const at = (a: Proto, b: Proto) => (b.alpha - a.alpha) / (1 / (a.eta() * B) - 1 / (b.eta() * B));
    const [S, L, L128] = PROTOS;
    if (l128In.checked) {
      cross.innerHTML = `Crossovers: LL → LL128 at about <b>${fmtBytes(at(L, L128))}</b>, LL128 → Simple at about <b>${fmtBytes(at(L128, S))}</b>. Each is ${tex('\\Delta\\alpha')} divided by the difference in ${tex('1/(\\eta B)')}.`;
    } else {
      cross.innerHTML = `Without LL128: LL → Simple at about <b>${fmtBytes(at(L, S))}</b>.`;
    }
  }

  function pick(ev: PointerEvent) {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    hover = Math.min(X1, Math.max(X0, inv(x)));
    draw();
  }
  const onLink = (ev: Event) => {
    link = (ev.currentTarget as HTMLButtonElement).dataset.link as Link;
    draw();
  };

  for (const b of linkButtons) b.addEventListener('click', onLink);
  etaIn.addEventListener('input', draw);
  l128In.addEventListener('change', draw);
  svg.addEventListener('pointermove', pick);
  svg.addEventListener('pointerdown', pick);
  draw();

  return () => {
    for (const b of linkButtons) b.removeEventListener('click', onLink);
    etaIn.removeEventListener('input', draw);
    l128In.removeEventListener('change', draw);
    svg.removeEventListener('pointermove', pick);
    svg.removeEventListener('pointerdown', pick);
  };
};
