# Qoʻl AR

**Grab 3D objects in the real world with your bare hands — right in your phone's browser.**
No app store, no headset, no controllers. Open the link, point your phone at a table, show your other hand to the camera, and pinch.

> *Qoʻl* means "hand" in Uzbek.

**Oʻzbekcha:** Telefon kamerasi orqali haqiqiy stol ustidagi 3D buyumlarni oʻz qoʻlingiz bilan ushlang, buring va uloqtiring. Hammasi brauzerda, telefoningizning oʻzida ishlaydi.

## What it does (v0.1)

- **Bare-hand tracking** on the phone itself with MediaPipe Hand Landmarker (21 points per hand, GPU when available).
- **Pinch to grab**, move your hand to carry, **twist your wrist to rotate**, open your fingers to drop — or flick to **throw**.
- **Depth from hand size**: bring your hand closer to the camera and the object comes closer.
- **Gyroscope lock**: turn the phone and the objects stay where they were in the room.
- **Shadows on your real table**, simple physics (gravity, bounces, objects bump into each other).
- A tiny **Kalon-style minaret** among the toys 🕌
- **Finger fallback**: no hand detected? Drag and fling objects with your finger on the screen.
- Uzbek and English interface. Video never leaves the device.

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

No build step: plain ES modules. Three.js and MediaPipe load from jsDelivr (pinned versions).

## How it works

```
camera ──► MediaPipe Hand Landmarker ──► HandGesture (pinch, cursor, size→depth, roll)
                                              │  smoothed with One Euro filters
phone gyro ──► GyroCamera ──► Three.js camera │
                                              ▼
                              World: grab / move / rotate / throw, physics, shadows
```

| File | What's in it |
| --- | --- |
| `src/main.js` | Start flow, camera, main loop, grabbing logic, overlay drawing |
| `src/hands.js` | MediaPipe setup and the pinch / depth / roll gesture state |
| `src/world.js` | Three.js scene, the toys, physics, picking |
| `src/gyro.js` | Phone orientation → camera rotation |
| `src/filter.js` | One Euro filter for jitter-free hand motion |
| `src/i18n.js` | Uzbek and English strings |

## Roadmap

- [ ] Real table anchoring with WebXR / ARCore (objects stay put when you *walk* around, not just turn)
- [ ] Two hands: pinch with both to scale objects
- [ ] "Menga ajdaho yasab ber" — say what you want and it appears (Claude + a 3D model library / text-to-3D)
- [ ] Registan and other Uzbek landmarks as 3D models
- [ ] Installable Android app (PWA → APK with PWABuilder)

## Credits & licenses

- Code: MIT — see [LICENSE](LICENSE).
- [Three.js](https://threejs.org) — MIT.
- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) — Apache-2.0. The hand model is downloaded from Google's model storage at runtime.
