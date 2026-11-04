<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Tex from '~/math/Tex.vue';

// A toy cost model, in units of one target forward pass (= 1).
// Verifying a block is one target pass; decoding is memory-bound, so a few extra
// positions cost almost nothing.
const verify = (g: number) => 1 + 0.004 * (g + 1);
// Autoregressive drafter (EAGLE-3 style: one layer + LM head), one pass per draft token.
const AR_STEP = 0.06;
const arDraft = (g: number) => g * AR_STEP;
// DFlash: one pass through L layers for the whole block, plus a sliver per extra position.
const PASS = 0.02;
const LAYER = 0.012;
const dfDraft = (g: number, layers: number) => PASS + layers * LAYER + 0.002 * g;

// Expected tokens per cycle when each draft position is accepted with probability a
// (given the ones before it were), plus the one token the target always contributes.
const tau = (a: number, g: number) => (a >= 1 ? g + 1 : (1 - a ** (g + 1)) / (1 - a));

const gamma = ref(7);
const aAR = ref(0.8);
const aDF = ref(0.8);
const layers = ref(5);

const G_MAX = 16;
const gs = Array.from({ length: G_MAX }, (_, i) => i + 1);

const speedAR = (g: number) => tau(aAR.value, g) / (arDraft(g) + verify(g));
const speedDF = (g: number) => tau(aDF.value, g) / (dfDraft(g, layers.value) + verify(g));

const rows = computed(() => {
  const g = gamma.value;
  return [
    {
      key: 'plain',
      label: 'No drafter',
      draft: 0,
      steps: 0,
      verify: 1,
      tokens: 1,
    },
    {
      key: 'ar',
      label: 'Autoregressive drafter',
      draft: arDraft(g),
      steps: g,
      verify: verify(g),
      tokens: tau(aAR.value, g),
    },
    {
      key: 'df',
      label: 'DFlash',
      draft: dfDraft(g, layers.value),
      steps: 1,
      verify: verify(g),
      tokens: tau(aDF.value, g),
    },
  ].map((r) => ({ ...r, total: r.draft + r.verify, speed: r.tokens / (r.draft + r.verify) }));
});

// Timeline scale: longest cycle we can draw is AR at G_MAX.
const T_MAX = arDraft(G_MAX) + verify(G_MAX);
const pct = (t: number) => `${(100 * t) / T_MAX}%`;

// Speedup-vs-block-size chart.
// The SVG is drawn at the container's real width so text stays legible on phones.
const chartEl = ref<HTMLElement>();
const W = ref(640);
const H = computed(() => (W.value < 480 ? 200 : 220));
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (W.value = Math.max(280, Math.round(e.contentRect.width))));
  if (chartEl.value) ro.observe(chartEl.value);
});
onBeforeUnmount(() => ro?.disconnect());
const M = { l: 40, r: 14, t: 12, b: 34 };
const x = (g: number) => M.l + ((g - 1) / (G_MAX - 1)) * (W.value - M.l - M.r);
const yMax = computed(() => Math.max(3, Math.ceil(Math.max(...gs.map((g) => Math.max(speedAR(g), speedDF(g)))))));
const y = (s: number) => H.value - M.b - (s / yMax.value) * (H.value - M.t - M.b);
const yTicks = computed(() => Array.from({ length: yMax.value + 1 }, (_, i) => i));
const path = (f: (g: number) => number) => gs.map((g, i) => `${i ? 'L' : 'M'}${x(g).toFixed(1)},${y(f(g)).toFixed(1)}`).join('');
const pathAR = computed(() => path(speedAR));
const pathDF = computed(() => path(speedDF));
const best = (f: (g: number) => number) => gs.reduce((b, g) => (f(g) > f(b) ? g : b), 1);
const bestAR = computed(() => best(speedAR));
const bestDF = computed(() => best(speedDF));

