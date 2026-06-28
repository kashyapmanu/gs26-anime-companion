import { describe, it, expect } from "vitest";
import {
  computeBodyPose,
  defaultBodyAnimationConfig,
  type BodyAnimationState,
} from "../src/companion/bodyAnimation";

const zeroState: BodyAnimationState = {
  lastAmplitude: 0,
  emphasisTime: -Infinity,
  emphasisValue: 0,
  nextBlinkTime: 1,
  inBlinkUntil: 0,
};

describe("computeBodyPose", () => {
  it("returns idle motion with zero amplitude", () => {
    const { pose } = computeBodyPose(0, 0, zeroState, defaultBodyAnimationConfig);
    // Head should have small idle drift, not be exactly zero.
    expect(Math.abs(pose.head.x)).toBeGreaterThan(0);
    expect(Math.abs(pose.head.y)).toBeGreaterThan(0);
    // Shoulders should be near rest.
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
});
