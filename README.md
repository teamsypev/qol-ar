# Qoʻl AR

**Grab 3D objects in the real world with your bare hands — right in your phone's browser.**
No app store, no headset, no controllers. Open the link, point your phone at a table, show your other hand to the camera, and pinch.

> *Qoʻl* means "hand" in Uzbek.

**Oʻzbekcha:** Telefon kamerasi orqali haqiqiy stol ustidagi 3D buyumlarni oʻz qoʻlingiz bilan ushlang, buring va uloqtiring. Hammasi brauzerda, telefoningizning oʻzida ishlaydi.

**По-русски:** хватайте, вращайте и бросайте 3D-объекты на реальном столе голыми руками через камеру телефона. Всё работает прямо в браузере, без ARCore.

## What it does (v0.2)

- **Real world tracking (SLAM) without ARCore** — on phones, the free 8th Wall engine tracks the phone's position in the room, so the toys stay glued to your real table while you walk around them. Works on phones Google doesn't certify for ARCore (e.g. Galaxy A15 4G). If SLAM can't start, the app falls back to classic mode automatically; add `?classic` to the URL to force it.

- **Bare-hand tracking** on the phone itself with MediaPipe Hand Landmarker (21 points per hand, GPU when available).
- **Pinch to grab**, move your hand to carry, **twist your wrist to rotate**, open your fingers to drop — or flick to **throw**.
- **Depth from hand size**: bring your hand closer to the camera and the object comes closer.
- **Classic mode** (laptops, or phones without SLAM): gyroscope lock — turn the phone and the objects stay put.
- **Shadows on your real table**, simple physics (gravity, bounces, objects bump into each other).
- A tiny **Kalon-style minaret** among the toys 🕌
- **Finger fallback**: no hand detected? Drag and fling objects with your finger on the screen.
- Uzbek, Russian and English interface. Video never leaves the device.

## Try it

Open the live link on an Android phone in Chrome (camera needs HTTPS), tap **Boshlash / Start** and allow the camera.

Tips for budget phones (e.g. Galaxy A15): good light helps tracking a lot; keep your hand 20–50 cm from the camera; the `qoʻl N · M fps` chip shows hand-tracking speed and render speed.

## Run locally

```bash
git clone https://github.com/teamsypev/qol-ar
cd qol-ar
npx serve .        # or: python3 -m http.server 8080
```

Open `http://localhost:3000` on your computer (the webcam works on `localhost`).
To test on a phone, it must be served over HTTPS — deploy to Vercel/Netlify, or use a tunnel.

No build step: plain ES modules. Three.js, MediaPipe and the 8th Wall engine load from jsDelivr (pinned versions). SLAM mode only starts on phones; on a laptop you get classic mode.

## How it works

```
                ┌─ SLAM mode ── 8th Wall (camera feed + 6DoF pose) ─┐
camera ─────────┤                                                   ├──► Three.js camera
                └─ classic ──── <video> + phone gyro (rotation) ────┘
   │
   └─ small RGBA frame ──► MediaPipe Hand Landmarker ──► HandGesture (pinch, cursor, depth, roll)
                                                              ▼
                                World: grab / move / rotate / throw, physics, shadows
```

| File | What's in it |
| --- | --- |
| `src/main.js` | Start flow, camera, main loop, grabbing logic, overlay drawing |
| `src/hands.js` | MediaPipe setup and the pinch / depth / roll gesture state |
| `src/world.js` | Three.js scene, the toys, physics, picking |
| `src/slam.js` | Loads the 8th Wall engine and runs SLAM, hands camera frames to hand tracking |
| `src/gyro.js` | Phone orientation → camera rotation (classic mode) |
| `src/filter.js` | One Euro filter for jitter-free hand motion |
| `src/i18n.js` | Uzbek, Russian and English strings |

## Roadmap

- [x] Real table anchoring that works without ARCore (8th Wall SLAM)
- [ ] Wow effects: portal entrance, sparks on grab, dust on landing
- [ ] Multiplayer: two phones, one shared table
- [ ] Two hands: pinch with both to scale objects
- [ ] "Menga ajdaho yasab ber" — say what you want and it appears (Claude + a 3D model library / text-to-3D)
- [ ] Registan and other Uzbek landmarks as 3D models
- [ ] Installable Android app (PWA → APK with PWABuilder)

## Credits & licenses

- Code: MIT — see [LICENSE](LICENSE).
- [Three.js](https://threejs.org) — MIT.
- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) — Apache-2.0. The hand model is downloaded from Google's model storage at runtime.
- **AR tracking: 8th Wall Engine (Distributed Engine Binary) © 2026 Niantic Spatial, Inc.**, created by Niantic Spatial and used unmodified under the [XR Engine License Agreement](https://github.com/8thwall/engine/blob/main/LICENSE). The engine is provided "as is", without warranties — see the license for the full disclaimer. It is loaded at runtime from the `@8thwall/engine-binary` npm package and is not part of this repository or its MIT license. Qoʻl AR is not affiliated with or endorsed by Niantic Spatial.
- [XRExtras](https://www.npmjs.com/package/@8thwall/xrextras) — MIT.
