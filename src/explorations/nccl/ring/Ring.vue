<script setup lang="ts">
// NCCL's Ring AllReduce, one loop iteration, step by step (the paper's Table V and Fig. 4).
// Each GPU's buffer is split into k segments. At step s, GPU i receives segment (i - s) mod k
// from GPU i-1, does something with it, and (except at the last step) forwards it to GPU i+1.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Tex from '~/math/Tex.vue';

const LETTERS = 'abcdef';
const k = ref(4);
const s = ref(0); // current step, 0 .. 2k-2
const playing = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

const last = computed(() => 2 * k.value - 2);
const mod = (a: number) => ((a % k.value) + k.value) % k.value;

/** Which NCCL primitive runs at step `st` (every GPU runs the same one). */
function primitive(st: number) {
  const K = k.value;
  if (st === 0) return 'send';
  if (st <= K - 2) return 'recvReduceSend';
  if (st === K - 1) return 'recvReduceCopySend';
  if (st <= 2 * K - 3) return 'recvCopySend';
  return 'recv';
}
const rows = computed(() => {
  const K = k.value;
  return [
    { steps: '0', p: 'send', what: 'send one own segment to the next GPU', on: (x: number) => x === 0 },
    { steps: `1 to ${K - 2}`, p: 'recvReduceSend', what: 'add own segment to the partial sum, pass it on', on: (x: number) => x >= 1 && x <= K - 2 },
    { steps: `${K - 1}`, p: 'recvReduceCopySend', what: 'last add: sum complete, copy to output, pass on', on: (x: number) => x === K - 1 },
    { steps: `${K} to ${2 * K - 3}`, p: 'recvCopySend', what: 'copy a finished sum to output, pass it on', on: (x: number) => x >= K && x <= 2 * K - 3 },
    { steps: `${2 * K - 2}`, p: 'recv', what: 'copy the last finished sum, stop', on: (x: number) => x === 2 * K - 2 },
  ];
});

/**
 * Contents of GPU g, segment c, *after* step `st` has completed.
 * Returns the set of contributing GPUs (as a bitmask) and whether the output buffer holds it.
 */
function cell(g: number, c: number, st: number) {
  const K = k.value;
  const own = 1 << g;
  // Reduce phase: at step j (1..K-1), GPU g receives segment (g - j) carrying contributions
  // from GPUs g-j .. g-1 and adds its own. So after step j it holds g-j .. g.
  const j = mod(g - c); // the step at which this GPU handles segment c in the reduce phase
  let mask = own;
  let done = false;
  if (j >= 1 && st >= j) {
    for (let x = 0; x <= j; x++) mask |= 1 << mod(g - x);
  }
  if (mask === (1 << K) - 1) done = true;
  // Gather phase: at step K-1+m (m = 1..K-1), GPU g receives the finished segment (g + 1 - m).
  const m = mod(g + 1 - c); // 0 means it was finished locally at step K-1
  if (m >= 1 && st >= K - 1 + m) {
    mask = (1 << K) - 1;
    done = true;
  }
  return { mask, done };
}

function label(mask: number) {
  const parts: string[] = [];
  for (let i = 0; i < k.value; i++) if (mask & (1 << i)) parts.push(LETTERS[i]);
  return parts.length === k.value ? '\\Sigma' : parts.join('{+}');
}

/** Segment GPU g touches at step st. */
const active = (g: number, st: number) => mod(g - st);
const sends = (st: number) => st < last.value;

const doneCount = computed(() => {
  let n = 0;
  for (let g = 0; g < k.value; g++) for (let c = 0; c < k.value; c++) if (cell(g, c, s.value).done) n++;
  return n;
});

function step() {
  if (s.value < last.value) s.value++;
  else stop();
}
function stop() {
  playing.value = false;
  clearInterval(timer);
  timer = undefined;
}
function toggle() {
  if (playing.value) return stop();
  if (s.value >= last.value) s.value = 0;
  playing.value = true;
  timer = setInterval(step, 1100);
}
watch(k, () => {
  stop();
  s.value = 0;
});
onBeforeUnmount(stop);
</script>

