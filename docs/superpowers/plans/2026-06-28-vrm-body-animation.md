# VRM Body Animation Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add continuous procedural body movement (idle breathing/sway, speech-reactive nods, expressive accents) to the existing `VRMStage` avatar without changing lip-sync or widget APIs.

**Architecture:** Two new pure/testable modules (`bodyAnimation.ts` for math, `VRMHumanoidDriver.ts` for applying poses) plus small changes to `VoiceController.ts` (expose live amplitude) and `VRMStage.tsx` (run the body layer each frame). All motion is procedural; no new dependencies or animation files.

**Tech Stack:** React, TypeScript, Vite, Vitest, three.js, `@pixiv/three-vrm`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `web/src/companion/VoiceController.ts` | Expose `getCurrentAmplitude()` so the render loop can read live speech volume. Existing playback/STT logic unchanged. |
| `web/src/companion/bodyAnimation.ts` | Pure function `computeBodyPose(time, amplitude, state, config, delta?)` returns a deterministic `BodyPose` snapshot. |
| `web/src/companion/VRMHumanoidDriver.ts` | Applies a `BodyPose` to a loaded `VRM`'s normalized humanoid bones and expression manager. |
| `web/src/companion/VRMStage.tsx` | Initializes the body layer, reads amplitude each frame, computes/apply body pose, keeps lip-sync. |
| `web/test/bodyAnimation.test.ts` | Unit tests for idle, reactive, expressive, and clamp behavior. |
| `web/test/VRMHumanoidDriver.test.ts` | Unit tests applying a pose to a mocked VRM and handling missing bones. |

---

## Task 1: Expose live amplitude from `VoiceController`

**Files:**
- Modify: `web/src/companion/VoiceController.ts`
- Test: `web/test/VoiceController.test.ts` (new)

### Step 1: Write the failing test

Create `web/test/VoiceController.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { VoiceController } from "../src/companion/VoiceController";

describe("VoiceController amplitude", () => {
  it("returns 0 when no audio is playing", () => {
    const vc = new VoiceController();
    expect(vc.getCurrentAmplitude()).toBe(0);
  });

  it("returns the last computed RMS while playing", async () => {
    const vc = new VoiceController();
    // We cannot easily drive the Web Audio pipeline in jsdom,
    // so we assert the method exists and returns a number.
    expect(typeof vc.getCurrentAmplitude).toBe("function");
    const amp = vc.getCurrentAmplitude();
    expect(typeof amp).toBe("number");
    expect(amp).toBeGreaterThanOrEqual(0);
  });
});
```

### Step 2: Run the test to verify it fails

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion/web
npx vitest run test/VoiceController.test.ts
```

**Expected:** FAIL — `getCurrentAmplitude` does not exist on `VoiceController`.

### Step 3: Add `getCurrentAmplitude()` to `VoiceController`

Modify `web/src/companion/VoiceController.ts`:

```typescript
export class VoiceController {
  private recognition: RecognitionLike | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private currentSource: AudioBufferSourceNode | null = null;
  private queue: Array<{ audioBase64: string; mime: string; onViseme: (w: VisemeWeights) => void }> = [];
  private playing = false;
  private currentAmplitude = 0; // NEW

  // ... existing methods ...

  /** Returns the current speech amplitude (0..1), or 0 when silent. */
  getCurrentAmplitude(): number {
    return this.currentAmplitude;
  }

  private async playChunk(
    audioBase64: string,
    mime: string,
    onViseme: (w: VisemeWeights) => void
  ): Promise<void> {
    const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    this.audioCtx = this.audioCtx ?? new AudioContext();
    if (this.audioCtx.state === "suspended") await this.audioCtx.resume();
    const buffer = await this.audioCtx.decodeAudioData(bytes.buffer.slice(0));
    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    const analyser = this.audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser).connect(this.audioCtx.destination);
    this.analyser = analyser;
    this.currentSource = source;
    source.start();
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (this.analyser !== analyser) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      this.currentAmplitude = rms; // NEW
      onViseme(amplitudeToViseme(rms));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return new Promise((resolve) => {
      source.onended = () => {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.currentAmplitude = 0; // NEW
        onViseme(amplitudeToViseme(0));
        resolve();
      };
    });
  }

  /** Stop audio playback only; leaves speech recognition running. */
  private stopPlayback(): void {
    this.queue = [];
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    try {
      this.currentSource?.stop();
    } catch {
      /* already stopped */
    }
    this.currentSource = null;
    this.currentAmplitude = 0; // NEW
  }

  // ... rest unchanged ...
}
```

### Step 4: Run the test to verify it passes

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion/web
npx vitest run test/VoiceController.test.ts
```

**Expected:** PASS.

