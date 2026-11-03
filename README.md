# Groky

Voice remote for a robot dog and a robot arm, built on Grok Voice. Made for the Grok Hackathon at Ctrl+Alt Museum, Pavia (Nov 2026).

You talk to the phone, Grok decides what to do, the app calls the robot bridges, and Grok tells you how it went. The log screen keeps track of every action with success rate and latency.

## Run it

Needs Node 20+ and Expo Go on an Android or iOS device on the same wifi as your laptop.

```sh
npm install
cp .env.example .env   # fill in at least one of TOKEN_URL / XAI_API_KEY
npx expo start
```

Scan the QR code with Expo Go. If the venue wifi blocks device-to-device traffic, use `npx expo start --tunnel`.

## Config (.env)

| var | what |
| --- | --- |
| `EXPO_PUBLIC_TOKEN_URL` | our backend endpoint that mints a short-lived Grok Voice token (`POST https://api.x.ai/v1/realtime/client_secrets`). Use this for anything shown to other people. |
| `EXPO_PUBLIC_XAI_API_KEY` | quick dev fallback. Gets bundled into the app, so keep it on our own devices. |
| `EXPO_PUBLIC_DOG_URL`, `EXPO_PUBLIC_ARM_URL` | robot bridges, e.g. `http://192.168.1.20:8000`. Empty = simulated robot. |
| `EXPO_PUBLIC_BRIDGE_KEY` | sent as `X-Bridge-Key` to the bridges |
| `EXPO_PUBLIC_CAMERAS` | extra cameras, `Name=url,Name=url`. Each url returns one JPEG. |
| `EXPO_PUBLIC_GROK_VISION_MODEL` | model for camera questions, default `grok-4.7` |
| `EXPO_PUBLIC_VISION_URL` | optional backend proxy for vision, same body as `POST /v1/responses` |

Restart with `npx expo start -c` after editing `.env`.

## Bridge contract

Each robot laptop runs a small HTTP server:

- `GET /health` -> 200 when the robot is connected
- `POST /tools/<name>` with JSON args -> JSON result, ideally `{ "ok": true, ... }`
- `POST /tools/stop` must always work and return fast
- `GET /camera.jpg` -> latest frame as JPEG (optional, shows up as a camera automatically)

Tool names and args live in `src/devices/index.ts`. Grok sees them as `dog_walk`, `arm_pick_place`, etc.

## Cameras

The Talk screen (tablet) and the Cameras tab show a live feed: the tablet's own camera, each bridge's `/camera.jpg`,
and anything in `EXPO_PUBLIC_CAMERAS`. A phone running the Android "IP Webcam" app makes a quick external camera:
`Overhead=http://<phone-ip>:8080/shot.jpg`.

"Show Grok" sends the current frame to Grok vision and tells the voice agent what it saw. Grok can also look by itself
through the `camera_look` tool, e.g. to check a pick worked. Every step (heard, decided, robot call, camera, answer)
shows up in the activity panel with timings.

## Layout

```
App.tsx              shell: sidebar, top bar, tab switching
src/screens/         Talk, Cameras, Robots, History
src/components/      orb, camera panel, activity timeline, log, sidebar, ...
src/hooks/           useVoice, useCamera, useDevices, useHistory
src/voice/           Grok realtime session, prompt, audio helpers
src/devices/         tool definitions, bridge client, simulator
src/lib/             config, vision, cameras, small helpers
```

`npm run lint`, `npm run typecheck` and `npm run format` before pushing.

## Known limits

- Replies are played once fully received, not streamed. Fine for short answers.
- Mic is ignored while Groky is talking, so you can't interrupt by voice. Use the stop button.
- Response format of the token endpoint isn't documented; `session.ts` accepts `value`, `client_secret.value` or `token`.
