<script setup lang="ts">
// The same message framed three ways. Each square is 8 bytes on the wire; one square crosses per
// tick. The receiver may only read bytes once a flag (LL, LL128) or a fence plus counter (Simple)
// says they are complete. Watch when bytes become usable, not just when they arrive.
import { computed, onBeforeUnmount, ref, watch } from 'vue';

type Kind = 'data' | 'flag' | 'half' | 'count';
interface Cell {
  kind: Kind;
  group: number; // cells in a group become readable together
}
interface Proto {
  name: string;
  blurb: string;
  cells: Cell[];
  /** Extra ticks between the last data cell landing and the counter being written. */
  fence: number;
}

const COLS = 16; // 16 × 8 B = 128 B per row, so an LL128 line is exactly one row
const FENCE = 24; // ticks a memory fence costs (illustrative)
const SIZES = [64, 120, 240, 480];

const bytes = ref(240);
const t = ref(0);
const playing = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

function ll(n: number): Cell[] {
  // 4 B data + 4 B flag, written together as one 8-byte atomic store.
  return Array.from({ length: Math.ceil(n / 4) }, (_, i) => ({ kind: 'half' as Kind, group: i }));
}
function ll128(n: number): Cell[] {
  // 128-byte lines: 120 B data + 8 B flag, written as one 128-byte store.
  const out: Cell[] = [];
  const lines = Math.ceil(n / 120);
  for (let l = 0; l < lines; l++) {
    const data = Math.ceil(Math.min(120, n - l * 120) / 8);
    for (let i = 0; i < data; i++) out.push({ kind: 'data', group: l });
    out.push({ kind: 'flag', group: l });
  }
  return out;
}
function simple(n: number): Cell[] {
  // Plain data, then a fence, then one counter update that publishes the whole chunk.
  const out: Cell[] = Array.from({ length: Math.ceil(n / 8) }, () => ({ kind: 'data' as Kind, group: 0 }));
  out.push({ kind: 'count', group: 0 });
  return out;
}

const protos = computed<Proto[]>(() => [
  { name: 'Simple', blurb: 'data, fence, then one counter', cells: simple(bytes.value), fence: FENCE },
  { name: 'LL', blurb: '4 B data + 4 B flag per 8 B store', cells: ll(bytes.value), fence: 0 },
  { name: 'LL128', blurb: '120 B data + 8 B flag per 128 B line', cells: ll128(bytes.value), fence: 0 },
]);

/** Tick at which cell i lands. Simple's counter waits for the fence. */
function landed(p: Proto, i: number) {
  return p.cells[i].kind === 'count' ? i + 1 + p.fence : i + 1;
}
/** Tick at which each group becomes readable: when its last cell (the flag/counter) has landed. */
function readyAt(p: Proto) {
  const r = new Map<number, number>();
  p.cells.forEach((c, i) => r.set(c.group, Math.max(r.get(c.group) ?? 0, landed(p, i))));
  return r;
}

const stats = computed(() =>
  protos.value.map((p) => {
    const ready = readyAt(p);
    const times = [...ready.values()];
    const wire = p.cells.length * 8;
    return {
      first: Math.min(...times),
      all: Math.max(...times),
      wire,
      eff: Math.round((100 * bytes.value) / wire),
      syncs: ready.size,
      ready,
    };
  }),
);
const end = computed(() => Math.max(...stats.value.map((s) => s.all)));

function state(pi: number, i: number) {
  const p = protos.value[pi];
  if (t.value < landed(p, i)) return 'pending';
  return t.value >= stats.value[pi].ready.get(p.cells[i].group)! ? 'ready' : 'landed';
}

const CELL = 20;
const GAP = 2;
const W = COLS * CELL;
function rows(p: Proto) {
  return Math.ceil(p.cells.length / COLS);
}

function tick() {
  if (t.value < end.value) t.value++;
  else stop();
}
function stop() {
  playing.value = false;
  clearInterval(timer);
  timer = undefined;
}
function toggle() {
  if (playing.value) return stop();
  if (t.value >= end.value) t.value = 0;
  playing.value = true;
  timer = setInterval(tick, 60);
}
watch(bytes, () => {
  stop();
  t.value = 0;
});
onBeforeUnmount(stop);
</script>

