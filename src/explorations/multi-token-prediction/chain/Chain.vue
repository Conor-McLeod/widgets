<script setup lang="ts">
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';

// A 7-token training sequence. Positions 1..6 are inputs; token 7 only ever appears as a target.
const TOKENS = ['The', 'cat', 'sat', 'on', 'the', 'mat', '.'];
const N = TOKENS.length - 1;
const cols = Array.from({ length: N }, (_, i) => i + 1);
const tok = (i: number) => TOKENS[i - 1];

type Mode = 'seq' | 'par';
const mode = ref<Mode>('seq');
const depth = ref(2);
const sel = ref(3);

// Module k at position i predicts token i+k+1. In sequential mode it also reads token i+k.
const valid = (k: number, i: number) => i + k + 1 <= TOKENS.length;
const modules = computed(() => Array.from({ length: depth.value }, (_, j) => depth.value - j)); // top row first

// Tokens the selected column's predictors see as input (beyond the trunk's own causal prefix).
const fed = computed(() => {
  const s = new Set<number>();
  if (mode.value === 'seq') for (let k = 1; k <= depth.value; k++) if (valid(k, sel.value)) s.add(sel.value + k);
  return s;
});
const targets = computed(() => {
  const s = new Set<number>([sel.value + 1]);
  for (let k = 1; k <= depth.value; k++) if (valid(k, sel.value)) s.add(sel.value + k + 1);
  return s;
});

const signals = computed(() => {
  const rows = [{ name: 'main head', n: N }];
  for (let k = 1; k <= depth.value; k++) rows.push({ name: `module ${k}`, n: N - k });
  return rows;
});
const totalSignals = computed(() => signals.value.reduce((a, r) => a + r.n, 0));

const story = computed(() => {
  const i = sel.value;
  const parts: string[] = [];
  parts.push(`At position ${i} the model has read “${TOKENS.slice(0, i).join(' ')}”. The main head predicts “${tok(i + 1)}”.`);
  for (let k = 1; k <= depth.value; k++) {
    if (!valid(k, i)) {
      parts.push(`Module ${k} has nothing to predict here: the sequence has ended.`);
      break;
    }
    parts.push(
      mode.value === 'seq'
        ? `Module ${k} is handed the true “${tok(i + k)}” and predicts “${tok(i + k + 1)}”.`
        : `Head ${k} must predict “${tok(i + k + 1)}” without being told ${k === 1 ? `“${tok(i + 1)}”` : `the ${k} tokens in between`}.`,
    );
  }
  return parts.join(' ');
});
</script>

<template>
  <div class="mtp">
    <div class="bar">
      <div class="seg">
        <button :aria-pressed="mode === 'seq'" @click="mode = 'seq'">Sequential modules</button>
        <button :aria-pressed="mode === 'par'" @click="mode = 'par'">Parallel heads</button>
      </div>
      <div class="seg">
        <span class="lbl">Depth <Tex t="D" /></span>
        <button v-for="d in [1, 2, 3]" :key="d" :aria-pressed="depth === d" @click="depth = d">{{ d }}</button>
      </div>
    </div>

    <div class="grid" :style="{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }">
      <template v-for="k in modules" :key="k">
        <div class="band mod">
          <span>{{ mode === 'seq' ? `MTP module ${k}` : `Extra head ${k}` }}</span>
          <em>{{ mode === 'seq' ? 'one transformer block · reads the state below plus one true token' : 'reads the trunk only' }}</em>
        </div>
        <button
          v-for="i in cols"
          :key="`${k}-${i}`"
          class="cell"
          :class="{ off: !valid(k, i), sel: i === sel }"
          @click="sel = i"
        >
          <template v-if="valid(k, i)">
            <b class="tgt" :class="{ hot: i === sel }">{{ tok(i + k + 1) }}</b>
            <span class="h"><Tex :t="mode === 'seq' ? `h^{${k}}_{${i}}` : `h^{0}_{${i}}`" /></span>
            <span v-if="mode === 'seq'" class="chip" :class="{ hot: i === sel }">+ {{ tok(i + k) }}</span>
          </template>
          <span v-else class="none">no target</span>
        </button>
      </template>

      <div class="band main">
        <span>Main model</span>
        <em>all layers · shared embedding and output head</em>
      </div>
      <button v-for="i in cols" :key="`m-${i}`" class="cell" :class="{ sel: i === sel }" @click="sel = i">
        <b class="tgt" :class="{ hot: i === sel }">{{ tok(i + 1) }}</b>
        <span class="h"><Tex :t="`h^{0}_{${i}}`" /></span>
      </button>

      <div class="band inp"><span>Input tokens</span></div>
      <button
        v-for="i in cols"
        :key="`t-${i}`"
        class="tok"
        :class="{ sel: i === sel, read: i <= sel, fed: fed.has(i) }"
        @click="sel = i"
      >
        <small>{{ i }}</small>{{ tok(i) }}
      </button>
    </div>
    <div class="tail">
      Target tokens:
      <span v-for="(t, j) in TOKENS" :key="j" class="tt" :class="{ hot: targets.has(j + 1), fed: fed.has(j + 1) }">{{ t }}</span>
    </div>

    <p class="story">{{ story }}</p>

    <div class="sig">
      <span>Predictions graded per sequence:</span>
      <span v-for="r in signals" :key="r.name"><b>{{ r.n }}</b> {{ r.name }}</span>
      <span>= <b>{{ totalSignals }}</b> vs <b>{{ N }}</b> without MTP</span>
    </div>

    <div class="legend">
      <span class="lg-read">already read</span><span class="lg-fed">true token handed in</span><span class="lg-hot">target</span>
      <em>click a column</em>
    </div>
  </div>
