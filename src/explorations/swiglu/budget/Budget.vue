<script setup lang="ts">
import { computed, ref, watch } from 'vue';

// d_model presets from well-known models (the GPT-2 entry is for scale; it used a GELU FFN).
const PRESETS = [
  { d: 768, name: 'GPT-2 small' },
  { d: 4096, name: 'LLaMA 7B' },
  { d: 5120, name: 'LLaMA 13B' },
  { d: 8192, name: 'LLaMA 65B' },
];
const MULTIPLE = 256;

const d = ref(4096);
const h = ref(0);

// LLaMA's rule: two thirds of 4d, rounded up to a multiple of 256.
const matched = computed(() => Math.ceil(((2 * 4 * d.value) / 3) / MULTIPLE) * MULTIPLE);
watch(d, () => (h.value = matched.value), { immediate: true });

const classic = computed(() => 2 * d.value * 4 * d.value);
const gated = computed(() => 3 * d.value * h.value);
const ratio = computed(() => gated.value / classic.value);
const widest = computed(() => Math.max(classic.value, gated.value, 3 * d.value * 4 * d.value));

const fmt = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n.toLocaleString());
const pct = (n: number) => `${(100 * n) / widest.value}%`;
</script>

<template>
  <div class="bud">
    <div class="row">
      <span class="lbl">d<sub>model</sub></span>
      <div class="chips">
        <button v-for="p in PRESETS" :key="p.d" :aria-pressed="d === p.d" @click="d = p.d">
          {{ p.d }} <small>{{ p.name }}</small>
        </button>
      </div>
    </div>

    <label class="row">
      <span class="lbl">SwiGLU hidden</span>
      <input v-model.number="h" type="range" :min="d" :max="6 * d" :step="MULTIPLE" />
      <output>{{ h.toLocaleString() }}</output>
    </label>
    <div class="row quick">
      <button @click="h = matched">⅔ · 4d, rounded → {{ matched.toLocaleString() }}</button>
      <button @click="h = 4 * d">same as classic: 4d = {{ (4 * d).toLocaleString() }}</button>
    </div>

    <div class="bars">
      <div class="bar">
        <div class="name">Classic FFN <code>W₂·ReLU(W₁x)</code></div>
        <div class="track"><div class="fill classic" :style="{ width: pct(classic) }"></div></div>
        <div class="num">
          2 × {{ d.toLocaleString() }} × {{ (4 * d).toLocaleString() }} = <b>{{ fmt(classic) }}</b>
        </div>
      </div>
      <div class="bar">
        <div class="name">SwiGLU FFN <code>W₂·(Swish(Wx) ⊙ Vx)</code></div>
        <div class="track"><div class="fill gated" :style="{ width: pct(gated) }"></div></div>
        <div class="num">
          3 × {{ d.toLocaleString() }} × {{ h.toLocaleString() }} = <b>{{ fmt(gated) }}</b>
          <span :class="['ratio', { over: ratio > 1.02 }]">{{ ratio.toFixed(3) }}× classic</span>
        </div>
      </div>
    </div>
    <p class="note">Parameters per layer, no biases. FLOPs per token scale the same way: about 2 per weight.</p>
  </div>
</template>

<style scoped>
.bud {
  font-size: 0.9rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.75rem;
  margin-bottom: 0.6rem;
}
.lbl {
  color: var(--muted);
  min-width: 7rem;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
button {
  font: inherit;
  font-size: 0.85rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
button small {
  color: var(--muted);
}
button[aria-pressed='true'] {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
input[type='range'] {
  flex: 1 1 10rem;
  min-width: 0;
}
output {
  font-family: var(--mono);
  min-width: 4.5rem;
  text-align: right;
}
.quick button {
  font-family: var(--mono);
  font-size: 0.78rem;
  border-radius: 6px;
}
.bars {
  margin-top: 0.9rem;
  display: grid;
  gap: 0.9rem;
}
.name {
  margin-bottom: 0.25rem;
}
.name code {
  font-size: 0.8rem;
}
.track {
  height: 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.fill {
  height: 100%;
  transition: width 0.15s;
}
.classic {
  background: var(--muted);
}
.gated {
  background: var(--accent);
}
.num {
  margin-top: 0.25rem;
  font-family: var(--mono);
  font-size: 0.8rem;
  color: var(--muted);
}
.num b {
  color: var(--text);
}
.ratio {
  margin-left: 0.6rem;
  color: var(--accent);
}
.ratio.over {
  color: var(--danger);
}
.note {
  margin: 0.8rem 0 0;
  color: var(--muted);
  font-size: 0.8rem;
}
</style>
