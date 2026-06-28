import { describe, it, expect, vi } from "vitest";
import { applyBodyPose } from "../src/companion/VRMHumanoidDriver";
import type { BodyPose } from "../src/companion/bodyAnimation";

function makeMockVRM(boneNames: string[], expressionNames: string[] = []) {
  const bones: Record<string, { rotation: { set: ReturnType<typeof vi.fn> } }> = {};
  for (const name of boneNames) {
    bones[name] = { rotation: { set: vi.fn() } };
  }
  const expressions: Record<string, number> = {};
  const setValue = vi.fn((name: string, value: number) => {
    expressions[name] = value;
  });
  return {
    humanoid: {
      getNormalizedBoneNode: vi.fn((name: string) => bones[name] ?? null),
    },
    expressionManager: {
      setValue,
      getExpressionTrackName: vi.fn((name: string) => (expressionNames.includes(name) ? name : undefined)),
    },
  } as unknown as import("@pixiv/three-vrm").VRM;
}

describe("applyBodyPose", () => {
  it("rotates existing bones and sets expressions", () => {
    const vrm = makeMockVRM(["head", "neck", "chest", "leftShoulder", "rightShoulder"], ["blink"]);
    const pose: BodyPose = {
      head: { x: 0.1, y: 0.2, z: 0.3 },
      neck: { x: 0.01, y: 0, z: 0 },
      chest: { x: 0.02, y: 0, z: 0 },
      leftShoulder: { x: 0, y: 0, z: 0.005 },
      rightShoulder: { x: 0, y: 0, z: -0.005 },
      blink: 1,
      brow: 0.5,
    };
    applyBodyPose(vrm, pose);
    expect(vrm.humanoid.getNormalizedBoneNode("head")).toBeTruthy();
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith("blink", 1);
  });

  it("does not throw when bones are missing", () => {
    const vrm = makeMockVRM(["head"], ["blink"]);
    const pose: BodyPose = {
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftShoulder: { x: 0, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 0, z: 0 },
      blink: 0,
      brow: 0,
    };
    expect(() => applyBodyPose(vrm, pose)).not.toThrow();
  });

  it("does not throw when expressionManager is missing", () => {
    const vrm = makeMockVRM(["head"]) as any;
    delete vrm.expressionManager;
    const pose: BodyPose = {
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftShoulder: { x: 0, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 0, z: 0 },
      blink: 1,
      brow: 0.5,
    };
    expect(() => applyBodyPose(vrm, pose)).not.toThrow();
  });
});
