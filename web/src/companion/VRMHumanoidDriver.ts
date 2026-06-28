import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { BodyPose, Rotation3D } from "./bodyAnimation";

const boneMap: Record<keyof Omit<BodyPose, "blink" | "brow">, VRMHumanBoneName> = {
  head: "head",
  neck: "neck",
  chest: "upperChest", // fall back to "chest" if absent
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

  if (typeof pose.blink === "number" && pose.blink > 0) {
    if (expr.getExpressionTrackName("blink")) {
      expr.setValue("blink", pose.blink);
    } else if (
      expr.getExpressionTrackName("blinkLeft") &&
      expr.getExpressionTrackName("blinkRight")
    ) {
      expr.setValue("blinkLeft", pose.blink);
      expr.setValue("blinkRight", pose.blink);
    }
  } else {
    // Ensure blink releases when pose.blink is 0.
    if (expr.getExpressionTrackName("blink")) expr.setValue("blink", 0);
    if (expr.getExpressionTrackName("blinkLeft")) expr.setValue("blinkLeft", 0);
    if (expr.getExpressionTrackName("blinkRight")) expr.setValue("blinkRight", 0);
  }

  if (typeof pose.brow === "number" && pose.brow > 0) {
    const browName =
      expr.getExpressionTrackName("browInnerUp") ??
      expr.getExpressionTrackName("relaxed") ??
      expr.getExpressionTrackName("happy");
    if (browName) expr.setValue(browName, pose.brow);
  }
}
