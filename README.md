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

Restart with `npx expo start -c` after editing `.env`.

## Bridge contract

Each robot laptop runs a small HTTP server:

- `GET /health` -> 200 when the robot is connected
- `POST /tools/<name>` with JSON args -> JSON result, ideally `{ "ok": true, ... }`
- `POST /tools/stop` must always work and return fast

Tool names and args live in `src/devices/index.ts`. Grok sees them as `dog_walk`, `arm_pick_place`, etc.

## Layout

```
App.tsx               screen
src/voice/session.ts  Grok realtime websocket, tool call loop
src/voice/useVoice.ts mic stream + session hook
src/voice/player.ts   plays Grok's replies
src/devices/          robot tools, bridge calls, simulator
src/components/       orb, bottom bar, device chips, log
```

## Known limits

- Replies are played once fully received, not streamed. Fine for short answers.
- Mic is ignored while Groky is talking, so you can't interrupt by voice. Use the stop button.
- Response format of the token endpoint isn't documented; `session.ts` accepts `value`, `client_secret.value` or `token`.
