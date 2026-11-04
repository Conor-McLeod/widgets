<script setup lang="ts">
import { computed, ref, watch } from 'vue';

interface Model {
  name: string;
  layers: number;
  nq: number;
  nkv: number;
  dHead: number;
  /** Parameters, in billions. */
  params: number;
}

const MODELS: Model[] = [
  { name: 'Llama 2 7B', layers: 32, nq: 32, nkv: 32, dHead: 128, params: 6.7 },
  { name: 'Llama 3 8B', layers: 32, nq: 32, nkv: 8, dHead: 128, params: 8.0 },
  { name: 'Llama 2 70B', layers: 80, nq: 64, nkv: 8, dHead: 128, params: 69 },
  { name: 'Llama 3.1 405B', layers: 126, nq: 128, nkv: 8, dHead: 128, params: 405 },
];

const modelIdx = ref(2);
const model = computed(() => MODELS[modelIdx.value]);
const nkv = ref(model.value.nkv);
watch(model, (m) => (nkv.value = m.nkv));

const ctxLog = ref(13); // 2^13 = 8192 tokens
const batchLog = ref(0);
const bytes = ref(2);

const ctx = computed(() => 2 ** ctxLog.value);
const batch = computed(() => 2 ** batchLog.value);

const kvChoices = computed(() => {
  const out: number[] = [];
  for (let d = 1; d <= model.value.nq; d *= 2) if (model.value.nq % d === 0) out.push(d);
  return out;
});

const perToken = (kv: number) => 2 * model.value.layers * kv * model.value.dHead * bytes.value;
const cache = (kv: number) => perToken(kv) * ctx.value * batch.value;

const weights = computed(() => model.value.params * 1e9 * 2);
const rows = computed(() => {
  const m = model.value;
  const r = [
    { label: 'weights (bf16)', value: weights.value, kind: 'w' },
    { label: `KV cache · MHA (${m.nq} K/V heads)`, value: cache(m.nq), kind: 'ref' },
    { label: `KV cache · ${nkv.value} K/V head${nkv.value > 1 ? 's' : ''}`, value: cache(nkv.value), kind: 'cur' },
  ];
  return r;
});
const max = computed(() => Math.max(...rows.value.map((r) => r.value)));

function fmt(b: number) {
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`;
  if (b >= 1e9) return `${(b / 1e9).toFixed(b >= 1e11 ? 0 : 1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(b >= 1e8 ? 0 : 1)} MB`;
  return `${(b / 1e3).toFixed(0)} kB`;
}
const fmtTokens = (n: number) => (n >= 1024 ? `${n / 1024}k` : String(n));

// One decoding step streams every weight and the whole cache through the chip once.
const share = computed(() => cache(nkv.value) / (cache(nkv.value) + weights.value));
</script>

<template>
  <div class="gqa-cache">
    <div class="models" role="radiogroup" aria-label="Model">
      <button
        v-for="(m, i) in MODELS"
        :key="m.name"
        role="radio"
        :aria-checked="modelIdx === i"
        :class="{ on: modelIdx === i }"
        @click="modelIdx = i"
      >
        {{ m.name }}
      </button>
    </div>
    <p class="shape">
      {{ model.layers }} layers · {{ model.nq }} query heads · head dim {{ model.dHead }} · ships with
      <strong>{{ model.nkv }}</strong> K/V head{{ model.nkv > 1 ? 's' : '' }}
    </p>

    <div class="sliders">
      <label>
        <span>K/V heads</span>
        <select v-model.number="nkv">
          <option v-for="k in kvChoices" :key="k" :value="k">
            {{ k }}{{ k === model.nq ? ' (MHA)' : k === 1 ? ' (MQA)' : '' }}{{ k === model.nkv ? ' ← shipped' : '' }}
          </option>
        </select>
      </label>
      <label>
        <span>dtype</span>
        <select v-model.number="bytes">
          <option :value="2">bf16</option>
          <option :value="1">fp8</option>
        </select>
      </label>
      <label class="wide">
        <span>context</span>
        <input v-model.number="ctxLog" type="range" min="10" max="17" step="1" />
        <code>{{ fmtTokens(ctx) }} tokens</code>
      </label>
      <label class="wide">
        <span>batch</span>
        <input v-model.number="batchLog" type="range" min="0" max="6" step="1" />
        <code>{{ batch }} sequence{{ batch > 1 ? 's' : '' }}</code>
      </label>
    </div>

    <div class="bars">
      <div v-for="r in rows" :key="r.label" class="bar-row" :class="r.kind">
        <div class="bar-lbl">
          <span>{{ r.label }}</span><code>{{ fmt(r.value) }}</code>
        </div>
        <div class="track">
          <span :style="{ width: `${Math.max(0.4, (100 * r.value) / max)}%` }" />
        </div>
      </div>
    </div>

    <dl>
      <dt>cache per token</dt>
      <dd>
        <code>{{ fmt(perToken(nkv)) }}</code>
        <span class="muted"> vs <code>{{ fmt(perToken(model.nq)) }}</code> with MHA</span>
      </dd>
      <dt>cache share of each decode step's reads</dt>
      <dd>
        <code>{{ (share * 100).toFixed(0) }}%</code>
      </dd>
    </dl>
  </div>
</template>

<style scoped>
.gqa-cache {
  font-size: 0.92rem;
}
.models {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
button,
select {
  font: inherit;
  font-size: 0.85rem;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.25rem 0.55rem;
}
button {
  cursor: pointer;
}
button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.shape {
  margin: 0.5rem 0 0.9rem;
  color: var(--muted);
  font-size: 0.82rem;
}
.shape strong {
  color: var(--text);
}
.sliders {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem 1.25rem;
  margin-bottom: 1.1rem;
}
@media (max-width: 520px) {
  .sliders {
    grid-template-columns: minmax(0, 1fr);
  }
}
label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
label > span {
  color: var(--muted);
  width: 4.6rem;
  flex: none;
}
label select {
  flex: 1;
  min-width: 0;
}
label input {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}
label code {
  flex: none;
  width: 7.5rem;
  font-size: 0.8rem;
}
.bars {
  display: grid;
  gap: 0.6rem;
}
.bar-lbl {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.84rem;
}
.bar-lbl span {
  color: var(--muted);
}
.cur .bar-lbl span {
  color: var(--text);
  font-weight: 600;
}
.track {
  height: 12px;
  margin-top: 0.15rem;
  background: color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: 4px;
  overflow: hidden;
}
.track span {
  display: block;
  height: 100%;
  border-radius: 4px;
  transition: width 0.2s;
}
.w .track span {
  background: var(--muted);
}
.ref .track span {
  background: color-mix(in srgb, var(--accent) 35%, var(--surface));
}
.cur .track span {
  background: var(--accent);
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 1rem 0 0;
}
@media (max-width: 480px) {
  dl {
    grid-template-columns: 1fr;
    gap: 0.05rem;
  }
  dd {
    margin-bottom: 0.4rem !important;
  }
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
}
.muted {
  color: var(--muted);
}
</style>
