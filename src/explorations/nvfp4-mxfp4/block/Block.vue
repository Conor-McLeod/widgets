<script setup lang="ts">
// A 64-value tensor quantized both ways. MXFP4 splits it into 2 blocks of 32 with power-of-two
// scales; NVFP4 into 4 blocks of 16 with E4M3 scales. Add an outlier to see how far its damage spreads.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Tex from '~/math/Tex.vue';
import { quantizeMX, quantizeNV, type Quantized } from '../fp4';

const N = 64;
const OUTLIER_AT = 9;

function gaussian(): number {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

const base = ref(Array.from({ length: N }, gaussian));
const outlier = ref(true);

const data = computed(() => {
  const xs = base.value.slice();
  if (outlier.value) xs[OUTLIER_AT] = 12 * Math.sign(xs[OUTLIER_AT] || 1);
  return xs;
});

const rms = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);

interface Panel {
  name: string;
  bits: string;
  q: Quantized | null;
}
const panels = computed<Panel[]>(() => [
  { name: 'original', bits: '', q: null },
  { name: 'MXFP4', bits: '4.25', q: quantizeMX(data.value) },
  { name: 'NVFP4', bits: '4.5', q: quantizeNV(data.value) },
]);

const stats = computed(() => {
  const xs = data.value;
  const r = rms(xs);
  return panels.value.slice(1).map((p) => {
    const q = p.q!;
    const err = rms(q.values.map((v, i) => v - xs[i])) / r;
    const zeroed = q.values.filter((v, i) => v === 0 && xs[i] !== 0).length;
    return { name: p.name, bits: p.bits, err, zeroed, clipped: q.clipped };
  });
});

// Geometry. The y-axis covers the ordinary values; an outlier's stem is cut off with a marker.
// The SVG is drawn at its real pixel width so labels stay legible on a phone. When narrow, the
// panel names move from a left gutter to a strip above each panel.
const root = ref<HTMLElement>();
const W = ref(600);
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(() => (W.value = Math.max(280, Math.round(root.value!.clientWidth))));
  ro.observe(root.value!);
});
onBeforeUnmount(() => ro?.disconnect());
const narrow = computed(() => W.value < 500);
const L = computed(() => (narrow.value ? 0 : 72));
const R = 1;
const PH = 84; // panel height
const GAP = 14;
const LBL = computed(() => (narrow.value ? 18 : 0));
const H = computed(() => 3 * (PH + LBL.value) + 2 * GAP);
const colW = computed(() => (W.value - L.value - R) / N);
const yRange = computed(() => {
  const xs = data.value.filter((_, i) => !(outlier.value && i === OUTLIER_AT));
  return Math.max(...xs.map(Math.abs)) * 1.1;
});
const top = (p: number) => p * (PH + GAP + LBL.value) + LBL.value;
const mid = (p: number) => top(p) + PH / 2;
function y(p: number, v: number) {
  const c = Math.max(-1, Math.min(1, v / yRange.value));
  return mid(p) - c * (PH / 2 - 4);
}
const cx = (i: number) => L.value + (i + 0.5) * colW.value;
const over = (v: number) => Math.abs(v) > yRange.value;

function fmtScale(s: number): string {
  const k = Math.log2(s);
  if (Number.isInteger(k)) return `2^{${k}}`;
  return s >= 0.1 ? s.toFixed(3) : s.toExponential(1).replace(/e(.*)$/, '\\times 10^{$1}');
}

function resample() {
  base.value = Array.from({ length: N }, gaussian);
}
</script>

