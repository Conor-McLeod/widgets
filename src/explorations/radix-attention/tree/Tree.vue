<script setup lang="ts">
import { computed, markRaw, ref, shallowRef, watch } from 'vue';
import { RadixCache, tokenize, type ServeResult } from './radix';

interface Preset {
  label: string;
  prompt: string;
  output: string;
}

const SYS = '<sys> You are a helpful assistant . </sys>';
const T1 = `${SYS} User: what is a radix tree ? Assistant:`;
const T1_OUT = 'A compressed trie .';
const FEW = 'Translate to French : sea → mer ; cat → chat ; dog → chien ;';

const presets: Preset[] = [
  { label: 'Chat 1 · turn 1', prompt: T1, output: T1_OUT },
  { label: 'Chat 1 · turn 2', prompt: `${T1} ${T1_OUT} User: why compress it ? Assistant:`, output: 'Fewer nodes to walk .' },
  { label: 'Chat 2', prompt: `${SYS} User: write a haiku about caches Assistant:`, output: 'Old keys linger warm' },
  { label: 'Chat 2 · resample', prompt: `${SYS} User: write a haiku about caches Assistant:`, output: 'Hot rows stay near' },
  { label: 'Few-shot · cheese', prompt: `${FEW} cheese →`, output: 'fromage' },
  { label: 'Few-shot · bread', prompt: `${FEW} bread →`, output: 'pain' },
];

const capacity = ref(80);
const cache = shallowRef(markRaw(new RadixCache(capacity.value)));
const version = ref(0);
const last = ref<(ServeResult & { label: string }) | null>(null);
const totals = ref({ prompt: 0, hit: 0, requests: 0 });
const custom = ref('');

watch(capacity, (c) => {
  cache.value.capacity = c;
  // Shrinking the pool evicts straight away.
  if (cache.value.size > c) cache.value.evict(cache.value.size - c);
  version.value++;
});

function send(label: string, prompt: string, output: string) {
  const r = cache.value.serve(tokenize(prompt), tokenize(output));
  last.value = { ...r, label };
  totals.value.prompt += r.promptLen;
  totals.value.hit += r.hit;
  totals.value.requests++;
  version.value++;
}

function sendCustom() {
  const toks = tokenize(custom.value);
  if (!toks.length) return;
  send('custom', toks.slice(0, 40).join(' '), '');
}

function reset() {
  cache.value = markRaw(new RadixCache(capacity.value));
  last.value = null;
  totals.value = { prompt: 0, hit: 0, requests: 0 };
  version.value++;
}

const rows = computed(() => {
  void version.value;
  const onPath = new Set(last.value?.path ?? []);
  const clock = cache.value.clock;
  return cache.value.rows().map(({ node, depth, offset }) => {
    const active = onPath.has(node.id);
    return {
      id: node.id,
      depth,
      leaf: node.children.size === 0,
      age: clock - node.lastAccess,
      lastAccess: node.lastAccess,
      tokens: node.tokens.map((t, i) => {
        const at = offset + i;
        let kind = '';
        if (active && last.value) {
          kind = at < last.value.hit ? 'hit' : at < last.value.promptLen ? 'prefill' : 'decode';
        }
        return { t, kind };
      }),
    };
  });
});

const size = computed(() => {
  void version.value;
  return cache.value.size;
});
const hitRate = computed(() => (totals.value.prompt ? totals.value.hit / totals.value.prompt : 0));
</script>

