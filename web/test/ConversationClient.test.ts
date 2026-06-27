import { describe, it, expect, vi } from "vitest";
import { ConversationClient } from "../src/companion/ConversationClient";

function textEncoder(s: string) { return new TextEncoder().encode(s); }

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

  it("send handles split chunks and remainder", async () => {
    const chunks = [
      "event: sentence\ndata: {\"text\":\"",
      "hello\"}\n\nevent: audio\ndata: {\"text\":\"hello\",\"audioBase64\":\"",
      "QkFB\",\"mime\":\"audio/mpeg\"}\n\nevent: done\ndata: {}\n\n",
    ];
    const stream = new ReadableStream({
      start(ctl) {
        for (const c of chunks) ctl.enqueue(textEncoder(c));
        ctl.close();
      },
    });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, body: stream })) as any;
    const c = new ConversationClient({ base: "", fetchImpl: fetchMock });

    const sentence: string[] = [];
    let done = false;
    await new Promise<void>((resolve) => {
      c.send("s1", "hello", {
        onSentence: (t) => sentence.push(t),
        onAudio: () => {},
        onDone: () => { done = true; resolve(); },
        onError: () => resolve(),
      });
    });
    expect(sentence).toEqual(["hello"]);
    expect(done).toBe(true);
  });

  it("send calls onError for non-ok response", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, body: { cancel: vi.fn() } })) as any;
    const c = new ConversationClient({ base: "", fetchImpl: fetchMock });
    const error: string[] = [];
    await new Promise<void>((resolve) => {
      c.send("s1", "hello", {
        onSentence: () => {},
        onAudio: () => {},
        onDone: () => {},
        onError: (m) => { error.push(m); resolve(); },
      });
    });
    expect(error).toEqual(["send failed: 500"]);
  });

  it("send calls onError for SSE error event", async () => {
    const body = "event: error\ndata: {\"message\":\"bad\"}\n\n";
    const stream = new ReadableStream({
      start(ctl) { ctl.enqueue(textEncoder(body)); ctl.close(); },
    });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, body: stream })) as any;
    const c = new ConversationClient({ base: "", fetchImpl: fetchMock });
    const error: string[] = [];
    let done = false;
    await new Promise<void>((resolve) => {
      c.send("s1", "hello", {
        onSentence: () => {},
        onAudio: () => {},
        onDone: () => { done = true; resolve(); },
        onError: (m) => { error.push(m); resolve(); },
      });
    });
    expect(error).toEqual(["bad"]);
    expect(done).toBe(false);
  });

  it("send calls onError for network error", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("offline"); }) as any;
    const c = new ConversationClient({ base: "", fetchImpl: fetchMock });
    const error: string[] = [];
    await new Promise<void>((resolve) => {
      c.send("s1", "hello", {
        onSentence: () => {},
        onAudio: () => {},
        onDone: () => {},
        onError: (m) => { error.push(m); resolve(); },
      });
    });
    expect(error).toEqual(["offline"]);
  });
});
