<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Tex from '~/math/Tex.vue';

// One goal, one afternoon. The deadline is fixed at 17:00; the window before it is cut into N
// slots, and each slot is either work or not. Everything else follows from that.
const N = 60;
const DEADLINE = 17;

const T0 = ref(5); // hours from the start of the window to the deadline
const L0 = ref(1); // hours of work due by the deadline
const theta = ref(70); // the utilisation you can actually keep up, %

type Preset = 'last' | 'trap' | 'steady' | 'early' | 'idle' | 'custom';
const PRESETS: { key: Exclude<Preset, 'custom'>; label: string }[] = [
  { key: 'trap', label: 'most of it, then coast' },
  { key: 'last', label: 'wait, then flat out' },
  { key: 'steady', label: 'little and often' },
  { key: 'early', label: 'start straight away' },
  { key: 'idle', label: 'do nothing' },
];
const preset = ref<Preset>('trap');
const work = ref<boolean[]>([]);

const slot = computed(() => T0.value / N); // hours per slot
function build(p: Exclude<Preset, 'custom'>): boolean[] {
  const k = Math.min(N, Math.round(L0.value / slot.value));
  const out = Array<boolean>(N).fill(false);
  if (p === 'last') for (let i = N - k; i < N; i++) out[i] = true;
  if (p === 'early') for (let i = 0; i < k; i++) out[i] = true;
  if (p === 'trap') {
    const head = Math.round((k * 5) / 6);
    for (let i = 0; i < head; i++) out[i] = true;
    for (let i = N - (k - head); i < N; i++) out[i] = true;
  }
  if (p === 'steady') for (let i = 0; i < N; i++) out[i] = Math.floor(((i + 1) * k) / N) > Math.floor((i * k) / N);
  return out;
}
function apply(p: Exclude<Preset, 'custom'>) {
  preset.value = p;
  work.value = build(p);
}
apply('trap');
watch([T0, L0], () => {
  if (preset.value !== 'custom') work.value = build(preset.value);
});

// Sampled a few times per slot so r's curve shows its shape inside idle stretches.
const SUB = 4;
interface Pt {
  t: number; // hours since the window opened
  done: number;
  left: number;
  T: number;
  r: number;
  S: number;
}
const pts = computed<Pt[]>(() => {
  const th = theta.value / 100;
  const out: Pt[] = [];
  let done = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < SUB; j++) {
      const t = (i + j / SUB) * slot.value;
      const T = T0.value - t;
      const left = Math.max(0, L0.value - done);
      out.push({ t, done, left, T, r: left === 0 ? 0 : left / T, S: T - left / th });
      if (work.value[i]) done += slot.value / SUB;
    }
  }
  const left = Math.max(0, L0.value - done);
  out.push({ t: T0.value, done, left, T: 0, r: left === 0 ? 0 : Infinity, S: -left / th });
  return out;
});

// When the slack first runs out: the same moment r passes theta.
const breach = computed(() => pts.value.find((p) => p.left > 1e-9 && p.S < -1e-9) ?? null);
const missed = computed(() => pts.value[pts.value.length - 1].left > 1e-9);

// Drawn at the container's real width so text stays legible on phones.
const box = ref<HTMLElement>();
const W = ref(640);
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (W.value = Math.max(280, Math.round(e.contentRect.width))));
  if (box.value) ro.observe(box.value);
});
onBeforeUnmount(() => ro?.disconnect());

const M = { l: 40, r: 12 };
const R = { top: 22, h: 130 };
const SL = { top: R.top + R.h + 34, h: 110 };
const ST = { top: SL.top + SL.h + 30, h: 24 };
const H = ST.top + ST.h + 22;
const x = (t: number) => M.l + (t / T0.value) * (W.value - M.l - M.r);
const tAt = (px: number) => Math.min(T0.value, Math.max(0, ((px - M.l) / (W.value - M.l - M.r)) * T0.value));

// r above 100% is off the chart: no amount of work can cover it.
const yR = (r: number) => R.top + R.h - Math.min(r, 1.04) * R.h;
const sDom = computed<[number, number]>(() => {
  const ss = pts.value.map((p) => p.S);
  return [Math.min(-0.25, ...ss), Math.max(0.5, ...ss)];
});
const yS = (s: number) => {
  const [lo, hi] = sDom.value;
  return SL.top + SL.h - ((s - lo) / (hi - lo)) * SL.h;
};
const sTicks = computed(() => {
  const [lo, hi] = sDom.value;
  const step = hi - lo > 6 ? 2 : hi - lo > 2.5 ? 1 : 0.5;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(2));
  return out;
});

