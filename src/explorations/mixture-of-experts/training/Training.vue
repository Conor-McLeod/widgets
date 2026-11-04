<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Tex from '~/math/Tex.vue';
import { useExpertColors } from '../palette';
import { MoE, rng, sample } from './sim';

const E = 8;
const BATCH = 128;
const STEPS_PER_FRAME = 3;
const MAX_STEPS = 3000;
const CAPS = [1, 1.25, 1.5, 2, Infinity];

const colors = useExpertColors();
const alpha = ref(0);
const capIdx = ref(1);
const capacity = computed(() => CAPS[capIdx.value]);
const running = ref(false);
const seed = ref(1);

const step = ref(0);
const mse = ref(0);
const load = ref<number[]>(Array(E).fill(1 / E));
const dropped = ref(0);
const history = ref<number[]>([]);

let model = new MoE(E, seed.value);
// A fixed set of tokens to draw, so the picture changes only because routing changes.
const displayRand = rng(12345);
const shown = Array.from({ length: 480 }, () => sample(displayRand));

const canvas = ref<HTMLCanvasElement>();
const SIZE = 300;
const GRID = 60;
let bgCanvas: HTMLCanvasElement | undefined;

function reset() {
  seed.value++;
  model = new MoE(E, seed.value);
  step.value = 0;
  mse.value = 0;
  load.value = Array(E).fill(1 / E);
  dropped.value = 0;
  history.value = [];
  draw();
}

function draw() {
  const c = canvas.value;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== SIZE * dpr) {
    c.width = SIZE * dpr;
    c.height = SIZE * dpr;
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);
  const L = 1.1;
  const toPx = (v: number) => ((v + L) / (2 * L)) * SIZE;

  // Background: which expert the router would pick at each point. Painted one pixel per cell
  // on a small canvas, then scaled up in one go so neighbouring cells don't leave seams.
  const bg = (bgCanvas ??= document.createElement('canvas'));
  bg.width = bg.height = GRID;
  const bctx = bg.getContext('2d')!;
  for (let gx = 0; gx < GRID; gx++) {
    for (let gy = 0; gy < GRID; gy++) {
      const x0 = ((gx + 0.5) / GRID) * 2 * L - L;
      const x1 = L - ((gy + 0.5) / GRID) * 2 * L;
      bctx.fillStyle = colors.value[model.choose(x0, x1)];
      bctx.fillRect(gx, gy, 1, 1);
    }
  }
  ctx.globalAlpha = 0.16;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bg, 0, 0, SIZE, SIZE);
  ctx.globalAlpha = 1;
  for (const [, x0, x1] of shown) {
    ctx.beginPath();
    ctx.arc(toPx(x0), SIZE - toPx(x1), 2.6, 0, 2 * Math.PI);
    ctx.fillStyle = colors.value[model.choose(x0, x1)];
    ctx.fill();
  }
}

let raf = 0;
function frame() {
  if (!running.value) return;
  const cfg = { alpha: alpha.value, capacity: capacity.value };
  for (let i = 0; i < STEPS_PER_FRAME; i++) {
    const s = model.step(BATCH, cfg);
    step.value++;
    // Smooth the noisy per-batch numbers so the readouts are legible.
    const a = step.value === 1 ? 1 : 0.05;
    mse.value += a * (s.mse - mse.value);
    dropped.value += a * (s.dropped - dropped.value);
    load.value = load.value.map((l, j) => l + a * (s.load[j] - l));
    if (step.value % 10 === 0) history.value.push(mse.value);
  }
  draw();
  if (step.value >= MAX_STEPS) {
    running.value = false;
    return;
  }
  raf = requestAnimationFrame(frame);
}

function toggle() {
  if (step.value >= MAX_STEPS) reset();
  running.value = !running.value;
  if (running.value) raf = requestAnimationFrame(frame);
}

watch(colors, draw);
onMounted(draw);
onBeforeUnmount(() => cancelAnimationFrame(raf));

const inUse = computed(() => load.value.filter((l) => l > 0.02).length);
const maxLoad = 0.5;
const capLine = computed(() => (Number.isFinite(capacity.value) ? capacity.value / E : null));

// Loss chart geometry
const CW = 300;
const CH = 90;
const LMAX = 1.2;
const lossPath = computed(() => {
  const h = history.value;
  if (h.length < 2) return '';
  const n = MAX_STEPS / 10;
  return h
    .map((v, i) => `${i ? 'L' : 'M'}${((i / n) * CW).toFixed(1)},${(CH - (Math.min(v, LMAX) / LMAX) * CH).toFixed(1)}`)
    .join('');
});
</script>

