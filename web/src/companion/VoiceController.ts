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

export class VoiceController {
  private recognition: RecognitionLike | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private currentSource: AudioBufferSourceNode | null = null;

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

  /** Play a base64 audio string, driving onViseme each frame for lip-sync. */
  async play(audioBase64: string, mime: string, onViseme: (w: VisemeWeights) => void): Promise<void> {
    const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    this.audioCtx = this.audioCtx ?? new AudioContext();
    if (this.audioCtx.state === "suspended") await this.audioCtx.resume();
    const buffer = await this.audioCtx.decodeAudioData(bytes.buffer.slice(0));
    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser).connect(this.audioCtx.destination);
    this.currentSource = source;
    source.start();
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / data.length);
      onViseme(amplitudeToViseme(rms));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return new Promise((resolve) => {
      source.onended = () => { cancelAnimationFrame(this.raf); onViseme(amplitudeToViseme(0)); resolve(); };
    });
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    try { this.currentSource?.stop(); } catch { /* already stopped */ }
    this.currentSource = null;
    this.stopListening();
  }
}
