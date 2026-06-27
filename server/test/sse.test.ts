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