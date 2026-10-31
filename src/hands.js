import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/vision_bundle.mjs';
import { OneEuro } from './filter.js';

// The WASM runtime and the model are large, so they come from CDNs that phones cache well.
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// MediaPipe landmark indices
export const LM = { WRIST: 0, THUMB_TIP: 4, INDEX_MCP: 5, INDEX_TIP: 8, MIDDLE_MCP: 9, PINKY_MCP: 17 };

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** Loads MediaPipe Hand Landmarker, preferring the GPU and falling back to the CPU. */
export async function createHandTracker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numHands: 1, // one hand keeps budget phones fast
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    const landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
    return { landmarker, delegate: 'GPU' };
  } catch (err) {
    console.warn('[qol] GPU delegate failed, using CPU', err);
    const landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
    return { landmarker, delegate: 'CPU' };
  }
}

// Pinch thresholds, as a ratio of thumb–index gap to palm length.
// Two thresholds (hysteresis) stop the grab from flickering on and off.
const PINCH_ON = 0.3;
const PINCH_OFF = 0.46;
const OPEN_RATIO = 0.95;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Turns raw landmarks (already in screen pixels) into a small, smoothed gesture state:
 * where the pinch is, whether it is closed, how big the hand looks (≈ how close it is),
 * and how much the hand is rolled.
 */
export class HandGesture {
  constructor() {
    this.fx = new OneEuro(1.4, 0.012);
    this.fy = new OneEuro(1.4, 0.012);
    this.fScale = new OneEuro(0.8, 0.5);
    this.fRoll = new OneEuro(1.2, 0.3);
    this.reset();
  }

  reset() {
    this.visible = false;
    this.pinching = false;
    this.justPinched = false;
    this.justReleased = false;
    this.x = 0;
    this.y = 0;
    this.scale = 0.2;
    this.roll = 0;
    this.progress = 0; // 0 = fingers fully closed, 1 = open
    this.points = null;
    this._rawRollPrev = null;
    this._rollUnwrapped = 0;
    this.fx.reset(); this.fy.reset(); this.fScale.reset(); this.fRoll.reset();
  }

  /** @param pts 21 points in screen px  @param minDim min(viewport width, height)  @param t seconds */
  update(pts, minDim, t) {
    this.points = pts;
    this.justPinched = false;
    this.justReleased = false;
    this.visible = true;

    const palm = Math.max(1, dist(pts[LM.WRIST], pts[LM.MIDDLE_MCP]));
    const ratio = dist(pts[LM.THUMB_TIP], pts[LM.INDEX_TIP]) / palm;

    if (!this.pinching && ratio < PINCH_ON) {
      this.pinching = true;
      this.justPinched = true;
    } else if (this.pinching && ratio > PINCH_OFF) {
      this.pinching = false;
      this.justReleased = true;
    }
    this.progress = Math.min(1, Math.max(0, (ratio - PINCH_ON) / (OPEN_RATIO - PINCH_ON)));

    // Cursor sits between the thumb tip and index tip.
    const mx = (pts[LM.THUMB_TIP].x + pts[LM.INDEX_TIP].x) / 2;
    const my = (pts[LM.THUMB_TIP].y + pts[LM.INDEX_TIP].y) / 2;
    this.x = this.fx.filter(mx, t);
    this.y = this.fy.filter(my, t);

    // Apparent hand size → distance. Bigger on screen = closer to the camera.
    this.scale = this.fScale.filter(palm / minDim, t);

    // Roll: angle of the knuckle line, unwrapped so it never jumps by 2π.
    const raw = Math.atan2(pts[LM.PINKY_MCP].y - pts[LM.INDEX_MCP].y, pts[LM.PINKY_MCP].x - pts[LM.INDEX_MCP].x);
    if (this._rawRollPrev !== null) {
      let d = raw - this._rawRollPrev;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      this._rollUnwrapped += d;
    } else {
      this._rollUnwrapped = raw;
    }
    this._rawRollPrev = raw;
    this.roll = this.fRoll.filter(this._rollUnwrapped, t);
  }

  /** Call when a video frame had no hand in it. */
  lost() {
    if (this.pinching) this.justReleased = true;
    this.visible = false;
    this.pinching = false;
    this.points = null;
    this._rawRollPrev = null;
    this.fx.reset(); this.fy.reset(); this.fScale.reset(); this.fRoll.reset();
  }
}