const path = (f: (p: Pt) => number, y: (v: number) => number) =>
  pts.value.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(f(p)).toFixed(1)}`).join('');
const rPath = computed(() => path((p) => p.r, yR));
const sPath = computed(() => path((p) => p.S, yS));

const hourTicks = computed(() => {
  const step = T0.value > 6 ? 2 : 1;
  const out: number[] = [];
  for (let h = 0; h <= T0.value + 1e-9; h += step) out.push(T0.value - h);
  return out.reverse();
});
const clock = (t: number) => {
  const mins = Math.round((DEADLINE - T0.value + t) * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};

// Hover anywhere to read off a moment; drag on the strip to paint work.
const hover = ref<number | null>(null);
const painting = ref<boolean | null>(null);
const svgPx = (e: PointerEvent) => {
  const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
  return { px: ((e.clientX - r.left) / r.width) * W.value, py: ((e.clientY - r.top) / r.height) * H };
};
const slotAt = (px: number) => Math.min(N - 1, Math.max(0, Math.floor((tAt(px) / T0.value) * N)));
function paint(i: number) {
  if (painting.value === null || work.value[i] === painting.value) return;
  const w = work.value.slice();
  w[i] = painting.value;
  work.value = w;
  preset.value = 'custom';
}
function onDown(e: PointerEvent) {
  const { px, py } = svgPx(e);
  if (py < ST.top - 6 || py > ST.top + ST.h + 6) return;
  (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  const i = slotAt(px);
  painting.value = !work.value[i];
  paint(i);
}
function onMove(e: PointerEvent) {
  const { px } = svgPx(e);
  hover.value = tAt(px);
  if (painting.value !== null) paint(slotAt(px));
}
function onUp() {
  painting.value = null;
}

const at = computed(() => {
  const t = hover.value ?? 0;
  let best = pts.value[0];
  for (const p of pts.value) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  return best;
});
const hm = (h: number) => {
  const m = Math.round(Math.abs(h) * 60);
  const s = `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  return h < 0 && m > 0 ? `−${s}` : s;
};
const pct = (r: number) => (Number.isFinite(r) ? `${Math.round(r * 100)}\\%` : '\\infty');
const hours = (v: number) => (v === 1 ? '1 hour' : `${v} hours`);
const workLabel = (v: number) => (v < 1 ? `${Math.round(v * 60)} min` : hours(v));
</script>

