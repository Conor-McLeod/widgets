<script setup lang="ts">
import { computed, ref } from 'vue';
import { RadixCache } from '../tree/radix';

// Three long shared prefixes (think: three few-shot templates), four questions on each,
// arriving interleaved: A1 B1 C1 A2 B2 C2 ...
const TEMPLATES = ['A', 'B', 'C'];
const PREFIX = 24;
const QUESTION = 3;
const OUTPUT = 2;
const PER = 4;

interface Req {
  name: string;
  arrival: number;
  prompt: string[];
  output: string[];
}

const requests: Req[] = [];
for (let q = 1; q <= PER; q++) {
  for (const t of TEMPLATES) {
    const prefix = Array.from({ length: PREFIX }, (_, i) => `${t}${i}`);
    const question = Array.from({ length: QUESTION }, (_, i) => `${t}${q}q${i}`);
    const output = Array.from({ length: OUTPUT }, (_, i) => `${t}${q}o${i}`);
    requests.push({ name: `${t}${q}`, arrival: requests.length, prompt: [...prefix, ...question], output });
  }
}
const PROMPT = PREFIX + QUESTION;

type Policy = 'fcfs' | 'lpm';

interface Served {
  name: string;
  arrival: number;
  hit: number;
  prefill: number;
}

function run(policy: Policy, capacity: number) {
  const cache = new RadixCache(capacity);
  const waiting = [...requests];
  const served: Served[] = [];
  while (waiting.length) {
    let pick = 0;
    if (policy === 'lpm') {
      // Longest prefix match against what's cached right now; ties go to the earliest arrival.
      let best = -1;
      waiting.forEach((r, i) => {
        const m = cache.peek(r.prompt);
        if (m > best) [best, pick] = [m, i];
      });
    }
    const [r] = waiting.splice(pick, 1);
    const res = cache.serve(r.prompt, r.output);
    served.push({ name: r.name, arrival: r.arrival, hit: res.hit, prefill: res.prefill });
  }
  const prefill = served.reduce((s, x) => s + x.prefill, 0);
  const maxWait = Math.max(...served.map((s, pos) => pos - s.arrival));
  return { served, prefill, maxWait };
}

const capacity = ref(40);
const total = requests.length * PROMPT;
const results = computed(() => ({
  fcfs: run('fcfs', capacity.value),
  lpm: run('lpm', capacity.value),
}));

const lanes: { key: Policy; label: string; note: string }[] = [
  { key: 'fcfs', label: 'First come, first served', note: 'arrival order' },
  { key: 'lpm', label: 'Longest prefix match first', note: 'SGLang’s cache-aware order' },
];
</script>

<template>
  <div class="sch">
    <label class="ctl">
      <span>KV pool</span>
      <input type="range" min="30" max="120" step="1" v-model.number="capacity" />
      <code>{{ capacity }} tokens</code>
      <span class="muted">(one request needs {{ PROMPT + OUTPUT }})</span>
    </label>

    <section v-for="lane in lanes" :key="lane.key" class="lane">
      <header>
        <strong>{{ lane.label }}</strong>
        <span class="muted">{{ lane.note }}</span>
      </header>
      <div class="bars">
        <div
          v-for="s in results[lane.key].served"
          :key="s.name"
          class="bar"
          :title="`${s.name}: ${s.hit} reused, ${s.prefill} prefilled (arrived #${s.arrival + 1})`"
        >
          <div class="col">
            <div class="prefill" :style="{ height: `${(100 * s.prefill) / PROMPT}%` }"></div>
            <div class="hit" :style="{ height: `${(100 * s.hit) / PROMPT}%` }"></div>
          </div>
          <span class="name">{{ s.name }}</span>
        </div>
      </div>
      <p class="stat">
        prefilled <code>{{ results[lane.key].prefill }}</code> of {{ total }} prompt tokens
        <span class="muted">
          · {{ (100 - (100 * results[lane.key].prefill) / total).toFixed(0) }}% reused · worst request served
          {{ results[lane.key].maxWait }} slots after arrival
        </span>
      </p>
    </section>

    <div class="legend">
      <span><i class="sw hit"></i>reused from cache</span>
      <span><i class="sw prefill"></i>prefilled</span>
    </div>
  </div>
</template>

<style scoped>
.sch {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
}
.ctl input {
  width: 9rem;
  accent-color: var(--accent);
}
.ctl code {
  color: var(--text);
}
.muted {
  color: var(--muted);
}
.lane {
  margin-top: 0.9rem;
}
.lane header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.6rem;
  align-items: baseline;
}
.bars {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 3px;
  margin-top: 0.4rem;
}
.bar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}
.col {
  display: flex;
  flex-direction: column;
  height: 64px;
  border: 1px solid var(--border);
  border-radius: 3px;
  overflow: hidden;
  background: var(--bg);
}
.col > div {
  transition: height 0.25s;
}
.hit {
  background: var(--accent);
  opacity: 0.55;
}
.prefill {
  background: var(--danger);
  opacity: 0.6;
}
.name {
  text-align: center;
  font-family: var(--mono);
  font-size: 0.7rem;
  color: var(--muted);
}
.stat {
  margin: 0.3rem 0 0;
  font-size: 0.82rem;
}
.legend {
  display: flex;
  gap: 1rem;
  margin-top: 0.7rem;
  font-size: 0.78rem;
  color: var(--muted);
}
.sw {
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  margin-right: 0.3rem;
  border-radius: 2px;
  vertical-align: -1px;
}
</style>
