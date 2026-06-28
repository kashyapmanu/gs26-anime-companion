import { amplitudeToViseme, type VisemeWeights } from "./lipSync";

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: { 0: { 0: { transcript: string } }; length: number } }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
};

export function computeRms(data: Uint8Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

export class VoiceController {
  private recognition: RecognitionLike | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private currentSource: AudioBufferSourceNode | null = null;
  private queue: Array<{ audioBase64: string; mime: string; onViseme: (w: VisemeWeights) => void }> = [];
  private playing = false;
  private currentAmplitude = 0;

  static isSTTSupported(): boolean {
    return typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  }

  startListening(onTranscript: (text: string) => void, onEnd?: () => void): void {
    const Ctor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) throw new Error("SpeechRecognition not supported");
    const rec: RecognitionLike = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => { onTranscript(e.results[0][0].transcript); };
    rec.onerror = () => { /* degrade silently; user can retry or type */ };
    rec.onend = () => onEnd?.();
    this.recognition = rec;
    rec.start();
  }

  stopListening(): void {
    this.recognition?.stop();
    this.recognition = null;
  }

  getCurrentAmplitude(): number {
    return this.currentAmplitude;
  }

  /** Queue an audio chunk; chunks play sequentially so sentences never overlap or get cut off. */
  play(audioBase64: string, mime: string, onViseme: (w: VisemeWeights) => void): void {
    this.queue.push({ audioBase64, mime, onViseme });
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.playing) return;
    const chunk = this.queue.shift();
    if (!chunk) return;
    this.playing = true;
    try {
      await this.playChunk(chunk.audioBase64, chunk.mime, chunk.onViseme);
    } catch {
      /* skip malformed chunk */
    }
    this.playing = false;
    if (this.queue.length > 0) void this.pump();
  }

  private async playChunk(audioBase64: string, mime: string, onViseme: (w: VisemeWeights) => void): Promise<void> {
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
      const rms = computeRms(data);
      this.currentAmplitude = rms;
      onViseme(amplitudeToViseme(rms));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return new Promise((resolve) => {
      source.onended = () => {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.currentAmplitude = 0;
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
    this.currentAmplitude = 0;
    try { this.currentSource?.stop(); } catch { /* already stopped */ }
    this.currentSource = null;
  }

  stop(): void {
    this.stopPlayback();
    this.stopListening();
  }
}
