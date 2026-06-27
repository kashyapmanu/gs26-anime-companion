import { describe, it, expect } from "vitest";
import { TTSProxy, openAITTSProvider } from "../src/tts/TTSProxy";

describe("TTSProxy", () => {
  it("returns base64 audio from the provider", async () => {
    const fake = { synthesize: async (text: string) => ({ audioBase64: Buffer.from(text).toString("base64"), mime: "audio/mpeg" }) };
    const tts = new TTSProxy(fake);
    const r = await tts.synthesize("hi");
    expect(r.mime).toBe("audio/mpeg");
    expect(Buffer.from(r.audioBase64, "base64").toString()).toBe("hi");
  });

  it("openAITTSProvider converts the SDK audio buffer to base64", async () => {
    const fakeSdk = { audio: { speech: { create: async () => ({ arrayBuffer: async () => Buffer.from("ABC") }) } } };
    const provider = openAITTSProvider(fakeSdk as any, "tts-1", "alloy");
    const r = await provider.synthesize("hi");
    expect(r.audioBase64).toBe(Buffer.from("ABC").toString("base64"));
    expect(r.mime).toBe("audio/mpeg");
  });
});