<template>
  <div class="ncw">
    <div class="ctl">
      <div class="seg" role="group" aria-label="Message size">
        <button v-for="s in SIZES" :key="s" :aria-pressed="bytes === s" @click="bytes = s">{{ s }} B</button>
      </div>
      <button @click="toggle">{{ playing ? 'pause' : t >= end ? 'replay' : 'send' }}</button>
      <label class="scrub">
        <span>tick</span>
        <input v-model.number="t" type="range" min="0" :max="end" @input="stop" />
        <output>{{ t }}</output>
      </label>
    </div>

    <div v-for="(p, pi) in protos" :key="p.name" class="proto">
      <div class="head">
        <b>{{ p.name }}</b> <span class="muted">{{ p.blurb }}</span>
      </div>
      <svg :viewBox="`0 0 ${W} ${rows(p) * CELL}`" :style="{ maxWidth: W + 'px' }" role="img" :aria-label="`${p.name} framing`">
        <g v-for="(c, i) in p.cells" :key="i" :transform="`translate(${(i % COLS) * CELL},${Math.floor(i / COLS) * CELL})`" :class="['cell', state(pi, i)]">
          <template v-if="c.kind === 'half'">
            <rect class="d" :x="GAP / 2" :y="GAP / 2" :width="CELL / 2 - GAP / 2" :height="CELL - GAP" rx="2" />
            <rect class="f" :x="CELL / 2" :y="GAP / 2" :width="CELL / 2 - GAP / 2" :height="CELL - GAP" rx="2" />
          </template>
          <rect v-else :class="c.kind === 'data' ? 'd' : 'f'" :x="GAP / 2" :y="GAP / 2" :width="CELL - GAP" :height="CELL - GAP" rx="2" />
        </g>
      </svg>
      <dl class="stats">
        <dt>on the wire</dt>
        <dd>{{ stats[pi].wire }} B ({{ stats[pi].eff }}% data)</dd>
        <dt>sync points</dt>
        <dd>{{ stats[pi].syncs }}</dd>
        <dt>first readable</dt>
        <dd :class="{ hit: t >= stats[pi].first }">tick {{ stats[pi].first }}</dd>
        <dt>all readable</dt>
        <dd :class="{ hit: t >= stats[pi].all }">tick {{ stats[pi].all }}</dd>
      </dl>
    </div>

    <p class="legend">
      <span class="sw d" /> data <span class="sw f" /> flag / counter <span class="sw d landed" /> arrived, not yet trusted
      <span class="sw d ready" /> readable. One square = 8 B = one tick. Simple's fence costs {{ FENCE }} ticks here.
    </p>
  </div>
</template>

<style scoped>
.ncw {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.seg button {
  border: 0;
  border-radius: 0;
  color: var(--muted);
}
.seg button + button {
  border-left: 1px solid var(--border);
}
.seg button[aria-pressed='true'] {
  background: var(--accent-soft);
  color: var(--accent);
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
.scrub {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--muted);
}
.scrub input {
  width: 7rem;
}
.scrub output {
  font-family: var(--mono);
  color: var(--text);
  min-width: 2.5em;
}
.proto {
  margin-bottom: 0.8rem;
}
.head {
  margin-bottom: 0.25rem;
}
.muted {
  color: var(--muted);
  font-size: 0.85rem;
}
svg {
  display: block;
  width: 100%;
  height: auto;
}
.cell rect {
  transition: fill 0.12s, fill-opacity 0.12s;
}
.cell.pending rect {
  fill: none;
  stroke: var(--border);
  stroke-dasharray: 2 2;
}
.cell.landed .d {
  fill: var(--muted);
  fill-opacity: 0.35;
}
.cell.landed .f {
  fill: var(--danger);
  fill-opacity: 0.35;
}
.cell.ready .d {
  fill: var(--accent);
}
.cell.ready .f {
  fill: var(--danger);
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, auto);
  justify-content: start;
  gap: 0.1rem 0.6rem;
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
}
.stats dt {
  color: var(--muted);
}
.stats dd {
  margin: 0;
  font-family: var(--mono);
}
.stats dd.hit {
  color: var(--accent);
}
@media (max-width: 480px) {
  .stats {
    grid-template-columns: auto auto;
  }
}
.legend {
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.7;
  margin: 0.2rem 0 0;
}
.sw {
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  border-radius: 2px;
  vertical-align: -0.05em;
  margin-left: 0.3em;
}
.sw.d {
  background: var(--accent);
}
.sw.f {
  background: var(--danger);
}
.sw.d.landed {
  background: var(--muted);
  opacity: 0.35;
}
</style>
