// A toy draft model and the two ways of turning it into a tree of guesses.
//
// Every node in the tree of possible continuations has a distribution over its next token. We
// only care about the top few candidates, so a node's distribution is `CANDIDATES` probabilities in
// rank order plus leftover mass for "something else". The toy is perfectly calibrated: the target
// model's next token is drawn from the same distribution the draft reports. EAGLE-2's paper found
// the real draft head is close to that, which is the whole reason a dynamic tree works.

export const CANDIDATES = 6;

/** A node is named by the ranks taken from the root: [0, 2] = the top token, then the third. */
export type Path = number[];

export type Scenario = 'boilerplate' | 'open' | 'fork' | 'mixed';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Context {
  private memo = new Map<string, number[]>();
  constructor(
    readonly scenario: Scenario,
    readonly seed: number,
  ) {}

  /** Draft confidence for each of the top candidates after `path`, in decreasing order. */
  dist(path: Path): number[] {
    const key = path.join('.');
    let d = this.memo.get(key);
    if (d) return d;
    const r = rng(hash(`${this.scenario}:${this.seed}:${key}`));
    const depth = path.length;
    // How confident is the draft about its top guess here, and how much of the rest goes to #2?
    let top: number;
    let second = 0.35 + 0.3 * r();
    switch (this.scenario) {
      case 'boilerplate':
        top = 0.84 + 0.12 * r();
        break;
      case 'open':
        top = 0.22 + 0.2 * r();
        second = 0.25 + 0.15 * r();
        break;
      case 'fork':
        // Confident, except one step where two continuations are about equally likely.
        if (depth === 1 && path[0] === 0) {
          top = 0.47 + 0.04 * r();
          second = 0.86;
        } else top = 0.8 + 0.15 * r();
        break;
      default:
        top = 0.2 + 0.75 * r();
    }
    const rest = 1 - top;
    const tail = Array.from({ length: CANDIDATES - 2 }, (_, i) => (0.5 + r()) * 0.6 ** i);
    const tailSum = tail.reduce((a, b) => a + b, 0);
    // 15% of what's left goes to tokens outside the top candidates.
    const others = rest * (1 - second) * 0.85;
    d = [top, rest * second, ...tail.map((t) => (others * t) / tailSum)];
    d.sort((a, b) => b - a);
    this.memo.set(key, d);
    return d;
  }

  /** Probability the draft's path matches what the target generates: the product of confidences. */
  value(path: Path): number {
    let v = 1;
    for (let i = 0; i < path.length; i++) v *= this.dist(path.slice(0, i))[path[i]];
    return v;
  }

  /** Draw the target's actual continuation. Rank -1 means a token outside the top candidates. */
  sampleTruth(depth: number, u: () => number): Path {
    const out: Path = [];
    while (out.length < depth) {
      const d = this.dist(out);
      let x = u();
      let pick = -1;
      for (let i = 0; i < d.length; i++) {
        if ((x -= d[i]) < 0) {
          pick = i;
          break;
        }
      }
      if (pick < 0) break;
      out.push(pick);
    }
    return out;
  }
}

/**
 * A fixed tree in the style of EAGLE-1 (and Medusa before it): wide near the root, deep down the
 * top-ranked branch, the same shape whatever the context.
 */
export const STATIC_TREE: Path[] = [
  [0], [1], [2], [3],
  [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0],
  [0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 1, 0], [0, 1, 1], [0, 2, 0], [1, 0, 0],
  [0, 0, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [0, 1, 0, 0],
  [0, 0, 0, 0, 0], [0, 0, 0, 0, 1],
];

export interface DynamicTree {
  /** Every candidate the draft produced while expanding. */
  pool: Path[];
  /** The `budget` highest-value candidates, sent to the target for verification. */
  kept: Path[];
  /** Which nodes were expanded at each depth. */
  expanded: Path[][];
}

/**
 * EAGLE-2. Expansion: at each depth, run the draft on the `topK` most valuable new nodes and take
 * each one's `topK` children. Reranking: keep the `budget` most valuable nodes of everything drafted.
 * A child is never worth more than its parent, so the kept set is always a connected tree.
 */
export function dynamicTree(ctx: Context, topK: number, depth: number, budget: number): DynamicTree {
  const pool: Path[] = [];
  const expanded: Path[][] = [];
  let frontier: Path[] = [[]];
  for (let d = 0; d < depth; d++) {
    const fresh: Path[] = [];
    for (const p of frontier) for (let r = 0; r < topK; r++) fresh.push([...p, r]);
    pool.push(...fresh);
    fresh.sort((a, b) => ctx.value(b) - ctx.value(a));
    frontier = fresh.slice(0, topK);
    expanded.push(frontier);
  }
  // Ties go to the shallower node so a parent is always ranked ahead of its child.
  const kept = [...pool]
    .sort((a, b) => ctx.value(b) - ctx.value(a) || a.length - b.length)
    .slice(0, budget);
  return { pool, kept, expanded };
}

/** How many tokens of `truth` the tree contains as a path from the root. */
export function accepted(tree: Path[], truth: Path): number {
  const keys = new Set(tree.map((p) => p.join('.')));
  let n = 0;
  while (n < truth.length && keys.has(truth.slice(0, n + 1).join('.'))) n++;
  return n;
}

/** Expected accepted draft tokens: each node is accepted with probability equal to its value. */
export function expected(ctx: Context, tree: Path[]): number {
  return tree.reduce((s, p) => s + ctx.value(p), 0);
}

export { rng };
