<script setup lang="ts">
// A rolling-buffer KV cache: with window W, token at position p is written to slot p mod W,
// overwriting whatever fell out of the window. Memory stays at W slots however long the text gets.
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const WORDS = (
  'the cat sat on the mat and watched the rain fall past the window while the kettle ' +
  'hummed and the clock ticked slowly towards noon on a grey day'
).split(' ');

const W = ref(4);
const t = ref(0); // tokens processed so far
const playing = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

const slots = computed(() =>
  Array.from({ length: W.value }, (_, s) => {
    // Most recent position p < t with p mod W === s.
    const last = t.value - 1;
    const p = last - ((((last - s) % W.value) + W.value) % W.value);
    return { s, p: p >= 0 ? p : null };
  }),
);
const newest = computed(() => (t.value > 0 ? (t.value - 1) % W.value : -1));
const nextSlot = computed(() => (t.value < WORDS.length ? t.value % W.value : -1));
const evicting = computed(() => {
  const p = t.value - W.value; // position that the next write will overwrite
  return p >= 0 && t.value < WORDS.length ? p : null;
});

function state(p: number) {
  if (p >= t.value) return 'future';
  if (p >= t.value - W.value) return p === t.value - 1 ? 'cur' : 'in';
  return 'out';
}

function step() {
  if (t.value < WORDS.length) t.value++;
  if (t.value >= WORDS.length) stop();
}
function stop() {
  playing.value = false;
  clearInterval(timer);
  timer = undefined;
}
function toggle() {
  if (playing.value) return stop();
  if (t.value >= WORDS.length) t.value = 0;
  playing.value = true;
  timer = setInterval(step, 700);
}
function reset() {
  stop();
  t.value = 0;
}
watch(W, reset);
onBeforeUnmount(stop);
</script>

<template>
  <div class="swc">
    <div class="ctl">
      <label class="range">
        <span>window W</span>
        <input v-model.number="W" type="range" min="2" max="8" />
        <output>{{ W }}</output>
      </label>
      <button @click="step" :disabled="t >= WORDS.length">next token</button>
      <button @click="toggle">{{ playing ? 'pause' : 'play' }}</button>
      <button @click="reset">reset</button>
    </div>

    <div class="stream" aria-label="Token stream">
      <span v-for="(w, p) in WORDS" :key="p" :class="['tok', state(p), { evict: p === evicting }]" :title="`position ${p}`">
        {{ w }}
      </span>
    </div>

    <p class="label">cache: {{ W }} slots, token at position p goes to slot p mod {{ W }}</p>
    <div class="slots" :style="{ gridTemplateColumns: `repeat(${W}, minmax(0, 1fr))` }">
      <div v-for="sl in slots" :key="sl.s" :class="['slot', { cur: sl.s === newest, next: sl.s === nextSlot && t > 0 }]">
        <span class="idx">slot {{ sl.s }}</span>
        <span class="word">{{ sl.p === null ? '—' : WORDS[sl.p] }}</span>
        <span class="pos">{{ sl.p === null ? '' : `pos ${sl.p}` }}</span>
      </div>
    </div>

    <p class="note" aria-live="polite">
      <template v-if="t === 0">Press <b>next token</b> to start reading.</template>
      <template v-else>
        Read {{ t }} token{{ t === 1 ? '' : 's' }}. A full cache would hold {{ t }}; this one holds {{ Math.min(t, W) }}.
        <template v-if="evicting !== null">
          Next write goes to slot {{ nextSlot }} and drops “{{ WORDS[evicting] }}” (pos {{ evicting }}).
        </template>
      </template>
    </p>
  </div>
</template>

<style scoped>
.swc {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.9rem;
}
.range {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-right: 0.5rem;
  color: var(--muted);
}
.range input {
  width: 6.5rem;
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
.stream {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  line-height: 1.2;
}
.tok {
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  border: 1px solid transparent;
  font-family: var(--mono);
  font-size: 0.8rem;
  transition: background 0.2s, color 0.2s;
}
.tok.future {
  color: var(--muted);
  border-color: var(--border);
  border-style: dashed;
  opacity: 0.6;
}
.tok.out {
  color: var(--muted);
  text-decoration: line-through;
  opacity: 0.6;
}
.tok.in {
  background: var(--accent-soft);
  color: var(--accent);
}
.tok.cur {
  background: var(--accent);
  color: var(--bg);
}
.tok.evict {
  outline: 1.5px solid var(--danger);
}
.label {
  margin: 1rem 0 0.4rem;
  color: var(--muted);
  font-size: 0.82rem;
}
.slots {
  display: grid;
  gap: 0.35rem;
}
.slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  padding: 0.4rem 0.2rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  min-width: 0;
}
.slot.cur {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.slot.next {
  border-color: var(--danger);
  border-style: dashed;
}
.idx,
.pos {
  font-size: 0.7rem;
  color: var(--muted);
}
.word {
  font-family: var(--mono);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.note {
  margin: 0.7rem 0 0;
  min-height: 2.8em;
  font-size: 0.85rem;
}
</style>
