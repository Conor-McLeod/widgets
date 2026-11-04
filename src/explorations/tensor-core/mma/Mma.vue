<script setup lang="ts">
// D = A·B + C on a 4×4×4 tile, computed two ways: one fused multiply-add per clock (a scalar FMA unit)
// or the whole tile per clock (a Volta-style tensor core). Counts clocks, instructions and register reads.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Tex from '~/math/Tex.vue';

const N = 4;
const TOTAL = N * N * N;
type Mode = 'fma' | 'tensor';

const fmt = (v: number) => (v < 0 ? `−${-v}` : String(v));

const rand = () => Math.floor(Math.random() * 7) - 3; // −3..3 keeps every sum readable
const randMat = () => Array.from({ length: N }, () => Array.from({ length: N }, rand));

const A = ref(randMat());
const B = ref(randMat());
const C = ref(randMat());
const mode = ref<Mode>('fma');
const clock = ref(0);
const playing = ref(false);
const pinned = ref<[number, number] | null>(null);

// Scalar order: finish one output before starting the next, like a naive triple loop.
const order = (s: number) => ({ i: Math.floor(s / (N * N)), j: Math.floor(s / N) % N, k: s % N });

const steps = computed(() => (mode.value === 'fma' ? TOTAL : 1));
const done = computed(() => clock.value >= steps.value);

// How many products of D[i][j] have been accumulated so far.
function productsDone(i: number, j: number): number {
  if (mode.value === 'tensor') return clock.value >= 1 ? N : 0;
  const s = clock.value - (i * N + j) * N;
  return Math.max(0, Math.min(N, s));
}

const acc = computed(() =>
  A.value.map((row, i) =>
    B.value[0].map((_, j) => {
      let v = C.value[i][j];
      for (let k = 0; k < productsDone(i, j); k++) v += row[k] * B.value[k][j];
      return v;
    }),
  ),
);

// What lit up on the most recent clock.
const current = computed(() => {
  if (clock.value === 0) return null;
  if (mode.value === 'tensor') return 'all' as const;
  return order(clock.value - 1);
});

function lit(kind: 'a' | 'b' | 'd', r: number, c: number): boolean {
  const cur = current.value;
  if (cur === null) return false;
  if (cur === 'all') return true;
  if (kind === 'a') return cur.i === r && cur.k === c;
  if (kind === 'b') return cur.k === r && cur.j === c;
  return cur.i === r && cur.j === c;
}

// The cell explained below the grid: the pinned one, else the one being worked on.
const focus = computed<[number, number]>(() => {
  if (pinned.value) return pinned.value;
  const cur = current.value;
  if (cur && cur !== 'all') return [cur.i, cur.j];
  return [0, 0];
});

const detail = computed(() => {
  const [i, j] = focus.value;
  const n = productsDone(i, j);
  const terms = Array.from({ length: N }, (_, k) => {
    const a = A.value[i][k];
    const b = B.value[k][j];
    const t = (v: number) => (v < 0 ? `(${v})` : String(v));
    return { tex: `${t(a)} \\cdot ${t(b)}`, done: k < n };
  });
  return { i, j, c: C.value[i][j], terms, value: acc.value[i][j], complete: n === N };
});

const stats = computed(() => {
  const fmas = mode.value === 'fma' ? clock.value : clock.value * TOTAL;
  // Scalar FMA reads a, b and the accumulator every time. The tensor core reads each tile once.
  const reads = mode.value === 'fma' ? clock.value * 3 : clock.value * 3 * N * N;
  return { fmas, reads, instr: clock.value };
});

let timer: ReturnType<typeof setInterval> | undefined;
function stop() {
  playing.value = false;
  clearInterval(timer);
}
function step() {
  if (done.value) return stop();
  clock.value++;
  if (done.value) stop();
}
function play() {
  if (playing.value) return stop();
  if (done.value) clock.value = 0;
  playing.value = true;
  step();
  timer = setInterval(step, mode.value === 'fma' ? 110 : 600);
}
function reset() {
  stop();
  clock.value = 0;
  pinned.value = null;
}
function shuffle() {
  A.value = randMat();
  B.value = randMat();
  C.value = randMat();
}
function pin(i: number, j: number) {
  const p = pinned.value;
  pinned.value = p && p[0] === i && p[1] === j ? null : [i, j];
}

watch(mode, reset);
onBeforeUnmount(stop);

</script>