<template>
  <div class="day">
    <div class="controls">
      <label>
        <span>time until the deadline</span>
        <b>{{ hours(T0) }}</b>
        <input v-model.number="T0" type="range" min="2" max="12" step="1" />
      </label>
      <label>
        <span>work due</span>
        <b>{{ workLabel(L0) }}</b>
        <input v-model.number="L0" type="range" min="0.25" max="4" step="0.25" />
      </label>
      <label>
        <span>pace you can keep, <Tex t="\theta" /></span>
        <b>{{ theta }}%</b>
        <input v-model.number="theta" type="range" min="40" max="100" step="5" />
      </label>
    </div>
    <div class="seg" role="radiogroup" aria-label="Schedule">
      <button
        v-for="p in PRESETS"
        :key="p.key"
        role="radio"
        :aria-checked="preset === p.key"
        :class="{ on: preset === p.key }"
        @click="apply(p.key)"
      >
        {{ p.label }}
      </button>
    </div>

    <div class="readout">
      <span class="muted">{{ clock(at.t) }}</span>
      <span>done <b>{{ hm(at.done) }}</b></span>
      <span>left <b>{{ hm(at.left) }}</b></span>
      <span>to deadline <b>{{ hm(at.T) }}</b></span>
      <span :class="{ bad: at.r > theta / 100 }"><Tex :t="`r = ${pct(at.r)}`" /></span>
      <span :class="{ bad: at.left > 0 && at.S < 0 }">
        <Tex t="S =" /> <b>{{ at.left > 0 ? hm(at.S) : 'done' }}</b>
      </span>
    </div>

    <div ref="box" class="chart">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        aria-label="Required utilisation and slack over the afternoon, with a strip of work slots"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @pointerleave="hover = null"
      >
        <defs>
          <clipPath id="ru-day-above">
            <rect x="0" y="0" :width="W" :height="yR(theta / 100)" />
          </clipPath>
          <clipPath id="ru-day-below">
            <rect x="0" :y="yS(0)" :width="W" :height="H" />
          </clipPath>
        </defs>

        <text class="band" :x="M.l" :y="R.top - 8">required utilisation</text>
        <g class="grid">
          <g v-for="v in [0, 0.25, 0.5, 0.75, 1]" :key="v">
            <line :x1="M.l" :x2="W - M.r" :y1="yR(v)" :y2="yR(v)" />
            <text :x="M.l - 6" :y="yR(v) + 4" text-anchor="end">{{ v * 100 }}%</text>
          </g>
        </g>
        <line class="theta" :x1="M.l" :x2="W - M.r" :y1="yR(theta / 100)" :y2="yR(theta / 100)" />
        <path class="ln" :d="rPath" />
        <path class="ln hot" :d="rPath" clip-path="url(#ru-day-above)" />

        <text class="band" :x="M.l" :y="SL.top - 8">slack at {{ theta }}%, hours</text>
        <g class="grid">
          <g v-for="v in sTicks" :key="v">
            <line :x1="M.l" :x2="W - M.r" :y1="yS(v)" :y2="yS(v)" :class="{ zero: v === 0 }" />
            <text :x="M.l - 6" :y="yS(v) + 4" text-anchor="end">{{ v }}</text>
          </g>
        </g>
        <path class="ln" :d="sPath" />
        <path class="ln hot" :d="sPath" clip-path="url(#ru-day-below)" />

        <g v-if="breach" class="breach">
          <line :x1="x(breach.t)" :x2="x(breach.t)" :y1="R.top" :y2="ST.top + ST.h" />
          <text :x="x(breach.t) - 4" :y="SL.top - 8" text-anchor="end">slack gone {{ clock(breach.t) }}</text>
        </g>

        <text class="band" :x="M.l" :y="ST.top - 6">your afternoon: drag here to paint work</text>
        <rect class="strip-bg" :x="M.l" :y="ST.top" :width="W - M.l - M.r" :height="ST.h" />
        <template v-for="(w, i) in work" :key="i">
          <rect
            v-if="w"
            class="slot"
            :x="x((i * T0) / N)"
            :y="ST.top"
            :width="Math.max(1, x(((i + 1) * T0) / N) - x((i * T0) / N) - 0.5)"
            :height="ST.h"
          />
        </template>
        <g class="grid">
          <text v-for="h in hourTicks" :key="h" :x="x(h)" :y="ST.top + ST.h + 15" text-anchor="middle">
            {{ clock(h) }}
          </text>
        </g>

        <line v-if="hover !== null" class="cursor" :x1="x(at.t)" :x2="x(at.t)" :y1="R.top" :y2="ST.top + ST.h" />
      </svg>
    </div>
    <p class="note muted">
      <template v-if="missed">The deadline passes with {{ hm(pts[pts.length - 1].left) }} still to do.</template>
      <template v-else-if="breach">
        Finished, but from {{ clock(breach.t) }} on it needed more than {{ theta }}% of the time left. Any surprise
        after that and it fails.
      </template>
      <template v-else>Finished without ever needing more than {{ theta }}% of the time left.</template>
    </p>
  </div>
</template>

<style scoped>
.day {
  font-size: 0.9rem;
}
.muted {
  color: var(--muted);
}
.controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.3rem 1rem;
}
.controls label {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0 0.5rem;
  font-size: 0.82rem;
}
.controls label span {
  color: var(--muted);
}
.controls input {
  grid-column: 1 / -1;
  width: 100%;
  accent-color: var(--accent);
}
.controls b {
  font-family: var(--mono);
  font-weight: 500;
  font-size: 0.8rem;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0.6rem 0;
}
.seg button {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.2rem 0.55rem;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}
.seg button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.readout {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 1rem;
  min-height: 1.6rem;
  font-size: 0.82rem;
}
.readout b {
  font-family: var(--mono);
  font-weight: 500;
}
.readout .bad {
  color: var(--danger);
}
svg {
  display: block;
  width: 100%;
  height: auto;
  cursor: crosshair;
  touch-action: pan-y;
  user-select: none;
}
.band {
  fill: var(--muted);
  font-size: 12px;
}
.grid line {
  stroke: var(--border);
}
.grid line.zero {
  stroke: var(--muted);
}
.grid text {
  fill: var(--muted);
  font-size: 11px;
}
.theta {
  stroke: var(--danger);
  stroke-dasharray: 4 4;
  opacity: 0.7;
}
.ln {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linejoin: round;
}
.ln.hot {
  stroke: var(--danger);
}
.breach line {
  stroke: var(--danger);
  stroke-dasharray: 2 3;
  opacity: 0.6;
}
.breach text {
  fill: var(--danger);
  font-size: 11px;
}
.strip-bg {
  fill: var(--surface);
  stroke: var(--border);
  cursor: pointer;
}
.slot {
  fill: var(--accent);
  opacity: 0.75;
  pointer-events: none;
}
.cursor {
  stroke: var(--muted);
  opacity: 0.5;
  pointer-events: none;
}
.note {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
}
</style>
