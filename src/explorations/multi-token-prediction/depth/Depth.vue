<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import Tex from '~/math/Tex.vue';

const KMAX = 8;
const PRESET = { acc: 0.87, decay: 0.85, draft: 3, verify: 1 };
const p = reactive({ ...PRESET });

// Expected tokens per pass with k drafts: 1 + a + a*(a r) + ... (each draft counts only if all
// before it were accepted). Cost per pass: the main pass, k sequential MTP passes, and a little
// extra work to verify k more positions.
const rows = computed(() =>
  Array.from({ length: KMAX + 1 }, (_, k) => {
    let e = 1;
    let prod = 1;
    for (let j = 1; j <= k; j++) e += (prod *= p.acc * p.decay ** (j - 1));
    const cost = 1 + (k * (p.draft + p.verify)) / 100;
    return { k, e, cost, s: e / cost };
  }),
);
const best = computed(() => rows.value.reduce((a, r) => (r.s > a.s ? r : a)));

const wrap = ref<HTMLElement>();
const W = ref(640);
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (W.value = Math.max(280, e.contentRect.width)));
  if (wrap.value) ro.observe(wrap.value);
});
onUnmounted(() => ro?.disconnect());

const H = 230;
const M = { l: 34, r: 12, t: 12, b: 32 };
const yMax = computed(() => Math.max(2, Math.ceil(Math.max(...rows.value.map((r) => r.e)) * 2) / 2));
const x = (k: number) => M.l + (k / KMAX) * (W.value - M.l - M.r);
const y = (v: number) => H - M.b - ((v - 1) / (yMax.value - 1)) * (H - M.t - M.b);
const ticks = computed(() => {
  const t: number[] = [];
  const step = yMax.value > 4 ? 1 : 0.5;
  for (let v = 1; v <= yMax.value + 1e-9; v += step) t.push(v);
  return t;
});
const path = (key: 'e' | 's') => rows.value.map((r, i) => `${i ? 'L' : 'M'}${x(r.k)},${y(r[key])}`).join('');

const hover = ref<number | null>(null);
const hv = computed(() => (hover.value === null ? best.value : rows.value[hover.value]));
const colW = computed(() => (W.value - M.l - M.r) / KMAX);
</script>

<template>
  <div class="dp">
    <div ref="wrap" class="chart">
      <svg :width="W" :height="H" role="img" aria-label="Tokens per pass and speedup against draft depth">
        <g class="grid">
          <g v-for="t in ticks" :key="t">
            <line :x1="M.l" :x2="W - M.r" :y1="y(t)" :y2="y(t)" />
            <text :x="M.l - 6" :y="y(t) + 4" text-anchor="end">{{ t }}×</text>
          </g>
          <text v-for="r in rows" :key="r.k" :x="x(r.k)" :y="H - M.b + 16" text-anchor="middle">{{ r.k }}</text>
          <text :x="(M.l + W - M.r) / 2" :y="H - 2" text-anchor="middle" class="axis">drafts per pass k</text>
        </g>
        <line v-if="hover !== null" class="cross" :x1="x(hover)" :x2="x(hover)" :y1="M.t" :y2="H - M.b" />
        <path class="ln e" :d="path('e')" />
        <path class="ln s" :d="path('s')" />
        <circle v-for="r in rows" :key="`e${r.k}`" class="pt e" :cx="x(r.k)" :cy="y(r.e)" r="4" />
        <circle
          v-for="r in rows"
          :key="`s${r.k}`"
          class="pt s"
          :class="{ best: r.k === best.k }"
          :cx="x(r.k)"
          :cy="y(r.s)"
          :r="r.k === best.k ? 6 : 4"
        />
        <text class="dl e" :x="x(KMAX) - 4" :y="y(rows[KMAX].e) - 8" text-anchor="end">tokens / pass</text>
        <text class="dl s" :x="x(KMAX) - 4" :y="y(rows[KMAX].s) + 16" text-anchor="end">speedup</text>
        <rect
          v-for="r in rows"
          :key="`h${r.k}`"
          class="hit"
          :x="x(r.k) - colW / 2"
          :y="M.t"
          :width="colW"
          :height="H - M.t - M.b"
          @pointerenter="hover = r.k"
          @pointerleave="hover = null"
          @click="hover = r.k"
        />
      </svg>
    </div>

    <p class="read">
      <b>k = {{ hv.k }}</b>{{ hover === null ? ' (best)' : '' }}: {{ hv.e.toFixed(2) }} tokens per pass, each pass costing
      {{ hv.cost.toFixed(2) }}× a plain step, so <b>{{ hv.s.toFixed(2) }}×</b> faster than no speculation.
    </p>

    <div class="legend">
      <span class="lg e">tokens / pass</span><span class="lg s">speedup (tokens / cost)</span>
    </div>

    <div class="ctl">
      <label>
        <span>First-draft acceptance <Tex t="a" /></span>
        <input v-model.number="p.acc" type="range" min="0.3" max="0.99" step="0.01" />
        <output>{{ Math.round(p.acc * 100) }}%</output>
      </label>
      <label>
        <span>Decay per extra draft <Tex t="r" /></span>
        <input v-model.number="p.decay" type="range" min="0.5" max="1" step="0.01" />
        <output>×{{ p.decay.toFixed(2) }}</output>
      </label>
      <label>
        <span>Cost of one draft</span>
        <input v-model.number="p.draft" type="range" min="0" max="30" step="0.5" />
        <output>{{ p.draft }}%</output>
      </label>
      <label>
        <span>Verify cost per draft</span>
        <input v-model.number="p.verify" type="range" min="0" max="30" step="0.5" />
        <output>{{ p.verify }}%</output>
      </label>
    </div>
    <button class="reset" @click="Object.assign(p, PRESET)">Reset</button>
  </div>
</template>

<style scoped>
.dp {
  font-size: 0.9rem;
  --e: var(--muted);
  --s: var(--accent);
}
.chart {
  width: 100%;
  overflow: hidden;
}
svg {
  display: block;
}
.grid line {
  stroke: var(--border);
  stroke-width: 1;
}
.grid text,
.dl {
  fill: var(--muted);
  font-size: 11px;
  font-family: var(--mono);
}
.grid .axis {
  font-family: inherit;
}
.dl {
  fill: var(--text);
}
.ln {
  fill: none;
  stroke-width: 2;
}
.ln.e {
  stroke: var(--e);
  stroke-dasharray: 5 4;
}
.ln.s {
  stroke: var(--s);
}
.pt {
  stroke: var(--surface);
  stroke-width: 2;
}
.pt.e {
  fill: var(--e);
}
.pt.s {
  fill: var(--s);
}
.cross {
  stroke: var(--muted);
  stroke-width: 1;
}
.hit {
  fill: transparent;
  cursor: crosshair;
}
.read {
  margin: 0.4rem 0;
  min-height: 3em;
}
.legend {
  display: flex;
  gap: 0.9rem;
  font-size: 0.78rem;
  margin-bottom: 0.6rem;
}
.lg {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.lg::before {
  content: '';
  width: 1.1rem;
  height: 0;
  border-top: 2px solid var(--s);
}
.lg.e::before {
  border-top: 2px dashed var(--e);
}
.ctl {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.4rem 1.2rem;
}
.ctl label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
}
.ctl label > span {
  width: 10rem;
  flex-shrink: 0;
  font-size: 0.85rem;
}
.ctl input {
  flex: 1;
  min-width: 0;
}
.ctl output {
  width: 3rem;
  text-align: right;
  font-family: var(--mono);
  color: var(--text);
}
button {
  font: inherit;
  margin-top: 0.6rem;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
</style>
