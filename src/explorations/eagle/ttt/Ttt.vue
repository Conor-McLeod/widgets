<script setup lang="ts">
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';

// One training sequence. The draft runs over positions 1..N; at step j, position i predicts token
// i + j + 1 (step 1 at position i sees the target's feature for position i and the token after it).
const TOKENS = ['How', 'can', 'I', 'help', 'you', 'with', 'that', 'today', '?'];
const N = 5;
const STEPS = 3;

const mode = ref<'plain' | 'ttt'>('ttt');
const sel = ref({ step: 3, pos: 3 });

interface Cell {
  step: number;
  pos: number;
}
const cells: Cell[] = [];
for (let s = 1; s <= STEPS; s++) for (let p = 1; p <= N; p++) cells.push({ step: s, pos: p });

/** Step 1 is ordinary causal attention; later steps add only their own position's earlier drafts. */
const sees = (q: Cell, k: Cell) => (k.step === 1 ? k.pos <= q.pos : k.step <= q.step && k.pos === q.pos);
const live = (c: Cell) => mode.value === 'ttt' || c.step === 1;
const token = (i: number) => TOKENS[i - 1] ?? '…';
const inputToken = (c: Cell) => token(c.pos + c.step);

const CELL = 17;
const LEFT = 78;
const TOP = 54;
const W = LEFT + STEPS * N * CELL + 6;
const H = TOP + STEPS * N * CELL + 6;
const at = (c: Cell) => ((c.step - 1) * N + (c.pos - 1)) * CELL;

const selCell = computed(() => (live(sel.value) ? sel.value : { step: 1, pos: sel.value.pos }));
const strip = computed(() => {
  const { step, pos } = selCell.value;
  return TOKENS.map((w, idx) => {
    const i = idx + 1;
    const kind = i <= pos + 1 ? 'real' : i <= pos + step ? 'draft' : i === pos + step + 1 ? 'target' : 'future';
    return { w, kind };
  });
});

function pick(c: Cell) {
  if (live(c)) sel.value = { step: c.step, pos: c.pos };
}
</script>

