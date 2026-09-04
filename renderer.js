// Physics State & Options
const options = {
  mode: '2d',
  v0: 25,
  angle: 45,
  h0: 0,
  g: 9.81,
  airCoeff: 0.0,
  elasticity: 0.75, // Coefficient of restitution
  timeScale: 1.0,
};

const displayOptions = {
  showVectors: true,
  showTrail: true,
  showPrediction: true,
};

let simState = {
  t: 0,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  speed: 0,
  isLanded: false,
  maxHeight: 0,
  range: 0,
  bounces: 0,
};

// Initial total mechanical energy (m = 1kg)
let initialEnergy = 0;

// Permanent Bounce Coordinate Markers: { id, x, y: 0, t, keLost }
let bounceMarkers = [];

// Dissolving Animation State
let isDissolving = false;
let isDissolved = false;
let dissolveAlpha = 1.0;
let dissolveReason = '';
let dissolveParticles = []; // { x, y, vx, vy, size, alpha }

// Trail points for decaying opacity animation
let dynamicTrail = [];
let fullTrajectory = [];
let impactRipples = []; // { x, radius, maxRadius, alpha, keLost }

let isRunning = false;
let animId = null;

// DOM Elements
const canvas = document.getElementById('simCanvas');
const canvasWrap = document.getElementById('canvasWrap');
const ctx = canvas.getContext('2d');

const analyticsCanvas = document.getElementById('analyticsCanvas');
const analyticsCtx = analyticsCanvas.getContext('2d');

const mode2dBtn = document.getElementById('mode2dBtn');
const mode1dBtn = document.getElementById('mode1dBtn');
const angleGroup = document.getElementById('angleGroup');

const launchBtn = document.getElementById('launchBtn');
const launchText = document.getElementById('launchText');
const launchIcon = document.getElementById('launchIcon');
const resetBtn = document.getElementById('resetBtn');
const exportBtn = document.getElementById('exportBtn');

const v0Slider = document.getElementById('v0Slider');
const v0Val = document.getElementById('v0Val');
const angleSlider = document.getElementById('angleSlider');
const angleVal = document.getElementById('angleVal');
const h0Slider = document.getElementById('h0Slider');
const h0Val = document.getElementById('h0Val');
const elasticitySlider = document.getElementById('elasticitySlider');
const elasticityVal = document.getElementById('elasticityVal');
const gSlider = document.getElementById('gSlider');
const gVal = document.getElementById('gVal');
const dragSlider = document.getElementById('dragSlider');
const dragVal = document.getElementById('dragVal');

const showPredictionCheck = document.getElementById('showPrediction');
const showTrailCheck = document.getElementById('showTrail');
const showVectorsCheck = document.getElementById('showVectors');

const statMaxH = document.getElementById('statMaxH');
const statIdealH = document.getElementById('statIdealH');
const statRange = document.getElementById('statRange');
const statBounces = document.getElementById('statBounces');
const statTime = document.getElementById('statTime');
const statIdealT = document.getElementById('statIdealT');
const statSpeed = document.getElementById('statSpeed');
const statV0 = document.getElementById('statV0');

const totalEnergy = document.getElementById('totalEnergy');
const keBar = document.getElementById('keBar');
const peBar = document.getElementById('peBar');
const keVal = document.getElementById('keVal');
const peVal = document.getElementById('peVal');

// Graph Frame Bounce Elements
const badgeBounceCount = document.getElementById('badgeBounceCount');
const badgeBounceStatus = document.getElementById('badgeBounceStatus');

// Theoretical calculation helpers
function getTheoreticalStats() {
  const { v0, angle, h0, g, mode } = options;
  if (g <= 0) return { maxHeight: Infinity, flightTime: Infinity, range: Infinity };
  const rad = mode === '1d' ? Math.PI / 2 : (angle * Math.PI) / 180;
  const vy0 = v0 * Math.sin(rad);
  const vx0 = mode === '1d' ? 0 : v0 * Math.cos(rad);

  const maxHeight = h0 + (vy0 > 0 ? (vy0 * vy0) / (2 * g) : 0);
  const disc = vy0 * vy0 + 2 * g * h0;
  const flightTime = (vy0 + Math.sqrt(Math.max(0, disc))) / g;
  const range = vx0 * flightTime;

  return { maxHeight, flightTime, range };
}

