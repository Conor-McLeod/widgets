<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Tex from '~/math/Tex.vue';

// Three goals that all read the same required utilisation right now, with deadlines 1, 4 and 10
// hours away. Then nobody works on any of them.
const GOALS = [
  { T0: 1, slot: 2 },
  { T0: 4, slot: 4 },
  { T0: 10, slot: 1 },
];
const r0 = ref(17); // %
const theta = ref(70); // %
const XMAX = 10;

// Idle for t hours: the work left stays put while the time left shrinks.
const rAt = (T0: number, t: number) => (r0.value / 100) * (T0 / (T0 - t));
// How long you can idle before r passes theta: the slack, in hours.
const slack = (T0: number) => T0 * (1 - r0.value / theta.value);

const box = ref<HTMLElement>();
const W = ref(640);
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (W.value = Math.max(280, Math.round(e.contentRect.width))));
  if (box.value) ro.observe(box.value);
});
onBeforeUnmount(() => ro?.disconnect());
const H = 240;
const M = { l: 40, r: 14, t: 12, b: 34 };
const x = (t: number) => M.l + (t / XMAX) * (W.value - M.l - M.r);
const y = (r: number) => H - M.b - Math.min(r, 1.04) * (H - M.t - M.b);

function curve(T0: number) {
  const pts: string[] = [];
  const steps = 200;
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * T0;
    const r = t >= T0 ? Infinity : rAt(T0, t);
    pts.push(`${k ? 'L' : 'M'}${x(t).toFixed(1)},${y(r).toFixed(1)}`);
    if (r > 1.04) break;
  }
  return pts.join('');
}
const hm = (h: number) => {
  const m = Math.round(Math.max(0, h) * 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
};
</script>

<template>
  <div class="sr">
    <div class="controls">
      <label>
        <span>required utilisation now, <Tex t="r_0" /></span>
        <b>{{ r0 }}%</b>
        <input v-model.number="r0" type="range" min="5" max="65" step="1" />
      </label>
      <label>
        <span>pace you can keep, <Tex t="\theta" /></span>
        <b>{{ theta }}%</b>
        <input v-model.number="theta" type="range" min="40" max="100" step="5" />
      </label>
    </div>

    <div ref="box">
      <svg :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="Required utilisation while idle, for three deadlines">
        <g class="grid">
          <g v-for="v in [0, 0.25, 0.5, 0.75, 1]" :key="v">
            <line :x1="M.l" :x2="W - M.r" :y1="y(v)" :y2="y(v)" />
            <text :x="M.l - 6" :y="y(v) + 4" text-anchor="end">{{ v * 100 }}%</text>
          </g>
          <text v-for="t in XMAX + 1" :key="t" :x="x(t - 1)" :y="H - M.b + 16" text-anchor="middle">{{ t - 1 }}</text>
          <text :x="(M.l + W - M.r) / 2" :y="H - 3" text-anchor="middle">hours spent not working</text>
        </g>
        <line class="theta" :x1="M.l" :x2="W - M.r" :y1="y(theta / 100)" :y2="y(theta / 100)" />
        <template v-for="g in GOALS" :key="g.T0">
          <path class="ln" :class="`s${g.slot}`" :d="curve(g.T0)" />
          <circle
            v-if="slack(g.T0) > 0"
            class="dot"
            :class="`s${g.slot}`"
            :cx="x(slack(g.T0))"
            :cy="y(theta / 100)"
            r="4"
          />
        </template>
      </svg>
    </div>

    <table>
      <thead>
        <tr>
          <th>deadline in</th>
          <th>work left</th>
          <th>climbs at first by</th>
          <th>slack (idle until <Tex t="r = \theta" />)</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="g in GOALS" :key="g.T0">
          <th><i class="sw" :class="`s${g.slot}`"></i>{{ g.T0 }} h</th>
          <td>{{ hm((g.T0 * r0) / 100) }}</td>
          <td>{{ (r0 / g.T0).toFixed(1) }} points/h</td>
          <td>{{ slack(g.T0) > 0 ? hm(slack(g.T0)) : 'none' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.sr {
  font-size: 0.9rem;
  --s1: #2a78d6;
  --s2: #eb6834;
  --s4: #6250d6;
}
@media (prefers-color-scheme: dark) {
  .sr {
    --s1: #3987e5;
    --s2: #d95926;
    --s4: #9085e9;
  }
}
.controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.3rem 1rem;
  margin-bottom: 0.5rem;
}
.controls label {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0 0.5rem;
  font-size: 0.82rem;
}
.controls label span {
  color: var(--muted);
}
.controls input {
  grid-column: 1 / -1;
  width: 100%;
  accent-color: var(--accent);
}
.controls b {
  font-family: var(--mono);
  font-weight: 500;
  font-size: 0.8rem;
}
svg {
  display: block;
  width: 100%;
  height: auto;
}
.grid line {
  stroke: var(--border);
}
.grid text {
  fill: var(--muted);
  font-size: 11px;
}
.theta {
  stroke: var(--danger);
  stroke-dasharray: 4 4;
  opacity: 0.7;
}
.ln {
  fill: none;
  stroke-width: 2;
}
.ln.s1 { stroke: var(--s1); }
.ln.s2 { stroke: var(--s2); }
.ln.s4 { stroke: var(--s4); }
.dot {
  stroke: var(--surface);
  stroke-width: 2;
}
.dot.s1 { fill: var(--s1); }
.dot.s2 { fill: var(--s2); }
.dot.s4 { fill: var(--s4); }
.sw {
  display: inline-block;
  width: 0.8rem;
  height: 0.25rem;
  border-radius: 2px;
  margin-right: 0.4rem;
  vertical-align: middle;
}
.sw.s1 { background: var(--s1); }
.sw.s2 { background: var(--s2); }
.sw.s4 { background: var(--s4); }
table {
  width: 100%;
  margin-top: 0.4rem;
  border-collapse: collapse;
  font-size: 0.78rem;
}
th,
td {
  padding: 0.2rem 0.4rem;
  text-align: right;
  border-bottom: 1px solid var(--border);
}
thead th {
  color: var(--muted);
  font-weight: 500;
}
tbody th {
  text-align: left;
  font-weight: 500;
  white-space: nowrap;
}
td {
  font-family: var(--mono);
}
</style>
