<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Context, STATIC_TREE, accepted, dynamicTree, expected, rng, type Path, type Scenario } from './draft';

const BUDGET = STATIC_TREE.length;
const DEPTH = 6;

const scenarios: { key: Scenario; label: string; note: string }[] = [
  { key: 'boilerplate', label: 'Predictable', note: 'boilerplate code: the draft is sure of almost every token' },
  { key: 'open', label: 'Open-ended', note: 'creative writing: no token is a safe bet' },
  { key: 'fork', label: 'One fork', note: 'confident, except one step that is a coin flip between two tokens' },
  { key: 'mixed', label: 'Mixed', note: 'confidence varies from token to token' },
];

const scenario = ref<Scenario>('fork');
const seed = ref(1);
const topK = ref(4);

const ctx = computed(() => new Context(scenario.value, seed.value));
const dyn = computed(() => dynamicTree(ctx.value, topK.value, DEPTH, BUDGET));

interface Lane {
  key: 'static' | 'dynamic';
  label: string;
  note: string;
  paths: Path[];
}
const lanes = computed<Lane[]>(() => [
  { key: 'static', label: 'Static tree', note: 'EAGLE-1: same shape every step', paths: STATIC_TREE },
  {
    key: 'dynamic',
    label: 'Dynamic tree',
    note: `EAGLE-2: drafted ${dyn.value.pool.length}, kept the best ${BUDGET}`,
    paths: dyn.value.kept,
  },
]);

// ---- verification ----------------------------------------------------------------------------

const truth = ref<Path | null>(null);
const tally = ref({ n: 0, static: 0, dynamic: 0 });
let draw = rng(12345);

function resetRuns() {
  truth.value = null;
  tally.value = { n: 0, static: 0, dynamic: 0 };
}
watch([scenario, seed, topK], resetRuns);

function verify(times: number) {
  for (let i = 0; i < times; i++) {
    const t = ctx.value.sampleTruth(DEPTH + 2, draw);
    tally.value.n++;
    tally.value.static += accepted(STATIC_TREE, t);
    tally.value.dynamic += accepted(dyn.value.kept, t);
    truth.value = t;
  }
}

function reroll() {
  seed.value++;
  draw = rng(seed.value * 7919);
}

// ---- layout ----------------------------------------------------------------------------------

const COL = 46;
const ROW = 15;
const PAD = 14;

interface LNode {
  key: string;
  path: Path;
  x: number;
  y: number;
  value: number;
  conf: number;
  parent?: { x: number; y: number };
}

function layout(paths: Path[]): { nodes: LNode[]; rows: number } {
  const keys = new Set(paths.map((p) => p.join('.')));
  const children = new Map<string, Path[]>();
  for (const p of paths) {
    const parent = p.slice(0, -1).join('.');
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(p);
  }
  for (const list of children.values()) list.sort((a, b) => a[a.length - 1] - b[b.length - 1]);
  const nodes: LNode[] = [];
  let row = 0;
  const place = (p: Path, parentPos?: { x: number; y: number }): number => {
    const key = p.join('.');
    const kids = children.get(key) ?? [];
    const x = PAD + p.length * COL;
    const node: LNode = {
      key,
      path: p,
      x,
      y: 0,
      value: ctx.value.value(p),
      conf: p.length ? ctx.value.dist(p.slice(0, -1))[p[p.length - 1]] : 1,
      parent: parentPos,
    };
    nodes.push(node);
    if (!kids.length) {
      node.y = PAD + row++ * ROW;
    } else {
      // Children need the parent's position for their edge, so place them with a placeholder and patch.
      const pos = { x, y: 0 };
      const ys = kids.filter((k) => keys.has(k.join('.'))).map((k) => place(k, pos));
      node.y = (ys[0] + ys[ys.length - 1]) / 2;
      pos.y = node.y;
    }
    return node.y;
  };
  place([]);
  return { nodes, rows: row };
}

const layouts = computed(() => lanes.value.map((l) => layout(l.paths)));
const height = computed(() => PAD * 2 + (Math.max(...layouts.value.map((l) => l.rows)) - 1) * ROW);
const width = PAD * 2 + DEPTH * COL + 10;

const onTruth = (lane: Lane, p: Path) => {
  const t = truth.value;
  if (!t || p.length === 0) return false;
  const n = accepted(lane.paths, t);
  return p.length <= n && p.every((r, i) => r === t[i]);
};

const fmt = (v: number) => (v >= 0.995 ? '1' : v < 0.005 ? '0' : v.toFixed(2).slice(1));
const scenarioNote = computed(() => scenarios.find((s) => s.key === scenario.value)!.note);
</script>