<template>
  <div class="rx">
    <div class="presets" role="group" aria-label="Send a request">
      <button v-for="p in presets" :key="p.label" @click="send(p.label, p.prompt, p.output)">{{ p.label }}</button>
    </div>
    <form class="custom" @submit.prevent="sendCustom">
      <input v-model="custom" placeholder="or type a prompt, space-separated tokens" spellcheck="false" />
      <button type="submit">send</button>
    </form>

    <div class="controls">
      <label>
        <span>KV pool</span>
        <input type="range" min="30" max="140" step="5" v-model.number="capacity" />
        <code>{{ capacity }} tokens</code>
      </label>
      <button class="ghost" @click="reset">reset</button>
    </div>

    <div class="pool" :title="`${size} of ${capacity} slots used`">
      <div class="fill" :style="{ width: `${Math.min(100, (100 * size) / capacity)}%` }"></div>
      <span>{{ size }} / {{ capacity }} slots</span>
    </div>

    <p class="summary" aria-live="polite">
      <template v-if="last">
        <strong>{{ last.label }}</strong>: {{ last.promptLen }} prompt tokens,
        <span class="k hit">{{ last.hit }} reused</span>
        <span class="k prefill">{{ last.prefill }} prefilled</span>
        <span v-if="last.decode" class="k decode">{{ last.decode }} decoded</span>
        <span v-if="last.evicted" class="ev">· evicted {{ last.evicted }}</span>
      </template>
      <template v-else>The cache is empty. Send a request.</template>
    </p>

    <div class="tree" role="tree" aria-label="Radix tree of cached tokens">
      <div class="root">root</div>
      <div
        v-for="r in rows"
        :key="r.id"
        role="treeitem"
        class="row"
        :style="{ '--d': r.depth, opacity: Math.max(0.45, 1 - r.age * 0.09) }"
      >
        <span class="toks">
          <span v-for="(tk, i) in r.tokens" :key="i" class="tok" :class="tk.kind">{{ tk.t }}</span>
        </span>
        <span class="meta" :title="`Last used by request ${r.lastAccess}${r.leaf ? ' · leaf (evictable)' : ''}`">
          {{ r.leaf ? '◇ ' : '' }}req {{ r.lastAccess }}
        </span>
      </div>
      <p v-if="!rows.length" class="empty">(nothing cached)</p>
    </div>

    <div class="foot">
      <span class="legend">
        <span class="tok hit">reused</span>
        <span class="tok prefill">prefilled</span>
        <span class="tok decode">decoded</span>
        <span class="muted">◇ leaf, evictable</span>
      </span>
      <span class="muted">
        {{ totals.requests }} requests · prompt hit rate <code>{{ (hitRate * 100).toFixed(0) }}%</code>
      </span>
    </div>
  </div>
</template>

<style scoped>
.rx {
  font-size: 0.9rem;
}
button,
input {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}
button {
  padding: 0.25rem 0.6rem;
  cursor: pointer;
}
button:hover {
  border-color: var(--accent);
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.custom {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.5rem;
}
.custom input {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.5rem;
  font-family: var(--mono);
  font-size: 0.82rem;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.controls label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
}
.controls input[type='range'] {
  width: 9rem;
  padding: 0;
  border: 0;
  accent-color: var(--accent);
  background: transparent;
}
.controls code {
  color: var(--text);
}
.ghost {
  color: var(--muted);
}
.pool {
  position: relative;
  height: 1.3rem;
  margin-top: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg);
}
.pool .fill {
  height: 100%;
  background: var(--accent-soft);
  transition: width 0.25s;
}
.pool span {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--muted);
}
.summary {
  margin: 0.6rem 0;
  min-height: 1.6em;
}
.k {
  margin-left: 0.3rem;
}
.k.hit {
  color: var(--accent);
}
.k.prefill {
  color: var(--danger);
}
.k.decode {
  color: var(--muted);
}
.ev {
  color: var(--muted);
}
.tree {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  background: var(--bg);
}
.root {
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--muted);
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-left: calc(var(--d) * 14px + 6px);
  padding: 0.2rem 0 0.2rem 0.5rem;
  border-left: 1px solid var(--border);
  transition: opacity 0.2s;
}
.toks {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  min-width: 0;
}
.tok {
  font-family: var(--mono);
  font-size: 0.74rem;
  padding: 0 0.3rem;
  border-radius: 3px;
  border: 1px solid var(--border);
  background: var(--surface);
  overflow-wrap: anywhere;
}
.tok.hit {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.tok.prefill {
  background: color-mix(in srgb, var(--danger) 14%, transparent);
  border-color: var(--danger);
  color: var(--danger);
}
.tok.decode {
  border-style: dashed;
  border-color: var(--muted);
}
.meta {
  flex: none;
  font-family: var(--mono);
  font-size: 0.7rem;
  color: var(--muted);
  white-space: nowrap;
}
.empty {
  margin: 0.3rem 0 0;
  color: var(--muted);
  font-size: 0.8rem;
}
.foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.4rem 1rem;
  margin-top: 0.5rem;
  font-size: 0.78rem;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}
.muted {
  color: var(--muted);
}
</style>
