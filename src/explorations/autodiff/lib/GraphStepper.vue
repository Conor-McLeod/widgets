<script setup lang="ts">
// Step through forward- or reverse-mode differentiation of a small computational graph.
import { computed, reactive, ref, watch } from 'vue';
import {
  OPS,
  adjoints,
  backwardOrder,
  evaluate,
  fmt,
  label,
  tangents,
  type GraphDef,
  type NodeDef,
} from './graph';

const props = withDefaults(
  defineProps<{
    graph: GraphDef;
    /** Show a "gradient step" button that moves the params downhill. */
    trainable?: boolean;
    initialMode?: 'forward' | 'reverse';
  }>(),
  { trainable: false, initialMode: 'forward' },
);

const g = props.graph;
const byId = new Map(g.nodes.map((n) => [n.id, n]));
const inputNodes = g.nodes.filter((n) => n.op === 'input');
const opNodes = g.nodes.filter((n) => n.op !== 'input');
const params = g.params ?? inputNodes.map((n) => n.id);
const M = opNodes.length;
const back = backwardOrder(g);

const inputs = reactive<Record<string, number>>(Object.fromEntries(inputNodes.map((n) => [n.id, n.value ?? 1])));
const mode = ref<'forward' | 'reverse'>(props.initialMode);
const seed = ref(params[0]);
const step = ref(0);

const total = computed(() => (mode.value === 'forward' ? M : 2 * M + 1));
watch([mode, seed], () => (step.value = 0));

const ev = computed(() => evaluate(g, inputs));
const tan = computed(() => tangents(g, ev.value, seed.value));
const backSteps = computed(() => (mode.value === 'reverse' ? Math.max(0, step.value - M) : 0));
const adj = computed(() => adjoints(g, ev.value, backSteps.value));
const fullAdj = computed(() => adjoints(g, ev.value, M + 1));

// Which nodes have a value showing, and which one the current step touched.
const primalShown = (n: NodeDef) => n.op === 'input' || opNodes.indexOf(n) < Math.min(step.value, M);
const activeId = computed(() => {
  if (step.value === 0) return null;
  if (step.value <= M) return opNodes[step.value - 1].id;
  if (backSteps.value === 1) return g.output;
  return back[backSteps.value - 2].id;
});
const backwardActive = computed(() => mode.value === 'reverse' && backSteps.value >= 2);

// A node's adjoint is final once every consumer has been processed.
function adjFinal(id: string) {
  const done = new Set(back.slice(0, Math.max(0, backSteps.value - 1)).map((n) => n.id));
  if (id === g.output) return backSteps.value >= 1;
  return ev.value.consumers.get(id)!.every((c) => done.has(c));
}

const mark = (s: string, m: string) => s[0] + m + s.slice(1);
const dot = (id: string) => mark(label(byId.get(id)!), '̇');
const bar = (id: string) => mark(label(byId.get(id)!), '̄');
const L = (id: string) => label(byId.get(id)!);
const outName = g.outName;
const varName = (id: string) => (id === g.output ? `${outName} = ${L(id)}` : L(id));

/** Second line in each node: the tangent (forward) or adjoint (reverse). */
function deriv(n: NodeDef): { text: string; final: boolean } | null {
  if (mode.value === 'forward') {
    if (!primalShown(n)) return null;
    return { text: `${dot(n.id)} ${fmt(tan.value.get(n.id)!)}`, final: true };
  }
  if (backSteps.value === 0) return null;
  const touched = n.id === g.output || adj.value.get(n.id) !== 0 || adjFinal(n.id);
  if (!touched) return null;
  return { text: `${bar(n.id)} ${fmt(adj.value.get(n.id)!)}`, final: adjFinal(n.id) };
}

const explain = computed<string[]>(() => {
  const s = step.value;
  const seedName = L(seed.value);
  if (mode.value === 'forward') {
    if (s === 0)
      return [
        `Seed: ${params.map((p) => `${dot(p)} = ${p === seed.value ? 1 : 0}`).join(', ')}.`,
        `Every tangent below answers "how fast does this move when ${seedName} moves?"`,
      ];
    const n = opNodes[s - 1];
    const a = n.args.map(L);
    const op = OPS[n.op];
    const p = ev.value.partial.get(n.id)!;
    const terms = op.dText(a, L(n.id)).map((d, i) => `${d}·${dot(n.args[i])}`);
    const nums = n.args.map((id, i) => `${fmt(p[i])}·${fmt(tan.value.get(id)!)}`);
    return [
      `${L(n.id)} = ${op.def(a)} = ${fmt(ev.value.value.get(n.id)!)}`,
      `${dot(n.id)} = ${terms.join(' + ')} = ${nums.join(' + ')} = ${fmt(tan.value.get(n.id)!)}`,
    ];
  }
  if (s === 0) return ['Reverse mode starts with an ordinary forward pass that records every value.'];
  if (s <= M) {
    const n = opNodes[s - 1];
    return [`${L(n.id)} = ${OPS[n.op].def(n.args.map(L))} = ${fmt(ev.value.value.get(n.id)!)}`, 'Stored for the backward pass.'];
  }
  if (backSteps.value === 1) return [`Seed: ${mark(outName, '̄')} = ${bar(g.output)} = 1. Now sweep backwards.`];
  const n = back[backSteps.value - 2];
  const op = OPS[n.op];
  const a = n.args.map(L);
  const dTexts = op.dText(a, L(n.id));
  const p = ev.value.partial.get(n.id)!;
  const vbar = adj.value.get(n.id)!;
  return n.args.map(
    (id, i) =>
      `${bar(id)} += ${bar(n.id)} · ∂${L(n.id)}/∂${L(id)} = ${fmt(vbar)} · ${dTexts[i]} = ${fmt(vbar)} · ${fmt(p[i])} → ${fmt(adj.value.get(id)!)}`,
  );
});

