# VRM Body Animation Layer — Design Spec

- **Date:** 2026-06-28
- **Status:** Approved (brainstorm complete)
- **Topic:** Add continuous procedural body movement to the existing VRM avatar.
- **Branch note:** Work will happen in a dedicated feature branch off `main`.

## 1. Overview

The current `VRMStage` only animates the mouth via amplitude-driven visemes. This design adds a **procedural body-animation layer** that runs continuously while the avatar is visible: idle breathing/sway when silent, speech-reactive nods/leans when talking, and expressive accents on volume emphasis. The mouth lip-sync system remains unchanged.

The implementation is **code-only**: no new animation files, no new runtime dependencies.

## 2. Requirements

### Functional

- **F1. Always-on idle motion.** Subtle breathing (chest/spine), head drift, and periodic blinks run whenever the avatar is rendered.
- **F2. Speech-reactive movement.** Head nods and torso leans scale with live audio amplitude during TTS playback.
- **F3. Expressive accents.** Sudden volume spikes trigger short head tilts/rolls; sentence starts trigger slightly larger nods; shoulders shift with the breath cycle.
- **F4. Non-destructive integration.** Existing lip-sync (`lipSync.ts`) and widget APIs (`VRMStageHandle`) stay unchanged.
- **F5. Graceful degradation.** Missing bones or expressions are skipped; rotation values are clamped to safe ranges.
- **F6. Toggle switch.** Body animation can be disabled via an optional prop without touching the math.

### Non-functional

- **N1. No new runtime dependencies.** Use only `three` and `@pixiv/three-vrm` already in the project.
- **N2. Testable math.** Motion computation is a pure function of `time` and `amplitude`; unit-testable in Vitest.
- **N3. Single-responsibility modules.** Motion computation, bone driving, and frame-loop integration are separate files.
- **N4. Hackathon-safe scope.** Procedural-only; animation clips remain a future enhancement.

## 3. Out of scope

- External `.vrma`/animation clips.
- Eye-tracking / mouse-follow.
- Fine finger/hand articulation.
- Physics/spring-bone customization (existing `three-vrm` behavior is unchanged).
- Lip-sync quality improvements.
- Mobile-specific tuning.

## 4. Approach chosen

**Approach 1 — Procedural / code-only.**

Two other approaches were considered:

- **Approach 2 — VRM animation clips + reactive layer:** more natural idle motion but requires sourcing/creating animation files and adding `@pixiv/three-vrm-animation`.
- **Approach 3 — Minimal procedural MVP, animation-ready later:** smaller initial change but doesn't deliver the expressive feel immediately.

Approach 1 was chosen because it satisfies all requested movement categories, requires no asset hunt or extra dependency, and keeps the feature branch small and reviewable.

## 5. Architecture

```
CompanionWidget (unchanged)
  └─ VRMStage
       ├─ VoiceController (audio playback + amplitude)
       ├─ lipSync.ts (mouth visemes, unchanged)
       ├─ bodyAnimation.ts (pure: time + amplitude → BodyPose)
       └─ VRMHumanoidDriver.ts (applies BodyPose to VRM bones/expressions)
```

### Components

#### `bodyAnimation.ts` (pure)

Computes a `BodyPose` from `time`, `speechAmplitude`, and a `config` object.

- *Interface:* `computeBodyPose(time: number, amplitude: number, config: BodyAnimationConfig): BodyPose`
- *Returns:* rotations for head, neck, upper chest, shoulders; expression weights for blink and optional brow/eye accents; an emphasis scalar.
- *Depends on:* nothing (pure math).

#### `VRMHumanoidDriver.ts`

Applies a `BodyPose` to a loaded `VRM`.

- *Interface:* `applyBodyPose(vrm: VRM, pose: BodyPose): void`
- *Behavior:* resolves normalized bone nodes by `VRMHumanBoneName`, sets local rotations, and sets expression values. Missing bones/expressions are silently skipped.
- *Depends on:* `@pixiv/three-vrm`, `three`.

#### `VRMStage.tsx`

Integrates the body layer into the existing render loop.

- *Changes:*
  - Initialize a body-animation state object on mount.
  - Expose an optional `enableBodyAnimation?: boolean` prop (default `true`).
  - Each frame, read live amplitude from `VoiceController`, compute `BodyPose`, apply it, then apply lip-sync, then call `vrm.update(delta)`.
- *Interface remains:* `load`, `speak`, `stopSpeaking`.
- *Depends on:* `bodyAnimation.ts`, `VRMHumanoidDriver.ts`, `VoiceController`.

