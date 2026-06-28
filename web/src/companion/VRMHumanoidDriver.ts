import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { BodyPose, Rotation3D } from "./bodyAnimation";

type DrivenBoneName = "head" | "neck" | "leftShoulder" | "rightShoulder";

const boneMap: Record<DrivenBoneName, VRMHumanBoneName> = {
  head: "head",
  neck: "neck",
  leftShoulder: "leftShoulder",
  rightShoulder: "rightShoulder",
};

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

  // Chest: prefer upperChest, fall back to chest
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

  // Blink
  const blinkName =
    expr.getExpressionTrackName("blink") ??
    (expr.getExpressionTrackName("blinkLeft") && expr.getExpressionTrackName("blinkRight")
      ? "blinkLeft"
      : null);
  const blinkRightName = expr.getExpressionTrackName("blinkRight");

  if (blinkName) {
    if (pose.blink > 0) {
      expr.setValue(blinkName, pose.blink);
      if (blinkRightName) expr.setValue(blinkRightName, pose.blink);
    } else {
      expr.setValue(blinkName, 0);
      if (blinkRightName) expr.setValue(blinkRightName, 0);
    }
  }

  // Brow
  const browName =
    expr.getExpressionTrackName("brow") ??
    expr.getExpressionTrackName("browInnerUp") ??
    expr.getExpressionTrackName("relaxed") ??
    expr.getExpressionTrackName("happy");
  if (browName) {
    expr.setValue(browName, pose.brow);
  }
}
