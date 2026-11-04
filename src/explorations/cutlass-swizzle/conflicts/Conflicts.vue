<script setup lang="ts">
// An 8×64 tile of 16-bit values in shared memory, cut into 16-byte chunks (8 per 128-byte row).
// Eight threads each touch one chunk: a column of the tile (what ldmatrix reads) or a row (what
// a vectorised global→shared copy writes). Shows where each chunk physically lives, which of the
// eight 16-byte bank groups it hits, and how many wavefronts the request needs.
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';

const N = 8; // rows, and 16 B chunks per row
type LayoutId = 'plain' | 'pad' | 'sw1' | 'sw2' | 'sw3';
type Access = 'col' | 'row';

const layouts: { id: LayoutId; label: string; tex?: string }[] = [
  { id: 'plain', label: 'Row-major' },
  { id: 'pad', label: 'Padded +16 B' },
  { id: 'sw1', label: '32 B swizzle', tex: '\\text{Swizzle}\\langle 1,3,3\\rangle' },
  { id: 'sw2', label: '64 B swizzle', tex: '\\text{Swizzle}\\langle 2,3,3\\rangle' },
  { id: 'sw3', label: '128 B swizzle', tex: '\\text{Swizzle}\\langle 3,3,3\\rangle' },
];

const layout = ref<LayoutId>('plain');
const access = ref<Access>('col');
const sel = ref(0);

/** Physical chunk index (16 B units from the start of the buffer) of logical chunk (r, c). */
function place(id: LayoutId, r: number, c: number): number {
  if (id === 'plain') return r * N + c;
  if (id === 'pad') return r * (N + 1) + c;
  const bits = Number(id.slice(2));
  return r * N + (c ^ (r & ((1 << bits) - 1)));
}

const lines = computed(() => (layout.value === 'pad' ? Math.ceil((N * (N + 1)) / N) : N));

// Which chunks the eight threads touch, in thread order.
const touched = computed(() =>
  Array.from({ length: N }, (_, t) => (access.value === 'col' ? [t, sel.value] : [sel.value, t]) as [number, number]),
);

// What sits in each physical slot: [r, c] of the logical chunk, or null for padding.
const memory = computed(() => {
  const slots: ([number, number] | null)[] = Array(lines.value * N).fill(null);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) slots[place(layout.value, r, c)] = [r, c];
  return slots;
});

const hitSlots = computed(() => new Set(touched.value.map(([r, c]) => place(layout.value, r, c))));
const hits = computed(() => {
  const h = Array(N).fill(0);
  for (const s of hitSlots.value) h[s % N]++;
  return h;
});
const wavefronts = computed(() => Math.max(...hits.value));
const bytes = computed(() => lines.value * N * 16);
const current = computed(() => layouts.find((l) => l.id === layout.value)!);

function isTouched(r: number, c: number) {
  return access.value === 'col' ? c === sel.value : r === sel.value;
}
function pick(r: number, c: number) {
  sel.value = access.value === 'col' ? c : r;
}
</script>

