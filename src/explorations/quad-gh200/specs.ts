// One Alps-style quad GH200 node (HPE Cray EX254n, one of the two nodes on a blade).
// Bandwidths are GB/s in one direction, as advertised; capacities are GB.
export const N = 4;

export const BW = {
  /** HBM3 on each Hopper. */
  hbm: 4000,
  /** LPDDR5X on each Grace ("up to 500 GB/s"). */
  lpddr: 500,
  /** NVLink-C2C between a Grace and its Hopper, each direction (900 GB/s total). */
  c2c: 450,
  /** 6 of a Hopper's 18 NVLink 4 ports go to each of its 3 peers: 6 × 25 GB/s. */
  nvPeer: 150,
  /** All 18 ports at once. */
  nvAll: 450,
  /** PCIe Gen5 x16, each direction. */
  pcie: 64,
  /** One HPE Slingshot 11 port: 200 Gb/s. */
  nic: 25,
};

export const CAP = { hbm: 96, lpddr: 128 };

/** Dense tensor-core throughput of one Hopper, FLOP/s. */
export const FLOPS = { fp8: 1979e12, bf16: 989e12, tf32: 494e12, fp64: 67e12 };

export function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return '—';
  if (s < 1e-3) return `${(s * 1e6).toPrecision(2)} µs`;
  if (s < 1) return `${(s * 1e3).toPrecision(s * 1e3 < 10 ? 2 : 3)} ms`;
  if (s < 60) return `${s.toPrecision(s < 10 ? 2 : 3)} s`;
  if (s < 3600) return `${(s / 60).toPrecision(2)} min`;
  return `${(s / 3600).toPrecision(2)} h`;
}

export function fmtGB(gb: number): string {
  if (gb < 1) return `${Math.round(gb * 1000)} MB`;
  if (gb < 1000) return `${gb < 10 ? gb.toPrecision(2) : Math.round(gb)} GB`;
  return `${(gb / 1000).toPrecision(gb < 1e4 ? 2 : 3)} TB`;
}

export function fmtBW(gbps: number): string {
  return gbps >= 1000 ? `${gbps / 1000} TB/s` : `${gbps} GB/s`;
}
