<script setup lang="ts">
// A thread-value (TV) layout: (thread, value) -> coordinate in a 4×8 tile. Composed with the
// tile's row-major memory layout it becomes (thread, value) -> address, which decides how wide
// each thread's loads can be and how many 32-byte sectors each load instruction touches.
import { computed, ref, watch } from 'vue';
import { type Layout, PALETTE, fmtLayout, mode, offset, parseLayout, rank, size } from '../cute';

const TM = 4;
const TN = 8;
const TILE = TM * TN;
const SECTOR = 8; // fp32 elements per 32-byte sector
const MAX_VEC = 4; // 4 × fp32 = 16 bytes, the widest load per thread

const PRESETS = [
  { name: 'thread per column', src: '(8,4):(4,1)' },
  { name: 'scattered', src: '((4,2),4):((1,4),8)' },
  { name: 'vectorised', src: '((2,4),4):((16,1),4)' },
];

const src = ref(PRESETS[0].src);
const step = ref(0);
const hover = ref<number | null>(null); // tile coordinate index (colex, m + 4n)

const parsed = computed<{ layout: Layout } | { error: string }>(() => {
  try {
    const l = parseLayout(src.value);
    if (rank(l) !== 2) return { error: 'a TV layout has two modes: (thread, value)' };
    if (size(l.shape) !== TILE) return { error: `threads × values must be ${TILE}, the size of the tile` };
    const seen = new Set<number>();
    for (let i = 0; i < TILE; i++) {
      const c = offset(l, i);
      if (c >= TILE) return { error: `maps outside the 4×8 tile (coordinate ${c})` };
      seen.add(c);
    }
    if (seen.size !== TILE) return { error: 'two (thread, value) pairs land on the same element' };
    return { layout: l };
  } catch (e) {
    return { error: (e as Error).message };
  }
});
let last = parseLayout(PRESETS[0].src);
const tv = computed(() => {
  const p = parsed.value;
  if ('layout' in p) last = p.layout;
  return last;
});
watch(
  () => fmtLayout(tv.value),
  () => (step.value = 0),
);
const error = computed(() => ('error' in parsed.value ? parsed.value.error : ''));

const T = computed(() => size(mode(tv.value, 0).shape));
const V = computed(() => size(mode(tv.value, 1).shape));

// Tile coordinate index c = m + 4n; the tile is row-major in memory: (4,8):(8,1).
const coordOf = (c: number) => ({ m: c % TM, n: Math.floor(c / TM) });
const addrOfCoord = (c: number) => {
  const { m, n } = coordOf(c);
  return m * TN + n;
};
const coord = (t: number, v: number) => offset(tv.value, t + T.value * v);
const addr = (t: number, v: number) => addrOfCoord(coord(t, v));

// Who owns each tile element.
const owner = computed(() => {
  const o: { t: number; v: number }[] = new Array(TILE);
  for (let v = 0; v < V.value; v++) for (let t = 0; t < T.value; t++) o[coord(t, v)] = { t, v };
  return o;
});

// Widest vector w (dividing V, at most MAX_VEC) such that each run of w values of a thread is contiguous.
const vec = computed(() => {
  let best = 1;
  for (let w = 2; w <= Math.min(MAX_VEC, V.value); w++) {
    if (V.value % w) continue;
    let ok = true;
    for (let t = 0; t < T.value && ok; t++)
      for (let v = 0; v < V.value && ok; v++) if (v % w && addr(t, v) !== addr(t, v - 1) + 1) ok = false;
    if (ok) best = w;
  }
  return best;
});
const loads = computed(() => V.value / vec.value);
const stepOf = (v: number) => Math.floor(v / vec.value);

function sectorsFor(s: number) {
  const set = new Set<number>();
  for (let t = 0; t < T.value; t++)
    for (let k = 0; k < vec.value; k++) set.add(Math.floor(addr(t, s * vec.value + k) / SECTOR));
  return set;
}
const perLoad = computed(() => Array.from({ length: loads.value }, (_, s) => sectorsFor(s).size));
const totalSectors = computed(() => perLoad.value.reduce((a, b) => a + b, 0));
const activeSectors = computed(() => sectorsFor(Math.min(step.value, loads.value - 1)));

const colour = (t: number) => PALETTE[t % PALETTE.length];
const inStep = (c: number) => stepOf(owner.value[c].v) === step.value;

// Memory slot a holds tile coordinate c with addrOfCoord(c) = a.
const coordAtAddr = (a: number) => (a % TN) * TM + Math.floor(a / TN);

const rows = Array.from({ length: TM }, (_, m) => m);
const colsN = Array.from({ length: TN }, (_, n) => n);
const cIdx = (m: number, n: number) => m + TM * n;
const sectors = Array.from({ length: TILE / SECTOR }, (_, s) => s);

const readout = computed(() => {
  if (hover.value === null) return null;
  const c = hover.value;
  const { t, v } = owner.value[c];
  const { m, n } = coordOf(c);
  return { t, v, m, n, a: addrOfCoord(c) };
});
</script>

