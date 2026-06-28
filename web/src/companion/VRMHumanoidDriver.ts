import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { BodyPose, Rotation3D } from "./bodyAnimation";

type DrivenBoneName = "head" | "neck" | "leftShoulder" | "rightShoulder";

const boneMap: Record<DrivenBoneName, VRMHumanBoneName> = {
  head: "head",
  neck: "neck",
  leftShoulder: "leftShoulder",
  rightShoulder: "rightShoulder",
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function applyRotation(
  vrm: VRM,
  name: VRMHumanBoneName,
  rotation: Rotation3D
): void {
  const node = vrm.humanoid.getNormalizedBoneNode(name);
  if (!node) return;
  node.rotation.set(rotation.x, rotation.y, rotation.z);
}

export function applyBodyPose(vrm: VRM, pose: BodyPose): void {
  // Head
  applyRotation(vrm, boneMap.head, pose.head);

  // Neck
  applyRotation(vrm, boneMap.neck, pose.neck);

  // Chest: VRM 1.0 uses upperChest, VRM 0.0 uses chest.
  const chestNode =
    vrm.humanoid.getNormalizedBoneNode("upperChest") ??
    vrm.humanoid.getNormalizedBoneNode("chest");
  if (chestNode) {
    chestNode.rotation.set(pose.chest.x, pose.chest.y, pose.chest.z);
  }

  // Shoulders
  applyRotation(vrm, boneMap.leftShoulder, pose.leftShoulder);
  applyRotation(vrm, boneMap.rightShoulder, pose.rightShoulder);

  // Expressions
  const expr = vrm.expressionManager;
  if (!expr) return;

  // Blink: prefer unified "blink"; fall back to split "blinkLeft"/"blinkRight".
  const hasBlink = expr.getExpressionTrackName("blink");
  const hasBlinkLeft = expr.getExpressionTrackName("blinkLeft");
  const hasBlinkRight = expr.getExpressionTrackName("blinkRight");
  const blinkWeight = pose.blink > 0 ? pose.blink : 0;

  if (hasBlink) {
    expr.setValue("blink", blinkWeight);
  } else if (hasBlinkLeft && hasBlinkRight) {
    expr.setValue("blinkLeft", blinkWeight);
    expr.setValue("blinkRight", blinkWeight);
  }

  // Brow: prefer "brow", then "browInnerUp", "relaxed", "happy".
  const browName =
    expr.getExpressionTrackName("brow") ??
    expr.getExpressionTrackName("browInnerUp") ??
    expr.getExpressionTrackName("relaxed") ??
    expr.getExpressionTrackName("happy");
  if (browName) {
    expr.setValue(browName, clamp01(pose.brow));
  }
}
