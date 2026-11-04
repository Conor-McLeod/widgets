<script setup lang="ts">
// One query, its whole prefix. Top: the softmax weights dense attention would give each key.
// Bottom: the lightning indexer's scores for the same keys. The k keys that the chosen rule
// picks are highlighted, and the readout says how much of dense attention's weight they cover.
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';
import { type Method, indexerLogits, kl, select, softmax, trueLogits } from '../toy';

const MAX_Q = 47;
const VW = 480;
const LEFT = 8;
const RIGHT = 8;
const TOP_H = 120; // dense-attention panel
const GAP = 34;
const BOT_H = 60; // indexer panel
const VH = TOP_H + GAP + BOT_H + 22;

const q = ref(MAX_Q);
const k = ref(8);
const steps = ref(1000);
const method = ref<Method>('indexer');
const hover = ref<number | null>(null);

const METHODS: { id: Method; label: string }[] = [
  { id: 'indexer', label: 'indexer top-k' },
  { id: 'oracle', label: 'exact top-k' },
  { id: 'window', label: 'last k' },
];

const p = computed(() => softmax(trueLogits(q.value)));
const idx = computed(() => indexerLogits(q.value, steps.value));
const pIdx = computed(() => softmax(idx.value));
const chosen = computed(() => select(method.value, q.value, k.value, steps.value));
const kept = computed(() => [...chosen.value].reduce((a, s) => a + p.value[s], 0));
const best = computed(() => [...select('oracle', q.value, k.value, 0)].reduce((a, s) => a + p.value[s], 0));
const klv = computed(() => kl(p.value, pIdx.value));

const dx = computed(() => (VW - LEFT - RIGHT) / (q.value + 1));
const x = (s: number) => LEFT + s * dx.value;
const pMax = computed(() => Math.max(...p.value));
const iMin = computed(() => Math.min(...idx.value));
const iMax = computed(() => Math.max(...idx.value));
const idxRank = computed(() => {
  const order = idx.value.map((_, i) => i).sort((a, b) => idx.value[b] - idx.value[a]);
  const r: number[] = [];
  order.forEach((s, i) => (r[s] = i + 1));
  return r;
});

const bars = computed(() =>
  p.value.map((w, s) => {
    const h = Math.max(1, (w / pMax.value) * (TOP_H - 6));
    const ih = 3 + ((idx.value[s] - iMin.value) / (iMax.value - iMin.value || 1)) * (BOT_H - 6);
    return { s, w, h, ih, on: chosen.value.has(s) };
  }),
);

function pick(ev: PointerEvent) {
  const svg = ev.currentTarget as SVGSVGElement;
  const r = svg.getBoundingClientRect();
  const px = ((ev.clientX - r.left) / r.width) * VW;
  const s = Math.floor((px - LEFT) / dx.value);
  hover.value = s >= 0 && s <= q.value ? s : null;
}

const pct = (v: number) => `${(100 * v).toFixed(1)}%`;
</script>

