<script setup lang="ts">
// A TCP connection's whole life as a sequence diagram: three-way handshake, one request/response,
// and the four-segment close. Step through it and watch sequence numbers, ACK numbers and states.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Tex from '~/math/Tex.vue';

type Side = 'c' | 's';
interface Seg {
  from: Side;
  flags: string;
  /** Sequence and ack numbers relative to each side's ISN (ISN itself is 0). */
  seq: number;
  ack?: number;
  len: number;
  /** States after this segment: sender's state on sending, receiver's on arrival. */
  cState: string;
  sState: string;
  note: string;
}

const REQ = 120; // bytes in the client's request
const RES = 900; // bytes in the server's response

// seq is relative to the sender's ISN, ack to the receiver's.
const SEGS: Seg[] = [
  {
    from: 'c', flags: 'SYN', seq: 0, len: 0, cState: 'SYN-SENT', sState: 'SYN-RCVD',
    note: 'The client picks a random initial sequence number (ISN) and sends a SYN carrying it. SYN carries no data but counts as one byte of sequence space, so the next byte the client sends will be ISN + 1.',
  },
  {
    from: 's', flags: 'SYN, ACK', seq: 0, ack: 1, len: 0, cState: 'ESTABLISHED', sState: 'SYN-RCVD',
    note: 'The server answers with its own SYN and ISN, and acknowledges the client’s SYN. An ACK number means “I have everything before this byte; send this one next”, so it is the client’s ISN + 1. Receiving this, the client knows both directions work.',
  },
  {
    from: 'c', flags: 'ACK', seq: 1, ack: 1, len: 0, cState: 'ESTABLISHED', sState: 'ESTABLISHED',
    note: 'The client acknowledges the server’s SYN. Only now does the server know the client received its ISN. Each side has proposed a starting number and seen the other confirm it: that takes three segments, not two.',
  },
  {
    from: 'c', flags: 'PSH, ACK', seq: 1, ack: 1, len: REQ, cState: 'ESTABLISHED', sState: 'ESTABLISHED',
    note: `The client sends ${REQ} bytes of request. The segment’s seq is the number of its first byte; the bytes run from seq to seq + ${REQ - 1}. It still carries ack: every segment after the SYN does.`,
  },
  {
    from: 's', flags: 'PSH, ACK', seq: 1, ack: 1 + REQ, len: RES, cState: 'ESTABLISHED', sState: 'ESTABLISHED',
    note: `The server acknowledges the request (ack = 1 + ${REQ} in relative terms) and sends ${RES} bytes of response in the same segment. Folding an ACK into data going the other way is called piggybacking.`,
  },
  {
    from: 'c', flags: 'ACK', seq: 1 + REQ, ack: 1 + RES, len: 0, cState: 'ESTABLISHED', sState: 'ESTABLISHED',
    note: 'The client acknowledges the response. A bare ACK carries no data, so it doesn’t use up any sequence numbers and is never itself acknowledged.',
  },
  {
    from: 'c', flags: 'FIN, ACK', seq: 1 + REQ, ack: 1 + RES, len: 0, cState: 'FIN-WAIT-1', sState: 'CLOSE-WAIT',
    note: 'The client is done sending and sends FIN. Like SYN it uses one sequence number, so it can be acknowledged and retransmitted like data. The client can still receive: closing is per direction.',
  },
  {
    from: 's', flags: 'ACK', seq: 1 + RES, ack: 2 + REQ, len: 0, cState: 'FIN-WAIT-2', sState: 'CLOSE-WAIT',
    note: 'The server acknowledges the FIN. The connection is now half-closed: the client’s direction is finished, but the server may keep sending until its application closes too.',
  },
  {
    from: 's', flags: 'FIN, ACK', seq: 1 + RES, ack: 2 + REQ, len: 0, cState: 'TIME-WAIT', sState: 'LAST-ACK',
    note: 'The server’s application closes, so the server sends its own FIN.',
  },
  {
    from: 'c', flags: 'ACK', seq: 2 + REQ, ack: 2 + RES, len: 0, cState: 'TIME-WAIT', sState: 'CLOSED',
    note: 'The client acknowledges the server’s FIN and the server forgets the connection. The client waits in TIME-WAIT for twice the maximum segment lifetime (often 60 s in total) in case this ACK is lost and the FIN is resent, and so stray old segments die out before the same port pair is reused.',
  },
];

