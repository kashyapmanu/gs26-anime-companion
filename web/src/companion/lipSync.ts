export const SILENCE_THRESHOLD = 0.04;

export interface VisemeWeights {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
}

export function amplitudeToViseme(amplitude: number): VisemeWeights {
  const closed: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  if (amplitude < SILENCE_THRESHOLD) return closed;
  const scaled = Math.min(1, (amplitude - SILENCE_THRESHOLD) / (1 - SILENCE_THRESHOLD));
  const aa = Math.min(1, scaled * 1.6);
  return { aa, ih: aa * 0.3, ou: aa * 0.2, ee: aa * 0.25, oh: aa * 0.5 };
}