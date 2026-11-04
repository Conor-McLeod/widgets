<script setup lang="ts">
import { computed, ref } from 'vue';
import { KEYS, SCRIPT, dist, keyVectors, latest, read, rgb, run, zeros, type Rule } from './memory';

const rule = ref<Rule>('delta');
const beta = ref(1);
const overlap = ref(0);
const steps = ref(SCRIPT.length);

const keys = computed(() => keyVectors(overlap.value));
const trace = computed(() => run(rule.value, beta.value, keys.value, steps.value));
const S = computed(() => trace.value.at(-1)?.S ?? zeros());
const current = computed(() => (steps.value > 0 ? { step: SCRIPT[steps.value - 1], t: trace.value.at(-1)! } : null));
const want = computed(() => latest(steps.value));

const rows = computed(() =>
  KEYS.map((name) => {
    const got = read(S.value, keys.value[name]);
    const target = want.value[name];
    return { name, got, target, err: target ? dist(got, target) : null };
  }),
);

const cos = computed(() => {
  const [a, b] = [keys.value.cat, keys.value.dog];
  return a.reduce((s, x, i) => s + x * b[i], 0);
});

const fmt = (x: number) => (Math.abs(x) < 0.005 ? '0.00' : x.toFixed(2));
const cell = (x: number) => {
  const pct = Math.round(Math.min(1, Math.abs(x)) * 70);
  return { background: `color-mix(in srgb, ${x >= 0 ? 'var(--accent)' : 'var(--danger)'} ${pct}%, transparent)` };
};
</script>

<template>
  <div class="rc">
    <div class="ctl">
      <div class="seg" role="group" aria-label="Update rule">
        <button :class="{ on: rule === 'linear' }" @click="rule = 'linear'">Linear attention</button>
        <button :class="{ on: rule === 'delta' }" @click="rule = 'delta'">Delta rule</button>
      </div>
      <label :class="{ off: rule !== 'delta' }">
        <span>β (write strength)</span>
        <input v-model.number="beta" type="range" min="0.1" max="1" step="0.05" :disabled="rule !== 'delta'" />
        <output>{{ beta.toFixed(2) }}</output>
      </label>
      <label>
        <span>key overlap</span>
        <input v-model.number="overlap" type="range" min="0" max="0.6" step="0.05" />
        <output>cos {{ cos.toFixed(2) }}</output>
      </label>
    </div>

    <ol class="script">
      <li>
        <button :class="{ on: steps === 0 }" @click="steps = 0">start</button>
      </li>
      <li v-for="(s, i) in SCRIPT" :key="i">
        <button :class="{ on: steps === i + 1, future: steps < i + 1 }" @click="steps = i + 1">
          {{ s.key }} <i class="sw" :style="{ background: rgb(s.value) }" />
        </button>
      </li>
    </ol>

    <p class="now">
      <template v-if="current">
        Write <b>{{ current.step.key }}</b> → <i class="sw" :style="{ background: rgb(current.step.value) }" />
        {{ current.step.label }}.
        <template v-if="rule === 'delta'">
          Memory already returned <i class="sw" :style="{ background: rgb(current.t.predicted) }" /> for
          {{ current.step.key }}, so it adds only β × the difference
          <code>[{{ current.t.written.map(fmt).join(', ') }}]</code>.
        </template>
        <template v-else> Adds the full value <code>[{{ current.t.written.map(fmt).join(', ') }}]</code> along the key. </template>
      </template>
      <template v-else>Empty memory. Click a step, or start from the first write.</template>
    </p>

    <div class="panes">
      <figure>
        <figcaption>State S (key channel × value channel)</figcaption>
        <table class="mat">
          <tbody>
            <tr v-for="(row, i) in S" :key="i">
              <td v-for="(x, j) in row" :key="j" :style="cell(x)">{{ fmt(x) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="note">Same 9 numbers however long the sequence gets.</p>
      </figure>

      <figure>
        <figcaption>Read back: Sᵀk for each key</figcaption>
        <table class="recall">
          <thead>
            <tr><th></th><th>last written</th><th>read</th><th>error</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.name">
              <th>{{ r.name }}</th>
              <td><i v-if="r.target" class="sw big" :style="{ background: rgb(r.target) }" /><span v-else>–</span></td>
              <td><i class="sw big" :style="{ background: rgb(r.got) }" /></td>
              <td :class="{ bad: r.err !== null && r.err > 0.15 }">{{ r.err === null ? '–' : r.err.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </figure>
    </div>
  </div>
</template>

<style scoped>
.rc {
  font-size: 0.92rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.2rem;
  align-items: center;
}
.ctl label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem 0.5rem;
  color: var(--muted);
}
.ctl label.off {
  opacity: 0.45;
}
.ctl input {
  width: 7.5rem;
}
output,
code {
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--text);
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
button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.seg {
  display: inline-flex;
}
.seg button:first-child {
  border-radius: 6px 0 0 6px;
}
.seg button:last-child {
  border-radius: 0 6px 6px 0;
  margin-left: -1px;
}
.script {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.script button {
  font-family: var(--mono);
  font-size: 0.82rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.script button.future {
  opacity: 0.45;
}
.sw {
  display: inline-block;
  width: 0.9em;
  height: 0.9em;
  border-radius: 3px;
  border: 1px solid var(--border);
  vertical-align: -0.1em;
}
.sw.big {
  width: 1.8rem;
  height: 1.2rem;
}
.now {
  margin: 0.8rem 0 1rem;
  min-height: 3em;
  line-height: 1.5;
}
.panes {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 2rem;
}
figure {
  margin: 0;
}
figcaption {
  color: var(--muted);
  font-size: 0.82rem;
  margin-bottom: 0.4rem;
}
table {
  border-collapse: collapse;
  font-family: var(--mono);
  font-size: 0.82rem;
}
.mat td {
  width: 3.4rem;
  height: 2rem;
  text-align: center;
  border: 1px solid var(--border);
}
.recall th,
.recall td {
  padding: 0.25rem 0.6rem 0.25rem 0;
  text-align: left;
  font-weight: normal;
}
.recall thead th {
  color: var(--muted);
  font-family: var(--font);
}
.bad {
  color: var(--danger);
}
.note {
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
  color: var(--muted);
}
</style>
