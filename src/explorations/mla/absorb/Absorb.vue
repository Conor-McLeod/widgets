<script setup lang="ts">
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';

// A toy single head: latent width DC, head width DH, a DR-wide RoPE key, and T tokens of context.
// The newest token (position T-1) is the one asking the question.
const DC = 4;
const DH = 4;
const DR = 2;
const T = 6;
const N = T - 1;

type Mode = 'plain' | 'rope' | 'decoupled';
const modes: { id: Mode; label: string }[] = [
  { id: 'plain', label: 'No RoPE' },
  { id: 'rope', label: 'RoPE on keys' },
  { id: 'decoupled', label: 'Decoupled RoPE' },
];
const mode = ref<Mode>('plain');
const theta = ref(0.6);
const seed = ref(7);

function rng(s: number) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

const data = computed(() => {
  const r = rng(seed.value);
  const vec = (n: number) => Array.from({ length: n }, r);
  return {
    W: Array.from({ length: DH }, () => vec(DC)), // W_UK: DH x DC
    C: Array.from({ length: T }, () => vec(DC)), // cached latents
    KR: Array.from({ length: T }, () => vec(DR)), // un-rotated RoPE keys
    q: vec(DH),
    qR: vec(DR),
  };
});

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const matVec = (M: number[][], v: number[]) => M.map((row) => dot(row, v));
const matTVec = (M: number[][], v: number[]) => M[0].map((_, j) => M.reduce((s, row, i) => s + row[j] * v[i], 0));
// Rotate consecutive pairs; pair i spins at theta / 3^i, as RoPE uses a ladder of frequencies.
function rot(v: number[], pos: number) {
  const out = v.slice();
  for (let i = 0; i + 1 < v.length; i += 2) {
    const a = pos * theta.value * 3 ** -(i / 2);
    const [x, y] = [v[i], v[i + 1]];
    out[i] = x * Math.cos(a) - y * Math.sin(a);
    out[i + 1] = x * Math.sin(a) + y * Math.cos(a);
  }
  return out;
}

const view = computed(() => {
  const { W, C, KR, q, qR } = data.value;
  const m = mode.value;
  const absorbedQ = matTVec(W, q); // W_UKᵀ q, computed once per query
  const scale = 1 / Math.sqrt(m === 'decoupled' ? DH + DR : DH);

  const query = m === 'plain' ? q : m === 'rope' ? rot(q, N) : [...q, ...rot(qR, N)];
  const qTilde = m === 'decoupled' ? [...absorbedQ, ...rot(qR, N)] : absorbedQ;

  const rows = C.map((c, t) => {
    const kC = matVec(W, c);
    const kR = rot(KR[t], t);
    const cached = m === 'decoupled' ? [...c, ...kR] : c;
    const key = m === 'plain' ? kC : m === 'rope' ? rot(kC, t) : [...kC, ...kR];
    const a = dot(query, key) * scale;
    const b = dot(qTilde, cached) * scale;
    return { t, cached, key, a, b, ok: Math.abs(a - b) < 1e-9 };
  });
  const maxAbs = Math.max(...rows.flatMap((r) => [Math.abs(r.a), Math.abs(r.b)]), 1e-6);
  return { query, qTilde, rows, maxAbs, bad: rows.filter((r) => !r.ok).length };
});

// Diverging colour: accent for positive, danger for negative.
const cell = (x: number) => {
  const pct = Math.round(Math.min(1, Math.abs(x) / 1.5) * 85);
  return { background: `color-mix(in srgb, var(${x >= 0 ? '--accent' : '--danger'}) ${pct}%, transparent)` };
};
const isR = (i: number, len: number) => mode.value === 'decoupled' && i >= len - DR;
// Score bar: a filled bar for the rebuilt-key score, a tick for the absorbed score, both from the centre.
const bar = (x: number) => {
  const w = (Math.abs(x) / view.value.maxAbs) * 50;
  return { left: `${x >= 0 ? 50 : 50 - w}%`, width: `${w}%` };
};
const tick = (x: number) => ({ left: `calc(${50 + (x / view.value.maxAbs) * 50}% - 1px)` });

const keyLabel = computed(() =>
  mode.value === 'plain'
    ? 'W_{\\mathrm{UK}}\\, c'
    : mode.value === 'rope'
      ? 'R_t W_{\\mathrm{UK}}\\, c'
      : 'W_{\\mathrm{UK}}\\, c \\,\\Vert\\, k_R',
);
const cost = computed(() => {
  const r = mode.value === 'decoupled' ? DR : 0;
  return { rebuild: T * DH * DC + T * (DH + r), absorbed: DH * DC + T * (DC + r) };
});
</script>

