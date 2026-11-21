<script setup lang="ts">
// One warp-wide shared-memory load. Each accessed 4-byte word is a cell placed by its bank (column).
// "Addresses" stacks cells by the 128-byte row of memory they live in; "Wavefronts" stacks them by
// the pass that delivers them. Switching animates every word from where it lives to when it's read.
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';
import { BANKS, LANES, plan, strided, type Cell, type Width } from '../model';

type Mode = 'stride' | 'random';
const width = ref<Width>(4);
const mode = ref<Mode>('stride');
const stride = ref(1);
const seed = ref(7);
const view = ref<'addr' | 'wave'>('addr');

const widths: { w: Width; label: string; ty: string; tip: string }[] = [
  { w: 4, label: '32-bit', ty: 'float', tip: 'one float or int per thread: 4 bytes' },
  { w: 8, label: '64-bit', ty: 'float2 / double', tip: 'CUDA vector type float2 (two floats, 8-byte aligned) or a double: 8 bytes' },
  { w: 16, label: '128-bit', ty: 'float4', tip: 'CUDA vector type float4 (four floats, 16-byte aligned): 16 bytes' },
];

const presets: { label: string; s: number }[] = [
  { label: 'Consecutive', s: 1 },
  { label: 'Stride 2', s: 2 },
  { label: 'Column of 32×32', s: 32 },
  { label: 'Padded column', s: 33 },
  { label: 'Broadcast', s: 0 },
];

function rand(n: number) {
  // Small deterministic LCG so "Random" is reproducible until re-rolled.
  let x = n * 2654435761 + 1;
  return () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) >>> 8) / (1 << 24);
}

const elems = computed(() => {
  if (mode.value === 'stride') return strided(stride.value);
  const r = rand(seed.value);
  const range = 256 / width.value; // two 128-byte rows' worth of elements
  return Array.from({ length: LANES }, () => Math.floor(r() * range));
});

const p = computed(() => plan(elems.value, width.value));

// Layout
const ROW = 18;
const GAP = 8;
const memRows = computed(() => [...new Set(p.value.cells.map((c) => Math.floor(c.word / BANKS)))].sort((a, b) => a - b));
const memIndex = computed(() => new Map(memRows.value.map((r, i) => [r, i])));
const waveTop = (w: number) => w * ROW + p.value.wavePhase[w] * GAP;
const topOf = (c: Cell) => (view.value === 'addr' ? memIndex.value.get(Math.floor(c.word / BANKS))! * ROW : waveTop(c.wave));
const height = computed(() =>
  view.value === 'addr' ? memRows.value.length * ROW : waveTop(p.value.wavefronts - 1) + ROW,
);
const waveLabels = computed(() => p.value.wavePhase.map((ph, w) => ({ w, ph, first: w === 0 || p.value.wavePhase[w - 1] !== ph })));

// Hover linking between lanes and cells
const hoverLane = ref<number | null>(null);
const hoverCell = ref<Cell | null>(null);
const laneLit = (l: number) => hoverLane.value === l || (hoverCell.value?.lanes.includes(l) ?? false);
const cellLit = (c: Cell) => hoverCell.value === c || (hoverLane.value !== null && c.lanes.includes(hoverLane.value));

const laneDepth = computed(() => {
  const d = new Array(LANES).fill(0);
  for (const c of p.value.cells) for (const l of c.lanes) d[l] = Math.max(d[l], c.depth);
  return d;
});
const wires = computed(() =>
  p.value.cells.flatMap((c) =>
    c.lanes.map((lane) => ({ key: `${c.phase}-${c.word}-${lane}`, lane, bank: c.bank, bad: c.depth > 0, lit: cellLit(c) })),
  ),
);
const badBanks = computed(() => new Set(p.value.cells.filter((c) => c.depth > 0).map((c) => c.bank)));
const bankLit = (b: number) => p.value.cells.some((c) => c.bank === b && cellLit(c));
const lanePhase = (l: number) => Math.floor(l / p.value.lanesPerPhase);

