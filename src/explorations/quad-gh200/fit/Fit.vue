<script setup lang="ts">
// Where a model's weights land on the node, and what that does to the fastest possible decode step.
// Weights fill memory in order of bandwidth from the GPUs doing the work: their own HBM, then their
// own Grace's LPDDR5X over C2C, then idle superchips' memory over NVLink. Each token has to stream
// every weight once, and the three channels run in parallel, so the step is bounded by the slowest tier.
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';
import { BW, CAP, N, fmtGB, fmtTime } from '../specs';

const slider = ref(66); // log scale, 1B .. 2T parameters
const params = computed(() => 10 ** (9 + (slider.value / 100) * Math.log10(2000)));
const bytes = ref(2);
const gpus = ref(4);

const presets = [
  { label: '8B', p: 8e9 },
  { label: '70B', p: 70e9 },
  { label: '405B', p: 405e9 },
  { label: '671B', p: 671e9 },
];
function setParams(p: number) {
  slider.value = ((Math.log10(p) - 9) / Math.log10(2000)) * 100;
}

const fmtParams = (p: number) => (p >= 1e12 ? `${(p / 1e12).toPrecision(2)}T` : `${(p / 1e9).toPrecision(p < 1e10 ? 2 : 3)}B`);

interface Tier {
  name: string;
  cap: number; // GB available to each working GPU
  bw: number; // GB/s each working GPU can pull from it
  used: number;
}

const tiers = computed<Tier[]>(() => {
  const g = gpus.value;
  const idle = N - g;
  const t: Tier[] = [
    { name: 'own HBM3', cap: CAP.hbm, bw: BW.hbm, used: 0 },
    { name: 'own LPDDR5X, over C2C', cap: CAP.lpddr, bw: BW.c2c, used: 0 },
  ];
  if (idle > 0) {
    // Each working GPU gets its share of the idle superchips' memory, over 150 GB/s per idle peer.
    t.push({ name: `idle HBM3, over NVLink`, cap: (idle * CAP.hbm) / g, bw: BW.nvPeer * idle, used: 0 });
    t.push({ name: `idle LPDDR5X, over NVLink + C2C`, cap: (idle * CAP.lpddr) / g, bw: BW.nvPeer * idle, used: 0 });
  }
  let left = (params.value * bytes.value) / 1e9 / g;
  for (const tier of t) {
    tier.used = Math.min(tier.cap, left);
    left -= tier.used;
  }
  return t;
});

const totalGB = computed(() => (params.value * bytes.value) / 1e9);
const perGpu = computed(() => totalGB.value / gpus.value);
const capacity = computed(() => tiers.value.reduce((s, t) => s + t.cap, 0));
const fits = computed(() => perGpu.value <= capacity.value + 1e-9);

const times = computed(() => tiers.value.map((t) => t.used / t.bw));
const step = computed(() => Math.max(...times.value));
const binding = computed(() => times.value.indexOf(step.value));
const idealStep = computed(() => perGpu.value / BW.hbm);
const nodesNeeded = computed(() => Math.ceil(totalGB.value / (N * (CAP.hbm + CAP.lpddr))));
</script>