#### `VoiceController.ts`

Minor addition: expose current amplitude so `VRMStage` can drive reactive motion.

- *Addition:* `getCurrentAmplitude(): number` — returns the last computed RMS from the analyser, or `0` when not playing.
- *Existing behavior unchanged.*

#### `lipSync.ts`

Unchanged. Mouth visemes continue to be driven from the same audio analyser.

## 6. Body animation details

### 6.1 Idle layer

- **Breathing:** slow sine wave rotates the upper chest/ spine forward/back by ~1–2° and slightly raises/lowers the shoulders.
- **Head drift:** two low-frequency sine waves at different periods create a gentle figure-eight-like head rotation (yaw/pitch).
- **Blinks:** a pseudo-random timer closes the `blink` expression for ~150 ms every 2–5 seconds.

### 6.2 Speech-reactive layer

- **Head nod:** audio amplitude adds a smoothed pitch dip (nod).
- **Torso lean:** amplitude slightly tilts the upper body toward/away from the user.
- **Brow/eye accents:** if the model supports it, amplitude briefly raises brows or widens eyes in addition to mouth visemes.

### 6.3 Expressive accents

- **Emphasis tilt:** a sudden amplitude spike triggers a short head roll that decays over ~0.3 s.
- **Sentence-start nod:** when amplitude rises from near-zero, a slightly larger nod fires.
- **Shoulder shift:** alternating shoulder raise timed to the breath cycle.

### 6.4 Safety

All values are additive and clamped:
- Head rotation: ±15° per axis.
- Neck/upper chest: ±5° per axis.
- Shoulders: small vertical offsets only.
- Emphasis effects decay smoothly and cannot accumulate indefinitely.

## 7. Data flow

1. **Mount:** `VRMStage` loads the model and resolves bone nodes via `VRMHumanoidDriver`.
2. **Frame loop:**
   - `time` advances.
   - `amplitude = VoiceController.getCurrentAmplitude()`.
   - `bodyPose = computeBodyPose(time, amplitude, config)`.
   - Apply lip-sync mouth expressions (existing code).
   - `applyBodyPose(vrm, bodyPose)`.
   - `vrm.update(delta)`.
3. **Speech:** when `speak()` plays audio, the analyser feeds amplitude and the reactive layer activates.
4. **Stop:** when `stopSpeaking()` is called, amplitude decays to 0 and reactive motion smoothly returns to idle.

## 8. Error handling & degradation

- **Missing bones:** skipped silently; the avatar still animates with available bones.
- **Missing expressions:** skipped silently; blinks/brow accents are optional.
- **Math bugs contained:** clamping prevents extreme or broken poses.
- **Disable switch:** `enableBodyAnimation={false}` turns off the layer instantly for demo debugging.
- **Smooth recovery:** reactive state decays instead of snapping, avoiding jarring cuts.

## 9. Testing strategy

- **Unit tests for `bodyAnimation.ts`:**
  - Silent input (`amplitude = 0`) returns idle motion only.
  - High amplitude increases reactive magnitudes.
  - Output rotations stay within configured clamps.
  - Blink timer eventually returns a non-zero blink weight.
- **Unit tests for `VRMHumanoidDriver.ts`:**
  - Mocked `VRM` receives expected bone rotations.
  - Missing bones do not throw.
- **Manual demo checklist:**
  - Avatar breathes/sways when silent.
  - Speaking triggers head nods and torso lean.
  - Stopping returns smoothly to idle.
  - Disabling the prop freezes body motion while lip-sync still works.

## 10. Project changes

```
web/src/companion/
  bodyAnimation.ts         # NEW
  VRMHumanoidDriver.ts     # NEW
  VRMStage.tsx             # MODIFIED: integrate body layer
  VoiceController.ts       # MODIFIED: expose getCurrentAmplitude()
  lipSync.ts               # unchanged
  CompanionWidget.tsx      # unchanged
docs/superpowers/specs/2026-06-28-vrm-body-animation-design.md  # NEW
```

## 11. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Procedural motion looks robotic | Tuneable config + smooth decay + layered sine/noise; can be disabled if needed. |
| Sample VRM lacks expected bones | Driver skips missing bones; no hard dependency on a full rig. |
| Performance in the render loop | Math is cheap; no allocations per frame. |
| Conflicts with future animation clips | Architecture is layered; the driver can later blend clip output with procedural output. |

## 12. References

- `@pixiv/three-vrm` humanoid docs: https://github.com/pixiv/three-vrm
- Existing design spec: `docs/superpowers/specs/2026-06-27-anime-companion-design.md`
