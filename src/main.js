import * as THREE from 'three';
import { World } from './world.js';
import { createHandTracker, HandGesture, HAND_CONNECTIONS } from './hands.js';
import { GyroCamera } from './gyro.js';
import { preloadEngine, isSlamCompatible, startSlam, stopSlam } from './slam.js';
import { t, applyLang, setLang, nextLang, getLang, STRINGS } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const video = $('#video');
const sceneCanvas = $('#scene');
const xrCanvas = $('#camerafeed');
const modeEl = $('#mode');
const overlay = $('#overlay');
const ctx = overlay.getContext('2d');
const intro = $('#intro');
const startBtn = $('#start');
const statusEl = $('#status');
const hud = $('#hud');
const fpsEl = $('#fps');
const toastEl = $('#toast');

const isMobile = matchMedia('(pointer: coarse)').matches;
const params = new URLSearchParams(location.search);
// Real SLAM tracking on phones; `?classic` forces the simple gyro-only mode.
const wantSlam = isMobile && !params.has('classic');

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
  xr: false, // true when 8th Wall SLAM is running
  XR8: null,
  slam: null, // live SLAM state from slam.js
  slamFrameId: 0,
  frameW: 640, // size of the image given to hand tracking
  frameH: 480,
  lastTracking: '',
};

// Start downloading the AR engine early on phones, so it's ready when Start is tapped.
const engineReady = wantSlam ? preloadEngine() : Promise.resolve(null);

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
  const vw = state.frameW || 640;
  const vh = state.frameH || 480;
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
  state.frameW = video.videoWidth || 640;
  state.frameH = video.videoHeight || 480;
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
  const flipBtn = document.querySelector('[data-action="flip"]');
  if (state.xr) {
    // In SLAM mode this button recenters the world instead of toggling the gyro.
    gyroBtn.classList.remove('on');
    gyroBtn.disabled = false;
    gyroBtn.dataset.i18nLabel = 'recenter';
    flipBtn.disabled = true;
  } else {
    gyroBtn.classList.toggle('on', gyro.enabled && gyro.hasData && state.facing === 'environment');
    gyroBtn.disabled = state.facing === 'user';
    gyroBtn.dataset.i18nLabel = 'gyro';
    flipBtn.disabled = false;
  }
  applyLang();
  document.querySelector('[data-action="skeleton"]').classList.toggle('on', state.showSkeleton);
  modeEl.hidden = !state.xr;
  modeEl.textContent = t('slam');
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

  // 1) Try real SLAM tracking with 8th Wall.
  if (wantSlam) {
    setStatus(t('loadingAr'));
    const XR8 = await engineReady;
    if (XR8 && isSlamCompatible(XR8)) {
      try {
        state.slam = await startSlam(XR8, xrCanvas, { onReady: (xrScene) => world.useXr(xrScene) });
        state.xr = true;
        state.XR8 = XR8;
        video.hidden = true;
        sceneCanvas.hidden = true;
        enterScene();
        requestWakeLock();
        afterStart();
        return;
      } catch (err) {
        console.error('[qol] SLAM failed, falling back to classic mode', err);
        stopSlam(XR8);
        xrCanvas.hidden = true;
        state.slamFailed = true;
      }
    }
  }

  // 2) Classic mode: our own camera + gyroscope.
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
  if (state.slamFailed) toast(t('arFallback'), 3500);
  afterStart();
});

function afterStart() {
  if (!state.tracker && !state.trackerFailed) toast(t('loadingModel'), 60000);
  trackerReady.then((ok) => {
    if (!ok) toast(t('modelError'), 6000);
    else if (state.xr) toast(t('scanTable'), 4000);
    else toast(state.facing === 'environment' ? t('pointTable') : t('noHand'), 3200);
  });
}

