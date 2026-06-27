# CrunchyFake Anime Companion — Design Spec

- **Date:** 2026-06-27
- **Status:** Approved (brainstorm complete)
- **Project type:** Hackathon build (Sony / Crunchyroll), ~a few days
- **Working name:** CrunchyFake Anime Companion

## 1. Overview

A virtual **3D anime companion** that lives inside a Crunchyroll-style website. The
companion is a voice-driven AI buddy (speech-in / speech-out, with lip-sync) that
**knows the user's watch history** and **proactively reminds them when a new episode
drops**. It is built as an embeddable widget on a dummy "CrunchyFake" site.

The companion's standout behaviors, versus a generic AI avatar demo:

1. **Watch-history-aware conversation** — it can discuss shows the user is watching.
2. **Proactive new-episode reminder** — on open, it speaks first and hooks the user on
   a freshly-released episode.

### Goal

A polished, reliable local demo that a hackathon judge can experience end-to-end in
under a minute: open the site, click the companion, hear it greet them by their taste
and flag a new episode, then have a voice conversation about a show.

## 2. Requirements

### Functional

- **F1. Dummy site.** A Crunchyroll-style site (home / browse / show pages) with mocked
  content, running locally.
- **F2. Embeddable companion.** A self-contained companion widget that mounts on the
  site. Entry point is a small floating button (bottom-right).
- **F3. Immersive stage.** Clicking the button expands into a **full-screen takeover**
  stage with the 3D avatar centered and a dimmed backdrop. Closing collapses back to
  the small button.
- **F4. 3D VRM avatar.** A true 3D anime avatar rendered via `pixiv/three-vrm`, using a
  free sample/CC-BY VRM model. (Not Live2D.)
- **F5. Full voice conversation.** Speech-in via the browser (Web Speech API STT);
  speech-out via a cloud TTS provider; lip-sync driven from the TTS audio.
- **F6. Proactive greeting on open.** When the immersive stage opens, the companion
  **speaks first**: a watch-history-aware greeting that surfaces a "new episode just
  dropped" hook.
- **F7. Watch-history awareness.** The companion's replies are grounded in the user's
  (mocked) watch history, injected into the system prompt.
- **F8. Streaming, low-latency replies.** LLM output is streamed and **sentence-chunked
  into TTS** so the avatar begins speaking before the full reply is generated.
- **F9. Barge-in / stop.** The user can stop the companion mid-utterance (abort stream
  + stop audio).
- **F10. Typed-chat fallback.** If the mic is unavailable/denied, the user can type.

### Non-functional

- **N1. API-key safety.** LLM/TTS keys live only in the backend; never shipped to the
  browser.
- **N2. Provider-agnostic LLM.** The backend talks to any **OpenAI-compatible**
  endpoint; swappable via config.
- **N3. Reliability for a live demo.** Every failure mode degrades gracefully (see
  Section 8) — no dead-ends in front of judges.
- **N4. Single JS/TS stack.** Frontend and backend are both TypeScript.
- **N5. Local-only.** Runs on localhost for the demo; no production deploy infra.

## 3. Out of scope (YAGNI)

- Real Crunchyroll API integration or authentication.
- Multi-user accounts or persistent memory/database. (Watch history is mocked,
  in-memory.)
- Desktop client / transparent overlay / "pet mode".
- Live2D support (we use 3D VRM only).
- Mobile-specific polish or responsive tuning beyond "works on the demo laptop".
- Production deployment, CI/CD, autoscaling.

## 4. Approach chosen

**Approach 1 — Build fresh, thin, and embeddable (single JS/TS stack).**

Three strategies were considered; see Section 12 for the rationale and the rejected
alternatives. The chosen approach builds a purpose-fit, embeddable companion from
standard pieces, using the popular `Open-LLM-VTuber` project (11.9k stars, MIT) only as
**inspiration for persona/prompt patterns and the proactive-speaking idea** — not as
forked code, because that project is Live2D-based (not 3D VRM) and is a standalone
heavyweight app (not an embeddable widget).

## 5. Architecture

Three swimlanes:

```
Browser (localhost)              Node Proxy Backend              Cloud (your keys)
-----------------                ------------------              -----------------
CrunchyFake Site Shell           PersonaPromptBuilder            OpenAI-compatible LLM
  |                              LLMProxy (streaming)            TTS Provider
CompanionWidget (embed)          TTSProxy                        (STT is in-browser)
  |- VRMStage (three-vrm)        MockDataService
  |- VoiceController (STT/play)  Greeter
  |- ConversationClient          SessionRouter (HTTP/WS)
```