<template>
  <div class="ab">
    <div class="bar-top">
      <div class="modes" role="group" aria-label="Attention variant">
        <button v-for="m in modes" :key="m.id" :aria-pressed="mode === m.id" @click="mode = m.id">{{ m.label }}</button>
      </div>
      <button class="shuffle" @click="seed++" title="New random weights and tokens">Shuffle</button>
    </div>
    <label class="theta" :class="{ off: mode === 'plain' }">
      <span>RoPE angle <Tex t="\theta" /></span>
      <input v-model.number="theta" type="range" min="0" max="1.5" step="0.01" :disabled="mode === 'plain'" />
      <output>{{ theta.toFixed(2) }}</output>
    </label>

    <div class="queries">
      <div>
        <span class="lbl">query <Tex :t="mode === 'plain' ? 'q' : 'R_n q'" /></span>
        <span class="cells">
          <i v-for="(x, i) in view.query" :key="i" :style="cell(x)" :class="{ r: isR(i, view.query.length) }" :title="x.toFixed(3)" />
        </span>
      </div>
      <div>
        <span class="lbl">absorbed <Tex :t="`\\tilde q = W_{\\mathrm{UK}}^\\top q${mode === 'decoupled' ? ' \\,\\Vert\\, q_R' : ''}`" /></span>
        <span class="cells">
          <i v-for="(x, i) in view.qTilde" :key="i" :style="cell(x)" :class="{ r: isR(i, view.qTilde.length) }" :title="x.toFixed(3)" />
        </span>
      </div>
    </div>

    <div class="table" role="table" aria-label="Per-token cache, rebuilt keys and attention scores">
      <div class="tr th" role="row">
        <span><Tex t="t" /></span>
        <span>cached</span>
        <span>key <Tex :t="`= ${keyLabel}`" /></span>
        <span>score</span>
      </div>
      <div v-for="r in view.rows" :key="r.t" class="tr" role="row" :class="{ bad: !r.ok }">
        <span class="t">{{ r.t }}{{ r.t === N ? '*' : '' }}</span>
        <span class="cells">
          <i v-for="(x, i) in r.cached" :key="i" :style="cell(x)" :class="{ r: isR(i, r.cached.length) }" :title="x.toFixed(3)" />
        </span>
        <span class="cells dim">
          <i v-for="(x, i) in r.key" :key="i" :style="cell(x)" :class="{ r: isR(i, r.key.length) }" :title="x.toFixed(3)" />
        </span>
        <span class="score" :title="`rebuilt keys: ${r.a.toFixed(3)}, absorbed: ${r.b.toFixed(3)}`">
          <span class="track">
            <span class="fill" :style="bar(r.a)" />
            <span class="tick" :style="tick(r.b)" />
          </span>
          <span class="mark">{{ r.ok ? '✓' : '✗' }}</span>
        </span>
      </div>
    </div>
    <div class="legend">
      <span><span class="sw fill" /> score from rebuilt keys</span>
      <span><span class="sw tick" /> score from absorbed <Tex t="\tilde q" /></span>
      <span v-if="mode === 'decoupled'"><span class="sw r" /> RoPE part</span>
      <span>* the token asking <Tex :t="`(n = ${N})`" /></span>
    </div>

    <p class="status" aria-live="polite">
      <template v-if="view.bad === 0">
        Both paths agree on every token. Cache per token: <b>{{ view.rows[0].cached.length }}</b> numbers. Multiplies:
        <b>{{ cost.rebuild }}</b> rebuilding keys vs <b>{{ cost.absorbed }}</b> absorbed.
      </template>
      <template v-else>
        The absorbed path is wrong on {{ view.bad }} of {{ T }} tokens. The rotation between query and key is
        <Tex t="R_{t-n}" />, different for every cached token, so no single <Tex t="\tilde q" /> can carry it.
      </template>
    </p>
  </div>
</template>

<style scoped>
.ab {
  font-size: 0.88rem;
}
.bar-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
}
.modes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
button {
  font: inherit;
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
button[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--surface);
}
.theta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.6rem 0;
  color: var(--muted);
  max-width: 360px;
}
.theta.off {
  opacity: 0.45;
}
.theta input {
  flex: 1;
  min-width: 0;
}
.theta output {
  font-family: var(--mono);
  color: var(--text);
  width: 2.5rem;
}
.queries {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.5rem;
  margin-bottom: 0.7rem;
}
.queries > div {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.lbl {
  font-family: var(--mono);
  font-size: 0.76rem;
  color: var(--muted);
}
.cells {
  display: inline-flex;
  gap: 2px;
}
.cells i {
  display: block;
  width: 1.05rem;
  height: 1.05rem;
  border-radius: 3px;
  border: 1px solid var(--border);
}
.cells i.r {
  border: 1.5px dashed var(--text);
}
.table {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tr {
  display: grid;
  grid-template-columns: 1.3rem 7.6rem 7.6rem minmax(5rem, 1fr);
  align-items: center;
  gap: 0.5rem;
  padding: 1px 2px;
  border-radius: 4px;
}
.th {
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--muted);
}
.th span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tr.bad {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
}
.t {
  font-family: var(--mono);
  color: var(--muted);
}
.score {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.track {
  position: relative;
  flex: 1;
  height: 1rem;
  border-left: 1px solid transparent;
  background: linear-gradient(var(--border), var(--border)) center / 1px 100% no-repeat;
}
.fill {
  position: absolute;
  top: 2px;
  bottom: 2px;
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  border-radius: 2px;
  transition: all 0.15s;
}
.tick {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 3px;
  background: var(--text);
  border-radius: 1px;
  transition: left 0.15s;
}
.mark {
  width: 1rem;
  font-weight: 600;
  color: var(--accent);
}
.tr.bad .mark {
  color: var(--danger);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 1rem;
  margin-top: 0.5rem;
  font-size: 0.76rem;
  color: var(--muted);
}
.legend > span {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.sw {
  position: static;
  display: inline-block;
  width: 0.9rem;
  height: 0.7rem;
  border-radius: 2px;
}
.sw.fill {
  background: var(--accent-soft);
  border: 1px solid var(--accent);
}
.sw.tick {
  width: 3px;
  background: var(--text);
}
.sw.r {
  border: 1.5px dashed var(--text);
}
.status {
  margin: 0.7rem 0 0;
  min-height: 2.8em;
}
@media (max-width: 420px) {
  .cells i {
    width: 0.85rem;
    height: 0.85rem;
  }
  .tr {
    grid-template-columns: 1.1rem 6.2rem 6.2rem minmax(3.5rem, 1fr);
    gap: 0.35rem;
  }
}
</style>
