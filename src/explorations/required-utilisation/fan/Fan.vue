<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Tex from '~/math/Tex.vue';

// Nine goals, all due in T0 hours, starting at required utilisations from 10% to 90%. You work
// on each at the same steady pace u. Which ones make it?
const T0 = 8;
const THETA = 0.7;
const STARTS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

const u = ref(40); // %
const view = ref<'r' | 'S'>('r');

const box = ref<HTMLElement>();
const W = ref(640);
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (W.value = Math.max(280, Math.round(e.contentRect.width))));
  if (box.value) ro.observe(box.value);
});
onBeforeUnmount(() => ro?.disconnect());
const H = 260;
const M = { l: 40, r: 14, t: 12, b: 34 };
const x = (e: number) => M.l + (e / T0) * (W.value - M.l - M.r);

// e is hours elapsed, so the time left is T0 - e and the work left is r0 T0 - u e.
interface Line {
  r0: number;
  fate: 'done' | 'fails' | 'level';
  pts: { e: number; v: number }[];
  end: { e: number; v: number; kind: 'done' | 'fails' } | null;
}
const lines = computed<Line[]>(() => {
  const uu = u.value / 100;
  return STARTS.map((r0) => {
    const fate = Math.abs(r0 - uu) < 1e-6 ? 'level' : r0 < uu ? 'done' : 'fails';
    const pts: { e: number; v: number }[] = [];
    let end: Line['end'] = null;
    const steps = 240;
    for (let k = 0; k <= steps; k++) {
      const e = (k / steps) * T0;
      const T = T0 - e;
      const left = r0 * T0 - uu * e;
      if (left <= 1e-9) {
        const eDone = (r0 * T0) / uu;
        // A goal finishing right at the deadline keeps its level r to the end, not a drop to 0.
        const v = view.value === 'S' ? T0 - eDone : eDone >= T0 - 1e-6 ? pts[pts.length - 1].v : 0;
        pts.push({ e: eDone, v });
        end = { e: eDone, v, kind: 'done' };
        break;
      }
      const r = T > 0 ? left / T : Infinity;
      if (view.value === 'r' && r > 1) {
        // Past 100%: from here the deadline can't be met even working non-stop.
        const eFail = T0 * (1 - (r0 - uu) / (1 - uu));
        pts.push({ e: eFail, v: 1 });
        end = { e: eFail, v: 1, kind: 'fails' };
        break;
      }
      pts.push({ e, v: view.value === 'r' ? r : T - left / THETA });
    }
    if (!end && view.value === 'S' && fate !== 'done') {
      const last = pts[pts.length - 1];
      end = { ...last, kind: 'fails' };
    }
    return { r0, fate, pts, end };
  });
});

const dom = computed<[number, number]>(() => {
  if (view.value === 'r') return [0, 1];
  const vs = lines.value.flatMap((l) => l.pts.map((p) => p.v));
  return [Math.floor(Math.min(...vs)), Math.ceil(Math.max(...vs))];
});
const y = (v: number) => {
  const [lo, hi] = dom.value;
  return H - M.b - ((v - lo) / (hi - lo)) * (H - M.t - M.b);
};
const ticks = computed(() => {
  if (view.value === 'r') return [0, 0.25, 0.5, 0.75, 1];
  const [lo, hi] = dom.value;
  const step = hi - lo > 12 ? 4 : 2;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
});
const d = (l: Line) => l.pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.e).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
const tickLabel = (v: number) => (view.value === 'r' ? `${v * 100}%` : `${v}`);
const slope = computed(() => u.value / 100 / THETA - 1);
</script>

