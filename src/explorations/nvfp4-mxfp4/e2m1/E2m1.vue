<script setup lang="ts">
// All sixteen FP4 (E2M1) codes: click one to see how its bits decode, and where it sits on the line.
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';
import { E2M1 } from '../fp4';

const codes = Array.from({ length: 16 }, (_, c) => {
  const s = c >> 3;
  const e = (c >> 1) & 3;
  const m = c & 1;
  return { c, s, e, m, value: (s ? -1 : 1) * E2M1[c & 7] };
});

const sel = ref(13); // 1 10 1 → −3
const cur = computed(() => codes[sel.value]);

const decode = computed(() => {
  const { s, e, m, value } = cur.value;
  const v = Object.is(value, -0) ? '-0' : String(value);
  if (e === 0) return `(-1)^{${s}} \\times 2^{0} \\times 0.${m}_2 = ${v}`;
  return `(-1)^{${s}} \\times 2^{${e} - 1} \\times 1.${m}_2 = ${v}`;
});

// Number line geometry.
const W = 600;
const PAD = 24;
const x = (v: number) => PAD + ((v + 6) / 12) * (W - 2 * PAD);
const ticks = [-6, -4, -3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4, 6];
</script>

<template>
  <div class="e2m1">
    <div class="grid" role="group" aria-label="The sixteen FP4 codes">
      <button v-for="k in codes" :key="k.c" :class="{ on: k.c === sel }" @click="sel = k.c">
        <span class="bits"
          ><span class="s">{{ k.s }}</span><span class="e">{{ k.e >> 1 }}{{ k.e & 1 }}</span
          ><span class="m">{{ k.m }}</span></span
        >
        <span class="val">{{ Object.is(k.value, -0) ? '−0' : String(k.value).replace('-', '−') }}</span>
      </button>
    </div>
    <div class="legend">
      <span class="s">sign</span>
      <span class="e">exponent · 2 bits</span>
      <span class="m">mantissa · 1 bit</span>
    </div>

    <p class="formula">
      <Tex :t="decode" />
      <span class="kind">{{ cur.e === 0 ? 'subnormal' : 'normal' }}</span>
    </p>

    <svg :viewBox="`0 0 ${W} 64`" role="img" aria-label="The fifteen distinct FP4 values on a number line">
      <line :x1="PAD" :x2="W - PAD" y1="28" y2="28" stroke="var(--border)" />
      <g v-for="t in ticks" :key="t">
        <line :x1="x(t)" :x2="x(t)" y1="18" y2="38" stroke="var(--accent)" stroke-width="1.5" />
        <text v-if="Number.isInteger(t)" :x="x(t)" class="lbl" y="56" text-anchor="middle" fill="var(--muted)">
          {{ String(t).replace('-', '−') }}
        </text>
      </g>
      <circle :cx="x(cur.value)" cy="28" r="7" fill="var(--danger)" />
    </svg>
  </div>
</template>

<style scoped>
.e2m1 {
  font-size: 0.92rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 4px;
}
@media (max-width: 480px) {
  .grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.35rem 0;
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}
button.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.bits {
  font-family: var(--mono);
  font-size: 0.8rem;
  letter-spacing: 0.05em;
}
.val {
  font-family: var(--mono);
  font-weight: 600;
}
.s {
  color: #d0562f;
}
.e {
  color: #2f8f5f;
}
.m {
  color: var(--accent);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 1rem;
  margin-top: 0.4rem;
  font-size: 0.78rem;
}
.formula {
  margin: 0.9rem 0 0.25rem;
}
.kind {
  margin-left: 0.5rem;
  padding: 0 0.4rem;
  border-radius: 4px;
  font-size: 0.75rem;
  background: var(--accent-soft);
  color: var(--accent);
}
.lbl {
  font-size: 12px;
}
@media (max-width: 480px) {
  .lbl {
    font-size: 20px;
  }
}
svg {
  width: 100%;
  height: auto;
  display: block;
}
</style>