const randIsn = () => Math.floor(Math.random() * 2 ** 32);
const isnC = ref(randIsn());
const isnS = ref(randIsn());
const relative = ref(false);
const step = ref(0); // number of segments shown

const fmt = (n: number, side: Side) =>
  relative.value ? String(n) : String((n + (side === 'c' ? isnC.value : isnS.value)) % 2 ** 32);

function label(s: Seg) {
  const other: Side = s.from === 'c' ? 's' : 'c';
  let t = `seq=${fmt(s.seq, s.from)}`;
  if (s.ack !== undefined) t += ` ack=${fmt(s.ack, other)}`;
  return t;
}

// Geometry in CSS pixels: the SVG is drawn at the column's width so text stays readable on phones.
const width = ref(460);
const root = ref<HTMLElement | null>(null);
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(() => (width.value = root.value?.clientWidth ?? 460));
  if (root.value) ro.observe(root.value);
});
onBeforeUnmount(() => ro?.disconnect());

const W = computed(() => Math.max(300, Math.min(560, width.value)));
const narrow = computed(() => W.value < 440);
const CX = computed(() => (narrow.value ? 70 : 100));
const SX = computed(() => W.value - CX.value);
const TOP = 58;
const ROW = 40;
const DROP = 22;
const PHASE_GAP = 16; // extra room above the first segment of each phase, for its label
const H = TOP + SEGS.length * ROW + 2 * PHASE_GAP + 44;
const PHASE_STARTS = [0, 3, 6];

/** Top of segment i's arrow, leaving a gap before each new phase. */
const rowY = (i: number) => TOP + i * ROW + PHASE_STARTS.filter((p) => p > 0 && p <= i).length * PHASE_GAP;

const arrows = computed(() =>
  SEGS.slice(0, step.value).map((s, i) => {
    const y1 = rowY(i);
    const y2 = y1 + DROP;
    const [x1, x2] = s.from === 'c' ? [CX.value, SX.value] : [SX.value, CX.value];
    const flags = s.len ? `${s.flags} · ${s.len} bytes` : s.flags;
    return { s, i, x1, x2, y1, y2, flags, text: label(s), current: i === step.value - 1 };
  }),
);

// State labels: where each side's state changes, mark it at the moment it changes.
const states = computed(() => {
  const out: { side: Side; y: number; name: string; after?: boolean }[] = [
    { side: 'c', y: TOP - 30, name: 'CLOSED' },
    { side: 's', y: TOP - 30, name: 'LISTEN' },
  ];
  let c = 'CLOSED';
  let sv = 'LISTEN';
  SEGS.slice(0, step.value).forEach((s, i) => {
    const y1 = rowY(i);
    const y2 = y1 + DROP;
    // The sender changes state when it sends, the receiver when the segment arrives.
    const cy = s.from === 'c' ? y1 : y2;
    const sy = s.from === 's' ? y1 : y2;
    if (s.cState !== c) out.push({ side: 'c', y: cy, name: (c = s.cState) });
    if (s.sState !== sv) out.push({ side: 's', y: sy, name: (sv = s.sState) });
  });
  if (step.value === SEGS.length) {
    const y = rowY(SEGS.length - 1) + ROW + 8;
    out.push({ side: 'c', y, name: 'CLOSED, 2·MSL later', after: true });
  }
  return out;
});

const PHASES = [
  { from: 0, to: 3, name: 'handshake' },
  { from: 3, to: 6, name: 'data' },
  { from: 6, to: 10, name: 'close' },
];

const note = computed(() =>
  step.value === 0
    ? 'The server has called listen() and is waiting in LISTEN. The client is CLOSED. Press next to have the client connect.'
    : SEGS[step.value - 1].note,
);

function newConnection() {
  isnC.value = randIsn();
  isnS.value = randIsn();
  step.value = 0;
}
</script>

