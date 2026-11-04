<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Tex from '~/math/Tex.vue';

// Published per-position rates from the DFlash 2 post (Inco AI, Aug 2026): each is the chance
// that draft position k is right, given every earlier position was right.
interface Series {
  key: string;
  label: string;
  slot: number; // categorical colour slot, fixed per series
  dashed?: boolean;
  rates: number[];
}
interface Dataset {
  key: string;
  name: string;
  note: string;
  series: Series[];
}

const DATA: Dataset[] = [
  {
    key: 'depth',
    name: 'Depth vs convolution',
    note: 'Qwen3-4B drafters on GSM8K, greedy (top-1 recall). “Top-16 oracle” is the 5-layer drafter if a perfect selector could pick from its 16 best candidates.',
    series: [
      { key: '3L', label: '3 layers', slot: 2, rates: [85.21, 79.26, 77.18, 75.75, 73.96, 70.4, 64.97] },
      { key: '5L', label: '5 layers', slot: 1, rates: [85.39, 80.31, 79.39, 78.27, 77.39, 76.03, 72.86] },
      { key: '15L', label: '15 layers', slot: 3, rates: [86.42, 81.61, 80.68, 80.34, 80.59, 79.66, 78.73] },
      { key: 'conv', label: '5 layers + conv', slot: 4, rates: [85.83, 80.94, 79.98, 79.68, 79.73, 79.43, 77.61] },
      { key: 'oracle', label: 'top-16 oracle', slot: 0, dashed: true, rates: [99.5, 97.3, 94.8, 92.6, 90.8, 89.4, 87.8] },
    ],
  },
  {
    key: 'e2e',
    name: 'Full methods',
    note: 'Qwen3.5-4B drafters on MATH-500, sampling at temperature 1 with lossless rejection sampling, 15 draft positions.',
    series: [
      { key: 'mtp', label: 'MTP', slot: 2, rates: [84.57, 80.23, 79, 78.42, 78.63, 78.17, 77.36, 77.74, 77.91, 76.96, 78.06, 77.4, 77.49, 77.48, 77.85] },
      { key: 'df', label: 'DFlash', slot: 1, rates: [88.35, 77.7, 77.8, 79.45, 80.3, 81.12, 81.22, 81.07, 81.29, 80.28, 80.64, 80.29, 79.56, 78.77, 77.48] },
      { key: 'dspark', label: 'DSpark', slot: 3, rates: [87.24, 84.59, 83.79, 83.63, 83.6, 83.27, 82.97, 82.54, 82.21, 82.39, 81.58, 80.7, 81.35, 80.57, 79.86] },
      { key: 'df2', label: 'DFlash 2', slot: 4, rates: [88.3, 85.3, 84.98, 84.88, 85.41, 85.3, 85.36, 85.13, 85.95, 85.99, 86.41, 86.46, 86.43, 86.02, 86.48] },
    ],
  },
];

const dataKey = ref(DATA[0].key);
const ds = computed(() => DATA.find((d) => d.key === dataKey.value)!);
const view = ref<'rate' | 'survive'>('rate');
const hidden = ref<Set<string>>(new Set());
watch(dataKey, () => (hidden.value = new Set()));
function toggle(k: string) {
  const s = new Set(hidden.value);
  if (s.has(k)) s.delete(k);
  else s.add(k);
  hidden.value = s;
}

// Survival: probability the first k+1 drafts are all accepted. Expected tokens per cycle is
// 1 (the target's own token) plus the sum of survivals.
const survival = (r: number[]) => {
  let acc = 1;
  return r.map((x) => (acc *= x / 100));
};
const tau = (r: number[]) => 1 + survival(r).reduce((a, b) => a + b, 0);

const values = (s: Series) => (view.value === 'rate' ? s.rates.map((x) => x / 100) : survival(s.rates));
const visible = computed(() => ds.value.series.filter((s) => !hidden.value.has(s.key)));
const n = computed(() => ds.value.series[0].rates.length);

