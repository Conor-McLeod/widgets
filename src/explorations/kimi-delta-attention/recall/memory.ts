// A tiny associative memory: the state S is a d_k × d_v matrix. Writing (k, v) and reading
// with a query q follow the linear-attention family:
//
//   linear attention:  S ← S + k vᵀ
//   delta rule:        S ← S + β k (v − Sᵀk)ᵀ      (= (I − β k kᵀ) S + β k vᵀ)
//   read:              o = Sᵀq
export type Vec = number[];
export type Mat = number[][]; // rows = key channels, cols = value channels
export type Rule = 'linear' | 'delta';

export interface Step {
  key: string;
  value: Vec;
  label: string;
}

export const D_K = 3;
export const D_V = 3;

// Values are RGB colours so crosstalk is visible as a muddy swatch.
export const SCRIPT: Step[] = [
  { key: 'cat', value: [1, 0.55, 0], label: 'orange' },
  { key: 'dog', value: [0, 0.45, 1], label: 'blue' },
  { key: 'fox', value: [0.1, 0.8, 0.25], label: 'green' },
  { key: 'cat', value: [0.65, 0, 0.85], label: 'purple' },
  { key: 'dog', value: [0, 0.45, 1], label: 'blue' },
];

export const KEYS = ['cat', 'dog', 'fox'] as const;

const norm = (v: Vec) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

/** Unit keys in R³. `overlap` = 0 gives orthogonal keys; larger values make them share directions. */
export function keyVectors(overlap: number): Record<string, Vec> {
  const out: Record<string, Vec> = {};
  KEYS.forEach((name, i) => {
    out[name] = norm(Array.from({ length: D_K }, (_, j) => (i === j ? 1 : overlap)));
  });
  return out;
}

export const zeros = (): Mat => Array.from({ length: D_K }, () => Array(D_V).fill(0));

export function read(S: Mat, q: Vec): Vec {
  return Array.from({ length: D_V }, (_, j) => S.reduce((acc, row, i) => acc + row[j] * q[i], 0));
}

export interface Trace {
  S: Mat; // state after the write
  predicted: Vec; // Sᵀk before the write
  written: Vec; // what got added along k (v for linear; β·(v − predicted) for delta)
}

export function run(rule: Rule, beta: number, keys: Record<string, Vec>, steps: number): Trace[] {
  let S = zeros();
  const out: Trace[] = [];
  for (const step of SCRIPT.slice(0, steps)) {
    const k = keys[step.key];
    const predicted = read(S, k);
    const written =
      rule === 'linear' ? step.value.slice() : step.value.map((v, j) => beta * (v - predicted[j]));
    S = S.map((row, i) => row.map((s, j) => s + k[i] * written[j]));
    out.push({ S, predicted, written });
  }
  return out;
}

/** The most recent value written for each key in the first `steps` steps. */
export function latest(steps: number): Record<string, Vec | undefined> {
  const out: Record<string, Vec | undefined> = {};
  for (const step of SCRIPT.slice(0, steps)) out[step.key] = step.value;
  return out;
}

export const dist = (a: Vec, b: Vec) => Math.hypot(...a.map((x, i) => x - b[i]));

export const rgb = (v: Vec) =>
  `rgb(${v.map((x) => Math.round(255 * Math.min(1, Math.max(0, x)))).join(' ')})`;
