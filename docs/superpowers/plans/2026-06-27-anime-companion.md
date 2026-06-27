# CrunchyFake Anime Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3D VRM anime companion widget embedded in a Crunchyroll-style demo site, with full voice (Web Speech STT in / cloud TTS out + lip-sync), watch-history-aware conversation, and a proactive new-episode greeting on open.

**Architecture:** Single TS monorepo (npm workspaces): a `web/` Vite+React app (dummy site + embeddable companion widget using `three` + `@pixiv/three-vrm`) and a `server/` Node+Fastify proxy that holds API keys, streams an OpenAI-compatible LLM, synthesizes TTS, injects persona + mock watch history, and emits the proactive greeting. STT runs in-browser; LLM replies are sentence-chunked into TTS over SSE for low latency.

**Tech Stack:** TypeScript, React 18 + Vite, three.js + @pixiv/three-vrm, Web Speech API; Node 20 + Fastify + OpenAI SDK + Zod; Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-06-27-anime-companion-design.md`

---

## File Structure

```
gs26-anime-companion/
  package.json              # npm workspaces root
  .env.example              # documented env vars (committed)
  tsconfig.base.json
  shared/
    package.json
    src/types.ts            # Persona, WatchShow, NewEpisode, ChatMessage, StreamEvent, OpenSessionResponse
    src/index.ts            # re-exports
  server/
    package.json
    tsconfig.json
    src/index.ts            # build Fastify + start
    src/env.ts              # zod-validated env
    src/sse.ts              # writeSse helper
    src/sessions.ts         # in-memory session store
    src/persona/persona.ts  # Kira persona data
    src/persona/PersonaPromptBuilder.ts
    src/data/watchHistory.ts# demo watch list + new-ep
    src/data/MockDataService.ts
    src/greeter/Greeter.ts
    src/llm/LLMProxy.ts
    src/tts/TTSProxy.ts
    src/util/sentenceChunker.ts
    src/routes/sessions.ts  # POST /session/open, POST /session/:id/send (SSE)
    test/*.test.ts
  web/
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    src/main.tsx
    src/App.tsx             # site shell + routes
    src/site/catalog.ts     # mock show catalog
    src/site/Home.tsx
    src/site/Browse.tsx
    src/site/Show.tsx
    src/companion/types.ts
    src/companion/lipSync.ts        # pure: amplitude -> viseme weights
    src/companion/sseParser.ts      # pure: SSE chunk parser
    src/companion/ConversationClient.ts
    src/companion/VoiceController.ts
    src/companion/VRMStage.tsx
    src/companion/CompanionWidget.tsx
    src/companion/companion.css
    public/models/       # free VRM model(s) + CREDITS.md
    src/test-setup.ts
    test/*.test.ts
```

**Responsibility boundaries:** `shared/` owns types only (no runtime deps except zod). `server/` pure modules (`sentenceChunker`, `PersonaPromptBuilder`, `MockDataService`, `Greeter` orchestration) are unit-tested; adapters (`LLMProxy`, `TTSProxy`) tested against mocked SDKs; routes tested with `fastify.inject`. `web/` pure utils (`lipSync`, `sseParser`) unit-tested; browser-API code (`VoiceController`, `VRMStage`) covered by the manual demo script.

---

## Task 1: Monorepo scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.env.example`, `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`

- [ ] **Step 1: Root package.json (npm workspaces)**

Create `package.json`:

```json
{
  "name": "gs26-anime-companion",
  "private": true,
  "workspaces": ["shared", "server", "web"],
  "scripts": {
    "dev:server": "npm -w server run dev",
    "dev:web": "npm -w web run dev",
    "build": "npm -w shared build && npm -w server build && npm -w web build",
    "test": "npm -w shared test && npm -w server test && npm -w web test",
    "typecheck": "npm -w shared run typecheck && npm -w server run typecheck && npm -w web run typecheck"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 2: Shared tsconfig base**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: .env.example**

Create `.env.example`:

```
# Copy to server/.env and fill in. Never commit server/.env.
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-replace-me
LLM_MODEL=gpt-4o-mini

# TTS provider: "openai" (default). Swap implementation in src/tts/TTSProxy.ts if different.
TTS_PROVIDER=openai
TTS_MODEL=tts-1
TTS_VOICE=alloy

# Where the web app calls the backend. Vite injects VITE_API_BASE for the frontend.
PORT=8787
```

- [ ] **Step 4: shared package**

Create `shared/package.json`:

```json
{
  "name": "@crunchyfake/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

Create `shared/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022"], "noEmit": true },
  "include": ["src"]
}
```

Create `shared/src/index.ts`:

```ts
export * from "./types";
```

- [ ] **Step 5: Install + verify**

Run: `npm install`
Expected: installs workspaces; no errors.

Run: `npm -w shared run typecheck`
Expected: passes (no inputs yet, exit 0).

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.base.json .env.example shared
git commit -m "chore: monorepo scaffold with shared workspace"
```

---

## Task 2: Shared types

**Files:**
- Create: `shared/src/types.ts`
- Test: `shared/test/types.test.ts` (compile-time type smoke test)

- [ ] **Step 1: Write the type smoke test**

Create `shared/test/types.test.ts`:

```ts
import { describe, it, expectTypeOf } from "vitest";
import type {
  Persona, WatchShow, NewEpisode, ChatMessage,
  StreamEvent, OpenSessionResponse,
} from "../src/types";

describe("shared types", () => {
  it("Persona has required fields", () => {
    const p: Persona = { name: "Kira", description: "energetic otaku", voice: "alloy" };
    expectTypeOf(p.name).toEqualTypeOf<string>();
  });

  it("WatchShow status is the union", () => {
    const s: WatchShow = { id: "jjk", title: "Jujutsu Kaisen", status: "watching", lastEpisode: 5 };
    expectTypeOf(s.status).toEqualTypeOf<"watching" | "caught_up">();
  });

  it("StreamEvent variants", () => {
    const a: StreamEvent = { type: "sentence", text: "hi" };
    const b: StreamEvent = { type: "audio", text: "hi", audioBase64: "AAAA", mime: "audio/mpeg" };
    const c: StreamEvent = { type: "done" };
    const d: StreamEvent = { type: "error", message: "boom" };
    expectTypeOf(a.type).toEqualTypeOf<"sentence">();
    expectTypeOf(b.audioBase64).toEqualTypeOf<string>();
    expectTypeOf(c.type).toEqualTypeOf<"done">();
    expectTypeOf(d.message).toEqualTypeOf<string>();
  });

  it("OpenSessionResponse shape", () => {
    const r: OpenSessionResponse = {
      sessionId: "s1",
      greeting: { text: "hey!", audioBase64: "AAAA", mime: "audio/mpeg" },
    };
    expectTypeOf(r.greeting.text).toEqualTypeOf<string>();
    const _m: ChatMessage = { role: "user", content: "hi" };
    void r; void _m;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w shared test`
Expected: FAIL — `Cannot find module '../src/types'`.

- [ ] **Step 3: Implement the types**

Create `shared/src/types.ts`:

```ts
export interface Persona {
  name: string;
  description: string;
  voice: string;
}

export type WatchStatus = "watching" | "caught_up";

export interface WatchShow {
  id: string;
  title: string;
  status: WatchStatus;
  lastEpisode: number;
  notes?: string;
}

export interface NewEpisode {
  showId: string;
  title: string;
  episode: number;
  episodeTitle?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OpenSessionResponse {
  sessionId: string;
  greeting: { text: string; audioBase64: string; mime: string };
}

export type StreamEvent =
  | { type: "sentence"; text: string }
  | { type: "audio"; text: string; audioBase64: string; mime: string }
  | { type: "done" }
  | { type: "error"; message: string };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w shared test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): add core domain types"
```

---

## Task 3: Backend bootstrap (env + Fastify + health)

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/env.ts`, `server/src/index.ts`, `server/test/health.test.ts`

- [ ] **Step 1: server package.json**

Create `server/package.json`:

```json
{
  "name": "@crunchyfake/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@crunchyfake/shared": "*",
    "fastify": "^4.28.1",
    "openai": "^4.60.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.15.7",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

Create `server/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write the failing health test**

Create `server/test/health.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildServer } from "../src/index";

describe("health", () => {
  it("GET /health returns ok", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm -w server install && npm -w server test`
Expected: FAIL — `Cannot find module '../src/index'`.

- [ ] **Step 4: Implement env + server builder**

Create `server/src/env.ts`:

```ts
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1),
  TTS_PROVIDER: z.string().default("openai"),
  TTS_MODEL: z.string().default("tts-1"),
  TTS_VOICE: z.string().default("alloy"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error("Invalid env:\n" + parsed.error.toString());
  }
  return parsed.data;
}
```

Create `server/src/index.ts`:

```ts
import Fastify, { type FastifyInstance } from "fastify";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });
  app.get("/health", async () => ({ status: "ok" }));
  return app;
}

async function start() {
  const { loadEnv } = await import("./env.js");
  const env = loadEnv();
  const app = buildServer();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm -w server test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): Fastify bootstrap with health route"
```

---

## Task 4: sentenceChunker (pure, TDD)

**Files:**
- Create: `server/src/util/sentenceChunker.ts`
- Test: `server/test/sentenceChunker.test.ts`

**Behavior:** A stateful accumulator that is fed token strings and emits complete sentences. Sentences end at `.`, `!`, `?` (followed by optional whitespace) OR when length exceeds a safety cap (e.g., 220 chars) so long LLM runs without punctuation still get flushed.

- [ ] **Step 1: Write the failing test**

Create `server/test/sentenceChunker.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSentenceChunker } from "../src/util/sentenceChunker";

function feed(chunks: string[]): string[] {
  const c = createSentenceChunker();
  const out: string[] = [];
  for (const ch of chunks) for (const s of c.push(ch)) out.push(s.trim());
  out.push(...c.flush().map((s) => s.trim()));
  return out;
}

describe("sentenceChunker", () => {
  it("emits nothing for a fragment with no terminator", () => {
    expect(feed(["hello there"])).toEqual([]);
  });

  it("emits on . ! ?", () => {
    expect(feed(["Hello! ", "How are you? ", "I am fine. "])).toEqual([
      "Hello!", "How are you?", "I am fine.",
    ]);
  });

  it("reassembles a sentence split across tokens", () => {
    expect(feed(["Jujutsu", " Kaisen", " is", " wild", "!"])).toEqual(["Jujutsu Kaisen is wild!"]);
  });

  it("flushes trailing partial on flush()", () => {
    expect(feed(["leftover partial"])).toEqual(["leftover partial"]);
  });

  it("force-flushes long runs without punctuation", () => {
    const long = "a".repeat(250);
    expect(feed([long])).toEqual([long]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server test sentenceChunker`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/src/util/sentenceChunker.ts`:

```ts
const MAX_LEN = 220;

export function createSentenceChunker() {
  let buffer = "";
  return {
    push(token: string): string[] {
      buffer += token;
      const out: string[] = [];
      const re = /[^.!?]*[.!?]+(?:\s+|$)/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(buffer)) !== null) {
        out.push(match[0]);
        buffer = buffer.slice(match.index + match[0].length);
        re.lastIndex = 0;
      }
      while (buffer.length >= MAX_LEN) {
        const cut = buffer.lastIndexOf(" ", MAX_LEN);
        const idx = cut > 0 ? cut : MAX_LEN;
        out.push(buffer.slice(0, idx));
        buffer = buffer.slice(idx).replace(/^\s+/, "");
      }
      return out;
    },
    flush(): string[] {
      const trimmed = buffer.trim();
      buffer = "";
      return trimmed ? [trimmed] : [];
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server test sentenceChunker`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/util server/test/sentenceChunker.test.ts
git commit -m "feat(server): sentence chunker for streaming TTS"
```

---

## Task 5: Mock data service + demo data (pure, TDD)

**Files:**
- Create: `server/src/data/watchHistory.ts`, `server/src/data/MockDataService.ts`
- Test: `server/test/MockDataService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/MockDataService.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MockDataService } from "../src/data/MockDataService";

describe("MockDataService", () => {
  const svc = new MockDataService();

  it("returns the demo watch list", () => {
    const list = svc.getWatchHistory("demo");
    expect(list.map((s) => s.title)).toEqual([
      "Frieren: Beyond Journey's End", "Jujutsu Kaisen", "Demon Slayer",
    ]);
    expect(list[0].status).toBe("watching");
  });

  it("returns the one new episode", () => {
    const eps = svc.getNewEpisodes("demo");
    expect(eps).toHaveLength(1);
    expect(eps[0].title).toBe("Jujutsu Kaisen");
    expect(eps[0].episode).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server test MockDataService`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement demo data + service**

Create `server/src/data/watchHistory.ts`:

```ts
import type { WatchShow, NewEpisode } from "@crunchyfake/shared";

export const demoWatchHistory: WatchShow[] = [
  { id: "frieren", title: "Frieren: Beyond Journey's End", status: "watching", lastEpisode: 12,
    notes: "loved the quiet melancholy of the funeral arc" },
  { id: "jjk", title: "Jujutsu Kaisen", status: "watching", lastEpisode: 34,
    notes: "Shibuya arc cliffhanger last week" },
  { id: "ds", title: "Demon Slayer", status: "caught_up", lastEpisode: 55 },
];

export const demoNewEpisodes: NewEpisode[] = [
  { showId: "jjk", title: "Jujutsu Kaisen", episode: 35, episodeTitle: "Right and Wrong, Part 2" },
];
```

Create `server/src/data/MockDataService.ts`:

```ts
import type { WatchShow, NewEpisode } from "@crunchyfake/shared";
import { demoWatchHistory, demoNewEpisodes } from "./watchHistory";

export class MockDataService {
  getWatchHistory(_userId = "demo"): WatchShow[] {
    return demoWatchHistory.map((s) => ({ ...s }));
  }
  getNewEpisodes(_userId = "demo"): NewEpisode[] {
    return demoNewEpisodes.map((e) => ({ ...e }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server test MockDataService`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/data
git commit -m "feat(server): mock watch-history data service"
```

---

## Task 6: PersonaPromptBuilder (pure, TDD)

**Files:**
- Create: `server/src/persona/persona.ts`, `server/src/persona/PersonaPromptBuilder.ts`
- Test: `server/test/PersonaPromptBuilder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/PersonaPromptBuilder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/persona/PersonaPromptBuilder";
import { kiraPersona } from "../src/persona/persona";
import { MockDataService } from "../src/data/MockDataService";

const data = new MockDataService();

describe("PersonaPromptBuilder", () => {
  it("includes the persona name and tone instructions", () => {
    const p = buildSystemPrompt({ persona: kiraPersona, watchHistory: data.getWatchHistory(), newEpisodes: data.getNewEpisodes() });
    expect(p).toContain("Kira");
    expect(p.toLowerCase()).toContain("energetic");
  });

  it("includes every watched show title", () => {
    const p = buildSystemPrompt({ persona: kiraPersona, watchHistory: data.getWatchHistory(), newEpisodes: data.getNewEpisodes() });
    expect(p).toContain("Frieren");
    expect(p).toContain("Jujutsu Kaisen");
    expect(p).toContain("Demon Slayer");
  });

  it("references the new episode when present", () => {
    const p = buildSystemPrompt({ persona: kiraPersona, watchHistory: data.getWatchHistory(), newEpisodes: data.getNewEpisodes() });
    expect(p).toContain("new episode");
    expect(p).toContain("episode 35");
  });

  it("omits new-episode section when empty", () => {
    const p = buildSystemPrompt({ persona: kiraPersona, watchHistory: data.getWatchHistory(), newEpisodes: [] });
    expect(p).not.toContain("new episode");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server test PersonaPromptBuilder`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement persona + builder**

Create `server/src/persona/persona.ts`:

```ts
import type { Persona } from "@crunchyfake/shared";

export const kiraPersona: Persona = {
  name: "Kira",
  description:
    "An energetic otaku buddy. Speaks with casual, enthusiastic banter. " +
    "Reacts big to plot beats. Uses light weeb-friendly flavor but stays clear and warm. " +
    "Keeps replies short and conversational (1-3 sentences) for voice.",
  voice: "alloy",
};
```

Create `server/src/persona/PersonaPromptBuilder.ts`:

```ts
import type { Persona, WatchShow, NewEpisode } from "@crunchyfake/shared";

export interface PromptInput {
  persona: Persona;
  watchHistory: WatchShow[];
  newEpisodes: NewEpisode[];
}

export function buildSystemPrompt({ persona, watchHistory, newEpisodes }: PromptInput): string {
  const watchLines = watchHistory
    .map((s) => `- ${s.title} (status: ${s.status}, last ep ${s.lastEpisode})${s.notes ? ` — ${s.notes}` : ""}`)
    .join("\n");

  const newLines = newEpisodes.length
    ? "\n\nNEW EPISODES JUST DROPPED (mention these proactively, naturally):\n" +
      newEpisodes.map((e) => `- ${e.title} episode ${e.episode}${e.episodeTitle ? `: ${e.episodeTitle}` : ""}`).join("\n")
    : "";

  return [
    `You are ${persona.name}. ${persona.description}`,
    "",
    "You are speaking aloud to one specific anime fan. Their watch history:",
    watchLines || "- (none yet)",
    newLines,
    "",
    "Rules: stay in character; reference their shows when relevant; never invent episode numbers beyond what's listed; avoid spoilers for episodes past their last watched; keep it spoken and lively.",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server test PersonaPromptBuilder`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/persona
git commit -m "feat(server): persona + system prompt builder"
```

---

## Task 7: LLMProxy adapter (tested with mocked SDK)

**Files:**
- Create: `server/src/llm/LLMProxy.ts`
- Test: `server/test/LLMProxy.test.ts`

**Interface:** `chat({system, messages, signal}) -> AsyncIterable<string>` yielding token deltas. Uses the OpenAI SDK pointed at `LLM_BASE_URL`. Constructed with `{ baseURL, apiKey, model }` so tests inject a fake client.

- [ ] **Step 1: Write the failing test**

Create `server/test/LLMProxy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LLMProxy } from "../src/llm/LLMProxy";

function fakeClient(tokens: string[]) {
  return {
    chat: {
      completions: {
        // @ts-expect-error minimal fake
        create: async ({ stream }) => {
          if (!stream) throw new Error("only stream supported");
          const gen = (async function* () {
            for (const t of tokens) yield { choices: [{ delta: { content: t } }] };
          })();
          return gen;
        },
      },
    },
  };
}

describe("LLMProxy", () => {
  it("yields token deltas", async () => {
    const llm = new LLMProxy({ client: fakeClient(["Hello", "!", " Boom"]) as any, model: "m" });
    const out: string[] = [];
    for await (const t of llm.chat({ system: "s", messages: [{ role: "user", content: "hi" }] })) out.push(t);
    expect(out.join("")).toBe("Hello! Boom");
  });

  it("passes system + messages through", async () => {
    let captured: any;
    const client = {
      chat: { completions: { create: async (opts: any) => { captured = opts; return (async function* () { yield { choices: [{ delta: { content: "ok" } }] }; })(); } } },
    };
    const llm = new LLMProxy({ client: client as any, model: "model-x" });
    for await (const _ of llm.chat({ system: "S", messages: [{ role: "user", content: "U" }] })) void _;
    expect(captured.model).toBe("model-x");
    expect(captured.messages[0]).toEqual({ role: "system", content: "S" });
    expect(captured.messages[1]).toEqual({ role: "user", content: "U" });
    expect(captured.stream).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server test LLMProxy`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/src/llm/LLMProxy.ts`:

```ts
import type { ChatMessage } from "@crunchyfake/shared";

export interface LLMClient {
  chat: {
    completions: {
      create(opts: Record<string, unknown>): Promise<{
        [Symbol.asyncIterator](): AsyncIterator<{ choices: { delta: { content?: string | null } }[] }>;
      }>;
    };
  };
}

export interface LLMProxyOptions {
  client: LLMClient;
  model: string;
}

export interface ChatParams {
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

export class LLMProxy {
  constructor(private opts: LLMProxyOptions) {}

  async *chat({ system, messages, signal }: ChatParams): AsyncIterable<string> {
    const stream = await this.opts.client.chat.completions.create({
      model: this.opts.model,
      stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    });
    for await (const part of stream) {
      if (signal?.aborted) break;
      const content = part.choices?.[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server test LLMProxy`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/llm
git commit -m "feat(server): OpenAI-compatible streaming LLM proxy"
```

---

## Task 8: TTSProxy adapter (tested with mocked provider)

**Files:**
- Create: `server/src/tts/TTSProxy.ts`
- Test: `server/test/TTSProxy.test.ts`

**Interface:** `synthesize(text) -> { audioBase64, mime }`. Default provider `openai` uses the OpenAI SDK `audio.speech`. Swappable via the `TTSProvider` interface.

- [ ] **Step 1: Write the failing test**

Create `server/test/TTSProxy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TTSProxy } from "../src/tts/TTSProxy";

describe("TTSProxy", () => {
  it("returns base64 audio from the provider", async () => {
    const fake = { synthesize: async (text: string) => ({ audioBase64: Buffer.from(text).toString("base64"), mime: "audio/mpeg" }) };
    const tts = new TTSProxy(fake);
    const r = await tts.synthesize("hi");
    expect(r.mime).toBe("audio/mpeg");
    expect(Buffer.from(r.audioBase64, "base64").toString()).toBe("hi");
  });

  it("OpenAITTSProvider converts buffer to base64", async () => {
    const fakeSdk = { audio: { speech: { create: async () => ({ arrayBuffer: async () => Buffer.from("ABC") }) } } };
    const provider = { synthesize: async () => ({ audioBase64: "QUJD", mime: "audio/mpeg" }) };
    void fakeSdk;
    const tts = new TTSProxy(provider);
    expect((await tts.synthesize("x")).audioBase64).toBe("QUJD");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server test TTSProxy`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/src/tts/TTSProxy.ts`:

```ts
export interface TTSResult {
  audioBase64: string;
  mime: string;
}

export interface TTSProvider {
  synthesize(text: string): Promise<TTSResult>;
}

export interface OpenAIAudioClient {
  audio: { speech: { create(opts: Record<string, unknown>): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }> } };
}

export function openAITTSProvider(sdk: OpenAIAudioClient, model: string, voice: string): TTSProvider {
  return {
    async synthesize(text) {
      const res = await sdk.audio.speech.create({ model, voice, input: text, response_format: "mp3" });
      const buf = Buffer.from(await res.arrayBuffer());
      return { audioBase64: buf.toString("base64"), mime: "audio/mpeg" };
    },
  };
}

export class TTSProxy {
  constructor(private provider: TTSProvider) {}
  synthesize(text: string): Promise<TTSResult> {
    return this.provider.synthesize(text);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server test TTSProxy`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/tts
git commit -m "feat(server): swappable TTS proxy with OpenAI default"
```

---

## Task 9: Greeter (TDD with mocked LLM + TTS)

**Files:**
- Create: `server/src/greeter/Greeter.ts`
- Test: `server/test/Greeter.test.ts`

**Behavior:** `generateGreeting()` asks the LLM for a single short greeting line (grounded in persona + watch history + new-ep), then synthesizes TTS. On any LLM failure (or empty result), falls back to a templated greeting so the proactive moment always fires.

- [ ] **Step 1: Write the failing test**

Create `server/test/Greeter.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { Greeter } from "../src/greeter/Greeter";
import { kiraPersona } from "../src/persona/persona";
import { MockDataService } from "../src/data/MockDataService";

const data = new MockDataService();

function llmStub(text: string) {
  return { chat: async function* () { for (const t of text.split(" ")) yield t + " "; } };
}
function llmFailing() {
  return { chat: async function* () { throw new Error("boom"); } };
}
function ttsStub() {
  return { synthesize: async (t: string) => ({ audioBase64: Buffer.from(t).toString("base64"), mime: "audio/mpeg" }) };
}

describe("Greeter", () => {
  it("returns an LLM-generated greeting + audio", async () => {
    const g = new Greeter({ persona: kiraPersona, data, llm: llmStub("Yo! New Jujutsu Kaisen just dropped!") as any, tts: ttsStub() as any });
    const r = await g.generateGreeting();
    expect(r.text).toContain("Jujutsu Kaisen");
    expect(r.audioBase64).toBeTruthy();
  });

  it("falls back to a template when the LLM fails", async () => {
    const g = new Greeter({ persona: kiraPersona, data, llm: llmFailing() as any, tts: ttsStub() as any });
    const r = await g.generateGreeting();
    expect(r.text).toContain("Jujutsu Kaisen");
    expect(r.text).toMatch(/episode 35/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server test Greeter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/src/greeter/Greeter.ts`:

```ts
import type { Persona } from "@crunchyfake/shared";
import type { MockDataService } from "../data/MockDataService";
import type { TTSProxy } from "../tts/TTSProxy";
import { buildSystemPrompt } from "../persona/PersonaPromptBuilder.js";
import type { LLMProxy } from "../llm/LLMProxy";

export interface GreeterDeps {
  persona: Persona;
  data: MockDataService;
  llm: Pick<LLMProxy, "chat">;
  tts: TTSProxy;
}

const GREETING_INSTRUCTION =
  "In one short, energetic spoken sentence (max ~25 words), greet the user and naturally flag the newest episode from their list. No emoji, no quotes.";

export class Greeter {
  constructor(private deps: GreeterDeps) {}

  async generateGreeting(): Promise<{ text: string; audioBase64: string; mime: string }> {
    const { persona, data, llm, tts } = this.deps;
    const system = buildSystemPrompt({
      persona,
      watchHistory: data.getWatchHistory(),
      newEpisodes: data.getNewEpisodes(),
    }) + "\n\n" + GREETING_INSTRUCTION;

    let text = "";
    try {
      let raw = "";
      for await (const t of llm.chat({ system, messages: [{ role: "user", content: "Greet me!" }] })) raw += t;
      text = raw.trim();
    } catch {
      text = "";
    }
    if (!text) text = this.templateGreeting();

    const audio = await tts.synthesize(text);
    return { text, ...audio };
  }

  private templateGreeting(): string {
    const ep = this.deps.data.getNewEpisodes()[0];
    if (ep) return `Yo! ${ep.title} episode ${ep.episode} just dropped — let's get into it!`;
    const show = this.deps.data.getWatchHistory()[0];
    return show ? `Hey! Ready to keep watching ${show.title}?` : "Hey! What are we watching today?";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server test Greeter`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/greeter
git commit -m "feat(server): proactive greeter with template fallback"
```

---

## Task 10: SSE helper + session store

**Files:**
- Create: `server/src/sse.ts`, `server/src/sessions.ts`
- Test: `server/test/sse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/sse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sseEvent } from "../src/sse";
import { createSessionStore } from "../src/sessions";
import type { ChatMessage } from "@crunchyfake/shared";

describe("sse", () => {
  it("formats a named event with JSON data", () => {
    const out = sseEvent("sentence", { text: "hi" });
    expect(out).toBe("event: sentence\ndata: {\"text\":\"hi\"}\n\n");
  });
});

describe("session store", () => {
  it("stores and retrieves messages", () => {
    const store = createSessionStore();
    const id = store.create();
    const msg: ChatMessage = { role: "user", content: "hi" };
    store.addUserMessage(id, msg.content);
    store.addAssistantMessage(id, "hello back");
    const sess = store.get(id)!;
    expect(sess.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("returns undefined for unknown id", () => {
    expect(createSessionStore().get("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server test sse`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `server/src/sse.ts`:

```ts
import type { StreamEvent } from "@crunchyfake/shared";

export function sseEvent(event: StreamEvent["type"], payload: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}
```

Create `server/src/sessions.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { ChatMessage } from "@crunchyfake/shared";

export interface Session {
  id: string;
  messages: ChatMessage[];
}

export function createSessionStore() {
  const map = new Map<string, Session>();
  return {
    create(): string {
      const id = randomUUID();
      map.set(id, { id, messages: [] });
      return id;
    },
    get(id: string): Session | undefined {
      return map.get(id);
    },
    addUserMessage(id: string, content: string): void {
      map.get(id)?.messages.push({ role: "user", content });
    },
    addAssistantMessage(id: string, content: string): void {
      map.get(id)?.messages.push({ role: "assistant", content });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server test sse`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/sse.ts server/src/sessions.ts server/test/sse.test.ts
git commit -m "feat(server): SSE formatter + in-memory session store"
```

---

## Task 11: Session routes — open + send (integration-tested)

**Files:**
- Create: `server/src/deps.ts` (wires real deps from env), `server/src/routes/sessions.ts`
- Modify: `server/src/index.ts` (register routes)
- Test: `server/test/routes.sessions.test.ts`

**Endpoints:**
- `POST /session/open` → `{ sessionId, greeting }` (Greeter).
- `POST /session/:id/send` body `{ text }` → SSE stream of `sentence`/`audio`/`done`/`error`.

Deps are injected into `buildServer(deps?)` so tests pass fakes; `deps.ts` builds the real set from env.

- [ ] **Step 1: Write the failing integration test**

Create `server/test/routes.sessions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildServer } from "../src/index";

function fakes() {
  let greetText = "Yo! New Jujutsu Kaisen dropped!";
  return {
    greeter: { generateGreeting: async () => ({ text: greetText, audioBase64: "AAAA", mime: "audio/mpeg" }) },
    llm: { chat: async function* () { for (const t of ["Hello! ", "Boom."]) yield t; } },
    tts: { synthesize: async (t: string) => ({ audioBase64: Buffer.from(t).toString("base64"), mime: "audio/mpeg" }) },
    data: { getWatchHistory: () => [], getNewEpisodes: () => [] },
    persona: { name: "Kira", description: "x", voice: "alloy" },
    buildSystemPrompt: () => "sys",
    createSessionStore: () => {
      const map = new Map<string, { messages: any[] }>();
      return {
        create: () => { const id = "s1"; map.set(id, { messages: [] }); return id; },
        get: (id: string) => map.get(id),
        addUserMessage: (id: string, c: string) => map.get(id)?.messages.push({ role: "user", content: c }),
        addAssistantMessage: (id: string, c: string) => map.get(id)?.messages.push({ role: "assistant", content: c }),
      };
    },
  };
}

describe("session routes", () => {
  it("POST /session/open returns a greeting", async () => {
    const app = buildServer(fakes() as any);
    const res = await app.inject({ method: "POST", url: "/session/open" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessionId).toBe("s1");
    expect(body.greeting.text).toContain("Jujutsu Kaisen");
    await app.close();
  });

  it("POST /session/:id/send streams sentence, audio, done", async () => {
    const app = buildServer(fakes() as any);
    await app.inject({ method: "POST", url: "/session/open" });
    const res = await app.inject({
      method: "POST", url: "/session/s1/send",
      payload: { text: "hi" },
      headers: { accept: "text/event-stream" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("event: sentence");
    expect(res.body).toContain("event: audio");
    expect(res.body.trim().endsWith("event: done")).toBe(true);
    await app.close();
  });

  it("send on unknown session returns 404", async () => {
    const app = buildServer(fakes() as any);
    const res = await app.inject({ method: "POST", url: "/session/nope/send", payload: { text: "hi" } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server test routes.sessions`
Expected: FAIL — buildServer ignores deps / routes missing.

- [ ] **Step 3: Implement deps + routes**

Create `server/src/deps.ts`:

```ts
import OpenAI from "openai";
import type { Persona } from "@crunchyfake/shared";
import { loadEnv, type Env } from "./env.js";
import { LLMProxy } from "./llm/LLMProxy.js";
import { TTSProxy, openAITTSProvider } from "./tts/TTSProxy.js";
import { MockDataService } from "./data/MockDataService.js";
import { Greeter } from "./greeter/Greeter.js";
import { kiraPersona } from "./persona/persona.js";
import { buildSystemPrompt } from "./persona/PersonaPromptBuilder.js";
import { createSessionStore } from "./sessions.js";

export interface Deps {
  persona: Persona;
  data: MockDataService;
  llm: LLMProxy;
  tts: TTSProxy;
  greeter: Greeter;
  buildSystemPrompt: typeof buildSystemPrompt;
  createSessionStore: typeof createSessionStore;
}

export function buildDeps(env: Env = loadEnv()): Deps {
  const sdk = new OpenAI({ baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY });
  const llm = new LLMProxy({ client: sdk as any, model: env.LLM_MODEL });
  const tts = new TTSProxy(openAITTSProvider(sdk as any, env.TTS_MODEL, env.TTS_VOICE));
  const data = new MockDataService();
  const greeter = new Greeter({ persona: kiraPersona, data, llm, tts });
  return { persona: kiraPersona, data, llm, tts, greeter, buildSystemPrompt, createSessionStore };
}
```

Create `server/src/routes/sessions.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { Deps } from "../deps.js";
import { sseEvent } from "../sse.js";
import { createSentenceChunker } from "../util/sentenceChunker.js";

export function registerSessionRoutes(app: FastifyInstance, deps: Deps) {
  const store = deps.createSessionStore();

  app.post("/session/open", async (_req, reply) => {
    const sessionId = store.create();
    const greeting = await deps.greeter.generateGreeting();
    return reply.send({ sessionId, greeting });
  });

  app.post<{ Params: { id: string }; Body: { text?: string } }>(
    "/session/:id/send",
    async (req, reply) => {
      const session = store.get(req.params.id);
      if (!session) return reply.code(404).send({ error: "session not found" });
      const text = (req.body?.text ?? "").toString();

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      const write = (e: "sentence" | "audio" | "done" | "error", p: Record<string, unknown>) => reply.raw.write(sseEvent(e, p));

      try {
        store.addUserMessage(req.params.id, text);
        const system = deps.buildSystemPrompt({
          persona: deps.persona,
          watchHistory: deps.data.getWatchHistory(),
          newEpisodes: deps.data.getNewEpisodes(),
        });

        const chunker = createSentenceChunker();
        let full = "";
        const flushSentence = async (sentence: string) => {
          const s = sentence.trim();
          if (!s) return;
          write("sentence", { text: s });
          try {
            const audio = await deps.tts.synthesize(s);
            write("audio", { text: s, audioBase64: audio.audioBase64, mime: audio.mime });
          } catch {
            // TTS failure: text already shown; keep going (degradation)
          }
          full += (full ? " " : "") + s;
        };

        for await (const token of deps.llm.chat({ system, messages: session.messages })) {
          for (const s of chunker.push(token)) await flushSentence(s);
        }
        for (const s of chunker.flush()) await flushSentence(s);

        if (full) store.addAssistantMessage(req.params.id, full);
        write("done", {});
      } catch (err) {
        write("error", { message: err instanceof Error ? err.message : "unknown error" });
      } finally {
        reply.raw.end();
      }
    }
  );
}
```

Modify `server/src/index.ts` — replace its contents with:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import type { Deps } from "./deps.js";
import { buildDeps } from "./deps.js";
import { registerSessionRoutes } from "./routes/sessions.js";

export function buildServer(deps?: Deps): FastifyInstance {
  const app = Fastify({ logger: true });
  app.get("/health", async () => ({ status: "ok" }));
  if (deps) registerSessionRoutes(app, deps);
  return app;
}

async function start() {
  const { loadEnv } = await import("./env.js");
  const env = loadEnv();
  const app = buildServer(buildDeps(env));
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  start().catch((err) => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server test routes.sessions`
Expected: PASS (3 tests).

- [ ] **Step 5: Run full server test suite + typecheck**

Run: `npm -w server test`
Expected: all PASS.

Run: `npm -w server run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src server/test
git commit -m "feat(server): session open + SSE streaming send routes"
```

---

## Task 12: Frontend scaffold + Vite config

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/.env.example`
- Test: `web/test/smoke.test.tsx`

- [ ] **Step 1: web package.json**

Create `web/package.json`:

```json
{
  "name": "@crunchyfake/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@crunchyfake/shared": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "^0.165.0",
    "@pixiv/three-vrm": "^3.3.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@types/three": "^0.165.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.0",
    "typescript": "^5.4.5",
    "vite": "^5.3.1",
    "vitest": "^1.6.0"
  }
}
```

Create `web/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "test", "../shared/src"]
}
```

Create `web/tsconfig.node.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "composite": true, "module": "ESNext", "moduleResolution": "Bundler" },
  "include": ["vite.config.ts"]
}
```

Create `web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/session": "http://localhost:8787",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
```

Create `web/.env.example`:

```
# Optional: absolute backend base (defaults to same origin / proxied /session)
VITE_API_BASE=
```

Create `web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CrunchyFake</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the failing smoke test**

Create `web/src/test-setup.ts`:

```ts
import "@testing-library/react";
```

Create `web/test/smoke.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/App";

describe("App", () => {
  it("renders the CrunchyFake brand", () => {
    render(<App />);
    expect(screen.getByText(/CrunchyFake/i)).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm -w web install && npm -w web test`
Expected: FAIL — App not found.

- [ ] **Step 4: Implement minimal App**

Create `web/src/App.tsx`:

```tsx
export function App() {
  return (
    <div>
      <header>
        <strong>CrunchyFake</strong>
      </header>
    </div>
  );
}
```

Create `web/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm -w web test`
Expected: PASS.

Run: `npm -w web run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): Vite + React scaffold"
```

---

## Task 13: Mock site shell + catalog (Home/Browse/Show)

**Files:**
- Create: `web/src/site/catalog.ts`, `web/src/site/Home.tsx`, `web/src/site/Browse.tsx`, `web/src/site/Show.tsx`, `web/src/site/site.css`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: catalog data**

Create `web/src/site/catalog.ts`:

```ts
export interface CatalogShow {
  id: string;
  title: string;
  blurb: string;
  img: string; // gradient used as poster placeholder
}

export const catalog: CatalogShow[] = [
  { id: "frieren", title: "Frieren: Beyond Journey's End", blurb: "An elf mage reflects on time and loss.", img: "linear-gradient(135deg,#3b82f6,#1e3a8a)" },
  { id: "jjk", title: "Jujutsu Kaisen", blurb: "Sorcerers battle curses in Shibuya.", img: "linear-gradient(135deg,#ef4444,#7f1d1d)" },
  { id: "ds", title: "Demon Slayer", blurb: "A boy hunts demons to cure his sister.", img: "linear-gradient(135deg,#10b981,#064e3b)" },
  { id: "csm", title: "Chainsaw Man", blurb: "A boy fused with a chainsaw devil.", img: "linear-gradient(135deg,#f59e0b,#7c2d12)" },
  { id: "spy", title: "Spy x Family", blurb: "A spy builds a fake family for a mission.", img: "linear-gradient(135deg,#8b5cf6,#4c1d95)" },
  { id: "vinland", title: "Vinland Saga", blurb: "A young Viking seeks revenge and meaning.", img: "linear-gradient(135deg,#64748b,#1e293b)" },
];

export function getShow(id: string): CatalogShow | undefined {
  return catalog.find((s) => s.id === id);
}
```

- [ ] **Step 2: site pages**

Create `web/src/site/site.css`:

```css
.site { font-family: system-ui, sans-serif; background:#0b0b10; color:#eee; min-height:100vh; }
.site header { display:flex; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid #222; }
.site header .brand { color:#ff7a59; font-weight:800; font-size:18px; letter-spacing:.03em; }
.site header nav a { color:#bbb; margin-right:14px; text-decoration:none; cursor:pointer; }
.site header nav a:hover { color:#fff; }
.site main { padding:24px; }
.hero { height:220px; border-radius:14px; background:linear-gradient(90deg,#3a1f4d,#1d1130); display:flex; align-items:center; padding-left:32px; margin-bottom:24px; }
.hero h1 { font-size:32px; margin:0; }
.row h2 { font-size:16px; color:#ddd; margin:18px 0 10px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:14px; }
.card { background:#14141c; border:1px solid #23232f; border-radius:10px; overflow:hidden; cursor:pointer; }
.card .poster { height:200px; }
.card .meta { padding:8px 10px; }
.card .meta b { font-size:13px; }
.card .meta p { font-size:11px; color:#999; margin:4px 0 0; }
.show-detail .poster { height:280px; border-radius:12px; margin-bottom:16px; }
.show-detail h1 { margin:0 0 8px; }
```

Create `web/src/site/Home.tsx`:

```tsx
import { catalog } from "./catalog";

export function Home({ onOpenShow }: { onOpenShow: (id: string) => void }) {
  return (
    <>
      <div className="hero"><h1>Welcome to CrunchyFake</h1></div>
      <div className="row"><h2>Popular this season</h2>
        <div className="grid">
          {catalog.map((s) => (
            <div className="card" key={s.id} onClick={() => onOpenShow(s.id)}>
              <div className="poster" style={{ background: s.img }} />
              <div className="meta"><b>{s.title}</b><p>{s.blurb}</p></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
```

Create `web/src/site/Browse.tsx`:

```tsx
import { catalog } from "./catalog";

export function Browse({ onOpenShow }: { onOpenShow: (id: string) => void }) {
  return (
    <div className="row"><h2>Browse all</h2>
      <div className="grid">
        {catalog.map((s) => (
          <div className="card" key={s.id} onClick={() => onOpenShow(s.id)}>
            <div className="poster" style={{ background: s.img }} />
            <div className="meta"><b>{s.title}</b><p>{s.blurb}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Create `web/src/site/Show.tsx`:

```tsx
import { getShow } from "./catalog";

export function Show({ id, onBack }: { id: string; onBack: () => void }) {
  const s = getShow(id);
  if (!s) return <p>Show not found.</p>;
  return (
    <div className="show-detail">
      <div className="poster" style={{ background: s.img }} />
      <h1>{s.title}</h1>
      <p>{s.blurb}</p>
      <p><a onClick={onBack}>← Back</a></p>
    </div>
  );
}
```

- [ ] **Step 3: Wire App with simple view state**

Replace `web/src/App.tsx`:

```tsx
import { useState } from "react";
import { Home } from "./site/Home";
import { Browse } from "./site/Browse";
import { Show } from "./site/Show";
import "./site/site.css";

type View = { name: "home" } | { name: "browse" } | { name: "show"; id: string };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  return (
    <div className="site">
      <header>
        <span className="brand">CrunchyFake</span>
        <nav>
          <a onClick={() => setView({ name: "home" })}>Home</a>
          <a onClick={() => setView({ name: "browse" })}>Browse</a>
        </nav>
      </header>
      <main>
        {view.name === "home" && <Home onOpenShow={(id) => setView({ name: "show", id })} />}
        {view.name === "browse" && <Browse onOpenShow={(id) => setView({ name: "show", id })} />}
        {view.name === "show" && <Show id={view.id} onBack={() => setView({ name: "home" })} />}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm -w web test`
Expected: PASS.

Run: `npm -w web run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual check**

Run: `npm -w web run dev`
Open the printed URL. Verify: brand shows, Home + Browse nav work, clicking a card opens the show detail, Back returns home. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat(web): dummy Crunchyroll-style site shell"
```

---

## Task 14: SSE parser (pure, TDD)

**Files:**
- Create: `web/src/companion/sseParser.ts`
- Test: `web/test/sseParser.test.ts`

**Behavior:** `parseSseStream(buffer)` returns `{ events: {event, data}[], remainder }`, splitting on `\n\n` and parsing `event:`/`data:` lines. Pure; the client feeds it decoded chunks.

- [ ] **Step 1: Write the failing test**

Create `web/test/sseParser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSseStream } from "../src/companion/sseParser";

describe("parseSseStream", () => {
  it("parses complete events", () => {
    const buf = "event: sentence\ndata: {\"text\":\"hi\"}\n\nevent: done\ndata: {}\n\n";
    const { events, remainder } = parseSseStream(buf);
    expect(events).toEqual([
      { event: "sentence", data: { text: "hi" } },
      { event: "done", data: {} },
    ]);
    expect(remainder).toBe("");
  });

  it("keeps a trailing partial as remainder", () => {
    const buf = "event: audio\ndata: {\"text\":\"x\"";
    const { events, remainder } = parseSseStream(buf);
    expect(events).toEqual([]);
    expect(remainder).toBe(buf);
  });

  it("handles split across chunks via remainder", () => {
    const a = parseSseStream("event: sentence\ndata: {\"text\":\"hel");
    const b = parseSseStream(a.remainder + "lo\"}\n\n");
    expect(b.events).toEqual([{ event: "sentence", data: { text: "hello" } }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w web test sseParser`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `web/src/companion/sseParser.ts`:

```ts
export interface SseEvent {
  event: string;
  data: any;
}

export function parseSseStream(buffer: string): { events: SseEvent[]; remainder: string } {
  const events: SseEvent[] = [];
  let work = buffer;
  let idx: number;
  while ((idx = work.indexOf("\n\n")) !== -1) {
    const raw = work.slice(0, idx);
    work = work.slice(idx + 2);
    let event = "message";
    let data = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    let parsed: any = data;
    try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = data; }
    events.push({ event, data: parsed });
  }
  return { events, remainder: work };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w web test sseParser`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/companion/sseParser.ts web/test/sseParser.test.ts
git commit -m "feat(web): pure SSE stream parser"
```

---

## Task 15: lipSync util (pure, TDD)

**Files:**
- Create: `web/src/companion/lipSync.ts`
- Test: `web/test/lipSync.test.ts`

**Behavior:** `amplitudeToViseme(amplitude)` maps a 0..1 RMS amplitude to VRM blendshape weights: opens the mouth ("aa") proportionally, with a threshold so silence closes it. Returns a record of blendshape name -> weight (0..1).

- [ ] **Step 1: Write the failing test**

Create `web/test/lipSync.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { amplitudeToViseme, SILENCE_THRESHOLD } from "../src/companion/lipSync";

describe("lipSync", () => {
  it("closes the mouth at silence", () => {
    const w = amplitudeToViseme(0);
    expect(w["aa"]).toBe(0);
  });

  it("opens wider with higher amplitude, capped at 1", () => {
    const low = amplitudeToViseme(SILENCE_THRESHOLD + 0.01)["aa"];
    const high = amplitudeToViseme(0.8)["aa"];
    const max = amplitudeToViseme(2)["aa"];
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
    expect(max).toBeLessThanOrEqual(1);
  });

  it("below threshold is silent", () => {
    expect(amplitudeToViseme(SILENCE_THRESHOLD - 0.01)["aa"]).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w web test lipSync`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `web/src/companion/lipSync.ts`:

```ts
export const SILENCE_THRESHOLD = 0.04;

export interface VisemeWeights {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
}

export function amplitudeToViseme(amplitude: number): VisemeWeights {
  const closed: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  if (amplitude < SILENCE_THRESHOLD) return closed;
  const scaled = Math.min(1, (amplitude - SILENCE_THRESHOLD) / (1 - SILENCE_THRESHOLD));
  const aa = Math.min(1, scaled * 1.6);
  return { aa, ih: aa * 0.3, ou: aa * 0.2, ee: aa * 0.25, oh: aa * 0.5 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w web test lipSync`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/companion/lipSync.ts web/test/lipSync.test.ts
git commit -m "feat(web): amplitude-to-viseme lip-sync mapping"
```

---

## Task 16: ConversationClient (transport)

**Files:**
- Create: `web/src/companion/types.ts`, `web/src/companion/ConversationClient.ts`
- Test: `web/test/ConversationClient.test.ts`

**Interface:**
- `openSession()` → `{ sessionId, greeting }`.
- `send(sessionId, text, handlers)` → streams events via `fetch` + `ReadableStream`; calls `onSentence`, `onAudio`, `onError`, `onDone`; returns an `AbortController`-backed handle with `.abort()`.

- [ ] **Step 1: Write the failing test (fetch-mocked)**

Create `web/test/ConversationClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConversationClient } from "../src/companion/ConversationClient";

function textEncoder(s: string) { return new TextEncoder().encode(s); }

beforeEach(() => {
  (globalThis as any).TextDecoder = (globalThis as any).TextDecoder ?? class { decode(x:any){return x ? new TextDecoder("utf-8").decode(x):""} };
});

describe("ConversationClient", () => {
  it("openSession returns greeting", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sessionId: "s1", greeting: { text: "hi", audioBase64: "AA", mime: "audio/mpeg" } }),
    })) as any;
    const c = new ConversationClient({ base: "", fetchImpl: fetchMock });
    const r = await c.openSession();
    expect(r.sessionId).toBe("s1");
    expect(r.greeting.text).toBe("hi");
  });

  it("send parses SSE events and invokes handlers", async () => {
    const body =
      "event: sentence\ndata: {\"text\":\"yo\"}\n\n" +
      "event: audio\ndata: {\"text\":\"yo\",\"audioBase64\":\"QkFB\",\"mime\":\"audio/mpeg\"}\n\n" +
      "event: done\ndata: {}\n\n";
    const stream = new ReadableStream({
      start(ctl) {
        ctl.enqueue(textEncoder(body));
        ctl.close();
      },
    });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, body: stream })) as any;
    const c = new ConversationClient({ base: "", fetchImpl: fetchMock });

    const sentence: string[] = [];
    const audio: string[] = [];
    let done = false;
    await new Promise<void>((resolve) => {
      c.send("s1", "hello", {
        onSentence: (t) => sentence.push(t),
        onAudio: (a) => audio.push(a.audioBase64),
        onDone: () => { done = true; resolve(); },
        onError: () => resolve(),
      });
    });
    expect(sentence).toEqual(["yo"]);
    expect(audio).toEqual(["QkFB"]);
    expect(done).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w web test ConversationClient`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types + client**

Create `web/src/companion/types.ts`:

```ts
import type { StreamEvent, OpenSessionResponse } from "@crunchyfake/shared";
export type { StreamEvent, OpenSessionResponse };
```

Create `web/src/companion/ConversationClient.ts`:

```ts
import type { OpenSessionResponse, StreamEvent } from "@crunchyfake/shared";
import { parseSseStream } from "./sseParser";

export interface SendHandlers {
  onSentence: (text: string) => void;
  onAudio: (a: { text: string; audioBase64: string; mime: string }) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export interface ClientOptions {
  base: string;
  fetchImpl?: typeof fetch;
}

export class ConversationClient {
  private fetchImpl: typeof fetch;
  constructor(private opts: ClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  async openSession(): Promise<OpenSessionResponse> {
    const res = await this.fetchImpl(`${this.opts.base}/session/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) throw new Error(`openSession failed: ${res.status}`);
    return (await res.json()) as OpenSessionResponse;
  }

  send(sessionId: string, text: string, h: SendHandlers): { abort: () => void } {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await this.fetchImpl(`${this.opts.base}/session/${sessionId}/send`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) { h.onError(`send failed: ${res.status}`); return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const parsed = parseSseStream(buffer + chunk);
          buffer = parsed.remainder;
          for (const e of parsed.events) this.dispatch(e.event, e.data as StreamEvent, h);
        }
        const tail = parseSseStream(buffer + decoder.decode());
        for (const e of tail.events) this.dispatch(e.event, e.data as StreamEvent, h);
      } catch (err) {
        if (!controller.signal.aborted) h.onError(err instanceof Error ? err.message : "network error");
      }
    })();
    return { abort: () => controller.abort() };
  }

  private dispatch(event: string, data: StreamEvent, h: SendHandlers): void {
    switch (event) {
      case "sentence": h.onSentence((data as Extract<StreamEvent, { type: "sentence" }>).text); break;
      case "audio": {
        const a = data as Extract<StreamEvent, { type: "audio" }>;
        h.onAudio({ text: a.text, audioBase64: a.audioBase64, mime: a.mime });
        break;
      }
      case "done": h.onDone(); break;
      case "error": h.onError((data as Extract<StreamEvent, { type: "error" }>).message); break;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w web test ConversationClient`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/companion/ConversationClient.ts web/src/companion/types.ts web/test/ConversationClient.test.ts
git commit -m "feat(web): conversation client with SSE streaming"
```

---

## Task 17: VoiceController (mic STT + audio playback + lip-sync)

**Files:**
- Create: `web/src/companion/VoiceController.ts`

> Browser-API code is not unit-tested here; it is exercised by the manual demo script (Task 20). The pure lip-sync math it depends on is tested in Task 15.

- [ ] **Step 1: Implement VoiceController**

Create `web/src/companion/VoiceController.ts`:

```ts
import { amplitudeToViseme, type VisemeWeights } from "./lipSync";

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: { 0: { 0: { transcript: string } }; length: number } }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
};

export class VoiceController {
  private recognition: RecognitionLike | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private currentSource: AudioBufferSourceNode | null = null;

  static isSTTSupported(): boolean {
    return typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  }

  startListening(onTranscript: (text: string) => void, onEnd?: () => void): void {
    const Ctor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) throw new Error("SpeechRecognition not supported");
    const rec: RecognitionLike = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => { onTranscript(e.results[0][0].transcript); };
    rec.onerror = () => { /* degrade silently; user can retry or type */ };
    rec.onend = () => onEnd?.();
    this.recognition = rec;
    rec.start();
  }

  stopListening(): void {
    this.recognition?.stop();
    this.recognition = null;
  }

  /** Play a base64 audio string, driving onViseme each frame for lip-sync. */
  async play(audioBase64: string, mime: string, onViseme: (w: VisemeWeights) => void): Promise<void> {
    const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    this.audioCtx = this.audioCtx ?? new AudioContext();
    if (this.audioCtx.state === "suspended") await this.audioCtx.resume();
    const buffer = await this.audioCtx.decodeAudioData(bytes.buffer.slice(0));
    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser).connect(this.audioCtx.destination);
    this.currentSource = source;
    source.start();
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / data.length);
      onViseme(amplitudeToViseme(rms));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return new Promise((resolve) => {
      source.onended = () => { cancelAnimationFrame(this.raf); onViseme(amplitudeToViseme(0)); resolve(); };
    });
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    try { this.currentSource?.stop(); } catch { /* already stopped */ }
    this.currentSource = null;
    this.stopListening();
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm -w web run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/companion/VoiceController.ts
git commit -m "feat(web): voice controller (STT + audio playback + lip-sync)"
```

---

## Task 18: VRMStage (three-vrm render + idle + lip-sync)

**Files:**
- Create: `web/src/companion/VRMStage.tsx`

> Renders a VRM via three-vrm into a canvas; exposes an imperative `speak()` that plays base64 audio and drives visemes, and applies viseme weights to the VRM expression blendshapes each frame. Browser-render code is verified by the manual demo script (Task 20).

- [ ] **Step 1: Implement VRMStage**

Create `web/src/companion/VRMStage.tsx`:

```tsx
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, type VRM } from "@pixiv/three-vrm";
import { VoiceController } from "./VoiceController";
import { amplitudeToViseme, type VisemeWeights } from "./lipSync";

