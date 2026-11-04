<script setup lang="ts">
// The congestion window, one round trip at a time. Slow start doubles it, congestion avoidance adds
// one segment per round, and a loss halves it (Reno) or resets it to 1 (Tahoe). The bottleneck link
// carries `bdp` segments per round trip and its router can queue `buf` more; anything beyond is dropped.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type Alg = 'reno' | 'tahoe';
interface Round {
  r: number;
  cwnd: number;
  ssthresh: number;
  event: 'loss' | 'timeout' | null;
  phase: 'slow start' | 'congestion avoidance';
  delivered: number;
  queue: number;
}

const ROUNDS = 64;
const bdp = ref(16);
const buf = ref(8);
const alg = ref<Alg>('reno');
const timeouts = ref(new Set<number>());

function simulate(a: Alg, bdpV: number, bufV: number, tos: Set<number>): Round[] {
  const out: Round[] = [];
  let cwnd = 1;
  let ssthresh = Infinity;
  for (let r = 0; r < ROUNDS; r++) {
    const phase = cwnd < ssthresh ? 'slow start' : 'congestion avoidance';
    const timeout = tos.has(r);
    const loss = !timeout && cwnd > bdpV + bufV;
    out.push({
      r,
      cwnd,
      ssthresh,
      phase,
      event: timeout ? 'timeout' : loss ? 'loss' : null,
      delivered: timeout ? 0 : Math.min(cwnd, bdpV),
      queue: Math.max(0, Math.min(cwnd, bdpV + bufV) - bdpV),
    });
    if (timeout || loss) {
      ssthresh = Math.max(Math.floor(cwnd / 2), 2);
      // Three duplicate ACKs: Reno halves and carries on; Tahoe (and any timeout) starts over from 1.
      cwnd = loss && a === 'reno' ? ssthresh : 1;
    } else if (cwnd < ssthresh) {
      cwnd = Math.min(cwnd * 2, ssthresh);
    } else {
      cwnd += 1;
    }
  }
  return out;
}

const runs = computed(() => ({
  reno: simulate('reno', bdp.value, buf.value, timeouts.value),
  tahoe: simulate('tahoe', bdp.value, buf.value, timeouts.value),
}));
const run = computed(() => runs.value[alg.value]);
const other = computed(() => runs.value[alg.value === 'reno' ? 'tahoe' : 'reno']);

function summary(rs: Round[]) {
  const util = rs.reduce((s, x) => s + x.delivered, 0) / (rs.length * bdp.value);
  const queue = rs.reduce((s, x) => s + x.queue, 0) / rs.length;
  const losses = rs.filter((x) => x.event === 'loss').length;
  return { util, queue, losses };
}
const stats = computed(() => ({ reno: summary(runs.value.reno), tahoe: summary(runs.value.tahoe) }));

// Plot geometry, in CSS pixels at the column's width so labels stay readable on phones.
const width = ref(640);
const root = ref<HTMLElement | null>(null);
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(() => (width.value = root.value?.clientWidth ?? 640));
  if (root.value) ro.observe(root.value);
});
onBeforeUnmount(() => ro?.disconnect());

const W = computed(() => Math.max(300, width.value));
const H = computed(() => (W.value < 480 ? 250 : 300));
const L = 34;
const R = 66; // room for the zone labels
const T = 26;
const B = 34;
const yMax = computed(() => {
  const peak = Math.max(...runs.value.reno.map((p) => p.cwnd), ...runs.value.tahoe.map((p) => p.cwnd));
  return Math.ceil(Math.max(peak, bdp.value + buf.value) * 1.08) + 1;
});
const x = (r: number) => L + (r / ROUNDS) * (W.value - L - R);
const y = (v: number) => T + (1 - Math.min(v, yMax.value) / yMax.value) * (H.value - T - B);
const colW = computed(() => (W.value - L - R) / ROUNDS);