- The **browser** runs the dummy site and the embeddable companion widget (VRM render,
  mic STT, audio playback, transport).
- The **Node backend** is a thin proxy: it holds API keys, builds the system prompt from
  persona + watch history, streams the LLM, synthesizes TTS, serves mock data, and
  produces the proactive greeting on session open.
- The **cloud** provides the OpenAI-compatible LLM and TTS. STT stays in-browser.

### Why this shape

- Keys never reach the browser.
- Persona and watch history live server-side (trivial to swap per-user later).
- STT in-browser removes a whole service and its latency.
- The widget is self-contained, so it mounts on any page of the dummy site.

## 6. Components & modules

Each unit has one job, a clear interface, and is independently testable.

### Frontend (`web/`, React + Vite + TypeScript)

- **Site Shell** — the dummy Crunchyroll site (home/browse/show pages, mocked catalog).
  - *Interface:* routes/pages that mount `<CompanionWidget/>`.
  - *Depends on:* nothing companion-specific.
- **`CompanionWidget`** — the embeddable root; owns collapsed (small button) and
  expanded (immersive stage) state. The immersive stage renders the avatar, a live
  transcript, and a **text input** (shown when mic/STT is unavailable, or toggleable by
  the user) to satisfy the typed-chat fallback (F10).
  - *Interface:* `<CompanionWidget/>` drop-in component.
  - *Depends on:* VRMStage, VoiceController, ConversationClient.
- **`VRMStage`** — loads/renders the VRM model via `three-vrm`; idle animation +
  lip-sync.
  - *Interface:* `load(url)`, `speak(audio)` (drives visemes from amplitude).
  - *Depends on:* three.js, three-vrm.
- **`VoiceController`** — mic capture + Web Speech STT; plays TTS audio; stop/barge-in.
  - *Interface:* `startListening(onTranscript)`, `play(audio, onViseme)`, `stop()`.
  - *Depends on:* Web Speech API, AudioContext.
- **`ConversationClient`** — transport to backend; streams text in and tokens/audio out.
  - *Interface:* `openSession()` -> greeting, `send(text)` -> stream.
  - *Depends on:* backend API.
- **`lipSync.ts`** (pure) — maps audio amplitude to VRM viseme/blendshape weights.
  Extracted as a pure function so it is unit-testable.

### Backend (`server/`, Node + Fastify + TypeScript)

- **`PersonaPromptBuilder`** (pure) — assembles the system prompt from persona + watch
  history + the new-episode hook.
  - *Interface:* `build({persona, watchHistory, newEpisodes})` -> string.
- **`LLMProxy`** — OpenAI-compatible streaming chat adapter.
  - *Interface:* `chat({system, messages, signal})` -> `AsyncIterable<string>`.
- **`TTSProxy`** — text-to-speech adapter (swappable provider).
  - *Interface:* `synthesize(text)` -> audio stream or URL.
- **`MockDataService`** (pure data) — demo watch list + "new episode just dropped"
  flags.
  - *Interface:* `getWatchHistory()`, `getNewEpisodes()`.
- **`Greeter`** — on session open, produces the proactive first utterance.
  - *Interface:* `generateGreeting()` -> string.
  - *Behavior:* by default the greeting is **LLM-generated** via `PersonaPromptBuilder`
    + `LLMProxy` for a natural, watch-history-specific line; if the LLM call is slow or
    fails, fall back to a **templated** greeting so the proactive moment still fires.
  - *Depends on:* PersonaPromptBuilder, LLMProxy.
- **`SessionRouter`** — thin HTTP/WS entrypoint: open -> greeting; user text -> LLM
  stream -> sentence-chunked TTS -> audio out. Intentionally thin; orchestration only.
- **`sentenceChunker.ts`** (pure) — splits an incoming token stream into sentence
  boundaries for TTS.

### Shared

- **`shared/types.ts`** — message, watch-history, and persona types shared by frontend
  and backend so both sides speak the same shapes.

### Testability