<template>
  <div class="dsp">
    <div class="ctl">
      <div class="seg" role="group" aria-label="Which keys to read">
        <button v-for="m in METHODS" :key="m.id" :aria-pressed="method === m.id" @click="method = m.id">{{ m.label }}</button>
      </div>
      <label class="range">
        <span><Tex t="k" /></span>
        <input v-model.number="k" type="range" min="1" max="24" />
        <output>{{ k }}</output>
      </label>
      <label class="range">
        <span>query at</span>
        <input v-model.number="q" type="range" min="8" :max="MAX_Q" />
        <output>{{ q }}</output>
      </label>
      <label class="range">
        <span>indexer warm-up</span>
        <input v-model.number="steps" type="range" min="0" max="1000" step="10" />
        <output>{{ steps }}</output>
      </label>
    </div>

    <svg
      class="plot"
      :viewBox="`0 0 ${VW} ${VH}`"
      role="img"
      aria-label="Dense attention weights per key, with the indexer's scores beneath"
      @pointermove="pick"
      @pointerdown="pick"
      @pointerleave="hover = null"
    >
      <text :x="LEFT" y="11" font-size="12" fill="var(--muted)">dense attention weight</text>
      <g :transform="`translate(0, 16)`">
        <rect
          v-for="b in bars"
          :key="b.s"
          :x="x(b.s) + 0.75"
          :y="TOP_H - 6 - b.h"
          :width="Math.max(1, dx - 1.5)"
          :height="b.h"
          rx="1.5"
          :fill="b.on ? 'var(--accent)' : 'var(--danger)'"
          :fill-opacity="b.on ? 1 : 0.35"
        />
        <line :x1="LEFT" :x2="VW - RIGHT" :y1="TOP_H - 6" :y2="TOP_H - 6" stroke="var(--border)" />
      </g>
      <text :x="LEFT" :y="TOP_H + GAP - 2" font-size="12" fill="var(--muted)">indexer score</text>
      <g :transform="`translate(0, ${TOP_H + GAP + 4})`">
        <rect
          v-for="b in bars"
          :key="b.s"
          :x="x(b.s) + 0.75"
          :y="BOT_H - 6 - b.ih"
          :width="Math.max(1, dx - 1.5)"
          :height="b.ih"
          rx="1.5"
          :fill="b.on ? 'var(--accent)' : 'var(--muted)'"
          :fill-opacity="b.on ? 0.8 : 0.3"
        />
        <line :x1="LEFT" :x2="VW - RIGHT" :y1="BOT_H - 6" :y2="BOT_H - 6" stroke="var(--border)" />
      </g>
      <rect
        v-if="hover !== null"
        :x="x(hover)"
        y="14"
        :width="dx"
        :height="TOP_H + GAP + BOT_H - 4"
        fill="none"
        stroke="var(--text)"
        stroke-width="1"
        rx="2"
      />
      <text
        v-for="s in [0, Math.floor(q / 2), q]"
        :key="s"
        :x="s === q ? VW - RIGHT : x(s) + dx / 2"
        :y="VH - 4"
        font-size="11"
        :text-anchor="s === q ? 'end' : s === 0 ? 'start' : 'middle'"
        fill="var(--muted)"
      >{{ s === q ? `query ${s}` : s }}</text>
    </svg>

    <p class="hover" aria-live="polite">
      <template v-if="hover !== null">
        key {{ hover }}: dense weight {{ pct(p[hover]) }}, indexer rank {{ idxRank[hover] }} of {{ q + 1 }}{{
          chosen.has(hover) ? ', read' : ', skipped'
        }}
      </template>
      <template v-else>Hover a bar for its numbers. Blue keys are read; red is weight the query wanted but won't get.</template>
    </p>

    <dl class="stats">
      <dt>keys read</dt>
      <dd>{{ chosen.size }} of {{ q + 1 }}</dd>
      <dt>dense weight covered</dt>
      <dd>
        {{ pct(kept) }}
        <span v-if="method !== 'oracle'" class="dim">(best possible with <Tex :t="`k = ${k}`" />: {{ pct(best) }})</span>
      </dd>
      <dt>indexer vs dense, KL</dt>
      <dd>{{ klv.toFixed(2) }} nats</dd>
    </dl>
  </div>
</template>

<style scoped>
.dsp {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.1rem;
  margin-bottom: 0.75rem;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.seg button {
  font: inherit;
  color: var(--muted);
  background: var(--bg);
  border: 0;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
}
.seg button + button {
  border-left: 1px solid var(--border);
}
.seg button[aria-pressed='true'] {
  background: var(--accent-soft);
  color: var(--accent);
}
.range {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--muted);
}
.range input {
  width: 6.5rem;
}
.range output {
  font-family: var(--mono);
  color: var(--text);
  min-width: 2.2em;
}
.plot {
  display: block;
  width: 100%;
  height: auto;
  touch-action: none;
}
.hover {
  margin: 0.4rem 0 0.5rem;
  font-size: 0.82rem;
  color: var(--muted);
  min-height: 2.6em;
}
.stats {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.2rem 1rem;
  margin: 0;
  font-size: 0.85rem;
}
.stats dt {
  color: var(--muted);
}
.stats dd {
  margin: 0;
  font-family: var(--mono);
}
.dim {
  color: var(--muted);
  font-family: var(--font);
}
</style>
