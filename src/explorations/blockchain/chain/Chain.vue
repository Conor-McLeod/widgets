<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { leadingZeros, sha256 } from '../lib/sha256';

interface Block {
  data: string;
  nonce: number;
}

const ZERO = '0'.repeat(64);
const DEFAULTS = ['Genesis', 'Alice pays Bob 10', 'Bob pays Carol 4', 'Carol pays Dave 1'];

/** What gets hashed. Real headers are fixed-width binary; a delimited string keeps it readable. */
function headerHash(index: number, prev: string, data: string, nonce: number) {
  return sha256(`${index}|${prev}|${data}|${nonce}`);
}

function mineSync(index: number, prev: string, data: string, difficulty: number): number {
  let nonce = 0;
  while (leadingZeros(headerHash(index, prev, data, nonce)) < difficulty) nonce++;
  return nonce;
}

function freshChain(difficulty: number): Block[] {
  const out: Block[] = [];
  let prev = ZERO;
  DEFAULTS.forEach((data, i) => {
    const nonce = mineSync(i, prev, data, difficulty);
    out.push({ data, nonce });
    prev = headerHash(i, prev, data, nonce);
  });
  return out;
}

const difficulty = ref(3);
const blocks = ref<Block[]>(freshChain(difficulty.value));

const rows = computed(() => {
  let prev = ZERO;
  let chainOk = true;
  return blocks.value.map((b, i) => {
    const hash = headerHash(i, prev, b.data, b.nonce);
    const powOk = leadingZeros(hash) >= difficulty.value;
    const status = !chainOk ? 'orphan' : powOk ? 'ok' : 'bad';
    const row = { i, prev, hash, zeros: leadingZeros(hash), status };
    chainOk = chainOk && powOk;
    prev = hash;
    return row;
  });
});

const firstBad = computed(() => rows.value.findIndex((r) => r.status !== 'ok'));
const expected = computed(() => 16 ** difficulty.value);

// Mining runs in small time slices so the page stays responsive and the nonce visibly counts up.
const mining = ref<number | null>(null);
const tries = ref(0);
const lastTries = ref<Record<number, number>>({});
let raf = 0;
let queue: number[] = [];

function mine(i: number) {
  if (mining.value !== null) return;
  mining.value = i;
  tries.value = 0;
  blocks.value[i].nonce = 0;
  const step = () => {
    const r = rows.value[i];
    const b = blocks.value[i];
    const t0 = performance.now();
    let n = b.nonce;
    let found = false;
    while (performance.now() - t0 < 12) {
      for (let k = 0; k < 200; k++) {
        if (leadingZeros(headerHash(i, r.prev, b.data, n)) >= difficulty.value) {
          found = true;
          break;
        }
        n++;
      }
      if (found) break;
    }
    tries.value += n - b.nonce + (found ? 1 : 0);
    b.nonce = n;
    if (found) {
      lastTries.value[i] = tries.value;
      mining.value = null;
      const next = queue.shift();
      if (next !== undefined) mine(next);
    } else {
      raf = requestAnimationFrame(step);
    }
  };
  raf = requestAnimationFrame(step);
}

function mineAll() {
  if (mining.value !== null || firstBad.value < 0) return;
  queue = rows.value.slice(firstBad.value + 1).map((r) => r.i);
  mine(firstBad.value);
}

function stop() {
  cancelAnimationFrame(raf);
  queue = [];
  mining.value = null;
}

function reset() {
  stop();
  lastTries.value = {};
  blocks.value = freshChain(difficulty.value);
}

function onNonce(i: number, ev: Event) {
  const v = Number((ev.target as HTMLInputElement).value);
  if (Number.isInteger(v) && v >= 0) blocks.value[i].nonce = v;
}

onBeforeUnmount(stop);

const LABEL = {
  ok: 'valid',
  bad: 'proof of work fails',
  orphan: 'builds on an invalid block',
} as const;
</script>