<template>
  <div class="tt">
    <div class="row">
      <div class="seg">
        <button :class="{ on: mode === 'plain' }" @click="mode = 'plain'">Teacher forcing (EAGLE-1/2)</button>
        <button :class="{ on: mode === 'ttt' }" @click="mode = 'ttt'">Training-time test (EAGLE-3)</button>
      </div>
    </div>

    <div class="body">
      <svg :viewBox="`0 0 ${W} ${H}`" class="grid">
        <!-- step headers -->
        <g v-for="s in STEPS" :key="'h' + s">
          <text :x="LEFT + ((s - 1) * N + N / 2) * CELL" :y="10" class="head" :class="{ off: mode === 'plain' && s > 1 }">
            step {{ s }}
          </text>
          <text :x="LEFT - 74" :y="TOP + ((s - 1) * N + N / 2) * CELL + 3" class="head left" :class="{ off: mode === 'plain' && s > 1 }">
            step {{ s }}
          </text>
        </g>
        <!-- column labels -->
        <text
          v-for="c in cells"
          :key="'c' + c.step + c.pos"
          :transform="`translate(${LEFT + at(c) + CELL / 2 + 3}, ${TOP - 4}) rotate(-90)`"
          class="tok"
          :class="{ draft: c.step > 1, off: !live(c) }"
        >
          {{ inputToken(c) }}
        </text>
        <!-- rows -->
        <g v-for="q in cells" :key="'r' + q.step + q.pos" @mouseenter="pick(q)" @click="pick(q)" class="qrow">
          <text :x="LEFT - 5" :y="TOP + at(q) + CELL / 2 + 3.5" class="tok end" :class="{ draft: q.step > 1, off: !live(q), sel: q.step === selCell.step && q.pos === selCell.pos }">
            {{ inputToken(q) }}
          </text>
          <rect
            v-for="k in cells"
            :key="'k' + k.step + k.pos"
            :x="LEFT + at(k) + 1"
            :y="TOP + at(q) + 1"
            :width="CELL - 2"
            :height="CELL - 2"
            rx="2"
            class="cell"
            :class="{
              on: live(q) && live(k) && sees(q, k),
              draft: k.step > 1,
              off: !live(q) || !live(k),
              hl: live(q) && live(k) && sees(q, k) && q.step === selCell.step && q.pos === selCell.pos,
            }"
          />
        </g>
        <rect
          v-if="mode === 'plain'"
          :x="LEFT + N * CELL"
          :y="TOP"
          :width="(STEPS - 1) * N * CELL"
          :height="STEPS * N * CELL"
          class="veil"
        />
        <text v-if="mode === 'plain'" :x="LEFT + (N + ((STEPS - 1) * N) / 2) * CELL" :y="TOP + 2.5 * N * CELL" class="veil-t">
          never trained
        </text>
      </svg>

      <div class="side">
        <p class="what">
          Row <b>step {{ selCell.step }}, position {{ selCell.pos }}</b> predicts
          “{{ token(selCell.pos + selCell.step + 1) }}” from:
        </p>
        <p class="strip">
          <span v-for="(t, i) in strip" :key="i" :class="t.kind">{{ t.w }}</span>
        </p>
        <ul class="key">
          <li><i class="sw real"></i>real: the target’s features <Tex t="g" /> and tokens</li>
          <li><i class="sw draft"></i>the draft’s own outputs <Tex t="a" /> from earlier steps</li>
          <li><i class="sw target"></i>the label for this row</li>
        </ul>
        <p class="hint" v-if="mode === 'ttt'">
          This is exactly what the draft faces at depth {{ selCell.step }} of a tree at inference time. All
          {{ N }} rollouts train together; each step is one more pass of the one-layer draft over the sequence.
        </p>
        <p class="hint" v-else>
          Every training input is a real target feature. At inference, depth 2 onward feeds the draft its own
          outputs, which it never saw while training.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tt {
  font-size: 0.9rem;
}
.seg {
  display: inline-flex;
  flex-wrap: wrap;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.seg button {
  font: inherit;
  font-size: 0.82rem;
  padding: 0.25rem 0.6rem;
  border: 0;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.seg button + button {
  border-left: 1px solid var(--border);
}
.seg button.on {
  background: var(--accent-soft);
  color: var(--accent);
}
.body {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem 1.2rem;
  margin-top: 0.6rem;
}
.grid {
  flex: 0 1 340px;
  width: 340px;
  max-width: 100%;
  min-width: 0;
  height: auto;
}
.head {
  font-size: 9px;
  fill: var(--text);
  text-anchor: middle;
}
.head.left {
  text-anchor: start;
}
.head.off,
.tok.off {
  opacity: 0.3;
}
.tok {
  font-family: var(--mono);
  font-size: 8px;
  fill: var(--accent);
}
.tok.draft {
  fill: var(--danger);
}
.tok.end {
  text-anchor: end;
}
.tok.sel {
  font-weight: bold;
  text-decoration: underline;
}
.qrow {
  cursor: pointer;
}
.cell {
  fill: var(--surface);
  stroke: var(--border);
  stroke-width: 0.6;
}
.cell.on {
  fill: var(--accent);
  fill-opacity: 0.3;
  stroke: none;
}
.cell.on.draft {
  fill: var(--danger);
}
.cell.hl {
  fill-opacity: 0.9;
}
.cell.off {
  fill: var(--bg);
}
.veil {
  fill: var(--bg);
  fill-opacity: 0.55;
  stroke: var(--border);
  stroke-dasharray: 3 3;
}
.veil-t {
  font-size: 10px;
  fill: var(--muted);
  text-anchor: middle;
}
.side {
  flex: 1 1 240px;
  min-width: 0;
}
.what {
  margin: 0;
}
.strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin: 0.4rem 0;
  font-family: var(--mono);
  font-size: 0.8rem;
}
.strip span {
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  border: 1px solid transparent;
}
.strip .real {
  background: var(--accent-soft);
  color: var(--accent);
}
.strip .draft {
  color: var(--danger);
  border-color: var(--danger);
}
.strip .target {
  border: 1px dashed var(--text);
}
.strip .future {
  color: var(--muted);
  opacity: 0.45;
}
.key {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
}
.sw {
  display: inline-block;
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 2px;
  margin-right: 0.35rem;
  vertical-align: -1px;
}
.sw.real {
  background: var(--accent);
  opacity: 0.6;
}
.sw.draft {
  background: var(--danger);
  opacity: 0.6;
}
.sw.target {
  border: 1px dashed var(--text);
}
.hint {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  color: var(--muted);
}
</style>
