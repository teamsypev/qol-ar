import * as THREE from 'three';

// World units are roughly "a toy's size". The camera sits at the origin and the
// virtual table top is a horizontal plane below it, so it lines up with a real desk
// when you point the phone down at one.
export const TABLE_Y = -1.6;
const BOUNDS = { inner: 0.9, outer: 7.5, maxY: 3.5 };
const GRAVITY = -9.0;
const MAX_THROW = 11;

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const ndc = new THREE.Vector2();

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, flatShading: true, ...extra });
}

function buildMinaret() {
  // A tiny Kalon-style minaret: sand-brick shaft, turquoise tile bands and lantern.
  const g = new THREE.Group();
  const sand = material(0xe3c189);
  const brick = material(0xcf9f5c);
  const tile = material(0x19c3d6);
  const deep = material(0x0e7f99);
  const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.24, 0.26, 0.12, 12), sand, 0.06);
  add(new THREE.CylinderGeometry(0.13, 0.2, 0.78, 12), brick, 0.51);
  add(new THREE.CylinderGeometry(0.175, 0.185, 0.05, 12), tile, 0.32);
  add(new THREE.CylinderGeometry(0.15, 0.158, 0.05, 12), tile, 0.6);
  add(new THREE.CylinderGeometry(0.19, 0.14, 0.09, 12), deep, 0.94);
  add(new THREE.CylinderGeometry(0.16, 0.16, 0.13, 12), tile, 1.05);
  add(new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), deep, 1.115);
  add(new THREE.ConeGeometry(0.025, 0.12, 6), material(0xf2c14e, { metalness: 0.6, roughness: 0.3 }), 1.29);
  return g;
}

const CATALOG = [
  { key: 'box', bounce: 0.3, build: () => new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), material(0xff6b4a)) },
  { key: 'ball', bounce: 0.72, round: true, build: () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), material(0x2ec4b6)) },
  { key: 'minaret', bounce: 0.15, build: buildMinaret },
  {
    key: 'ring',
    bounce: 0.4,
    build: () => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.1, 10, 20), material(0xf2c14e));
      m.rotation.x = Math.PI / 2; // lies flat on the table
      return m;
    },
  },
  { key: 'cone', bounce: 0.3, build: () => new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 7), material(0x8b6cff)) },
];

