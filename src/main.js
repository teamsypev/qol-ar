import * as THREE from 'three';
import { World, TABLE_Y } from './world.js';
import { createHandTracker, HandGesture, HAND_CONNECTIONS } from './hands.js';
import { GyroCamera } from './gyro.js';
import { t, applyLang, setLang, getLang, STRINGS } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const video = $('#video');
const sceneCanvas = $('#scene');
const overlay = $('#overlay');
const ctx = overlay.getContext('2d');
const intro = $('#intro');
const startBtn = $('#start');
const statusEl = $('#status');
const hud = $('#hud');
const fpsEl = $('#fps');
const toastEl = $('#toast');

const isMobile = matchMedia('(pointer: coarse)').matches;

applyLang();

const world = new World(sceneCanvas);
const gyro = new GyroCamera();
const gesture = new HandGesture();
const fixedQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(world.defaultPitch, 0, 0, 'YXZ'));
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

const state = {
  running: false,
  facing: 'environment',
  mirror: false,
  stream: null,
  tracker: null,
  delegate: null,
  trackerFailed: false,
  showSkeleton: true,
  lastVideoTime: -1,
  lastHandSeen: 0,
  lastHint: 0,
  hover: null,
  held: null,
  holdSource: null, // 'hand' | 'pointer'
  grab: {
    distOffset: 0,
    pointerDist: 0,
    offset: new THREE.Vector3(),
    roll0: 0,
    quat0: new THREE.Quaternion(),
    history: [],
  },
  pointer: { active: false, id: null, x: 0, y: 0 },
  fakeHand: undefined, // test hook: array of 21 normalized points, or null for "no hand"
};

// Start downloading the hand model right away, while the user reads the intro.
const trackerReady = createHandTracker()
  .then((r) => {
    state.tracker = r.landmarker;
    state.delegate = r.delegate;
    return true;
  })
  .catch((err) => {
    console.error('[qol] hand model failed to load', err);
    state.trackerFailed = true;
    return false;
  });

// ---------------------------------------------------------------- layout

let overlayDpr = 1;
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  world.resize(w, h);
  overlayDpr = Math.min(window.devicePixelRatio || 1, 2);
  overlay.width = Math.round(w * overlayDpr);
  overlay.height = Math.round(h * overlayDpr);
}
window.addEventListener('resize', resize);
resize();

/** Normalized video coordinates → screen pixels, matching the CSS object-fit: cover crop. */
function videoToScreen(nx, ny, out = { x: 0, y: 0 }) {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const W = world.width;
  const H = world.height;
  const s = Math.max(W / vw, H / vh);
  const dw = vw * s;
  const dh = vh * s;
  let x = (W - dw) / 2 + nx * dw;
  const y = (H - dh) / 2 + ny * dh;
  if (state.mirror) x = W - x;
  out.x = x;
  out.y = y;
  return out;
}

// ---------------------------------------------------------------- camera

function stopCamera() {
  if (state.stream) state.stream.getTracks().forEach((tr) => tr.stop());
  state.stream = null;
}

async function startCamera(facing) {
  stopCamera();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    },
  });
  state.stream = stream;
  video.srcObject = stream;
  await video.play();
  const settings = stream.getVideoTracks()[0].getSettings();
  // Laptops don't report facingMode; their webcam faces the user.
  const actual = settings.facingMode || (isMobile ? facing : 'user');
  state.facing = actual === 'user' ? 'user' : 'environment';
  state.mirror = state.facing === 'user';
  video.classList.toggle('mirror', state.mirror);
  state.lastVideoTime = -1;
  gesture.reset();
}

// ---------------------------------------------------------------- UI helpers

let toastTimer = 0;
function toast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

let wakeLock = null;
async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.running && (!wakeLock || wakeLock.released)) requestWakeLock();
});

function syncButtons() {
  const gyroBtn = document.querySelector('[data-action="gyro"]');
  gyroBtn.classList.toggle('on', gyro.enabled && gyro.hasData && state.facing === 'environment');
  gyroBtn.disabled = state.facing === 'user';
  document.querySelector('[data-action="skeleton"]').classList.toggle('on', state.showSkeleton);
}

// ---------------------------------------------------------------- start

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  // These two must be requested directly from the tap.
  const motionPermission = GyroCamera.requestPermission();
  if (isMobile && document.documentElement.requestFullscreen) {
    document.documentElement
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation?.lock?.('portrait'))
      .catch(() => {});
  }

  setStatus(t('loadingCam'));
  try {
    await startCamera('environment');
  } catch (err) {
    console.error('[qol] camera failed', err);
    setStatus(t('camError'));
    startBtn.disabled = false;
    return;
  }
  await motionPermission;
  gyro.enabled = true;
  gyro.recenter();
  enterScene();
  requestWakeLock();

  if (!state.tracker && !state.trackerFailed) toast(t('loadingModel'), 60000);
  trackerReady.then((ok) => {
    if (ok) toast(state.facing === 'environment' ? t('pointTable') : t('noHand'), 3200);
    else toast(t('modelError'), 6000);
  });
});

