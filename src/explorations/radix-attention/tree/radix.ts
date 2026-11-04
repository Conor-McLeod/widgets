// A token-level radix tree KV cache in the style of SGLang's RadixCache.
//
// Every edge holds a run of tokens. A node's KV entries are the KV for exactly
// those tokens, so the KV for any cached sequence is the concatenation along
// the path from the root. Capacity is counted in tokens (one KV slot each).

export interface RNode {
  id: number;
  tokens: string[];
  children: Map<string, RNode>;
  parent: RNode | null;
  /** Logical clock of the last request that touched this node (for LRU). */
  lastAccess: number;
  /** Requests currently using this node. Locked nodes can't be evicted. */
  lock: number;
}

export interface ServeResult {
  promptLen: number;
  /** Prompt tokens whose KV was already cached. */
  hit: number;
  /** Prompt tokens that had to be prefilled. */
  prefill: number;
  /** Output tokens generated (always computed). */
  decode: number;
  /** Tokens evicted to make room. */
  evicted: number;
  /** Node ids from the root's child down to the node holding the last token. */
  path: number[];
}

export class RadixCache {
  root: RNode;
  size = 0;
  clock = 0;
  capacity: number;
  private nextId = 1;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.root = this.node([], null);
  }

  private node(tokens: string[], parent: RNode | null): RNode {
    return { id: this.nextId++, tokens, children: new Map(), parent, lastAccess: 0, lock: 0 };
  }

  /**
   * Walk the longest cached prefix of `tokens`. If the match ends partway
   * along an edge, split that edge so the matched part is its own node.
   */
  match(tokens: string[], touch = true): { len: number; path: RNode[] } {
    const path: RNode[] = [];
    let node = this.root;
    let i = 0;
    while (i < tokens.length) {
      let child = node.children.get(tokens[i]);
      if (!child) break;
      let k = 0;
      while (k < child.tokens.length && i + k < tokens.length && child.tokens[k] === tokens[i + k]) k++;
      if (k < child.tokens.length) child = this.split(child, k);
      if (touch) child.lastAccess = this.clock;
      path.push(child);
      i += k;
      node = child;
    }
    return { len: i, path };
  }

  /** Length of the cached prefix without modifying the tree. */
  peek(tokens: string[]): number {
    let node = this.root;
    let i = 0;
    while (i < tokens.length) {
      const child = node.children.get(tokens[i]);
      if (!child) break;
      let k = 0;
      while (k < child.tokens.length && i + k < tokens.length && child.tokens[k] === tokens[i + k]) k++;
      i += k;
      if (k < child.tokens.length) break;
      node = child;
    }
    return i;
  }

  private split(child: RNode, k: number): RNode {
    const parent = child.parent!;
    const mid = this.node(child.tokens.slice(0, k), parent);
    mid.lastAccess = child.lastAccess;
    mid.lock = child.lock;
    child.tokens = child.tokens.slice(k);
    child.parent = mid;
    mid.children.set(child.tokens[0], child);
    parent.children.set(mid.tokens[0], mid);
    return mid;
  }

  /** Evict least-recently-used unlocked leaves until `n` tokens are free. Whole leaves go at once. */
  evict(n: number): number {
    let freed = 0;
    while (freed < n) {
      let victim: RNode | null = null;
      for (const leaf of this.leaves()) {
        if (leaf.lock === 0 && (!victim || leaf.lastAccess < victim.lastAccess)) victim = leaf;
      }
      if (!victim) break;
      victim.parent!.children.delete(victim.tokens[0]);
      this.size -= victim.tokens.length;
      freed += victim.tokens.length;
    }
    return freed;
  }

  private *leaves(): Generator<RNode> {
    const stack = [...this.root.children.values()];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.children.size === 0) yield n;
      else stack.push(...n.children.values());
    }
  }

  /**
   * Run one request: reuse the cached prefix, prefill the rest of the prompt,
   * decode the output, and keep prompt + output in the tree for later requests.
   */
  serve(prompt: string[], output: string[]): ServeResult {
    this.clock++;
    const full = [...prompt, ...output];
    const { len, path } = this.match(full);
    const hit = Math.min(len, prompt.length);

    // Lock the matched path while we make room, so we don't evict what we're about to use.
    for (const n of path) n.lock++;
    const need = full.length - len;
    const over = this.size + need - this.capacity;
    const evicted = over > 0 ? this.evict(over) : 0;
    for (const n of path) n.lock--;

    if (need > 0) {
      const parent = path.at(-1) ?? this.root;
      const leaf = this.node(full.slice(len), parent);
      leaf.lastAccess = this.clock;
      parent.children.set(leaf.tokens[0], leaf);
      this.size += leaf.tokens.length;
      path.push(leaf);
    }

    return {
      promptLen: prompt.length,
      hit,
      prefill: prompt.length - hit,
      decode: output.length,
      evicted,
      path: path.map((n) => n.id),
    };
  }

  /** Depth-first rows for drawing: each node with its depth and token offset from the root. */
  rows(): { node: RNode; depth: number; offset: number }[] {
    const out: { node: RNode; depth: number; offset: number }[] = [];
    const walk = (n: RNode, depth: number, offset: number) => {
      for (const c of n.children.values()) {
        out.push({ node: c, depth, offset });
        walk(c, depth + 1, offset + c.tokens.length);
      }
    };
    walk(this.root, 0, 0);
    return out;
  }
}

export const tokenize = (s: string) => s.trim().split(/\s+/).filter(Boolean);
