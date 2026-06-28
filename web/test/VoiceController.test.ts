import { describe, it, expect } from "vitest";
import { VoiceController, computeRms } from "../src/companion/VoiceController";

describe("VoiceController amplitude", () => {
  it("returns 0 when no audio is playing", () => {
    const vc = new VoiceController();
    expect(vc.getCurrentAmplitude()).toBe(0);
  });

  it("computeRms returns 0 for silent data", () => {
    const data = new Uint8Array(128).fill(128);
    expect(computeRms(data)).toBe(0);
  });

  it("computeRms returns 0 for an empty array", () => {
    expect(computeRms(new Uint8Array(0))).toBe(0);
  });

  it("computeRms returns a positive value for non-silent data", () => {
    const data = new Uint8Array(128).fill(200);
    expect(computeRms(data)).toBeGreaterThan(0);
  });
});
