<script setup lang="ts">
// How much does a token written L steps ago still contribute to a read now?
// Ignoring the delta-rule erase (assume no later write touched it), its trace in key channel i
// has been multiplied by α_i at every step since, so the read weight is
//   w(L) = Σ_i q_i k_i α_i^L.
// Gated DeltaNet uses one α per head; KDA gives each key channel its own α.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type Mode = 'scalar' | 'channel';
const D = 8;
const L_MAX = 160;

const mode = ref<Mode>('channel');
const scalarHalf = ref(16);
const fastHalf = ref(2);
const slowHalf = ref(200);
const focus = ref(3.5); // which channel the query leans on

const halfLives = computed(() =>
  mode.value === 'scalar'
    ? Array(D).fill(scalarHalf.value)
    : Array.from({ length: D }, (_, i) => fastHalf.value * (slowHalf.value / fastHalf.value) ** (i / (D - 1))),
);
const alphas = computed(() => halfLives.value.map((h) => 2 ** (-1 / h)));

// Query weights: a bump centred on `focus`, normalised to sum to 1. Keys are spread evenly.
const q = computed(() => {
  const raw = Array.from({ length: D }, (_, i) => Math.exp(-((i - focus.value) ** 2) / 1.2));
  const s = raw.reduce((a, b) => a + b, 0);
  return raw.map((x) => x / s);
});

const weight = (L: number) => alphas.value.reduce((acc, a, i) => acc + q.value[i] * a ** L, 0);

// Lag by which half of the total read weight has been accumulated.
const medianLag = computed(() => {
  const N = 20000;
  let total = 0;
  const w: number[] = [];
  for (let L = 0; L < N; L++) total += w[L] = weight(L);
  let acc = 0;
  for (let L = 0; L < N; L++) if ((acc += w[L]) >= total / 2) return L;
  return N;
});

// Draw at the container's real width so labels stay 12px on a phone.
const root = ref<HTMLElement>();
const width = ref(600);
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (width.value = Math.max(260, Math.min(680, Math.round(e.contentRect.width)))));
  ro.observe(root.value!);
});
onBeforeUnmount(() => ro?.disconnect());

const W = computed(() => width.value);
const H = 210;
const PAD = { l: 34, r: 10, t: 12, b: 28 };
const x = (L: number) => PAD.l + (L / L_MAX) * (W.value - PAD.l - PAD.r);
const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);

const path = (f: (L: number) => number) => {
  let d = '';
  for (let L = 0; L <= L_MAX; L++) d += `${L ? 'L' : 'M'}${x(L).toFixed(1)},${y(f(L)).toFixed(1)}`;
  return d;
};
const sumPath = computed(() => path(weight));
const areaPath = computed(() => `${sumPath.value}L${x(L_MAX)},${y(0)}L${x(0)},${y(0)}Z`);
const channelPaths = computed(() =>
  mode.value === 'scalar' ? [] : alphas.value.map((a, i) => ({ d: path((L) => a ** L), q: q.value[i] })),
);
const xticks = computed(() => Array.from({ length: L_MAX / (W.value < 450 ? 40 : 20) + 1 }, (_, i) => i * (W.value < 450 ? 40 : 20)));

const fmtH = (h: number) => (h >= 10 ? Math.round(h).toString() : h.toFixed(1));
</script>