function getTheoreticalCurve(pointsCount = 80) {
  const stats = getTheoreticalStats();
  if (!isFinite(stats.flightTime) || stats.flightTime <= 0) return [];
  const { v0, angle, h0, g, mode } = options;
  const rad = mode === '1d' ? Math.PI / 2 : (angle * Math.PI) / 180;
  const vy0 = v0 * Math.sin(rad);
  const vx0 = mode === '1d' ? 0 : v0 * Math.cos(rad);

  const pts = [];
  const dt = stats.flightTime / pointsCount;
  for (let i = 0; i <= pointsCount; i++) {
    const t = i * dt;
    const x = vx0 * t;
    const y = Math.max(0, h0 + vy0 * t - 0.5 * g * t * t);
    pts.push({ x, y });
  }
  return pts;
}

function initSimState() {
  const rad = (options.angle * Math.PI) / 180;
  const vx0 = options.mode === '2d' ? options.v0 * Math.cos(rad) : 0;
  const vy0 = options.mode === '2d' ? options.v0 * Math.sin(rad) : options.v0;

  const m = 1;
  initialEnergy = 0.5 * m * (vx0 * vx0 + vy0 * vy0) + m * options.g * options.h0;
  if (initialEnergy < 0.1) initialEnergy = 1.0;

  simState = {
    t: 0,
    x: 0,
    y: options.h0,
    vx: vx0,
    vy: vy0,
    speed: Math.hypot(vx0, vy0),
    isLanded: false,
    maxHeight: options.h0,
    range: 0,
    bounces: 0,
  };

  isDissolving = false;
  isDissolved = false;
  dissolveAlpha = 1.0;
  dissolveReason = '';
  dissolveParticles = [];

  dynamicTrail = [];
  fullTrajectory = [{ ...simState }];
  impactRipples = [];

  updateUI();
  drawSimulation();
  drawAnalytics();
}

function resetSimulation() {
  pauseSim();
  bounceMarkers = [];
  dissolveReason = '';
  initSimState();
}