const hover = ref<number | null>(null);
const focusG = computed(() => hover.value ?? gamma.value);
function onMove(e: PointerEvent) {
  const svg = e.currentTarget as SVGSVGElement;
  const r = svg.getBoundingClientRect();
  const px = ((e.clientX - r.left) / r.width) * W.value;
  const g = Math.round(((px - M.l) / (W.value - M.l - M.r)) * (G_MAX - 1) + 1);
  hover.value = Math.min(G_MAX, Math.max(1, g));
}
function onClick() {
  if (hover.value !== null) gamma.value = hover.value;
}
const tipLeft = computed(() => `${Math.min(80, Math.max(20, (100 * x(focusG.value)) / W.value))}%`);
</script>

<template>
  <div class="cst">
    <div class="ctls">
      <label>
        <span>block size <Tex t="\gamma" /></span>
        <input type="range" min="1" :max="G_MAX" step="1" v-model.number="gamma" />
        <code>{{ gamma }}</code>
      </label>
      <label>
        <span>DFlash layers</span>
        <input type="range" min="1" max="8" step="1" v-model.number="layers" />
        <code>{{ layers }}</code>
      </label>
      <label>
        <span>AR accept <Tex t="\alpha" /></span>
        <input type="range" min="0.4" max="0.97" step="0.01" v-model.number="aAR" />
        <code>{{ aAR.toFixed(2) }}</code>
      </label>
      <label>
        <span>DFlash accept <Tex t="\alpha" /></span>
        <input type="range" min="0.4" max="0.97" step="0.01" v-model.number="aDF" />
        <code>{{ aDF.toFixed(2) }}</code>
      </label>
    </div>

    <p class="head">One draft–verify cycle, to scale</p>
    <div class="tl">
      <div v-for="r in rows" :key="r.key" class="row">
        <div class="lab">
          <strong>{{ r.label }}</strong>
          <span class="muted">
            {{ r.tokens.toFixed(2) }} tokens / {{ r.total.toFixed(2) }} →
            <b class="sp">{{ r.speed.toFixed(2) }}×</b>
          </span>
        </div>
        <div class="track">
          <div v-if="r.key === 'ar'" class="draft steps" :style="{ width: pct(r.draft) }">
            <i v-for="i in r.steps" :key="i"></i>
          </div>
          <div v-else-if="r.draft" class="draft" :style="{ width: pct(r.draft) }"><i></i></div>
          <div class="ver" :style="{ width: pct(r.verify) }">
            <span>{{ r.key === 'plain' ? 'target: 1 token' : `target verifies ${gamma + 1}` }}</span>
          </div>
        </div>
      </div>
      <div class="legend">
        <span><i class="sw draft"></i>drafter forward pass</span>
        <span><i class="sw ver"></i>target forward pass</span>
      </div>
    </div>

    <p class="head">Speedup against block size <span class="muted">(click to set <Tex t="\gamma" />)</span></p>
    <div ref="chartEl" class="chart">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        aria-label="Speedup over plain decoding as block size grows, for an autoregressive drafter and DFlash"
        @pointermove="onMove"
        @pointerleave="hover = null"
        @click="onClick"
      >
        <g class="grid">
          <g v-for="t in yTicks" :key="t">
            <line :x1="M.l" :x2="W - M.r" :y1="y(t)" :y2="y(t)" :class="{ one: t === 1 }" />
            <text :x="M.l - 6" :y="y(t) + 4" text-anchor="end">{{ t }}×</text>
          </g>
          <text v-for="g in [1, 4, 8, 12, 16]" :key="g" :x="x(g)" :y="H - M.b + 16" text-anchor="middle">{{ g }}</text>
          <text :x="(M.l + W - M.r) / 2" :y="H - 4" text-anchor="middle">draft tokens per cycle</text>
        </g>
        <line class="cursor" :x1="x(focusG)" :x2="x(focusG)" :y1="M.t" :y2="H - M.b" />
        <path class="ln ar" :d="pathAR" />
        <path class="ln df" :d="pathDF" />
        <circle class="pk ar" :cx="x(bestAR)" :cy="y(speedAR(bestAR))" r="8" />
        <circle class="pk df" :cx="x(bestDF)" :cy="y(speedDF(bestDF))" r="8" />
        <circle class="dot ar" :cx="x(focusG)" :cy="y(speedAR(focusG))" r="5" />
        <circle class="dot df" :cx="x(focusG)" :cy="y(speedDF(focusG))" r="5" />
        <text class="dl" :x="W - M.r" :y="y(speedDF(G_MAX)) - 8" text-anchor="end">DFlash</text>
        <text class="dl" :x="W - M.r" :y="y(speedAR(G_MAX)) + 16" text-anchor="end">AR drafter</text>
      </svg>
      <div v-if="hover !== null" class="tip" :style="{ left: tipLeft }">
        <Tex :t="`\\gamma = ${focusG}`" />
        <div><i class="sw ar"></i>AR {{ speedAR(focusG).toFixed(2) }}×</div>
        <div><i class="sw df"></i>DFlash {{ speedDF(focusG).toFixed(2) }}×</div>
      </div>
    </div>
    <p class="note muted">
      Hollow rings mark each curve’s best block size: AR peaks at <Tex :t="`\\gamma=${bestAR}`" />, DFlash at
      <Tex :t="`\\gamma=${bestDF}`" />.
    </p>
  </div>
