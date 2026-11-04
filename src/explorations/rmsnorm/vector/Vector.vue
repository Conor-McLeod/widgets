<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import Tex from '~/math/Tex.vue';

const D = 8;
const IN_MAX = 4; // input chart spans [-IN_MAX, IN_MAX]
const OUT_MAX = 3; // output chart spans [-OUT_MAX, OUT_MAX]; |y_i| <= sqrt(D) ≈ 2.83
const EPS = 1e-5;

type Mode = 'rms' | 'layer' | 'both';

const x = ref<number[]>([1.2, -0.6, 2.1, 0.3, -1.5, 0.8, -0.2, 1.0]);
const mode = ref<Mode>('rms');

const mean = computed(() => x.value.reduce((a, b) => a + b, 0) / D);
const rms = computed(() => Math.sqrt(x.value.reduce((a, b) => a + b * b, 0) / D + EPS));
const std = computed(() => Math.sqrt(x.value.reduce((a, b) => a + (b - mean.value) ** 2, 0) / D + EPS));

const yRms = computed(() => x.value.map((v) => v / rms.value));
const yLayer = computed(() => x.value.map((v) => (v - mean.value) / std.value));

const showRms = computed(() => mode.value !== 'layer');
const showLayer = computed(() => mode.value !== 'rms');

// Chart geometry. The viewBox width tracks the real width, so 1 user unit = 1px and text stays legible on phones.
const root = ref<HTMLElement | null>(null);
const W = ref(600);
const H = 150;
const PAD_L = 34;
const PAD_R = 8;
const narrow = computed(() => W.value < 480);
const slot = computed(() => (W.value - PAD_L - PAD_R) / D);
const barX = (i: number) => PAD_L + i * slot.value + slot.value * 0.18;
const barW = computed(() => slot.value * 0.64);
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (W.value = Math.max(260, Math.round(e.contentRect.width))));
  ro.observe(root.value!);
});
onBeforeUnmount(() => ro?.disconnect());
const yOf = (v: number, max: number) => H / 2 - (Math.max(-max, Math.min(max, v)) / max) * (H / 2 - 6);

function rect(v: number, max: number) {
  const y0 = yOf(0, max);
  const y1 = yOf(v, max);
  return { y: Math.min(y0, y1), h: Math.max(1, Math.abs(y1 - y0)) };
}

const fmt = (v: number, digits = 2) => (Math.abs(v) < 5e-3 ? '0' : v.toFixed(digits));

// Dragging input bars.
const inSvg = ref<SVGSVGElement | null>(null);
let dragging: number | null = null;

function valueAt(ev: PointerEvent) {
  const r = inSvg.value!.getBoundingClientRect();
  const py = ((ev.clientY - r.top) / r.height) * H;
  const v = ((H / 2 - py) / (H / 2 - 6)) * IN_MAX;
  return Math.round(Math.max(-IN_MAX, Math.min(IN_MAX, v)) * 10) / 10;
}

function down(ev: PointerEvent) {
  const r = inSvg.value!.getBoundingClientRect();
  const px = ((ev.clientX - r.left) / r.width) * W.value;
  const i = Math.floor((px - PAD_L) / slot.value);
  if (i < 0 || i >= D) return;
  dragging = i;
  inSvg.value!.setPointerCapture(ev.pointerId);
  move(ev);
}
function move(ev: PointerEvent) {
  if (dragging === null) return;
  const next = x.value.slice();
  next[dragging] = valueAt(ev);
  x.value = next;
}
function up() {
  dragging = null;
}

const clamp = (v: number) => Math.round(Math.max(-IN_MAX, Math.min(IN_MAX, v)) * 100) / 100;
const apply = (f: (v: number, i: number) => number) => (x.value = x.value.map((v, i) => clamp(f(v, i))));

const presets: { label: string; title: string; run: () => void }[] = [
  { label: '× 2', title: 'Scale every input by 2', run: () => apply((v) => v * 2) },
  { label: '÷ 2', title: 'Halve every input', run: () => apply((v) => v / 2) },
  { label: '+ 1', title: 'Add 1 to every input', run: () => apply((v) => v + 1) },
  { label: '− 1', title: 'Subtract 1 from every input', run: () => apply((v) => v - 1) },
  { label: 'outlier', title: 'Small values plus one big one', run: () => apply((_, i) => (i === 2 ? 4 : [0.3, -0.2, 0, 0.4, -0.3, 0.2, -0.1, 0.1][i])) },
  { label: 'all equal', title: 'Every input the same', run: () => apply(() => 1.5) },
  { label: 'random', title: 'Random inputs', run: () => apply(() => (Math.random() * 2 - 1) * 2.5) },
];
</script>