<template>
  <div class="fit">
    <div class="ctl">
      <label>
        <span>parameters</span>
        <input v-model.number="slider" type="range" min="0" max="100" step="0.25" />
        <output>{{ fmtParams(params) }}</output>
      </label>
      <div class="seg">
        <button v-for="p in presets" :key="p.label" type="button" @click="setParams(p.p)">{{ p.label }}</button>
      </div>
    </div>
    <div class="ctl">
      <div class="seg" role="group" aria-label="Bytes per parameter">
        <button :aria-pressed="bytes === 1" @click="bytes = 1">FP8</button>
        <button :aria-pressed="bytes === 2" @click="bytes = 2">BF16</button>
        <button :aria-pressed="bytes === 4" @click="bytes = 4">FP32</button>
      </div>
      <div class="seg" role="group" aria-label="GPUs working">
        <span class="lbl">GPUs working</span>
        <button v-for="g in [1, 2, 4]" :key="g" :aria-pressed="gpus === g" @click="gpus = g">{{ g }}</button>
      </div>
    </div>

    <p class="sum">
      <b>{{ fmtGB(totalGB) }}</b> of weights, <b>{{ fmtGB(perGpu) }}</b> per working GPU.
      <template v-if="!fits">
        <span class="bad">Doesn't fit: the node holds {{ fmtGB(N * (CAP.hbm + CAP.lpddr)) }}; this needs {{ nodesNeeded }} nodes.</span>
      </template>
    </p>

    <div class="tiers">
      <div v-for="(t, k) in tiers" :key="t.name" class="tier" :class="{ bound: k === binding && t.used > 0, binding: k === binding && k > 0 && t.used > 0, empty: t.used === 0 }">
        <span class="tname">
          {{ t.name }}
          <small>{{ fmtGB(t.cap) }} per GPU at {{ t.bw >= 1000 ? `${t.bw / 1000} TB/s` : `${t.bw} GB/s` }}</small>
        </span>
        <span class="cap">
          <i :style="{ width: `${(100 * t.used) / t.cap}%` }" />
          <em v-if="t.used > 0"><span>{{ fmtGB(t.used) }}</span></em>
        </span>
        <span class="t mono">{{ t.used > 0 ? fmtTime(t.used / t.bw) : '—' }}</span>
      </div>
    </div>

    <dl class="stats" v-if="fits">
      <div>
        <dt>time per token, lower bound</dt>
        <dd>{{ fmtTime(step) }}</dd>
      </div>
      <div>
        <dt>tokens / s, upper bound</dt>
        <dd>{{ step > 0 ? (1 / step).toPrecision(2) : '—' }}</dd>
      </div>
      <div>
        <dt>if it all sat in HBM</dt>
        <dd>{{ idealStep > 0 ? (1 / idealStep).toPrecision(2) : '—' }} <span class="muted">tok/s</span></dd>
      </div>
      <div>
        <dt>cost of spilling</dt>
        <dd>{{ idealStep > 0 ? `${(step / idealStep).toPrecision(2)}×` : '—' }}</dd>
      </div>
    </dl>
    <p class="foot">
      Per working GPU: <Tex t="t_\text{token} \ge \max_\text{tier} \dfrac{\text{bytes in tier}}{\text{bandwidth of tier}}" />.
      Weights only; the KV cache, activations and the all-reduce between GPUs come on top.
    </p>
  </div>
</template>

<style scoped>
.fit {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem 1rem;
  color: var(--muted);
  margin-bottom: 0.4rem;
}
label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.6rem;
}
output {
  font-family: var(--mono);
  color: var(--text);
  min-width: 4ch;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}
.lbl {
  font-size: 0.8rem;
  margin-right: 0.2rem;
}
button {
  font: inherit;
  font-size: 0.82rem;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.2rem 0.55rem;
  cursor: pointer;
}
button[aria-pressed='true'] {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.sum {
  margin: 0.5rem 0;
}
.bad {
  color: var(--danger);
}
.tiers {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.tier {
  display: grid;
  grid-template-columns: minmax(8rem, 1.3fr) minmax(0, 2fr) 4.5rem;
  gap: 0.6rem;
  align-items: center;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.tier.bound {
  border-color: var(--accent);
}
.tier.binding {
  border-color: var(--danger);
}
.tier.empty {
  opacity: 0.55;
}
.tname {
  line-height: 1.25;
}
.tname small {
  display: block;
  color: var(--muted);
  font-size: 0.75rem;
}
.cap {
  position: relative;
  height: 1.3rem;
  background: color-mix(in srgb, var(--muted) 8%, transparent);
  border-radius: 3px;
}
.cap i {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.15s;
}
.binding .cap i {
  background: var(--danger);
}
.cap em {
  position: absolute;
  inset: 0 0.4rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-style: normal;
  font-family: var(--mono);
  font-size: 0.75rem;
}
.cap em span {
  padding: 0 0.3rem;
  border-radius: 3px;
  background: color-mix(in srgb, var(--surface) 85%, transparent);
}
.t {
  text-align: right;
}
.mono {
  font-family: var(--mono);
  font-size: 0.85rem;
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: 0.5rem;
  margin: 0.75rem 0 0;
}
.stats div {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
}
dt {
  font-size: 0.75rem;
  color: var(--muted);
}
dd {
  margin: 0;
  font-family: var(--mono);
  font-size: 1.05rem;
}
.muted {
  color: var(--muted);
  font-size: 0.8rem;
}
.foot {
  margin: 0.75rem 0 0;
  font-size: 0.82rem;
  color: var(--muted);
}
@media (max-width: 520px) {
  .tier {
    grid-template-columns: minmax(6rem, 1fr) minmax(0, 1.2fr) 4rem;
    gap: 0.4rem;
  }
}
</style>