<template>
  <div class="fan">
    <div class="bar">
      <label class="ctl">
        <span>your pace, <Tex t="u" /></span>
        <b>{{ u }}%</b>
        <input v-model.number="u" type="range" min="0" max="100" step="5" />
      </label>
      <div class="seg" role="radiogroup" aria-label="What to plot">
        <button role="radio" :aria-checked="view === 'r'" :class="{ on: view === 'r' }" @click="view = 'r'">
          required utilisation
        </button>
        <button role="radio" :aria-checked="view === 'S'" :class="{ on: view === 'S' }" @click="view = 'S'">
          slack at 70%
        </button>
      </div>
    </div>

    <div ref="box">
      <svg :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="Nine goals worked at the same pace">
        <g class="grid">
          <g v-for="v in ticks" :key="v">
            <line :x1="M.l" :x2="W - M.r" :y1="y(v)" :y2="y(v)" :class="{ zero: view === 'S' && v === 0 }" />
            <text :x="M.l - 6" :y="y(v) + 4" text-anchor="end">{{ tickLabel(v) }}</text>
          </g>
          <text v-for="k in T0 + 1" :key="k" :x="x(k - 1)" :y="H - M.b + 16" text-anchor="middle">
            {{ T0 - (k - 1) }}h
          </text>
          <text :x="(M.l + W - M.r) / 2" :y="H - 3" text-anchor="middle">time left to the deadline</text>
        </g>
        <line
          v-if="view === 'r'"
          class="equil"
          :x1="M.l"
          :x2="W - M.r"
          :y1="y(u / 100)"
          :y2="y(u / 100)"
        />
        <template v-for="l in lines" :key="l.r0">
          <path class="ln" :class="l.fate" :d="d(l)" />
          <circle v-if="l.end?.kind === 'done'" class="end done" :cx="x(l.end.e)" :cy="y(l.end.v)" r="3.5" />
          <g v-if="l.end?.kind === 'fails'" class="end fails">
            <line :x1="x(l.end.e) - 4" :x2="x(l.end.e) + 4" :y1="y(l.end.v) - 4" :y2="y(l.end.v) + 4" />
            <line :x1="x(l.end.e) - 4" :x2="x(l.end.e) + 4" :y1="y(l.end.v) + 4" :y2="y(l.end.v) - 4" />
          </g>
        </template>
      </svg>
    </div>
    <p class="note muted">
      <template v-if="view === 'r'">
        Dashed: <Tex t="r = u" />, the only start that stays level. Every line starting below it falls to 0 (done,
        ●); every line above it climbs past 100% (impossible from there, ×), faster the nearer the deadline.
      </template>
      <template v-else>
        The same nine goals as hours of slack. Every line has the same slope,
        <Tex :t="`\\tfrac{u}{\\theta} - 1 = ${slope.toFixed(2)}`" /> hours per hour, until its work is done.
      </template>
    </p>
  </div>
</template>

<style scoped>
.fan {
  font-size: 0.9rem;
}
.muted {
  color: var(--muted);
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.5rem 1.2rem;
  margin-bottom: 0.5rem;
}
.ctl {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0 0.5rem;
  flex: 1 1 12rem;
  font-size: 0.82rem;
}
.ctl span {
  color: var(--muted);
}
.ctl b {
  font-family: var(--mono);
  font-weight: 500;
  font-size: 0.8rem;
}
.ctl input {
  grid-column: 1 / -1;
  width: 100%;
  accent-color: var(--accent);
}
.seg {
  display: flex;
  gap: 4px;
}
.seg button {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.2rem 0.55rem;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}
.seg button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
svg {
  display: block;
  width: 100%;
  height: auto;
}
.grid line {
  stroke: var(--border);
}
.grid line.zero {
  stroke: var(--muted);
}
.grid text {
  fill: var(--muted);
  font-size: 11px;
}
.equil {
  stroke: var(--text);
  stroke-dasharray: 5 4;
  opacity: 0.6;
}
.ln {
  fill: none;
  stroke-width: 1.8;
}
.ln.done {
  stroke: var(--accent);
}
.ln.fails {
  stroke: var(--danger);
}
.ln.level {
  stroke: var(--text);
  stroke-dasharray: 5 4;
}
.end.done {
  fill: var(--accent);
}
.end.fails line {
  stroke: var(--danger);
  stroke-width: 2;
}
.note {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
}
</style>
