/* ════════════════════════════════════════════════════════════════════════════
   Snake Game  –  Vanilla JS
   • Full start screen with instructions
   • Difficulty levels  (Easy / Medium / Hard)
   • Web Audio API sound effects (no external files)
   • Per-difficulty localStorage high-score persistence
   • Mobile D-pad support
   ════════════════════════════════════════════════════════════════════════════ */

'use strict';

/* ── Canvas setup ─────────────────────────────────────────────────────────── */
const canvas  = document.getElementById('game-canvas');
const ctx     = canvas.getContext('2d');
const TILE    = 20;
const COLS    = canvas.width  / TILE;   // 20
const ROWS    = canvas.height / TILE;   // 20

/* ── UI refs ──────────────────────────────────────────────────────────────── */
const scoreEl        = document.getElementById('score');
const highScoreEl    = document.getElementById('high-score');
const diffBadge      = document.getElementById('difficulty-badge');
const canvasWrapper  = document.getElementById('canvas-wrapper');

// Start screen
const startScreen    = document.getElementById('start-screen');
const ssStartBtn     = document.getElementById('ss-start-btn');
const ssDiffDescEl   = document.getElementById('ss-diff-desc');
const ssDiffPills    = document.querySelectorAll('#ss-diff-pills .diff-pill');

// Game UI  (was .container, now .game-shell)
const gameUI         = document.getElementById('game-ui');

// In-canvas overlay (game-over)
const overlay        = document.getElementById('overlay');
const overlayIcon    = document.getElementById('overlay-icon');
const overlayTitle   = document.getElementById('overlay-title');
const overlayMsg     = document.getElementById('overlay-message');
const overlaySub     = document.getElementById('overlay-sub');
const diffSelector   = document.getElementById('diff-selector');
const diffDescEl     = document.getElementById('diff-desc');
const startBtn       = document.getElementById('start-btn');        // "Play Again"
const ovDiffPills    = document.querySelectorAll('#ov-diff-pills .diff-pill');

/* ══════════════════════════════════════════════════════════════════════════
   DIFFICULTY CONFIGURATION
   Each level has:
     speedInit  – starting tick interval (ms); lower = faster
     speedMin   – fastest the snake ever gets (ms)
     speedStep  – ms reduction per milestone
     milestone  – every N points triggers speed-up & fanfare
     wallWrap   – true → snake wraps through walls instead of dying
     scoreMulti – points multiplier (applied as a display label/badge)
     label      – display name
     desc       – description shown on the selector
     color      – accent hex used on the snake head & canvas border
   ══════════════════════════════════════════════════════════════════════════ */
const DIFFICULTIES = {
  easy: {
    label:      'Easy',
    desc:       'Walls wrap · slow start · gentle acceleration',
    speedInit:  160,
    speedMin:   90,
    speedStep:  5,
    milestone:  5,
    wallWrap:   true,
    scoreMulti: 1,
    color:      '#4ade80',
  },
  medium: {
    label:      'Medium',
    desc:       'No wall wrap · moderate speed · faster ramp-up',
    speedInit:  120,
    speedMin:   60,
    speedStep:  8,
    milestone:  4,
    wallWrap:   false,
    scoreMulti: 1,
    color:      '#f59e0b',
  },
  hard: {
    label:      'Hard',
    desc:       'No wall wrap · fast start · rapid acceleration',
    speedInit:  80,
    speedMin:   40,
    speedStep:  10,
    milestone:  3,
    wallWrap:   false,
    scoreMulti: 1,
    color:      '#f43f5e',
  },
};

/* ── Active difficulty ────────────────────────────────────────────────────── */
let currentDiff = 'easy';

function getDiff() { return DIFFICULTIES[currentDiff]; }

/* ── High scores (one per difficulty) ────────────────────────────────────── */
const LS_PREFIX = 'snakeHS_';

function loadHighScore(diff) {
  return parseInt(localStorage.getItem(LS_PREFIX + diff) || '0', 10);
}

function saveHighScore(diff, s) {
  const prev = loadHighScore(diff);
  if (s > prev) {
    localStorage.setItem(LS_PREFIX + diff, s);
    refreshHighScoreUI(diff);
    return true;
  }
  return false;
}