<template>
  <div class="dt">
    <div class="row">
      <span class="lbl">Context</span>
      <div class="seg">
        <button
          v-for="s in scenarios"
          :key="s.key"
          :class="{ on: scenario === s.key }"
          @click="scenario = s.key"
        >
          {{ s.label }}
        </button>
      </div>
      <button class="ghost" @click="reroll" title="Same kind of context, different draws">↻ reroll</button>
    </div>
    <p class="note">{{ scenarioNote }}</p>
    <label class="row">
      <span class="lbl">EAGLE-2 top-<i>k</i></span>
      <input type="range" min="2" max="8" step="1" v-model.number="topK" />
      <code>{{ topK }}</code>
      <span class="muted">nodes expanded per depth, {{ topK }} children each</span>
    </label>

    <div class="lanes">
      <section v-for="(lane, li) in lanes" :key="lane.key" class="lane">
        <header>
          <strong>{{ lane.label }}</strong>
          <span class="muted">{{ lane.note }}</span>
        </header>
        <svg :viewBox="`0 0 ${width} ${height}`" :style="{ aspectRatio: `${width} / ${height}` }">
          <g class="cols">
            <text v-for="d in DEPTH" :key="d" :x="PAD + d * COL" :y="height - 2">{{ d }}</text>
          </g>
          <line
            v-for="n in layouts[li].nodes.filter((n) => n.parent)"
            :key="'e' + n.key"
            :x1="n.parent!.x"
            :y1="n.parent!.y"
            :x2="n.x"
            :y2="n.y"
            class="edge"
            :class="{ hot: onTruth(lane, n.path) }"
            :stroke-width="0.6 + 2.4 * n.conf"
          />
          <g v-for="n in layouts[li].nodes" :key="n.key" :transform="`translate(${n.x},${n.y})`">
            <title>
              {{ n.path.length ? `ranks ${n.path.map((r) => r + 1).join('→')}: this step ${(100 * n.conf).toFixed(0)}%, whole path ${(100 * n.value).toFixed(1)}%` : 'last verified token' }}
            </title>
            <circle
              r="5"
              class="node"
              :class="{ root: !n.path.length, hot: onTruth(lane, n.path) }"
              :style="{ fillOpacity: n.path.length ? 0.12 + 0.88 * Math.sqrt(n.value) : 1 }"
            />
            <text v-if="n.path.length" x="7.5" y="3.2" class="val">{{ fmt(n.value) }}</text>
          </g>
        </svg>
        <p class="stat">
          expected <code>{{ (1 + expected(ctx, lane.paths)).toFixed(2) }}</code> tokens per target pass
          <span v-if="tally.n" class="muted">
            · measured <code>{{ (1 + tally[lane.key] / tally.n).toFixed(2) }}</code> over {{ tally.n }}
          </span>
          <span v-if="truth" class="muted"> · last: {{ accepted(lane.paths, truth) }} + 1</span>
        </p>
      </section>
    </div>

    <div class="row">
      <button @click="verify(1)">Verify once</button>
      <button @click="verify(200)">Verify ×200</button>
      <span class="muted small">Both trees face the same target continuations. The extra +1 is the token the
        target produces itself at the first mismatch.</span>
    </div>
  </div>
</template>

<style scoped>
.dt {
  font-size: 0.9rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.6rem;
  margin-top: 0.5rem;
}
.lbl {
  color: var(--muted);
  min-width: 5.5rem;
}
.seg {
  display: inline-flex;
  flex-wrap: wrap;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.seg button {
  border: 0;
  border-radius: 0;
  border-right: 1px solid var(--border);
}
.seg button:last-child {
  border-right: 0;
}
button {
  font: inherit;
  font-size: 0.82rem;
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
button.on {
  background: var(--accent-soft);
  color: var(--accent);
}
button.ghost {
  color: var(--muted);
}
input[type='range'] {
  width: 7rem;
  accent-color: var(--accent);
}
.note {
  margin: 0.3rem 0 0;
  color: var(--muted);
  font-size: 0.8rem;
}
.muted {
  color: var(--muted);
}
.small {
  font-size: 0.78rem;
}
.lanes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.6rem 1rem;
  margin-top: 0.6rem;
}
.lane header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 0.5rem;
  align-items: baseline;
}
.lane header .muted {
  font-size: 0.78rem;
}
svg {
  display: block;
  width: 100%;
  height: auto;
  margin-top: 0.3rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
}
.cols text {
  font-family: var(--mono);
  font-size: 7px;
  fill: var(--muted);
  text-anchor: middle;
}
.edge {
  stroke: var(--muted);
  stroke-opacity: 0.45;
  transition: stroke 0.2s;
}
.edge.hot {
  stroke: var(--accent);
  stroke-opacity: 1;
}
.node {
  fill: var(--accent);
  stroke: var(--accent);
  stroke-width: 1;
}
.node.root {
  fill: var(--text);
  stroke: var(--text);
}
.node.hot {
  stroke: var(--text);
  stroke-width: 2;
}
.val {
  font-family: var(--mono);
  font-size: 7.5px;
  fill: var(--muted);
}
.stat {
  margin: 0.3rem 0 0;
  font-size: 0.82rem;
}
</style>
