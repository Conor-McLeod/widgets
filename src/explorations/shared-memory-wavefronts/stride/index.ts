// Vanilla widget: wavefronts for "lane t reads element s·t", for every stride s from 0 to 64 and each
// access width. Bars stack the unavoidable wavefronts (one per phase) under the conflict ones.
import type { Mount } from '~/widget';
import { plan, strided, type Width } from '../model';

const MAX_S = 64;
const W = 600;
const L = 34; // left margin
const R = 8;
const PANEL = 78;
const PGAP = 26;
const TOP = 18;
const Y_MAX = 32;
const widths: { w: Width; label: string }[] = [
  { w: 4, label: '32-bit loads (float)' },
  { w: 8, label: '64-bit loads (float2, double)' },
  { w: 16, label: '128-bit loads (float4)' },
];

const data = widths.map(({ w }) =>
  Array.from({ length: MAX_S + 1 }, (_, s) => {
    const p = plan(strided(s), w);
    return { total: p.wavefronts, ideal: p.phases };
  }),
);

export const mount: Mount = (el) => {
  const H = TOP + widths.length * (PANEL + PGAP) + 6;
  el.innerHTML = `
    <div class="sw">
      <svg class="sw-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="wavefronts per load against stride"></svg>
      <p class="sw-readout">Hover or tap a stride.</p>
    </div>
    <style>
      .sw-svg { width: 100%; height: auto; display: block; touch-action: none; font-family: var(--mono); }
      .sw-svg text { fill: var(--muted); font-size: 13px; }
      .sw-svg text.sw-title { fill: var(--text); font-family: inherit; font-size: 14px; }
      .sw-readout { margin: .4rem 0 0; font-family: var(--mono); font-size: .82rem; min-height: 5.6em; line-height: 1.4; white-space: pre; }
      .sw-readout .bad { color: var(--danger); }
    </style>`;

  const svg = el.querySelector('svg')!;
  const readout = el.querySelector<HTMLElement>('.sw-readout')!;
  const bw = (W - L - R) / (MAX_S + 1);
  const x = (s: number) => L + s * bw;
  const panelTop = (i: number) => TOP + i * (PANEL + PGAP);
  const y = (i: number, v: number) => panelTop(i) + PANEL - (v / Y_MAX) * PANEL;

  const parts: string[] = [];
  widths.forEach(({ label }, i) => {
    const t = panelTop(i);
    parts.push(`<text class="sw-title" x="${L}" y="${t - 6}">${label}</text>`);
    for (const v of [8, 16, 32]) {
      parts.push(
        `<line x1="${L}" x2="${W - R}" y1="${y(i, v)}" y2="${y(i, v)}" stroke="var(--border)" stroke-dasharray="2 3" />`,
        `<text x="${L - 5}" y="${y(i, v) + 3.5}" text-anchor="end">${v}</text>`,
      );
    }
    data[i].forEach(({ total, ideal }, s) => {
      const bx = x(s) + 0.6;
      const w = bw - 1.2;
      parts.push(`<rect x="${bx}" width="${w}" y="${y(i, ideal)}" height="${y(i, 0) - y(i, ideal)}" fill="var(--accent)" />`);
      if (total > ideal)
        parts.push(
          `<rect x="${bx}" width="${w}" y="${y(i, total)}" height="${y(i, ideal) - y(i, total)}" fill="color-mix(in srgb, var(--danger) 70%, transparent)" />`,
        );
    });
    parts.push(`<line x1="${L}" x2="${W - R}" y1="${y(i, 0)}" y2="${y(i, 0)}" stroke="var(--muted)" />`);
    for (const s of [0, 8, 16, 24, 32, 40, 48, 56, 64])
      parts.push(`<text x="${x(s) + bw / 2}" y="${y(i, 0) + 12}" text-anchor="middle">${s}</text>`);
  });
  parts.push(`<rect class="sw-hover" y="${TOP - 2}" height="${H - TOP - 4}" width="${bw}" fill="var(--text)" opacity="0.12" visibility="hidden" />`);
  svg.innerHTML = parts.join('');
  const hover = svg.querySelector('.sw-hover')!;

  function onMove(ev: PointerEvent) {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const s = Math.max(0, Math.min(MAX_S, Math.floor((px - L) / bw)));
    hover.setAttribute('x', String(x(s)));
    hover.setAttribute('visibility', 'visible');
    const rows = widths.map(({ w }, i) => {
      const { total, ideal } = data[i][s];
      const extra = total - ideal;
      return `${String(w * 8).padStart(3)}-bit: ${String(total).padStart(2)} wavefront${total === 1 ? ' ' : 's'}${
        extra ? ` <span class="bad">(${extra} extra)</span>` : ''
      }`;
    });
    readout.innerHTML = `stride ${s}${s % 2 ? ' (odd)' : ''}\n${rows.join('\n')}`;
  }
  function onLeave() {
    hover.setAttribute('visibility', 'hidden');
  }

  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerdown', onMove);
  svg.addEventListener('pointerleave', onLeave);
  return () => {
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerdown', onMove);
    svg.removeEventListener('pointerleave', onLeave);
  };
};
