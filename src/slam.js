import * as THREE from 'three';

// Real world tracking (SLAM) with the 8th Wall engine. It runs in the browser and needs no
// ARCore, so it works on phones like the Galaxy A15 4G that Google doesn't certify.
// The engine is a free binary from Niantic Spatial (see the credits in index.html / README).
const ENGINE_SRC = 'https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1.0.0/dist/xr.js';
const EXTRAS_SRC = 'https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1.0.0/dist/xrextras.js';

// The camera starts this far above the table, in world units (same scale as classic mode).
export const CAMERA_HEIGHT = 1.6;

function loadScript(src, attrs = {}) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
    s.onload = resolve;
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

let enginePromise = null;

/** Starts downloading the engine (call early, it's ~6.5 MB). Resolves to XR8 or null. */
export function preloadEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    if (!window.XR8) {
      const loaded = new Promise((resolve) => window.addEventListener('xrloaded', resolve, { once: true }));
      await loadScript(ENGINE_SRC, { 'data-preload-chunks': 'slam' });
      if (!window.XR8) await Promise.race([loaded, new Promise((r) => setTimeout(r, 15000))]);
    }
    if (!window.XR8) throw new Error('XR8 did not initialize');
    await loadScript(EXTRAS_SRC).catch((e) => console.warn('[qol] XRExtras failed to load', e));
    await window.XR8.loadChunk('slam');
    return window.XR8;
  })().catch((err) => {
    console.warn('[qol] 8th Wall engine unavailable', err);
    return null;
  });
  return enginePromise;
}

export function isSlamCompatible(XR8) {
  try {
    return XR8.XrDevice.isDeviceBrowserCompatible({ allowedDevices: XR8.XrConfig.device().MOBILE });
  } catch {
    return false;
  }
}

/**
 * Starts the camera with SLAM on `canvas`. `onReady(xrScene)` runs once the three.js scene exists.
 * The returned `state` is updated every camera frame with the tracking status and a small RGBA
 * copy of the camera image, which we feed to MediaPipe for hand tracking.
 */
export function startSlam(XR8, canvas, { onReady }) {
  window.THREE = THREE; // the 8th Wall three.js module builds its scene with window.THREE

  const state = {
    trackingStatus: 'UNSPECIFIED',
    trackingReason: 'UNSPECIFIED',
    frame: null, // { pixels, cols, rows }
    frameId: 0,
  };

  return new Promise((resolve, reject) => {
    let started = false;
    setTimeout(() => { if (!started) reject(new Error('8th Wall did not start in time')); }, 20000);
    const modules = [
      XR8.GlTextureRenderer.pipelineModule(), // draws the camera feed
      XR8.Threejs.pipelineModule(), // three.js scene + renderer, camera driven by SLAM
      XR8.XrController.pipelineModule(), // the SLAM itself
      XR8.CameraPixelArray.pipelineModule({ luminance: false, maxDimension: 320 }), // pixels for MediaPipe
    ];
    if (window.XRExtras) modules.push(window.XRExtras.FullWindowCanvas.pipelineModule());
    modules.push({
      name: 'qol',
      onStart: () => {
        const xrScene = XR8.Threejs.xrScene();
        xrScene.camera.position.set(0, CAMERA_HEIGHT, 0);
        onReady(xrScene);
        XR8.XrController.updateCameraProjectionMatrix({
          origin: xrScene.camera.position,
          facing: xrScene.camera.quaternion,
        });
        started = true;
        resolve(state);
      },
      onUpdate: ({ processCpuResult, processGpuResult }) => {
        const reality = processCpuResult && processCpuResult.reality;
        if (reality) {
          state.trackingStatus = reality.trackingStatus || state.trackingStatus;
          state.trackingReason = reality.trackingReason || state.trackingReason;
        }
        const px = processGpuResult && processGpuResult.camerapixelarray;
        if (px && px.pixels && px.pixels.length >= px.cols * px.rows * 4) {
          state.frame = px;
          state.frameId++;
        }
      },
      onCameraStatusChange: (e) => {
        if (e.status !== 'hasVideo' && e.status !== 'hasStream') console.info('[qol] camera status', e.status, e.reason || '');
        if (e.status === 'failed' && !started) reject(new Error(`camera failed: ${e.reason || 'unknown'}`));
      },
      onException: (err) => {
        console.error('[qol] 8th Wall error', err);
        if (!started) reject(err instanceof Error ? err : new Error(JSON.stringify(err)));
      },
    });
    XR8.addCameraPipelineModules(modules);
    canvas.hidden = false;
    XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().MOBILE });
  });
}

export function stopSlam(XR8) {
  try {
    XR8.stop();
    XR8.clearCameraPipelineModules();
  } catch {}
}
