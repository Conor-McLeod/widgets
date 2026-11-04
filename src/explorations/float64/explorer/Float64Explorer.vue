<script setup lang="ts">
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';

const buf = new DataView(new ArrayBuffer(8));

function toBits(x: number): bigint {
  buf.setFloat64(0, x);
  return buf.getBigUint64(0);
}
function fromBits(b: bigint): number {
  buf.setBigUint64(0, BigInt.asUintN(64, b));
  return buf.getFloat64(0);
}

const bits = ref(toBits(0.1));
const input = ref('0.1');

const value = computed(() => fromBits(bits.value));
const sign = computed(() => Number(bits.value >> 63n));
const expField = computed(() => Number((bits.value >> 52n) & 0x7ffn));
const mantField = computed(() => bits.value & ((1n << 52n) - 1n));

const kind = computed(() => {
  if (expField.value === 0x7ff) return mantField.value === 0n ? 'infinity' : 'NaN';
  if (expField.value === 0) return mantField.value === 0n ? 'zero' : 'subnormal';
  return 'normal';
});

// Unbiased exponent and the implicit leading digit (1 for normals, 0 for subnormals).
const exponent = computed(() => (kind.value === 'subnormal' ? -1022 : expField.value - 1023));
const lead = computed(() => (kind.value === 'normal' ? 1 : 0));
const fraction = computed(() => Number(mantField.value) / 2 ** 52);

const ulp = computed(() => {
  const v = value.value;
  if (!Number.isFinite(v)) return NaN;
  return Math.abs(fromBits(toBits(Math.abs(v)) + 1n) - Math.abs(v));
});

const cells = computed(() =>
  Array.from({ length: 64 }, (_, i) => {
    const pos = 63 - i;
    return {
      pos,
      on: ((bits.value >> BigInt(pos)) & 1n) === 1n,
      field: pos === 63 ? 'sign' : pos >= 52 ? 'exp' : 'mant',
    };
  }),
);

function flip(pos: number) {
  bits.value ^= 1n << BigInt(pos);
  input.value = String(value.value);
}

function commit() {
  const x = Number(input.value);
  if (!Number.isNaN(x) || input.value.trim().toLowerCase() === 'nan') bits.value = toBits(x);
}

function step(d: 1n | -1n) {
  bits.value += d;
  input.value = String(value.value);
}

const exact = computed(() => {
  const v = value.value;
  if (!Number.isFinite(v)) return String(v);
  // toPrecision(60) shows the exact binary value's decimal expansion out to 60 digits.
  return Math.abs(v) < 1e-300 || Math.abs(v) > 1e300 ? v.toExponential(20) : v.toPrecision(60).replace(/0+$/, '');
});
</script>

<template>
  <div class="f64">
    <label class="row">
      <span>value</span>
      <input v-model="input" @change="commit" @keydown.enter="commit" spellcheck="false" />
      <button @click="step(-1n)" title="Previous representable float">−1 ulp</button>
      <button @click="step(1n)" title="Next representable float">+1 ulp</button>
    </label>

    <div class="bits" role="group" aria-label="64 bits, click to flip">
      <button
        v-for="c in cells"
        :key="c.pos"
        :class="[c.field, { on: c.on }]"
        :title="`bit ${c.pos}`"
        @click="flip(c.pos)"
      >
        {{ c.on ? 1 : 0 }}
      </button>
    </div>
    <div class="legend">
      <span class="sign">sign</span>
      <span class="exp">exponent · 11 bits</span>
      <span class="mant">mantissa · 52 bits</span>
    </div>

    <p class="formula">
      <template v-if="kind === 'normal' || kind === 'subnormal' || kind === 'zero'">
        <Tex :t="`(-1)^{${sign}} \\times ${(lead + fraction).toPrecision(17)} \\times 2^{${exponent}}`" />
      </template>
      <template v-else>exponent field all ones → {{ kind }}</template>
      <span class="kind">{{ kind }}</span>
    </p>

    <dl>
      <dt>stored exactly as</dt>
      <dd>
        <code>{{ exact }}</code>
      </dd>
      <dt>exponent field</dt>
      <dd>
        <code>{{ expField }}</code> − 1023 = <code>{{ expField - 1023 }}</code>
      </dd>
      <dt>gap to next float (ulp)</dt>
      <dd>
        <code>{{ ulp.toExponential(4) }}</code>
      </dd>
    </dl>
  </div>
</template>

<style scoped>
.f64 {
  font-size: 0.92rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.row span {
  color: var(--muted);
}
input {
  flex: 1 1 10rem;
  min-width: 0;
  padding: 0.35rem 0.5rem;
  font: inherit;
  font-family: var(--mono);
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
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
.bits {
  display: grid;
  grid-template-columns: repeat(32, minmax(0, 1fr));
  gap: 2px;
}
@media (max-width: 560px) {
  .bits {
    grid-template-columns: repeat(16, minmax(0, 1fr));
  }
}
.bits button {
  padding: 0.2rem 0;
  border-radius: 3px;
  font-family: var(--mono);
  font-size: 0.72rem;
  border-color: transparent;
  opacity: 0.45;
}
.bits button.on {
  opacity: 1;
  font-weight: 600;
}
.sign {
  --c: #d0562f;
}
.exp {
  --c: #2f8f5f;
}
.mant {
  --c: #2f5fd0;
}
.bits button {
  background: color-mix(in srgb, var(--c) 18%, transparent);
}
.bits button.on {
  background: color-mix(in srgb, var(--c) 45%, transparent);
}
.legend {
  display: flex;
  gap: 1rem;
  margin-top: 0.4rem;
  font-size: 0.78rem;
}
.legend span {
  color: var(--c);
}
.formula {
  margin: 1rem 0 0.5rem;
  font-family: var(--mono);
  overflow-wrap: break-word;
}
.kind {
  margin-left: 0.5rem;
  padding: 0 0.4rem;
  border-radius: 4px;
  font-size: 0.75rem;
  background: var(--accent-soft);
  color: var(--accent);
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