// Pure physics numerical integration
function stepPhysics(dt) {
  if (simState.isLanded || isDissolving || isDissolved) return;

  const subSteps = 20;
  const subDt = dt / subSteps;
  const { g, airCoeff, mode, elasticity } = options;

  let { x, y, vx, vy, t, maxHeight, bounces } = simState;

  for (let i = 0; i < subSteps; i++) {
    const ax = -airCoeff * vx;
    const ay = -g - airCoeff * vy;

    vx += ax * subDt;
    vy += ay * subDt;
    x += (mode === '1d' ? 0 : vx) * subDt;
    y += vy * subDt;
    t += subDt;

    if (y > maxHeight) maxHeight = y;

    // Ground collision & Bounce
    if (y <= 0) {
      y = 0;

      if (vy < 0) {
        const keBefore = 0.5 * (vx * vx + vy * vy);

        // Rebound with elasticity
        vy = -vy * elasticity;
        vx = vx * (0.98 - 0.05 * (1 - elasticity));

        const keAfter = 0.5 * (vx * vx + vy * vy);
        const keLost = Math.max(0, keBefore - keAfter);

        // Check if consecutive bounces overlap (Δx <= 0.01m)
        let lastBounceX = null;
        if (bounceMarkers.length > 0) {
          lastBounceX = bounceMarkers[bounceMarkers.length - 1].x;
        }

        bounces++;

        // Add to permanent bounce markers (labeled on screen until user resets)
        bounceMarkers.push({
          id: bounces,
          x: Number(x.toFixed(2)),
          y: 0,
          t: Number(t.toFixed(2)),
          keLost: Number(keLost.toFixed(1)),
        });

        // Add impact ripple wave that expands and dissolves
        impactRipples.push({
          x,
          radius: 3,
          maxRadius: 40,
          alpha: 1.0,
          keLost: keLost.toFixed(1),
        });

        // CONDITION 1: Overlapping micro-bounces within ~0.01 units
        if (lastBounceX !== null && Math.abs(x - lastBounceX) <= 0.01) {
          vx = 0;
          vy = 0;
          y = 0;
          dissolveReason = `Micro-bounces overlap (Δx ≤ 0.01m)`;
          isDissolving = true;
          dissolveAlpha = 1.0;
          break;
        }
      }
    }
  }

  const currentSpeed = Math.hypot(mode === '1d' ? 0 : vx, vy);
  const currentTotalEnergy = 0.5 * (vx * vx + vy * vy) + g * y;

  simState = {
    t,
    x: mode === '1d' ? 0 : Math.max(0, x),
    y: Math.max(0, y),
    vx: (mode === '1d' ? 0 : vx),
    vy: vy,
    speed: currentSpeed,
    isLanded: false,
    maxHeight,
    range: mode === '1d' ? 0 : x,
    bounces,
  };

  // CONDITION 2: Energy depleted below ~10% (0.10) of original launch energy
  if (!isDissolving && bounces > 0 && y <= 0.05 && currentTotalEnergy <= 0.10 * initialEnergy) {
    simState.vx = 0;
    simState.vy = 0;
    simState.y = 0;
    simState.speed = 0;
    dissolveReason = `Energy depleted below 10%`;
    isDissolving = true;
    dissolveAlpha = 1.0;
  }

  // Record point for decaying trail
  if (!isDissolving && !isDissolved) {
    dynamicTrail.push({
      x: simState.x,
      y: simState.y,
      alpha: 1.0,
    });
  }

  fullTrajectory.push({ ...simState });
}

// Continuous visual animation updater (runs independently every frame so nothing ever freezes)
function updateVisualEffects() {
  // 1. Dissolve ball animation
  if (isDissolving && !isDissolved) {
    dissolveAlpha = Math.max(0, dissolveAlpha - 0.015);

    // Spawn gentle dissolving vapor mist
    if (dissolveAlpha > 0.02 && Math.random() < 0.7) {
      dissolveParticles.push({
        x: simState.x + (Math.random() - 0.5) * 1.6,
        y: Math.random() * 0.9,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.5 + Math.random() * 0.9,
        size: 1.5 + Math.random() * 2.5,
        alpha: dissolveAlpha * 0.95,
      });
    }

    if (dissolveAlpha <= 0) {
      isDissolved = true;
      simState.isLanded = true;
      isRunning = false;
      launchBtn.classList.add('paused');
      launchText.textContent = 'LAUNCH';
      launchIcon.innerHTML = '<polygon points="5,3 19,12 5,21"/>';
    }
  }

  // 2. Dissolve / Expand yellow impact rings (ALWAYS animated until completely dissolved)
  for (let i = 0; i < impactRipples.length; i++) {
    const r = impactRipples[i];
    r.radius += 1.4;
    r.alpha -= 0.025; // Smoothly fades out to 0
  }
  impactRipples = impactRipples.filter((r) => r.alpha > 0.01);

  // 3. Dissolve / Fade trail points
  for (let i = 0; i < dynamicTrail.length; i++) {
    dynamicTrail[i].alpha -= 0.007;
  }
  dynamicTrail = dynamicTrail.filter((p) => p.alpha > 0.01);

  // 4. Dissolve particles mist
  for (let i = 0; i < dissolveParticles.length; i++) {
    const dp = dissolveParticles[i];
    dp.x += dp.vx * 0.035;
    dp.y += dp.vy * 0.035;
    dp.alpha -= 0.018;
  }
  dissolveParticles = dissolveParticles.filter((dp) => dp.alpha > 0.01);
}

