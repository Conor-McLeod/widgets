<script setup lang="ts">
// Map of a quad GH200 node. Pick a processor (Grace, Hopper or a NIC) and a memory (LPDDR5X or HBM3):
// the widget lights up the links a load has to cross and reports the slowest one.
import { computed, ref } from 'vue';
import { BW, CAP, N, fmtBW } from '../specs';

type ProcKind = 'grace' | 'hopper' | 'nic';
type MemKind = 'lpddr' | 'hbm';
interface Pick<K> {
  kind: K;
  i: number;
}

const W = 720;
const H = 368;
const x0 = (i: number) => 5 + i * 180;
const cx = (i: number) => x0(i) + 45;

const pairs: [number, number][] = [];
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) pairs.push([i, j]);

// Quadratic arcs: control point chosen so the arc peaks at `peak`.
const arc = (xa: number, xb: number, y: number, peak: number) =>
  `M ${xa} ${y} Q ${(xa + xb) / 2} ${2 * peak - y} ${xb} ${y}`;
const graceArc = ([i, j]: [number, number]) => arc(cx(i), cx(j), 70, 60 - 16 * (j - i));
const hopperArc = ([i, j]: [number, number]) => arc(cx(i), cx(j), 280, 298 + 18 * (j - i));

const src = ref<Pick<ProcKind>>({ kind: 'hopper', i: 0 });
const dst = ref<Pick<MemKind>>({ kind: 'hbm', i: 0 });

function pickProc(kind: ProcKind, i: number) {
  src.value = { kind, i };
}
function pickMem(kind: MemKind, i: number) {
  dst.value = { kind, i };
}

interface Hop {
  label: string;
  bw: number | null;
  link: string;
}
const pair = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

// The links a request from `src` crosses to reach `dst`, in order. Grace traffic to another superchip
// uses the CPU-side coherent links; Hopper traffic uses NVLink; a NIC enters through its Grace.
const route = computed<Hop[]>(() => {
  const s = src.value;
  const d = dst.value;
  const hops: Hop[] = [];
  const memHop = (): Hop =>
    d.kind === 'hbm'
      ? { label: `HBM3 ${d.i}`, bw: BW.hbm, link: `hbm-${d.i}` }
      : { label: `LPDDR5X ${d.i}`, bw: BW.lpddr, link: `lpddr-${d.i}` };
  const c2c = (i: number): Hop => ({ label: `NVLink-C2C ${i}`, bw: BW.c2c, link: `c2c-${i}` });

  if (s.kind === 'hopper') {
    if (s.i !== d.i) hops.push({ label: `NVLink ${s.i}→${d.i}`, bw: BW.nvPeer, link: `nv-${pair(s.i, d.i)}` });
    if (d.kind === 'lpddr') hops.push(c2c(d.i));
    hops.push(memHop());
    return hops;
  }
  if (s.kind === 'nic') {
    hops.push({ label: `Slingshot port ${s.i}`, bw: BW.nic, link: `port-${s.i}` });
    hops.push({ label: `PCIe Gen5 ${s.i}`, bw: BW.pcie, link: `pcie-${s.i}` });
  }
  if (s.i !== d.i) hops.push({ label: `Grace ${s.i}→${d.i}`, bw: null, link: `gg-${pair(s.i, d.i)}` });
  if (d.kind === 'hbm') hops.push(c2c(d.i));
  hops.push(memHop());
  return hops;
});

const lit = computed(() => new Set(route.value.map((h) => h.link)));

const bound = computed(() => {
  const known = route.value.filter((h) => h.bw !== null).map((h) => h.bw as number);
  const bw = Math.min(...known);
  const slowest = route.value.find((h) => h.bw === bw)!;
  return { bw, slowest, unknown: route.value.some((h) => h.bw === null) };
});

