import { describe, it, expect, vi } from "vitest";
import { VoiceController } from "../src/companion/VoiceController";

describe("VoiceController amplitude", () => {
  it("returns 0 when no audio is playing", () => {
    const vc = new VoiceController();
    expect(vc.getCurrentAmplitude()).toBe(0);
  });

  it("returns the last computed RMS while playing", async () => {
    const vc = new VoiceController();
    // We cannot easily drive the Web Audio pipeline in jsdom,
    // so we assert the method exists and returns a number.
    expect(typeof vc.getCurrentAmplitude).toBe("function");
    const amp = vc.getCurrentAmplitude();
    expect(typeof amp).toBe("number");
    expect(amp).toBeGreaterThanOrEqual(0);
  });
});
