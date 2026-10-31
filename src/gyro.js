import * as THREE from 'three';

// Turns the phone's orientation sensor into the 3D camera's rotation, so when you turn
// the phone the virtual objects stay where they were in the room (3 degrees of freedom).
const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° around X
const target = new THREE.Quaternion();
const DEG = Math.PI / 180;

export class GyroCamera {
  constructor() {
    this.enabled = false;
    this.hasData = false;
    this.alpha = 0; this.beta = 0; this.gamma = 0;
    this.alphaOffset = null;
    this._onEvent = (e) => {
      if (e.alpha === null && e.beta === null) return;
      this.alpha = (e.alpha || 0) * DEG;
      this.beta = (e.beta || 0) * DEG;
      this.gamma = (e.gamma || 0) * DEG;
      if (this.alphaOffset === null) this.alphaOffset = this.alpha;
      this.hasData = true;
    };
    window.addEventListener('deviceorientation', this._onEvent);
  }

  /** iOS needs an explicit permission prompt, triggered from a tap. Android doesn't. */
  static requestPermission() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      return DOE.requestPermission().catch(() => 'denied');
    }
    return Promise.resolve('granted');
  }

  /** Make the current heading "straight ahead". */
  recenter() {
    this.alphaOffset = this.alpha;
  }

  /** Writes the phone's orientation into `camera`, smoothed. Returns true if it did. */
  apply(camera, dt) {
    if (!this.enabled || !this.hasData) return false;
    const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * DEG;
    euler.set(this.beta, this.alpha - this.alphaOffset, -this.gamma, 'YXZ');
    target.setFromEuler(euler);
    target.multiply(q1);
    target.multiply(q0.setFromAxisAngle(zee, -orient));
    camera.quaternion.slerp(target, 1 - Math.exp(-dt * 25));
    return true;
  }
}
