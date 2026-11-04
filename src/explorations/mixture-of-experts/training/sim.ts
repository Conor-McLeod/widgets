// A miniature, trainable Switch-style MoE layer.
//
// Tokens are 2-D points drawn from a handful of clusters, and the target y is a different linear
// rule in each cluster, so the layer does well when every cluster gets an expert to itself.
//
//   router:  logits = R x + c,  p = softmax(logits)
//   expert:  e_i(x) = a_i · x + b_i              (a tiny linear "FFN")
//   layer:   ŷ = p_k · e_k(x),  k = argmax p     (top-1, scaled by its gate, as in Switch)
//
// Each expert accepts at most ceil(capacity · B / E) tokens per batch; overflow tokens are
// dropped (ŷ = 0, as if only the residual connection carried them).
//
// Loss = MSE + α · E · Σ f_i P_i, where f_i is the fraction of tokens routed to expert i and
// P_i is the mean router probability for i. f is treated as a constant, so the gradient only
// flows through P (the Switch Transformer auxiliary load-balancing loss).

export interface Config {
  /** weight of the load-balancing loss; 0 turns it off */
  alpha: number;
  /** capacity factor: 1 means exactly an even share per expert */
  capacity: number;
}

export interface Stats {
  mse: number;
  aux: number;
  /** fraction of the batch routed to each expert (before capacity) */
  load: number[];
  /** fraction of the batch dropped for lack of capacity */
  dropped: number;
}

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tokens come from CLUSTERS blobs arranged on a ring, like groups of related tokens in a real
// model. Each blob has its own linear rule y = w0 x0 + w1 x1 + b; an expert that has to cover two
// blobs can only fit a compromise between their rules.
export const CLUSTERS = 8;
const RADIUS = 0.62;
const SPREAD = 0.11;
export const CENTERS: [number, number][] = Array.from({ length: CLUSTERS }, (_, c) => {
  const a = (c / CLUSTERS) * 2 * Math.PI + 0.3;
  return [RADIUS * Math.cos(a), RADIUS * Math.sin(a)];
});
const RULES: [number, number, number][] = [
  [1.2, 0.6, 1.1],
  [-0.9, 1.1, -0.9],
  [0.4, -1.2, 0.4],
  [-1.1, -0.3, -1.3],
  [0.8, 0.9, 0.9],
  [-0.5, -1.0, -0.4],
  [1.0, -0.7, 1.4],
  [-0.6, 0.5, -1.1],
];

export function target(c: number, x0: number, x1: number): number {
  const [w0, w1, b] = RULES[c];
  return w0 * (x0 - CENTERS[c][0]) + w1 * (x1 - CENTERS[c][1]) + b;
}