function enterScene() {
  intro.classList.add('gone');
  setTimeout(() => { intro.hidden = true; }, 450);
  hud.hidden = false;
  state.running = true;
  world.camera.quaternion.copy(fixedQuat);
  world.reset(0, true);
  syncButtons();
}

// ---------------------------------------------------------------- HUD buttons

document.addEventListener('click', async (e) => {
  const langBtn = e.target.closest('[data-setlang]');
  if (langBtn) { setLang(langBtn.dataset.setlang); return; }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'lang':
      setLang(getLang() === 'uz' ? 'en' : 'uz');
      break;
    case 'flip':
      try {
        await startCamera(state.facing === 'user' ? 'environment' : 'user');
      } catch (err) {
        console.error(err);
        toast(t('camError'));
      }
      syncButtons();
      break;
    case 'reset':
      if (state.held) drop();
      world.reset(world.cameraYaw(), true);
      break;
    case 'gyro':
      if (!gyro.hasData) { toast(t('noGyro')); break; }
      gyro.enabled = !gyro.enabled;
      if (gyro.enabled) { gyro.recenter(); world.reset(0, true); }
      toast(gyro.enabled ? t('gyroOn') : t('gyroOff'));
      syncButtons();
      break;
    case 'skeleton':
      state.showSkeleton = !state.showSkeleton;
      syncButtons();
      break;
  }
});

// ---------------------------------------------------------------- grabbing

const handDistance = () => THREE.MathUtils.clamp(0.63 / Math.max(gesture.scale, 0.02), 1.1, 6.5);

function grab(obj, source) {
  const g = state.grab;
  state.held = obj;
  state.holdSource = source;
  obj.userData.held = true;
  const objDist = world.distanceTo(obj);
  const sx = source === 'hand' ? gesture.x : state.pointer.x;
  const sy = source === 'hand' ? gesture.y : state.pointer.y;
  if (source === 'hand') g.distOffset = objDist - handDistance();
  else g.pointerDist = objDist;
  world.screenToWorld(sx, sy, objDist, tmpV);
  g.offset.copy(obj.position).sub(tmpV);
  g.roll0 = gesture.roll;
  g.quat0.copy(obj.quaternion);
  obj.userData.target.copy(obj.position);
  obj.userData.targetQuat.copy(obj.quaternion);
  g.history.length = 0;
  navigator.vibrate?.(15);
}

function drop() {
  const obj = state.held;
  if (!obj) return;
  const h = state.grab.history;
  const v = new THREE.Vector3();
  const now = performance.now();
  if (h.length >= 2 && now - h[h.length - 1].t < 140) { // hand was still moving when it let go
    const a = h[0];
    const b = h[h.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt > 0.02) v.copy(b.p).sub(a.p).divideScalar(dt).multiplyScalar(0.9);
  }
  world.release(obj, v);
  state.held = null;
  state.holdSource = null;
}

function onGestureEvents() {
  if (state.pointer.active) return; // a finger on the screen takes priority
  if (gesture.justPinched && !state.held) {
    const obj = world.pick(gesture.x, gesture.y);
    if (obj) grab(obj, 'hand');
  }
  if (gesture.justReleased && state.holdSource === 'hand') drop();
}

function updateHeld(now, dt) {
  const obj = state.held;
  if (!obj) {
    const hovered = gesture.visible && !state.pointer.active ? world.pick(gesture.x, gesture.y) : null;
    state.hover = hovered;
    world.setHover(hovered);
    return;
  }
  state.hover = obj;
  world.setHover(null);
  const g = state.grab;
  const d = obj.userData;
  let sx, sy, dist;
  if (state.holdSource === 'hand') {
    sx = gesture.x;
    sy = gesture.y;
    dist = THREE.MathUtils.clamp(handDistance() + g.distOffset, 0.9, 7);
  } else {
    sx = state.pointer.x;
    sy = state.pointer.y;
    dist = g.pointerDist;
  }
  // The grab offset melts away so the object drifts to sit right under your fingers.
  g.offset.multiplyScalar(Math.exp(-dt * 2.5));
  const p = world.screenToWorld(sx, sy, dist, d.target).add(g.offset);
  p.y = Math.max(p.y, TABLE_Y + d.base);

  if (state.holdSource === 'hand') {
    // Twisting your hand twists the object around the line of sight.
    tmpQ.setFromAxisAngle(world.cameraForward(tmpV), gesture.roll - g.roll0);
    d.targetQuat.copy(tmpQ).multiply(g.quat0);
  }

  // Remember recent hand positions (only when they actually change) to compute throw speed.
  const last = g.history[g.history.length - 1];
  if (!last || last.p.distanceToSquared(p) > 1e-8) g.history.push({ t: now, p: p.clone() });
  while (g.history.length > 2 && now - g.history[0].t > 180) g.history.shift();
}

// ---------------------------------------------------------------- touch / mouse fallback