<template>
  <div class="bk">
    <div class="ctl">
      <div class="seg" role="group" aria-label="Shared memory layout">
        <button v-for="l in layouts" :key="l.id" :aria-pressed="layout === l.id" @click="layout = l.id">
          {{ l.label }}
        </button>
      </div>
      <div class="seg" role="group" aria-label="Access pattern">
        <button :aria-pressed="access === 'col'" @click="access = 'col'">Read a column (ldmatrix)</button>
        <button :aria-pressed="access === 'row'" @click="access = 'row'">Write a row (copy in)</button>
      </div>
    </div>

    <div class="panes">
      <div class="pane">
        <div class="cap">Logical tile <span class="muted">(click to pick a {{ access === 'col' ? 'column' : 'row' }})</span></div>
        <div class="grid" :style="{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }">
          <template v-for="r in N" :key="r">
            <button
              v-for="c in N"
              :key="c"
              class="chunk"
              :class="{ on: isTouched(r - 1, c - 1) }"
              :aria-label="`chunk row ${r - 1}, column ${c - 1}`"
              @click="pick(r - 1, c - 1)"
            >
              {{ r - 1 }},{{ c - 1 }}
            </button>
          </template>
        </div>
        <div class="axis muted">16 B chunks of a 128 B row →</div>
      </div>

      <div class="pane">
        <div class="cap">Shared memory <span class="muted">(columns = bank groups)</span></div>
        <div class="grid" :style="{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }">
          <span
            v-for="(s, i) in memory"
            :key="i"
            class="chunk"
            :class="{
              pad: s === null,
              on: hitSlots.has(i),
              clash: hitSlots.has(i) && hits[i % N] > 1,
            }"
          >
            {{ s ? `${s[0]},${s[1]}` : '' }}
          </span>
        </div>
        <div class="hist" :style="{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }">
          <div v-for="(h, g) in hits" :key="g" class="col">
            <div class="bars">
              <i v-for="k in h" :key="k" :class="{ clash: h > 1 }" />
            </div>
            <span class="muted">{{ 4 * g }}–{{ 4 * g + 3 }}</span>
          </div>
        </div>
        <div class="axis muted">banks</div>
      </div>
    </div>

    <dl class="stats">
      <div>
        <dt>wavefronts for 8 × 16 B</dt>
        <dd :class="{ bad: wavefronts > 1 }">
          {{ wavefronts }}
          <span class="muted">{{ wavefronts > 1 ? `(${wavefronts}-way conflict)` : '(conflict-free)' }}</span>
        </dd>
      </div>
      <div>
        <dt>shared memory used</dt>
        <dd>
          {{ bytes }} B <span v-if="bytes > 1024" class="muted">(+{{ ((bytes / 1024 - 1) * 100).toFixed(1) }}%)</span>
        </dd>
      </div>
      <div>
        <dt>chunk <Tex t="(r, c)" /> stored at column</dt>
        <dd>
          <Tex v-if="current.tex" :t="`c \\oplus (r \\mathbin{\\&} ${(1 << Number(layout.slice(2))) - 1})`" />
          <Tex v-else-if="layout === 'pad'" t="(9r + c) \bmod 8" />
          <Tex v-else t="c" />
        </dd>
      </div>
    </dl>
    <p v-if="current.tex" class="note muted">In CuTe: <Tex :t="current.tex" /> on 16-bit element offsets.</p>
  </div>
</template>

<style scoped>
.bk {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
button {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.25rem 0.65rem;
  cursor: pointer;
}
button[aria-pressed='true'] {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.panes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem 1.5rem;
  margin: 1rem 0;
}
.cap {
  font-size: 0.8rem;
  margin-bottom: 0.35rem;
}
.muted {
  color: var(--muted);
}
.grid {
  display: grid;
  gap: 2px;
}
.chunk {
  font-family: var(--mono);
  font-size: 0.62rem;
  padding: 0;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--muted) 10%, transparent);
  color: var(--muted);
  min-width: 0;
  overflow: hidden;
  transition: background 0.15s;
}
button.chunk:hover {
  border-color: var(--accent);
}
.chunk.on {
  background: var(--accent);
  color: var(--bg);
}
.chunk.clash {
  background: var(--danger);
}
.chunk.pad {
  background: repeating-linear-gradient(
    45deg,
    transparent 0 3px,
    color-mix(in srgb, var(--muted) 25%, transparent) 3px 5px
  );
}
.axis {
  font-size: 0.72rem;
  margin-top: 0.25rem;
}
.hist {
  display: grid;
  gap: 2px;
  margin-top: 0.5rem;
}
.col {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: var(--mono);
  font-size: 0.55rem;
}
.bars {
  height: 4.6rem;
  width: 100%;
  display: flex;
  flex-direction: column-reverse;
  gap: 2px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 2px;
}
.bars i {
  height: 0.45rem;
  border-radius: 2px;
  background: var(--accent);
}
.bars i.clash {
  background: var(--danger);
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.5rem;
  margin: 0;
}
.stats div {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
}
dt {
  font-size: 0.75rem;
  color: var(--muted);
}
dd {
  margin: 0;
  font-family: var(--mono);
  font-size: 1rem;
}
dd.bad {
  color: var(--danger);
}
.note {
  font-size: 0.78rem;
  margin: 0.5rem 0 0;
}
</style>