// Drawn at the container's real width so text stays legible on phones.
const chartEl = ref<HTMLElement>();
const W = ref(640);
const H = computed(() => (W.value < 480 ? 220 : 240));
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (W.value = Math.max(280, Math.round(e.contentRect.width))));
  if (chartEl.value) ro.observe(chartEl.value);
});
onBeforeUnmount(() => ro?.disconnect());
const M = { l: 42, r: 14, t: 12, b: 34 };
const domain = computed<[number, number]>(() => (view.value === 'rate' ? [0.6, 1] : [0, 1]));
const x = (k: number) => M.l + (k / (n.value - 1)) * (W.value - M.l - M.r);
const y = (v: number) => {
  const [a, b] = domain.value;
  return H.value - M.b - ((v - a) / (b - a)) * (H.value - M.t - M.b);
};
const yTicks = computed(() => (view.value === 'rate' ? [0.6, 0.7, 0.8, 0.9, 1] : [0, 0.25, 0.5, 0.75, 1]));
const line = (s: Series) =>
  values(s)
    .map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`)
    .join('');

const hover = ref<number | null>(null);
function onMove(e: PointerEvent) {
  const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
  const px = ((e.clientX - r.left) / r.width) * W.value;
  const k = Math.round(((px - M.l) / (W.value - M.l - M.r)) * (n.value - 1));
  hover.value = Math.min(n.value - 1, Math.max(0, k));
}
const tipLeft = computed(() => (hover.value === null ? '0' : `${Math.min(80, Math.max(20, (100 * x(hover.value)) / W.value))}%`));
const fmt = (v: number) => `${(v * 100).toFixed(1)}%`;
</script>

<template>
  <div class="dec">
    <div class="bar">
      <div class="seg" role="radiogroup" aria-label="Dataset">
        <button
          v-for="d in DATA"
          :key="d.key"
          role="radio"
          :aria-checked="dataKey === d.key"
          :class="{ on: dataKey === d.key }"
          @click="dataKey = d.key"
        >
          {{ d.name }}
        </button>
      </div>
      <div class="seg" role="radiogroup" aria-label="What to plot">
        <button role="radio" :aria-checked="view === 'rate'" :class="{ on: view === 'rate' }" @click="view = 'rate'">
          per position
        </button>
        <button
          role="radio"
          :aria-checked="view === 'survive'"
          :class="{ on: view === 'survive' }"
          @click="view = 'survive'"
        >
          whole prefix survives
        </button>
      </div>
    </div>

    <div class="legend">
      <button
        v-for="s in ds.series"
        :key="s.key"
        class="lg"
        :class="{ off: hidden.has(s.key) }"
        :aria-pressed="!hidden.has(s.key)"
        @click="toggle(s.key)"
      >
        <i class="sw" :class="[`s${s.slot}`, { dashed: s.dashed }]"></i>
        <span>{{ s.label }}</span>
        <code><Tex :t="`\\tau=${tau(s.rates).toFixed(2)}`" /></code>
      </button>
    </div>

    <div ref="chartEl" class="chart">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        :aria-label="`${ds.name}: acceptance by draft position`"
        @pointermove="onMove"
        @pointerleave="hover = null"
      >
        <g class="grid">
          <g v-for="t in yTicks" :key="t">
            <line :x1="M.l" :x2="W - M.r" :y1="y(t)" :y2="y(t)" />
            <text :x="M.l - 6" :y="y(t) + 4" text-anchor="end">{{ Math.round(t * 100) }}%</text>
          </g>
          <text
            v-for="k in n"
            v-show="n < 10 || (k - 1) % 2 === 0"
            :key="k"
            :x="x(k - 1)"
            :y="H - M.b + 16"
            text-anchor="middle"
          >
            {{ k - 1 }}
          </text>
          <text :x="(M.l + W - M.r) / 2" :y="H - 4" text-anchor="middle">draft position in the block</text>
        </g>
        <line v-if="hover !== null" class="cursor" :x1="x(hover)" :x2="x(hover)" :y1="M.t" :y2="H - M.b" />
        <path
          v-for="s in visible"
          :key="s.key"
          class="ln"
          :class="[`s${s.slot}`, { dashed: s.dashed }]"
          :d="line(s)"
        />
        <template v-if="hover !== null">
          <circle
            v-for="s in visible"
            :key="s.key"
            class="dot"
            :class="`s${s.slot}`"
            :cx="x(hover)"
            :cy="y(values(s)[hover])"
            r="4"
          />
        </template>
      </svg>
      <div v-if="hover !== null && visible.length" class="tip" :style="{ left: tipLeft }">
        <div class="muted">position {{ hover }}</div>
        <div v-for="s in visible" :key="s.key">
          <i class="sw" :class="`s${s.slot}`"></i>{{ s.label }} <b>{{ fmt(values(s)[hover]) }}</b>
        </div>
      </div>
    </div>
    <p class="note muted">
      {{ ds.note }} <Tex t="\tau" /> is the expected tokens per cycle these rates imply: one from the target plus the
      area under the “whole prefix survives” curve.
    </p>

    <details class="tbl">
      <summary>Table</summary>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th v-for="k in n" :key="k">{{ k - 1 }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in ds.series" :key="s.key">
              <th>{{ s.label }}</th>
              <td v-for="(v, k) in values(s)" :key="k">{{ (v * 100).toFixed(0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>

<style scoped>
.dec {
  font-size: 0.9rem;
  --s0: var(--muted);
  --s1: #2a78d6;
  --s2: #eb6834;
  --s3: #1baf7a;
  --s4: #6250d6;
}
@media (prefers-color-scheme: dark) {
  .dec {
    --s1: #3987e5;
    --s2: #d95926;
    --s3: #199e70;
    --s4: #9085e9;
  }
}
.muted {
  color: var(--muted);
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}
.seg {
  display: flex;
  gap: 4px;
}
button {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}
.seg button {
  padding: 0.2rem 0.55rem;
  font-size: 0.8rem;
}
.seg button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0.6rem 0 0.2rem;
}
.lg {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.45rem;
  font-size: 0.78rem;
}
.lg code {
  font-size: 0.74rem;
  color: var(--muted);
}
.lg.off {
  opacity: 0.4;
}
.lg.off .sw {
  background: transparent !important;
  border: 1px solid var(--muted);
}
.sw {
  display: inline-block;
  width: 0.8rem;
  height: 0.25rem;
  border-radius: 2px;
  margin-right: 0.3rem;
  vertical-align: middle;
}
.sw.dashed {
  background: repeating-linear-gradient(90deg, var(--s0) 0 3px, transparent 3px 5px) !important;
}
.sw.s0 { background: var(--s0); }
.sw.s1 { background: var(--s1); }
.sw.s2 { background: var(--s2); }
.sw.s3 { background: var(--s3); }
.sw.s4 { background: var(--s4); }
.chart {
  position: relative;
}
svg {
  display: block;
  width: 100%;
  height: auto;
  cursor: crosshair;
  touch-action: pan-y;
}
.grid line {
  stroke: var(--border);
}
.grid text {
  fill: var(--muted);
  font-size: 12px;
}
.cursor {
  stroke: var(--muted);
  opacity: 0.5;
}
.ln {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  transition: d 0.25s;
}
.ln.dashed {
  stroke-dasharray: 5 4;
}
.ln.s0 { stroke: var(--s0); }
.ln.s1 { stroke: var(--s1); }
.ln.s2 { stroke: var(--s2); }
.ln.s3 { stroke: var(--s3); }
.ln.s4 { stroke: var(--s4); }
.dot {
  stroke: var(--surface);
  stroke-width: 2;
}
.dot.s0 { fill: var(--s0); }
.dot.s1 { fill: var(--s1); }
.dot.s2 { fill: var(--s2); }
.dot.s3 { fill: var(--s3); }
.dot.s4 { fill: var(--s4); }
.tip {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  font-size: 0.74rem;
  pointer-events: none;
  white-space: nowrap;
}
.tip .sw {
  height: 0.6rem;
  width: 0.6rem;
}
.note {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
}
.tbl {
  margin-top: 0.4rem;
  font-size: 0.78rem;
}
.tbl summary {
  cursor: pointer;
  color: var(--muted);
}
.scroll {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  font-family: var(--mono);
  font-size: 0.72rem;
}
th,
td {
  padding: 0.1rem 0.35rem;
  text-align: right;
  border-bottom: 1px solid var(--border);
}
tbody th {
  text-align: left;
  font-family: var(--font);
  white-space: nowrap;
}
</style>
