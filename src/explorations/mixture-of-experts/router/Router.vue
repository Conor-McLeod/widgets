<script setup lang="ts">
import { computed, ref } from 'vue';
import { useExpertColors } from '../palette';

// A router is a linear layer: logit_i = w_i · x + b_i, one row per expert. Softmax turns the
// logits into probabilities, the top k experts run, and their outputs are mixed using the
// top-k probabilities renormalised to sum to 1 (as in Mixtral).

type Router = { w: [number, number]; b: number }[];

const colors = useExpertColors();
const E = ref(6);
const k = ref(2);
const seed = ref(3);
const token = ref<[number, number]>([0.35, 0.45]);

function rng(s: number) {
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const router = computed<Router>(() => {
  const r = rng(seed.value * 7919);
  const off = r() * 2 * Math.PI;
  return Array.from({ length: E.value }, (_, i) => {
    const a = off + (i / E.value) * 2 * Math.PI + (r() - 0.5) * 0.5;
    const m = 2.5 + r() * 2;
    return { w: [m * Math.cos(a), m * Math.sin(a)], b: (r() - 0.5) * 0.8 };
  });
});

const logits = computed(() => router.value.map(({ w, b }) => w[0] * token.value[0] + w[1] * token.value[1] + b));
const probs = computed(() => {
  const max = Math.max(...logits.value);
  const ex = logits.value.map((l) => Math.exp(l - max));
  const s = ex.reduce((a, c) => a + c, 0);
  return ex.map((e) => e / s);
});
const chosen = computed(() =>
  probs.value
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p - a.p)
    .slice(0, Math.min(k.value, E.value)),
);
const gates = computed(() => {
  const s = chosen.value.reduce((a, c) => a + c.p, 0);
  const g = new Map<number, number>();
  for (const c of chosen.value) g.set(c.i, c.p / s);
  return g;
});
const formula = computed(() =>
  chosen.value.map((c) => `${gates.value.get(c.i)!.toFixed(2)}·E${c.i + 1}(x)`).join(' + '),
);

// --- drawing -----------------------------------------------------------------------------
const S = 300;
const H = S / 2;
const R = H - 8;
const px = (x: number) => H + R * x;
const py = (y: number) => H - R * y;
const ux = (p: number) => (p - H) / R;
const uy = (p: number) => (H - p) / R;

