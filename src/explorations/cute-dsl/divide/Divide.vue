<script setup lang="ts">
// zipped_divide on a row-major 8×16 tensor. Left: the tensor with its tiles coloured. Right: the
// same elements under the divided layout ((TileM,TileN),(RestM,RestN)), drawn as a matrix whose
// rows are "position inside a tile" and whose columns are "which tile". One column is one block's work.
import { computed, ref } from 'vue';
import { PALETTE } from '../cute';

const M = 8;
const N = 16;
const TILES: [number, number][] = [
  [2, 4],
  [4, 4],
  [2, 8],
  [4, 2],
];

const ti = ref(0);
const tile = computed(() => TILES[ti.value]);
const block = ref(0); // selected tile, as the colex index into (RestM, RestN)
const hover = ref<{ i: number; j: number } | null>(null);

const tm = computed(() => tile.value[0]);
const tn = computed(() => tile.value[1]);
const RM = computed(() => M / tm.value);
const RN = computed(() => N / tn.value);
const TE = computed(() => tm.value * tn.value); // elements per tile
const NT = computed(() => RM.value * RN.value); // number of tiles

function setTile(k: number) {
  ti.value = k;
  block.value = 0;
  hover.value = null;
}

// Element (i, j) of the original tensor, in divided coordinates.
function split(i: number, j: number) {
  const a = i % tm.value;
  const b = j % tn.value;
  const rm = Math.floor(i / tm.value);
  const rn = Math.floor(j / tn.value);
  return { a, b, rm, rn, inner: a + tm.value * b, outer: rm + RM.value * rn };
}
// Inverse: row `inner`, column `outer` of the divided view back to (i, j).
function join(inner: number, outer: number) {
  const a = inner % tm.value;
  const b = Math.floor(inner / tm.value);
  const rm = outer % RM.value;
  const rn = Math.floor(outer / RM.value);
  return { i: rm * tm.value + a, j: rn * tn.value + b };
}
const addr = (i: number, j: number) => i * N + j;

const colour = (outer: number) => {
  const rm = outer % RM.value;
  const rn = Math.floor(outer / RM.value);
  // A checkerboard-ish assignment so neighbouring tiles never share a colour.
  return PALETTE[(rm * 3 + rn) % PALETTE.length];
};

const rows = Array.from({ length: M }, (_, i) => i);
const cols = Array.from({ length: N }, (_, j) => j);
const innerRows = computed(() => Array.from({ length: TE.value }, (_, k) => k));
const outerCols = computed(() => Array.from({ length: NT.value }, (_, k) => k));

const divided = computed(
  () => `((${tm.value},${tn.value}),(${RM.value},${RN.value})):((${N},1),(${tm.value * N},${tn.value}))`,
);
const sel = computed(() => {
  const rm = block.value % RM.value;
  const rn = Math.floor(block.value / RM.value);
  return { rm, rn, base: addr(rm * tm.value, rn * tn.value) };
});

const isHover = (i: number, j: number) => hover.value !== null && hover.value.i === i && hover.value.j === j;

const readout = computed(() => {
  if (!hover.value) return null;
  const { i, j } = hover.value;
  const s = split(i, j);
  return { ...s, i, j, addr: addr(i, j) };
});
</script>

<template>
  <div class="zd">
    <div class="controls" role="radiogroup" aria-label="Tile shape">
      <span class="lbl">tiler</span>
      <button
        v-for="(t, k) in TILES"
        :key="t.join('x')"
        role="radio"
        :aria-checked="ti === k"
        :class="{ on: ti === k }"
        @click="setTile(k)"
      >
        ({{ t[0] }},{{ t[1] }})
      </button>
    </div>

    <div class="views">
      <div class="view">
        <div class="cap">mA: <code>(8,16):(16,1)</code></div>
        <div class="grid" :style="{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }">
          <template v-for="i in rows" :key="`r${i}`">
            <span
              v-for="j in cols"
              :key="`c${i}-${j}`"
              class="cell"
              :class="{ sel: split(i, j).outer === block, hov: isHover(i, j) }"
              :style="{ '--c': colour(split(i, j).outer) }"
              @pointerenter="hover = { i, j }"
              @pointerleave="hover = null"
              @click="block = split(i, j).outer"
            />
          </template>
        </div>
      </div>

      <div class="view">
        <div class="cap">
          gA = zipped_divide(mA, ({{ tm }},{{ tn }})): rows are mode 0, columns are mode 1
        </div>
        <div class="grid tall" :style="{ gridTemplateColumns: `repeat(${NT}, minmax(0, 1fr))` }">
          <template v-for="k in innerRows" :key="`ir${k}`">
            <span
              v-for="o in outerCols"
              :key="`ic${k}-${o}`"
              class="cell"
              :class="{ sel: o === block, hov: isHover(join(k, o).i, join(k, o).j) }"
              :style="{ '--c': colour(o) }"
              @pointerenter="hover = join(k, o)"
              @pointerleave="hover = null"
              @click="block = o"
            />
          </template>
        </div>
      </div>
    </div>

    <pre class="code"><code><span class="c"># {{ divided }}</span>
gA = cute.zipped_divide(mA, ({{ tm }}, {{ tn }}))
<span class="c"># tile {{ block }}: ({{ tm }},{{ tn }}):({{ N }},1) at offset {{ sel.base }}</span>
tile = gA[(None, ({{ sel.rm }}, {{ sel.rn }}))]</code></pre>

    <p class="read">
      <template v-if="readout">
        mA<code>[{{ readout.i }},{{ readout.j }}]</code> is gA<code
          >[(({{ readout.a }},{{ readout.b }}),({{ readout.rm }},{{ readout.rn }}))]</code
        >: element {{ readout.inner }} of tile {{ readout.outer }}, offset {{ readout.addr }} in memory.
      </template>
      <template v-else>Click a tile to slice it out. Hover to match elements between the views.</template>
    </p>
  </div>
</template>

<style scoped>
.zd {
  font-size: 0.9rem;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.lbl {
  color: var(--muted);
  margin-right: 0.2rem;
}
button {
  font: inherit;
  font-family: var(--mono);
  font-size: 0.85rem;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
}
button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.views {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 1rem;
  margin-top: 0.75rem;
  align-items: start;
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
  min-height: 2.4em;
}
.grid {
  display: grid;
  gap: 1px;
  max-width: 400px;
}
.grid.tall {
  max-width: 260px;
}
.cell {
  aspect-ratio: 1;
  border-radius: 2px;
  background: color-mix(in srgb, var(--c) 22%, var(--surface));
  cursor: pointer;
  box-sizing: border-box;
}
.cell.sel {
  background: color-mix(in srgb, var(--c) 75%, var(--surface));
}
.cell.hov {
  outline: 2px solid var(--text);
  outline-offset: -1px;
}
.code {
  margin: 0.8rem 0 0;
  padding: 0.55rem 0.7rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-family: var(--mono);
  font-size: 0.78rem;
  overflow-x: auto;
  white-space: pre;
}
.code .c {
  color: var(--muted);
}
.read {
  margin: 0.6rem 0 0;
  min-height: 2.8em;
}
code {
  font-family: var(--mono);
}
</style>
