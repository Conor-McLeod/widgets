// A tiny computational-graph model for the stepper widgets. Each node is one elementary
// operation; forward mode carries a tangent alongside each value, reverse mode sweeps
// adjoints back from the output. Everything is plain data so the widgets can show every step.

export type Op = 'input' | 'add' | 'sub' | 'mul' | 'sin' | 'ln' | 'exp' | 'tanh' | 'sq';

export interface NodeDef {
  id: string;
  op: Op;
  args: string[];
  /** Grid position in the diagram: column, row (fractional rows are fine). */
  col: number;
  row: number;
  /** Display name for inputs, e.g. "x₁" or "w". */
  name?: string;
  /** Slider range for inputs. */
  min?: number;
  max?: number;
  value?: number;
}

export interface GraphDef {
  nodes: NodeDef[];
  output: string;
  /** What to call the output in prose, e.g. "y" or "L". */
  outName: string;
  /** Inputs the reader is allowed to seed in forward mode (default: all inputs). */
  params?: string[];
}

interface OpInfo {
  f: (a: number[]) => number;
  /** Local partial derivatives ∂v/∂aᵢ, given argument values and this node's own value. */
  d: (a: number[], v: number) => number[];
  /** Definition in terms of argument names, for the trace table. */
  def: (a: string[]) => string;
  /** Local partials as formulas in argument names (and own name `v`). */
  dText: (a: string[], v: string) => string[];
}

export const OPS: Record<Op, OpInfo> = {
  input: { f: () => NaN, d: () => [], def: () => 'input', dText: () => [] },
  add: { f: ([a, b]) => a + b, d: () => [1, 1], def: ([a, b]) => `${a} + ${b}`, dText: () => ['1', '1'] },
  sub: { f: ([a, b]) => a - b, d: () => [1, -1], def: ([a, b]) => `${a} − ${b}`, dText: () => ['1', '−1'] },
  mul: { f: ([a, b]) => a * b, d: ([a, b]) => [b, a], def: ([a, b]) => `${a} × ${b}`, dText: ([a, b]) => [b, a] },
  sin: { f: ([a]) => Math.sin(a), d: ([a]) => [Math.cos(a)], def: ([a]) => `sin ${a}`, dText: ([a]) => [`cos ${a}`] },
  ln: { f: ([a]) => Math.log(a), d: ([a]) => [1 / a], def: ([a]) => `ln ${a}`, dText: ([a]) => [`1/${a}`] },
  exp: { f: ([a]) => Math.exp(a), d: (_, v) => [v], def: ([a]) => `exp ${a}`, dText: (_, v) => [v] },
  tanh: { f: ([a]) => Math.tanh(a), d: (_, v) => [1 - v * v], def: ([a]) => `tanh ${a}`, dText: (_, v) => [`1 − ${v}²`] },
  sq: { f: ([a]) => a * a, d: ([a]) => [2 * a], def: ([a]) => `${a}²`, dText: ([a]) => [`2${a}`] },
};

/** Subscript-style label: v-1 → v₋₁, v3 → v₃. */
export function label(n: NodeDef): string {
  if (n.name) return n.name;
  const sub = '₀₁₂₃₄₅₆₇₈₉';
  const num = n.id.slice(1).replace(/-/, '₋').replace(/\d/g, (d) => sub[Number(d)]);
  return 'v' + num;
}

export interface Evaluated {
  order: NodeDef[]; // topological (the definition order is required to be topological)
  value: Map<string, number>;
  /** Local partials of each node w.r.t. each of its args, aligned with node.args. */
  partial: Map<string, number[]>;
  /** For each node, the nodes that use it. */
  consumers: Map<string, string[]>;
}

export function evaluate(g: GraphDef, inputs: Record<string, number>): Evaluated {
  const value = new Map<string, number>();
  const partial = new Map<string, number[]>();
  const consumers = new Map<string, string[]>();
  for (const n of g.nodes) consumers.set(n.id, []);
  for (const n of g.nodes) {
    if (n.op === 'input') {
      value.set(n.id, inputs[n.id]);
      partial.set(n.id, []);
      continue;
    }
    const a = n.args.map((id) => value.get(id)!);
    const v = OPS[n.op].f(a);
    value.set(n.id, v);
    partial.set(n.id, OPS[n.op].d(a, v));
    for (const id of n.args) consumers.get(id)!.push(n.id);
  }
  return { order: g.nodes, value, partial, consumers };
}