const note = computed(() => {
  const s = src.value;
  const d = dst.value;
  if (s.kind === 'hopper' && d.kind === 'hbm' && s.i === d.i) return 'The only path that runs at HBM speed. Everything else below is at least 8× slower.';
  if (s.kind === 'hopper' && d.kind === 'lpddr' && s.i === d.i)
    return 'The GPU reads its own CPU\u2019s memory over C2C. Measured on Alps: about 93% of this for reads, 84% for writes.';
  if (s.kind === 'hopper' && s.i !== d.i)
    return d.kind === 'lpddr'
      ? 'Two interconnects in series. Paths that cross both NVLink and C2C were measured at under 60% of the bound.'
      : 'Six NVLink 4 ports to each peer. Hopper\u2019s L2 can cache lines from peer HBM, so hot data gets faster.';
  if (s.kind === 'grace' && d.kind === 'hbm' && s.i === d.i) return 'Measured on Alps: Grace reaches about 53% of this reading HBM, 64% writing.';
  if (s.kind === 'nic') return 'A node\u2019s four ports together give 100 GB/s in from the network: 2.5% of one HBM.';
  if (s.kind === 'grace' && s.i !== d.i) return 'CPU-to-CPU traffic stays on the CPU side. NVIDIA doesn\u2019t publish this link\u2019s bandwidth; CSCS measures much higher core-to-core latency across it than within a Grace.';
  return 'Plain local memory access: this is the NUMA node the Grace\u2019s cores are closest to.';
});

const specs: Record<ProcKind | MemKind, { title: string; lines: string[] }> = {
  grace: {
    title: 'Grace CPU',
    lines: ['72 Arm Neoverse V2 cores, Armv9, 4×128-bit SVE2 per core', '1 MB L2 per core, 117 MB shared L3', 'Scalable Coherency Fabric mesh, 3.2 TB/s', 'PCIe Gen5 for the NIC'],
  },
  hopper: {
    title: 'Hopper GPU (H100)',
    lines: ['132 SMs, 528 4th-gen Tensor Cores, 50 MB L2', '989 TFLOP/s dense BF16, 1979 FP8, 67 FP64', '18 NVLink 4 ports, 25 GB/s each per direction', 'Can address all 896 GB of the node'],
  },
  nic: {
    title: 'Slingshot 11 NIC',
    lines: ['One per superchip, four per node', '200 Gb/s port = 25 GB/s per direction', 'Attached to the Grace over PCIe Gen5', 'Dragonfly network to the rest of Alps'],
  },
  lpddr: {
    title: 'LPDDR5X',
    lines: [`${CAP.lpddr} GB with ECC, ${fmtBW(BW.lpddr)}`, 'Its own NUMA node (0–3)', 'Low-power phone-class DRAM, many channels', 'First-touch allocations land here when a CPU touches first'],
  },
  hbm: {
    title: 'HBM3',
    lines: [`${CAP.hbm} GB, ${fmtBW(BW.hbm)}`, 'Its own NUMA node (4, 12, 20, 28)', 'Six stacks beside the GPU die', 'cudaMalloc always lands here'],
  },
};
</script>