export interface VRMStageHandle {
  load(url: string): Promise<void>;
  speak(audioBase64: string, mime: string): Promise<void>;
  stopSpeaking(): void;
}

export function VRMStage({ modelUrl }: { modelUrl: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const voiceRef = useRef<VoiceController>(new VoiceController());
  const targetViseme = useRef<VisemeWeights>(amplitudeToViseme(0));

  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, mount.clientWidth / mount.clientHeight, 0.1, 20);
    camera.position.set(0, 1.3, 2.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1.5, 1);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(modelUrl, (gltf) => {
      const vrm = gltf.userData.vrm as VRM;
      vrmRef.current = vrm;
      scene.add(vrm.scene);
      vrm.scene.rotation.y = Math.PI;
    });

    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      const v = targetViseme.current;
      const expr = vrmRef.current?.expressionManager;
      if (expr) {
        expr.setValue("aa", v.aa);
        expr.setValue("ih", v.ih);
        expr.setValue("ou", v.ou);
        expr.setValue("ee", v.ee);
        expr.setValue("oh", v.oh);
      }
      if (vrmRef.current) vrmRef.current.update(Math.min(1, 1 / 60));
      renderer.render(scene, camera);
    };
    render();

    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    (mountRef.current as any).stage = {
      speak: async (audioBase64: string, mime: string) => {
        await voiceRef.current.play(audioBase64, mime, (w) => { targetViseme.current = w; });
      },
      stopSpeaking: () => voiceRef.current.stop(),
    } as VRMStageHandle;

    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); renderer.dispose(); };
  }, [modelUrl]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm -w web run typecheck`
Expected: no errors. (If `three/examples/jsm/...` path resolution differs, install is already present; the import is standard for three's examples in Vite.)

- [ ] **Step 3: Commit**

```bash
git add web/src/companion/VRMStage.tsx
git commit -m "feat(web): VRM stage with lip-sync"
```

---

## Task 19: CompanionWidget (button ↔ immersive stage + transcript + text fallback)

**Files:**
- Create: `web/src/companion/CompanionWidget.tsx`, `web/src/companion/companion.css`
- Test: `web/test/CompanionWidget.test.tsx`
- Modify: `web/src/App.tsx` (mount the widget)

- [ ] **Step 1: Write the failing widget test**

Create `web/test/CompanionWidget.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompanionWidget } from "../src/companion/CompanionWidget";