function refreshHighScoreUI(diff) {
  highScoreEl.textContent = loadHighScore(diff);

  /* Flash the best-score number when updated */
  highScoreEl.classList.remove('best-flash');
  void highScoreEl.offsetWidth;
  highScoreEl.classList.add('best-flash');
  highScoreEl.addEventListener('animationend', () => highScoreEl.classList.remove('best-flash'), { once: true });
}

/* ── Apply difficulty to UI chrome ───────────────────────────────────────── */
function applyDiffUI(diff) {
  const d = DIFFICULTIES[diff];

  /* badge */
  diffBadge.textContent = d.label;
  diffBadge.className   = `diff-badge diff-${diff}`;

  /* canvas wrapper border tint */
  canvasWrapper.className = `canvas-wrapper diff-${diff}`;

  /* CSS custom property for snake colour (wordmark SVG + future use) */
  document.documentElement.style.setProperty('--snake-color', d.color);

  /* aria-pressed on pill groups */
  [ssDiffPills, ovDiffPills].forEach(group => {
    group.forEach(p => p.setAttribute('aria-pressed', String(p.dataset.diff === diff)));
  });

  refreshHighScoreUI(diff);
}

/* ── Sync both pill groups to a chosen difficulty ─────────────────────────── */
function syncPills(diff) {
  [ssDiffPills, ovDiffPills].forEach(group => {
    group.forEach(p => {
      p.classList.toggle('active', p.dataset.diff === diff);
    });
  });
}

/* ── Difficulty pill selection — start screen ────────────────────────────── */
ssDiffPills.forEach(pill => {
  pill.addEventListener('click', () => {
    currentDiff = pill.dataset.diff;
    syncPills(currentDiff);
    ssDiffDescEl.textContent = getDiff().desc;
    applyDiffUI(currentDiff);
  });
});

/* ── Difficulty pill selection — game-over overlay ───────────────────────── */
ovDiffPills.forEach(pill => {
  pill.addEventListener('click', () => {
    if (running) return;
    currentDiff = pill.dataset.diff;
    syncPills(currentDiff);
    diffDescEl.textContent = getDiff().desc;
    applyDiffUI(currentDiff);
  });
});

/* ── Web Audio engine ─────────────────────────────────────────────────────── */
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freqs, dur = 0.1, type = 'square', vol = 0.18) {
  try {
    const ac      = getAudioCtx();
    const gain    = ac.createGain();
    const osc     = ac.createOscillator();
    const stepDur = dur / freqs.length;

    osc.type = type;
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ac.currentTime + 0.01);
    freqs.forEach((f, i) => osc.frequency.setValueAtTime(f, ac.currentTime + i * stepDur));
    gain.gain.setValueAtTime(vol, ac.currentTime + dur - 0.03);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + dur);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + dur + 0.05);
  } catch (_) { /* audio unavailable — silent fail */ }
}

const Sounds = {
  eat()       { playTone([440, 554, 660], 0.18, 'sine', 0.2); },
  milestone() { playTone([523, 659, 784, 1047], 0.35, 'sine', 0.22); },
  turn()      { playTone([200], 0.04, 'square', 0.06); },
  gameOver()  { playTone([392, 349, 311, 277, 220], 0.6, 'sawtooth', 0.18); },
  newRecord() { playTone([523, 659, 784, 1047, 1319], 0.6, 'sine', 0.22); },
  start()     { playTone([330, 440, 550], 0.25, 'triangle', 0.15); },
  pause()     { playTone([440, 330], 0.15, 'sine', 0.1); },
  resume()    { playTone([330, 440], 0.15, 'sine', 0.1); },
  /** Harder difficulty start – tenser tone */
  startHard() { playTone([220, 277, 330, 415], 0.3, 'sawtooth', 0.14); },
};

/* ── Game state ───────────────────────────────────────────────────────────── */
let snake, dir, nextDir, food, score, speed;
let running = false;
let paused  = false;
let gameLoop = null;

/* ── Colour scheme (updated per difficulty) ───────────────────────────────── */
const COL = {
  bg:       '#08090f',
  grid:     'rgba(255,255,255,.028)',
  snakeEye: '#08090f',
  food:     '#f87171',
  foodCore: '#fca5a5',
  foodGlow: 'rgba(248,113,113,.55)',
  snakeHead: '#4ade80',
  snakeBody: '#22c55e',
};