// Where things start, relative to the direction the camera faces (x: right, z: forward).
const LAYOUT = {
  box: [-0.5, 2.75],
  ball: [-0.05, 2.3],
  minaret: [0.0, 3.35],
  ring: [0.48, 2.6],
  cone: [0.55, 3.3],
};
const TOY_SCALE = 0.62; // overall size of the toys

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60);
    this.camera.rotation.order = 'YXZ';
    this.defaultPitch = -0.55; // looking down at the table when there's no gyro
    this.camera.rotation.set(this.defaultPitch, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7a88, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(2.5, 7, 0.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 20 });
    sun.shadow.bias = -0.0006;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    // Invisible table that only shows shadows — this is what sells the "it's on my desk" look.
    this.table = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.3 }));
    this.table.rotation.x = -Math.PI / 2;
    this.table.position.y = TABLE_Y;
    this.table.receiveShadow = true;
    this.scene.add(this.table);

    this.raycaster = new THREE.Raycaster();
    this.objects = CATALOG.map((spec) => this._make(spec));
    this.width = 1;
    this.height = 1;
    this.reset(0, true);
  }

  _make(spec) {
    const inner = spec.build();
    inner.scale.multiplyScalar(TOY_SCALE);
    const obj = new THREE.Group();
    obj.add(inner);
    // Center the model on its bounding box so physics can treat it as a simple shape.
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    inner.position.sub(center);
    inner.updateMatrixWorld(true);

    const materials = [];
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        materials.push(o.material);
      }
    });
    obj.userData = {
      key: spec.key,
      bounce: spec.bounce,
      round: !!spec.round,
      base: size.y / 2, // center-to-bottom
      radius: Math.max(size.x, size.z) / 2, // horizontal footprint
      sphere: size.length() / 2,
      vel: new THREE.Vector3(),
      angVel: new THREE.Vector3(),
      held: false,
      onTable: false,
      hover: 0,
      hoverTarget: 0,
      target: new THREE.Vector3(),
      targetQuat: new THREE.Quaternion(),
      materials,
    };
    this.scene.add(obj);
    return obj;
  }

  /** Puts every object back in front of the camera. `drop` makes them fall in from above. */
  reset(yaw = this.cameraYaw(), drop = true) {
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    this.objects.forEach((obj, i) => {
      const d = obj.userData;
      const [x, z] = LAYOUT[d.key];
      // rotate the layout so it sits in front of wherever the camera currently faces
      const wx = x * cos - z * sin;
      const wz = -x * sin - z * cos;
      obj.position.set(wx, TABLE_Y + d.base + (drop ? 1.2 + i * 0.35 : 0), wz);
      obj.quaternion.setFromEuler(tmpE.set(0, yaw + (i - 2) * 0.4, 0));
      d.vel.set(0, 0, 0);
      d.angVel.set(0, 0, 0);
      d.held = false;
    });
  }

  cameraYaw() {
    tmpE.setFromQuaternion(this.camera.quaternion, 'YXZ');
    return tmpE.y;
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Roughly match a phone's main camera: taller field of view in portrait.
    this.camera.fov = w < h ? 66 : 52;
    this.camera.updateProjectionMatrix();
  }

  /** World point at `distance` along the camera ray through screen pixel (sx, sy). */
  screenToWorld(sx, sy, distance, out = new THREE.Vector3()) {
    ndc.set((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.at(distance, out);
  }

  worldToScreen(v, out = { x: 0, y: 0, behind: false }) {
    tmpV.copy(v).project(this.camera);
    out.x = (tmpV.x * 0.5 + 0.5) * this.width;
    out.y = (-tmpV.y * 0.5 + 0.5) * this.height;
    out.behind = tmpV.z > 1;
    return out;
  }

  distanceTo(obj) {
    return obj.position.distanceTo(this.camera.position);
  }

  /** Nearest object whose on-screen footprint is close to (sx, sy), or null. */
  pick(sx, sy, slackPx = 46) {
    const focal = this.height / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    let best = null;
    let bestScore = Infinity;
    const p = { x: 0, y: 0, behind: false };
    for (const obj of this.objects) {
      this.worldToScreen(obj.position, p);
      if (p.behind) continue;
      const dist = this.distanceTo(obj);
      const radiusPx = (obj.userData.sphere / dist) * focal;
      const d = Math.hypot(p.x - sx, p.y - sy);
      const reach = radiusPx * 1.1 + slackPx;
      if (d < reach) {
        const score = d / reach + dist * 0.02; // slight preference for closer objects
        if (score < bestScore) { bestScore = score; best = obj; }
      }
    }
    return best;
  }

  setHover(obj) {
    for (const o of this.objects) o.userData.hoverTarget = o === obj ? 1 : 0;
  }

  /** Forward direction of the camera in world space. */
  cameraForward(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }

  step(dt) {
    // Fixed small sub-steps keep physics stable (and real-time) even on slow frames.
    dt = Math.min(dt, 0.1);
    const n = Math.max(1, Math.ceil(dt / (1 / 90)));
    for (let i = 0; i < n; i++) this._substep(dt / n);
  }

  _substep(dt) {
    const objs = this.objects;

    for (const obj of objs) {
      const d = obj.userData;

      // Glow when hovered or held.
      d.hover += ((d.held ? 1 : d.hoverTarget) - d.hover) * Math.min(1, dt * 12);
      for (const m of d.materials) m.emissive.copy(m.color).multiplyScalar(d.hover * 0.35);

      if (d.held) {
        // Follow the hand smoothly; the hand data arrives at camera rate, rendering is faster.
        const k = 1 - Math.exp(-dt * 20);
        obj.position.lerp(d.target, k);
        obj.quaternion.slerp(d.targetQuat, 1 - Math.exp(-dt * 14));
        d.onTable = false;
        continue;
      }

      // Free flight
      d.vel.y += GRAVITY * dt;
      d.vel.multiplyScalar(1 - 0.08 * dt);
      obj.position.addScaledVector(d.vel, dt);

      // Spin
      const w = d.angVel.length();
      if (w > 1e-4) {
        tmpQ.setFromAxisAngle(tmpV2.copy(d.angVel).divideScalar(w), w * dt);
        obj.quaternion.premultiply(tmpQ);
      }

      // Table
      const floor = TABLE_Y + d.base;
      d.onTable = false;
      if (obj.position.y <= floor) {
        obj.position.y = floor;
        if (d.vel.y < -0.8) {
          d.vel.y = -d.vel.y * d.bounce;
          d.angVel.multiplyScalar(0.7);
        } else {
          d.vel.y = 0;
          d.onTable = true;
        }
        const friction = Math.max(0, 1 - (d.round ? 1.2 : 5) * dt);
        d.vel.x *= friction;
        d.vel.z *= friction;
        if (d.round) {
          // roll along the direction of travel
          d.angVel.set(d.vel.z / d.base, 0, -d.vel.x / d.base);
        } else {
          d.angVel.multiplyScalar(Math.max(0, 1 - 8 * dt));
        }
      }

      // Settle upright on the table (keep the yaw), so boxes don't rest on a corner.
      if (d.onTable && !d.round) {
        tmpE.setFromQuaternion(obj.quaternion, 'YXZ');
        tmpQ.setFromEuler(tmpE.set(0, tmpE.y, 0, 'YXZ'));
        obj.quaternion.slerp(tmpQ, Math.min(1, dt * 6));
      }

      // Invisible round wall around the camera (and a ceiling), so nothing flies off forever.
      const h = Math.hypot(obj.position.x, obj.position.z);
      const lim = h > BOUNDS.outer - d.radius ? BOUNDS.outer - d.radius : h < BOUNDS.inner ? BOUNDS.inner : 0;
      if (lim && h > 1e-5) {
        const nx = obj.position.x / h, nz = obj.position.z / h;
        obj.position.x = nx * lim;
        obj.position.z = nz * lim;
        const vn = d.vel.x * nx + d.vel.z * nz;
        if ((lim > h && vn < 0) || (lim < h && vn > 0)) {
          d.vel.x -= 1.5 * vn * nx;
          d.vel.z -= 1.5 * vn * nz;
        }
      }
      if (obj.position.y > BOUNDS.maxY) { obj.position.y = BOUNDS.maxY; d.vel.y = -Math.abs(d.vel.y) * 0.5; }
    }

    // Objects bump into each other (treated as upright cylinders).
    for (let i = 0; i < objs.length; i++) {
      for (let j = i + 1; j < objs.length; j++) this._collide(objs[i], objs[j]);
    }
  }

  _collide(a, b) {
    const da = a.userData, db = b.userData;
    if (Math.abs(a.position.y - b.position.y) > da.base + db.base) return;
    const dx = b.position.x - a.position.x;
    const dz = b.position.z - a.position.z;
    const dist = Math.hypot(dx, dz);
    const minDist = (da.radius + db.radius) * 0.95;
    if (dist >= minDist || dist < 1e-5) return;
    const nx = dx / dist, nz = dz / dist;
    const overlap = minDist - dist;
    // A held object is "infinitely heavy": it pushes, it isn't pushed.
    const wa = da.held ? 0 : db.held ? 1 : 0.5;
    const wb = db.held ? 0 : da.held ? 1 : 0.5;
    a.position.x -= nx * overlap * wa; a.position.z -= nz * overlap * wa;
    b.position.x += nx * overlap * wb; b.position.z += nz * overlap * wb;
    // velocity exchange along the normal
    const rel = (db.vel.x - da.vel.x) * nx + (db.vel.z - da.vel.z) * nz;
    if (rel < 0) {
      const imp = -rel * 0.7;
      if (!da.held) { da.vel.x -= nx * imp * (db.held ? 2 : 1); da.vel.z -= nz * imp * (db.held ? 2 : 1); }
      if (!db.held) { db.vel.x += nx * imp * (da.held ? 2 : 1); db.vel.z += nz * imp * (da.held ? 2 : 1); }
    }
    if (da.held && !db.held) { db.vel.x += nx * 0.6; db.vel.z += nz * 0.6; }
    if (db.held && !da.held) { da.vel.x -= nx * 0.6; da.vel.z -= nz * 0.6; }
  }

  /** Release a held object with a throw velocity. */
  release(obj, velocity) {
    const d = obj.userData;
    d.held = false;
    d.vel.copy(velocity);
    if (d.vel.length() > MAX_THROW) d.vel.setLength(MAX_THROW);
    // a little tumble proportional to the throw
    d.angVel.set(-velocity.z * 1.2, (Math.random() - 0.5) * velocity.length(), velocity.x * 1.2);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
