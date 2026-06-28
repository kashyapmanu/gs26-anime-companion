import { describe, it, expect, vi } from "vitest";
import { applyBodyPose } from "../src/companion/VRMHumanoidDriver";
import type { BodyPose } from "../src/companion/bodyAnimation";
import type { VRM } from "@pixiv/three-vrm";

function makeMockVRM(boneNames: string[], expressionNames: string[] = []) {
  const bones: Record<
    string,
    { rotation: { set: ReturnType<typeof vi.fn> } }
  > = {};
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
      getExpressionTrackName: vi.fn((name: string) =>
        expressionNames.includes(name) ? `${name}.weight` : null
      ),
    },
    expressions,
    bones,
  } as unknown as VRM & {
    expressions: Record<string, number>;
    bones: Record<string, { rotation: { set: ReturnType<typeof vi.fn> } }>;
  };
}

describe("applyBodyPose", () => {
  it("rotates existing bones and sets expressions", () => {
    const vrm = makeMockVRM(
      ["head", "neck", "upperChest", "leftShoulder", "rightShoulder"],
      ["blink", "brow"]
    );
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

    expect(vrm.bones.head.rotation.set).toHaveBeenCalledWith(0.1, 0.2, 0.3);
    expect(vrm.bones.neck.rotation.set).toHaveBeenCalledWith(0.01, 0, 0);
    expect(vrm.bones.upperChest.rotation.set).toHaveBeenCalledWith(0.02, 0, 0);
    expect(vrm.bones.leftShoulder.rotation.set).toHaveBeenCalledWith(0, 0, 0.005);
    expect(vrm.bones.rightShoulder.rotation.set).toHaveBeenCalledWith(0, 0, -0.005);
    expect(vrm.expressions["blink"]).toBe(1);
    expect(vrm.expressions["brow"]).toBe(0.5);
  });

  it("falls back to chest when upperChest is missing", () => {
    const vrm = makeMockVRM(["chest"], []);
    const pose: BodyPose = {
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      chest: { x: 0.02, y: 0, z: 0 },
      leftShoulder: { x: 0, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 0, z: 0 },
      blink: 0,
      brow: 0,
    };
    applyBodyPose(vrm, pose);
    expect(vrm.humanoid.getNormalizedBoneNode).toHaveBeenCalledWith("upperChest");
    expect(vrm.humanoid.getNormalizedBoneNode).toHaveBeenCalledWith("chest");
    expect(vrm.bones.chest.rotation.set).toHaveBeenCalledWith(0.02, 0, 0);
  });

  it("falls back to blinkLeft/blinkRight when blink is missing", () => {
    const vrm = makeMockVRM([], ["blinkLeft", "blinkRight"]);
    const pose: BodyPose = {
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftShoulder: { x: 0, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 0, z: 0 },
      blink: 0.75,
      brow: 0,
    };
    applyBodyPose(vrm, pose);
    expect(vrm.expressions["blinkLeft"]).toBe(0.75);
    expect(vrm.expressions["blinkRight"]).toBe(0.75);
  });

  it("drives a single available blink side", () => {
    const vrm = makeMockVRM([], ["blinkLeft"]);
    const pose: BodyPose = {
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftShoulder: { x: 0, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 0, z: 0 },
      blink: 0.5,
      brow: 0,
    };
    applyBodyPose(vrm, pose);
    expect(vrm.expressions["blinkLeft"]).toBe(0.5);
    expect(vrm.expressions["blinkRight"]).toBeUndefined();
  });

  it("prefers unified blink over split blink expressions", () => {
    const vrm = makeMockVRM([], ["blink", "blinkLeft", "blinkRight"]);
    const pose: BodyPose = {
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftShoulder: { x: 0, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 0, z: 0 },
      blink: 0.6,
      brow: 0,
    };
    applyBodyPose(vrm, pose);
    expect(vrm.expressions["blink"]).toBe(0.6);
    expect(vrm.expressions["blinkLeft"]).toBeUndefined();
    expect(vrm.expressions["blinkRight"]).toBeUndefined();
  });

  it("releases blink expressions when pose.blink is 0", () => {
    const vrm = makeMockVRM([], ["blink"]);
    const pose: BodyPose = {
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftShoulder: { x: 0, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 0, z: 0 },
      blink: 0,
      brow: 0,
    };
    applyBodyPose(vrm, pose);
    expect(vrm.expressions["blink"]).toBe(0);
  });

  it("releases brow expression when pose.brow is 0", () => {
    const vrm = makeMockVRM([], ["brow"]);
    const pose: BodyPose = {
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftShoulder: { x: 0, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 0, z: 0 },
      blink: 0,
      brow: 0,
    };
    applyBodyPose(vrm, pose);
    expect(vrm.expressions["brow"]).toBe(0);
  });

  it("clamps negative brow values to 0", () => {
    const vrm = makeMockVRM([], ["brow"]);
    const pose: BodyPose = {
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftShoulder: { x: 0, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 0, z: 0 },
      blink: 0,
      brow: -0.5,
    };
    applyBodyPose(vrm, pose);
    expect(vrm.expressions["brow"]).toBe(0);
  });

  it("falls back through brow expression names", () => {
    const vrm = makeMockVRM([], ["browInnerUp"]);
    const pose: BodyPose = {
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftShoulder: { x: 0, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 0, z: 0 },
      blink: 0,
      brow: 0.4,
    };
    applyBodyPose(vrm, pose);
    expect(vrm.expressions["browInnerUp"]).toBe(0.4);
    expect(vrm.expressions["brow"]).toBeUndefined();
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
    const vrm = makeMockVRM(["head"], []) as unknown as Record<string, unknown>;
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
    expect(() => applyBodyPose(vrm as unknown as VRM, pose)).not.toThrow();
  });
});
