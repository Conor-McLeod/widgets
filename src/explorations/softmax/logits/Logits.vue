<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Tex from '~/math/Tex.vue';

const NAMES = ['cat', 'dog', 'fox', 'owl', 'eel'];
const N = NAMES.length;
const Z_MAX = 6; // logit chart spans [-Z_MAX, Z_MAX]
const START = [1.8, 0.6, 2.4, -1.2, 0.2];

const z = ref<number[]>(START.slice());
// Temperature on a log slider: s in [-1, 1] -> T = 10^s.
const s = ref(0);
const T = computed(() => 10 ** s.value);

const scaled = computed(() => z.value.map((v) => v / T.value));
// exp of the raw scaled logits, as written in the formula (fine here: |z/T| <= 60).
const ex = computed(() => scaled.value.map(Math.exp));
const sum = computed(() => ex.value.reduce((a, b) => a + b, 0));
const p = computed(() => ex.value.map((v) => v / sum.value));

const order = computed(() => [...z.value.keys()].sort((a, b) => z.value[b] - z.value[a]));
const top = computed(() => order.value[0]);
const second = computed(() => order.value[1]);

// Layout: viewBox width tracks the element so 1 unit = 1px.
const root = ref<HTMLElement | null>(null);
const W = ref(600);
const H = 150;
const HP = 130;
const PAD_L = 44; // matches the table's header column
const PAD_R = 6;
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (W.value = Math.max(260, Math.round(e.contentRect.width))));
  ro.observe(root.value!);
});
onBeforeUnmount(() => ro?.disconnect());

const slot = computed(() => (W.value - PAD_L - PAD_R) / N);
const cx = (i: number) => PAD_L + (i + 0.5) * slot.value;
const barW = computed(() => Math.min(56, slot.value * 0.62));

const zy = (v: number) => H / 2 - (Math.max(-Z_MAX, Math.min(Z_MAX, v)) / Z_MAX) * (H / 2 - 8);
const py = (v: number) => HP - 16 - v * (HP - 34);

