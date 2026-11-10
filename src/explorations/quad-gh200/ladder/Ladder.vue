<script setup lang="ts">
// Every way bytes move in the node, on one log scale. A payload slider turns bandwidth into time,
// and the right-hand column says how much arithmetic a Hopper must do per byte from that source
// to stay compute-bound.
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';
import { BW, FLOPS, fmtBW, fmtGB, fmtTime } from '../specs';

interface Row {
  name: string;
  who: string;
  bw: number;
}
const rows: Row[] = [
  { name: 'HBM3', who: 'a Hopper reading its own 96 GB', bw: BW.hbm },
  { name: 'LPDDR5X', who: 'a Grace reading its own 128 GB', bw: BW.lpddr },
  { name: 'NVLink-C2C', who: 'Grace ↔ Hopper, one direction', bw: BW.c2c },
  { name: 'NVLink, all 18 ports', who: 'one Hopper to all three peers at once', bw: BW.nvAll },
  { name: 'NVLink to one peer', who: '6 ports, one direction', bw: BW.nvPeer },
  { name: 'All four NICs', who: 'whole node to the network', bw: 4 * BW.nic },
  { name: 'PCIe Gen5 x16', who: 'what a plain H100 gets from its host', bw: BW.pcie },
  { name: 'One Slingshot port', who: '200 Gb/s, one direction', bw: BW.nic },
];

const LO = Math.log10(10);
const HI = Math.log10(10000);
const pct = (bw: number) => ((Math.log10(bw) - LO) / (HI - LO)) * 100;

// Payload: log slider from 100 MB to 1 TB.
const slider = ref(60);
const gb = computed(() => 10 ** (-1 + (slider.value / 100) * 4));
const presets = [
  { label: '96 GB: one HBM', gb: 96 },
  { label: '140 GB: a 70B model in BF16', gb: 140 },
  { label: '896 GB: the whole node', gb: 896 },
];
function setGB(v: number) {
  slider.value = ((Math.log10(v) + 1) / 4) * 100;
}

const intensity = (bw: number) => FLOPS.bf16 / (bw * 1e9);
const fmtI = (v: number) => (v >= 1000 ? `${(v / 1000).toPrecision(2)}k` : String(Math.round(v)));
</script>

<template>
  <div class="ladder">
    <div class="ctl">
      <label>
        <span>payload</span>
        <input v-model.number="slider" type="range" min="0" max="100" step="0.5" />
        <output>{{ fmtGB(gb) }}</output>
      </label>
      <div class="presets">
        <button v-for="p in presets" :key="p.label" type="button" @click="setGB(p.gb)">{{ p.label }}</button>
      </div>
    </div>

    <div class="head">
      <span>link</span>
      <span>per direction, log scale</span>
      <span class="r">time</span>
      <span class="r">FLOP/byte</span>
    </div>
    <div v-for="r in rows" :key="r.name" class="row">
      <span class="name">
        {{ r.name }}
        <small>{{ r.who }}</small>
      </span>
      <span class="bar">
        <i :style="{ width: `${pct(r.bw)}%` }" />
        <em :style="{ left: `${pct(r.bw)}%` }">{{ fmtBW(r.bw) }}</em>
      </span>
      <span class="r mono">{{ fmtTime(gb / r.bw) }}</span>
      <span class="r mono">{{ fmtI(intensity(r.bw)) }}</span>
    </div>
    <p class="foot">
      FLOP/byte is the arithmetic intensity a kernel needs for one Hopper's dense BF16 Tensor Cores
      (<Tex t="989\ \text{TFLOP/s}" />) to be the limit rather than that link. A big GEMM manages a few hundred.
    </p>
  </div>
</template>

<style scoped>
.ladder {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  color: var(--muted);
}
label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.6rem;
}
output {
  font-family: var(--mono);
  color: var(--text);
  min-width: 5ch;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
button {
  font: inherit;
  font-size: 0.8rem;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.2rem 0.55rem;
  cursor: pointer;
}
.head,
.row {
  display: grid;
  grid-template-columns: minmax(7rem, 1.2fr) minmax(0, 2fr) 4.5rem 4.5rem;
  gap: 0.6rem;
  align-items: center;
}
.head {
  margin-top: 1rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.75rem;
  color: var(--muted);
}
.row {
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--border);
}
.name {
  line-height: 1.25;
}
.name small {
  display: block;
  color: var(--muted);
  font-size: 0.75rem;
}
.bar {
  position: relative;
  height: 1.3rem;
  background: color-mix(in srgb, var(--muted) 8%, transparent);
  border-radius: 3px;
  overflow: visible;
}
.bar i {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.2s;
}
.bar em {
  position: absolute;
  top: 50%;
  transform: translate(0.4rem, -50%);
  font-style: normal;
  font-family: var(--mono);
  font-size: 0.75rem;
  white-space: nowrap;
  color: var(--text);
}
.r {
  text-align: right;
}
.mono {
  font-family: var(--mono);
  font-size: 0.85rem;
}
.foot {
  margin: 0.75rem 0 0;
  font-size: 0.82rem;
  color: var(--muted);
}
@media (max-width: 520px) {
  .head,
  .row {
    grid-template-columns: minmax(6rem, 1fr) minmax(0, 1.4fr) 4rem 3.5rem;
    gap: 0.4rem;
  }
  .bar em {
    display: none;
  }
}
</style>
