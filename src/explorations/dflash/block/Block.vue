<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { SCENARIOS, type Scenario } from './scenarios';

type Mode = 'top1' | 'select' | 'oracle' | 'manual';

const scenarioKey = ref(SCENARIOS[0].key);
const sc = computed<Scenario>(() => SCENARIOS.find((s) => s.key === scenarioKey.value)!);
const mode = ref<Mode>('top1');
const manual = ref<number[]>([]);

const pairOf = (a: string, b: string) => sc.value.pair[`${a}→${b}`] ?? 0;

// Indices of the chosen candidate at each position, plus the pair term the selector used.
const picks = computed<{ idx: number; pair: number }[]>(() => {
  const s = sc.value;
  if (mode.value === 'manual') return manual.value.map((idx) => ({ idx, pair: 0 }));
  if (mode.value === 'oracle') {
    return s.cands.map((cs, i) => {
      const hit = cs.findIndex((c) => c.tok === s.target[i]);
      return { idx: hit < 0 ? 0 : hit, pair: 0 };
    });
  }
  if (mode.value === 'top1') return s.cands.map(() => ({ idx: 0, pair: 0 }));
  // Path selector: walk from the anchor, at each position take the candidate with the best
  // own-logit + pair score given the token just chosen before it.
  let prev = s.anchor;
  return s.cands.map((cs) => {
    let best = 0;
    let bestScore = -Infinity;
    cs.forEach((c, j) => {
      const score = Math.log(c.p) + pairOf(prev, c.tok);
      if (score > bestScore) [best, bestScore] = [j, score];
    });
    const pick = { idx: best, pair: pairOf(prev, cs[best].tok) };
    prev = cs[best].tok;
    return pick;
  });
});

const drafted = computed(() => picks.value.map((p, i) => sc.value.cands[i][p.idx].tok));
const accepted = computed(() => {
  let n = 0;
  while (n < drafted.value.length && drafted.value[n] === sc.value.target[n]) n++;
  return n;
});
const fromTarget = computed(() => sc.value.target[accepted.value]);

function choose(i: number, j: number) {
  if (mode.value !== 'manual') manual.value = picks.value.map((p) => p.idx);
  const next = [...manual.value];
  next[i] = j;
  manual.value = next;
  mode.value = 'manual';
}
watch(scenarioKey, () => {
  if (mode.value === 'manual') mode.value = 'top1';
});

const modes: { key: Mode; label: string }[] = [
  { key: 'top1', label: 'DFlash: top-1 each' },
  { key: 'select', label: 'DFlash 2: path selector' },
  { key: 'oracle', label: 'Oracle' },
];

const show = (t: string) => t.replace(/\\n/g, '↵');
const state = (i: number) => (i < accepted.value ? 'ok' : i === accepted.value ? 'bad' : 'gone');
</script>