</template>

<style scoped>
.mtp {
  font-size: 0.9rem;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-bottom: 0.8rem;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
}
.lbl {
  color: var(--muted);
  margin-right: 0.2rem;
}
button {
  font: inherit;
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.seg button[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--surface);
}
.grid {
  display: grid;
  gap: 4px;
}
.band {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 0.6rem;
  margin-top: 0.4rem;
  font-size: 0.8rem;
  font-weight: 600;
}
.band em {
  font-weight: 400;
  font-style: normal;
  color: var(--muted);
  font-size: 0.75rem;
}
.band.mod span {
  color: var(--accent);
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  padding: 0.3rem 0.1rem;
  min-height: 4.4rem;
  background: var(--surface);
  border-radius: 6px;
  overflow: hidden;
}
.cell.sel {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.cell.off {
  background: var(--bg);
  border-style: dashed;
  justify-content: center;
}
.none {
  font-size: 0.68rem;
  color: var(--muted);
  text-align: center;
  line-height: 1.1;
}
.tgt {
  font-family: var(--mono);
  font-size: 0.8rem;
  padding: 0 0.25rem;
  border-radius: 4px;
  border: 1px solid transparent;
  white-space: nowrap;
}
.tgt.hot,
.tt.hot {
  border-color: var(--accent);
  color: var(--accent);
}
.h {
  font-size: 0.78rem;
  color: var(--muted);
}
.chip {
  font-family: var(--mono);
  font-size: 0.7rem;
  padding: 0 0.25rem;
  border-radius: 4px;
  color: var(--muted);
  border: 1px solid var(--border);
  white-space: nowrap;
}
.chip.hot {
  background: var(--accent-soft);
  color: var(--text);
  border-color: transparent;
}
.tok {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.2rem 0.1rem;
  font-family: var(--mono);
  font-size: 0.8rem;
  min-width: 0;
}
.tok small {
  font-size: 0.65rem;
  color: var(--muted);
}
.tok.read {
  background: color-mix(in srgb, var(--muted) 14%, var(--surface));
}
.tok.fed,
.tt.fed {
  background: var(--accent-soft);
}
.tok.sel {
  border-color: var(--accent);
}
.tail {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
  font-size: 0.78rem;
  color: var(--muted);
}
.tt {
  font-family: var(--mono);
  color: var(--text);
  padding: 0 0.3rem;
  border: 1px solid var(--border);
  border-radius: 4px;
}
.story {
  margin: 0.8rem 0 0.5rem;
  min-height: 4.8em;
}
.sig {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 0.8rem;
  font-size: 0.8rem;
  color: var(--muted);
}
.sig b {
  color: var(--text);
  font-family: var(--mono);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.9rem;
  margin-top: 0.6rem;
  font-size: 0.75rem;
  align-items: center;
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.legend span::before {
  content: '';
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 2px;
  border: 1px solid var(--border);
}
.legend .lg-read::before {
  background: color-mix(in srgb, var(--muted) 14%, var(--surface));
}
.legend .lg-fed::before {
  background: var(--accent-soft);
  border-color: transparent;
}
.legend .lg-hot::before {
  border-color: var(--accent);
}
.legend em {
  color: var(--muted);
  font-style: normal;
}
</style>