function updateColours(diff) {
  const base = DIFFICULTIES[diff].color;
  COL.snakeHead = base;
  const r = parseInt(base.slice(1,3), 16);
  const g = parseInt(base.slice(3,5), 16);
  const b = parseInt(base.slice(5,7), 16);
  COL.snakeBody = `rgb(${Math.round(r*.7)},${Math.round(g*.7)},${Math.round(b*.7)})`;
}

/* ── Initialise / reset ───────────────────────────────────────────────────── */
function initGame() {
  const d = getDiff();
  updateColours(currentDiff);
  snake   = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  dir     = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score   = 0;
  speed   = d.speedInit;
  scoreEl.textContent = 0;
  placeFood();
}

/* ── Food placement ───────────────────────────────────────────────────────── */
function placeFood() {
  let pos;
  do {
    pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (snake.some(s => s.x === pos.x && s.y === pos.y));
  food = pos;
}

/* ── Core game tick ───────────────────────────────────────────────────────── */
function tick() {
  const d = getDiff();
  dir = { ...nextDir };

  let nx = snake[0].x + dir.x;
  let ny = snake[0].y + dir.y;

  if (d.wallWrap) {
    /* Wrap-around — Easy mode */
    nx = (nx + COLS) % COLS;
    ny = (ny + ROWS) % ROWS;
  } else {
    /* Wall = death */
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) { endGame(); return; }
  }

  const head = { x: nx, y: ny };

  /* Self collision */
  if (snake.some(s => s.x === head.x && s.y === head.y)) { endGame(); return; }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score++;
    scoreEl.textContent = score;
    animateScorePop();
    placeFood();

    if (score % d.milestone === 0) {
      speed = Math.max(d.speedMin, speed - d.speedStep);
      restartLoop();
      Sounds.milestone();
    } else {
      Sounds.eat();
    }
  } else {
    snake.pop();
  }

  draw();
}

/* ── Loop management ──────────────────────────────────────────────────────── */
function restartLoop() {
  clearInterval(gameLoop);
  gameLoop = setInterval(tick, speed);
}

/* ── Game over ────────────────────────────────────────────────────────────── */
function endGame() {
  clearInterval(gameLoop);
  running = false;

  const isNewRecord = saveHighScore(currentDiff, score);

  if (isNewRecord) {
    Sounds.newRecord();
    overlayIcon.textContent  = '🏆';
    overlayTitle.textContent = 'New Record!';
    overlaySub.textContent   = `Best on ${getDiff().label}: ${loadHighScore(currentDiff)}`;
  } else {
    Sounds.gameOver();
    overlayIcon.textContent  = '💀';
    overlayTitle.textContent = 'Game Over';
    const hs = loadHighScore(currentDiff);
    overlaySub.textContent   = hs > 0 ? `Best on ${getDiff().label}: ${hs}` : '';
  }

  overlayMsg.textContent = `Score: ${score}`;
  startBtn.textContent   = 'Play Again';

  /* Re-show difficulty selector so player can switch before replaying */
  diffSelector.style.display = '';
  /* Sync overlay pills to current diff */
  syncPills(currentDiff);
  diffDescEl.textContent = getDiff().desc;

  showOverlay();
  draw(true);
}

/* ── Pause / resume ───────────────────────────────────────────────────────── */
function togglePause() {
  if (!running) return;
  if (paused) {
    paused = false;
    restartLoop();
    Sounds.resume();
  } else {
    paused = true;
    clearInterval(gameLoop);
    Sounds.pause();
    drawPausedText();
  }
}

/* ── Start game ───────────────────────────────────────────────────────────── */
function startGame() {
  applyDiffUI(currentDiff);
  syncPills(currentDiff);
  initGame();
  running = true;
  paused  = false;

  /* Hide difficulty picker inside game-over overlay once game begins */
  diffSelector.style.display = 'none';

  hideOverlay();
  currentDiff === 'hard' ? Sounds.startHard() : Sounds.start();
  restartLoop();
  draw();
}