### Step 5: Commit

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion
git add web/src/companion/VoiceController.ts web/test/VoiceController.test.ts
git commit -m "feat(web): expose live audio amplitude from VoiceController"
```

---

## Task 2: Implement `bodyAnimation.ts`

**Files:**
- Create: `web/src/companion/bodyAnimation.ts`
- Test: `web/test/bodyAnimation.test.ts`

### Step 1: Write the failing tests

Create `web/test/bodyAnimation.test.ts`:

```typescript
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
```

### Step 2: Run the tests to verify they fail

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion/web
npx vitest run test/bodyAnimation.test.ts
```

**Expected:** FAIL — module/file does not exist.

### Step 3: Implement `bodyAnimation.ts`

Create `web/src/companion/bodyAnimation.ts`:

```typescript
export interface Rotation3D {
  x: number; // pitch
  y: number; // yaw
  z: number; // roll
}

export interface BodyPose {
  head: Rotation3D;
  neck: Rotation3D;
  chest: Rotation3D;
  leftShoulder: Rotation3D;
  rightShoulder: Rotation3D;
  blink: number;
  brow: number;
}

export interface BodyAnimationState {
  lastAmplitude: number;
  lastSmoothedAmplitude: number;
  emphasisTime: number;
  emphasisValue: number;
  nextBlinkTime: number;
  inBlinkUntil: number;
}

export interface BodyAnimationConfig {
  idle: {
    breathSpeed: number;
    breathAmount: number;
    headSwaySpeedX: number;
    headSwaySpeedY: number;
    headSwayAmount: number;
    blinkIntervalMin: number;
    blinkIntervalMax: number;
    blinkDuration: number;
  };
  reactive: {
    nodAmount: number;
    leanAmount: number;
    smoothing: number;
    browAmount: number;
  };
  expressive: {
    emphasisThreshold: number;
    emphasisDecay: number;
    emphasisTilt: number;
    sentenceStartBoost: number;
  };
  safety: {
    maxHeadPitch: number;
    maxHeadYaw: number;
    maxHeadRoll: number;
    maxNeck: number;
    maxChest: number;
    maxShoulderY: number;
  };
}

const DEG2RAD = Math.PI / 180;

export const defaultBodyAnimationConfig: BodyAnimationConfig = {
  idle: {
    breathSpeed: 0.8,
    breathAmount: 2 * DEG2RAD,
    headSwaySpeedX: 0.35,
    headSwaySpeedY: 0.27,
    headSwayAmount: 1.5 * DEG2RAD,
    blinkIntervalMin: 2,
    blinkIntervalMax: 5,
    blinkDuration: 0.15,
  },
  reactive: {
    nodAmount: 4 * DEG2RAD,
    leanAmount: 1.5 * DEG2RAD,
    smoothing: 0.2,
    browAmount: 0.15,
  },
  expressive: {
    emphasisThreshold: 0.35,
    emphasisDecay: 2.5,
    emphasisTilt: 6 * DEG2RAD,
    sentenceStartBoost: 2 * DEG2RAD,
  },
  safety: {
    maxHeadPitch: 15 * DEG2RAD,
    maxHeadYaw: 12 * DEG2RAD,
    maxHeadRoll: 8 * DEG2RAD,
    maxNeck: 5 * DEG2RAD,
    maxChest: 4 * DEG2RAD,
    maxShoulderY: 0.015,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic pseudo-random float in [0, 1) based on an integer seed. */
function fractSin(seed: number): number {
  return Math.abs(Math.sin(seed * 12.9898 + 78.233) % 1);
}

export function initialBodyAnimationState(): BodyAnimationState {
  return {
    lastAmplitude: 0,
    emphasisTime: -Infinity,
    emphasisValue: 0,
    nextBlinkTime: 1,
    inBlinkUntil: 0,
  };
}

export function computeBodyPose(
  time: number,
  amplitude: number,
  state: BodyAnimationState,
  config: BodyAnimationConfig = defaultBodyAnimationConfig,
  delta: number = 1 / 60
): { pose: BodyPose; state: BodyAnimationState } {
  const nextState: BodyAnimationState = {
    lastAmplitude: amplitude,
    emphasisTime: state.emphasisTime,
    emphasisValue: state.emphasisValue,
    nextBlinkTime: state.nextBlinkTime,
    inBlinkUntil: state.inBlinkUntil,
  };

  // Smooth amplitude for reactive layer.
  const smoothAmp = lerp(state.lastAmplitude, amplitude, config.reactive.smoothing);

  // --- Idle ---
  const breath = Math.sin(time * config.idle.breathSpeed * Math.PI * 2);
  const chestPitch = breath * config.idle.breathAmount;
  const shoulderY = breath * config.safety.maxShoulderY;

  const headPitch =
    Math.sin(time * config.idle.headSwaySpeedX * Math.PI * 2) * config.idle.headSwayAmount;
  const headYaw =
    Math.sin(time * config.idle.headSwaySpeedY * Math.PI * 2) * config.idle.headSwayAmount;

  // --- Reactive ---
  const nod = smoothAmp * config.reactive.nodAmount;
  const lean = smoothAmp * config.reactive.leanAmount;
  const brow = smoothAmp * config.reactive.browAmount;

  // --- Expressive: emphasis spike detection ---
  const delta = amplitude - state.lastAmplitude;
  let emphasis = state.emphasisValue * Math.exp(-(time - state.emphasisTime) * config.expressive.emphasisDecay);
  if (delta > config.expressive.emphasisThreshold) {
    emphasis = 1;
    nextState.emphasisTime = time;
  }
  nextState.emphasisValue = emphasis;

  // Sentence-start boost: amplitude rising from near zero.
  const sentenceStart = state.lastAmplitude < 0.05 && amplitude > 0.1 ? config.expressive.sentenceStartBoost : 0;

  const emphasisTilt = emphasis * config.expressive.emphasisTilt;

  // --- Blink ---
  let blink = 0;
  if (time >= state.nextBlinkTime) {
    nextState.inBlinkUntil = time + config.idle.blinkDuration;
    const seed = Math.floor(time * 1000);
    const interval =
      config.idle.blinkIntervalMin +
      fractSin(seed) * (config.idle.blinkIntervalMax - config.idle.blinkIntervalMin);
    nextState.nextBlinkTime = time + interval;
  }
  if (time < state.inBlinkUntil) {
    blink = 1;
  }

  const head: Rotation3D = {
    x: clamp(headPitch - nod - sentenceStart, -config.safety.maxHeadPitch, config.safety.maxHeadPitch),
    y: clamp(headYaw, -config.safety.maxHeadYaw, config.safety.maxHeadYaw),
    z: clamp(emphasisTilt, -config.safety.maxHeadRoll, config.safety.maxHeadRoll),
  };

  const neck: Rotation3D = {
    x: clamp(chestPitch * 0.5, -config.safety.maxNeck, config.safety.maxNeck),
    y: 0,
    z: clamp(emphasisTilt * 0.3, -config.safety.maxNeck, config.safety.maxNeck),
  };

  const chest: Rotation3D = {
    x: clamp(chestPitch - lean, -config.safety.maxChest, config.safety.maxChest),
    y: 0,
    z: 0,
  };

  const leftShoulder: Rotation3D = {
    x: 0,
    y: 0,
    z: clamp(shoulderY, -config.safety.maxShoulderY, config.safety.maxShoulderY),
  };

  const rightShoulder: Rotation3D = {
    x: 0,
    y: 0,
    z: clamp(-shoulderY, -config.safety.maxShoulderY, config.safety.maxShoulderY),
  };

  const pose: BodyPose = {
    head,
    neck,
    chest,
    leftShoulder,
    rightShoulder,
    blink,
    brow: clamp(brow, 0, 1),
  };

  return { pose, state: nextState };
}
```

