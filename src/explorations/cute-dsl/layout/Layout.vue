<script setup lang="ts">
// A rank-2 CuTe layout drawn two ways: as the logical (row, column) grid, with each cell showing
// the offset the layout sends it to, and as the strip of memory those offsets land in.
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';
import { type IntTuple, type Layout, cosize, flatten, fmtLayout, mode, offset, parseLayout, rank, size } from '../cute';

const PRESETS = [
  { name: 'column-major', src: '(4,8):(1,4)' },
  { name: 'row-major', src: '(4,8):(8,1)' },
  { name: 'padded', src: '(4,8):(1,5)' },
  { name: 'broadcast', src: '(4,8):(0,1)' },
  { name: '2×2 blocks', src: '((2,2),(2,4)):((1,4),(2,8))' },
];
const MAX_SIDE = 16;
const MAX_SIZE = 128;
const MAX_COSIZE = 160;

const src = ref(PRESETS[0].src);
const hoverCell = ref<number | null>(null); // 1-D (colex) index into the grid
const hoverSlot = ref<number | null>(null); // memory offset

const parsed = computed<{ layout: Layout } | { error: string }>(() => {
  try {
    const l = parseLayout(src.value);
    if (rank(l) > 2) return { error: 'this view draws rank-1 or rank-2 layouts' };
    const lay: Layout = rank(l) === 1 ? { shape: [l.shape, 1], stride: [l.stride, 0] } : l;
    const [m, n] = [size(mode(lay, 0).shape), size(mode(lay, 1).shape)];
    if (m > MAX_SIDE || n > MAX_SIDE) return { error: `keep each mode at ${MAX_SIDE} or fewer elements` };
    if (m * n > MAX_SIZE) return { error: `keep the size at ${MAX_SIZE} or fewer` };
    if (cosize(lay) > MAX_COSIZE) return { error: `the largest offset must stay under ${MAX_COSIZE}` };
    return { layout: lay };
  } catch (e) {
    return { error: (e as Error).message };
  }
});

// Keep showing the last good layout while the text is being edited.
let last: Layout = parseLayout(PRESETS[0].src);
const layout = computed(() => {
  const p = parsed.value;
  if ('layout' in p) last = p.layout;
  return last;
});
const error = computed(() => ('error' in parsed.value ? parsed.value.error : ''));

const M = computed(() => size(mode(layout.value, 0).shape));
const N = computed(() => size(mode(layout.value, 1).shape));
const cos = computed(() => cosize(layout.value));
const offsets = computed(() => Array.from({ length: M.value * N.value }, (_, i) => offset(layout.value, i)));
const hits = computed(() => {
  const h = new Array<number>(cos.value).fill(0);
  for (const o of offsets.value) h[o]++;
  return h;
});
const rows = computed(() => Array.from({ length: M.value }, (_, i) => i));
const cols = computed(() => Array.from({ length: N.value }, (_, j) => j));
const idx = (i: number, j: number) => i + M.value * j;

const used = computed(() => hits.value.filter((h) => h > 0).length);
const unused = computed(() => cos.value - used.value);
const shared = computed(() => hits.value.filter((h) => h > 1).length);

function shade(o: number) {
  const t = cos.value > 1 ? o / (cos.value - 1) : 0;
  return `color-mix(in srgb, var(--accent) ${Math.round(8 + 50 * t)}%, var(--surface))`;
}
function cellActive(i: number) {
  if (hoverCell.value !== null) return hoverCell.value === i;
  if (hoverSlot.value !== null) return offsets.value[i] === hoverSlot.value;
  return false;
}
function slotActive(o: number) {
  if (hoverSlot.value !== null) return hoverSlot.value === o;
  if (hoverCell.value !== null) return offsets.value[hoverCell.value] === o;
  return false;
}

/** Split a 1-D index over a (possibly nested) shape, keeping the nesting. */
function unflatten(i: number, shape: IntTuple): IntTuple {
  if (typeof shape === 'number') return i % shape;
  const out: IntTuple[] = [];
  for (const s of shape) {
    out.push(unflatten(i, s));
    i = Math.floor(i / size(s));
  }
  return out;
}
const fmtT = (t: IntTuple): string => (typeof t === 'number' ? String(t) : `(${t.map(fmtT).join(',')})`);