const worst = computed(() => {
  let best: Cell | null = null;
  for (const c of p.value.cells) if (!best || c.depth > best.depth) best = c;
  return best!;
});
const excess = computed(() => p.value.wavefronts - p.value.phases);
const hex = (n: number) => '0x' + n.toString(16).padStart(4, '0');
const cellText = (c: Cell) => (c.lanes.length === 1 ? String(c.lanes[0]) : `×${c.lanes.length}`);
const cellTitle = (c: Cell) =>
  `word at ${hex(c.word * 4)}, bank ${c.bank}, wavefront ${c.wave}` +
  `${p.value.phases > 1 ? ` (phase ${c.phase})` : ''}, thread${c.lanes.length > 1 ? 's' : ''} ${c.lanes.join(', ')}`;

const MAX_STRIDE = 64;
function setStride(n: number) {
  mode.value = 'stride';
  if (Number.isFinite(n)) stride.value = Math.max(0, Math.min(MAX_STRIDE, Math.round(n)));
}

function pickPreset(s: number) {
  mode.value = 'stride';
  stride.value = s;
}
</script>

<template>
  <div class="wf">
    <div class="ctl">
      <span class="glabel">data type</span>
      <div class="seg" role="group" aria-label="data type each thread loads">
        <button v-for="o in widths" :key="o.w" :aria-pressed="width === o.w" :title="o.tip" @click="width = o.w">
          {{ o.label }} <span class="muted">{{ o.ty }}</span>
        </button>
      </div>

      <span class="glabel">pattern</span>
      <div class="seg" role="group" aria-label="access pattern">
        <button v-for="o in presets" :key="o.label" :aria-pressed="mode === 'stride' && stride === o.s" @click="pickPreset(o.s)">
          {{ o.label }}
        </button>
        <button :aria-pressed="mode === 'random'" @click="mode === 'random' ? seed++ : (mode = 'random')">
          {{ mode === 'random' ? 'Re-roll' : 'Random' }}
        </button>
      </div>

      <span class="glabel">stride</span>
      <div class="seg stride">
        <span class="stepper">
          <button aria-label="decrease stride" :disabled="mode === 'stride' && stride <= 0" @click="setStride(stride - 1)">−</button>
          <input
            :value="stride"
            type="number"
            min="0"
            :max="MAX_STRIDE"
            inputmode="numeric"
            aria-label="stride in elements"
            @change="setStride(($event.target as HTMLInputElement).valueAsNumber)"
          />
          <button aria-label="increase stride" :disabled="mode === 'stride' && stride >= MAX_STRIDE" @click="setStride(stride + 1)">+</button>
        </span>
        <span :class="{ muted: mode === 'random' }">
          thread <Tex t="t" /> reads element <Tex :t="mode === 'stride' ? `${stride}\\,t` : '\\text{random}'" />
        </span>
      </div>

      <span class="glabel">view</span>
      <div class="seg" role="group" aria-label="view">
        <button :aria-pressed="view === 'addr'" @click="view = 'addr'">Where the words live</button>
        <button :aria-pressed="view === 'wave'" @click="view = 'wave'">When they're delivered</button>
      </div>
    </div>

    <div class="board">
      <div class="row">
        <div class="rowlabel">threads</div>
        <div class="lanes">
          <div
            v-for="l in LANES"
            :key="l"
            class="lane"
            :class="{ bad: laneDepth[l - 1] > 0, lit: laneLit(l - 1), odd: lanePhase(l - 1) % 2 === 1 }"
            :title="`thread ${l - 1}: element ${elems[l - 1]}, byte ${hex(elems[l - 1] * width)}, bank ${(elems[l - 1] * (width / 4)) % BANKS}`"
            @pointerenter="hoverLane = l - 1"
            @pointerleave="hoverLane = null"
          >
            <span>{{ l - 1 }}</span>
          </div>
        </div>
      </div>
      <div class="row">
        <div class="rowlabel" />
        <svg class="wires" viewBox="0 0 320 40" preserveAspectRatio="none" aria-hidden="true">
          <line
            v-for="w in wires"
            :key="w.key"
            :x1="(w.lane + 0.5) * 10"
            y1="0"
            :x2="(w.bank + 0.5) * 10"
            y2="40"
            :class="{ bad: w.bad, lit: w.lit }"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div class="row bankrow">
        <div class="rowlabel">banks</div>
        <div class="lanes">
          <div
            v-for="b in BANKS"
            :key="b"
            class="lane"
            :class="{ bad: badBanks.has(b - 1), lit: bankLit(b - 1) }"
            :title="`bank ${b - 1}`"
          >
            <span>{{ b - 1 }}</span>
          </div>
        </div>
      </div>
      <div class="body">
        <div class="gutter" :style="{ height: `${height}px` }">
          <template v-if="view === 'addr'">
            <span v-for="(r, i) in memRows" :key="`m${r}`" :style="{ top: `${i * ROW}px` }">{{ hex(r * 128) }}</span>
          </template>
          <template v-else>
            <span v-for="l in waveLabels" :key="`w${l.w}`" :class="{ first: l.first }" :style="{ top: `${waveTop(l.w)}px` }">
              {{ p.phases > 1 && l.first ? `p${l.ph} ` : '' }}#{{ l.w }}
            </span>
          </template>
        </div>
        <div class="plane" :style="{ height: `${height}px` }">
          <div class="stripes" />
          <div
            v-for="c in p.cells"
            :key="`${c.phase}-${c.word}`"
            class="cell"
            :class="{ bad: c.depth > 0, lit: cellLit(c), multi: c.lanes.length > 1 }"
            :style="{ left: `${(c.bank / BANKS) * 100}%`, top: `${topOf(c)}px` }"
            :title="cellTitle(c)"
            @pointerenter="hoverCell = c"
            @pointerleave="hoverCell = null"
          >
            <span>{{ cellText(c) }}</span>
          </div>
        </div>
      </div>
    </div>

    <p v-if="p.phases > 1" class="note muted">
      {{ width * 8 }}-bit loads: the warp is split into {{ p.phases }} phases of {{ p.lanesPerPhase }} threads (shading alternates by phase), since
      each phase already needs <Tex :t="`${p.lanesPerPhase} \\times ${width} = 128`" /> bytes. In the wavefront view, p0, p1, … mark where each phase's passes start.
    </p>

    <p class="sum">
      <strong>{{ p.wavefronts }}</strong> wavefront{{ p.wavefronts === 1 ? '' : 's' }}
      <span class="muted">(ideal {{ p.phases }})</span>
      <template v-if="excess > 0">
        · <span class="danger">{{ excess }} extra</span>, the load runs at
        {{ Math.round((100 * p.phases) / p.wavefronts) }}% of shared-memory bandwidth.
        Bank {{ worst.bank }} has to supply {{ worst.depth + 1 }} different words{{ p.phases > 1 ? ` in phase ${worst.phase}` : '' }}.
      </template>
      <template v-else> · no bank conflicts.</template>
    </p>
  </div>