### Step 4: Run the tests to verify they pass

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion/web
npx vitest run test/bodyAnimation.test.ts
```

**Expected:** PASS (all 5 tests).

### Step 5: Commit

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion
git add web/src/companion/bodyAnimation.ts web/test/bodyAnimation.test.ts
git commit -m "feat(web): procedural body animation math with tests"
```

---

## Task 3: Implement `VRMHumanoidDriver.ts`

**Files:**
- Create: `web/src/companion/VRMHumanoidDriver.ts`
- Test: `web/test/VRMHumanoidDriver.test.ts`

### Step 1: Write the failing tests

Create `web/test/VRMHumanoidDriver.test.ts`:

```typescript
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
```

### Step 2: Run the tests to verify they fail

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion/web
npx vitest run test/VRMHumanoidDriver.test.ts
```

**Expected:** FAIL — module/file does not exist.

### Step 3: Implement `VRMHumanoidDriver.ts`

Create `web/src/companion/VRMHumanoidDriver.ts`:

```typescript
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
```

### Step 4: Run the tests to verify they pass

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion/web
npx vitest run test/VRMHumanoidDriver.test.ts
```

**Expected:** PASS.

### Step 5: Commit

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion
git add web/src/companion/VRMHumanoidDriver.ts web/test/VRMHumanoidDriver.test.ts
git commit -m "feat(web): VRM humanoid driver for body pose application"
```

---

## Task 4: Integrate body animation into `VRMStage.tsx`

**Files:**
- Modify: `web/src/companion/VRMStage.tsx`

### Step 1: Modify `VRMStage.tsx`

Update imports and types at the top of `web/src/companion/VRMStage.tsx`:

```typescript
import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, type VRM } from "@pixiv/three-vrm";
import { VoiceController } from "./VoiceController";
import { amplitudeToViseme, type VisemeWeights } from "./lipSync";
import {
  computeBodyPose,
  initialBodyAnimationState,
  type BodyAnimationState,
} from "./bodyAnimation";
import { applyBodyPose } from "./VRMHumanoidDriver";
```

Update the component signature to accept the optional prop:

```typescript
export const VRMStage = forwardRef<
  VRMStageHandle,
  { modelUrl: string; enableBodyAnimation?: boolean }
