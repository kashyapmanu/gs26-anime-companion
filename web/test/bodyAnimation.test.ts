import { describe, it, expect } from "vitest";
import {
  computeBodyPose,
  defaultBodyAnimationConfig,
  initialBodyAnimationState,
  type BodyAnimationState,
} from "../src/companion/bodyAnimation";

const zeroState: BodyAnimationState = initialBodyAnimationState();

describe("computeBodyPose", () => {
  it("returns idle motion with zero amplitude", () => {
    const { pose } = computeBodyPose(0, 0, zeroState, defaultBodyAnimationConfig);
    expect(Math.abs(pose.head.x)).toBeGreaterThan(0);
    expect(Math.abs(pose.head.y)).toBeGreaterThan(0);
    expect(Math.abs(pose.leftShoulder.y)).toBeLessThan(0.01);
    expect(Math.abs(pose.rightShoulder.y)).toBeLessThan(0.01);
  });

  it("increases head nod with amplitude", () => {
    const { pose: silent } = computeBodyPose(0, 0, zeroState, defaultBodyAnimationConfig);
    const { pose: loud } = computeBodyPose(0, 0.8, zeroState, defaultBodyAnimationConfig);
    expect(Math.abs(loud.head.x)).toBeGreaterThan(Math.abs(silent.head.x));
  });

  it("clamps rotations to safe ranges", () => {
    const { pose } = computeBodyPose(0, 1, zeroState, defaultBodyAnimationConfig);
    const cfg = defaultBodyAnimationConfig;
    expect(Math.abs(pose.head.x)).toBeLessThanOrEqual(cfg.safety.maxHeadPitch);
    expect(Math.abs(pose.head.y)).toBeLessThanOrEqual(cfg.safety.maxHeadYaw);
    expect(Math.abs(pose.head.z)).toBeLessThanOrEqual(cfg.safety.maxHeadRoll);
    expect(Math.abs(pose.chest.x)).toBeLessThanOrEqual(cfg.safety.maxChest);
  });

  it("triggers a blink within a reasonable time window", () => {
    let state = zeroState;
    let blinked = false;
    for (let t = 0; t < 30; t += 0.05) {
      const result = computeBodyPose(t, 0, state, defaultBodyAnimationConfig);
      state = result.state;
      if (result.pose.blink > 0) {
        blinked = true;
        break;
      }
    }
    expect(blinked).toBe(true);
  });

  it("detects emphasis when amplitude spikes", () => {
    let state = { ...zeroState, lastAmplitude: 0 };
    const cfg = defaultBodyAnimationConfig;
    const { pose, state: s2 } = computeBodyPose(0, 0.1, state, cfg);
    const { pose: spike } = computeBodyPose(0.05, 0.9, s2, cfg);
    expect(Math.abs(spike.head.z)).toBeGreaterThan(Math.abs(pose.head.z));
  });

  it("persists smoothed amplitude across frames", () => {
    const cfg = defaultBodyAnimationConfig;
    let state = zeroState;
    const r1 = computeBodyPose(0, 1, state, cfg);
    const r2 = computeBodyPose(0.1, 0, r1.state, cfg);
    const r3 = computeBodyPose(0.2, 0, r2.state, cfg);
    // The smoothed reactive amplitude should decay frame-over-frame.
    expect(r1.state.lastSmoothedAmplitude).toBeGreaterThan(
      r2.state.lastSmoothedAmplitude
    );
    expect(r2.state.lastSmoothedAmplitude).toBeGreaterThan(
      r3.state.lastSmoothedAmplitude
    );
    // Reactive head nod should decay immediately after the amplitude drops.
    expect(Math.abs(r1.pose.head.x)).toBeGreaterThan(Math.abs(r2.pose.head.x));
  });

  it("applies sentence-start boost", () => {
    const state: BodyAnimationState = { ...zeroState, lastAmplitude: 0 };
    const { pose } = computeBodyPose(0, 0.2, state, defaultBodyAnimationConfig);
    const { pose: noBoost } = computeBodyPose(
      0,
      0.2,
      { ...zeroState, lastAmplitude: 0.5 },
      defaultBodyAnimationConfig
    );
    expect(Math.abs(pose.head.x)).toBeGreaterThan(Math.abs(noBoost.head.x));
  });

  it("decays emphasis over time", () => {
    const cfg = defaultBodyAnimationConfig;
    let state = { ...zeroState, lastAmplitude: 0 };
    const { pose: spike, state: s2 } = computeBodyPose(0, 0.9, state, cfg);
    const { pose: later } = computeBodyPose(2, 0.1, s2, cfg);
    expect(Math.abs(spike.head.z)).toBeGreaterThan(Math.abs(later.head.z));
  });

  it("initialBodyAnimationState returns the documented default", () => {
    const s = initialBodyAnimationState();
    expect(s.lastAmplitude).toBe(0);
    expect(s.lastSmoothedAmplitude).toBe(0);
    expect(s.emphasisValue).toBe(0);
    expect(s.inBlinkUntil).toBe(0);
  });
});