<template>
  <div class="topo">
    <p class="hint">
      Click a <b>Grace</b>, <b>Hopper</b> or <b>NIC</b> as the requester and an <b>LPDDR5X</b> or <b>HBM3</b> as the memory it reads.
    </p>
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="Four GH200 superchips with their links">
      <!-- superchip backgrounds -->
      <g v-for="i in N" :key="`bg${i}`" class="sc">
        <rect :x="x0(i - 1) - 3" y="52" width="176" height="236" rx="8" />
        <text :x="x0(i - 1) + 2" y="64">GH200 {{ i - 1 }}</text>
      </g>

      <!-- CPU-side coherent links (dashed, above) and NVLink (below) -->
      <path v-for="p in pairs" :key="`gg${p}`" class="link gg" :class="{ lit: lit.has(`gg-${p[0]}-${p[1]}`) }" :d="graceArc(p)" />
      <path v-for="p in pairs" :key="`nv${p}`" class="link" :class="{ lit: lit.has(`nv-${p[0]}-${p[1]}`) }" :d="hopperArc(p)" />

      <g v-for="i in N" :key="`sc${i}`">
        <!-- links within a superchip -->
        <line class="link" :class="{ lit: lit.has(`c2c-${i - 1}`) }" :x1="cx(i - 1)" y1="170" :x2="cx(i - 1)" y2="220" />
        <text class="tag" :x="cx(i - 1) + 6" y="199">C2C</text>
        <line class="link" :class="{ lit: lit.has(`lpddr-${i - 1}`) }" :x1="x0(i - 1) + 90" y1="95" :x2="x0(i - 1) + 108" y2="95" />
        <line class="link" :class="{ lit: lit.has(`pcie-${i - 1}`) }" :x1="x0(i - 1) + 90" y1="149" :x2="x0(i - 1) + 108" y2="149" />
        <line class="link" :class="{ lit: lit.has(`hbm-${i - 1}`) }" :x1="x0(i - 1) + 90" y1="250" :x2="x0(i - 1) + 108" y2="250" />
        <line class="link port" :class="{ lit: lit.has(`port-${i - 1}`) }" :x1="x0(i - 1) + 170" y1="149" :x2="x0(i - 1) + 180" y2="149" />

        <!-- Grace -->
        <g
          class="node proc"
          :class="{ sel: src.kind === 'grace' && src.i === i - 1 }"
          role="button"
          tabindex="0"
          :aria-label="`Grace ${i - 1}`"
          @click="pickProc('grace', i - 1)"
          @keydown.enter="pickProc('grace', i - 1)"
        >
          <rect :x="x0(i - 1)" y="70" width="90" height="100" rx="5" />
          <text :x="cx(i - 1)" y="112" class="name">Grace</text>
          <text :x="cx(i - 1)" y="127" class="sub">72 cores</text>
        </g>
        <!-- LPDDR5X -->
        <g
          class="node mem"
          :class="{ sel: dst.kind === 'lpddr' && dst.i === i - 1 }"
          role="button"
          tabindex="0"
          :aria-label="`LPDDR5X ${i - 1}`"
          @click="pickMem('lpddr', i - 1)"
          @keydown.enter="pickMem('lpddr', i - 1)"
        >
          <rect :x="x0(i - 1) + 108" y="70" width="62" height="50" rx="5" />
          <text :x="x0(i - 1) + 139" y="91" class="name">LPDDR5X</text>
          <text :x="x0(i - 1) + 139" y="106" class="sub">{{ CAP.lpddr }} GB</text>
        </g>
        <!-- NIC -->
        <g
          class="node proc"
          :class="{ sel: src.kind === 'nic' && src.i === i - 1 }"
          role="button"
          tabindex="0"
          :aria-label="`NIC ${i - 1}`"
          @click="pickProc('nic', i - 1)"
          @keydown.enter="pickProc('nic', i - 1)"
        >
          <rect :x="x0(i - 1) + 108" y="128" width="62" height="42" rx="5" />
          <text :x="x0(i - 1) + 139" y="146" class="name">NIC</text>
          <text :x="x0(i - 1) + 139" y="160" class="sub">200 Gb/s</text>
        </g>
        <!-- Hopper -->
        <g
          class="node proc"
          :class="{ sel: src.kind === 'hopper' && src.i === i - 1 }"
          role="button"
          tabindex="0"
          :aria-label="`Hopper ${i - 1}`"
          @click="pickProc('hopper', i - 1)"
          @keydown.enter="pickProc('hopper', i - 1)"
        >
          <rect :x="x0(i - 1)" y="220" width="90" height="60" rx="5" />
          <text :x="cx(i - 1)" y="246" class="name">Hopper</text>
          <text :x="cx(i - 1)" y="261" class="sub">132 SMs</text>
        </g>
        <!-- HBM3 -->
        <g
          class="node mem"
          :class="{ sel: dst.kind === 'hbm' && dst.i === i - 1 }"
          role="button"
          tabindex="0"
          :aria-label="`HBM3 ${i - 1}`"
          @click="pickMem('hbm', i - 1)"
          @keydown.enter="pickMem('hbm', i - 1)"
        >
          <rect :x="x0(i - 1) + 108" y="220" width="62" height="60" rx="5" />
          <text :x="x0(i - 1) + 139" y="246" class="name">HBM3</text>
          <text :x="x0(i - 1) + 139" y="261" class="sub">{{ CAP.hbm }} GB</text>
        </g>
      </g>

      <text class="tag" x="360" y="24" text-anchor="middle">CPU-side coherent links, all-to-all</text>
      <text class="tag" x="360" :y="H - 6" text-anchor="middle">NVLink 4, all-to-all: 6 ports = 150 GB/s per direction to each peer</text>
    </svg>

    <div class="path">
      <div class="hops">
        <span class="end">{{ specs[src.kind].title.split(' ')[0] }} {{ src.i }}</span>
        <template v-for="h in route" :key="h.link">
          <span class="arrow">→</span>
          <span class="hop" :class="{ slow: h === bound.slowest }">
            {{ h.label }}
            <b>{{ h.bw === null ? 'n/a' : fmtBW(h.bw) }}</b>
          </span>
        </template>
      </div>
      <p class="verdict">
        Bound: <b>{{ fmtBW(bound.bw) }}</b> per direction, set by {{ bound.slowest.label }}.
        <template v-if="bound.bw < BW.hbm"> That is <b>{{ Math.round(BW.hbm / bound.bw) }}×</b> slower than a Hopper reading its own HBM.</template>
        <template v-if="bound.unknown"> One hop has no published figure, so this is an upper bound.</template>
      </p>
      <p class="note">{{ note }}</p>
    </div>

    <div class="cards">
      <div class="card" v-for="k in [src.kind, dst.kind]" :key="k">
        <h4>{{ specs[k].title }}</h4>
        <ul>
          <li v-for="l in specs[k].lines" :key="l">{{ l }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.topo {
  font-size: 0.9rem;
}
.hint {
  margin: 0 0 0.5rem;
  color: var(--muted);
}
svg {
  width: 100%;
  height: auto;
  display: block;
  font-family: var(--font);
}
.sc rect {
  fill: color-mix(in srgb, var(--muted) 7%, transparent);
  stroke: none;
}
.sc text,
.tag {
  font-size: 10px;
  fill: var(--muted);
}
.link {
  fill: none;
  stroke: var(--border);
  stroke-width: 1.5;
  transition: stroke 0.15s, stroke-width 0.15s;
}
.link.gg {
  stroke-dasharray: 4 3;
}
.link.port {
  stroke-dasharray: 2 2;
}
.link.lit {
  stroke: var(--accent);
  stroke-width: 3;
}
.node {
  cursor: pointer;
  outline: none;
}
.node rect {
  fill: var(--surface);
  stroke: var(--border);
  stroke-width: 1.2;
  transition: fill 0.15s, stroke 0.15s;
}
.node.mem rect {
  fill: color-mix(in srgb, var(--muted) 12%, var(--surface));
}
.node:hover rect,
.node:focus-visible rect {
  stroke: var(--text);
}
.node.sel rect {
  fill: var(--accent-soft);
  stroke: var(--accent);
  stroke-width: 2;
}
.node text {
  text-anchor: middle;
  fill: var(--text);
  pointer-events: none;
}
.name {
  font-size: 12px;
  font-weight: 600;
}
.sub {
  font-size: 10px;
  fill: var(--muted) !important;
}
.path {
  margin-top: 0.75rem;
}
.hops {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--mono);
  font-size: 0.8rem;
}
.end,
.hop {
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.end {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.hop b {
  display: block;
  font-weight: 600;
}
.hop.slow {
  border-color: var(--danger);
  color: var(--danger);
}
.arrow {
  color: var(--muted);
}
.verdict {
  margin: 0.6rem 0 0.2rem;
}
.note {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
  min-height: 2.6em;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.card {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.4rem 0.7rem;
  font-size: 0.82rem;
}
.card h4 {
  margin: 0 0 0.2rem;
  font-size: 0.85rem;
}
.card ul {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--muted);
}
</style>