const readout = computed(() => {
  const k = hoverCell.value;
  if (k === null) return null;
  const i = k % M.value;
  const j = Math.floor(k / M.value);
  const coord = [unflatten(i, mode(layout.value, 0).shape), unflatten(j, mode(layout.value, 1).shape)];
  const c = flatten(coord);
  const s = flatten(layout.value.stride);
  const terms = c.map((x, q) => `${x} \\cdot ${s[q]}`).join(' + ');
  return {
    natural: `(${i},${j})`,
    nested: fmtT(coord),
    showNested: flatten(layout.value.shape).length > 2,
    sum: `${terms} = ${offsets.value[k]}`,
    index: k,
  };
});
</script>

<template>
  <div class="cl">
    <div class="presets" role="group" aria-label="Example layouts">
      <button v-for="p in PRESETS" :key="p.name" :class="{ on: src === p.src }" @click="src = p.src">
        {{ p.name }}
      </button>
    </div>
    <label class="input">
      <span>layout</span>
      <input v-model="src" spellcheck="false" autocomplete="off" aria-label="Layout in shape:stride notation" />
    </label>
    <p class="err" :class="{ show: error }">{{ error || ' ' }}</p>

    <div class="views">
      <div class="view">
        <div class="cap">logical grid: cell shows its offset</div>
        <div class="grid" :style="{ gridTemplateColumns: `1.4em repeat(${N}, minmax(0, 2.4em))` }">
          <span />
          <span v-for="j in cols" :key="`h${j}`" class="axis">{{ j }}</span>
          <template v-for="i in rows" :key="`r${i}`">
            <span class="axis">{{ i }}</span>
            <span
              v-for="j in cols"
              :key="`c${i}-${j}`"
              class="cell"
              :class="{ on: cellActive(idx(i, j)) }"
              :style="{ background: shade(offsets[idx(i, j)]) }"
              @pointerenter="hoverCell = idx(i, j)"
              @pointerleave="hoverCell = null"
            >
              {{ offsets[idx(i, j)] }}
            </span>
          </template>
        </div>
      </div>

      <div class="view">
        <div class="cap">memory: offsets 0 to {{ cos - 1 }}</div>
        <div class="mem">
          <span
            v-for="(h, o) in hits"
            :key="`m${o}`"
            class="slot"
            :class="{ empty: h === 0, on: slotActive(o) }"
            :style="h ? { background: shade(o) } : {}"
            :title="h === 0 ? 'unused' : h > 1 ? `${h} cells map here` : ''"
            @pointerenter="hoverSlot = o"
            @pointerleave="hoverSlot = null"
          >
            {{ o }}<sup v-if="h > 1">×{{ h }}</sup>
          </span>
        </div>
      </div>
    </div>

    <div class="read">
      <template v-if="readout">
        <span>coordinate <code>{{ readout.natural }}</code></span>
        <span v-if="readout.showNested">nested <code>{{ readout.nested }}</code></span>
        <span>1-D index <code>{{ readout.index }}</code></span>
        <span class="sum">offset <Tex :t="readout.sum" /></span>
      </template>
      <template v-else>
        <span>
          <code>{{ fmtLayout(layout) }}</code>: {{ M * N }} elements, {{ used }} distinct offsets
          <template v-if="unused">, {{ unused }} unused (padding)</template>
          <template v-if="shared">, {{ shared }} shared by several cells</template>
        </span>
        <span class="hint">Hover a cell or a memory slot.</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cl {
  font-size: 0.9rem;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
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
  margin-top: 0.4rem;
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
.grid {
  display: grid;
  gap: 2px;
  font-family: var(--mono);
  font-size: 0.78rem;
}
.axis {
  color: var(--muted);
  font-size: 0.7rem;
  text-align: center;
  align-self: center;
}
.cell,
.slot {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  border: 1.5px solid transparent;
  color: var(--text);
  cursor: default;
  position: relative;
}
.cell.on,
.slot.on {
  border-color: var(--text);
  font-weight: 700;
}
.mem {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 2.4em));
  gap: 2px;
  font-family: var(--mono);
  font-size: 0.72rem;
}
.slot.empty {
  border: 1px dashed var(--border);
  color: var(--muted);
}
.slot sup {
  position: absolute;
  top: 0;
  right: 1px;
  font-size: 0.55rem;
  color: var(--danger);
  font-weight: 700;
}
.read {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
  margin-top: 0.75rem;
  min-height: 3em;
  align-items: baseline;
}
.hint {
  color: var(--muted);
}
code {
  font-family: var(--mono);
}
</style>