</template>

<style scoped>
.wf {
  font-size: 0.9rem;
  container-type: inline-size;
}
.ctl {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.4rem 0.7rem;
}
.glabel {
  font-size: 0.72rem;
  color: var(--muted);
  text-align: right;
}
.stride {
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
}
.stepper {
  display: inline-flex;
}
.stepper button {
  width: 1.8rem;
  padding: 0.2rem 0;
}
.stepper button:first-child {
  border-radius: 6px 0 0 6px;
}
.stepper button:last-child {
  border-radius: 0 6px 6px 0;
}
.stepper button:disabled {
  color: var(--muted);
  cursor: default;
}
.stepper input {
  width: 3rem;
  font: inherit;
  font-family: var(--mono);
  font-size: 0.82rem;
  text-align: center;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-left: none;
  border-right: none;
  -moz-appearance: textfield;
  appearance: textfield;
}
.stepper input::-webkit-inner-spin-button,
.stepper input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
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
}
.muted {
  color: var(--muted);
}
.danger {
  color: var(--danger);
}

.row {
  display: flex;
  align-items: flex-end;
}
.rowlabel {
  width: var(--gut);
  flex: none;
  padding-right: 0.35rem;
  box-sizing: border-box;
  text-align: right;
  font-size: 0.7rem;
  color: var(--muted);
}
.lanes {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(32, minmax(0, 1fr));
}
.lane {
  height: 18px;
  padding: 1px;
  box-sizing: border-box;
  cursor: default;
}
.lane span {
  display: block;
  height: 100%;
  box-sizing: border-box;
  font-family: var(--mono);
  font-size: 0.55rem;
  line-height: 14px;
  text-align: center;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--surface);
}
.lane.odd span {
  background: color-mix(in srgb, var(--muted) 22%, var(--surface));
}
.lane.bad span {
  border-color: var(--danger);
  color: var(--danger);
}
.lane.lit span {
  outline: 2px solid var(--text);
  outline-offset: -1px;
}
.bankrow {
  margin-bottom: 2px;
}
.wires {
  flex: 1;
  min-width: 0;
  height: 44px;
  display: block;
}
.wires line {
  stroke: var(--muted);
  stroke-width: 1;
  opacity: 0.55;
}
.wires line.bad {
  stroke: var(--danger);
}
.wires line.lit {
  stroke: var(--text);
  stroke-width: 2;
  opacity: 1;
}
.note {
  font-size: 0.78rem;
  margin: 0.6rem 0 0;
}

