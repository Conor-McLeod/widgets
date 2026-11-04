<script setup lang="ts">
import { computed, reactive } from 'vue';

// DeepSeek-V3's attention shape. GQA groups is what a comparable dense model might pick.
const PRESET = { layers: 61, heads: 128, dh: 128, groups: 8, dc: 512, dr: 64, ctxLog: 17, bytes: 2 };
const p = reactive({ ...PRESET });

const ctx = computed(() => 2 ** p.ctxLog);
const groups = computed(() => Math.min(p.groups, p.heads));

type Seg = { label: string; n: number; kind: 'k' | 'v' | 'c' | 'r' };
type Scheme = { name: string; note: string; segs: Seg[] };

const schemes = computed<Scheme[]>(() => [
  {
    name: 'MHA',
    note: `a key and a value for each of ${p.heads} heads`,
    segs: [
      { label: 'keys', n: p.heads * p.dh, kind: 'k' },
      { label: 'values', n: p.heads * p.dh, kind: 'v' },
    ],
  },
  {
    name: 'GQA',
    note: `${groups.value} key/value heads, each shared by ${(p.heads / groups.value).toFixed(p.heads % groups.value ? 1 : 0)} query heads`,
    segs: [
      { label: 'keys', n: groups.value * p.dh, kind: 'k' },
      { label: 'values', n: groups.value * p.dh, kind: 'v' },
    ],
  },
  {
    name: 'MQA',
    note: 'one key/value head shared by every query head',
    segs: [
      { label: 'keys', n: p.dh, kind: 'k' },
      { label: 'values', n: p.dh, kind: 'v' },
    ],
  },
  {
    name: 'MLA',
    note: `one ${p.dc}-wide latent plus a ${p.dr}-wide RoPE key, shared by all heads`,
    segs: [
      { label: 'latent', n: p.dc, kind: 'c' },
      { label: 'RoPE key', n: p.dr, kind: 'r' },
    ],
  },
]);

const total = (s: Scheme) => s.segs.reduce((a, g) => a + g.n, 0);
const maxElems = computed(() => Math.max(...schemes.value.map(total)));
const bytesFor = (elems: number) => elems * p.layers * ctx.value * p.bytes;

function fmtBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(b >= 1e11 ? 0 : 1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(b >= 1e8 ? 0 : 1)} MB`;
  return `${(b / 1e3).toFixed(0)} kB`;
}
const fmtCtx = (n: number) => (n >= 1 << 20 ? `${n / (1 << 20)}M` : `${n / 1024}K`);

const mla = computed(() => total(schemes.value[3]));
const ratioMha = computed(() => total(schemes.value[0]) / mla.value);
const equivGroups = computed(() => mla.value / (2 * p.dh));

const sliders = [
  { key: 'layers', label: 'Layers', min: 1, max: 128, step: 1 },
  { key: 'heads', label: 'Query heads', min: 1, max: 128, step: 1 },
  { key: 'dh', label: 'Head dim', min: 16, max: 256, step: 16 },
  { key: 'groups', label: 'GQA groups', min: 1, max: 128, step: 1 },
  { key: 'dc', label: 'MLA latent', min: 32, max: 2048, step: 32 },
  { key: 'dr', label: 'MLA RoPE dim', min: 0, max: 256, step: 16 },
] as const;
</script>

<template>
  <div class="kv">
    <div class="rows">
      <div v-for="s in schemes" :key="s.name" class="row" :class="{ hi: s.name === 'MLA' }">
        <div class="name">{{ s.name }}</div>
        <div class="bar-wrap">
          <div class="bar" :style="{ width: `${(total(s) / maxElems) * 100}%` }">
            <span
              v-for="g in s.segs"
              :key="g.label"
              :class="g.kind"
              :style="{ flexGrow: g.n }"
              :title="`${g.label}: ${g.n.toLocaleString()}`"
            />
          </div>
        </div>
        <div class="num">
          <b>{{ total(s).toLocaleString() }}</b>
          <span>{{ fmtBytes(bytesFor(total(s))) }}</span>
        </div>
        <div class="note">{{ s.note }}</div>
      </div>
    </div>

    <div class="legend">
      <span class="k">key</span><span class="v">value</span><span class="c">latent</span><span class="r">RoPE key</span>
      <em>numbers per token per layer · cache size at {{ fmtCtx(ctx) }} tokens</em>
    </div>

    <p class="summary">
      MLA caches <b>{{ ratioMha.toFixed(ratioMha < 10 ? 1 : 0) }}×</b> less than MHA. That's the same footprint as GQA with
      <b>{{ equivGroups.toFixed(2) }}</b> key/value heads, but every query head still gets its own key and value.
    </p>

    <div class="ctl">
      <label v-for="s in sliders" :key="s.key">
        <span>{{ s.label }}</span>
        <input v-model.number="p[s.key]" type="range" :min="s.min" :max="s.max" :step="s.step" />
        <output>{{ s.key === 'groups' ? groups : p[s.key] }}</output>
      </label>
      <label>
        <span>Context</span>
        <input v-model.number="p.ctxLog" type="range" min="10" max="20" step="1" />
        <output>{{ fmtCtx(ctx) }}</output>
      </label>
      <label>
        <span>Precision</span>
        <select v-model.number="p.bytes">
          <option :value="2">bf16</option>
          <option :value="1">fp8</option>
          <option :value="4">fp32</option>
        </select>
      </label>
    </div>
    <button class="reset" @click="Object.assign(p, PRESET)">Reset to DeepSeek-V3</button>
  </div>
</template>

<style scoped>
.kv {
  font-size: 0.9rem;
  --k: var(--muted);
  --v: color-mix(in srgb, var(--muted) 45%, var(--surface));
  --c: var(--accent);
  --r: color-mix(in srgb, var(--accent) 45%, var(--surface));
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.row {
  display: grid;
  grid-template-columns: 3rem 1fr 6.5rem;
  grid-template-areas: 'name bar num' '. note note';
  align-items: center;
  column-gap: 0.6rem;
}
.name {
  grid-area: name;
  font-family: var(--mono);
  font-weight: 600;
}
.row.hi .name {
  color: var(--accent);
}
.bar-wrap {
  grid-area: bar;
  height: 1.4rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.bar {
  display: flex;
  height: 100%;
  min-width: 3px;
  transition: width 0.2s;
}
.bar span {
  flex-basis: 0;
  min-width: 1px;
}
.k { background: var(--k); }
.v { background: var(--v); }
.c { background: var(--c); }
.r { background: var(--r); }
.num {
  grid-area: num;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-family: var(--mono);
  font-size: 0.8rem;
  line-height: 1.2;
}
.num span {
  color: var(--muted);
}
.note {
  grid-area: note;
  font-size: 0.78rem;
  color: var(--muted);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.9rem;
  margin-top: 0.8rem;
  font-size: 0.78rem;
  align-items: center;
}
.legend span {
  background: none;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.legend span::before {
  content: '';
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 2px;
}
.legend .k::before { background: var(--k); }
.legend .v::before { background: var(--v); }
.legend .c::before { background: var(--c); }
.legend .r::before { background: var(--r); }
.legend em {
  color: var(--muted);
  font-style: normal;
}
.summary {
  margin: 0.8rem 0;
}
.ctl {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.4rem 1.2rem;
}
.ctl label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
}
.ctl label > span {
  width: 6.5rem;
  flex-shrink: 0;
}
.ctl input {
  flex: 1;
  min-width: 0;
}
.ctl output {
  width: 3rem;
  text-align: right;
  font-family: var(--mono);
  color: var(--text);
  font-size: 0.82rem;
}
select,
button {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.2rem 0.5rem;
}
button {
  margin-top: 0.7rem;
  cursor: pointer;
}
</style>
