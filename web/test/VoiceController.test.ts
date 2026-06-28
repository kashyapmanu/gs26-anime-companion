import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  it("computeRms returns the expected value for constant non-silent data", () => {
    const data = new Uint8Array(4).fill(200);
    // (200 - 128) / 128 = 72/128 = 0.5625
    expect(computeRms(data)).toBeCloseTo(0.5625, 6);
  });

  describe("live amplitude during playback", () => {
    let rafCallbacks: FrameRequestCallback[] = [];
    const origRequestAnimationFrame = globalThis.requestAnimationFrame;
    const origCancelAnimationFrame = globalThis.cancelAnimationFrame;

    beforeEach(() => {
      rafCallbacks = [];
      globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      };
      globalThis.cancelAnimationFrame = () => { /* no-op for test */ };
    });

    afterEach(() => {
      globalThis.requestAnimationFrame = origRequestAnimationFrame;
      globalThis.cancelAnimationFrame = origCancelAnimationFrame;
    });

    it("updates amplitude during playback and resets on stop", async () => {
      const vc = new VoiceController();
      const fakeData = new Uint8Array(128).fill(200);
      const analyser: any = {
        fftSize: 256,
        frequencyBinCount: 128,
        connect: vi.fn(() => audioCtx.destination),
        getByteTimeDomainData: vi.fn((out: Uint8Array) => {
          out.set(fakeData);
        }),
      };
      const source: any = { start: vi.fn(), connect: vi.fn(() => analyser), onended: null, stop: vi.fn() };
      const buffer = {};
      const audioCtx: any = {
        state: "running",
        resume: vi.fn().mockResolvedValue(undefined),
        decodeAudioData: vi.fn().mockResolvedValue(buffer),
        createBufferSource: vi.fn(() => source),
        createAnalyser: vi.fn(() => analyser),
        destination: {},
      };
      vc["audioCtx"] = audioCtx;

      vc.play("aGVsbG8=", "audio/wav", vi.fn());

      // Allow the async playChunk setup to decode and schedule the first RAF tick.
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Pump the RAF queue a couple of times to simulate analysis ticks.
      expect(rafCallbacks.length).toBeGreaterThan(0);
      rafCallbacks.shift()?.(0);
      rafCallbacks.shift()?.(0);

      expect(vc.getCurrentAmplitude()).toBeGreaterThan(0);

      vc.stop();
      expect(vc.getCurrentAmplitude()).toBe(0);
    });
  });
});