/* ── Dismiss start screen, then start game ───────────────────────────────── */
function launchFromStartScreen() {
  startScreen.classList.add('ss-exit');
  startScreen.addEventListener('animationend', () => {
    startScreen.remove();
    /* show game UI and enable flex centering on body */
    gameUI.classList.add('visible');
    document.body.classList.add('game-active');
    startGame();
  }, { once: true });
}

/* ── Overlay helpers ──────────────────────────────────────────────────────── */
function showOverlay() { overlay.classList.remove('hidden'); }
function hideOverlay() { overlay.classList.add('hidden'); }

/* ── Score pop ────────────────────────────────────────────────────────────── */
function animateScorePop() {
  scoreEl.classList.remove('score-pop');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('score-pop');
  scoreEl.addEventListener('animationend', () => scoreEl.classList.remove('score-pop'), { once: true });
}

/* ══════════════════════════════════════════════════════════════════════════
   DRAWING
   ══════════════════════════════════════════════════════════════════════════ */
function draw(died = false) {
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawFood();
  drawSnake(died);
}

/* Subtle dot grid */
function drawGrid() {
  ctx.fillStyle = COL.grid;
  for (let c = 1; c < COLS; c++) {
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.arc(c * TILE, r * TILE, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* Food with layered glow + inner highlight */
function drawFood() {
  const cx = food.x * TILE + TILE / 2;
  const cy = food.y * TILE + TILE / 2;
  const radius = TILE / 2 - 2.5;

  /* outer glow halo */
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, TILE * 1.1);
  halo.addColorStop(0, COL.foodGlow);
  halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, TILE * 1.1, 0, Math.PI * 2);
  ctx.fill();

  /* body */
  ctx.fillStyle = COL.food;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  /* inner shine */
  const shine = ctx.createRadialGradient(cx - radius * .28, cy - radius * .28, 0, cx, cy, radius);
  shine.addColorStop(0, 'rgba(255,255,255,.45)');
  shine.addColorStop(.45, 'rgba(255,255,255,.08)');
  shine.addColorStop(1, 'transparent');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

/* Snake with per-segment gradient fade and glow on head */
function drawSnake(died = false) {
  const len = snake.length;

  snake.forEach((seg, i) => {
    const isHead = i === 0;
    const x = seg.x * TILE, y = seg.y * TILE;
    const pad = 1.5;

    /* colour: head full, tail ~40% opacity blend toward body colour */
    const t = i / Math.max(len - 1, 1);        // 0 = head, 1 = tail
    const alpha = 1 - t * 0.55;                 // fade tail slightly

    if (isHead) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = died ? '#f87171' : COL.snakeHead;

      /* head glow */
      if (!died) {
        const headGlow = ctx.createRadialGradient(
          x + TILE/2, y + TILE/2, 0,
          x + TILE/2, y + TILE/2, TILE * 1.2
        );
        const r = parseInt(COL.snakeHead.slice(1,3)||'4a',16);
        const g = parseInt(COL.snakeHead.slice(3,5)||'de',16);
        const b = parseInt(COL.snakeHead.slice(5,7)||'80',16);
        headGlow.addColorStop(0, `rgba(${r},${g},${b},.22)`);
        headGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = headGlow;
        ctx.beginPath();
        ctx.arc(x + TILE/2, y + TILE/2, TILE * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COL.snakeHead;
      }
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COL.snakeBody;
    }

    roundRect(ctx, x + pad, y + pad, TILE - pad * 2, TILE - pad * 2, isHead ? 6 : 4);
    ctx.fill();

    /* inner segment shine (top-left highlight) */
    if (!died) {
      ctx.globalAlpha = isHead ? .18 : .08 * alpha;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, x + pad, y + pad, (TILE - pad * 2) * .55, (TILE - pad * 2) * .45, 3);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    if (isHead) drawEyes(seg, died);
  });
}

function drawEyes(head, died = false) {
  const cx = head.x * TILE + TILE / 2;
  const cy = head.y * TILE + TILE / 2;
  const eyeR  = 2.4;
  const pupilR = 1.3;
  const offset = 3.8;

  let positions;
  if      (dir.x ===  1) positions = [[cx+3.5, cy-offset],[cx+3.5, cy+offset]];
  else if (dir.x === -1) positions = [[cx-3.5, cy-offset],[cx-3.5, cy+offset]];
  else if (dir.y === -1) positions = [[cx-offset, cy-3.5],[cx+offset, cy-3.5]];
  else                   positions = [[cx-offset, cy+3.5],[cx+offset, cy+3.5]];

  positions.forEach(([ex, ey]) => {
    /* white of eye */
    ctx.fillStyle = died ? '#fca5a5' : 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2); ctx.fill();
    /* pupil */
    ctx.fillStyle = COL.snakeEye;
    ctx.beginPath(); ctx.arc(ex + .5, ey + .5, pupilR, 0, Math.PI * 2); ctx.fill();
  });
}

/* Paused overlay text */
function drawPausedText() {
  ctx.save();
  ctx.fillStyle = 'rgba(7,8,15,.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  /* Card */
  const cw = 180, ch = 70, cx = canvas.width/2, cy = canvas.height/2;
  ctx.fillStyle = 'rgba(26,27,41,.92)';
  roundRect(ctx, cx - cw/2, cy - ch/2, cw, ch, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, cx - cw/2, cy - ch/2, cw, ch, 14);
  ctx.stroke();

  ctx.fillStyle = '#f0f1f8';
  ctx.font = "700 22px 'Space Grotesk', system-ui, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED', cx, cy - 8);
  ctx.fillStyle = 'rgba(157,163,192,.6)';
  ctx.font = "500 12px 'Inter', system-ui, sans-serif";
  ctx.fillText('Press P to resume', cx, cy + 14);

  ctx.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x+r, y);
  c.lineTo(x+w-r, y);  c.quadraticCurveTo(x+w, y,   x+w, y+r);
  c.lineTo(x+w, y+h-r);c.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  c.lineTo(x+r, y+h);  c.quadraticCurveTo(x,   y+h, x,   y+h-r);
  c.lineTo(x, y+r);    c.quadraticCurveTo(x,   y,   x+r, y);
  c.closePath();
}

