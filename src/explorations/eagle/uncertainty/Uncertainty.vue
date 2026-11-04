<script setup lang="ts">
import { computed, ref } from 'vue';
import Tex from '~/math/Tex.vue';

// A 2-D toy of the target model's last hidden state ("feature") and its LM head. Each word in the
// vocabulary is a direction; the LM head scores a feature by its dot product with each direction.
const VOCAB = [
  { word: 'happy', angle: 18 },
  { word: 'going', angle: 72 },
  { word: 'do', angle: 198 },
  { word: 'try', angle: 252 },
];
const BETA = 1.7;
const R = 2.3;
const rad = (deg: number) => (deg * Math.PI) / 180;
const dir = (deg: number): [number, number] => [Math.cos(rad(deg)), Math.sin(rad(deg))];
const scale = (v: [number, number], s: number): [number, number] => [v[0] * s, v[1] * s];

// The two features the target might produce next, depending on which token it sampled after "I".
const F_AM = scale(dir(35), R);
const F_ALWAYS = scale(dir(215), R);

function lmHead(f: [number, number]): number[] {
  const logits = VOCAB.map((v) => {
    const d = dir(v.angle);
    return BETA * (d[0] * f[0] + d[1] * f[1]);
  });
  const m = Math.max(...logits);
  const e = logits.map((l) => Math.exp(l - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

const pAm = ref(0.6);
const sampled = ref<'am' | 'always'>('am');

const truthF = computed(() => (sampled.value === 'am' ? F_AM : F_ALWAYS));
// Without the sampled token, one prediction has to serve both branches. Under squared error the
// best single guess is the average of the two, weighted by how often each happens.
const blindF = computed<[number, number]>(() => [
  pAm.value * F_AM[0] + (1 - pAm.value) * F_ALWAYS[0],
  pAm.value * F_AM[1] + (1 - pAm.value) * F_ALWAYS[1],
]);
// With the token, the drafter only has to learn the target's (deterministic) next step. Not
// perfectly, so it lands near the truth rather than on it.
const eagleF = computed<[number, number]>(() => [truthF.value[0] + 0.18, truthF.value[1] - 0.12]);

const rows = computed(() => [
  { key: 'truth', label: 'target', dist: lmHead(truthF.value) },
  { key: 'blind', label: 'features only', dist: lmHead(blindF.value) },
  { key: 'eagle', label: 'features + token', dist: lmHead(eagleF.value) },
]);
const argmax = (d: number[]) => d.indexOf(Math.max(...d));
const verdict = computed(() =>
  rows.value.slice(1).map((r) => {
    const t = rows.value[0].dist;
    const i = argmax(r.dist);
    return { ...r, top: VOCAB[i].word, conf: r.dist[i], right: i === argmax(t) };
  }),
);

// SVG plane: feature space from -3 to 3.
const S = 260;
const U = S / 6.4;
const px = (v: [number, number]) => [S / 2 + v[0] * U, S / 2 - v[1] * U];
</script>

<template>
  <div class="fu">
    <div class="ctl">
      <span class="ctx">After “<b>I</b>” the target samples</span>
      <div class="seg">
        <button :class="{ on: sampled === 'am' }" @click="sampled = 'am'">am</button>
        <button :class="{ on: sampled === 'always' }" @click="sampled = 'always'">always</button>
      </div>
      <label class="p">
        <span>how often “am”</span>
        <input type="range" min="0.05" max="0.95" step="0.05" v-model.number="pAm" />
        <code>{{ (100 * pAm).toFixed(0) }}%</code>
      </label>
    </div>

    <div class="body">
      <svg :viewBox="`0 0 ${S} ${S}`" class="plane">
        <g v-for="v in VOCAB" :key="v.word">
          <line
            :x1="S / 2"
            :y1="S / 2"
            :x2="px(scale(dir(v.angle), 2.5))[0]"
            :y2="px(scale(dir(v.angle), 2.5))[1]"
            class="ray"
          />
          <text
            :x="px(scale(dir(v.angle), 2.58))[0]"
            :y="px(scale(dir(v.angle), 2.58))[1] + 4"
            :text-anchor="Math.cos(rad(v.angle)) > 0.2 ? 'start' : Math.cos(rad(v.angle)) < -0.2 ? 'end' : 'middle'"
            class="word"
          >
            {{ v.word }}
          </text>
        </g>
        <g :class="{ dim: sampled !== 'am' }">
          <circle :cx="px(F_AM)[0]" :cy="px(F_AM)[1]" r="7" class="cand" />
          <text :x="px(F_AM)[0] - 11" :y="px(F_AM)[1] + 4" text-anchor="end" class="lab">“I am”</text>
        </g>
        <g :class="{ dim: sampled !== 'always' }">
          <circle :cx="px(F_ALWAYS)[0]" :cy="px(F_ALWAYS)[1]" r="7" class="cand" />
          <text :x="px(F_ALWAYS)[0] + 11" :y="px(F_ALWAYS)[1] + 4" class="lab">“I always”</text>
        </g>
        <line :x1="px(F_AM)[0]" :y1="px(F_AM)[1]" :x2="px(F_ALWAYS)[0]" :y2="px(F_ALWAYS)[1]" class="span" />
        <rect :x="px(blindF)[0] - 5" :y="px(blindF)[1] - 5" width="10" height="10" class="blind" />
        <circle :cx="px(eagleF)[0]" :cy="px(eagleF)[1]" r="4.5" class="eagle" />
      </svg>

      <div class="side">
        <div class="legend">
          <span><i class="sw cand"></i>target’s next feature (one per sampled token)</span>
          <span><i class="sw blind"></i>draft from features only</span>
          <span><i class="sw eagle"></i>draft from features + sampled token</span>
        </div>
        <table class="bars">
          <thead>
            <tr>
              <th></th>
              <th v-for="v in VOCAB" :key="v.word">{{ v.word }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.key" :class="r.key">
              <th>{{ r.label }}</th>
              <td v-for="(p, i) in r.dist" :key="i">
                <div class="bar"><div :style="{ height: `${100 * p}%` }"></div></div>
                <span>{{ (100 * p).toFixed(0) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-for="v in verdict" :key="v.key" class="verdict">
          <span class="who">{{ v.label }}:</span> guesses “{{ v.top }}” at {{ (100 * v.conf).toFixed(0) }}%
          <b :class="v.right ? 'ok' : 'bad'">{{ v.right ? 'matches' : 'misses' }}</b>
        </p>
        <p class="hint">
          Each row is the LM head applied to a feature: <Tex t="\mathrm{softmax}(W f)" />.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fu {
  font-size: 0.9rem;
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.7rem;
}
.ctx {
  color: var(--muted);
}
.ctx b {
  color: var(--text);
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.seg button {
  font: inherit;
  font-size: 0.85rem;
  padding: 0.2rem 0.7rem;
  border: 0;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.seg button + button {
  border-left: 1px solid var(--border);
}
.seg button.on {
  background: var(--accent-soft);
  color: var(--accent);
}
.p {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--muted);
  font-size: 0.82rem;
}
.p input {
  width: 6.5rem;
  accent-color: var(--accent);
}
.p code {
  color: var(--text);
}
.body {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem 1.2rem;
  margin-top: 0.6rem;
}
.plane {
  flex: 0 1 260px;
  min-width: 0;
  width: 260px;
  max-width: 100%;
  height: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
}
.ray {
  stroke: var(--border);
  stroke-width: 1.2;
}
.word {
  font-family: var(--mono);
  font-size: 11px;
  fill: var(--muted);
}
.lab {
  font-size: 11px;
  fill: var(--text);
}
.cand {
  fill: none;
  stroke: var(--text);
  stroke-width: 1.5;
}
.dim {
  opacity: 0.3;
}
.span {
  stroke: var(--muted);
  stroke-dasharray: 3 3;
  stroke-width: 1;
}
.blind {
  fill: var(--danger);
  transition: x 0.25s, y 0.25s;
}
.eagle {
  fill: var(--accent);
}
.side {
  flex: 1 1 260px;
  min-width: 0;
}
.legend {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: 0.78rem;
  color: var(--muted);
}
.sw {
  display: inline-block;
  width: 0.65rem;
  height: 0.65rem;
  margin-right: 0.35rem;
  vertical-align: -1px;
}
.sw.cand {
  border: 1.5px solid var(--text);
  border-radius: 50%;
}
.sw.blind {
  background: var(--danger);
}
.sw.eagle {
  background: var(--accent);
  border-radius: 50%;
}
.bars {
  width: 100%;
  margin-top: 0.5rem;
  border-collapse: collapse;
  font-size: 0.75rem;
}
.bars th {
  font-weight: normal;
  color: var(--muted);
  text-align: left;
  white-space: nowrap;
  padding-right: 0.4rem;
}
.bars thead th {
  text-align: center;
  font-family: var(--mono);
}
.bars td {
  text-align: center;
  padding: 0.15rem 0.1rem;
  font-family: var(--mono);
  color: var(--muted);
}
.bar {
  height: 26px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.bar div {
  width: 70%;
  max-width: 1.6rem;
  border-radius: 2px 2px 0 0;
  transition: height 0.25s;
}
tr.truth .bar div {
  background: var(--text);
  opacity: 0.55;
}
tr.blind .bar div {
  background: var(--danger);
  opacity: 0.7;
}
tr.eagle .bar div {
  background: var(--accent);
}
.verdict {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
}
.who {
  color: var(--muted);
}
.ok {
  color: var(--accent);
}
.bad {
  color: var(--danger);
}
.hint {
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
  color: var(--muted);
}
</style>
