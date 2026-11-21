<script setup lang="ts">
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';

type Prec = 'f16' | 'f32' | 'f64';

/** Round to the nearest IEEE half-precision value (ties to even), returned as a JS number. */
function f16(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const sign = Math.sign(x);
  const a = Math.abs(x);
  if (a >= 65520) return sign * Infinity; // halfway between max (65504) and the next power of 2 rounds up
  const e = Math.max(Math.floor(Math.log2(a)), -14);
  const q = 2 ** (e - 10); // spacing of half-precision values near a
  const n = a / q;
  let r = Math.round(n);
  if (Math.abs(n - Math.trunc(n) - 0.5) < 1e-12 && r % 2 === 1) r -= 1; // ties to even
  return sign * r * q;
}

const ROUND: Record<Prec, (x: number) => number> = { f16, f32: Math.fround, f64: (x) => x };
const INFO: Record<Prec, { name: string; max: string; over: number; under: number }> = {
  f16: { name: 'float16', max: '65504', over: 11.09, under: -17.33 },
  f32: { name: 'float32', max: '3.4\\times 10^{38}', over: 88.72, under: -103.28 },
  f64: { name: 'float64', max: '1.8\\times 10^{308}', over: 709.78, under: -744.44 },
};

const BASE = [3, 1, 0.2];
const prec = ref<Prec>('f32');
const c = ref(0);

// Cubic slider so small offsets get room and the float64 limits are still reachable.
const C_MAX = 800;
const slider = computed({
  get: () => Math.sign(c.value) * Math.cbrt(Math.abs(c.value) / C_MAX),
  set: (s: number) => (c.value = Math.sign(s) * Math.round(C_MAX * Math.abs(s) ** 3)),
});

const presets = computed(() => {
  const i = INFO[prec.value];
  return [0, Math.ceil(i.over - BASE[0]), Math.floor(i.under - BASE[0]) - 1, 1000].filter((v, k, a) => a.indexOf(v) === k);
});

const run = computed(() => {
  const R = ROUND[prec.value];
  const shift = Number(c.value) || 0; // the number input can briefly hold ''
  const x = BASE.map((b) => R(b + shift));

  const ex = x.map((v) => R(Math.exp(v)));
  let sum = 0;
  for (const v of ex) sum = R(sum + v);
  const naive = ex.map((v) => R(v / sum));

  const m = Math.max(...x);
  const d = x.map((v) => R(v - m));
  const ed = d.map((v) => R(Math.exp(v)));
  let sumS = 0;
  for (const v of ed) sumS = R(sumS + v);
  const stable = ed.map((v) => R(v / sumS));

  return { x, ex, sum, naive, m, d, ed, sumS, stable };
});

const bad = (v: number) => !Number.isFinite(v) || Number.isNaN(v);
function fmt(v: number) {
  if (Number.isNaN(v)) return '\\text{NaN}';
  if (v === Infinity) return '\\infty';
  if (v === -Infinity) return '-\\infty';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) {
    const [mant, e] = v.toExponential(2).split('e');
    return `${mant}\\times 10^{${Number(e)}}`;
  }
  return Number(v.toPrecision(4)).toString();
}
const cls = (v: number, zeroBad = false) => ({ bad: bad(v) || (zeroBad && v === 0) });
</script>

<template>
  <div class="st">
    <div class="ctl">
      <div class="seg" role="radiogroup" aria-label="Floating-point format">
        <button v-for="k in ['f16', 'f32', 'f64'] as Prec[]" :key="k" :class="{ on: prec === k }" @click="prec = k">
          {{ INFO[k].name }}
        </button>
      </div>
      <label class="off">
        <span>shift <Tex t="c" /></span>
        <input type="range" min="-1" max="1" step="0.001" v-model.number="slider" aria-label="Shift added to every logit" />
        <input type="number" class="num" v-model.number="c" aria-label="Shift value" />
      </label>
    </div>
    <div class="presets">
      <span class="hint">try</span>
      <button v-for="v in presets" :key="v" @click="c = v">c = {{ v }}</button>
    </div>
    <p class="note">
      logits <Tex :t="`z = (${BASE.join(', ')}) + c`" />. Largest finite {{ INFO[prec].name }}:
      <Tex :t="INFO[prec].max" />, so <Tex t="e^x" /> overflows above <Tex :t="`x \\approx ${INFO[prec].over}`" />
      and underflows to 0 below <Tex :t="`x \\approx ${INFO[prec].under}`" />.
    </p>

    <div class="cards">
      <section class="card">
        <h4>naive</h4>
        <table>
          <thead>
            <tr>
              <th><Tex t="z_i" /></th>
              <th><Tex t="e^{z_i}" /></th>
              <th><Tex t="p_i" /></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(_, i) in BASE" :key="i">
              <td><Tex :t="fmt(run.x[i])" /></td>
              <td :class="cls(run.ex[i], true)"><Tex :t="fmt(run.ex[i])" /></td>
              <td :class="cls(run.naive[i])"><Tex :t="fmt(run.naive[i])" /></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td><Tex t="\Sigma" /></td>
              <td :class="cls(run.sum, true)"><Tex :t="fmt(run.sum)" /></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </section>
      <section class="card">
        <h4>subtract the max first</h4>
        <table>
          <thead>
            <tr>
              <th><Tex t="z_i - \max z" /></th>
              <th><Tex t="e^{z_i - \max z}" /></th>
              <th><Tex t="p_i" /></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(_, i) in BASE" :key="i">
              <td><Tex :t="fmt(run.d[i])" /></td>
              <td :class="cls(run.ed[i])"><Tex :t="fmt(run.ed[i])" /></td>
              <td :class="cls(run.stable[i])"><Tex :t="fmt(run.stable[i])" /></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td><Tex t="\Sigma" /></td>
              <td :class="cls(run.sumS)"><Tex :t="fmt(run.sumS)" /></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  </div>
</template>

<style scoped>
.st {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  justify-content: space-between;
  align-items: center;
}
button {
  font: inherit;
  font-size: 0.85rem;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.25rem 0.55rem;
  cursor: pointer;
}
.seg {
  display: inline-flex;
}
.seg button {
  border-radius: 0;
}
.seg button + button {
  border-left: none;
}
.seg button:first-child {
  border-radius: 6px 0 0 6px;
}
.seg button:last-child {
  border-radius: 0 6px 6px 0;
}
.seg button.on {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
}
.off {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
}
.off input[type='range'] {
  width: 8rem;
}
.num {
  font: inherit;
  font-family: var(--mono);
  font-size: 0.82rem;
  width: 4.5rem;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.15rem 0.3rem;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.5rem;
}
.hint {
  color: var(--muted);
  font-size: 0.8rem;
  margin-right: 0.2rem;
}
.presets button {
  font-family: var(--mono);
  font-size: 0.78rem;
}
.note {
  color: var(--muted);
  font-size: 0.82rem;
  margin: 0.6rem 0;
  line-height: 1.6;
}
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.card {
  flex: 1 1 260px;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  padding: 0.5rem 0.6rem;
}
h4 {
  margin: 0 0 0.3rem;
  font-size: 0.85rem;
  font-weight: 600;
}
table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 0.8rem;
}
th {
  font-weight: normal;
  color: var(--muted);
  text-align: right;
  padding: 0.15rem 0.2rem;
  white-space: nowrap;
}
td {
  text-align: right;
  padding: 0.15rem 0.2rem;
  white-space: nowrap;
  overflow: hidden;
}
tfoot td {
  border-top: 1px solid var(--border);
}
td.bad {
  color: var(--danger);
  font-weight: 600;
}
</style>