<template>
  <div class="ch">
    <div class="bar">
      <span class="muted">difficulty</span>
      <div class="seg" role="group" aria-label="Difficulty: leading zero hex digits required">
        <button
          v-for="d in 5"
          :key="d"
          :class="{ sel: d === difficulty }"
          :disabled="mining !== null"
          @click="difficulty = d"
        >
          {{ d }}
        </button>
      </div>
      <span class="muted small"
        >hash must start with {{ difficulty }} zero{{ difficulty > 1 ? 's' : '' }} · ~{{
          expected.toLocaleString()
        }}
        tries</span
      >
    </div>

    <ol class="blocks">
      <li v-for="r in rows" :key="r.i" :class="['blk', r.status]">
        <header>
          <strong>Block {{ r.i }}</strong>
          <span class="chip">{{ LABEL[r.status as keyof typeof LABEL] }}</span>
        </header>
        <dl>
          <dt>prev</dt>
          <dd class="hex" :class="{ link: r.i > 0 }">{{ r.prev }}</dd>
          <dt>data</dt>
          <dd>
            <input v-model="blocks[r.i].data" spellcheck="false" :disabled="mining !== null" />
          </dd>
          <dt>nonce</dt>
          <dd class="nonce">
            <input
              type="number"
              min="0"
              :value="blocks[r.i].nonce"
              :disabled="mining !== null"
              @input="onNonce(r.i, $event)"
            />
            <button v-if="mining === r.i" @click="stop">stop</button>
            <button v-else :disabled="mining !== null || r.status === 'ok'" @click="mine(r.i)">mine</button>
            <span class="muted small" v-if="mining === r.i">{{ tries.toLocaleString() }} tries…</span>
            <span class="muted small" v-else-if="lastTries[r.i]">found in {{ lastTries[r.i].toLocaleString() }}</span>
          </dd>
          <dt>hash</dt>
          <dd class="hex">
            <span class="zeros">{{ r.hash.slice(0, r.zeros) }}</span
            >{{ r.hash.slice(r.zeros) }}
          </dd>
        </dl>
      </li>
    </ol>

    <div class="bar">
      <button :disabled="mining !== null || firstBad < 0" @click="mineAll">
        re-mine from block {{ firstBad < 0 ? '–' : firstBad }} to the tip
      </button>
      <button @click="reset">reset</button>
    </div>
  </div>
</template>

<style scoped>
.ch {
  font-size: 0.9rem;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.6rem;
}
.muted {
  color: var(--muted);
}
.small {
  font-size: 0.8rem;
}
button {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.25rem 0.6rem;
  cursor: pointer;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
.seg {
  display: inline-flex;
}
.seg button {
  border-radius: 0;
  margin-left: -1px;
  font-family: var(--mono);
}
.seg button:first-child {
  border-radius: 6px 0 0 6px;
}
.seg button:last-child {
  border-radius: 0 6px 6px 0;
}
.seg button.sel {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  position: relative;
}
.blocks {
  list-style: none;
  padding: 0;
  margin: 0.9rem 0;
}
.blk {
  position: relative;
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  background: var(--surface);
}
.blk + .blk {
  margin-top: 1.4rem;
}
/* The arrow between cards: this block's prev field points at the card above. */
.blk + .blk::before {
  content: '';
  position: absolute;
  left: 1.5rem;
  top: calc(-1.4rem - 1px);
  height: 1.4rem;
  border-left: 2px solid var(--border);
}
.blk.bad,
.blk.orphan {
  border-left-color: var(--danger);
}
.blk.orphan {
  opacity: 0.8;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.chip {
  font-size: 0.75rem;
  padding: 0 0.45rem;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  text-align: right;
}
.bad .chip,
.orphan .chip {
  background: color-mix(in srgb, var(--danger) 14%, transparent);
  color: var(--danger);
}
dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 0.3rem 0.75rem;
  margin: 0;
  align-items: center;
}
dt {
  color: var(--muted);
  font-size: 0.8rem;
}
dd {
  margin: 0;
  min-width: 0;
}
.hex {
  font-family: var(--mono);
  font-size: 0.74rem;
  word-break: break-all;
  line-height: 1.4;
}
.zeros {
  color: var(--accent);
  font-weight: 700;
}
.bad .zeros,
.orphan .zeros {
  color: var(--danger);
}
.nonce {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
input {
  font: inherit;
  font-family: var(--mono);
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.25rem 0.45rem;
  width: 100%;
  box-sizing: border-box;
}
.nonce input {
  width: 8rem;
}
</style>