<template>
  <div class="tr">
    <div class="tr-ctl">
      <button class="tr-play" @click="toggle">
        {{ running ? 'pause' : step >= 3000 ? 'train again' : step ? 'resume' : 'train' }}
      </button>
      <button @click="reset">reset</button>
      <label>
        <span>balancing loss <Tex t="\alpha" /></span>
        <input type="range" min="0" max="0.1" step="0.01" v-model.number="alpha" />
        <output>{{ alpha.toFixed(2) }}</output>
      </label>
      <label>
        <span>capacity factor</span>
        <input type="range" min="0" :max="CAPS.length - 1" step="1" v-model.number="capIdx" />
        <output>{{ Number.isFinite(capacity) ? capacity.toFixed(2) : 'none' }}</output>
      </label>
    </div>

    <div class="tr-body">
      <div>
        <canvas
          ref="canvas"
          class="tr-map"
          role="img"
          aria-label="Training tokens coloured by the expert the router sends them to. The background shows the router's choice everywhere."
        ></canvas>
        <p class="tr-note">Dots are tokens from 8 clusters, coloured by the expert they're sent to.</p>
      </div>

      <div class="tr-side">
        <div class="tr-title">
          <span>share of tokens per expert</span>
          <span class="tr-key"><i class="even"></i>even <i v-if="capLine" class="cap"></i>{{ capLine ? 'capacity' : '' }}</span>
        </div>
        <div class="tr-bars">
          <div v-for="(l, i) in load" :key="i" class="tr-col" :title="`E${i + 1}: ${(l * 100).toFixed(1)}% of tokens`">
            <div class="tr-track">
              <b
                class="kept"
                :style="{ height: `${(Math.min(l, capLine ?? 1) / maxLoad) * 100}%`, background: colors[i] }"
              ></b>
              <b
                v-if="capLine && l > capLine"
                class="over"
                :style="{
                  bottom: `${(capLine / maxLoad) * 100}%`,
                  height: `${(Math.min(l - capLine, maxLoad - capLine) / maxLoad) * 100}%`,
                  '--c': colors[i],
                }"
              ></b>
              <span class="line even" :style="{ bottom: `${(1 / E / maxLoad) * 100}%` }"></span>
              <span v-if="capLine" class="line cap" :style="{ bottom: `${(capLine / maxLoad) * 100}%` }"></span>
            </div>
            <span class="tr-lab">E{{ i + 1 }}</span>
          </div>
        </div>

        <dl class="tr-stats">
          <dt>step</dt>
          <dd>{{ step }}</dd>
          <dt>experts in use</dt>
          <dd>{{ inUse }} / {{ E }}</dd>
          <dt>tokens dropped</dt>
          <dd>{{ (dropped * 100).toFixed(0) }}%</dd>
          <dt>error (MSE)</dt>
          <dd>{{ step ? mse.toFixed(3) : '—' }}</dd>
        </dl>

        <svg class="tr-loss" :viewBox="`0 0 ${CW} ${CH + 14}`" role="img" aria-label="Error over training">
          <line x1="0" :x2="CW" :y1="CH" :y2="CH" stroke="var(--border)" />
          <line x1="0" :x2="CW" :y1="CH - (0.2 / LMAX) * CH" :y2="CH - (0.2 / LMAX) * CH" stroke="var(--border)" stroke-dasharray="2 4" />
          <text x="2" :y="CH - (0.2 / LMAX) * CH - 3" class="tr-axis">0.2</text>
          <text x="2" y="10" class="tr-axis">error</text>
          <text :x="CW" :y="CH + 12" class="tr-axis" text-anchor="end">{{ MAX_STEPS }} steps</text>
          <path :d="lossPath" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" />
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tr {
  font-size: 0.9rem;
}
.tr-ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-bottom: 0.75rem;
}
.tr-ctl label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--muted);
}
.tr-ctl input {
  width: 6rem;
}
.tr-ctl output {
  font-family: var(--mono);
  color: var(--text);
  min-width: 4ch;
}
button {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.3rem 0.7rem;
  cursor: pointer;
}
.tr-play {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: transparent;
  min-width: 6.5rem;
}
.tr-body {
  display: grid;
  grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 600px) {
  .tr-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .tr-map {
    max-width: 320px;
    margin: 0 auto;
  }
}
.tr-map {
  width: 100%;
  aspect-ratio: 1;
  display: block;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.tr-note {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
  color: var(--muted);
}
.tr-title {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  font-size: 0.78rem;
  color: var(--muted);
  margin-bottom: 0.3rem;
}
.tr-key {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.tr-key i {
  display: inline-block;
  width: 14px;
  height: 0;
  border-top: 1.5px dashed var(--muted);
}
.tr-key i.cap {
  border-top: 2px solid var(--danger);
  margin-left: 0.4rem;
}
.tr-bars {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 4px;
}
.tr-col {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}
.tr-track {
  position: relative;
  height: 110px;
  background: var(--bg);
  border-radius: 4px;
}
.tr-track b {
  position: absolute;
  left: 2px;
  right: 2px;
  bottom: 0;
  border-radius: 4px 4px 0 0;
}
.tr-track b.over {
  border-radius: 4px 4px 0 0;
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--c) 45%, transparent) 0 3px,
    transparent 3px 6px
  );
  outline: 1px solid color-mix(in srgb, var(--c) 60%, transparent);
  outline-offset: -1px;
}
.tr-track .line {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
}
.line.even {
  border-top: 1.5px dashed var(--muted);
}
.line.cap {
  border-top: 2px solid var(--danger);
}
.tr-lab {
  text-align: center;
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--muted);
}
.tr-stats {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.1rem 1rem;
  margin: 0.75rem 0 0.5rem;
}
.tr-stats dt {
  color: var(--muted);
}
.tr-stats dd {
  margin: 0;
  font-family: var(--mono);
}
.tr-loss {
  width: 100%;
  max-width: 380px;
  height: auto;
  display: block;
}
.tr-axis {
  font-size: 10px;
  fill: var(--muted);
  font-family: var(--mono);
}
</style>
