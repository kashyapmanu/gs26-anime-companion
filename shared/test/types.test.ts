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