// Drawing routines
function drawSimulation() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvasWrap.clientWidth;
  const h = canvasWrap.clientHeight;

  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }

  ctx.save();
  ctx.scale(dpr, dpr);

  const padLeft = 60;
  const padRight = 40;
  const padTop = 50;
  const padBottom = 65;
  const plotWidth = w - padLeft - padRight;
  const plotHeight = h - padTop - padBottom;

  const theoretical = getTheoreticalStats();
  const maxX = Math.max(theoretical.range * 1.35, simState.x * 1.2, options.mode === '1d' ? 10 : 35);
  const maxY = Math.max(theoretical.maxHeight * 1.3, simState.y * 1.25, options.h0 * 1.25, 20);

  const scale = Math.min(plotWidth / maxX, plotHeight / maxY);

  const toScreenX = (xm) => padLeft + xm * scale;
  const toScreenY = (ym) => padTop + plotHeight - ym * scale;

  // 1. Pure Solid Black Background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  // 2. High-precision Subtle Grid
  const tickStep = (maxVal) => {
    if (maxVal <= 15) return 2;
    if (maxVal <= 40) return 5;
    if (maxVal <= 100) return 10;
    if (maxVal <= 250) return 25;
    return 50;
  };

  const xStep = tickStep(maxX);
  const yStep = tickStep(maxY);

  // Vertical grid lines
  for (let xm = 0; xm <= maxX; xm += xStep) {
    const sx = toScreenX(xm);
    if (sx > padLeft + plotWidth) break;
    ctx.strokeStyle = xm === 0 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, padTop);
    ctx.lineTo(sx, padTop + plotHeight);
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${xm}m`, sx, padTop + plotHeight + 16);
  }

  // Horizontal grid lines
  for (let ym = 0; ym <= maxY; ym += yStep) {
    const sy = toScreenY(ym);
    if (sy < padTop) break;
    ctx.strokeStyle = ym === 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, sy);
    ctx.lineTo(padLeft + plotWidth, sy);
    ctx.stroke();

    ctx.fillStyle = ym === 0 ? 'rgba(74, 222, 128, 0.75)' : 'rgba(148, 163, 184, 0.5)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${ym}m`, padLeft - 8, sy + 3);
  }

  // Ground Baseline
  const groundY = toScreenY(0);
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padLeft, groundY);
  ctx.lineTo(padLeft + plotWidth, groundY);
  ctx.stroke();

  // Subtle ground glow
  const groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
  groundGrad.addColorStop(0, 'rgba(34, 197, 94, 0.08)');
  groundGrad.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(padLeft, groundY, plotWidth, h - groundY);

  // Platform for initial height
  if (options.h0 > 0) {
    const px = toScreenX(0);
    const py = toScreenY(options.h0);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
    ctx.fillRect(px - 14, py, 18, groundY - py);
    ctx.strokeRect(px - 14, py, 18, groundY - py);
  }

  // 3. Theoretical Initial Arc (Dashed Line)
  if (displayOptions.showPrediction) {
    const theoreticalCurve = getTheoreticalCurve();
    if (theoreticalCurve.length > 1) {
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      theoreticalCurve.forEach((pt, idx) => {
        const sx = toScreenX(pt.x);
        const sy = toScreenY(pt.y);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 4. Fading Particle / Ribbon Trail
  if (displayOptions.showTrail && dynamicTrail.length > 1) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < dynamicTrail.length; i++) {
      const p0 = dynamicTrail[i - 1];
      const p1 = dynamicTrail[i];

      const sx0 = toScreenX(p0.x);
      const sy0 = toScreenY(p0.y);
      const sx1 = toScreenX(p1.x);
      const sy1 = toScreenY(p1.y);

      const alpha = Math.max(0, Math.min(1, p1.alpha));
      const trailWidth = 1.2 + alpha * 3.5;

      ctx.lineWidth = trailWidth;
      ctx.strokeStyle = `rgba(74, 222, 128, ${alpha * 0.75})`;
      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      ctx.lineTo(sx1, sy1);
      ctx.stroke();
    }
  }

  // 5. Impact Shockwave Ripples (Expanding & Dissolving Smoothly)
  impactRipples.forEach((ripple) => {
    const rx = toScreenX(ripple.x);
    const ry = groundY;

    ctx.save();
    ctx.beginPath();
    ctx.arc(rx, ry, ripple.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(234, 179, 8, ${Math.max(0, ripple.alpha * 0.8)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  });

  // 6. PERMANENT BOUNCE COORDINATE MARKERS & LABELS
  // These stay visible until the user explicitly resets the simulation
  bounceMarkers.forEach((bm, index) => {
    const bx = toScreenX(bm.x);
    const by = groundY;

    ctx.save();

    // Vertical dashed marker stem
    const stalkHeight = 24 + (index % 3) * 16;
    const tagY = by - stalkHeight;

    ctx.strokeStyle = 'rgba(34, 197, 94, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, tagY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Contact point pin head (diamond)
    ctx.fillStyle = '#22c55e';
    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(bx, by - 4);
    ctx.lineTo(bx + 4, by);
    ctx.lineTo(bx, by + 4);
    ctx.lineTo(bx - 4, by);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Coordinate Badge
    const labelText = `B${bm.id}: (${bm.x}m, 0m)`;
    ctx.font = 'bold 9px ui-monospace, monospace';
    const textWidth = ctx.measureText(labelText).width;
    const badgePad = 5;
    const badgeW = textWidth + badgePad * 2;
    const badgeH = 16;
    const badgeX = bx - badgeW / 2;

    // Badge background
    ctx.fillStyle = 'rgba(10, 15, 12, 0.92)';
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(badgeX, tagY - badgeH, badgeW, badgeH, 4);
    ctx.fill();
    ctx.stroke();

    // Badge text
    ctx.fillStyle = '#86efac';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, bx, tagY - badgeH / 2);

    ctx.restore();
  });

  // 7. Dissolving Particle Mist (Rising and evaporating into black background)
  for (let i = 0; i < dissolveParticles.length; i++) {
    const dp = dissolveParticles[i];
    const px = toScreenX(dp.x);
    const py = toScreenY(dp.y);

    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, dp.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(134, 239, 172, ${Math.max(0, dp.alpha)})`;
    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }

  // 8. Launcher Cannon
  const launcherX = toScreenX(0);
  const launcherY = toScreenY(options.h0);
  const barrelAngle = options.mode === '1d' ? -Math.PI / 2 : (-options.angle * Math.PI) / 180;

  ctx.save();
  ctx.translate(launcherX, launcherY);
  ctx.rotate(barrelAngle);
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.5;
  ctx.fillRect(0, -4.5, 22, 9);
  ctx.strokeRect(0, -4.5, 22, 9);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(launcherX, launcherY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#16a34a';
  ctx.fill();
  ctx.strokeStyle = '#4ade80';
  ctx.stroke();

  // 9. Luminous Green Ball (Smooth Dissolving and Blending Out)
  if (!isDissolved) {
    const ballX = toScreenX(simState.x);
    const ballY = toScreenY(simState.y);
    const radius = 7;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, dissolveAlpha));

    const ballGrad = ctx.createRadialGradient(
      ballX - 1.5,
      ballY - 1.5,
      1,
      ballX,
      ballY,
      radius
    );
    ballGrad.addColorStop(0, '#f0fdf4');
    ballGrad.addColorStop(0.35, '#86efac');
    ballGrad.addColorStop(0.8, '#22c55e');
    ballGrad.addColorStop(1, '#15803d');

    ctx.shadowColor = '#4ade80';
    ctx.shadowBlur = 14 * dissolveAlpha;
    ctx.beginPath();
    ctx.arc(ballX, ballY, radius, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad;
    ctx.fill();
    ctx.restore();
  }

  // 10. Velocity Vector Indicator
  if (displayOptions.showVectors && !simState.isLanded && !isDissolving && !isDissolved && simState.speed > 0.2) {
    const ballX = toScreenX(simState.x);
    const ballY = toScreenY(simState.y);
    const vScale = 1.1;
    const endX = ballX + simState.vx * vScale;
    const endY = ballY - simState.vy * vScale;

    ctx.strokeStyle = '#4ade80';
    ctx.fillStyle = '#4ade80';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(ballX, ballY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    const arrowAngle = Math.atan2(endY - ballY, endX - ballX);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 6 * Math.cos(arrowAngle - Math.PI / 6), endY - 6 * Math.sin(arrowAngle - Math.PI / 6));
    ctx.lineTo(endX - 6 * Math.cos(arrowAngle + Math.PI / 6), endY - 6 * Math.sin(arrowAngle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#86efac';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`${simState.speed.toFixed(1)} m/s`, endX + 6, endY);
  }

  // 11. Clean Minimal HUD (Top Left inside canvas)
  ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.roundRect(padLeft + 10, padTop + 10, 220, 72, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isDissolved ? '#94a3b8' : '#4ade80';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(isDissolved ? 'SIMULATION SETTLED (DISSOLVED)' : 'LIVE TELEMETRY', padLeft + 18, padTop + 24);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(`Time: ${simState.t.toFixed(2)}s | Bounces: ${simState.bounces}`, padLeft + 18, padTop + 40);
  ctx.fillText(`Pos: (${simState.x.toFixed(1)}m, ${simState.y.toFixed(1)}m)`, padLeft + 18, padTop + 54);
  const currentE = 0.5 * simState.speed * simState.speed + options.g * simState.y;
  ctx.fillText(`Energy: ${currentE.toFixed(1)} J (${initialEnergy > 0 ? ((currentE / initialEnergy) * 100).toFixed(0) : 0}%)`, padLeft + 18, padTop + 68);

  ctx.restore();
}

// Mini Analytics Trajectory Chart
function drawAnalytics() {
  const dpr = window.devicePixelRatio || 1;
  const w = analyticsCanvas.clientWidth;
  const h = analyticsCanvas.clientHeight;

  if (analyticsCanvas.width !== w * dpr || analyticsCanvas.height !== h * dpr) {
    analyticsCanvas.width = w * dpr;
    analyticsCanvas.height = h * dpr;
  }

  analyticsCtx.save();
  analyticsCtx.scale(dpr, dpr);
  analyticsCtx.clearRect(0, 0, w, h);

  const theoretical = getTheoreticalStats();
  const maxX = Math.max(theoretical.range * 1.3, simState.range, 10);
  const maxY = Math.max(theoretical.maxHeight * 1.25, simState.maxHeight, 10);

  const pad = 20;
  const pw = w - pad * 2;
  const ph = h - pad * 2;

  const toX = (xm) => pad + (xm / maxX) * pw;
  const toY = (ym) => pad + ph - (ym / maxY) * ph;

  // Grid box
  analyticsCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  analyticsCtx.strokeRect(pad, pad, pw, ph);

  // Theoretical arc
  const theoreticalCurve = getTheoreticalCurve();
  if (theoreticalCurve.length > 1) {
    analyticsCtx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    analyticsCtx.setLineDash([3, 3]);
    analyticsCtx.beginPath();
    theoreticalCurve.forEach((pt, i) => {
      const px = toX(pt.x);
      const py = toY(pt.y);
      if (i === 0) analyticsCtx.moveTo(px, py);
      else analyticsCtx.lineTo(px, py);
    });
    analyticsCtx.stroke();
    analyticsCtx.setLineDash([]);
  }

  // Trajectory curve
  if (fullTrajectory.length > 1) {
    analyticsCtx.strokeStyle = '#22c55e';
    analyticsCtx.lineWidth = 1.5;
    analyticsCtx.beginPath();
    fullTrajectory.forEach((pt, i) => {
      const px = toX(pt.x);
      const py = toY(pt.y);
      if (i === 0) analyticsCtx.moveTo(px, py);
      else analyticsCtx.lineTo(px, py);
    });
    analyticsCtx.stroke();
  }

  analyticsCtx.restore();
}

// UI State Updater
function updateUI() {
  statMaxH.textContent = simState.maxHeight.toFixed(2);
  statRange.textContent = simState.range.toFixed(2);
  statBounces.textContent = simState.bounces;
  statTime.textContent = simState.t.toFixed(2);
  statSpeed.textContent = simState.speed.toFixed(1);

  const theoretical = getTheoreticalStats();
  statIdealH.textContent = isFinite(theoretical.maxHeight) ? theoretical.maxHeight.toFixed(1) : '∞';
  statIdealT.textContent = isFinite(theoretical.flightTime) ? theoretical.flightTime.toFixed(1) : '∞';
  statV0.textContent = options.v0.toFixed(1);

  // Update Graph Frame Bounce Elements
  if (badgeBounceCount) {
    badgeBounceCount.textContent = simState.bounces;
  }
  if (badgeBounceStatus) {
    if (isDissolved) {
      badgeBounceStatus.textContent = `Dissolved (${dissolveReason || 'Settled'}) • Total: ${simState.bounces}`;
      badgeBounceStatus.style.color = '#eab308';
    } else if (isDissolving) {
      badgeBounceStatus.textContent = `Dissolving (${dissolveReason}) • ${simState.bounces} bounces`;
      badgeBounceStatus.style.color = '#fde047';
    } else if (isRunning) {
      badgeBounceStatus.textContent = `Flight active • ${simState.bounces} bounces recorded`;
      badgeBounceStatus.style.color = '#86efac';
    } else if (simState.t > 0) {
      badgeBounceStatus.textContent = `Paused • ${simState.bounces} bounces recorded`;
      badgeBounceStatus.style.color = '#94a3b8';
    } else {
      badgeBounceStatus.textContent = `Ready to launch`;
      badgeBounceStatus.style.color = '#64748b';
    }
  }

  // Mechanical Energy
  const m = 1;
  const ke = 0.5 * m * simState.speed * simState.speed;
  const pe = m * options.g * simState.y;
  const tot = ke + pe;

  totalEnergy.textContent = `${tot.toFixed(1)} J`;
  keVal.textContent = ke.toFixed(1);
  peVal.textContent = pe.toFixed(1);

  const kePct = tot > 0 ? (ke / tot) * 100 : 0;
  const pePct = tot > 0 ? (pe / tot) * 100 : 0;
  keBar.style.width = `${kePct}%`;
  peBar.style.width = `${pePct}%`;
}

// Main Frame Loop (runs 60fps continuously)
let lastFrameTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  // 1. Advance physics if running
  if (isRunning) {
    stepPhysics(dt);
  }

  // 2. Always advance visual effects (so ripples & dissolve mist NEVER freeze)
  updateVisualEffects();

  // 3. Update UI text & draw canvases
  updateUI();
  drawSimulation();
  drawAnalytics();

  animId = requestAnimationFrame(loop);
}

function launchSim() {
  initSimState();
  isRunning = true;
  lastFrameTime = performance.now();
  launchBtn.classList.remove('paused');
  launchText.textContent = 'PAUSE';
  launchIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
}

function resumeSim() {
  if (isDissolved) {
    initSimState();
  }
  isRunning = true;
  lastFrameTime = performance.now();
  launchBtn.classList.remove('paused');
  launchText.textContent = 'PAUSE';
  launchIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
}

function pauseSim() {
  isRunning = false;
  launchBtn.classList.add('paused');
  launchText.textContent = isDissolved ? 'LAUNCH' : 'RESUME';
  launchIcon.innerHTML = '<polygon points="5,3 19,12 5,21"/>';
}

// Event Listeners
launchBtn.addEventListener('click', () => {
  if (isRunning) {
    pauseSim();
  } else if (simState.t > 0 && !isDissolved) {
    resumeSim();
  } else {
    launchSim();
  }
});

// Explicit Reset: clears bounce coordinates and resets simulation
resetBtn.addEventListener('click', () => {
  resetSimulation();
});

mode2dBtn.addEventListener('click', () => {
  options.mode = '2d';
  mode2dBtn.classList.add('active');
  mode1dBtn.classList.remove('active');
  angleGroup.style.display = 'flex';
  resetSimulation();
});

mode1dBtn.addEventListener('click', () => {
  options.mode = '1d';
  mode1dBtn.classList.add('active');
  mode2dBtn.classList.remove('active');
  angleGroup.style.display = 'none';
  resetSimulation();
});

v0Slider.addEventListener('input', (e) => {
  options.v0 = parseFloat(e.target.value);
  v0Val.textContent = `${options.v0.toFixed(1)} m/s`;
  if (!isRunning) initSimState();
});

angleSlider.addEventListener('input', (e) => {
  options.angle = parseFloat(e.target.value);
  angleVal.textContent = `${options.angle}°`;
  if (!isRunning) initSimState();
});

h0Slider.addEventListener('input', (e) => {
  options.h0 = parseFloat(e.target.value);
  h0Val.textContent = `${options.h0.toFixed(1)} m`;
  if (!isRunning) initSimState();
});

elasticitySlider.addEventListener('input', (e) => {
  options.elasticity = parseFloat(e.target.value);
  updateElasticityLabel(options.elasticity);
});

function updateElasticityLabel(val) {
  let label = `${val.toFixed(2)}`;
  if (val >= 0.9) label += ' (Superball)';
  else if (val >= 0.7) label += ' (Rubber)';
  else if (val >= 0.4) label += ' (Wood/Hard)';
  else label += ' (Clay/Damped)';
  elasticityVal.textContent = label;

  document.querySelectorAll('[data-e]').forEach((b) => {
    b.classList.toggle('active', Math.abs(parseFloat(b.dataset.e) - val) < 0.04);
  });
}

document.querySelectorAll('[data-e]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const eNum = parseFloat(btn.dataset.e);
    options.elasticity = eNum;
    elasticitySlider.value = eNum;
    updateElasticityLabel(eNum);
  });
});

gSlider.addEventListener('input', (e) => {
  options.g = parseFloat(e.target.value);
  gVal.textContent = `${options.g.toFixed(2)} m/s²`;
  document.querySelectorAll('[data-g]').forEach((b) => {
    b.classList.toggle('active', Math.abs(parseFloat(b.dataset.g) - options.g) < 0.05);
  });
  if (!isRunning) initSimState();
});

document.querySelectorAll('[data-g]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const gValNum = parseFloat(btn.dataset.g);
    options.g = gValNum;
    gSlider.value = gValNum;
    gVal.textContent = `${gValNum.toFixed(2)} m/s²`;
    document.querySelectorAll('[data-g]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    if (!isRunning) initSimState();
  });
});

dragSlider.addEventListener('input', (e) => {
  options.airCoeff = parseFloat(e.target.value);
  dragVal.textContent = options.airCoeff === 0 ? 'Vacuum (0.00)' : `${options.airCoeff.toFixed(3)} kg/s`;
  if (!isRunning) initSimState();
});

showPredictionCheck.addEventListener('change', (e) => {
  displayOptions.showPrediction = e.target.checked;
  drawSimulation();
});

showTrailCheck.addEventListener('change', (e) => {
  displayOptions.showTrail = e.target.checked;
  drawSimulation();
});

showVectorsCheck.addEventListener('change', (e) => {
  displayOptions.showVectors = e.target.checked;
  drawSimulation();
});

exportBtn.addEventListener('click', async () => {
  if (fullTrajectory.length === 0) return;
  let csv = 'time_s,x_m,y_m,vx_mps,vy_mps,speed_mps\n';
  fullTrajectory.forEach((pt) => {
    csv += `${pt.t.toFixed(3)},${pt.x.toFixed(3)},${pt.y.toFixed(3)},${pt.vx.toFixed(3)},${pt.vy.toFixed(3)},${pt.speed.toFixed(3)}\n`;
  });

  if (window.electronAPI && window.electronAPI.exportCSV) {
    const res = await window.electronAPI.exportCSV(csv);
    if (res.success) {
      alert(`Data saved to: ${res.filePath}`);
    }
  } else {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'projectile_trajectory.csv';
    a.click();
  }
});

window.addEventListener('resize', () => {
  drawSimulation();
  drawAnalytics();
});

// Start engine
initSimState();
animId = requestAnimationFrame(loop);
