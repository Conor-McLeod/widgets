<script setup lang="ts">
import { computed, ref } from 'vue';

const NQ = 8;
const T = 6;
const D = 8;
const OPTIONS = [8, 4, 2, 1];
const PALETTE = ['#2f5fd0', '#d0562f', '#2f8f5f', '#9b4dca', '#c49a1a', '#1a9bb0', '#c43d7a', '#6b7a2f'];

type Mat = number[][]; // [token][dim]

const nkv = ref(2);
const method = ref<'mean' | 'first'>('mean');
const view = ref<'converted' | 'original'>('converted');
const seed = ref(7);

const G = computed(() => NQ / nkv.value);
const color = (g: number) => PALETTE[(g * NQ) / nkv.value];

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A toy "trained" multi-head layer: random queries and keys for each of 8 heads.
const mha = computed(() => {
  const rand = mulberry32(seed.value);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const mat = (): Mat => Array.from({ length: T }, () => Array.from({ length: D }, () => 1.3 * gauss()));
  return { Q: Array.from({ length: NQ }, mat), K: Array.from({ length: NQ }, mat) };
});

// Convert to nkv key heads the way the GQA paper uptrains a checkpoint:
// mean-pool the original heads in each group (or just keep the first one).
const sharedK = computed<Mat[]>(() => {
  const { K } = mha.value;
  return Array.from({ length: nkv.value }, (_, g) => {
    const members = K.slice(g * G.value, (g + 1) * G.value);
    if (method.value === 'first') return members[0];
    return members[0].map((row, t) => row.map((_, d) => members.reduce((s, m) => s + m[t][d], 0) / members.length));
  });
});

function attention(q: Mat, k: Mat): Mat {
  return q.map((qi, i) => {
    const logits = k.slice(0, i + 1).map((kj) => qi.reduce((s, x, d) => s + x * kj[d], 0) / Math.sqrt(D));
    const m = Math.max(...logits);
    const e = logits.map((l) => Math.exp(l - m));
    const z = e.reduce((a, b) => a + b, 0);
    return e.map((x) => x / z);
  });
}

// Mean total-variation distance between rows: 0 = identical, 1 = disjoint.
function tv(a: Mat, b: Mat) {
  const rows = a.map((r, i) => r.reduce((s, x, j) => s + Math.abs(x - b[i][j]), 0) / 2);
  return rows.reduce((s, x) => s + x, 0) / rows.length;
}

const heads = computed(() =>
  Array.from({ length: NQ }, (_, h) => {
    const g = Math.floor(h / G.value);
    const original = attention(mha.value.Q[h], mha.value.K[h]);
    const converted = attention(mha.value.Q[h], sharedK.value[g]);
    return { h, g, original, converted, drift: tv(original, converted) };
  }),
);
const meanDrift = computed(() => heads.value.reduce((s, x) => s + x.drift, 0) / NQ);
</script>

<template>
  <div class="gqa-pat">
    <div class="controls">
      <div class="seg" role="radiogroup" aria-label="Number of K/V heads">
        <span class="lbl">K/V heads</span>
        <button
          v-for="o in OPTIONS"
          :key="o"
          role="radio"
          :aria-checked="nkv === o"
          :class="{ on: nkv === o }"
          @click="nkv = o"
        >
          {{ o }}
        </button>
      </div>
      <div class="seg" role="radiogroup" aria-label="How to merge the original keys">
        <span class="lbl">merge by</span>
        <button role="radio" :aria-checked="method === 'mean'" :class="{ on: method === 'mean' }" @click="method = 'mean'">
          mean-pool
        </button>
        <button
          role="radio"
          :aria-checked="method === 'first'"
          :class="{ on: method === 'first' }"
          @click="method = 'first'"
        >
          keep first
        </button>
      </div>
      <div class="seg" role="radiogroup" aria-label="Which attention to show">
        <span class="lbl">show</span>
        <button
          role="radio"
          :aria-checked="view === 'converted'"
          :class="{ on: view === 'converted' }"
          @click="view = 'converted'"
        >
          shared K
        </button>
        <button
          role="radio"
          :aria-checked="view === 'original'"
          :class="{ on: view === 'original' }"
          @click="view = 'original'"
        >
          original
        </button>
        <button class="reroll" title="New random weights" @click="seed++">↻ reroll</button>
      </div>
    </div>

    <div class="grid">
      <figure v-for="hd in heads" :key="hd.h" :style="{ '--c': color(hd.g) }">
        <figcaption>
          <span>Q{{ hd.h + 1 }}</span><span class="arrow">→</span><span>K{{ hd.g + 1 }}</span>
        </figcaption>
        <div class="map" :aria-label="`attention pattern of query head ${hd.h + 1}`">
          <template v-for="(row, i) in hd[view]" :key="i">
            <span
              v-for="j in T"
              :key="j"
              :class="{ masked: j - 1 > i }"
              :style="j - 1 <= i ? { '--p': `${Math.round(row[j - 1] * 100)}%` } : undefined"
            />
          </template>
        </div>
        <div class="drift" :class="{ zero: hd.drift < 0.005 }">Δ {{ hd.drift.toFixed(2) }}</div>
      </figure>
    </div>

    <p class="summary">
      Average change from the original heads: <strong>{{ meanDrift.toFixed(2) }}</strong>&nbsp;
      <span class="hint">(0 = identical attention, 1 = completely different)</span>
    </p>
  </div>
</template>

<style scoped>
.gqa-pat {
  font-size: 0.92rem;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  margin-bottom: 0.9rem;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}
.lbl {
  color: var(--muted);
  margin-right: 0.15rem;
}
button {
  font: inherit;
  font-size: 0.85rem;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
}
.seg:first-child button {
  font-family: var(--mono);
  min-width: 2rem;
}
button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.reroll {
  margin-left: 0.4rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}
figure {
  margin: 0;
  min-width: 0;
}
figcaption {
  display: flex;
  justify-content: center;
  gap: 0.2rem;
  font-family: var(--mono);
  font-size: 0.78rem;
  font-weight: 600;
  margin-bottom: 0.2rem;
}
.arrow {
  color: var(--muted);
  font-weight: 400;
}
.map {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 1px;
  padding: 3px;
  border: 2px solid var(--c);
  border-radius: 6px;
  background: var(--surface);
}
.map span {
  aspect-ratio: 1;
  border-radius: 1px;
  background: color-mix(in srgb, var(--c) var(--p), var(--surface));
  outline: 1px solid color-mix(in srgb, var(--c) 12%, transparent);
  outline-offset: -1px;
}
.map span.masked {
  background: transparent;
  outline: none;
}
.drift {
  text-align: center;
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--muted);
  margin-top: 0.15rem;
}
.drift.zero {
  opacity: 0.5;
}
.summary {
  margin: 0.9rem 0 0;
}
.hint {
  color: var(--muted);
  font-size: 0.82rem;
}
</style>
