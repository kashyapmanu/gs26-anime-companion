import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { BodyPose, Rotation3D } from "./bodyAnimation";

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
  // Simple bones.
  applyRotation(vrm, "head", pose.head);
  applyRotation(vrm, "neck", pose.neck);

  // Chest: VRM 1.0 uses upperChest, VRM 0.0 uses chest.
  const chestNode =
    vrm.humanoid.getNormalizedBoneNode("upperChest") ??
    vrm.humanoid.getNormalizedBoneNode("chest");
  if (chestNode) {
    chestNode.rotation.set(pose.chest.x, pose.chest.y, pose.chest.z);
  }

  // Shoulders.
  applyRotation(vrm, "leftShoulder", pose.leftShoulder);
  applyRotation(vrm, "rightShoulder", pose.rightShoulder);

  // Expressions.
  const expr = vrm.expressionManager;
  if (!expr) return;

  // Blink: prefer unified "blink"; fall back to split "blinkLeft"/"blinkRight".
  const hasBlink = expr.getExpression("blink") !== null;
  const hasBlinkLeft = expr.getExpression("blinkLeft") !== null;
  const hasBlinkRight = expr.getExpression("blinkRight") !== null;
  const blinkWeight = clamp01(pose.blink);

  if (hasBlink) {
    expr.setValue("blink", blinkWeight);
  } else {
    if (hasBlinkLeft) expr.setValue("blinkLeft", blinkWeight);
    if (hasBlinkRight) expr.setValue("blinkRight", blinkWeight);
  }

  // Brow: prefer "brow", then "browInnerUp", "relaxed", "happy".
  const browName =
    (expr.getExpression("brow") !== null ? "brow" : null) ??
    (expr.getExpression("browInnerUp") !== null ? "browInnerUp" : null) ??
    (expr.getExpression("relaxed") !== null ? "relaxed" : null) ??
    (expr.getExpression("happy") !== null ? "happy" : null);
  if (browName) {
    expr.setValue(browName, clamp01(pose.brow));
  }
}
