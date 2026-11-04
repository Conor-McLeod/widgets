// A toy stand-in for one attention layer, shared by the widgets on this page.
//
// For a query at position q, `trueLogits` returns the scores the full (dense) attention would
// compute against keys 0..q. They are made up, but shaped like real attention: a bit of weight on
// nearby tokens, a sink at position 0, and a few far-back tokens that happen to match the query's
// content. `indexerLogits` is a cheap scorer trying to rank the keys the same way. Its quality
// depends on how many warm-up steps it has been trained for.

export type Method = 'indexer' | 'oracle' | 'window';

/** Small deterministic PRNG so every reload draws the same toy. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const rowCache = new Map<string, { truth: number[]; z: number[]; init: number[] }>();

function row(q: number, seed: number) {
  const key = `${seed}:${q}`;
  let r = rowCache.get(key);
  if (r) return r;
  const rand = mulberry32(seed * 7919 + q * 104729 + 13);
  const truth: number[] = [];
  const z: number[] = [];
  const init: number[] = [];
  for (let s = 0; s <= q; s++) {
    let l = 0.6 * gaussian(rand);
    l += 3 * Math.exp(-(q - s) / 3); // nearby tokens
    if (s === 0) l += 2.6; // attention sink
    truth.push(l);
    z.push(gaussian(rand));
    init.push(1.6 * gaussian(rand));
  }
  // A few earlier tokens whose content matches this query, anywhere in the prefix.
  const matches = q < 6 ? 0 : 2 + Math.floor(rand() * 3);
  for (let m = 0; m < matches; m++) {
    const s = 1 + Math.floor(rand() * Math.max(1, q - 4));
    truth[s] += 3.2 + 1.4 * rand();
  }
  r = { truth, z, init };
  rowCache.set(key, r);
  return r;
}

export function trueLogits(q: number, seed = 1): number[] {
  return row(q, seed).truth;
}

/** How well-aligned the indexer is after this many warm-up steps (0 = random init, → 1). */
export function alignment(steps: number) {
  return 1 - Math.exp(-steps / 220);
}

/**
 * Indexer scores after `steps` warm-up steps: a blend of its random initial scoring and the
 * truth, plus residual noise it never quite gets rid of (it is a much smaller model).
 */
export function indexerLogits(q: number, steps: number, seed = 1): number[] {
  const { truth, z, init } = row(q, seed);
  const a = alignment(steps);
  return truth.map((t, s) => a * t + (1 - a) * init[s] + (0.35 + 0.9 * (1 - a)) * z[s]);
}

export function softmax(xs: number[]): number[] {
  const m = Math.max(...xs);
  const e = xs.map((x) => Math.exp(x - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / sum);
}

/** KL(p ‖ q) in nats. */
export function kl(p: number[], q: number[]) {
  let d = 0;
  for (let i = 0; i < p.length; i++) if (p[i] > 0) d += p[i] * Math.log(p[i] / Math.max(q[i], 1e-12));
  return d;
}

/** Indices of the k largest scores. */
export function topK(scores: number[], k: number): Set<number> {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  return new Set(idx.slice(0, k));
}

/** Which keys query q reads under each scheme. */
export function select(method: Method, q: number, k: number, steps: number, seed = 1): Set<number> {
  if (k >= q + 1) return new Set(Array.from({ length: q + 1 }, (_, i) => i));
  if (method === 'window') return new Set(Array.from({ length: k }, (_, i) => q - i));
  if (method === 'oracle') return topK(trueLogits(q, seed), k);
  return topK(indexerLogits(q, steps, seed), k);
}
