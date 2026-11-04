// The number formats behind MXFP4 and NVFP4, shared by this exploration's widgets.

/** The eight non-negative FP4 (E2M1) values, indexed by their low three bits. */
export const E2M1 = [0, 0.5, 1, 1.5, 2, 3, 4, 6] as const;
export const E2M1_MAX = 6;

/** Round |x| to the nearest E2M1 value (ties to the even code), saturating at 6. Keeps the sign. */
export function roundE2M1(x: number): number {
  const ax = Math.abs(x);
  if (ax >= E2M1_MAX) return Math.sign(x) * E2M1_MAX;
  let best = 0;
  for (let i = 1; i < E2M1.length; i++) {
    const d = Math.abs(ax - E2M1[i]) - Math.abs(ax - E2M1[best]);
    if (d < 0 || (d === 0 && i % 2 === 0)) best = i;
  }
  return Math.sign(x) * E2M1[best];
}

/** Round a positive number to FP8 E4M3 (bias 7, max 448, subnormals down to 2^-9), ties to even. */
export function roundE4M3(x: number): number {
  if (x <= 0) return 0;
  const e = Math.max(Math.floor(Math.log2(x)), -6);
  const step = 2 ** (e - 3);
  const q = x / step;
  const f = Math.floor(q);
  const r = q - f > 0.5 || (q - f === 0.5 && f % 2 === 1) ? f + 1 : f;
  return Math.min(r * step, 448);
}

export interface Quantized {
  /** Dequantized values, same length as the input. */
  values: number[];
  /** One decoded scale per block (for NVFP4 this already includes the per-tensor scale). */
  scales: number[];
  blockSize: number;
  /** How many elements hit the ±6 ceiling and were clipped. */
  clipped: number;
}

/**
 * MXFP4 (OCP Microscaling): blocks of 32, one E8M0 scale per block, a pure power of two.
 * The spec picks 2^(floor(log2 amax) - 2), so the block's largest value lands in [4, 8) and
 * anything above 6 saturates.
 */
export function mxScale(amax: number): number {
  return amax === 0 ? 1 : 2 ** (Math.floor(Math.log2(amax)) - 2);
}

/** NVFP4 per-tensor FP32 scale: chosen so every block scale (amax/6) fits under E4M3's 448. */
export function nvTensorScale(tensorAmax: number): number {
  return tensorAmax === 0 ? 1 : tensorAmax / (E2M1_MAX * 448);
}

/** NVFP4 block scale, decoded: amax/6 divided by the tensor scale, rounded to E4M3, then scaled back. */
export function nvScale(amax: number, tensorScale: number): number {
  const s = roundE4M3(amax / E2M1_MAX / tensorScale) * tensorScale;
  return s === 0 ? tensorScale : s;
}

function quantize(xs: number[], blockSize: number, scaleOf: (amax: number) => number): Quantized {
  const values: number[] = [];
  const scales: number[] = [];
  let clipped = 0;
  for (let b = 0; b < xs.length; b += blockSize) {
    const block = xs.slice(b, b + blockSize);
    const s = scaleOf(Math.max(...block.map(Math.abs)));
    scales.push(s);
    for (const x of block) {
      if (Math.abs(x / s) > E2M1_MAX) clipped++;
      values.push(roundE2M1(x / s) * s);
    }
  }
  return { values, scales, blockSize, clipped };
}

export const quantizeMX = (xs: number[]) => quantize(xs, 32, mxScale);

export function quantizeNV(xs: number[]) {
  const t = nvTensorScale(Math.max(...xs.map(Math.abs)));
  return quantize(xs, 16, (amax) => nvScale(amax, t));
}