function enterScene() {
  intro.classList.add('gone');
  setTimeout(() => { intro.hidden = true; }, 450);
  hud.hidden = false;
  state.running = true;
  if (!state.xr) {
    world.camera.quaternion.copy(fixedQuat);
    world.reset(0, true);
  }
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
      nextLang();
      if (state.running) syncButtons();
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
      if (state.xr) {
        if (state.held) drop();
        state.XR8.XrController.recenter();
        setTimeout(() => world.reset(0, true), 150); // after the camera has jumped back
        toast(t('recentered'), 1500);
        break;
      }
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
  p.y = Math.max(p.y, world.tableY + d.base);

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

const endPointer = (e) => {
  if (!state.pointer.active || e.pointerId !== state.pointer.id) return;
  state.pointer.active = false;
  if (state.holdSource === 'pointer') drop();
};
for (const el of [sceneCanvas, xrCanvas]) {
  el.addEventListener('pointerdown', (e) => {
    if (state.pointer.active || !state.running) return;
    state.pointer = { active: true, id: e.pointerId, x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
    const obj = world.pick(e.clientX, e.clientY, 24);
    if (obj) {
      if (state.held) drop();
      grab(obj, 'pointer');
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!state.pointer.active || e.pointerId !== state.pointer.id) return;
    state.pointer.x = e.clientX;
    state.pointer.y = e.clientY;
  });
  el.addEventListener('pointerup', endPointer);
  el.addEventListener('pointercancel', endPointer);
}

// ---------------------------------------------------------------- hand tracking

const stats = { frames: 0, detections: 0, since: performance.now() };

/** The newest camera image for hand tracking, or null if there's nothing new since last time. */
function nextCameraImage() {
  if (state.xr) {
    // SLAM mode: 8th Wall owns the camera and hands us a small RGBA copy of each frame.
    const s = state.slam;
    if (!s || !s.frame || s.frameId === state.slamFrameId) return null;
    state.slamFrameId = s.frameId;
    const { pixels, cols, rows } = s.frame;
    state.frameW = cols;
    state.frameH = rows;
    return new ImageData(new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, cols * rows * 4), cols, rows);
  }
  if (video.readyState < 2 || video.currentTime === state.lastVideoTime) return null;
  state.lastVideoTime = video.currentTime;
  return video;
}

function detectHands(now) {
  const image = nextCameraImage();
  if (!image) return; // no new camera frame yet
  let landmarks;
  if (state.fakeHand !== undefined) {
    landmarks = state.fakeHand;
  } else {
    if (!state.tracker) return;
    let result;
    try {
      result = state.tracker.detectForVideo(image, now);
    } catch (err) {
      console.error('[qol] detection failed', err);
      return;
    }
    landmarks = result.landmarks && result.landmarks[0];
  }
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

  if (state.xr) {
    trackingHints();
  } else {
    const useGyro = gyro.enabled && state.facing === 'environment';
    if (!(useGyro && gyro.apply(world.camera, dt))) {
      world.camera.quaternion.slerp(fixedQuat, 1 - Math.exp(-dt * 8));
    }
  }
  world.camera.updateMatrixWorld(); // in SLAM mode 8th Wall has just moved it

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

/** Tell the user what SLAM needs: move slowly while it initializes, slow down if it's lost. */
function trackingHints() {
  const s = state.slam;
  if (!s) return;
  const key = `${s.trackingStatus}/${s.trackingReason}`;
  if (key === state.lastTracking) return;
  const wasNormal = state.lastTracking.startsWith('NORMAL');
  state.lastTracking = key;
  if (s.trackingStatus === 'NORMAL' && !state.slamWasNormal) {
    state.slamWasNormal = true;
    toast(t('tracking'), 3000);
  } else if (s.trackingStatus === 'LIMITED' && wasNormal && s.trackingReason !== 'INITIALIZING') {
    toast(t('trackingLost'), 2500);
  }
}

// Handy for debugging in the browser console (and for automated tests).
window.qol = { world, gesture, state, gyro, drop, enterScene, trackerReady, engineReady };