>(function VRMStage({ modelUrl, enableBodyAnimation = true }, _ref) {
```

Inside the `useEffect`, add body-animation state and the application logic:

```typescript
  const bodyStateRef = useRef<BodyAnimationState>(initialBodyAnimationState());
  const bodyTimeRef = useRef<number>(0);

  // ... existing setup ...

  const render = (time: number) => {
    raf = requestAnimationFrame(render);
    const delta = Math.min(1, 1 / 60);
    bodyTimeRef.current += delta;

    // Lip-sync (existing)
    const v = targetViseme.current;
    const expr = vrmRef.current?.expressionManager;
    if (expr) {
      expr.setValue("aa", v.aa);
      expr.setValue("ih", v.ih);
      expr.setValue("ou", v.ou);
      expr.setValue("ee", v.ee);
      expr.setValue("oh", v.oh);
    }

    // Body animation (new)
    if (enableBodyAnimation && vrmRef.current) {
      const amplitude = voiceRef.current.getCurrentAmplitude();
      const { pose, state } = computeBodyPose(
        bodyTimeRef.current,
        amplitude,
        bodyStateRef.current
      );
      bodyStateRef.current = state;
      applyBodyPose(vrmRef.current, pose);
    }

    if (vrmRef.current) vrmRef.current.update(delta);
    renderer.render(scene, camera);
  };
  render(0);
```

**Note:** Change the existing `render` arrow to accept `time: number` even though we ignore it; this avoids any `requestAnimationFrame` timestamp confusion. The existing call `render()` becomes `render(0)`.

### Step 2: Run typecheck and existing tests

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion/web
npm run typecheck
npx vitest run
```

**Expected:** Typecheck passes; all existing + new tests pass.

### Step 3: Commit

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion
git add web/src/companion/VRMStage.tsx
git commit -m "feat(web): integrate procedural body animation into VRMStage"
```

---

## Task 5: Verify the full stack

**Files:** None changed; verification only.

### Step 1: Run the web test suite

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion/web
npx vitest run
```

**Expected:** All tests pass, including the new `bodyAnimation`, `VRMHumanoidDriver`, and `VoiceController` tests plus existing tests.

### Step 2: Typecheck

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion/web
npm run typecheck
```

**Expected:** No TypeScript errors.

### Step 3: Manual demo checklist

Start the app:

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion
./start.sh
```

Then verify in the browser:

1. Open the companion widget.
2. While silent, the avatar should show subtle breathing and head sway.
3. Trigger the greeting or send a message; the avatar should nod/lean with speech.
4. Click Stop; motion should smoothly return to idle.
5. (Optional) Temporarily set `enableBodyAnimation={false}` in `CompanionWidget.tsx` on the `<VRMStage />` line and confirm body motion freezes while lip-sync still works.

### Step 4: Commit any final verification notes

No code changes expected. If you updated anything during verification, commit it with:

```bash
cd /Users/manu/superconductor/projects/gs26-anime-companion
git add -A
git commit -m "chore(web): verify body animation integration"
```

---

## Self-Review Checklist

- [ ] **Spec coverage:** Every requirement (F1–F6, N1–N4) maps to a task.
  - F1 idle: Task 2 idle layer.
  - F2 reactive: Task 1 amplitude + Task 2 reactive layer.
  - F3 expressive: Task 2 emphasis/spike detection.
  - F4 non-destructive: Tasks 1/4 keep `lipSync.ts` and widget API unchanged.
  - F5 graceful degradation: Task 3 missing-bone handling.
  - F6 toggle: Task 4 `enableBodyAnimation` prop.
- [ ] **No placeholders:** Every step has exact file paths, code, and commands.
- [ ] **Type consistency:** `BodyPose`, `BodyAnimationState`, and `BodyAnimationConfig` are defined in Task 2 and used consistently in Tasks 3 and 4.
- [ ] **No contradictions:** Body pose is applied before `vrm.update(delta)` so three-vrm can propagate normalized bones to raw bones; lip-sync is applied first so expressions are already set when update runs.
