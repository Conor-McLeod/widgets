<script setup lang="ts">
import { computed, ref } from 'vue';
import { sha256Bytes, toHex } from '../lib/sha256';

const enc = new TextEncoder();

const a = ref('Alice pays Bob 10');
const b = ref('Alice pays Bob 11');

const ha = computed(() => sha256Bytes(enc.encode(a.value)));
const hb = computed(() => sha256Bytes(enc.encode(b.value)));
const bytesA = computed(() => enc.encode(a.value).length);

function bitsOf(h: Uint8Array): number[] {
  const out: number[] = [];
  for (const byte of h) for (let i = 7; i >= 0; i--) out.push((byte >> i) & 1);
  return out;
}

const cells = computed(() => {
  const x = bitsOf(ha.value);
  const y = bitsOf(hb.value);
  return x.map((v, i) => ({ on: v === 1, diff: v !== y[i] }));
});
const diffCount = computed(() => cells.value.filter((c) => c.diff).length);

// Hex digits that differ, so the two digests can be compared character by character.
function marked(self: string, other: string) {
  return [...self].map((ch, i) => ({ ch, diff: ch !== other[i] }));
}
const hexA = computed(() => toHex(ha.value));
const hexB = computed(() => toHex(hb.value));
const markA = computed(() => marked(hexA.value, hexB.value));
const markB = computed(() => marked(hexB.value, hexA.value));
</script>

<template>
  <div class="hw">
    <label class="field">
      <span class="lbl"
        >input A <em>{{ bytesA }} bytes</em></span
      >
      <textarea v-model="a" rows="2" spellcheck="false"></textarea>
    </label>
    <div class="digest" aria-label="SHA-256 of A">
      <span v-for="(c, i) in markA" :key="i" :class="{ d: c.diff }">{{ c.ch }}</span>
    </div>

    <label class="field">
      <span class="lbl">input B</span>
      <textarea v-model="b" rows="2" spellcheck="false"></textarea>
    </label>
    <div class="digest" aria-label="SHA-256 of B">
      <span v-for="(c, i) in markB" :key="i" :class="{ d: c.diff }">{{ c.ch }}</span>
    </div>

    <div class="grid" role="img" :aria-label="`${diffCount} of 256 bits differ`">
      <span v-for="(c, i) in cells" :key="i" :class="{ on: c.on, diff: c.diff }"></span>
    </div>
    <p class="readout">
      <strong>{{ diffCount }}</strong> of 256 bits differ
      <span class="muted">· a fair coin flip per bit would give about 128</span>
    </p>
    <p class="key">
      <span class="sw on"></span> 1 bit in A's hash <span class="sw diff"></span> bit that differs in B's hash
    </p>
  </div>
</template>

<style scoped>
.hw {
  font-size: 0.92rem;
}
.field {
  display: block;
}
.lbl {
  display: block;
  color: var(--muted);
  margin-bottom: 0.25rem;
}
.lbl em {
  font-style: normal;
  font-size: 0.8rem;
  margin-left: 0.4rem;
}
textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  font: inherit;
  font-family: var(--mono);
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  resize: vertical;
}
.digest {
  font-family: var(--mono);
  font-size: 0.8rem;
  overflow-wrap: anywhere;
  word-break: break-all;
  margin: 0.3rem 0 0.9rem;
  color: var(--muted);
  line-height: 1.5;
}
.digest .d {
  color: var(--text);
  font-weight: 600;
}
.grid {
  display: grid;
  grid-template-columns: repeat(32, minmax(0, 1fr));
  gap: 2px;
}
@media (max-width: 560px) {
  .grid {
    grid-template-columns: repeat(16, minmax(0, 1fr));
  }
}
.grid span {
  aspect-ratio: 1;
  border-radius: 2px;
  background: var(--border);
}
.grid span.on {
  background: var(--muted);
}
.grid span.diff {
  background: var(--accent);
}
.readout {
  margin: 0.6rem 0 0.2rem;
}
.muted {
  color: var(--muted);
}
.key {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.4rem;
}
.sw {
  display: inline-block;
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 2px;
}
.sw.on {
  background: var(--muted);
}
.sw.diff {
  background: var(--accent);
  margin-left: 0.6rem;
}
</style>
