# CrunchyFake Anime Companion

A 3D VRM anime companion embedded in a Crunchyroll-style demo site. Full voice
(speech-in / speech-out + lip-sync), watch-history-aware chat, and a proactive
new-episode greeting on open.

## Setup

1. `npm install`
2. `cp server/.env.example server/.env` and fill in `MESH_API_KEY`, `MESH_LLM_MODEL`, `MESH_TTS_*`, `OPENROUTER_API_KEY`, and `OPENROUTER_LLM_MODEL`.
3. A sample VRM model is already at `web/public/models/sample.vrm`. Replace it if you want a different avatar and update `web/public/models/CREDITS.md`.

## Run (demo)

- Backend: `npm run dev:server` (default `:8787`)
- Frontend: `npm run dev:web` (Vite proxies `/session` to the backend)

Open the Vite URL in a Chromium-based browser (Web Speech STT is required). Click the
floating bubble in the bottom-right to open the companion — it greets you first and
flags the newest episode from your watch history.

## Tests / types

- `npm test`
- `npm run typecheck`

## Architecture

- `shared/` — TypeScript types used by both frontend and backend.
- `server/` — Fastify backend: mock catalog/watch history, provider-agnostic LLM/TTS adapters, SSE streaming conversation.
- `web/` — Vite + React frontend: dummy Crunchyroll-style site, three-vrm avatar stage, Web Speech STT, Web Audio lip-sync.