<template>
  <div ref="root" class="hs">
    <div class="bar">
      <button :disabled="step === 0" @click="step--">◀ back</button>
      <button :disabled="step === SEGS.length" @click="step++">next ▶</button>
      <button @click="step = SEGS.length">show all</button>
      <button @click="newConnection">new connection</button>
      <label class="small"><input v-model="relative" type="checkbox" /> relative numbers</label>
    </div>

    <svg :viewBox="`0 0 ${W} ${H}`" :width="W" :height="H" :class="{ narrow }" role="img" aria-label="Sequence diagram of a TCP connection">
      <defs>
        <marker id="hs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
      </defs>
      <text :x="CX" y="14" text-anchor="middle" class="head">client</text>
      <text :x="SX" y="14" text-anchor="middle" class="head">server</text>
      <line :x1="CX" :x2="CX" :y1="20" :y2="H - 8" class="axis" />
      <line :x1="SX" :x2="SX" :y1="20" :y2="H - 8" class="axis" />

      <template v-for="p in PHASES" :key="p.name">
        <text
          v-if="step > p.from"
          :x="(CX + SX) / 2"
          :y="rowY(p.from) - 22"
          text-anchor="middle"
          class="phase"
        >— {{ p.name }} —</text>
      </template>

      <g v-for="a in arrows" :key="a.i" :class="['seg', { cur: a.current, ctl: !a.s.len }]">
        <line :x1="a.x1" :y1="a.y1" :x2="a.x2" :y2="a.y2" marker-end="url(#hs-arrow)" />
        <text :x="(a.x1 + a.x2) / 2" :y="(a.y1 + a.y2) / 2 - 15" text-anchor="middle" class="flags">{{ a.flags }}</text>
        <text :x="(a.x1 + a.x2) / 2" :y="(a.y1 + a.y2) / 2 - 3" text-anchor="middle">{{ a.text }}</text>
      </g>

      <text
        v-for="(st, i) in states"
        :key="i"
        :x="st.side === 'c' && !st.after ? CX - 6 : (st.after ? CX : SX) + 6"
        :y="st.y + 4"
        :text-anchor="st.side === 'c' && !st.after ? 'end' : 'start'"
        class="state"
      >{{ st.name }}</text>
    </svg>

    <p class="note">
      <strong v-if="step">{{ step }}/{{ SEGS.length }} · {{ SEGS[step - 1].flags }}.</strong>
      {{ note }}
    </p>
    <p class="small muted">
      ISNs this connection: client {{ isnC }}, server {{ isnS }}.
      <template v-if="relative">Numbers shown relative to each ISN, as Wireshark does.</template>
      <template v-else>Numbers wrap around at <Tex t="2^{32}" />.</template>
    </p>
  </div>
</template>

<style scoped>
.hs {
  font-size: 0.9rem;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.6rem;
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
svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0.6rem auto 0.2rem;
}
svg text {
  font-family: var(--mono);
  font-size: 11px;
  fill: var(--text);
  /* A halo in the page colour keeps labels legible where they cross an arrow. */
  paint-order: stroke;
  stroke: var(--bg);
  stroke-width: 4px;
  stroke-linejoin: round;
}
.flags {
  font-weight: 600;
}
.narrow text {
  font-size: 10px;
}
.head {
  font-family: var(--font) !important;
  font-size: 13px !important;
  font-weight: 600;
}
.axis {
  stroke: var(--border);
  stroke-width: 2;
}
.phase {
  fill: var(--muted) !important;
  font-size: 10px !important;
}
.seg line {
  stroke: var(--muted);
  stroke-width: 1.4;
}
.seg.cur line {
  stroke: var(--accent);
  stroke-width: 2;
}
.seg.cur text {
  fill: var(--accent);
}
.state {
  font-size: 9px !important;
  fill: var(--muted) !important;
}
.note {
  margin: 0.2rem 0 0.3rem;
  min-height: 4.8em;
}
.small {
  font-size: 0.8rem;
}
.muted {
  color: var(--muted);
}
</style>