vi.mock("../src/companion/ConversationClient", () => ({
  ConversationClient: class {
    async openSession() { return { sessionId: "s1", greeting: { text: "hi", audioBase64: "", mime: "audio/mpeg" } }; }
    send() { return { abort() {} }; }
  },
}));
vi.mock("../src/companion/VRMStage", () => ({
  VRMStage: () => null,
}));

describe("CompanionWidget", () => {
  it("shows the small button, then expands on click", () => {
    render(<CompanionWidget apiBase="" modelUrl="/models/sample.vrm" />);
    expect(screen.getByRole("button", { name: /open companion/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /open companion/i }));
    expect(screen.getByText(/hi/i)).toBeTruthy(); // greeting transcript
    expect(screen.getByRole("button", { name: /close/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w web test CompanionWidget`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the widget**

Create `web/src/companion/companion.css`:

```css
.cfab { position: fixed; right: 22px; bottom: 22px; width: 60px; height: 60px; border-radius: 50%;
  border: none; cursor: pointer; background: linear-gradient(135deg, #ff7a59, #ff4d6d);
  box-shadow: 0 8px 24px rgba(255,77,109,.45); color: #fff; font-size: 24px; z-index: 9998; }
.cstage { position: fixed; inset: 0; z-index: 9999; background: radial-gradient(circle at 50% 70%, #2a1a3d, #07070c);
  display: flex; flex-direction: column; }
.cstage .topbar { display:flex; justify-content: space-between; align-items:center; padding: 12px 18px; color:#fff; }
.cstage .topbar button { background:#ffffff22; color:#fff; border:none; border-radius:50%; width:34px; height:34px; cursor:pointer; }
.cstage .avatar { flex:1; display:flex; align-items:flex-end; justify-content:center; }
.cstage .avatar > div { width:min(560px, 90vw); height:min(70vh, 640px); }
.cstage .panel { padding: 12px 18px 20px; color:#eee; max-height: 30vh; overflow:auto; }
.cstage .panel .line { margin: 4px 0; }
.cstage .panel .line.me { color:#9b9bae; text-align:right; }
.cstage .controls { display:flex; gap:10px; align-items:center; }
.cstage .controls input { flex:1; background:#1a1a24; border:1px solid #333; color:#fff; padding:10px 12px; border-radius:8px; }
.cstage .controls button { background:#ff4d6d; color:#fff; border:none; padding:10px 14px; border-radius:8px; cursor:pointer; }
```

Create `web/src/companion/CompanionWidget.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { ConversationClient } from "./ConversationClient";
import { VRMStage, type VRMStageHandle } from "./VRMStage";
import { VoiceController } from "./VoiceController";
import "./companion.css";

interface Line { who: "me" | "kira"; text: string }

export function CompanionWidget({ apiBase, modelUrl }: { apiBase: string; modelUrl: string }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [typed, setTyped] = useState("");
  const [listening, setListening] = useState(false);
  const clientRef = useRef<ConversationClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const stageRef = useRef<VRMStageHandle | null>(null);
  const voiceRef = useRef<VoiceController>(new VoiceController());
  const sendHandleRef = useRef<{ abort: () => void } | null>(null);
  const sttSupported = VoiceController.isSTTSupported();

  useEffect(() => { clientRef.current = new ConversationClient({ base: apiBase }); }, [apiBase]);

  async function handleOpen() {
    setOpen(true);
    if (!clientRef.current) return;
    try {
      const { sessionId, greeting } = await clientRef.current.openSession();
      sessionIdRef.current = sessionId;
      setLines((l) => [...l, { who: "kira", text: greeting.text }]);
      if (greeting.audioBase64) {
        stageRef.current?.speak(greeting.audioBase64, greeting.mime).catch(() => {});
      }
    } catch {
      setLines((l) => [...l, { who: "kira", text: "(couldn't reach the companion service)" }]);
    }
  }

  function sendText(text: string) {
    const c = clientRef.current, sid = sessionIdRef.current;
    if (!c || !sid || !text.trim()) return;
    setLines((l) => [...l, { who: "me", text }, { who: "kira", text: "…" }]);
    sendHandleRef.current = c.send(sid, text, {
      onSentence: (t) => setLines((l) => { const cp = [...l]; cp[cp.length - 1] = { who: "kira", text: t }; return cp; }),
      onAudio: (a) => stageRef.current?.speak(a.audioBase64, a.mime).catch(() => {}),
      onDone: () => { sendHandleRef.current = null; },
      onError: (m) => setLines((l) => { const cp = [...l]; cp[cp.length - 1] = { who: "kira", text: `(glitch: ${m})` }; return cp; }),
    });
  }

  function handleMic() {
    if (!sttSupported) return;
    setListening(true);
    voiceRef.current.startListening(
      (t) => { setListening(false); sendText(t); },
      () => setListening(false),
    );
  }

  return open ? (
    <div className="cstage">
      <div className="topbar">
        <strong>Kira</strong>
        <button aria-label="close" onClick={() => { sendHandleRef.current?.abort(); stageRef.current?.stopSpeaking(); voiceRef.current.stop(); setOpen(false); }}>×</button>
      </div>
      <div className="avatar">
        <VRMStage modelUrl={modelUrl} ref={stageRef as any} />
      </div>
      <div className="panel">
        {lines.map((l, i) => <div className={`line ${l.who === "me" ? "me" : ""}`} key={i}>{l.who === "me" ? "You: " : ""}{l.text}</div>)}
        <div className="controls">
          {sttSupported ? (
            <button onClick={handleMic}>{listening ? "Listening…" : "Speak"}</button>
          ) : null}
          <input placeholder="Type a message…" value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { sendText(typed); setTyped(""); } }} />
          <button onClick={() => { sendText(typed); setTyped(""); }}>Send</button>
        </div>
      </div>
    </div>
  ) : (
    <button className="cfab" aria-label="open companion" onClick={handleOpen}>💬</button>
  );
}
```

> The `VRMStage` is given a `ref` here. Update `VRMStage` (Task 18) to forward its imperative handle via `useImperativeHandle`. Apply this patch:

- [ ] **Step 4: Patch VRMStage to forward the ref**

Edit `web/src/companion/VRMStage.tsx` — change the component signature and add `forwardRef` + `useImperativeHandle`. Replace the `export function VRMStage(...)` declaration and its inner `(mountRef.current as any).stage = ...` block.

Replace:

```tsx
export function VRMStage({ modelUrl }: { modelUrl: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
```

with:

```tsx
import { forwardRef, useImperativeHandle } from "react";

export const VRMStage = forwardRef<VRMStageHandle, { modelUrl: string }>(function VRMStage(
  { modelUrl }, _ref
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const speakRef = useRef<VRMStageHandle["speak"]>(() => Promise.resolve());
  const stopRef = useRef<VRMStageHandle["stopSpeaking"]>(() => {});
  useImperativeHandle(_ref as any, () => ({
    load: async () => {},
    speak: (b, m) => speakRef.current(b, m),
    stopSpeaking: () => stopRef.current(),
  }));
```

And inside the `useEffect`, replace the `(mountRef.current as any).stage = {...}` assignment with:

```tsx
    speakRef.current = async (audioBase64: string, mime: string) => {
      await voiceRef.current.play(audioBase64, mime, (w) => { targetViseme.current = w; });
    };
    stopRef.current = () => voiceRef.current.stop();
```

- [ ] **Step 5: Mount the widget in App**

Edit `web/src/App.tsx` — add the import and render the widget once at the bottom of the `.site` div. After the closing `</main>`, inside `.site`, add:

```tsx
import { CompanionWidget } from "./companion/CompanionWidget";
```
and just before the closing `</div>` of `.site`:

```tsx
      <CompanionWidget apiBase={import.meta.env.VITE_API_BASE ?? ""} modelUrl="/models/sample.vrm" />
```

- [ ] **Step 6: Run widget test + typecheck**

Run: `npm -w web test CompanionWidget`
Expected: PASS.

Run: `npm -w web run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "feat(web): companion widget (button <-> immersive stage) wired into site"
```

---

## Task 20: VRM model + credits + final verification

**Files:**
- Create: `web/public/models/CREDITS.md`, `web/public/models/README.md`
- Add a free CC-BY VRM model file to `web/public/models/sample.vrm`
- Create: `README.md`, `web/public/models/placeholders.md` (instructions if model must be fetched manually)

> **License note (from spec):** VRM models carry their own licenses. Use only a free / CC-BY model (e.g., a sample from `pixiv/three-vrm` test resources, or a CC-BY model from VRoid Hub with attribution). Record the source + license in `CREDITS.md`.

- [ ] **Step 1: Add credits + model-source instructions**

Create `web/public/models/CREDITS.md`:

```markdown
# Avatar model credits

- **File:** `sample.vrm`
- **Source:** <paste exact URL — e.g., VRoid Hub model page or three-vrm sample>
- **License:** <e.g., CC-BY 4.0 / VRoid Hub EULA>
- **Author:** <author / account name>
- **Attribution required by license:** yes/no

Only free / CC-BY models are used in this demo. Replace `sample.vrm` with any
VRM 0.x/1.0 model that permits your usage; update this file accordingly.
```

Create `web/public/models/README.md`:

```markdown
# VRM model placement

Place a free / CC-BY VRM file at `sample.vrm` in this folder before running the demo.
Suggested sources (verify license before use):
- pixiv/three-vrm sample models (MIT/CC0 where noted in their repo)
- VRoid Hub models published under CC-BY (https://hub.vroid.com/)

Update `CREDITS.md` with the source, license, and author.
```

- [ ] **Step 2: Obtain and place the model**

Download a license-appropriate `.vrm` file and save it as `web/public/models/sample.vrm`. Fill in `CREDITS.md`.

Verify the file exists: `ls -lh web/public/models/sample.vrm`.

- [ ] **Step 3: Write the project README**

Create `README.md`:

```markdown
# CrunchyFake Anime Companion

A 3D VRM anime companion embedded in a Crunchyroll-style demo site. Full voice
(speech-in / speech-out + lip-sync), watch-history-aware chat, and a proactive
new-episode greeting on open.

## Setup

1. `npm install`
2. `cp server/.env.example server/.env` and fill in `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `TTS_*`.
3. Place a VRM model at `web/public/models/sample.vrm` (see `web/public/models/README.md`).

## Run (demo)

- Backend: `npm run dev:server` (default :8787)
- Frontend: `npm run dev:web` (Vite proxies `/session` -> :8787)

Open the Vite URL in Chrome (for Web Speech STT). Click the bubble (bottom-right)
to open the companion — it greets you first and flags the new Jujutsu Kaisen episode.

## Tests / types

- `npm test`
- `npm run typecheck`

## Architecture

See `docs/superpowers/specs/2026-06-27-anime-companion-design.md`.
```

Create `server/.env.example` by copying the root `.env.example` content (Task 1) into `server/.env.example` so the README `cp` works:

```bash
cp .env.example server/.env.example
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all workspaces PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual end-to-end demo script**

With `server/.env` filled and a VRM model placed, run in two terminals:
- `npm run dev:server`
- `npm run dev:web`

Open the Vite URL in Chrome and verify the checklist:
- [ ] Site loads; brand + Home/Browse work.
- [ ] Bottom-right bubble is present.
- [ ] Click bubble → immersive stage opens; **Kira speaks first** (greeting mentions a watched show + the new Jujutsu Kaisen episode); avatar's mouth moves.
- [ ] Click "Speak" → grant mic → say something → Kira replies (streaming), transcript updates.
- [ ] Type a message + Enter → Kira replies.
- [ ] Close (×) collapses back to the bubble; reopening works.
- [ ] If mic is denied/blocked, the text input still works (typed fallback).

- [ ] **Step 6: Commit**

```bash
git add web/public/models README.md server/.env.example
git commit -m "chore: VRM model credits, README, demo verification"
```

---

## Notes for the implementer

- **TDD discipline:** every task with a pure function or testable adapter follows test → fail → implement → pass → commit. Browser-API code (VoiceController, VRMStage) is verified by the manual script (Task 20); do not skip it.
- **Frequent commits:** each task ends with a commit. Keep them focused.
- **Degradation is a feature:** if STT/TTS/LLM/VRM fails, the demo must keep working (typed chat, transcript-only, placeholder). Preserve this in every adapter.
- **Provider swap:** to change the LLM provider, only env changes. To change TTS provider, implement `TTSProvider` and pass it into `TTSProxy` in `deps.ts`.