function gauss(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** A token: its cluster and position. */
export function sample(rand: () => number): [number, number, number] {
  const c = Math.floor(rand() * CLUSTERS);
  return [c, CENTERS[c][0] + SPREAD * gauss(rand), CENTERS[c][1] + SPREAD * gauss(rand)];
}

/** Adam over a flat parameter vector. */
class Adam {
  m: Float64Array;
  v: Float64Array;
  t = 0;
  lr: number;
  constructor(n: number, lr: number) {
    this.lr = lr;
    this.m = new Float64Array(n);
    this.v = new Float64Array(n);
  }
  step(p: Float64Array, g: Float64Array) {
    const b1 = 0.9;
    const b2 = 0.999;
    this.t++;
    const c1 = 1 - b1 ** this.t;
    const c2 = 1 - b2 ** this.t;
    for (let i = 0; i < p.length; i++) {
      this.m[i] = b1 * this.m[i] + (1 - b1) * g[i];
      this.v[i] = b2 * this.v[i] + (1 - b2) * g[i] * g[i];
      p[i] -= (this.lr * (this.m[i] / c1)) / (Math.sqrt(this.v[i] / c2) + 1e-8);
    }
  }
}

export class MoE {
  readonly E: number;
  /** router: per expert [r0, r1, c] */
  router: Float64Array;
  /** experts: per expert [a0, a1, b] */
  experts: Float64Array;
  private ro: Adam;
  private eo: Adam;
  private rand: () => number;
  steps = 0;

  constructor(E: number, seed: number, lr = 0.03) {
    this.E = E;
    this.rand = rng(seed);
    this.router = new Float64Array(3 * E);
    this.experts = new Float64Array(3 * E);
    // Small random router so early choices are close to arbitrary, as in a real init.
    for (let i = 0; i < this.router.length; i++) this.router[i] = (this.rand() - 0.5) * 0.4;
    for (let i = 0; i < this.experts.length; i++) this.experts[i] = (this.rand() - 0.5) * 0.2;
    this.ro = new Adam(this.router.length, lr);
    this.eo = new Adam(this.experts.length, lr);
  }

  probs(x0: number, x1: number, out = new Float64Array(this.E)): Float64Array {
    let max = -Infinity;
    for (let i = 0; i < this.E; i++) {
      const r = this.router;
      out[i] = r[3 * i] * x0 + r[3 * i + 1] * x1 + r[3 * i + 2];
      if (out[i] > max) max = out[i];
    }
    let sum = 0;
    for (let i = 0; i < this.E; i++) sum += out[i] = Math.exp(out[i] - max);
    for (let i = 0; i < this.E; i++) out[i] /= sum;
    return out;
  }

  choose(x0: number, x1: number): number {
    const p = this.probs(x0, x1);
    let k = 0;
    for (let i = 1; i < this.E; i++) if (p[i] > p[k]) k = i;
    return k;
  }

  expert(k: number, x0: number, x1: number): number {
    const e = this.experts;
    return e[3 * k] * x0 + e[3 * k + 1] * x1 + e[3 * k + 2];
  }

  /** Sample a batch and take one optimiser step. */
  step(B: number, cfg: Config): Stats {
    const E = this.E;
    const xs = new Float64Array(2 * B);
    const cs = new Int32Array(B);
    for (let b = 0; b < B; b++) [cs[b], xs[2 * b], xs[2 * b + 1]] = sample(this.rand);

    const P = new Float64Array(B * E);
    const choice = new Int32Array(B);
    const count = new Float64Array(E);
    const kept = new Uint8Array(B);
    const cap = Math.ceil((cfg.capacity * B) / E);
    const used = new Int32Array(E);

    for (let b = 0; b < B; b++) {
      const p = P.subarray(b * E, (b + 1) * E);
      this.probs(xs[2 * b], xs[2 * b + 1], p);
      let k = 0;
      for (let i = 1; i < E; i++) if (p[i] > p[k]) k = i;
      choice[b] = k;
      count[k]++;
      if (used[k] < cap) {
        used[k]++;
        kept[b] = 1;
      }
    }

    const f = Array.from(count, (c) => c / B);
    const Pm = new Float64Array(E);
    for (let b = 0; b < B; b++) for (let i = 0; i < E; i++) Pm[i] += P[b * E + i] / B;

    const gR = new Float64Array(3 * E);
    const gE = new Float64Array(3 * E);
    let mse = 0;
    let dropped = 0;
    let fp = 0;
    for (let i = 0; i < E; i++) fp += f[i] * Pm[i];
    const aux = cfg.alpha * E * fp;

    for (let b = 0; b < B; b++) {
      const x0 = xs[2 * b];
      const x1 = xs[2 * b + 1];
      const y = target(cs[b], x0, x1);
      const p = P.subarray(b * E, (b + 1) * E);
      const k = choice[b];

      // Aux gradient wrt logits: (αE/B) p_j (f_j − Σ_i f_i p_i)
      let fpb = 0;
      for (let i = 0; i < E; i++) fpb += f[i] * p[i];
      const dl = new Float64Array(E);
      for (let j = 0; j < E; j++) dl[j] = ((cfg.alpha * E) / B) * p[j] * (f[j] - fpb);

      if (!kept[b]) {
        dropped++;
        mse += (y * y) / B;
      } else {
        const ek = this.expert(k, x0, x1);
        const yhat = p[k] * ek;
        const err = yhat - y;
        mse += (err * err) / B;
        const g = (2 * err) / B;
        gE[3 * k] += g * p[k] * x0;
        gE[3 * k + 1] += g * p[k] * x1;
        gE[3 * k + 2] += g * p[k];
        for (let j = 0; j < E; j++) dl[j] += g * ek * p[k] * ((j === k ? 1 : 0) - p[j]);
      }
      for (let j = 0; j < E; j++) {
        gR[3 * j] += dl[j] * x0;
        gR[3 * j + 1] += dl[j] * x1;
        gR[3 * j + 2] += dl[j];
      }
    }

    this.ro.step(this.router, gR);
    this.eo.step(this.experts, gE);
    this.steps++;
    return { mse, aux, load: f, dropped: dropped / B };
  }
}
