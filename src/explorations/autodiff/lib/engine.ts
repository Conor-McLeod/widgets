// A minimal reverse-mode autodiff engine. Every arithmetic operation creates a Value that
// remembers its parents and the local derivative with respect to each one. backward() walks
// that record in reverse topological order and applies the chain rule.

export class Value {
  data: number;
  grad = 0;
  /** The Values this one was computed from, and ∂this/∂parent for each. */
  readonly parents: Value[];
  readonly local: number[];

  constructor(data: number, parents: Value[] = [], local: number[] = []) {
    this.data = data;
    this.parents = parents;
    this.local = local;
  }

  add(o: Value | number) {
    const b = lift(o);
    return new Value(this.data + b.data, [this, b], [1, 1]);
  }
  mul(o: Value | number) {
    const b = lift(o);
    return new Value(this.data * b.data, [this, b], [b.data, this.data]);
  }
  tanh() {
    const t = Math.tanh(this.data);
    return new Value(t, [this], [1 - t * t]);
  }
  /** log(1 + eᶻ), written so it doesn't overflow. Its derivative is the sigmoid. */
  softplus() {
    const z = this.data;
    const v = Math.max(z, 0) + Math.log1p(Math.exp(-Math.abs(z)));
    return new Value(v, [this], [1 / (1 + Math.exp(-z))]);
  }

  /** Fill in .grad on every Value this one depends on. Returns the number of nodes visited. */
  backward(): number {
    const order: Value[] = [];
    const seen = new Set<Value>();
    // Iterative DFS post-order, so deep graphs don't blow the call stack.
    const stack: [Value, number][] = [[this, 0]];
    seen.add(this);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [v, i] = top;
      if (i < v.parents.length) {
        top[1]++;
        const p = v.parents[i];
        if (!seen.has(p)) {
          seen.add(p);
          stack.push([p, 0]);
        }
      } else {
        order.push(v);
        stack.pop();
      }
    }
    for (const v of order) v.grad = 0;
    this.grad = 1;
    for (let k = order.length - 1; k >= 0; k--) {
      const v = order[k];
      for (let j = 0; j < v.parents.length; j++) v.parents[j].grad += v.grad * v.local[j];
    }
    return order.length;
  }
}

const lift = (x: Value | number) => (x instanceof Value ? x : new Value(x));

export const sum = (xs: Value[]) => xs.reduce((a, b) => a.add(b));