<template>
  <div ref="root" class="hz">
    <div class="ctl">
      <div class="seg" role="group" aria-label="Forget gate">
        <button :class="{ on: mode === 'scalar' }" @click="mode = 'scalar'">One gate per head (Gated DeltaNet)</button>
        <button :class="{ on: mode === 'channel' }" @click="mode = 'channel'">One gate per channel (KDA)</button>
      </div>
    </div>
    <div class="ctl">
      <label v-if="mode === 'scalar'">
        <span>half-life</span>
        <input v-model.number="scalarHalf" type="range" min="1" max="200" step="1" />
        <output>{{ scalarHalf }} tokens</output>
      </label>
      <template v-else>
        <label>
          <span>fastest channel</span>
          <input v-model.number="fastHalf" type="range" min="1" max="20" step="0.5" />
          <output>{{ fmtH(fastHalf) }}</output>
        </label>
        <label>
          <span>slowest channel</span>
          <input v-model.number="slowHalf" type="range" min="20" max="1000" step="10" />
          <output>{{ fmtH(slowHalf) }}</output>
        </label>
      </template>
      <label>
        <span>query leans on channel</span>
        <input v-model.number="focus" type="range" min="0" :max="D - 1" step="0.1" />
        <output>{{ focus.toFixed(1) }}</output>
      </label>
    </div>

    <div class="chans" aria-label="Key channels">
      <div v-for="(h, i) in halfLives" :key="i" class="chan">
        <div class="bar"><div :style="{ height: `${Math.round(q[i] * 100 * 1.6)}%` }" /></div>
        <div class="lbl">{{ fmtH(h) }}</div>
      </div>
      <p class="legend">bar: query weight on each channel · number: that channel's half-life in tokens</p>
    </div>

    <svg :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="Read weight against how many tokens ago it was written">
      <line :x1="PAD.l" :x2="W - PAD.r" :y1="y(0)" :y2="y(0)" stroke="var(--border)" />
      <line :x1="PAD.l" :x2="PAD.l" :y1="y(0)" :y2="y(1)" stroke="var(--border)" />
      <g font-size="12" fill="var(--muted)">
        <text v-for="t in xticks" :key="t" :x="x(t)" :y="H - 10" text-anchor="middle">{{ t }}</text>
        <text :x="PAD.l - 6" :y="y(1) + 4" text-anchor="end">1</text>
        <text :x="PAD.l - 6" :y="y(0.5) + 4" text-anchor="end">½</text>
        <text :x="PAD.l - 6" :y="y(0) + 4" text-anchor="end">0</text>
      </g>
      <path
        v-for="(c, i) in channelPaths"
        :key="i"
        :d="c.d"
        fill="none"
        stroke="var(--muted)"
        stroke-dasharray="3 3"
        :stroke-opacity="0.2 + 0.8 * Math.min(1, c.q * 2.5)"
      />
      <path :d="areaPath" fill="var(--accent)" fill-opacity="0.15" />
      <path :d="sumPath" fill="none" stroke="var(--accent)" stroke-width="2.5" />
      <line
        v-if="medianLag <= L_MAX"
        :x1="x(medianLag)"
        :x2="x(medianLag)"
        :y1="y(0)"
        :y2="y(weight(medianLag))"
        stroke="var(--danger)"
        stroke-width="1.5"
      />
    </svg>
    <p class="readout">
      x: tokens ago · y: how much of that token is still read. Half of everything this query reads comes from the
      last <b>{{ medianLag.toLocaleString() }}</b> tokens.
    </p>
  </div>
</template>

<style scoped>
.hz {
  font-size: 0.92rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.2rem;
  align-items: center;
  margin-bottom: 0.7rem;
}
.ctl label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem 0.5rem;
  color: var(--muted);
}
.ctl input {
  width: 7.5rem;
}
output {
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--text);
}
button {
  font: inherit;
  font-size: 0.85rem;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 0.3rem 0.6rem;
  cursor: pointer;
}
button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.seg {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.seg button {
  border-radius: 6px;
}
.chans {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 4px;
  max-width: 26rem;
}
.chan .bar {
  height: 2.6rem;
  display: flex;
  align-items: flex-end;
  border-bottom: 1px solid var(--border);
}
.chan .bar div {
  width: 100%;
  max-height: 100%;
  background: var(--accent);
  border-radius: 2px 2px 0 0;
}
.chan .lbl {
  font-family: var(--mono);
  font-size: 0.72rem;
  text-align: center;
  color: var(--muted);
  margin-top: 2px;
}
.legend {
  grid-column: 1 / -1;
  margin: 0.2rem 0 0;
  font-size: 0.75rem;
  color: var(--muted);
}
svg {
  display: block;
  width: 100%;
  height: auto;
  margin-top: 0.8rem;
}
.readout {
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.readout b {
  color: var(--text);
  font-family: var(--mono);
}
</style>
