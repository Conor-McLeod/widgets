<script setup lang="ts">
import { computed, ref, watch } from 'vue';

// Counting only the feed-forward block: every expert is the same size as one dense FFN, so
// storage scales with E and per-token compute scales with k.

const EXPERTS = [1, 2, 4, 8, 16, 32, 64, 128, 256];
const PRESETS = [
  { name: 'Switch-Base-128', E: 128, k: 1 },
  { name: 'Mixtral 8x7B', E: 8, k: 2 },
  { name: 'Qwen3-235B-A22B', E: 128, k: 8 },
  { name: 'DeepSeek-V3', E: 256, k: 8 },
];

const eIdx = ref(3);
const k = ref(2);
const E = computed(() => EXPERTS[eIdx.value]);
const kMax = computed(() => Math.min(E.value, 8));
watch(kMax, (m) => (k.value = Math.min(k.value, m)));

const lit = ref<Set<number>>(new Set());
function newToken() {
  const s = new Set<number>();
  while (s.size < k.value) s.add(Math.floor(Math.random() * E.value));
  lit.value = s;
}
watch([E, k], newToken, { immediate: true });

function preset(p: (typeof PRESETS)[number]) {
  eIdx.value = EXPERTS.indexOf(p.E);
  k.value = p.k;
}

/** C(n, r) as a float; fine for display. */
function choose(n: number, r: number) {
  let c = 1;
  for (let i = 0; i < r; i++) c = (c * (n - i)) / (i + 1);
  return c;
}
function fmt(x: number) {
  if (x < 1e6) return Math.round(x).toLocaleString('en');
  const e = Math.floor(Math.log10(x));
  return `${(x / 10 ** e).toFixed(1)} × 10^${e}`;
}

const cols = computed(() => Math.ceil(Math.sqrt(E.value)));
const combos = computed(() => fmt(choose(E.value, k.value)));
</script>

<template>
  <div class="co">
    <div class="co-ctl">
      <label>
        <span>experts</span>
        <input type="range" min="0" :max="EXPERTS.length - 1" v-model.number="eIdx" />
        <output>{{ E }}</output>
      </label>
      <label>
        <span>top-k</span>
        <input type="range" min="1" :max="kMax" v-model.number="k" />
        <output>{{ k }}</output>
      </label>
      <button @click="newToken">route another token</button>
    </div>
    <div class="co-presets">
      <span>try:</span>
      <button v-for="p in PRESETS" :key="p.name" class="co-chip" @click="preset(p)">
        {{ p.name }} <small>{{ p.E }}, top-{{ p.k }}</small>
      </button>
    </div>

    <div class="co-body">
      <div class="co-grid" :style="{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }">
        <span v-for="i in E" :key="i" :class="{ on: lit.has(i - 1) }"></span>
      </div>
      <dl class="co-stats">
        <dt>FFN weights stored</dt>
        <dd><strong>{{ E }}×</strong> a dense FFN</dd>
        <dt>FFN compute per token</dt>
        <dd><strong>{{ k }}×</strong> a dense FFN</dd>
        <dt>stored ÷ used</dt>
        <dd><strong>{{ (E / k).toFixed(E % k ? 1 : 0) }}</strong></dd>
        <dt>possible expert sets per token</dt>
        <dd><strong>{{ combos }}</strong></dd>
      </dl>
    </div>
  </div>
</template>

<style scoped>
.co {
  font-size: 0.9rem;
}
.co-ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.25rem;
}
.co-ctl label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--muted);
}
.co-ctl input {
  width: 7rem;
}
.co-ctl output {
  font-family: var(--mono);
  color: var(--text);
  min-width: 3ch;
}
button {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
}
.co-presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin: 0.6rem 0 1rem;
  color: var(--muted);
  font-size: 0.82rem;
}
.co-chip {
  font-size: 0.8rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}
.co-chip small {
  color: var(--muted);
  font-family: var(--mono);
}
.co-body {
  display: grid;
  grid-template-columns: minmax(0, 220px) minmax(0, 1fr);
  gap: 1.5rem;
  align-items: center;
}
@media (max-width: 560px) {
  .co-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .co-grid {
    max-width: 220px;
  }
}
.co-grid {
  display: grid;
  gap: 2px;
  aspect-ratio: 1;
  align-content: start;
}
.co-grid span {
  aspect-ratio: 1;
  border-radius: 2px;
  background: var(--border);
  transition: background 0.15s;
}
.co-grid span.on {
  background: var(--accent);
}
.co-stats {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.3rem 1rem;
  margin: 0;
}
.co-stats dt {
  color: var(--muted);
}
.co-stats dd {
  margin: 0;
  font-family: var(--mono);
}
.co-stats strong {
  color: var(--text);
}
</style>
