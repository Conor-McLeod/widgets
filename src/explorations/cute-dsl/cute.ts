// A tiny model of CuTe layouts, shared by this page's widgets.
// A layout is a (shape, stride) pair of matching nested tuples. It is a function from a
// coordinate to an integer offset: split the coordinate across the shape (leftmost mode fastest,
// "colexicographic"), multiply each piece by its stride, and add.

export type IntTuple = number | IntTuple[];
export interface Layout {
  shape: IntTuple;
  stride: IntTuple;
}

export function size(t: IntTuple): number {
  return typeof t === 'number' ? t : t.reduce<number>((p, x) => p * size(x), 1);
}

export function flatten(t: IntTuple): number[] {
  return typeof t === 'number' ? [t] : t.flatMap(flatten);
}

export function congruent(a: IntTuple, b: IntTuple): boolean {
  if (typeof a === 'number' || typeof b === 'number') return typeof a === typeof b;
  return a.length === b.length && a.every((x, i) => congruent(x, b[i]));
}

/** Offset of the `i`-th element, counting colexicographically through the shape. */
export function offset({ shape, stride }: Layout, i: number): number {
  const sh = flatten(shape);
  const st = flatten(stride);
  let out = 0;
  for (let k = 0; k < sh.length; k++) {
    out += (i % sh[k]) * st[k];
    i = Math.floor(i / sh[k]);
  }
  return out;
}

/** Top-level mode `k` as a layout of its own. A rank-1 layout is its own mode 0. */
export function mode(l: Layout, k: number): Layout {
  if (typeof l.shape === 'number') return l;
  return { shape: l.shape[k], stride: (l.stride as IntTuple[])[k] };
}

export function rank(l: Layout): number {
  return typeof l.shape === 'number' ? 1 : l.shape.length;
}

/** One past the largest offset the layout produces. */
export function cosize(l: Layout): number {
  const sh = flatten(l.shape);
  const st = flatten(l.stride);
  return sh.reduce((acc, s, k) => acc + (s - 1) * st[k], 0) + 1;
}

export function fmt(t: IntTuple): string {
  return typeof t === 'number' ? String(t) : `(${t.map(fmt).join(',')})`;
}

export function fmtLayout(l: Layout): string {
  return `${fmt(l.shape)}:${fmt(l.stride)}`;
}

/** Parse CuTe notation such as `((2,2),(2,4)):((1,4),(2,8))`. Throws with a readable message. */
export function parseLayout(src: string): Layout {
  const s = src.replace(/\s+/g, '');
  const colon = depthZeroColon(s);
  if (colon < 0) throw new Error('expected shape:stride');
  const shape = parseTuple(s.slice(0, colon));
  const stride = parseTuple(s.slice(colon + 1));
  if (!congruent(shape, stride)) throw new Error('shape and stride must have the same nesting');
  if (flatten(shape).some((x) => x < 1)) throw new Error('shape entries must be at least 1');
  if (flatten(stride).some((x) => x < 0)) throw new Error('strides must be non-negative here');
  return { shape, stride };
}

function depthZeroColon(s: string): number {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') d++;
    else if (s[i] === ')') d--;
    else if (s[i] === ':' && d === 0) return i;
  }
  return -1;
}

function parseTuple(s: string): IntTuple {
  let pos = 0;
  const value = (): IntTuple => {
    if (s[pos] === '(') {
      pos++;
      const items: IntTuple[] = [value()];
      while (s[pos] === ',') {
        pos++;
        items.push(value());
      }
      if (s[pos] !== ')') throw new Error(`expected ')' at "${s.slice(pos) || 'end'}"`);
      pos++;
      return items.length === 1 ? items[0] : items;
    }
    const m = /^\d+/.exec(s.slice(pos));
    if (!m) throw new Error(`expected a number at "${s.slice(pos) || 'end'}"`);
    pos += m[0].length;
    return Number(m[0]);
  };
  const v = value();
  if (pos !== s.length) throw new Error(`unexpected "${s.slice(pos)}"`);
  return v;
}

/** Categorical colours that read on both light and dark surfaces. */
export const PALETTE = ['#2f5fd0', '#d0562f', '#2f8f5f', '#9b4dca', '#c49a1a', '#1a9bb0', '#c43d7a', '#6b7a2f'];