/** Forward mode: tangent of every node given a one-hot seed on `seed`. */
export function tangents(g: GraphDef, ev: Evaluated, seed: string): Map<string, number> {
  const t = new Map<string, number>();
  for (const n of g.nodes) {
    if (n.op === 'input') t.set(n.id, n.id === seed ? 1 : 0);
    else {
      const p = ev.partial.get(n.id)!;
      t.set(n.id, n.args.reduce((s, id, i) => s + p[i] * t.get(id)!, 0));
    }
  }
  return t;
}

/** The order reverse mode visits nodes in: every operation, last one first. */
export const backwardOrder = (g: GraphDef) => g.nodes.filter((n) => n.op !== 'input').reverse();

/**
 * Reverse mode, stopped after `steps` backward steps. Returns the adjoints accumulated so far.
 * Step 1 seeds the output with 1; step k > 1 propagates the (k−1)-th node of `backwardOrder`.
 */
export function adjoints(g: GraphDef, ev: Evaluated, steps: number): Map<string, number> {
  const a = new Map<string, number>();
  for (const n of g.nodes) a.set(n.id, 0);
  if (steps <= 0) return a;
  a.set(g.output, 1);
  const order = backwardOrder(g);
  for (let k = 0; k < steps - 1 && k < order.length; k++) {
    const n = order[k];
    const p = ev.partial.get(n.id)!;
    n.args.forEach((id, i) => a.set(id, a.get(id)! + a.get(n.id)! * p[i]));
  }
  return a;
}

export const fmt = (x: number) => {
  if (!Number.isFinite(x)) return String(x);
  if (Object.is(x, -0) || Math.abs(x) < 5e-5) return '0';
  const s = Math.abs(x) >= 1000 ? x.toFixed(1) : x.toFixed(4);
  return s.replace(/\.?0+$/, '').replace('-', '−');
};

// Graphs ----------------------------------------------------------------------------------

/** f(x₁, x₂) = ln x₁ + x₁x₂ − sin x₂, the standard example from Baydin et al. (2018). */
export const BAYDIN: GraphDef = {
  output: 'v5',
  outName: 'y',
  nodes: [
    { id: 'v-1', op: 'input', args: [], col: 0, row: 0, name: 'x₁', min: 0.2, max: 4, value: 2 },
    { id: 'v0', op: 'input', args: [], col: 0, row: 2, name: 'x₂', min: -4, max: 6, value: 5 },
    { id: 'v1', op: 'ln', args: ['v-1'], col: 1, row: 0 },
    { id: 'v2', op: 'mul', args: ['v-1', 'v0'], col: 1, row: 1 },
    { id: 'v3', op: 'sin', args: ['v0'], col: 1, row: 2 },
    { id: 'v4', op: 'add', args: ['v1', 'v2'], col: 2, row: 0.5 },
    { id: 'v5', op: 'sub', args: ['v4', 'v3'], col: 3, row: 1.25 },
  ],
};

/** One tanh neuron with a squared-error loss: L = (tanh(w₁x₁ + w₂x₂ + b) − t)². */
export const NEURON: GraphDef = {
  output: 'v7',
  outName: 'L',
  params: ['w1', 'w2', 'b'],
  nodes: [
    { id: 'x1', op: 'input', args: [], col: 0, row: 0, name: 'x₁', min: -2, max: 2, value: 1.5 },
    { id: 'w1', op: 'input', args: [], col: 0, row: 1, name: 'w₁', min: -2, max: 2, value: 0.8 },
    { id: 'x2', op: 'input', args: [], col: 0, row: 2, name: 'x₂', min: -2, max: 2, value: -1 },
    { id: 'w2', op: 'input', args: [], col: 0, row: 3, name: 'w₂', min: -2, max: 2, value: 0.4 },
    { id: 'b', op: 'input', args: [], col: 0, row: 4, name: 'b', min: -2, max: 2, value: 0.1 },
    { id: 't', op: 'input', args: [], col: 4, row: 4, name: 't', min: -1, max: 1, value: -0.5 },
    { id: 'v1', op: 'mul', args: ['x1', 'w1'], col: 1, row: 0.5 },
    { id: 'v2', op: 'mul', args: ['x2', 'w2'], col: 1, row: 2.5 },
    { id: 'v3', op: 'add', args: ['v1', 'v2'], col: 2, row: 1.5 },
    { id: 'v4', op: 'add', args: ['v3', 'b'], col: 3, row: 2 },
    { id: 'v5', op: 'tanh', args: ['v4'], col: 4, row: 2 },
    { id: 'v6', op: 'sub', args: ['v5', 't'], col: 5, row: 3 },
    { id: 'v7', op: 'sq', args: ['v6'], col: 6, row: 3 },
  ],
};