<template>
  <div class="blk">
    <div class="bar">
      <label>
        <span class="muted">example</span>
        <select v-model="scenarioKey">
          <option v-for="s in SCENARIOS" :key="s.key" :value="s.key">{{ s.name }}</option>
        </select>
      </label>
      <div class="seg" role="radiogroup" aria-label="How to pick one token per position">
        <button
          v-for="m in modes"
          :key="m.key"
          role="radio"
          :aria-checked="mode === m.key"
          :class="{ on: mode === m.key }"
          @click="mode = m.key"
        >
          {{ m.label }}
        </button>
        <button v-if="mode === 'manual'" class="on" role="radio" aria-checked="true">your picks</button>
      </div>
    </div>
    <p class="blurb muted">{{ sc.blurb }}</p>

    <div class="grid">
      <div class="hdr">pos</div>
      <div class="hdr">drafter’s top 4 (one parallel pass; click to pick)</div>
      <div class="hdr r">target</div>

      <div class="pos">0</div>
      <div class="cands">
        <span class="chip anchor">{{ show(sc.anchor) }}</span>
        <span class="muted small">last verified token</span>
      </div>
      <div class="tgt"></div>

      <template v-for="(cs, i) in sc.cands" :key="`${sc.key}-${i}`">
        <div class="pos">{{ i + 1 }}</div>
        <div class="cands" :class="{ dim: state(i) === 'gone' }">
          <button
            v-for="(c, j) in cs"
            :key="c.tok"
            class="chip"
            :class="{ pick: picks[i].idx === j, [state(i)]: picks[i].idx === j }"
            :title="`p = ${c.p}`"
            @click="choose(i, j)"
          >
            <span class="tok">{{ show(c.tok) }}</span>
            <span class="p">{{ Math.round(c.p * 100) }}%</span>
            <span v-if="mode === 'select' && picks[i].idx === j && picks[i].pair" class="pr">
              {{ picks[i].pair > 0 ? '+' : '' }}{{ picks[i].pair }}
            </span>
          </button>
        </div>
        <div class="tgt r">
          <template v-if="state(i) === 'ok'"><span class="mk ok">✓</span></template>
          <template v-else-if="state(i) === 'bad'">
            <span class="mk bad">✗</span> <code>{{ show(sc.target[i]) }}</code>
          </template>
          <span v-else class="muted small">discarded</span>
        </div>
      </template>
      <template v-if="accepted === sc.cands.length">
        <div class="pos">{{ sc.cands.length + 1 }}</div>
        <div class="cands"><span class="muted small">no draft here: the target’s own next token is free</span></div>
        <div class="tgt r"><span class="mk ok">+</span> <code>{{ show(fromTarget) }}</code></div>
      </template>
    </div>

    <p class="out">
      <span class="muted">{{ sc.context }}</span> <span>{{ show(sc.anchor) }}</span>
      <mark v-for="(t, i) in drafted.slice(0, accepted)" :key="i" class="acc">{{ show(t) }}</mark>
      <mark class="tg">{{ show(fromTarget) }}</mark>
    </p>
    <p class="stat">
      <b>{{ accepted + 1 }}</b> tokens from this cycle
      <span class="muted">
        = {{ accepted }} accepted draft{{ accepted === 1 ? '' : 's' }} + 1 from the target
        {{ accepted === sc.cands.length ? '(bonus)' : '(correction)' }}
      </span>
    </p>
    <div class="legend">
      <span><i class="sw acc"></i>accepted draft</span>
      <span><i class="sw tg"></i>written by the target</span>
      <span v-if="mode === 'select'"><span class="pr">+2</span> pair score added by the selector</span>
    </div>
  </div>
</template>

<style scoped>
.blk {
  font-size: 0.9rem;
}
.muted {
  color: var(--muted);
}
.small {
  font-size: 0.75rem;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  align-items: center;
}
.bar label {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
select,
button {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
}
select {
  padding: 0.15rem 0.3rem;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.seg button {
  padding: 0.2rem 0.55rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.seg button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.blurb {
  margin: 0.5rem 0 0.6rem;
  font-size: 0.82rem;
}
.grid {
  display: grid;
  grid-template-columns: 1.6rem minmax(0, 1fr) auto;
  gap: 4px 0.5rem;
  align-items: center;
}
.hdr {
  font-size: 0.72rem;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  padding-bottom: 2px;
}
.r {
  text-align: right;
}
.pos {
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--muted);
  text-align: center;
}
.cands {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  align-items: center;
  transition: opacity 0.2s;
}
.cands.dim {
  opacity: 0.45;
}
.chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.25rem;
  padding: 0.1rem 0.4rem;
  font-family: var(--mono);
  font-size: 0.78rem;
  cursor: pointer;
  white-space: pre;
}
.chip .p {
  font-size: 0.66rem;
  color: var(--muted);
}
.chip.anchor {
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  cursor: default;
}
.chip.pick {
  border-color: var(--text);
  box-shadow: inset 0 0 0 1px var(--text);
}
.chip.pick.ok {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
  background: var(--accent-soft);
}
.chip.pick.bad {
  border-color: var(--danger);
  box-shadow: inset 0 0 0 1px var(--danger);
}
.pr {
  font-family: var(--mono);
  font-size: 0.66rem;
  color: var(--accent);
  font-weight: 600;
}
.tgt {
  font-size: 0.8rem;
  white-space: nowrap;
}
.tgt code {
  white-space: pre;
}
.mk {
  font-weight: 700;
}
.mk.ok {
  color: var(--accent);
}
.mk.bad {
  color: var(--danger);
}
.out {
  margin: 0.8rem 0 0.2rem;
  font-family: var(--mono);
  font-size: 0.82rem;
  line-height: 1.9;
  white-space: pre-wrap;
}
mark {
  color: var(--text);
  border-radius: 3px;
  padding: 0.05rem 0.2rem;
  margin-left: 0.25rem;
}
mark.acc,
.sw.acc {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--accent);
}
mark.tg,
.sw.tg {
  background: transparent;
  border: 1px dashed var(--muted);
}
.stat {
  margin: 0;
  font-size: 0.85rem;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
  margin-top: 0.4rem;
  font-size: 0.76rem;
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