<template>
  <div class="rv" ref="root">
    <div class="ctl">
      <div class="seg" role="radiogroup" aria-label="Which normalization to show">
        <button :class="{ on: mode === 'rms' }" @click="mode = 'rms'">RMSNorm</button>
        <button :class="{ on: mode === 'layer' }" @click="mode = 'layer'">LayerNorm</button>
        <button :class="{ on: mode === 'both' }" @click="mode = 'both'">both</button>
      </div>
      <div class="presets">
        <button v-for="p in presets" :key="p.label" :title="p.title" @click="p.run">{{ p.label }}</button>
      </div>
    </div>

    <div class="label">
      <span>input <Tex t="x" /> <span class="hint">· drag the bars</span></span>
      <span class="stats">
        <Tex t="\operatorname{RMS}(x) =" /> <b>{{ fmt(rms) }}</b>
        <template v-if="showLayer"> · <Tex t="\mu =" /> <b>{{ fmt(mean) }}</b> · <Tex t="\sigma =" /> <b>{{ fmt(std) }}</b></template>
      </span>
    </div>
    <svg
      ref="inSvg"
      class="chart drag"
      :viewBox="`0 0 ${W} ${H}`"
      role="img"
      aria-label="Input vector, drag bars to edit"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    >
      <line :x1="PAD_L" :x2="W - PAD_R" :y1="yOf(0, IN_MAX)" :y2="yOf(0, IN_MAX)" class="axis" />
      <text v-for="t in [IN_MAX, 0, -IN_MAX]" :key="t" :x="PAD_L - 6" :y="yOf(t, IN_MAX) + 4" class="tick">{{ t }}</text>
      <template v-if="showRms">
        <line :x1="PAD_L" :x2="W - PAD_R" :y1="yOf(rms, IN_MAX)" :y2="yOf(rms, IN_MAX)" class="ref rms" />
        <line :x1="PAD_L" :x2="W - PAD_R" :y1="yOf(-rms, IN_MAX)" :y2="yOf(-rms, IN_MAX)" class="ref rms" />
      </template>
      <line v-if="showLayer" :x1="PAD_L" :x2="W - PAD_R" :y1="yOf(mean, IN_MAX)" :y2="yOf(mean, IN_MAX)" class="ref mean" />
      <rect
        v-for="(v, i) in x"
        :key="i"
        :x="barX(i)"
        :width="barW"
        :y="rect(v, IN_MAX).y"
        :height="rect(v, IN_MAX).h"
        rx="2"
        class="bar in"
      />
    </svg>

    <div class="label">
      <span>output <Tex t="y" /></span>
      <span class="stats">
        <template v-if="showRms"><Tex t="\operatorname{RMS}(y) =" /> <b>{{ fmt(Math.sqrt(yRms.reduce((a, b) => a + b * b, 0) / D)) }}</b></template>
        <template v-if="mode === 'both'"> · </template>
        <template v-if="showLayer">mean of LayerNorm <Tex t="y =" /> <b>{{ fmt(yLayer.reduce((a, b) => a + b, 0) / D) }}</b></template>
      </span>
    </div>
    <svg class="chart" :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="Normalized output vector">
      <line :x1="PAD_L" :x2="W - PAD_R" :y1="yOf(0, OUT_MAX)" :y2="yOf(0, OUT_MAX)" class="axis" />
      <text v-for="t in [OUT_MAX, 1, 0, -1, -OUT_MAX]" :key="t" :x="PAD_L - 6" :y="yOf(t, OUT_MAX) + 4" class="tick">{{ t }}</text>
      <line :x1="PAD_L" :x2="W - PAD_R" :y1="yOf(1, OUT_MAX)" :y2="yOf(1, OUT_MAX)" class="ref rms" />
      <line :x1="PAD_L" :x2="W - PAD_R" :y1="yOf(-1, OUT_MAX)" :y2="yOf(-1, OUT_MAX)" class="ref rms" />
      <template v-for="(_, i) in x" :key="i">
        <rect
          v-if="showRms"
          :x="barX(i)"
          :width="barW"
          :y="rect(yRms[i], OUT_MAX).y"
          :height="rect(yRms[i], OUT_MAX).h"
          rx="2"
          class="bar out"
        />
        <rect
          v-if="showLayer"
          :x="barX(i) + (mode === 'both' ? barW * 0.2 : 0)"
          :width="mode === 'both' ? barW * 0.6 : barW"
          :y="rect(yLayer[i], OUT_MAX).y"
          :height="rect(yLayer[i], OUT_MAX).h"
          rx="2"
          class="bar ln"
        />
      </template>
    </svg>

    <div class="legend">
      <span v-if="showRms"><i class="sw out"></i><Tex t="x / \operatorname{RMS}(x)" /></span>
      <span v-if="showLayer"><i class="sw ln"></i><Tex t="(x - \mu) / \sigma" /></span>
      <span v-if="showRms"><i class="sw ref-rms"></i><Tex t="\pm\operatorname{RMS} \to \pm 1" /></span>
      <span v-if="showLayer"><i class="sw ref-mean"></i>mean <Tex t="\mu" /></span>
    </div>

    <table class="vals">
      <tbody>
        <tr>
          <th><Tex t="x" /></th>
          <td v-for="(v, i) in x" :key="i">{{ fmt(v, 1) }}</td>
        </tr>
        <tr v-if="showRms">
          <th>RMS</th>
          <td v-for="(v, i) in yRms" :key="i">{{ fmt(v, narrow ? 1 : 2) }}</td>
        </tr>
        <tr v-if="showLayer">
          <th>LN</th>
          <td v-for="(v, i) in yLayer" :key="i">{{ fmt(v, narrow ? 1 : 2) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.rv {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
button {
  font: inherit;
  font-size: 0.85rem;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.25rem 0.55rem;
  cursor: pointer;
}
.seg {
  display: inline-flex;
}
.seg button {
  border-radius: 0;
}
.seg button + button {
  border-left: none;
}
.seg button:first-child {
  border-radius: 6px 0 0 6px;
}
.seg button:last-child {
  border-radius: 0 6px 6px 0;
}
.seg button.on {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.label {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0 1rem;
  color: var(--muted);
  margin-top: 0.4rem;
}
.hint {
  font-size: 0.8rem;
}
.stats {
  font-family: var(--mono);
  font-size: 0.82rem;
}
.stats b {
  color: var(--text);
  font-weight: 600;
}
.chart {
  display: block;
  width: 100%;
  height: auto;
}
.drag {
  cursor: ns-resize;
  touch-action: none;
}
.axis {
  stroke: var(--border);
}
.tick {
  fill: var(--muted);
  font-size: 12px;
  text-anchor: end;
  font-family: var(--mono);
}
.ref {
  stroke-width: 1.2;
  stroke-dasharray: 4 4;
}
.ref.rms {
  stroke: var(--accent);
  opacity: 0.7;
}
.ref.mean {
  stroke: var(--danger);
  opacity: 0.8;
}
.bar.in {
  fill: var(--muted);
  opacity: 0.55;
}
.bar.out {
  fill: var(--accent);
  opacity: 0.8;
}
.bar.ln {
  fill: color-mix(in srgb, var(--danger) 18%, transparent);
  stroke: var(--danger);
  stroke-width: 1.5;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
  font-size: 0.8rem;
  color: var(--muted);
  margin-top: 0.3rem;
}
.sw {
  display: inline-block;
  width: 0.8rem;
  height: 0.8rem;
  margin-right: 0.3rem;
  vertical-align: -0.1rem;
  border-radius: 2px;
}
.sw.out {
  background: var(--accent);
  opacity: 0.8;
}
.sw.ln {
  background: color-mix(in srgb, var(--danger) 18%, transparent);
  border: 1.5px solid var(--danger);
}
.sw.ref-rms,
.sw.ref-mean {
  height: 0;
  border-top: 1.5px dashed var(--accent);
  border-radius: 0;
  vertical-align: 0.25rem;
}
.sw.ref-mean {
  border-top-color: var(--danger);
}
.vals {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  margin-top: 0.6rem;
  font-family: var(--mono);
  font-size: 0.74rem;
}
.vals th {
  width: 2.6rem;
  text-align: left;
  font-weight: normal;
  color: var(--muted);
}
.vals td {
  text-align: right;
  padding: 0.1rem 0.15rem;
  overflow: hidden;
  text-overflow: clip;
}
</style>