<template>
  <div class="ncr">
    <div class="ctl">
      <label class="range">
        <span>GPUs <Tex t="k" /></span>
        <input v-model.number="k" type="range" min="3" max="6" />
        <output>{{ k }}</output>
      </label>
      <button :disabled="s === 0" @click="(stop(), s--)">back</button>
      <button :disabled="s >= last" @click="(stop(), step())">next step</button>
      <button @click="toggle">{{ playing ? 'pause' : 'play' }}</button>
    </div>

    <p class="now">
      step <b>{{ s }}</b> of {{ last }}
      <span class="phase">{{ s <= k - 1 ? 'reduce-scatter half' : 'all-gather half' }}</span>
      <code>{{ primitive(s) }}</code>
    </p>

    <div class="gpus" :style="{ gridTemplateColumns: `repeat(${k}, minmax(0, 1fr))` }">
      <div v-for="g in k" :key="g" class="gpu">
        <div class="name">GPU {{ g - 1 }} <span class="own">holds <Tex :t="LETTERS[g - 1]" /></span></div>
        <div
          v-for="c in k"
          :key="c"
          :class="[
            'seg',
            {
              done: cell(g - 1, c - 1, s).done,
              part: !cell(g - 1, c - 1, s).done && cell(g - 1, c - 1, s).mask !== 1 << (g - 1),
              act: active(g - 1, s) === c - 1,
            },
          ]"
        >
          <span class="idx">{{ c - 1 }}</span>
          <Tex :t="label(cell(g - 1, c - 1, s).mask)" />
        </div>
        <div class="arrow" :class="{ off: !sends(s) }">
          {{ sends(s) ? `${active(g - 1, s)} → GPU ${g % k}` : '—' }}
        </div>
      </div>
    </div>

    <table class="steps">
      <thead>
        <tr><th>step</th><th>primitive</th><th>what each GPU does</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.p" :class="{ on: r.on(s) }">
          <td>{{ r.steps }}</td>
          <td><code>{{ r.p }}</code></td>
          <td>{{ r.what }}</td>
        </tr>
      </tbody>
    </table>

    <p class="note">
      Finished segments: {{ doneCount }} of {{ k * k }}. Each GPU sends {{ last }} segments of size <Tex t="N/k" />, so
      <Tex :t="`\\tfrac{${last}}{${k}}N = ${(last / k).toFixed(2)}N`" /> in total. That approaches <Tex t="2N" /> as <Tex t="k" /> grows,
      which is why rings are bandwidth-optimal. But the {{ last + 1 }} steps run one after another, so latency grows with <Tex t="k" />.
    </p>
  </div>
</template>

<style scoped>
.ncr {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}
.range {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-right: 0.5rem;
  color: var(--muted);
}
.range input {
  width: 5rem;
}
.range output {
  font-family: var(--mono);
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
button:disabled {
  opacity: 0.4;
  cursor: default;
}
.now {
  margin: 0 0 0.6rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.7rem;
  align-items: baseline;
}
.phase {
  color: var(--muted);
}
code {
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--accent);
}
.gpus {
  display: grid;
  gap: 0.4rem;
}
.gpu {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.name {
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}
.own {
  font-weight: 400;
  color: var(--muted);
}
@media (max-width: 480px) {
  .own {
    display: none;
  }
}
.seg {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0.35rem 0.2rem 0.3rem;
  text-align: center;
  font-size: 0.8rem;
  min-height: 2.1rem;
  overflow: hidden;
  transition: background 0.25s, border-color 0.25s;
}
.seg .idx {
  position: absolute;
  top: 1px;
  left: 3px;
  font-size: 0.6rem;
  color: var(--muted);
  font-family: var(--mono);
}
.seg.part {
  background: var(--accent-soft);
}
.seg.done {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}
.seg.done .idx {
  color: var(--bg);
}
.seg.act {
  outline: 2px solid var(--danger);
  outline-offset: -1px;
}
.arrow {
  font-family: var(--mono);
  font-size: 0.7rem;
  color: var(--danger);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.arrow.off {
  color: var(--muted);
}
.steps {
  width: 100%;
  border-collapse: collapse;
  margin: 0.9rem 0 0.5rem;
  font-size: 0.8rem;
}
.steps th,
.steps td {
  text-align: left;
  padding: 0.25rem 0.4rem;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.steps th {
  color: var(--muted);
  font-weight: 500;
}
.steps td:first-child {
  white-space: nowrap;
  font-family: var(--mono);
}
.steps tr.on {
  background: var(--accent-soft);
}
.steps code {
  word-break: break-all;
}
.note {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 0;
}
</style>
