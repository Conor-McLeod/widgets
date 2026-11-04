<script setup lang="ts">
// CuTe's Swizzle<B, M, S> as a bit operation on an offset: take B bits starting at bit M + S and
// XOR them into the B bits starting at bit M. The grid lays offsets out in rows of 2^S units
// (a unit is 2^M elements) and shows which column each unit lands in.
import { computed, ref, watch } from 'vue';
import Tex from '~/math/Tex.vue';

const B = ref(3);
const M = ref(3);
const S = ref(3);
const ROWS = 8;

const presets = [
  { b: 3, m: 3, s: 3, label: '128 B, 16-bit elements' },
  { b: 3, m: 2, s: 3, label: '128 B, 32-bit elements' },
  { b: 3, m: 4, s: 3, label: '128 B, byte offsets' },
  { b: 2, m: 3, s: 3, label: '64 B, 16-bit' },
  { b: 1, m: 3, s: 3, label: '32 B, 16-bit' },
];

// CuTe requires S >= B so the source and target bit ranges don't overlap.
watch(B, (b) => {
  if (S.value < b) S.value = b;
});
watch(S, (s) => {
  if (B.value > s) B.value = s;
});

const cols = computed(() => 1 << S.value);
const unit = computed(() => 1 << M.value);
const yyy = computed(() => ((1 << B.value) - 1) << (M.value + S.value));
const swz = (o: number) => o ^ ((o & yyy.value) >> S.value);

const sel = ref<[number, number]>([5, 2]);
watch(cols, (n) => {
  if (sel.value[1] >= n) sel.value = [sel.value[0], n - 1];
});

/** Column (in units) that logical unit (r, c) is moved to. */
const dest = (r: number, c: number) => (swz((r * cols.value + c) * unit.value) / unit.value) % cols.value;

const nbits = computed(() => M.value + S.value + 3);
const offset = computed(() => (sel.value[0] * cols.value + sel.value[1]) * unit.value);
const mixed = computed(() => (offset.value & yyy.value) >> S.value);
const result = computed(() => swz(offset.value));

type Role = 'low' | 'z' | 'y' | 'mid';
function role(i: number): Role {
  if (i < M.value) return 'low';
  if (i < M.value + B.value) return 'z';
  if (i >= M.value + S.value && i < M.value + S.value + B.value) return 'y';
  return 'mid';
}
const bitsOf = (v: number) =>
  Array.from({ length: nbits.value }, (_, k) => {
    const i = nbits.value - 1 - k;
    return { i, v: (v >> i) & 1, role: role(i) };
  });

const shade = (c: number) => `color-mix(in srgb, var(--accent) ${Math.round(8 + (72 * c) / Math.max(1, cols.value - 1))}%, var(--surface))`;
</script>

