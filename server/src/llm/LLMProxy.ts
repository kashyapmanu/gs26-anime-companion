import type { ChatMessage } from "@crunchyfake/shared";

export interface LLMClient {
  chat: {
    completions: {
      create(opts: Record<string, unknown>): Promise<{
        [Symbol.asyncIterator](): AsyncIterator<{ choices: { delta: { content?: string | null } }[] }>;
      }>;
    };
  };
}

export interface LLMProxyOptions {
  client: LLMClient;
  model: string;
}

export interface ChatParams {
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

export class LLMProxy {
  constructor(private opts: LLMProxyOptions) {}

  async *chat({ system, messages, signal }: ChatParams): AsyncIterable<string> {
    const stream = await this.opts.client.chat.completions.create({
      model: this.opts.model,
      stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    });
    for await (const part of stream) {
      if (signal?.aborted) break;
      const content = part.choices?.[0]?.delta?.content;
      if (content) yield content;
    }
  }
}