`PersonaPromptBuilder`, `MockDataService`, `Greeter` templating, `sentenceChunker`, and
`lipSync` are pure -> fast unit tests, no network. `LLMProxy` and `TTSProxy` are thin
adapters -> test against mocked SDKs.

## 7. Data flow

### Phase A — Open -> proactive greeting (the wow moment)

1. **User** clicks the small button -> **Widget** expands to the immersive stage. (This
   click is a user gesture, which unlocks audio playback — no autoplay block.)
2. **Widget -> Backend:** `openSession()`.
3. **Greeter** builds the greeting from persona + watch history + new-episode flag.
4. **Backend -> LLM:** generate the greeting line (LLM-generated by default; templated
   fallback if the LLM is slow or fails).
5. **Backend -> TTS:** `synthesize(greeting)` -> audio.
6. **Backend -> Widget:** greeting text + audio.
7. **VRMStage** lip-syncs; **VoiceController** plays audio. The companion speaks first.

### Phase B — Conversation loop (streaming)

8. **User** speaks -> **VoiceController** STT -> transcript.
9. **Widget -> Backend:** `send(transcript)`.
10. **PersonaPromptBuilder** assembles the system prompt (persona + watch history +
    new-episode context).
11. **Backend -> LLM:** stream tokens.
12. As tokens accumulate into sentences -> **TTS** synthesizes each sentence.
    (Sentence-chunking lowers perceived latency: speech starts before the full reply.)
13. **Backend -> Widget:** streamed audio chunks + live transcript text.
14. **VRMStage** lip-syncs each chunk; **VoiceController** plays; transcript updates.
15. Loop back to step 8 until the user closes or stops.

### Phase C — Barge-in / stop

16. User clicks Stop (or starts speaking) -> `VoiceController.stop()` aborts the LLM
    stream (AbortController), stops audio, and freezes lip-sync.

### Latency/reliability tricks

- **Sentence-chunked TTS** — speech begins before the full LLM reply is generated.
- **Greeting rides the open click** — a user gesture — so audio plays reliably across
  browsers.

## 8. Error handling & degradation

Every failure degrades; the demo never dead-ends.

- **Mic denied / unavailable** -> show a clear message and fall back to typed-chat input
  (F10). The demo still works.
- **STT unsupported** (e.g., non-Chrome) -> typed-chat fallback (or optional cloud STT).
- **LLM error / timeout / bad key** -> the companion speaks a graceful in-character line
  (e.g., "whoops, brain glitch — say that again?") plus a retry affordance; no raw stack
  traces.
- **TTS failure** -> render the reply as live transcript text (silent but functional).
- **VRM model fails to load** -> voice and transcript still run behind a placeholder
  visual.
- **Network drops mid-stream** -> abort, show "reconnect," auto-resume on restore.
- **Audio playback blocked** -> greeting is gated on the open-click gesture (already in
  the design); if still blocked, show an "enable sound" affordance.

## 9. Testing strategy

- **Unit (Vitest) — the pure core:** `PersonaPromptBuilder` (assert output contains
  persona tone + watch-history references + the new-episode hook), `MockDataService`
  (shape), `Greeter` templating, `sentenceChunker` (correct sentence boundaries), and
  `lipSync` (amplitude -> viseme weights).
- **Adapter tests (mocked SDKs):** `LLMProxy` streaming + error paths; `TTSProxy`
  success and failure.
- **Light integration:** `SessionRouter` with mocked LLM/TTS -> assert the greeting
  fires on open and a streamed turn completes.
- **Manual demo script (checklist before recording/judging):** mic permission granted ->
  open -> greeting speaks first -> ask about a watched show (history-aware reply) ->
  trigger new-episode -> barge-in/stop -> close and reopen.

**Principle:** anything time-sensitive or browser-API-heavy (VRM render, mic, audio) is
covered by the manual demo script; everything else is unit-tested. Lip-sync math is a
pure function so it escapes the "untestable" bucket.

## 10. Project structure

