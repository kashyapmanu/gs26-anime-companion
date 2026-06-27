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

export interface LLMProvider {
  name: string;
  client: LLMClient;
  model: string;
}

export interface LLMProxyOptions {
  providers: LLMProvider[];
}

export interface ChatParams {
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

export class LLMProxy {
  constructor(private opts: LLMProxyOptions) {}

  async *chat({ system, messages, signal }: ChatParams): AsyncIterable<string> {
    const errors: string[] = [];
    for (const provider of this.opts.providers) {
      try {
        const stream = await provider.client.chat.completions.create({
          model: provider.model,
          stream: true,
          messages: [{ role: "system", content: system }, ...messages],
        });
        for await (const part of stream) {
          if (signal?.aborted) break;
          const content = part.choices?.[0]?.delta?.content;
          if (content) yield content;
        }
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${provider.name}: ${message}`);
        if (signal?.aborted) break;
      }
    }
    throw new Error(`All LLM providers failed: ${errors.join("; ")}`);
  }
}
