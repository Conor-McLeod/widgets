<script setup lang="ts">
import { computed, ref } from 'vue';

const NQ = 8;
const D_HEAD = 128;
const OPTIONS = [8, 4, 2, 1];
const PALETTE = ['#2f5fd0', '#d0562f', '#2f8f5f', '#9b4dca', '#c49a1a', '#1a9bb0', '#c43d7a', '#6b7a2f'];

const nkv = ref(2);
const hover = ref<number | null>(null);

const G = computed(() => NQ / nkv.value);
const kind = computed(() => (nkv.value === NQ ? 'multi-head' : nkv.value === 1 ? 'multi-query' : 'grouped-query'));
const color = (g: number) => PALETTE[(g * NQ) / nkv.value];

// Geometry in viewBox units. Query heads sit in 8 equal slots; each K/V head is
// centred under the slots of the query heads it serves.
const W = 480;
const slot = W / NQ;
const BW = 48;
const QY = 24;
const QH = 34;
const KY = 136;
const KH = 26;
const H = KY + 2 * KH + 30;

const queries = computed(() =>
  Array.from({ length: NQ }, (_, i) => ({ i, g: Math.floor(i / G.value), x: slot * (i + 0.5) })),
);
const kvs = computed(() => Array.from({ length: nkv.value }, (_, g) => ({ g, x: slot * G.value * (g + 0.5) })));

function wire(qx: number, kx: number) {
  const y0 = QY + QH;
  const mid = (y0 + KY) / 2;
  return `M${qx},${y0} C${qx},${mid} ${kx},${mid} ${kx},${KY}`;
}
const dim = (g: number) => hover.value !== null && hover.value !== g;

const perToken = computed(() => 2 * nkv.value * D_HEAD);
</script>

<template>
  <div class="gqa-heads">
    <div class="controls" role="radiogroup" aria-label="Number of K/V heads">
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
      <span class="kind">{{ kind }}</span>
    </div>

    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="`${NQ} query heads sharing ${nkv} key/value heads`">
      <text class="row-lbl" x="2" y="16">query heads</text>
      <text class="row-lbl" x="2" :y="H - 4">key / value heads (cached)</text>

      <path
        v-for="q in queries"
        :key="`w${q.i}`"
        :d="wire(q.x, kvs[q.g].x)"
        class="wire"
        :class="{ dim: dim(q.g) }"
        :style="{ stroke: color(q.g) }"
      />

      <g
        v-for="q in queries"
        :key="`q${q.i}`"
        class="node"
        :class="{ dim: dim(q.g) }"
        :style="{ '--c': color(q.g) }"
        @pointerenter="hover = q.g"
        @pointerleave="hover = null"
      >
        <rect :x="q.x - BW / 2" :y="QY" :width="BW" :height="QH" rx="6" />
        <text :x="q.x" :y="QY + QH / 2 + 6">Q{{ q.i + 1 }}</text>
      </g>

      <g
        v-for="k in kvs"
        :key="`kv${k.g}`"
        class="node"
        :class="{ dim: dim(k.g) }"
        :style="{ '--c': color(k.g) }"
        @pointerenter="hover = k.g"
        @pointerleave="hover = null"
      >
        <rect :x="k.x - BW / 2" :y="KY" :width="BW" :height="KH" rx="5" />
        <text :x="k.x" :y="KY + KH / 2 + 6">K{{ k.g + 1 }}</text>
        <rect :x="k.x - BW / 2" :y="KY + KH + 4" :width="BW" :height="KH" rx="5" class="v" />
        <text :x="k.x" :y="KY + KH * 1.5 + 10">V{{ k.g + 1 }}</text>
      </g>
    </svg>

    <dl>
      <dt>query heads per K/V head</dt>
      <dd>
        <code>{{ G }}</code>
      </dd>
      <dt>cached per token, per layer</dt>
      <dd>
        2 × {{ nkv }} × {{ D_HEAD }} = <code>{{ perToken.toLocaleString() }}</code> numbers
        <div class="bar" :aria-label="`${(100 * nkv) / NQ}% of multi-head`">
          <span :style="{ width: `${(100 * nkv) / NQ}%` }" />
        </div>
        <small>{{ (100 * nkv) / NQ }}% of multi-head attention</small>
      </dd>
    </dl>
  </div>
</template>

<style scoped>
.gqa-heads {
  font-size: 0.92rem;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}
.lbl {
  color: var(--muted);
  margin-right: 0.2rem;
}
button {
  font: inherit;
  font-family: var(--mono);
  min-width: 2.2rem;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.25rem 0.55rem;
  cursor: pointer;
}
button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.kind {
  margin-left: 0.4rem;
  padding: 0 0.45rem;
  border-radius: 4px;
  font-size: 0.78rem;
  background: var(--accent-soft);
  color: var(--accent);
}
svg {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
}
.row-lbl {
  font-size: 14px;
  fill: var(--muted);
}
.wire {
  fill: none;
  stroke-width: 2;
  opacity: 0.7;
}
.node rect {
  fill: color-mix(in srgb, var(--c) 22%, var(--surface));
  stroke: var(--c);
  stroke-width: 1.5;
}
.node rect.v {
  fill: color-mix(in srgb, var(--c) 10%, var(--surface));
}
.node text {
  font-family: var(--mono);
  font-size: 16px;
  font-weight: 600;
  fill: var(--text);
  text-anchor: middle;
  pointer-events: none;
}
.dim {
  opacity: 0.18;
}
.wire,
.node {
  transition: opacity 0.15s;
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.3rem 1rem;
  margin: 0.75rem 0 0;
}
@media (max-width: 480px) {
  dl {
    grid-template-columns: 1fr;
    gap: 0.1rem;
  }
  dd {
    margin-bottom: 0.5rem !important;
  }
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
}
.bar {
  height: 8px;
  margin: 0.35rem 0 0.15rem;
  max-width: 260px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}
small {
  color: var(--muted);
}
</style>