/* ══════════════════════════════════════════════════════════════════════════
   INPUT HANDLING
   ══════════════════════════════════════════════════════════════════════════ */
const KEY_MAP = {
  ArrowUp:    { x: 0, y:-1 }, w: { x: 0, y:-1 }, W: { x: 0, y:-1 },
  ArrowDown:  { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
  ArrowLeft:  { x:-1, y: 0 }, a: { x:-1, y: 0 }, A: { x:-1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
};

document.addEventListener('keydown', e => {
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { togglePause(); return; }
  if (!running || paused) return;
  const newDir = KEY_MAP[e.key];
  if (!newDir) return;
  if (newDir.x === -dir.x && newDir.y === -dir.y) return;
  if (newDir.x !== nextDir.x || newDir.y !== nextDir.y) { nextDir = newDir; Sounds.turn(); }
  if (e.key.startsWith('Arrow')) e.preventDefault();
});

/* Mobile D-pad */
function attachDpad(btnId, direction) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  function press(e) {
    e.preventDefault();
    if (!running || paused) return;
    if (direction.x === -dir.x && direction.y === -dir.y) return;
    if (direction.x !== nextDir.x || direction.y !== nextDir.y) { nextDir = direction; Sounds.turn(); }
  }
  btn.addEventListener('touchstart', press, { passive: false });
  btn.addEventListener('mousedown',  press);
}

attachDpad('btn-up',    { x: 0, y:-1 });
attachDpad('btn-down',  { x: 0, y: 1 });
attachDpad('btn-left',  { x:-1, y: 0 });
attachDpad('btn-right', { x: 1, y: 0 });
document.getElementById('btn-pause').addEventListener('click', togglePause);

/* "Play Again" button in game-over overlay */
startBtn.addEventListener('click', startGame);

/* Start screen CTA */
ssStartBtn.addEventListener('click', launchFromStartScreen);
/* Space / Enter on start screen also launches */
document.addEventListener('keydown', e => {
  if (startScreen.isConnected && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    launchFromStartScreen();
  }
});

/* ── Initial render ───────────────────────────────────────────────────────── */
(function boot() {
  applyDiffUI(currentDiff);
  syncPills(currentDiff);
  ssDiffDescEl.textContent = getDiff().desc;
  diffDescEl.textContent   = getDiff().desc;
  /* Draw a static preview frame on the canvas (visible behind start screen) */
  initGame();
  draw();
})();