<template>
  <div class="sz">
    <div class="ctl">
      <label>
        <span><Tex t="B" /> = {{ B }}</span>
        <input v-model.number="B" type="range" min="0" max="3" step="1" aria-label="B, number of bits" />
      </label>
      <label>
        <span><Tex t="M" /> = {{ M }}</span>
        <input v-model.number="M" type="range" min="0" max="4" step="1" aria-label="M, base bits" />
      </label>
      <label>
        <span><Tex t="S" /> = {{ S }}</span>
        <input v-model.number="S" type="range" min="1" max="4" step="1" aria-label="S, shift" />
      </label>
    </div>
    <div class="presets">
      <button
        v-for="p in presets"
        :key="p.label"
        :aria-pressed="B === p.b && M === p.m && S === p.s"
        @click="(B = p.b), (S = p.s), (M = p.m)"
      >
        <Tex :t="`\\langle ${p.b},${p.m},${p.s}\\rangle`" /> <span class="muted">{{ p.label }}</span>
      </button>
    </div>

    <p class="head">
      <Tex :t="`\\text{Swizzle}\\langle ${B},${M},${S}\\rangle`" />: a unit is <Tex :t="`2^{${M}} = ${unit}`" /> element{{ unit > 1 ? 's' : '' }},
      a row is <Tex :t="`2^{${S}} = ${cols}`" /> unit{{ cols > 1 ? 's' : '' }}. Each cell shows the column its unit moves to.
    </p>

    <div class="grid" :style="{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }">
      <template v-for="r in ROWS" :key="r">
        <button
          v-for="c in cols"
          :key="c"
          class="u"
          :class="{ focus: sel[0] === r - 1 && sel[1] === c - 1 }"
          :style="{ background: shade(dest(r - 1, c - 1)), color: dest(r - 1, c - 1) > cols / 2 ? 'var(--bg)' : 'var(--text)' }"
          :aria-label="`row ${r - 1} unit ${c - 1} moves to column ${dest(r - 1, c - 1)}`"
          @click="sel = [r - 1, c - 1]"
        >
          {{ dest(r - 1, c - 1) }}
        </button>
      </template>
    </div>

    <div class="bitbox">
      <div class="brow">
        <span class="nm">offset</span>
        <span class="bits">
          <i v-for="b in bitsOf(offset)" :key="b.i" :class="b.role">{{ b.v }}</i>
        </span>
        <span class="dec">{{ offset }}</span>
      </div>
      <div class="brow">
        <span class="nm"><Tex :t="`\\gg ${S}`" /></span>
        <span class="bits">
          <i v-for="b in bitsOf(mixed)" :key="b.i" :class="b.role === 'z' ? 'z' : 'off'">{{ b.v }}</i>
        </span>
        <span class="dec">{{ mixed }}</span>
      </div>
      <div class="brow out">
        <span class="nm"><Tex t="\oplus" /></span>
        <span class="bits">
          <i v-for="b in bitsOf(result)" :key="b.i" :class="b.role">{{ b.v }}</i>
        </span>
        <span class="dec">{{ result }}</span>
      </div>
      <div class="legend">
        <span><i class="y" /> source bits <Tex :t="`[${M + S}, ${M + S + B})`" /> (row)</span>
        <span><i class="z" /> target bits <Tex :t="`[${M}, ${M + B})`" /> (column)</span>
        <span><i class="low" /> untouched: inside a unit</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sz {
  font-size: 0.9rem;
}
.ctl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: 0.4rem 1rem;
}
.ctl label {
  display: flex;
  flex-direction: column;
  font-family: var(--mono);
  font-size: 0.8rem;
}
.ctl input {
  width: 100%;
  accent-color: var(--accent);
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.6rem;
}
button {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.2rem 0.55rem;
  cursor: pointer;
}
.presets button {
  font-size: 0.78rem;
}
button[aria-pressed='true'] {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.muted {
  color: var(--muted);
}
.head {
  font-size: 0.82rem;
  margin: 0.8rem 0 0.5rem;
}
.grid {
  display: grid;
  gap: 2px;
}
.u {
  font-family: var(--mono);
  font-size: 0.7rem;
  height: 1.5rem;
  padding: 0;
  border: none;
  border-radius: 3px;
  min-width: 0;
}
.u.focus {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.bitbox {
  margin-top: 1rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.6rem;
  overflow-x: auto;
}
.brow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.brow.out {
  border-top: 1px solid var(--border);
  padding-top: 0.3rem;
}
.nm {
  width: 3.2rem;
  flex: none;
  font-size: 0.75rem;
  color: var(--muted);
  text-align: right;
}
.bits {
  display: flex;
  gap: 2px;
}
.bits i,
.legend i {
  font-style: normal;
  font-family: var(--mono);
  font-size: 0.72rem;
  width: 1.05rem;
  height: 1.3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  border: 1px solid var(--border);
}
.bits i.low,
.legend i.low {
  color: var(--muted);
  background: color-mix(in srgb, var(--muted) 12%, transparent);
}
.bits i.z,
.legend i.z {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.bits i.y,
.legend i.y {
  border: 2px solid var(--accent);
}
.bits i.off {
  color: var(--muted);
  opacity: 0.45;
}
.dec {
  font-family: var(--mono);
  font-size: 0.8rem;
  color: var(--muted);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--muted);
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.legend i {
  width: 0.8rem;
  height: 0.8rem;
}
</style>
