export interface TTSResult {
  audioBase64: string;
  mime: string;
}

export interface TTSProvider {
  synthesize(text: string): Promise<TTSResult>;
}

export interface OpenAIAudioClient {
  audio: { speech: { create(opts: Record<string, unknown>): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }> } };
}

export function openAITTSProvider(sdk: OpenAIAudioClient, model: string, voice: string): TTSProvider {
  return {
    async synthesize(text) {
      const res = await sdk.audio.speech.create({ model, voice, input: text, response_format: "mp3" });
      const buf = Buffer.from(await res.arrayBuffer());
      return { audioBase64: buf.toString("base64"), mime: "audio/mpeg" };
    },
  };
}

export class TTSProxy {
  constructor(private provider: TTSProvider) {}
  synthesize(text: string): Promise<TTSResult> {
    return this.provider.synthesize(text);
  }
}