.board {
  margin-top: 0.9rem;
  --gut: 3.4rem;
}
.body {
  display: flex;
}
.gutter {
  position: relative;
  width: var(--gut);
  flex: none;
}
.gutter span {
  position: absolute;
  right: 0.35rem;
  height: 18px;
  line-height: 18px;
  font-family: var(--mono);
  font-size: 0.62rem;
  color: var(--muted);
  white-space: nowrap;
}
.gutter span.first {
  color: var(--text);
}
.plane {
  position: relative;
  flex: 1;
  min-width: 0;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  min-height: 18px;
}
.stripes {
  position: absolute;
  inset: 0;
  /* every 4th bank boundary, so 16-byte groups are visible */
  background: repeating-linear-gradient(
    to right,
    transparent 0,
    transparent calc(12.5% - 1px),
    var(--border) calc(12.5% - 1px),
    var(--border) 12.5%
  );
  opacity: 0.6;
  pointer-events: none;
}
.cell {
  position: absolute;
  width: calc(100% / 32);
  height: 18px;
  padding: 1px;
  box-sizing: border-box;
  transition:
    top 0.5s ease,
    left 0.5s ease;
}
.cell span {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  box-sizing: border-box;
  font-family: var(--mono);
  font-size: 0.55rem;
  line-height: 14px;
  text-align: center;
  overflow: hidden;
  color: var(--text);
}
.cell.multi span {
  background: color-mix(in srgb, var(--accent) 45%, var(--surface));
}
.cell.bad span {
  background: color-mix(in srgb, var(--danger) 22%, var(--surface));
  border-color: var(--danger);
}
.cell.lit span {
  outline: 2px solid var(--text);
  outline-offset: -1px;
}
@container (max-width: 520px) {
  .cell span,
  .lane span {
    color: transparent;
  }
  .board {
    --gut: 2.8rem;
  }
}
.sum {
  margin: 0.8rem 0 0;
  line-height: 1.5;
}
</style>