<template>
  <div class="blk" ref="root">
    <div class="ctl">
      <label><input type="checkbox" v-model="outlier" /> one outlier (value 12)</label>
      <button type="button" @click="resample">New values</button>
    </div>

    <svg :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="Original values and their MXFP4 and NVFP4 quantizations">
      <g v-for="(p, pi) in panels" :key="p.name">
        <text v-if="narrow" :x="0" :y="top(pi) - 5" font-size="12" fill="var(--text)">
          <tspan font-weight="600">{{ p.name }}</tspan>
          <tspan v-if="p.q" fill="var(--muted)"> · {{ p.q.blockSize }} per block</tspan>
        </text>
        <template v-else>
          <text :x="0" :y="mid(pi) - 4" font-size="13" fill="var(--text)" font-weight="600">{{ p.name }}</text>
          <text v-if="p.q" :x="0" :y="mid(pi) + 13" font-size="11" fill="var(--muted)">
            {{ p.q.blockSize }} per block
          </text>
        </template>
        <!-- Block shading and each block's scale. -->
        <template v-if="p.q">
          <g v-for="(s, b) in p.q.scales" :key="b">
            <rect
              :x="L + b * p.q.blockSize * colW"
              :y="top(pi)"
              :width="p.q.blockSize * colW"
              :height="PH"
              :fill="b % 2 ? 'var(--accent-soft)' : 'var(--surface)'"
              stroke="var(--border)"
            />
            <foreignObject :x="L + b * p.q.blockSize * colW + 3" :y="top(pi) + 1" width="140" height="18" overflow="visible">
              <div xmlns="http://www.w3.org/1999/xhtml" class="scale"><Tex :t="`s = ${fmtScale(s)}`" /></div>
            </foreignObject>
          </g>
        </template>
        <rect v-else :x="L" :y="top(pi)" :width="W - L - R" :height="PH" fill="var(--surface)" stroke="var(--border)" />
        <line :x1="L" :x2="W - R" :y1="mid(pi)" :y2="mid(pi)" stroke="var(--border)" />

        <g v-for="(x, i) in data" :key="i">
          <!-- The original value, faint behind the quantized one. -->
          <line
            :x1="cx(i)"
            :x2="cx(i)"
            :y1="mid(pi)"
            :y2="y(pi, x)"
            :stroke="p.q ? 'var(--muted)' : 'var(--text)'"
            :stroke-opacity="p.q ? 0.3 : 0.8"
            :stroke-width="colW * 0.6"
          />
          <template v-if="p.q">
            <line
              v-if="p.q.values[i] !== 0"
              :x1="cx(i)"
              :x2="cx(i)"
              :y1="mid(pi)"
              :y2="y(pi, p.q.values[i])"
              stroke="var(--accent)"
              :stroke-width="colW * 0.6"
            />
            <circle v-else-if="x !== 0" :cx="cx(i)" :cy="mid(pi)" :r="colW * 0.32" fill="var(--danger)" />
          </template>
          <path
            v-if="over(x)"
            :d="`M ${cx(i) - 4} ${y(pi, x)} L ${cx(i) + 4} ${y(pi, x)} L ${cx(i)} ${y(pi, x) - 5 * Math.sign(x)} Z`"
            fill="var(--text)"
          />
        </g>
      </g>
    </svg>
    <div class="legend">
      <span><i class="sw orig" />original</span>
      <span><i class="sw q" />stored value</span>
      <span><i class="dot" />rounded to zero</span>
    </div>

    <table>
      <thead>
        <tr>
          <th></th>
          <th>bits per value</th>
          <th>RMS error</th>
          <th>rounded to 0</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in stats" :key="s.name">
          <td>{{ s.name }}</td>
          <td>{{ s.bits }}</td>
          <td>{{ (s.err * 100).toFixed(1) }}%</td>
          <td>{{ s.zeroed }} / {{ N }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.blk {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem 1rem;
  color: var(--muted);
  margin-bottom: 0.5rem;
}
.ctl label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
}
button {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.25rem 0.65rem;
  cursor: pointer;
}
svg {
  width: 100%;
  height: auto;
  display: block;
}
.scale {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  line-height: 1.4;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 1rem;
  margin-top: 0.35rem;
  font-size: 0.78rem;
  color: var(--muted);
}
.sw {
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  margin-right: 0.35em;
  vertical-align: -0.1em;
}
.sw.orig {
  background: color-mix(in srgb, var(--muted) 40%, transparent);
}
.sw.q {
  background: var(--accent);
}
.dot {
  display: inline-block;
  width: 0.55em;
  height: 0.55em;
  margin-right: 0.35em;
  border-radius: 50%;
  background: var(--danger);
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.5rem;
  font-family: var(--mono);
  font-size: 0.82rem;
}
th {
  font-family: var(--font);
  font-weight: normal;
  color: var(--muted);
  text-align: left;
  padding: 0.15rem 0.3rem;
  border-bottom: 1px solid var(--border);
}
td {
  padding: 0.2rem 0.3rem;
}
td:first-child {
  font-family: var(--font);
}
</style>