sceneCanvas.addEventListener('pointerdown', (e) => {
  if (state.pointer.active || !state.running) return;
  state.pointer = { active: true, id: e.pointerId, x: e.clientX, y: e.clientY };
  sceneCanvas.setPointerCapture(e.pointerId);
  const obj = world.pick(e.clientX, e.clientY, 24);
  if (obj) {
    if (state.held) drop();
    grab(obj, 'pointer');
  }
});
sceneCanvas.addEventListener('pointermove', (e) => {
  if (!state.pointer.active || e.pointerId !== state.pointer.id) return;
  state.pointer.x = e.clientX;
  state.pointer.y = e.clientY;
});
const endPointer = (e) => {
  if (!state.pointer.active || e.pointerId !== state.pointer.id) return;
  state.pointer.active = false;
  if (state.holdSource === 'pointer') drop();
};
sceneCanvas.addEventListener('pointerup', endPointer);
sceneCanvas.addEventListener('pointercancel', endPointer);

// ---------------------------------------------------------------- hand tracking

const stats = { frames: 0, detections: 0, since: performance.now() };

function detectHands(now) {
  if (video.readyState < 2) return;
  if (video.currentTime === state.lastVideoTime) return; // no new camera frame yet
  let landmarks;
  if (state.fakeHand !== undefined) {
    landmarks = state.fakeHand;
  } else {
    if (!state.tracker) return;
    let result;
    try {
      result = state.tracker.detectForVideo(video, now);
    } catch (err) {
      console.error('[qol] detection failed', err);
      return;
    }
    landmarks = result.landmarks && result.landmarks[0];
  }
  state.lastVideoTime = video.currentTime;
  stats.detections++;

  if (landmarks) {
    const pts = landmarks.map((p) => videoToScreen(p.x, p.y));
    gesture.update(pts, Math.min(world.width, world.height), now / 1000);
    state.lastHandSeen = now;
    onGestureEvents();
  } else if (gesture.visible && now - state.lastHandSeen > 250) {
    // a short grace period: one missed frame shouldn't drop what you're holding
    gesture.lost();
    onGestureEvents();
  }
}

// ---------------------------------------------------------------- overlay drawing

const COLORS = { tile: '#19c3d6', sand: '#f2c14e', bone: 'rgba(255,255,255,0.55)', joint: 'rgba(255,255,255,0.9)' };

function drawOverlay() {
  const W = world.width;
  const H = world.height;
  ctx.setTransform(overlayDpr, 0, 0, overlayDpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (gesture.visible && gesture.points) {
    const pts = gesture.points;
    if (state.showSkeleton) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.bone;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[b].x, pts[b].y);
      }
      ctx.stroke();
      ctx.fillStyle = COLORS.joint;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Pinch cursor: the ring closes as your fingers close.
    const color = gesture.pinching ? COLORS.sand : COLORS.tile;
    const r = 8 + 24 * gesture.progress;
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(gesture.x, gesture.y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (gesture.pinching) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(gesture.x, gesture.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Name tag above the hovered / held object
  const obj = state.hover;
  if (obj) {
    tmpV.copy(obj.position);
    tmpV.y += obj.userData.base + 0.14;
    const p = world.worldToScreen(tmpV);
    if (!p.behind) {
      const label = STRINGS[getLang()].objects[obj.userData.key];
      ctx.font = '600 13px Inter, system-ui, sans-serif';
      const w = ctx.measureText(label).width + 20;
      const h = 26;
      ctx.fillStyle = state.held === obj ? 'rgba(242,193,78,0.92)' : 'rgba(12,18,24,0.72)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x - w / 2, p.y - h, w, h, 13);
      else ctx.rect(p.x - w / 2, p.y - h, w, h);
      ctx.fill();
      ctx.fillStyle = state.held === obj ? '#2a1d00' : '#eef3f6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, p.x, p.y - h / 2 + 0.5);
    }
  }
}

// ---------------------------------------------------------------- main loop

let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!state.running) return;

  const useGyro = gyro.enabled && state.facing === 'environment';
  if (!(useGyro && gyro.apply(world.camera, dt))) {
    world.camera.quaternion.slerp(fixedQuat, 1 - Math.exp(-dt * 8));
  }
  world.camera.updateMatrixWorld();

  detectHands(now);
  updateHeld(now, dt);
  world.step(dt);
  world.render();
  drawOverlay();

  // Gentle nudge if no hand has been seen for a while
  if (state.tracker && !gesture.visible && !state.pointer.active && !state.held &&
      now - state.lastHandSeen > 5000 && now - state.lastHint > 9000 && toastEl.hidden) {
    state.lastHint = now;
    toast(t('noHand'));
  }

  stats.frames++;
  if (now - stats.since > 500) {
    const secs = (now - stats.since) / 1000;
    const renderFps = Math.round(stats.frames / secs);
    const handFps = Math.round(stats.detections / secs);
    fpsEl.textContent = state.tracker || state.fakeHand !== undefined
      ? `${t('hand')} ${handFps} · ${renderFps} fps`
      : `${renderFps} fps`;
    stats.frames = 0;
    stats.detections = 0;
    stats.since = now;
  }
}
requestAnimationFrame(frame);

// Handy for debugging in the browser console (and for automated tests).
window.qol = { world, gesture, state, gyro, drop, enterScene, trackerReady };
