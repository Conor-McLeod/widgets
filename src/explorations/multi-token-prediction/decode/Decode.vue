<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue';
import Tex from '~/math/Tex.vue';

// What the main model would write under greedy decoding. Speculation never changes this text,
// only how many forward passes it takes to produce it.
const TEXT = (
  'The cache was warm and the batch was small , so the GPU spent most of each step waiting on memory . ' +
  'A forward pass that checks four tokens costs about the same as one that checks a single token , ' +
  'which is why a cheap guess at the next few words is worth making . ' +
  'When the guess is right the model keeps it for free , and when it is wrong the model simply carries on . '
).trim().split(' ');
const DISTRACT = ['a', 'it', 'very', 'and', 'then', 'all', 'so', 'is', 'of', 'we', 'cold', 'two'];
const SHOW = 44;

const p = reactive({ acc: 0.85, decay: 0.85, k: 1 });
const accAt = (j: number) => p.acc * p.decay ** (j - 1); // chance draft j is right, given drafts before it were

type Tok = { w: string; kind: 'main' | 'draft' };
type Draft = { w: string; ok: boolean };
type Pass = { n: number; drafts: Draft[]; accepted: number; bonus: string };

let seed = 12345;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const out = ref<Tok[]>([]);
const drafts = ref<Draft[]>([]);
const last = ref<Pass | null>(null);
const stats = reactive({ passes: 0, tokens: 0 });
const pos = ref(0); // index into TEXT (cycled) of the next token to produce

const word = (i: number) => TEXT[i % TEXT.length];

function makeDrafts() {
  const d: Draft[] = [];
  let chainOk = true;
  for (let j = 1; j <= p.k; j++) {
    const ok = chainOk && rand() < accAt(j);
    chainOk = ok;
    const truth = word(pos.value + j - 1);
    let w = truth;
    if (!ok) do w = DISTRACT[Math.floor(rand() * DISTRACT.length)]; while (w === truth);
    d.push({ w, ok });
  }
  drafts.value = d;
}

function step() {
  // One forward pass of the main model over [last token, drafts...]: accept the longest correct
  // prefix of drafts, then take the main model's own next token at the first mismatch.
  const d = drafts.value;
  let accepted = 0;
  while (accepted < d.length && d[accepted].ok) accepted++;
  for (let j = 0; j < accepted; j++) out.value.push({ w: d[j].w, kind: 'draft' });
  const bonus = word(pos.value + accepted);
  out.value.push({ w: bonus, kind: 'main' });
  pos.value += accepted + 1;
  stats.passes++;
  stats.tokens += accepted + 1;
  last.value = { n: stats.passes, drafts: d, accepted, bonus };
  if (out.value.length > 400) out.value.splice(0, out.value.length - SHOW);
  makeDrafts(); // the MTP module runs on the new hidden state to propose the next drafts
}

function reset() {
  stop();
  seed = 12345;
  out.value = [];
  pos.value = 0;
  stats.passes = 0;
  stats.tokens = 0;
  last.value = null;
  makeDrafts();
}

let timer: ReturnType<typeof setInterval> | undefined;
const playing = ref(false);
function stop() {
  clearInterval(timer);
  timer = undefined;
  playing.value = false;
}
function toggle() {
  if (playing.value) return stop();
  playing.value = true;
  timer = setInterval(step, 450);
}
function fast() {
  for (let i = 0; i < 200; i++) step();
}
onUnmounted(stop);

function setK(k: number) {
  p.k = k;
  makeDrafts();
}

const shown = computed(() => out.value.slice(-SHOW));
const clipped = computed(() => out.value.length > SHOW || stats.tokens > SHOW);
const expected = computed(() => {
  let e = 1;
  let prod = 1;
  for (let j = 1; j <= p.k; j++) e += (prod *= accAt(j));
  return e;
});
const rate = computed(() => (stats.passes ? stats.tokens / stats.passes : 0));

reset();
</script>