const fmt = (v: number, d = 2) => (Math.abs(v) < 5e-3 ? '0.00' : v.toFixed(d));
function fmtBig(v: number) {
  if (v >= 1e4 || (v > 0 && v < 1e-2)) {
    const [m, e] = v.toExponential(1).split('e');
    return `${m}\\times 10^{${Number(e)}}`;
  }
  return v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0);
}
const pct = (v: number) => (v >= 0.9995 ? '100%' : v < 0.0005 ? '<0.1%' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`);

// Dragging logits.
const zSvg = ref<SVGSVGElement | null>(null);
let dragging: number | null = null;
function valueAt(ev: PointerEvent) {
  const r = zSvg.value!.getBoundingClientRect();
  const y = ((ev.clientY - r.top) / r.height) * H;
  const v = ((H / 2 - y) / (H / 2 - 8)) * Z_MAX;
  return Math.round(Math.max(-Z_MAX, Math.min(Z_MAX, v)) * 10) / 10;
}
function down(ev: PointerEvent) {
  const r = zSvg.value!.getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * W.value;
  const i = Math.floor((x - PAD_L) / slot.value);
  if (i < 0 || i >= N) return;
  dragging = i;
  zSvg.value!.setPointerCapture(ev.pointerId);
  move(ev);
}
function move(ev: PointerEvent) {
  if (dragging === null) return;
  const next = z.value.slice();
  next[dragging] = valueAt(ev);
  z.value = next;
}
function up() {
  dragging = null;
}

const clamp = (v: number) => Math.round(Math.max(-Z_MAX, Math.min(Z_MAX, v)) * 100) / 100;
const apply = (f: (v: number, i: number) => number) => (z.value = z.value.map((v, i) => clamp(f(v, i))));
const presets: { label: string; title: string; run: () => void }[] = [
  { label: '+ 1', title: 'Add 1 to every logit', run: () => apply((v) => v + 1) },
  { label: '− 1', title: 'Subtract 1 from every logit', run: () => apply((v) => v - 1) },
  { label: '× 2', title: 'Double every logit', run: () => apply((v) => v * 2) },
  { label: '÷ 2', title: 'Halve every logit', run: () => apply((v) => v / 2) },
  { label: 'random', title: 'Random logits', run: () => apply(() => Math.round((Math.random() * 2 - 1) * 40) / 10) },
  {
    label: 'reset',
    title: 'Back to the starting logits and T = 1',
    run: () => {
      z.value = START.slice();
      s.value = 0;
    },
  },
];
</script>

<template>
  <div class="sl" ref="root">
    <div class="ctl">
      <label class="temp">
        <span>temperature <Tex t="T" /></span>
        <input type="range" min="-1" max="1" step="0.01" v-model.number="s" aria-label="Temperature" />
        <output>{{ T.toFixed(2) }}</output>
      </label>
      <div class="presets">
        <button v-for="b in presets" :key="b.label" :title="b.title" @click="b.run">{{ b.label }}</button>
      </div>
    </div>

    <div class="label">
      <span>logits <Tex t="z" /> <span class="hint">· drag the bars</span></span>
    </div>
    <svg
      ref="zSvg"
      class="chart drag"
      :viewBox="`0 0 ${W} ${H}`"
      role="img"
      aria-label="Logits, drag bars to edit"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    >
      <line :x1="PAD_L" :x2="W - PAD_R" :y1="zy(0)" :y2="zy(0)" class="axis" />
      <text v-for="t in [Z_MAX, 0, -Z_MAX]" :key="t" :x="PAD_L - 6" :y="zy(t) + 4" class="tick">{{ t }}</text>
      <g v-for="(v, i) in z" :key="i">
        <rect
          :x="cx(i) - barW / 2"
          :width="barW"
          :y="Math.min(zy(0), zy(v))"
          :height="Math.max(1, Math.abs(zy(v) - zy(0)))"
          rx="2"
          class="bar z"
        />
        <text :x="cx(i)" :y="v >= 0 ? zy(v) - 4 : zy(v) + 13" class="val">{{ fmt(v, 1) }}</text>
      </g>
    </svg>

    <div class="label">
      <span>probabilities <Tex t="p = \operatorname{softmax}(z / T)" /></span>
      <span class="stats"><Tex t="\textstyle\sum_j e^{z_j/T} =" /> <b><Tex :t="fmtBig(sum)" /></b></span>
    </div>
    <svg class="chart" :viewBox="`0 0 ${W} ${HP}`" role="img" aria-label="Softmax probabilities">
      <line :x1="PAD_L" :x2="W - PAD_R" :y1="py(0)" :y2="py(0)" class="axis" />
      <line :x1="PAD_L" :x2="W - PAD_R" :y1="py(1 / N)" :y2="py(1 / N)" class="uniform" />
      <text v-for="t in [1, 0.5, 0]" :key="t" :x="PAD_L - 6" :y="py(t) + 4" class="tick">{{ t }}</text>
      <g v-for="(v, i) in p" :key="i">
        <rect :x="cx(i) - barW / 2" :width="barW" :y="py(v)" :height="Math.max(0.5, py(0) - py(v))" rx="2" class="bar p" :class="{ top: i === top }" />
        <text :x="cx(i)" :y="py(v) - 4" class="val">{{ pct(v) }}</text>
        <text :x="cx(i)" :y="HP - 2" class="name">{{ NAMES[i] }}</text>
      </g>
    </svg>

    <table class="vals">
      <tbody>
        <tr>
          <th><Tex t="z_i / T" /></th>
          <td v-for="(v, i) in scaled" :key="i">{{ fmt(v) }}</td>
        </tr>
        <tr>
          <th><Tex t="e^{z_i/T}" /></th>
          <td v-for="(v, i) in ex" :key="i"><Tex :t="fmtBig(v)" /></td>
        </tr>
      </tbody>
    </table>
    <p class="ratio">
      <Tex
        :t="`\\frac{p_{\\text{${NAMES[top]}}}}{p_{\\text{${NAMES[second]}}}} = e^{(z_{\\text{${NAMES[top]}}} - z_{\\text{${NAMES[second]}}})/T} = e^{${fmt(z[top] - z[second], 1)} / ${T.toFixed(2)}} = ${fmtBig(p[top] / p[second])}`"
      />
    </p>
  </div>
</template>

<style scoped>
.sl {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.temp {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
}
.temp input {
  width: 8rem;
}
.temp output {
  font-family: var(--mono);
  font-size: 0.82rem;
  color: var(--text);
  min-width: 2.5rem;
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
  font-size: 0.85rem;
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
.uniform {
  stroke: var(--muted);
  stroke-dasharray: 3 4;
  opacity: 0.6;
}
.tick {
  fill: var(--muted);
  font-size: 12px;
  text-anchor: end;
  font-family: var(--mono);
}
.val {
  fill: var(--text);
  font-size: 11px;
  text-anchor: middle;
  font-family: var(--mono);
  pointer-events: none;
}
.name {
  fill: var(--muted);
  font-size: 12px;
  text-anchor: middle;
}
.bar.z {
  fill: var(--muted);
  opacity: 0.55;
}
.bar.p {
  fill: var(--accent);
  opacity: 0.55;
}
.bar.p.top {
  opacity: 0.9;
}
.vals {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  margin-top: 0.5rem;
  font-family: var(--mono);
  font-size: 0.74rem;
}
.vals th {
  width: 44px;
  text-align: left;
  font-weight: normal;
  color: var(--muted);
}
.vals td {
  text-align: center;
  padding: 0.1rem 0.1rem;
  overflow: hidden;
}
.ratio {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: var(--muted);
  overflow-x: auto;
}
</style>