const result = computed(() => {
  const d = (wrt: string) => `∂${outName}/∂${L(wrt)}`;
  if (mode.value === 'forward') {
    if (step.value < M) return '';
    const others = params.filter((p) => p !== seed.value);
    return `${d(seed.value)} = ${fmt(tan.value.get(g.output)!)}. ${
      others.length ? `For ${others.map(d).join(', ')} you need ${others.length === 1 ? 'another pass' : `${others.length} more passes`}.` : ''
    }`;
  }
  if (step.value < total.value) return '';
  return `One backward pass gave all of them: ${params.map((p) => `${d(p)} = ${fmt(adj.value.get(p)!)}`).join(', ')}.`;
});

// Layout ---------------------------------------------------------------------------------
const NW = 84;
const NH = 58;
const CW = NW + 50;
const RH = 72;
const PAD = 10;
const maxCol = Math.max(...g.nodes.map((n) => n.col));
const maxRow = Math.max(...g.nodes.map((n) => n.row));
const W = PAD * 2 + maxCol * CW + NW;
const H = PAD * 2 + maxRow * RH + NH;
const pos = (n: NodeDef) => ({ x: PAD + n.col * CW, y: PAD + n.row * RH });
const opSym: Record<string, string> = { add: '+', sub: '−', mul: '×', sin: 'sin', ln: 'ln', exp: 'exp', tanh: 'tanh', sq: '²' };