<template>
  <div class="tc">
    <div class="ctl">
      <div class="seg" role="group" aria-label="Hardware">
        <button :aria-pressed="mode === 'fma'" @click="mode = 'fma'">FMA unit</button>
        <button :aria-pressed="mode === 'tensor'" @click="mode = 'tensor'">Tensor core</button>
      </div>
      <div class="seg">
        <button @click="play">{{ playing ? 'Pause' : done ? 'Replay' : 'Play' }}</button>
        <button :disabled="done" @click="step">Step</button>
        <button @click="reset">Reset</button>
        <button title="New random matrices" @click="shuffle">New numbers</button>
      </div>
    </div>

    <div class="board">
      <div class="corner">
        <Tex t="D = AB + C" />
      </div>
      <div class="mat b" aria-label="Matrix B">
        <span class="lbl"><Tex t="B" /></span>
        <template v-for="(row, r) in B" :key="r">
          <span v-for="(v, c) in row" :key="c" :class="{ lit: lit('b', r, c) }">{{ fmt(v) }}</span>
        </template>
      </div>
      <div class="mat a" aria-label="Matrix A">
        <span class="lbl"><Tex t="A" /></span>
        <template v-for="(row, r) in A" :key="r">
          <span v-for="(v, c) in row" :key="c" :class="{ lit: lit('a', r, c) }">{{ fmt(v) }}</span>
        </template>
      </div>
      <div class="mat d" aria-label="Accumulator D, starting from C">
        <template v-for="(row, r) in acc" :key="r">
          <button
            v-for="(v, c) in row"
            :key="c"
            class="cell"
            :class="{
              lit: lit('d', r, c),
              full: productsDone(r, c) === 4,
              focus: focus[0] === r && focus[1] === c,
            }"
            :aria-label="`D row ${r + 1} column ${c + 1}: ${v}`"
            @click="pin(r, c)"
          >
            <span class="val">{{ fmt(v) }}</span>
            <span class="dots">
              <i v-for="k in 4" :key="k" :class="{ on: k <= productsDone(r, c) }" />
            </span>
          </button>
        </template>
      </div>
    </div>

    <p class="detail">
      <Tex class="muted" :t="`D_{${detail.i},${detail.j}} = C_{${detail.i},${detail.j}} + \\textstyle\\sum_k A_{${detail.i},k} B_{k,${detail.j}}`" />
      <br />
      <Tex :t="`= ${detail.c}`" />
      <template v-for="(t, k) in detail.terms" :key="k">
        {{ ' ' }}<Tex t="+" />{{ ' ' }}<Tex :class="t.done ? '' : 'pending'" :t="t.tex" />
      </template>
      <template v-if="detail.complete">{{ ' ' }}<Tex t="=" />{{ ' ' }}<b><Tex :t="String(detail.value)" /></b></template>
      <span v-else class="muted"> (so far <Tex :t="String(detail.value)" />)</span>
    </p>

    <dl class="stats">
      <div>
        <dt>clocks</dt>
        <dd>{{ clock }} <span class="muted">/ {{ steps }}</span></dd>
      </div>
      <div>
        <dt>instructions issued</dt>
        <dd>{{ stats.instr }}</dd>
      </div>
      <div>
        <dt>multiply-adds</dt>
        <dd>{{ stats.fmas }} <span class="muted">/ 64</span></dd>
      </div>
      <div>
        <dt>register reads</dt>
        <dd>{{ stats.reads }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.tc {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  justify-content: space-between;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
button {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.25rem 0.65rem;
  cursor: pointer;
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
button[aria-pressed='true'] {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}

.board {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 5fr);
  grid-template-areas: 'corner b' 'a d';
  gap: 0.6rem;
  margin-top: 1.8rem;
  margin-bottom: 1.4rem;
  font-family: var(--mono);
}
.corner {
  grid-area: corner;
  display: flex;
  align-items: end;
  justify-content: end;
  color: var(--muted);
  font-size: 0.75rem;
  text-align: right;
}
.mat {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 3px;
}
.mat.a {
  grid-area: a;
  align-self: start;
}
.mat.b {
  grid-area: b;
}
.mat.d {
  grid-area: d;
}
.lbl {
  position: absolute;
  top: -1.3rem;
  left: 0;
  font-size: 0.75rem;
  color: var(--muted);
}
.mat.a .lbl {
  top: auto;
  bottom: -1.3rem;
}
.mat > span:not(.lbl) {
  text-align: center;
  padding: 0.2rem 0;
  border-radius: 4px;
  background: color-mix(in srgb, var(--muted) 10%, transparent);
  transition: background 0.15s;
}
.mat .lit:not(.cell) {
  background: var(--accent);
  color: var(--bg);
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.35rem 0.1rem;
  font-family: var(--mono);
  border-radius: 5px;
  min-width: 0;
  transition: background 0.15s, border-color 0.15s;
}
.cell.full {
  background: var(--accent-soft);
}
.cell.lit {
  border-color: var(--accent);
}
.cell.focus {
  box-shadow: 0 0 0 2px var(--accent) inset;
}
.val {
  font-weight: 600;
}
.dots {
  display: flex;
  gap: 3px;
}
.dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid var(--muted);
}
.dots i.on {
  background: var(--accent);
  border-color: var(--accent);
}

.detail {
  margin: 1rem 0 0.5rem;
  font-family: var(--mono);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
  min-height: 2.8em;
}
.pending {
  color: var(--muted);
  opacity: 0.6;
}
.muted {
  color: var(--muted);
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: 0.5rem;
  margin: 0;
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
</style>
