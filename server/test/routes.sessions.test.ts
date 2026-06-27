import { describe, it, expect } from "vitest";
import { buildServer } from "../src/index";

function fakes() {
  return {
    greeter: { generateGreeting: async () => ({ text: "Yo! New Jujutsu Kaisen dropped!", audioBase64: "AAAA", mime: "audio/mpeg" }) },
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
    expect(res.body).toContain("event: done");
    expect(res.body).not.toContain("event: error");
    await app.close();
  });

  it("send on unknown session returns 404", async () => {
    const app = buildServer(fakes() as any);
    const res = await app.inject({ method: "POST", url: "/session/nope/send", payload: { text: "hi" } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
