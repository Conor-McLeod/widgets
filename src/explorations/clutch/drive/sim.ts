// Engine + friction clutch + point-mass car, stepped at a fixed small dt.
// Both friction elements (clutch, brakes) are Coulomb: they either stick and carry whatever
// torque is needed to stay stuck, or slip and carry their full capacity.

/** Overall ratio (gearbox × final drive) per gear; index 0 is neutral. */
export const GEARS = [0, 14.4, 8.4, 5.6];
/** Pedal travel between the plate first touching and full clamp. */
export const BAND = 0.3;
export const C_MAX = 220; // Nm the clutch carries when fully clamped
export const STALL_RPM = 300;

const WHEEL_R = 0.3;
const MASS = 1200;
const G = 9.81;
const J_ENGINE = 0.12;
const J_INPUT = 0.03; // gearbox input shaft + clutch disc
const IDLE_RPM = 850;
const LIMIT_RPM = 6500;
const BRAKE_MAX = 11000; // N at the tyres with the pedal floored
const HANDBRAKE = 4500;
const ROLLING = 0.012 * MASS * G;
const CDA = 0.65;

export const rpm = (w: number) => (w * 60) / (2 * Math.PI);
const rad = (r: number) => (r * 2 * Math.PI) / 60;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface Inputs {
  clutch: number; // 0 = foot off (engaged), 1 = floored (disengaged)
  brake: number;
  throttle: number;
  handbrake: boolean;
  grade: number; // rise over run, e.g. 0.1 for a 10% hill
  bite: number; // pedal position where the plate first touches the flywheel
}

/** Torque the clutch can carry at this pedal position. Rises slowly at first contact, steeply near full clamp. */
export function capacity(clutch: number, bite: number): number {
  const f = clamp((bite - clutch) / BAND, 0, 1);
  return C_MAX * f ** 3;
}

/**
 * One body with Coulomb resistance `res` (≥ 0) and other torque `drive`. Returns the new speed and
 * whether friction held it still this step.
 */
function coulomb(w: number, inertia: number, drive: number, res: number, dt: number): [number, boolean] {
  const need = (inertia * w) / dt + drive; // resisting torque that would stop it dead this step
  if (Math.abs(need) <= res) return [0, true];
  return [w + ((drive - res * Math.sign(need)) / inertia) * dt, false];
}

export class Sim {
  we = rad(IDLE_RPM); // engine
  wc = 0; // clutch disc / gearbox input
  v = 0; // car, m/s
  x = 0; // distance, m
  gear = 0;
  running = true;
  held = true; // car stationary under brakes/rolling resistance

  // Outputs of the last step.
  cap = 0;
  torque = 0;
  locked = false;
  slipPower = 0;
  event: 'stall' | 'bump' | null = null;

  /** Returns false if the clutch is still carrying torque (the gearbox won't go in). */
  setGear(n: number, inp: Inputs): boolean {
    if (n !== 0 && capacity(inp.clutch, inp.bite) > 2) return false;
    this.gear = n;
    if (n) this.wc = (this.v * GEARS[n]) / WHEEL_R; // synchros match the input shaft to the road
    return true;
  }

  /** Returns false if the engine can't be started (in gear with the clutch up). */
  start(inp: Inputs): boolean {
    if (this.gear && capacity(inp.clutch, inp.bite) > 2) return false;
    this.running = true;
    this.we = Math.max(this.we, rad(IDLE_RPM));
    return true;
  }

  step(dt: number, inp: Inputs) {
    const r = rpm(this.we);

    // Engine: throttle, plus an idle controller that opens it a little when revs sag.
    let thr = 0;
    if (this.running) {
      const idle = clamp((IDLE_RPM + 50 - r) / 150, 0, 1) * 0.8;
      thr = r > LIMIT_RPM ? 0 : Math.max(inp.throttle, idle);
    }
    const full = 150 * (1 - ((r - 4000) / 5000) ** 2);
    const friction = this.we > 0 ? 10 + 0.003 * r : 0;
    const te = thr * full - friction;

    // Forces at the tyres.
    const theta = Math.atan(inp.grade);
    const along = -MASS * G * Math.sin(theta) - 0.6 * CDA * this.v * Math.abs(this.v);
    const resist = inp.brake * BRAKE_MAX + (inp.handbrake ? HANDBRAKE : 0) + ROLLING;

    // Clutch-side body: just the input shaft in neutral, the whole car (reflected) in gear.
    const g = GEARS[this.gear];
    const jc = g ? J_INPUT + (MASS * WHEEL_R ** 2) / g ** 2 : J_INPUT;
    const tExt = g ? (along * WHEEL_R) / g : -0.0015 * this.wc;
    const tRes = g ? (resist * WHEEL_R) / g : 0.5;

    // Clutch: torque that would make both sides spin together after this step, capped at capacity.
    const cap = capacity(inp.clutch, inp.bite);
    const dw = this.we - this.wc;
    const invJc = g && this.held ? 0 : 1 / jc;
    const tLock = (dw / dt + te / J_ENGINE - tExt * invJc) / (1 / J_ENGINE + invJc);
    const t = clamp(tLock, -cap, cap);
    this.cap = cap;
    this.torque = t;
    this.locked = cap > 0 && Math.abs(tLock) <= cap;
    this.slipPower = Math.abs(t * dw);

    this.we = Math.max(0, this.we + ((te - t) / J_ENGINE) * dt);

    if (g) {
      [this.wc, this.held] = coulomb(this.wc, jc, t + tExt, tRes, dt);
      this.v = (this.wc * WHEEL_R) / g;
    } else {
      [this.wc] = coulomb(this.wc, jc, t + tExt, tRes, dt);
      const [wv, held] = coulomb(this.v / WHEEL_R, MASS * WHEEL_R ** 2, along * WHEEL_R, resist * WHEEL_R, dt);
      this.v = wv * WHEEL_R;
      this.held = held;
    }
    this.x += this.v * dt;

    const now = rpm(this.we);
    if (this.running && now < STALL_RPM) {
      this.running = false;
      this.event = 'stall';
    } else if (!this.running && g && now > 600) {
      this.running = true; // rolling with the clutch up turned the engine over: a bump start
      this.event = 'bump';
    }
  }
}