const edges = computed(() =>
  opNodes.flatMap((n) =>
    n.args.map((id, i) => {
      const a = pos(byId.get(id)!);
      const b = pos(n);
      const x1 = a.x + NW;
      const y1 = a.y + NH / 2;
      const x2 = b.x;
      const y2 = b.y + NH / 2;
      const mx = (x1 + x2) / 2;
      const active = backwardActive.value && activeId.value === n.id;
      const contribution = active ? adj.value.get(n.id)! * ev.value.partial.get(n.id)![i] : 0;
      return {
        key: `${id}-${n.id}`,
        d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`,
        active,
        lx: mx,
        ly: (y1 + y2) / 2,
        text: active ? fmt(contribution) : '',
      };
    }),
  ),
);

const minWidth = `${Math.round(W * 0.72)}px`;

// On narrow screens the diagram scrolls sideways; keep the node being worked on in view.
const scroller = ref<HTMLElement | null>(null);
watch(activeId, (id) => {
  const box = scroller.value;
  if (!id || !box || box.scrollWidth <= box.clientWidth) return;
  const n = byId.get(id)!;
  const centre = ((pos(n).x + NW / 2) / W) * box.scrollWidth;
  box.scrollTo({ left: centre - box.clientWidth / 2, behavior: 'smooth' });
});

function go(d: number) {
  step.value = Math.min(total.value, Math.max(0, step.value + d));
}

function descend() {
  const lr = 0.1;
  for (const p of params) {
    const n = byId.get(p)!;
    const v = inputs[p] - lr * fullAdj.value.get(p)!;
    inputs[p] = Math.min(n.max ?? Infinity, Math.max(n.min ?? -Infinity, v));
  }
}
</script>

<template>
  <div class="gs">
    <div class="gs-bar">
      <div class="gs-seg" role="group" aria-label="Mode">
        <button :aria-pressed="mode === 'forward'" @click="mode = 'forward'">Forward mode</button>
        <button :aria-pressed="mode === 'reverse'" @click="mode = 'reverse'">Reverse mode</button>
      </div>
      <div v-if="mode === 'forward'" class="gs-seg" role="group" aria-label="Seed">
        <span class="gs-muted">seed</span>
        <button v-for="p in params" :key="p" :aria-pressed="seed === p" @click="seed = p">{{ L(p) }}</button>
      </div>
    </div>

    <div class="gs-scroll" ref="scroller">
      <svg :viewBox="`0 0 ${W} ${H}`" :style="{ minWidth }" role="img" aria-label="Computational graph">
        <path v-for="e in edges" :key="e.key" :d="e.d" :class="['gs-edge', { on: e.active }]" />
        <g v-for="e in edges.filter((e) => e.text)" :key="e.key + 't'">
          <rect :x="e.lx - 22" :y="e.ly - 9" width="44" height="16" rx="4" class="gs-elabel" />
          <text :x="e.lx" :y="e.ly + 3" text-anchor="middle" class="gs-etext">{{ e.text }}</text>
        </g>
        <g
          v-for="n in g.nodes"
          :key="n.id"
          :transform="`translate(${pos(n).x},${pos(n).y})`"
          :class="['gs-node', { input: n.op === 'input', shown: primalShown(n), active: activeId === n.id }]"
        >
          <rect :width="NW" :height="NH" rx="8" />
          <text x="8" y="18" class="gs-name">{{ n.id === g.output ? `${outName}=${L(n.id)}` : L(n.id) }}</text>
          <text v-if="n.op !== 'input'" :x="NW - 8" y="18" text-anchor="end" class="gs-op">{{ opSym[n.op] }}</text>
          <text x="8" y="35" class="gs-val">{{ primalShown(n) ? fmt(ev.value.get(n.id)!) : '·' }}</text>
          <text v-if="deriv(n)" x="8" y="51" :class="['gs-der', { partial: !deriv(n)!.final }]">{{ deriv(n)!.text }}</text>
        </g>
      </svg>
    </div>

    <div class="gs-bar">
      <div class="gs-seg">
        <button @click="step = 0" :disabled="step === 0" title="Back to the start">⟲</button>
        <button @click="go(-1)" :disabled="step === 0">◀ back</button>
        <button class="primary" @click="go(1)" :disabled="step === total">step ▶</button>
        <button @click="step = total" :disabled="step === total">all ⏭</button>
      </div>
      <span class="gs-muted gs-count">
        {{ mode === 'reverse' ? (step <= M ? 'forward pass' : 'backward pass') : 'forward pass' }} · {{ step }}/{{ total }}
      </span>
    </div>

    <div class="gs-explain" aria-live="polite">
      <p v-for="(line, i) in explain" :key="i">{{ line }}</p>
      <p v-if="result" class="gs-result">{{ result }}</p>
    </div>

    <div class="gs-inputs">
      <label v-for="n in inputNodes" :key="n.id">
        <span>{{ L(n.id) }}</span>
        <input type="range" :min="n.min" :max="n.max" step="0.01" v-model.number="inputs[n.id]" />
        <output>{{ fmt(inputs[n.id]) }}</output>
      </label>
    </div>
    <div v-if="trainable" class="gs-bar gs-train">
      <button @click="descend">Gradient step</button>
      <span class="gs-muted">
        moves {{ params.map(L).join(', ') }} by −0.1 × gradient. {{ outName }} = {{ fmt(ev.value.get(g.output)!) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.gs {
  font-size: 0.9rem;
}
.gs-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin: 0.25rem 0 0.75rem;
}
.gs-seg {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}
.gs-muted {
  color: var(--muted);
  font-size: 0.82rem;
}
.gs-count {
  font-family: var(--mono);
}
button {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.28rem 0.6rem;
  cursor: pointer;
}
button[aria-pressed='true'],
button.primary {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
.gs-scroll {
  overflow-x: auto;
  margin: 0 -0.25rem;
  padding: 0 0.25rem;
}
svg {
  display: block;
  width: 100%;
  height: auto;
  font-family: var(--mono);
}
.gs-edge {
  fill: none;
  stroke: var(--border);
  stroke-width: 1.5;
}
.gs-edge.on {
  stroke: var(--accent);
  stroke-width: 2.5;
}
.gs-elabel {
  fill: var(--accent);
}
.gs-etext {
  fill: var(--surface);
  font-size: 10px;
  font-weight: 600;
}
.gs-node rect {
  fill: var(--bg);
  stroke: var(--border);
  stroke-width: 1.5;
  transition: fill 120ms, stroke 120ms;
}
.gs-node.shown rect {
  stroke: var(--muted);
}
.gs-node.input rect {
  stroke-dasharray: 4 3;
}
.gs-node.active rect {
  fill: var(--accent-soft);
  stroke: var(--accent);
  stroke-width: 2;
}
.gs-name {
  fill: var(--text);
  font-size: 13px;
  font-weight: 600;
}
.gs-op {
  fill: var(--muted);
  font-size: 12px;
}
.gs-val {
  fill: var(--text);
  font-size: 12px;
}
.gs-node:not(.shown) .gs-val {
  fill: var(--muted);
}
.gs-der {
  fill: var(--accent);
  font-size: 12px;
  font-weight: 600;
}
.gs-der.partial {
  opacity: 0.55;
  font-weight: 400;
}
.gs-explain {
  min-height: 4.2em;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-family: var(--mono);
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}
.gs-explain p {
  margin: 0.15rem 0;
}
.gs-result {
  color: var(--accent);
  font-weight: 600;
}
.gs-inputs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: 0.25rem 1.25rem;
  margin-top: 0.75rem;
}
.gs-inputs label {
  display: grid;
  grid-template-columns: 1.6rem 1fr 3.5rem;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--mono);
}
.gs-inputs input {
  min-width: 0;
  width: 100%;
  accent-color: var(--accent);
}
.gs-inputs output {
  text-align: right;
}
.gs-train {
  margin-top: 0.75rem;
}
</style>