</template>

<style scoped>
.cst {
  font-size: 0.9rem;
  --c-ar: #eb6834;
  --c-df: #2a78d6;
}
@media (prefers-color-scheme: dark) {
  .cst {
    --c-ar: #d95926;
    --c-df: #3987e5;
  }
}
.muted {
  color: var(--muted);
}
.ctls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 0.3rem 1.2rem;
}
.ctls label {
  display: grid;
  grid-template-columns: 8.5rem 1fr 2.6rem;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
}
.ctls input {
  width: 100%;
  min-width: 0;
  accent-color: var(--accent);
}
.ctls code {
  color: var(--text);
  text-align: right;
}
.head {
  margin: 1rem 0 0.4rem;
  font-weight: 600;
}
.head .muted {
  font-weight: 400;
}
.row {
  margin-bottom: 0.55rem;
}
.lab {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0 0.6rem;
  font-size: 0.84rem;
}
.sp {
  color: var(--text);
  font-family: var(--mono);
}
.track {
  display: flex;
  gap: 2px;
  height: 22px;
  margin-top: 2px;
}
.track > div {
  transition: width 0.2s;
  border-radius: 3px;
  overflow: hidden;
  min-width: 2px;
}
.draft {
  display: flex;
  gap: 1px;
}
.draft i {
  flex: 1;
  background: var(--c-df);
}
.steps i {
  background: var(--c-ar);
}
.ver {
  background: var(--accent-soft);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 0.4rem;
  font-size: 0.72rem;
  color: var(--muted);
  white-space: nowrap;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
  font-size: 0.78rem;
  color: var(--muted);
}
.sw {
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  margin-right: 0.3rem;
  border-radius: 2px;
  vertical-align: -1px;
}
.sw.draft {
  background: linear-gradient(90deg, var(--c-ar) 50%, var(--c-df) 50%);
}
.sw.ver {
  background: var(--accent-soft);
  border: 1px solid var(--border);
}
.sw.ar {
  background: var(--c-ar);
}
.sw.df {
  background: var(--c-df);
}
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
  stroke-width: 1;
}
.grid line.one {
  stroke: var(--muted);
  stroke-dasharray: 3 3;
}
.grid text,
.dl {
  fill: var(--muted);
  font-size: 12px;
}
.dl {
  fill: var(--text);
}
.cursor {
  stroke: var(--muted);
  stroke-width: 1;
  opacity: 0.5;
}
.ln {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
}
.ln.ar,
.dot.ar {
  stroke: var(--c-ar);
}
.ln.df,
.dot.df {
  stroke: var(--c-df);
}
.dot {
  stroke-width: 2;
  fill: var(--surface);
}
.dot.ar {
  fill: var(--c-ar);
}
.dot.df {
  fill: var(--c-df);
}
.pk {
  fill: none;
  stroke-width: 2;
}
.pk.ar {
  stroke: var(--c-ar);
}
.pk.df {
  stroke: var(--c-df);
}
.tip {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.2rem 0.45rem;
  font-size: 0.75rem;
  pointer-events: none;
  white-space: nowrap;
}
.note {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
}
</style>