<template>
  <div class="dec">
    <div class="text" aria-live="off">
      <span v-if="clipped" class="ell">…</span>
      <span v-for="(t, i) in shown" :key="i" :class="t.kind">{{ t.w }}</span>
      <span v-for="(d, j) in drafts" :key="`d${j}`" class="pending" :title="`draft ${j + 1}`">{{ d.w }}</span>
    </div>

    <div class="pass">
      <template v-if="last">
        <span class="pn">pass {{ last.n }}</span>
        <span v-if="!last.drafts.length" class="muted">no drafts to check</span>
        <span
          v-for="(d, j) in last.drafts"
          :key="j"
          class="chk"
          :class="j < last.accepted ? 'yes' : j === last.accepted ? 'no' : 'skip'"
          >{{ d.w }}</span
        >
        <span class="arrow">→</span>
        <span class="chk own">{{ last.bonus }}</span>
        <span class="muted">{{ last.accepted + 1 }} token{{ last.accepted ? 's' : '' }}</span>
      </template>
      <span v-else class="muted">Press Step. Dashed words are the MTP module's drafts, waiting to be checked.</span>
    </div>

    <div class="btns">
      <button @click="step">Step</button>
      <button :aria-pressed="playing" @click="toggle">{{ playing ? 'Pause' : 'Play' }}</button>
      <button @click="fast" title="Run 200 passes">+200</button>
      <button @click="reset">Reset</button>
    </div>

    <div class="stats">
      <div><b>{{ stats.passes }}</b><span>forward passes</span></div>
      <div><b>{{ stats.tokens }}</b><span>tokens out</span></div>
      <div><b>{{ rate.toFixed(2) }}</b><span>tokens / pass</span></div>
      <div><b>{{ expected.toFixed(2) }}</b><span>expected</span></div>
    </div>

    <div class="ctl">
      <div class="row">
        <span>Drafts per pass <Tex t="k" /></span>
        <div class="seg">
          <button v-for="k in [0, 1, 2, 3, 4]" :key="k" :aria-pressed="p.k === k" @click="setK(k)">{{ k }}</button>
        </div>
      </div>
      <label>
        <span>First-draft acceptance <Tex t="a" /></span>
        <input v-model.number="p.acc" type="range" min="0.3" max="0.99" step="0.01" />
        <output>{{ Math.round(p.acc * 100) }}%</output>
      </label>
      <label :class="{ off: p.k < 2 }">
        <span>Decay per extra draft <Tex t="r" /></span>
        <input v-model.number="p.decay" type="range" min="0.5" max="1" step="0.01" :disabled="p.k < 2" />
        <output>×{{ p.decay.toFixed(2) }}</output>
      </label>
    </div>

    <div class="legend">
      <span class="lg main">main model's own token</span>
      <span class="lg draft">accepted draft</span>
      <span class="lg pending">draft, not yet checked</span>
      <span class="lg no">rejected</span>
    </div>
  </div>
</template>

<style scoped>
.dec {
  font-size: 0.9rem;
}
.text {
  font-family: var(--mono);
  font-size: 0.82rem;
  line-height: 1.9;
  min-height: 9.6em;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 0 0.45em;
}
.text span,
.lg {
  border-radius: 3px;
  padding: 0 0.15em;
}
.ell {
  color: var(--muted);
}
.draft {
  background: var(--accent-soft);
  color: var(--accent);
}
.pending {
  outline: 1px dashed var(--muted);
  outline-offset: -1px;
  color: var(--muted);
}
.pass {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  margin: 0.6rem 0;
  min-height: 1.8rem;
  font-size: 0.82rem;
}
.pn {
  font-family: var(--mono);
  color: var(--muted);
  margin-right: 0.3rem;
}
.muted {
  color: var(--muted);
}
.chk {
  font-family: var(--mono);
  padding: 0 0.35rem;
  border-radius: 4px;
  border: 1px solid var(--border);
}
.chk.yes {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: transparent;
}
.chk.yes::after {
  content: ' ✓';
}
.chk.no,
.lg.no {
  color: var(--danger);
  text-decoration: line-through;
}
.chk.no {
  border-color: var(--danger);
}
.chk.skip {
  color: var(--muted);
  text-decoration: line-through;
  opacity: 0.6;
}
.chk.own {
  font-weight: 600;
}
.arrow {
  color: var(--muted);
}
.btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
button {
  font: inherit;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
button[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--surface);
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0.8rem 0;
}
.stats div {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  background: var(--surface);
}
.stats b {
  font-family: var(--mono);
  font-size: 1.05rem;
}
.stats span {
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.2;
}
.ctl {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.ctl label,
.ctl .row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
  flex-wrap: wrap;
}
.ctl label > span,
.ctl .row > span {
  width: 12rem;
  flex-shrink: 0;
}
.ctl input {
  flex: 1;
  min-width: 8rem;
}
.ctl output {
  width: 3rem;
  font-family: var(--mono);
  color: var(--text);
  text-align: right;
}
.ctl .off {
  opacity: 0.5;
}
.seg {
  display: flex;
  gap: 0.3rem;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.8rem;
  margin-top: 0.7rem;
  font-size: 0.75rem;
  font-family: var(--mono);
}
</style>
