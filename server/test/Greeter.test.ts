import { describe, it, expect } from "vitest";
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