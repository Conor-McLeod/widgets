// Vanilla widget: drive a manual car off from rest. Three pedals, a gear lever and a hill, with a flat
// schematic of the clutch and a trace of engine vs gearbox speed so the bite point and slip are visible.
import type { Mount } from '~/widget';
import { BAND, C_MAX, GEARS, STALL_RPM, Sim, rpm, type Inputs } from './sim';

const DT = 0.001;
const HISTORY_S = 8;
const SAMPLE_HZ = 30;
const H = 320;
const PEDAL_TRAVEL = 118; // px the pad moves in a 140px track

type PedalKey = 'clutch' | 'brake' | 'throttle';

const pedalHtml = (k: PedalKey, label: string) => `
  <div class="cl-pedal" data-k="${k}" role="slider" tabindex="0" aria-label="${label} pedal"
       aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
    <div class="cl-track">
      <div class="cl-fill"></div>
      ${k === 'clutch' ? '<div class="cl-bite"><span>bite</span></div>' : ''}
      <div class="cl-pad"></div>
    </div>
    <span class="cl-plabel">${label}</span>
    <span class="cl-pval">0%</span>
  </div>`;

export const mount: Mount = (el) => {
  el.innerHTML = `
    <div class="cl">
      <canvas class="cl-canvas" role="img" aria-label="Car, clutch schematic and speed trace"></canvas>
      <div class="cl-ctl">
        <div class="cl-pedals">
          ${pedalHtml('clutch', 'Clutch')}${pedalHtml('brake', 'Brake')}${pedalHtml('throttle', 'Gas')}
        </div>
        <div class="cl-side">
          <div class="cl-gears" role="group" aria-label="Gear">
            ${GEARS.map((_, i) => `<button data-g="${i}">${i === 0 ? 'N' : i}</button>`).join('')}
          </div>
          <div class="cl-row">
            <button class="cl-hb" aria-pressed="true">Handbrake</button>
            <button class="cl-start">Start engine</button>
          </div>
          <label class="cl-range"><span>Hill</span><input class="cl-grade" type="range" min="0" max="20" value="0" /><output></output></label>
          <label class="cl-range"><span>Bite point</span><input class="cl-bitepos" type="range" min="0" max="100" value="40" /><output></output></label>
        </div>
      </div>
      <p class="cl-msg" aria-live="polite"></p>
    </div>
    <style>
      .cl-canvas { display: block; width: 100%; height: ${H}px; }
      .cl-ctl { display: flex; flex-wrap: wrap; gap: 1rem 1.5rem; margin-top: .75rem; }
      .cl-pedals { display: flex; gap: .6rem; }
      .cl-pedal { display: flex; flex-direction: column; align-items: center; gap: .2rem; width: 58px; touch-action: none; cursor: ns-resize; outline: none; user-select: none; }
      .cl-track { position: relative; width: 100%; height: 140px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); }
      .cl-pedal:focus-visible .cl-track { outline: 2px solid var(--accent); outline-offset: 2px; }
      .cl-fill { position: absolute; left: 0; right: 0; top: 0; background: var(--accent-soft); border-radius: 5px 5px 0 0; }
      .cl-pad { position: absolute; left: 4px; right: 4px; height: 22px; border-radius: 4px; background: var(--muted); }
      .cl-pedal[data-k="clutch"] .cl-pad { background: var(--accent); }
      .cl-pedal[data-k="brake"] .cl-pad { background: var(--danger); }
      .cl-bite { position: absolute; left: 0; right: 0; border-top: 1px dashed var(--accent); border-bottom: 1px dashed var(--accent); }
      .cl-bite span { position: absolute; right: 100%; top: 50%; transform: translateY(-50%); margin-right: 3px; font-size: .7rem; color: var(--accent); }
      .cl-pedals .cl-pedal:first-child { margin-left: 1.6rem; }
      .cl-plabel { font-size: .85rem; }
      .cl-pval { font-family: var(--mono); font-size: .75rem; color: var(--muted); }
      .cl-side { flex: 1; min-width: 210px; display: flex; flex-direction: column; gap: .6rem; font-size: .9rem; }
      .cl-gears, .cl-row { display: flex; gap: .4rem; flex-wrap: wrap; }
      .cl button { font: inherit; padding: .3rem .7rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); cursor: pointer; }
      .cl-gears button { min-width: 2.4rem; font-family: var(--mono); }
      .cl button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--surface); }
      .cl-range { display: flex; align-items: center; gap: .5rem; color: var(--muted); }
      .cl-range span { width: 5.5rem; }
      .cl-range input { flex: 1; min-width: 0; }
      .cl-range output { width: 3.5rem; font-family: var(--mono); color: var(--text); font-size: .85rem; }
      .cl-msg { margin: .75rem 0 0; min-height: 2.8em; font-size: .9rem; }
    </style>`;

  const canvas = el.querySelector<HTMLCanvasElement>('.cl-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const msg = el.querySelector<HTMLElement>('.cl-msg')!;
  const gearBtns = [...el.querySelectorAll<HTMLButtonElement>('.cl-gears button')];
  const hbBtn = el.querySelector<HTMLButtonElement>('.cl-hb')!;
  const startBtn = el.querySelector<HTMLButtonElement>('.cl-start')!;
  const gradeIn = el.querySelector<HTMLInputElement>('.cl-grade')!;
  const biteIn = el.querySelector<HTMLInputElement>('.cl-bitepos')!;
  const biteBand = el.querySelector<HTMLElement>('.cl-bite')!;

  const sim = new Sim();
  const inp: Inputs = { clutch: 0, brake: 0, throttle: 0, handbrake: true, grade: 0, bite: 0.65 };

  // --- pedals --------------------------------------------------------------------------------
  const pedals = [...el.querySelectorAll<HTMLElement>('.cl-pedal')];
  function renderPedal(p: HTMLElement) {
    const v = inp[p.dataset.k as PedalKey];
    const top = v * PEDAL_TRAVEL;
    p.querySelector<HTMLElement>('.cl-pad')!.style.top = `${top}px`;
    p.querySelector<HTMLElement>('.cl-fill')!.style.height = `${top + 11}px`;
    p.querySelector('.cl-pval')!.textContent = `${Math.round(v * 100)}%`;
    p.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  }
  function setPedal(p: HTMLElement, v: number) {
    inp[p.dataset.k as PedalKey] = Math.min(1, Math.max(0, v));
    renderPedal(p);
  }
  const fromPointer = (p: HTMLElement, ev: PointerEvent) => {
    const rect = p.querySelector('.cl-track')!.getBoundingClientRect();
    setPedal(p, (ev.clientY - rect.top - 11) / PEDAL_TRAVEL);
  };
  for (const p of pedals) {
    p.addEventListener('pointerdown', (ev) => {
      p.setPointerCapture(ev.pointerId);
      p.focus();
      fromPointer(p, ev);
    });
    p.addEventListener('pointermove', (ev) => {
      if (p.hasPointerCapture(ev.pointerId)) fromPointer(p, ev);
    });
    p.addEventListener('keydown', (ev) => {
      const k = p.dataset.k as PedalKey;
      const step = ev.shiftKey ? 0.1 : 0.02;
      const next = { ArrowDown: inp[k] + step, ArrowUp: inp[k] - step, End: 1, Home: 0 }[ev.key];
      if (next === undefined) return;
      ev.preventDefault();
      setPedal(p, next);
    });
    renderPedal(p);
  }

  // --- other controls ------------------------------------------------------------------------
  let flash = '';
  let flashUntil = 0;
  const say = (text: string, ms = 3500) => {
    flash = text;
    flashUntil = performance.now() + ms;
  };

  function renderGears() {
    gearBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(sim.gear === i)));
  }
  gearBtns.forEach((b, i) =>
    b.addEventListener('click', () => {
      if (!sim.setGear(i, inp)) say('Crunch. Press the clutch past the bite point before selecting a gear.');
      renderGears();
    }),
  );
  hbBtn.addEventListener('click', () => {
    inp.handbrake = !inp.handbrake;
    hbBtn.setAttribute('aria-pressed', String(inp.handbrake));
  });
  startBtn.addEventListener('click', () => {
    if (!sim.start(inp)) say('In gear with the clutch up, the starter would drag the whole car. Press the clutch or select N.');
  });
  function renderRanges() {
    inp.grade = Number(gradeIn.value) / 100;
    gradeIn.nextElementSibling!.textContent = `${gradeIn.value}%`;
    const s = Number(biteIn.value) / 100;
    inp.bite = 0.85 - 0.5 * s; // high bite = plate touches early in the lift, like a worn clutch
    biteIn.nextElementSibling!.textContent = s < 0.34 ? 'low' : s < 0.67 ? 'middle' : 'high';
    biteBand.style.top = `${(inp.bite - BAND) * PEDAL_TRAVEL + 11}px`;
    biteBand.style.height = `${BAND * PEDAL_TRAVEL}px`;
  }
  gradeIn.addEventListener('input', renderRanges);
  biteIn.addEventListener('input', renderRanges);
  renderRanges();
  renderGears();

  // --- guidance ------------------------------------------------------------------------------
  function hint(): string {
    if (performance.now() < flashUntil) return flash;
    if (!sim.running) return 'Engine off. Press the clutch (or select N) and hit Start.';
    const disengaged = sim.cap < 2;
    if (sim.gear === 0) return disengaged ? 'Now pick 1st.' : 'Press the clutch to the floor, then pick 1st.';
    if (sim.held && sim.v === 0) {
      if (disengaged) return 'Lift the clutch slowly. Watch the engine trace: when it dips, you have found the bite.';
      if (inp.handbrake || inp.brake > 0) return 'At the bite the clutch is pulling against the brakes. Add a little gas and release the brake.';
      return 'The clutch is carrying torque but not enough to move the car yet. Lift a touch more, or add gas.';
    }
    if (!sim.locked && !disengaged) return 'Slipping: the two speeds are converging and the difference becomes heat. Keep lifting smoothly.';
    if (sim.locked && sim.gear < GEARS.length - 1 && rpm(sim.we) > 3000)
      return 'Clutch locked. To change up: clutch down, off the gas, next gear, then lift again.';
    return 'Clutch locked: engine and wheels turn together, so the gas pedal now drives the car directly.';
  }

  // --- drawing -------------------------------------------------------------------------------
  let W = 600;
  let colors: Record<string, string> = {};
  function readColors() {
    const cs = getComputedStyle(el);
    for (const k of ['text', 'muted', 'border', 'surface', 'bg', 'accent', 'accent-soft', 'danger', 'mono'])
      colors[k] = cs.getPropertyValue(`--${k}`).trim();
  }
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth || 600;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const N = HISTORY_S * SAMPLE_HZ;
  const hist: { e: number; c: number; slip: boolean }[] = [];
  const font = (px: number, mono = false) => `${px}px ${mono ? colors.mono : 'ui-sans-serif, system-ui, sans-serif'}`;

  function drawRoad() {
    const c = colors;
    const a = Math.atan(inp.grade) * 1.5; // exaggerated a little so gentle hills read
    ctx.save();
    ctx.translate(W / 2, 92);
    ctx.rotate(-a);
    ctx.fillStyle = c.bg;
    ctx.fillRect(-W, 0, 2 * W, 24);
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-W, 0);
    ctx.lineTo(W, 0);
    ctx.stroke();
    // Road markings scroll with distance travelled.
    const pxPerM = 14;
    const off = (((-sim.x * pxPerM) % 40) + 40) % 40;
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 3;
    for (let x = -W - 40 + off; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x + 18, 8);
      ctx.stroke();
    }
    // Car body (side view), facing right / uphill.
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.roundRect(-46, -30, 92, 20, 5);
    ctx.roundRect(-26, -44, 44, 16, 5);
    ctx.fill();
    if (inp.brake > 0.02 || inp.handbrake) {
      ctx.fillStyle = c.danger;
      ctx.fillRect(-48, -27, 5, 7);
    }
    const spin = sim.x / 0.3;
    for (const wx of [-28, 28]) {
      ctx.fillStyle = c.text;
      ctx.beginPath();
      ctx.arc(wx, -10, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c.surface;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wx, -10);
      ctx.lineTo(wx + 7 * Math.cos(spin), -10 + 7 * Math.sin(spin));
      ctx.stroke();
    }
    ctx.restore();

    // Readouts.
    ctx.fillStyle = c.text;
    ctx.font = font(15, true);
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.abs(sim.v * 3.6).toFixed(0).padStart(3)} km/h${sim.v < -0.05 ? ' ← rolling back' : ''}`, 0, 16);
    const [label, tone] = !sim.running
      ? ['STALLED', c.danger]
      : sim.gear === 0
        ? ['neutral', c.muted]
        : sim.cap < 2
          ? ['clutch disengaged', c.muted]
          : sim.locked
            ? ['clutch locked', c.accent]
            : ['clutch slipping', c.danger];
    ctx.font = font(13);
    ctx.textAlign = 'right';
    ctx.fillStyle = tone;
    ctx.fillText(label, W, 16);
  }

  function drawClutch(y0: number) {
    const c = colors;
    const mid = y0 + 42;
    const s = Math.min(1, W / 520); // squeeze horizontally on narrow screens
    const X = (x: number) => (W - 520 * s) / 2 + x * s;
    const gapPx = Math.max(0, Math.min(1, (inp.clutch - inp.bite) / (1 - inp.bite))) * 14;
    const clamp = sim.cap / C_MAX;

    const box = (x: number, w: number, h: number, fill: string, label?: string) => {
      ctx.fillStyle = fill;
      ctx.fillRect(X(x), mid - h / 2, w * s, h);
      if (label) {
        ctx.fillStyle = c.text;
        ctx.font = font(12);
        ctx.textAlign = 'center';
        ctx.fillText(label, X(x + w / 2), mid + 4);
      }
    };
    const shaft = (a: number, b: number) => {
      ctx.strokeStyle = c.muted;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X(a), mid);
      ctx.lineTo(X(b), mid);
      ctx.stroke();
    };

    box(0, 90, 44, c.border, 'engine');
    shaft(90, 150);
    box(150, 14, 64, c.muted); // flywheel
    const plate = 164 + gapPx;
    // Heat at the friction face, proportional to slip power.
    const heat = Math.min(1, sim.slipPower / 12000);
    if (heat > 0.01) {
      ctx.globalAlpha = 0.25 + 0.75 * heat;
      ctx.fillStyle = c.danger;
      ctx.fillRect(X(162), mid - 32, (4 + gapPx) * s, 64);
      ctx.globalAlpha = 1;
    }
    box(plate, 8, 56, c.accent); // friction disc
    box(plate + 10, 8, 60, c.border); // pressure plate
    // Clamp arrow: thicker the harder the springs squeeze.
    if (clamp > 0) {
      ctx.strokeStyle = c.text;
      ctx.lineWidth = 1 + 4 * clamp;
      ctx.beginPath();
      ctx.moveTo(X(plate + 44), mid - 22);
      ctx.lineTo(X(plate + 22), mid - 22);
      ctx.stroke();
    }
    shaft(plate + 18, 360);
    box(360, 90, 44, c.border, sim.gear ? `gear ${sim.gear}` : 'neutral');
    shaft(450, 520);

    ctx.font = font(12, true);
    ctx.textAlign = 'center';
    ctx.fillStyle = c.accent;
    ctx.fillText(`${rpm(sim.we).toFixed(0)} rpm`, X(120), mid + 48);
    ctx.fillStyle = c.text;
    ctx.fillText(`${rpm(sim.wc).toFixed(0)} rpm`, X(280), mid + 48);
    ctx.fillStyle = c.muted;
    ctx.font = font(11);
    ctx.textAlign = 'right';
    ctx.fillText('flywheel', X(146), mid - 38);
    ctx.textAlign = 'left';
    ctx.fillText('disc', X(plate + 22), mid - 38);
    ctx.textAlign = 'right';
    ctx.font = font(12, true);
    ctx.fillStyle = c.text;
    ctx.fillText(`carrying ${Math.abs(sim.torque).toFixed(0)} of ${sim.cap.toFixed(0)} Nm`, X(520), mid - 38);
  }

  function drawChart(y0: number, h: number) {
    const c = colors;
    const left = 36;
    const right = W - 4;
    const maxR = 7000;
    const Y = (r: number) => y0 + h - (Math.min(r, maxR) / maxR) * h;
    const Xi = (i: number) => left + (i / (N - 1)) * (right - left);

    ctx.font = font(10, true);
    ctx.textAlign = 'right';
    for (const r of [0, 2000, 4000, 6000]) {
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, Y(r));
      ctx.lineTo(right, Y(r));
      ctx.stroke();
      ctx.fillStyle = c.muted;
      ctx.fillText(r ? `${r / 1000}k` : '0', left - 4, Y(r) + 3);
    }
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = c.danger;
    ctx.beginPath();
    ctx.moveTo(left, Y(STALL_RPM));
    ctx.lineTo(right, Y(STALL_RPM));
    ctx.stroke();
    ctx.setLineDash([]);

    const off = N - hist.length;
    // Shade the gap between the two speeds while the clutch slips.
    ctx.fillStyle = c['accent-soft'];
    for (let i = 1; i < hist.length; i++) {
      if (!hist[i].slip) continue;
      const a = hist[i - 1];
      const b = hist[i];
      ctx.beginPath();
      ctx.moveTo(Xi(off + i - 1), Y(a.e));
      ctx.lineTo(Xi(off + i), Y(b.e));
      ctx.lineTo(Xi(off + i), Y(b.c));
      ctx.lineTo(Xi(off + i - 1), Y(a.c));
      ctx.fill();
    }
    const line = (key: 'e' | 'c', color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      hist.forEach((p, i) => (i ? ctx.lineTo(Xi(off + i), Y(p[key])) : ctx.moveTo(Xi(off + i), Y(p[key]))));
      ctx.stroke();
    };
    line('c', c.text);
    line('e', c.accent);

    ctx.textAlign = 'left';
    ctx.font = font(11);
    ctx.fillStyle = c.accent;
    ctx.fillText('engine', left + 6, y0 + 10);
    ctx.fillStyle = c.text;
    ctx.fillText('gearbox input', left + 56, y0 + 10);
    ctx.fillStyle = c.danger;
    ctx.fillText('stall', left + 6, Y(STALL_RPM) - 4);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawRoad();
    drawClutch(128);
    drawChart(236, 80);
  }

  // --- loop ----------------------------------------------------------------------------------
  let raf = 0;
  let last = performance.now();
  let sampleAcc = 0;
  let frames = 0;
  let lastHint = '';
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let t = 0; t < dt; t += DT) sim.step(DT, inp);
    if (sim.event === 'stall') say('Stalled. The clutch demanded more torque than the engine could make at that speed.');
    if (sim.event === 'bump') say('Bump start: the rolling car spun the engine back to life through the clutch.');
    sim.event = null;

    sampleAcc += dt;
    while (sampleAcc >= 1 / SAMPLE_HZ) {
      sampleAcc -= 1 / SAMPLE_HZ;
      hist.push({ e: rpm(sim.we), c: rpm(sim.wc), slip: sim.cap > 2 && !sim.locked });
      if (hist.length > N) hist.shift();
    }
    if (frames++ % 30 === 0) readColors();
    draw();
    const h = hint();
    if (h !== lastHint) msg.textContent = lastHint = h;
    raf = requestAnimationFrame(frame);
  }

  // Only run while on screen.
  const io = new IntersectionObserver(([entry]) => {
    cancelAnimationFrame(raf);
    if (entry.isIntersecting) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });
  const ro = new ResizeObserver(resize);
  readColors();
  resize();
  io.observe(el);
  ro.observe(canvas);

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
  };
};
