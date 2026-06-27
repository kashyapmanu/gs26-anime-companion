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