<template>
  <div class="tvw">
    <div class="presets" role="group" aria-label="Example TV layouts">
      <button v-for="p in PRESETS" :key="p.name" :class="{ on: src === p.src }" @click="src = p.src">
        {{ p.name }}
      </button>
    </div>
    <label class="input">
      <span>tv_layout</span>
      <input v-model="src" spellcheck="false" autocomplete="off" aria-label="TV layout in shape:stride notation" />
    </label>
    <p class="err" :class="{ show: error }">{{ error || ' ' }}</p>

    <div class="views">
      <div class="view">
        <div class="cap">4×8 tile: who holds each element</div>
        <div class="tile">
          <template v-for="m in rows" :key="`r${m}`">
            <span
              v-for="n in colsN"
              :key="`c${m}-${n}`"
              class="cell"
              :class="{ act: inStep(cIdx(m, n)), hov: hover === cIdx(m, n) }"
              :style="{ '--c': colour(owner[cIdx(m, n)].t) }"
              @pointerenter="hover = cIdx(m, n)"
              @pointerleave="hover = null"
            >
              <b>T{{ owner[cIdx(m, n)].t }}</b><i>v{{ owner[cIdx(m, n)].v }}</i>
            </span>
          </template>
        </div>
      </div>

      <div class="view">
        <div class="cap">memory, row-major, in 32-byte sectors</div>
        <div class="mem">
          <div v-for="s in sectors" :key="`s${s}`" class="sector" :class="{ hit: activeSectors.has(s) }">
            <span
              v-for="k in SECTOR"
              :key="`a${s}-${k}`"
              class="slot"
              :class="{
                act: inStep(coordAtAddr(s * SECTOR + k - 1)),
                hov: hover === coordAtAddr(s * SECTOR + k - 1),
              }"
              :style="{ '--c': colour(owner[coordAtAddr(s * SECTOR + k - 1)].t) }"
              @pointerenter="hover = coordAtAddr(s * SECTOR + k - 1)"
              @pointerleave="hover = null"
            >
              {{ s * SECTOR + k - 1 }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="steps" role="radiogroup" aria-label="Load instruction">
      <span class="lbl">load</span>
      <button
        v-for="(n, s) in perLoad"
        :key="`l${s}`"
        role="radio"
        :aria-checked="step === s"
        :class="{ on: step === s }"
        @click="step = s"
      >
        {{ s + 1 }}<small>{{ n }} sector{{ n === 1 ? '' : 's' }}</small>
      </button>
    </div>

    <dl>
      <dt>per thread</dt>
      <dd>
        {{ V }} values, contiguous in runs of {{ vec }} → <code>{{ loads }}</code> load{{ loads === 1 ? '' : 's' }} of
        {{ vec * 4 }} bytes
      </dd>
      <dt>sectors fetched</dt>
      <dd>
        <code>{{ totalSectors }}</code> for 128 bytes of data (4 is the minimum)
      </dd>
      <dt>hovered</dt>
      <dd>
        <template v-if="readout">
          thread {{ readout.t }}, value {{ readout.v }} → coordinate ({{ readout.m }},{{ readout.n }}) → address
          {{ readout.a }}
        </template>
        <span v-else class="muted">hover an element</span>
      </dd>
    </dl>
  </div>
</template>

<style scoped>
.tvw {
  font-size: 0.9rem;
}
.presets,
.steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.steps {
  margin-top: 0.8rem;
}
.lbl {
  color: var(--muted);
  margin-right: 0.2rem;
}
button {
  font: inherit;
  font-size: 0.85rem;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.2rem 0.55rem;
  cursor: pointer;
}
button small {
  margin-left: 0.4rem;
  color: var(--muted);
  font-weight: 400;
}
button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.input {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.6rem;
}
.input span {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 0.85rem;
}
.input input {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-family: var(--mono);
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
}
.err {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  color: var(--danger);
  visibility: hidden;
}
.err.show {
  visibility: visible;
}
.views {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
  margin-top: 0.3rem;
}
@media (max-width: 560px) {
  .views {
    grid-template-columns: minmax(0, 1fr);
  }
}
.cap {
  color: var(--muted);
  font-size: 0.8rem;
  margin-bottom: 0.35rem;
}
.tile {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 2px;
}
.mem {
  display: grid;
  gap: 4px;
}
.sector {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 2px;
  padding: 2px;
  border: 1.5px dashed var(--border);
  border-radius: 5px;
}
.sector.hit {
  border: 1.5px solid var(--accent);
  background: var(--accent-soft);
}
.cell,
.slot {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  border: 1.5px solid transparent;
  background: color-mix(in srgb, var(--c) 14%, var(--surface));
  color: var(--muted);
  font-family: var(--mono);
  font-size: 0.68rem;
  line-height: 1.1;
  cursor: default;
  transition: background 0.15s;
}
.cell b {
  font-weight: 600;
}
.cell i {
  font-style: normal;
  font-size: 0.6rem;
}
.cell.act,
.slot.act {
  background: color-mix(in srgb, var(--c) 60%, var(--surface));
  color: var(--text);
}
.cell.hov,
.slot.hov {
  border-color: var(--text);
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.3rem 1rem;
  margin: 0.8rem 0 0;
}
@media (max-width: 480px) {
  dl {
    grid-template-columns: 1fr;
    gap: 0.1rem;
  }
  dd {
    margin-bottom: 0.4rem !important;
  }
}
dt,
.muted {
  color: var(--muted);
}
dd {
  margin: 0;
  min-height: 1.4em;
}
code {
  font-family: var(--mono);
}
</style>
