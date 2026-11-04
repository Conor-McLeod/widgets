// Vanilla widget: a sender pushes 16 segments through a lossy path to a receiver. Shows the sliding
// window, cumulative ACKs, the retransmission timer and fast retransmit. Tap a packet in flight to drop it.
import type { Mount } from '~/widget';

const N = 16; // segments to deliver
const DELAY = 1.6; // one-way delay, seconds of sim time
const GAP = 0.22; // time to put one segment on the wire
const RTO = 2 * DELAY + 1; // fixed retransmission timeout
const FADE = 0.8; // how long a dropped packet lingers
const H = 236;

interface Pkt {
  kind: 'data' | 'ack';
  n: number; // data: segment index; ack: next expected index
  t0: number;
  retx: boolean;
  /** Fraction of the path at which this packet is (or will be) lost, if it is. */
  dropAt: number | null;
  droppedAt: number | null; // sim time it was lost
}

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="sw">
      <div class="sw-bar">
        <button type="button" data-act="play">pause</button>
        <button type="button" data-act="reset">reset</button>
        <label>window <select data-k="win">${[1, 2, 3, 4, 6, 8].map((w) => `<option${w === 4 ? ' selected' : ''}>${w}</option>`).join('')}</select></label>
        <label>random loss <select data-k="loss"><option value="0" selected>0%</option><option value="0.1">10%</option><option value="0.2">20%</option></select></label>
        <label>speed <select data-k="speed"><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
        <label><input type="checkbox" data-k="fast" checked> fast retransmit</label>
      </div>
      <div class="sw-wrap"><canvas class="sw-canvas" role="img" aria-label="Sender, network path and receiver with packets in flight"></canvas></div>
      <p class="sw-stats"></p>
      <ol class="sw-log" aria-live="polite"></ol>
    </div>
    <style>
      .sw { font-size: .9rem; }
      .sw-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .7rem; }
      .sw button, .sw select { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: .2rem .5rem; cursor: pointer; }
      .sw label { white-space: nowrap; }
      .sw-wrap { margin: .6rem 0 .3rem; }
      .sw-canvas { display: block; width: 100%; height: ${H}px; touch-action: manipulation; cursor: crosshair; }
      .sw-stats { margin: 0; color: var(--muted); font-size: .82rem; }
      .sw-log { margin: .3rem 0 0; padding-left: 1.2rem; min-height: 5.6em; font-size: .85rem; }
      .sw-log li:first-child { font-weight: 600; }
    </style>`;

  const canvas = el.querySelector<HTMLCanvasElement>('.sw-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const bar = el.querySelector<HTMLDivElement>('.sw-bar')!;
  const playBtn = bar.querySelector<HTMLButtonElement>('[data-act="play"]')!;
  const stats = el.querySelector<HTMLParagraphElement>('.sw-stats')!;
  const logEl = el.querySelector<HTMLOListElement>('.sw-log')!;
  const sel = (k: string) => bar.querySelector<HTMLSelectElement | HTMLInputElement>(`[data-k="${k}"]`)!;

  let W = 600;
  let playing = true;

  // Sim state
  let t = 0;
  let base = 0; // oldest unacknowledged segment
  let next = 0; // next new segment to send
  let lastSend = -Infinity;
  let timer: number | null = null; // when the RTO timer for `base` was armed
  let dupAcks = 0;
  let retxQueue: number[] = [];
  let pkts: Pkt[] = [];
  let expected = 0; // receiver: next in-order segment it wants
  let buffered = new Set<number>();
  let sent = 0;
  let retxCount = 0;
  let doneAt: number | null = null;
  let log: string[] = [];

  const opt = {
    win: () => Number(sel('win').value),
    loss: () => Number(sel('loss').value),
    speed: () => Number(sel('speed').value),
    fast: () => (sel('fast') as HTMLInputElement).checked,
  };

  function note(s: string) {
    log.unshift(`${t.toFixed(1)} s · ${s}`);
    log = log.slice(0, 4);
    logEl.innerHTML = log.map((l) => `<li>${l}</li>`).join('');
  }

  function reset() {
    t = 0;
    base = next = 0;
    lastSend = -Infinity;
    timer = null;
    dupAcks = 0;
    retxQueue = [];
    pkts = [];
    expected = 0;
    buffered = new Set();
    sent = retxCount = 0;
    doneAt = null;
    log = [];
    logEl.innerHTML = '<li>Sending. Tap a packet in flight to drop it.</li>';
  }

  function emit(kind: Pkt['kind'], n: number, retx = false) {
    const p = opt.loss();
    pkts.push({ kind, n, t0: t, retx, dropAt: Math.random() < p ? 0.25 + Math.random() * 0.5 : null, droppedAt: null });
  }

  function sendData(n: number, retx: boolean) {
    emit('data', n, retx);
    lastSend = t;
    sent++;
    if (retx) retxCount++;
    if (timer === null) timer = t;
  }

  function onData(n: number) {
    if (n >= expected) buffered.add(n);
    const before = expected;
    while (buffered.has(expected)) buffered.delete(expected++);
    if (n < before) note(`receiver: seg ${n + 1} is a duplicate, re-ACKs ${expected + 1}`);
    else if (expected === before) note(`receiver: seg ${n + 1} arrived out of order, buffered; still wants ${expected + 1}`);
    emit('ack', expected);
  }

  function onAck(a: number) {
    if (a > base) {
      base = a;
      dupAcks = 0;
      retxQueue = retxQueue.filter((n) => n >= base);
      timer = base < next ? t : null;
      if (base === N && doneAt === null) {
        doneAt = t;
        note(`all ${N} segments acknowledged`);
      }
    } else if (a === base && base < next) {
      dupAcks++;
      if (dupAcks === 3) {
        if (opt.fast()) {
          note(`sender: 3 duplicate ACKs for ${a + 1} → fast retransmit seg ${a + 1}`);
          retxQueue.push(a);
          timer = t;
        } else note(`sender: 3 duplicate ACKs for ${a + 1}, but fast retransmit is off, so it waits for the timer`);
      }
    }
  }

  function step(dt: number) {
    t += dt;
    // Arrivals and losses.
    for (const p of pkts) {
      if (p.droppedAt !== null) continue;
      const f = (t - p.t0) / DELAY;
      if (p.dropAt !== null && f >= p.dropAt) {
        p.droppedAt = p.t0 + p.dropAt * DELAY;
        note(`network lost ${p.kind === 'data' ? `seg ${p.n + 1}` : `ack ${p.n + 1}`}`);
      }
    }
    const arrived = pkts.filter((p) => p.droppedAt === null && t - p.t0 >= DELAY);
    pkts = pkts.filter((p) => !arrived.includes(p) && !(p.droppedAt !== null && t - p.droppedAt > FADE));
    for (const p of arrived) (p.kind === 'data' ? onData(p.n) : onAck(p.n));

    // Retransmission timer.
    if (timer !== null && t - timer >= RTO && base < N) {
      note(`sender: timer expired with seg ${base + 1} unacknowledged → retransmit it`);
      dupAcks = 0;
      retxQueue = [base];
      timer = t;
    }

    // One segment per GAP: retransmissions first, then new data if the window allows.
    if (t - lastSend >= GAP) {
      const r = retxQueue.shift();
      if (r !== undefined && r >= base) sendData(r, true);
      else if (next < N && next < base + opt.win()) sendData(next++, false);
    }
  }

  // ---- drawing ----
  const PAD = 12;
  const ROW_S = 24; // sender boxes y
  const LANE_D = 96;
  const LANE_A = 136;
  const ROW_R = 188;
  const BOX_H = 22;

  function colors() {
    const cs = getComputedStyle(el);
    const v = (k: string) => cs.getPropertyValue(k).trim();
    return {
      text: v('--text'), muted: v('--muted'), border: v('--border'), surface: v('--surface'), bg: v('--bg'),
      accent: v('--accent'), soft: v('--accent-soft'), danger: v('--danger'), mono: v('--mono') || 'monospace',
    };
  }

  const bw = () => (W - 2 * PAD) / N;
  const laneX0 = PAD + 14;
  const laneX1 = () => W - PAD - 14;
  const PKT_W = 24;
  const ACK_W = 30;
  const PKT_H = 18;

  function pktRect(p: Pkt) {
    const f = Math.min(1, ((p.droppedAt ?? t) - p.t0) / DELAY);
    const w = p.kind === 'data' ? PKT_W : ACK_W;
    const span = laneX1() - laneX0 - w;
    const x = p.kind === 'data' ? laneX0 + f * span : laneX0 + (1 - f) * span;
    const y = (p.kind === 'data' ? LANE_D : LANE_A) - PKT_H / 2;
    return { x, y, w, h: PKT_H };
  }

  function box(x: number, y: number, w: number, h: number, fill: string, stroke: string, dash = false) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.setLineDash(dash ? [3, 2] : []);
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 3);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw() {
    const c = colors();
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    const b = bw();
    const small = `11px ${c.mono}`;

    // Sender stream.
    ctx.font = `600 11px ${c.mono}`;
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'left';
    ctx.fillText('sender', PAD, 9);
    ctx.textAlign = 'right';
    ctx.font = `10px ${c.mono}`;
    ctx.fillText(`window ${opt.win()} · in flight ${next - base}`, W - PAD, 9);
    for (let i = 0; i < N; i++) {
      const x = PAD + i * b;
      const acked = i < base;
      const out = i >= base && i < next;
      box(x + 1, ROW_S, b - 2, BOX_H, acked ? c.soft : out ? c.surface : c.bg, acked || out ? c.accent : c.border);
      ctx.fillStyle = acked ? c.accent : out ? c.text : c.muted;
      ctx.textAlign = 'center';
      ctx.font = small;
      ctx.fillText(String(i + 1), x + b / 2, ROW_S + BOX_H / 2 + 0.5);
    }
    // Window bracket.
    if (base < N) {
      const x0 = PAD + base * b;
      const x1 = PAD + Math.min(base + opt.win(), N) * b;
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x0 - 1, ROW_S - 3, x1 - x0 + 2, BOX_H + 6, 5);
      ctx.stroke();
    }
    // RTO timer bar.
    const ty = ROW_S + BOX_H + 10;
    ctx.fillStyle = c.border;
    ctx.fillRect(PAD, ty, W - 2 * PAD, 3);
    if (timer !== null) {
      const f = Math.min(1, (t - timer) / RTO);
      ctx.fillStyle = f > 0.75 ? c.danger : c.muted;
      ctx.fillRect(PAD, ty, (W - 2 * PAD) * f, 3);
    }
    ctx.font = `10px ${c.mono}`;
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'left';
    ctx.fillText(timer !== null ? `retransmit timer for seg ${base + 1}` : 'timer off', PAD, ty + 11);
    ctx.textAlign = 'right';
    ctx.fillText(`dup ACKs ${dupAcks}`, W - PAD, ty + 11);

    // Lanes.
    for (const [y, label] of [[LANE_D, 'data →'], [LANE_A, '← acks']] as const) {
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(laneX0, y);
      ctx.lineTo(laneX1(), y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = c.muted;
      ctx.font = `10px ${c.mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(label, W / 2, y + 16);
    }
    ctx.fillStyle = c.muted;
    ctx.font = `600 10px ${c.mono}`;
    ctx.textAlign = 'left';
    ctx.fillText('S', PAD, (LANE_D + LANE_A) / 2);
    ctx.textAlign = 'right';
    ctx.fillText('R', W - PAD, (LANE_D + LANE_A) / 2);

    // Packets.
    for (const p of pkts) {
      const r = pktRect(p);
      const lost = p.droppedAt !== null;
      ctx.globalAlpha = lost ? Math.max(0, 1 - (t - p.droppedAt!) / FADE) : 1;
      if (p.kind === 'data') box(r.x, r.y, r.w, r.h, p.retx ? c.soft : c.surface, lost ? c.danger : c.accent);
      else box(r.x, r.y, r.w, r.h, c.bg, lost ? c.danger : c.muted, true);
      ctx.fillStyle = lost ? c.danger : p.kind === 'data' ? c.text : c.muted;
      ctx.font = small;
      ctx.textAlign = 'center';
      ctx.fillText(p.kind === 'data' ? String(p.n + 1) : `a${p.n + 1}`, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
      if (lost) {
        ctx.strokeStyle = c.danger;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(r.x - 2, r.y - 2);
        ctx.lineTo(r.x + r.w + 2, r.y + r.h + 2);
        ctx.moveTo(r.x + r.w + 2, r.y - 2);
        ctx.lineTo(r.x - 2, r.y + r.h + 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Receiver buffer.
    ctx.font = `600 11px ${c.mono}`;
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'left';
    ctx.fillText('receiver', PAD, ROW_R - 10);
    ctx.textAlign = 'right';
    ctx.font = `10px ${c.mono}`;
    ctx.fillText(expected < N ? `wants ${expected + 1}` : 'complete', W - PAD, ROW_R - 10);
    for (let i = 0; i < N; i++) {
      const x = PAD + i * b;
      const got = i < expected;
      const held = buffered.has(i);
      box(x + 1, ROW_R, b - 2, BOX_H, got ? c.soft : c.bg, got || held ? c.accent : c.border, held);
      ctx.fillStyle = got ? c.accent : held ? c.text : c.muted;
      ctx.font = small;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), x + b / 2, ROW_R + BOX_H / 2 + 0.5);
    }

    const elapsed = doneAt ?? t;
    stats.textContent =
      `${elapsed.toFixed(1)} s · ${sent} segments sent · ${retxCount} retransmitted · ${expected}/${N} delivered in order` +
      (doneAt !== null ? ` · done in ${(doneAt / (2 * DELAY)).toFixed(1)} round trips` : '');
  }

  // ---- loop, input, sizing ----
  let raf = 0;
  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing && (doneAt === null || pkts.length)) {
      // Fixed substeps so behaviour doesn't depend on frame rate.
      const total = dt * opt.speed();
      const n = Math.ceil(total / 0.01);
      for (let i = 0; i < n; i++) step(total / n);
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    W = Math.max(280, canvas.clientWidth);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function onPointer(ev: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const slop = ev.pointerType === 'mouse' ? 3 : 8;
    // Topmost first; only packets still travelling can be dropped.
    for (let i = pkts.length - 1; i >= 0; i--) {
      const p = pkts[i];
      if (p.droppedAt !== null) continue;
      const r = pktRect(p);
      if (x >= r.x - slop && x <= r.x + r.w + slop && y >= r.y - slop && y <= r.y + r.h + slop) {
        p.droppedAt = t;
        note(`you dropped ${p.kind === 'data' ? `seg ${p.n + 1}` : `ack ${p.n + 1}`}`);
        return;
      }
    }
  }

  function onBar(ev: Event) {
    const act = (ev.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.act;
    if (act === 'play') {
      playing = !playing;
      playBtn.textContent = playing ? 'pause' : 'play';
    } else if (act === 'reset') {
      reset();
      playing = true;
      playBtn.textContent = 'pause';
    }
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  reset();
  canvas.addEventListener('pointerdown', onPointer);
  bar.addEventListener('click', onBar);
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.removeEventListener('pointerdown', onPointer);
    bar.removeEventListener('click', onBar);
  };
};
