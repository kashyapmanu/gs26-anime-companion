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
  config: BodyAnimationConfig = defaultBodyAnimationConfig
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
    Math.sin(time * config.idle.headSwaySpeedX * Math.PI * 2 + Math.PI / 4) *
    config.idle.headSwayAmount;
  const headYaw =
    Math.sin(time * config.idle.headSwaySpeedY * Math.PI * 2 + Math.PI / 4) *
    config.idle.headSwayAmount;

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