/** A step line: the window is constant for the whole round trip. */
function steps(rs: Round[], key: 'cwnd' | 'ssthresh') {
  let d = '';
  let pen = false;
  for (const p of rs) {
    const v = p[key];
    if (!Number.isFinite(v)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${x(p.r)},${y(v)} L${x(p.r + 1)},${y(v)} `;
    pen = true;
  }
  return d;
}

const yTicks = computed(() => {
  const step = yMax.value > 60 ? 20 : yMax.value > 30 ? 10 : 5;
  const out: number[] = [];
  for (let v = 0; v <= yMax.value; v += step) out.push(v);
  return out;
});
const xTicks = computed(() => {
  const every = W.value < 480 ? 16 : 8;
  return Array.from({ length: ROUNDS / every + 1 }, (_, i) => i * every);
});

const hover = ref<number | null>(null);
const readout = computed(() => {
  if (hover.value === null)
    return 'Hover over the chart to read a round. Click a round to force a timeout there; click it again to remove it.';
  const p = run.value[hover.value];
  const ss = Number.isFinite(p.ssthresh) ? p.ssthresh : '∞';
  const ev =
    p.event === 'loss'
      ? ` The window overflowed the buffer, so a packet was dropped. Three duplicate ACKs follow, and ${alg.value === 'reno' ? 'Reno halves the window' : 'Tahoe drops the window to 1'}.`
      : p.event === 'timeout'
        ? ' A forced timeout: the sender heard nothing for a whole RTO, so it falls back to a window of 1.'
        : '';
  return `Round ${p.r}: cwnd ${p.cwnd}, ssthresh ${ss}, ${p.phase}. Delivered ${p.delivered} of ${bdp.value} possible, ${p.queue} queued.${ev}`;
});

function toggle(r: number) {
  const s = new Set(timeouts.value);
  if (s.has(r)) s.delete(r);
  else s.add(r);
  timeouts.value = s;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
</script>

<template>
  <div ref="root" class="cc">
    <div class="bar">
      <span class="seg" role="group" aria-label="Algorithm">
        <button :aria-pressed="alg === 'reno'" @click="alg = 'reno'">Reno</button>
        <button :aria-pressed="alg === 'tahoe'" @click="alg = 'tahoe'">Tahoe</button>
      </span>
      <label>link <input v-model.number="bdp" type="range" min="4" max="40" /> <span class="num">{{ bdp }}</span></label>
      <label>buffer <input v-model.number="buf" type="range" min="0" max="40" /> <span class="num">{{ buf }}</span></label>
      <button :disabled="!timeouts.size" @click="timeouts = new Set()">clear timeouts</button>
    </div>

    <svg :viewBox="`0 0 ${W} ${H}`" :width="W" :height="H" role="img" aria-label="Congestion window over time" @pointerleave="hover = null">
      <!-- Zones: link capacity, router buffer, overflow. -->
      <rect :x="L" :y="y(bdp + buf)" :width="W - L - R" :height="y(bdp) - y(bdp + buf)" class="zone-buf" />
      <rect :x="L" :y="T" :width="W - L - R" :height="y(bdp + buf) - T" class="zone-loss" />
      <line :x1="L" :x2="W - R" :y1="y(bdp)" :y2="y(bdp)" class="cap" />
      <text :x="W - R + 5" :y="y(bdp) + 4" class="zl">link full</text>
      <text v-if="y(bdp) - y(bdp + buf) > 26" :x="W - R + 5" :y="(y(bdp) + y(bdp + buf)) / 2 + 4" class="zl">queued</text>
      <text :x="W - R + 5" :y="(T + y(bdp + buf)) / 2 + 4" class="zl">dropped</text>

      <g class="axis">
        <template v-for="v in yTicks" :key="'y' + v">
          <line :x1="L - 4" :x2="L" :y1="y(v)" :y2="y(v)" />
          <text :x="L - 7" :y="y(v) + 4" text-anchor="end">{{ v }}</text>
        </template>
        <template v-for="r in xTicks" :key="'x' + r">
          <line :x1="x(r)" :x2="x(r)" :y1="H - B" :y2="H - B + 4" />
          <text :x="x(r)" :y="H - B + 16" text-anchor="middle">{{ r }}</text>
        </template>
        <line :x1="L" :x2="L" :y1="T" :y2="H - B" />
        <line :x1="L" :x2="W - R" :y1="H - B" :y2="H - B" />
        <text :x="(L + W - R) / 2" :y="H - 4" text-anchor="middle">round trips</text>
        <text :x="L - 30" :y="T - 12">cwnd (segments)</text>
      </g>

      <path :d="steps(other, 'cwnd')" class="ghost" />
      <path :d="steps(run, 'ssthresh')" class="ss" />
      <path :d="steps(run, 'cwnd')" class="cw" />

      <template v-for="p in run" :key="'e' + p.r">
        <text v-if="p.event" :x="x(p.r + 0.5)" :y="y(p.cwnd) - 6" text-anchor="middle" :class="['ev', p.event]">
          {{ p.event === 'loss' ? '▼' : '✕' }}
        </text>
      </template>

      <rect v-if="hover !== null" :x="x(hover)" :y="T" :width="colW" :height="H - T - B" class="hl" />
      <rect
        v-for="p in run"
        :key="'h' + p.r"
        :x="x(p.r)"
        :y="T"
        :width="colW"
        :height="H - T - B"
        class="hit"
        @pointerenter="hover = p.r"
        @click="toggle(p.r)"
      />
    </svg>

    <div class="legend small">
      <span><i class="k cw" /> {{ alg === 'reno' ? 'Reno' : 'Tahoe' }} cwnd</span>
      <span><i class="k ss" /> ssthresh</span>
      <span><i class="k ghost" /> {{ alg === 'reno' ? 'Tahoe' : 'Reno' }} for comparison</span>
      <span><b class="loss">▼</b> loss (3 dup ACKs)</span>
      <span><b class="timeout">✕</b> timeout</span>
    </div>

    <p class="readout">{{ readout }}</p>

    <table class="small">
      <thead>
        <tr><th /><th>link used</th><th>avg queue</th><th>losses</th></tr>
      </thead>
      <tbody>
        <tr v-for="a in ['reno', 'tahoe'] as const" :key="a" :class="{ on: a === alg }">
          <th>{{ a === 'reno' ? 'Reno' : 'Tahoe' }}</th>
          <td>{{ pct(stats[a].util) }}</td>
          <td>{{ stats[a].queue.toFixed(1) }} seg</td>
          <td>{{ stats[a].losses }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.cc {
  font-size: 0.9rem;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.9rem;
}
.bar label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.bar input[type='range'] {
  width: 7rem;
  accent-color: var(--accent);
}
.num {
  font-family: var(--mono);
  min-width: 2ch;
}
button {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.25rem 0.6rem;
  cursor: pointer;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
.seg button {
  border-radius: 0;
}
.seg button:first-child {
  border-radius: 6px 0 0 6px;
}
.seg button:last-child {
  border-radius: 0 6px 6px 0;
  border-left: none;
}
.seg button[aria-pressed='true'] {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
}
svg {
  display: block;
  width: 100%;
  height: auto;
  margin: 0.6rem 0 0.2rem;
  user-select: none;
}
svg text {
  font-family: var(--mono);
  font-size: 12px;
  fill: var(--muted);
}
.axis line {
  stroke: var(--muted);
}
.zone-buf {
  fill: var(--accent-soft);
}
.zone-loss {
  fill: var(--danger);
  opacity: 0.07;
}
.cap {
  stroke: var(--accent);
  stroke-dasharray: 4 3;
  opacity: 0.7;
}
.zl {
  font-size: 11px !important;
}
.cw {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2.5;
}
.ss {
  fill: none;
  stroke: var(--muted);
  stroke-width: 1.3;
  stroke-dasharray: 5 4;
}
.ghost {
  fill: none;
  stroke: var(--muted);
  stroke-width: 1.5;
  opacity: 0.45;
}
.ev {
  font-size: 12px !important;
}
.ev.loss,
.loss {
  fill: var(--danger);
  color: var(--danger);
}
.ev.timeout,
.timeout {
  fill: var(--text);
  color: var(--text);
}
.hit {
  fill: transparent;
  cursor: pointer;
}
.hl {
  fill: var(--text);
  opacity: 0.06;
  pointer-events: none;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 1rem;
  color: var(--muted);
}
.k {
  display: inline-block;
  width: 1.4em;
  height: 0;
  vertical-align: middle;
  border-top: 2.5px solid var(--accent);
}
.k.ss {
  border-top: 1.5px dashed var(--muted);
}
.k.ghost {
  border-top: 1.5px solid var(--muted);
  opacity: 0.5;
}
.readout {
  margin: 0.5rem 0;
  min-height: 4.2em;
}
table {
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
th,
td {
  text-align: left;
  padding: 0.15rem 0.8rem 0.15rem 0;
  font-weight: normal;
}
thead th {
  color: var(--muted);
}
tbody th {
  font-weight: 600;
}
tr.on td,
tr.on th {
  color: var(--accent);
}
.small {
  font-size: 0.82rem;
}
</style>