type Pt = [number, number];
/** Keep the part of a polygon where a·p + c ≥ 0 (Sutherland–Hodgman against one half-plane). */
function clip(poly: Pt[], a: Pt, c: number): Pt[] {
  const out: Pt[] = [];
  const f = (p: Pt) => a[0] * p[0] + a[1] * p[1] + c;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const fp = f(p);
    const fq = f(q);
    if (fp >= 0) out.push(p);
    if (fp >= 0 !== fq >= 0) {
      const t = fp / (fp - fq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

// Region where expert i has the largest logit (and so is the top-1 choice).
const regions = computed(() =>
  router.value.map((ri, i) => {
    let poly: Pt[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    router.value.forEach((rj, j) => {
      if (j !== i && poly.length) poly = clip(poly, [ri.w[0] - rj.w[0], ri.w[1] - rj.w[1]], ri.b - rj.b);
    });
    const cx = poly.reduce((a, p) => a + p[0], 0) / (poly.length || 1);
    const cy = poly.reduce((a, p) => a + p[1], 0) / (poly.length || 1);
    return {
      i,
      points: poly.map((p) => `${px(p[0])},${py(p[1])}`).join(' '),
      label: poly.length > 2 ? [px(cx), py(cy)] : null,
    };
  }),
);

const svg = ref<SVGSVGElement>();
let dragging = false;
function move(ev: PointerEvent) {
  const rect = svg.value!.getBoundingClientRect();
  const x = ux(((ev.clientX - rect.left) / rect.width) * S);
  const y = uy(((ev.clientY - rect.top) / rect.height) * S);
  token.value = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))];
}
function down(ev: PointerEvent) {
  dragging = true;
  svg.value!.setPointerCapture(ev.pointerId);
  move(ev);
}
function onMove(ev: PointerEvent) {
  if (dragging) move(ev);
}
function up() {
  dragging = false;
}
function onKey(ev: KeyboardEvent) {
  const d = 0.05;
  const [x, y] = token.value;
  const m: Record<string, Pt> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
  const s = m[ev.key];
  if (!s) return;
  ev.preventDefault();
  token.value = [Math.max(-1, Math.min(1, x + s[0])), Math.max(-1, Math.min(1, y + s[1]))];
}
</script>

<template>
  <div class="rt">
    <div class="rt-ctl">
      <label>
        <span>experts</span>
        <input type="range" min="2" max="8" v-model.number="E" />
        <output>{{ E }}</output>
      </label>
      <label>
        <span>top-k</span>
        <input type="range" min="1" :max="Math.min(4, E)" v-model.number="k" />
        <output>{{ Math.min(k, E) }}</output>
      </label>
      <button @click="seed++">new router</button>
    </div>

    <div class="rt-body">
      <svg
        ref="svg"
        class="rt-plane"
        :viewBox="`0 0 ${S} ${S}`"
        tabindex="0"
        role="img"
        aria-label="Token position in a 2-D embedding space. Drag, or use arrow keys, to move it."
        @pointerdown="down"
        @pointermove="onMove"
        @pointerup="up"
        @pointercancel="up"
        @keydown="onKey"
      >
        <polygon
          v-for="r in regions"
          :key="r.i"
          :points="r.points"
          :fill="colors[r.i]"
          :fill-opacity="gates.has(r.i) ? 0.3 : 0.14"
          stroke="var(--surface)"
          stroke-width="2"
        />
        <template v-for="r in regions" :key="'l' + r.i">
          <text v-if="r.label" :x="r.label[0]" :y="r.label[1] + 4" class="rt-region-label">E{{ r.i + 1 }}</text>
        </template>
        <line :x1="px(-1)" :x2="px(1)" :y1="py(0)" :y2="py(0)" stroke="var(--border)" stroke-dasharray="2 4" />
        <line :x1="px(0)" :x2="px(0)" :y1="py(-1)" :y2="py(1)" stroke="var(--border)" stroke-dasharray="2 4" />
        <circle :cx="px(token[0])" :cy="py(token[1])" r="14" fill="transparent" />
        <circle :cx="px(token[0])" :cy="py(token[1])" r="7" fill="var(--text)" stroke="var(--surface)" stroke-width="2" />
      </svg>

      <div class="rt-panel">
        <div class="rt-head"><span>expert</span><span>router probability</span><span>gate</span></div>
        <div v-for="(p, i) in probs" :key="i" class="rt-row" :class="{ on: gates.has(i) }">
          <span class="rt-name"><i :style="{ background: colors[i] }"></i>E{{ i + 1 }}</span>
          <span class="rt-bar">
            <b :style="{ width: `${p * 100}%`, background: colors[i] }"></b>
            <em>{{ (p * 100).toFixed(1) }}%</em>
          </span>
          <span class="rt-gate">{{ gates.has(i) ? gates.get(i)!.toFixed(2) : '—' }}</span>
        </div>
        <p class="rt-out">y = {{ formula }}</p>
        <p class="rt-cost">
          Ran {{ Math.min(k, E) }} of {{ E }} experts. The other {{ E - Math.min(k, E) }} cost nothing for this token.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rt {
  font-size: 0.9rem;
}
.rt-ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.25rem;
  margin-bottom: 0.75rem;
}
.rt-ctl label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--muted);
}
.rt-ctl input {
  width: 6.5rem;
}
.rt-ctl output {
  font-family: var(--mono);
  color: var(--text);
  min-width: 1ch;
}
button {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
}
.rt-body {
  display: grid;
  grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 600px) {
  .rt-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .rt-plane {
    max-width: 320px;
    margin: 0 auto;
  }
}
.rt-plane {
  width: 100%;
  height: auto;
  display: block;
  touch-action: none;
  cursor: crosshair;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.rt-plane:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.rt-region-label {
  font-size: 12px;
  font-family: var(--mono);
  fill: var(--muted);
  text-anchor: middle;
  pointer-events: none;
}
.rt-head,
.rt-row {
  display: grid;
  grid-template-columns: 3.2rem minmax(0, 1fr) 2.6rem;
  gap: 0.5rem;
  align-items: center;
}
.rt-head {
  font-size: 0.75rem;
  color: var(--muted);
  margin-bottom: 0.2rem;
}
.rt-head span:last-child,
.rt-gate {
  text-align: right;
}
.rt-row {
  padding: 0.15rem 0;
  color: var(--muted);
}
.rt-row.on {
  color: var(--text);
  font-weight: 600;
}
.rt-name {
  font-family: var(--mono);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.rt-name i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: none;
}
.rt-bar {
  position: relative;
  height: 1.2rem;
  background: var(--bg);
  border-radius: 4px;
  overflow: hidden;
}
.rt-bar b {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 0 4px 4px 0;
  opacity: 0.35;
}
.rt-row.on .rt-bar b {
  opacity: 0.85;
}
.rt-bar em {
  position: relative;
  font-style: normal;
  font-family: var(--mono);
  font-size: 0.75rem;
  padding-left: 0.35rem;
  line-height: 1.2rem;
}
.rt-gate {
  font-family: var(--mono);
}
.rt-out {
  margin: 0.75rem 0 0.25rem;
  font-family: var(--mono);
  overflow-wrap: anywhere;
}
.rt-cost {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
</style>
