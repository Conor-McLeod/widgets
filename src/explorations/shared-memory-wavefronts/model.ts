// The textbook model of how a warp's shared-memory request becomes wavefronts.
//
// Shared memory has 32 banks of 4-byte words; word w lives in bank w mod 32. One wavefront can read
// at most one distinct word from each bank (any number of lanes may share a word: broadcast), so at
// most 128 bytes. A W-byte access needs 32·W bytes for the warp, so the warp is first split into
// phases of 128/W lanes (one phase for 4 B, half-warps for 8 B, quarter-warps for 16 B). Within a
// phase, the number of wavefronts is the largest number of distinct words any one bank must supply.

export const BANKS = 32;
export const LANES = 32;
export type Width = 4 | 8 | 16;

/** One word moved by one wavefront, and the lanes that receive it. */
export interface Cell {
  word: number;
  bank: number;
  phase: number;
  /** Wavefront index within the whole request. */
  wave: number;
  /** Wavefront index within its phase: 0 is free, anything higher is a bank conflict. */
  depth: number;
  lanes: number[];
}

export interface Plan {
  width: Width;
  lanesPerPhase: number;
  phases: number;
  /** Total wavefronts for the request. */
  wavefronts: number;
  cells: Cell[];
  /** For each wavefront: which phase it belongs to. */
  wavePhase: number[];
}

/**
 * `elems[lane]` is the index of the W-byte element that lane reads (so its byte address is
 * elems[lane] · W, naturally aligned).
 */
export function plan(elems: number[], width: Width): Plan {
  const wordsPer = width / 4;
  const lanesPerPhase = 128 / width;
  const phases = LANES / lanesPerPhase;
  const cells: Cell[] = [];
  const wavePhase: number[] = [];

  for (let p = 0; p < phases; p++) {
    // bank -> distinct words in first-touch order, each with its lanes
    const byBank = new Map<number, Map<number, number[]>>();
    for (let lane = p * lanesPerPhase; lane < (p + 1) * lanesPerPhase; lane++) {
      for (let j = 0; j < wordsPer; j++) {
        const word = elems[lane] * wordsPer + j;
        const bank = word % BANKS;
        let words = byBank.get(bank);
        if (!words) byBank.set(bank, (words = new Map()));
        let lanes = words.get(word);
        if (!lanes) words.set(word, (lanes = []));
        if (!lanes.includes(lane)) lanes.push(lane);
      }
    }
    let depthMax = 1;
    for (const [bank, words] of byBank) {
      let d = 0;
      for (const [word, lanes] of words) {
        cells.push({ word, bank, phase: p, wave: wavePhase.length + d, depth: d, lanes });
        d++;
      }
      depthMax = Math.max(depthMax, d);
    }
    for (let d = 0; d < depthMax; d++) wavePhase.push(p);
  }
  return { width, lanesPerPhase, phases, wavefronts: wavePhase.length, cells, wavePhase };
}

/** Lane t reads element stride·t. */
export const strided = (stride: number) => Array.from({ length: LANES }, (_, t) => stride * t);