```
gs26-anime-companion/
  web/                      # Vite + React + TS (dummy site + widget)
    src/
      site/                 # CrunchyFake shell: home/browse/show pages
      companion/            # the embeddable widget
        CompanionWidget.tsx # small button <-> immersive stage
        VRMStage.tsx        # three-vrm render + idle
        VoiceController.ts  # mic STT + audio playback + stop
        ConversationClient.ts
        lipSync.ts          # pure: amplitude -> viseme weights
    public/models/*.vrm     # free CC-BY/sample VRM model(s)
  server/                   # Node + TS backend proxy
    src/
      PersonaPromptBuilder.ts   # pure
      LLMProxy.ts               # OpenAI-compatible streaming
      TTSProxy.ts               # swappable provider
      MockDataService.ts        # demo watch list + new-ep flag
      Greeter.ts
      SessionRouter.ts          # thin HTTP/WS entrypoint
      sentenceChunker.ts        # pure
  shared/types.ts           # messages, watchHistory, persona
  docs/superpowers/specs/   # this design + implementation plan
```

## 11. Concrete tech choices

- **Frontend:** React 18 + Vite + TypeScript; `three` + `@pixiv/three-vrm` (MIT); Web
  Speech API (built-in); Vitest + React Testing Library.
- **Backend:** Node 20 + Fastify + TypeScript; the **OpenAI SDK** pointed at any
  OpenAI-compatible endpoint; TTS behind the `TTSProxy` interface (default **OpenAI TTS
  `tts-1`** if using OpenAI; swap to Azure / ElevenLabs freely); Zod for request
  validation; `tsx` for dev.
- **Config:** `.env` with `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, and `TTS_*` vars;
  persona + demo watch-history as data files.

### Persona & demo data

- **Persona:** name **Kira** — energetic otaku buddy; casual banter; reacts big to plot
  beats. TTS: a bright voice.
- **Demo watch history:** *Frieren: Beyond Journey's End*, *Jujutsu Kaisen*, *Demon
  Slayer*.
- **New-episode trigger:** *Jujutsu Kaisen* — "new episode just dropped" — the
  proactive greeting hooks on this.
- **VRM model:** a free sample or CC-BY VRM (e.g., three-vrm samples or VRoid Hub
  CC-BY). **License note:** like Live2D, VRM models carry their own licenses — only
  free / CC-BY models are used, and they are credited.

## 12. Key decisions & rationale

- **3D VRM over Live2D.** The user explicitly wanted a 3D companion. `pixiv/three-vrm`
  is the de-facto open standard for 3D anime avatars (MIT, widely used). Live2D is 2.5D.
- **Build fresh rather than fork Open-LLM-VTuber.** The most popular repo (11.9k stars,
  MIT) is Live2D-based and a standalone heavyweight app — both clash with the two hard
  requirements (3D VRM; embeddable widget). Forking + swapping Live2D->VRM + embedding
  its non-widget frontend was judged highest-risk for a few-day timeline. Reusing its
  Python backend with a fresh VRM frontend (a considered alternative) was rejected to
  keep a single JS/TS stack and full control of the embeddable widget — the centerpiece
  of the demo.
- **STT in-browser.** Removes a service and its latency; the Web Speech API is free and
  dependency-free. Cloud STT remains an optional fallback.
- **Sentence-chunked streaming TTS.** The single biggest perceived-latency win for a
  voice companion.
- **Greeting on the open-click gesture.** Sidesteps browser autoplay restrictions so the
  proactive greeting reliably plays.
- **Typed-chat fallback.** Guarantees the demo works even if the mic or STT fails in the
  judging environment.

## 13. Risks & open items

- **VRM lip-sync quality.** Amplitude-driven visemes are simple but can look coarse.
  Risk is cosmetic only; the `lipSync` pure function can be upgraded (e.g., viseme
  estimation) without changing interfaces.
- **Web Speech API support.** Chrome/Edge are fine; other browsers vary. Mitigated by
  the typed-chat fallback (F10).
- **TTS latency/quality by provider.** Pinned behind the `TTSProxy` interface so the
  provider can be swapped without touching callers.
- **VRM model licensing.** Must source a free/CC-BY model and credit it; flagged for
  implementation time.
- **Open LLM endpoint specifics.** Exact `LLM_BASE_URL` / model name will be supplied by
  the user's provider; the design assumes OpenAI-compatible streaming only.

## 14. References

- `pixiv/three-vrm` — VRM rendering for three.js (MIT). https://github.com/pixiv/three-vrm
- `Open-LLM-VTuber/Open-LLM-VTuber` — reference for persona/proactive-speaking patterns
  (MIT; Live2D-based, not used directly). https://github.com/Open-LLM-VTuber/Open-LLM-VTuber
- Web Speech API (MDN) — in-browser STT.
