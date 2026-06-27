import type { OpenSessionResponse, StreamEvent } from "@crunchyfake/shared";
import { parseSseStream } from "./sseParser";

export interface SendHandlers {
  onSentence: (text: string) => void;
  onAudio: (a: { text: string; audioBase64: string; mime: string }) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export interface ClientOptions {
  base: string;
  fetchImpl?: typeof fetch;
}

export class ConversationClient {
  private fetchImpl: typeof fetch;
  constructor(private opts: ClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  async openSession(): Promise<OpenSessionResponse> {
    const res = await this.fetchImpl(`${this.opts.base}/session/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) throw new Error(`openSession failed: ${res.status}`);
    return (await res.json()) as OpenSessionResponse;
  }

  send(sessionId: string, text: string, h: SendHandlers): { abort: () => void } {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await this.fetchImpl(`${this.opts.base}/session/${sessionId}/send`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) { h.onError(`send failed: ${res.status}`); return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const parsed = parseSseStream(buffer + chunk);
          buffer = parsed.remainder;
          for (const e of parsed.events) this.dispatch(e.event, e.data as StreamEvent, h);
        }
        const tail = parseSseStream(buffer + decoder.decode());
        for (const e of tail.events) this.dispatch(e.event, e.data as StreamEvent, h);
      } catch (err) {
        if (!controller.signal.aborted) h.onError(err instanceof Error ? err.message : "network error");
      }
    })();
    return { abort: () => controller.abort() };
  }

  private dispatch(event: string, data: StreamEvent, h: SendHandlers): void {
    switch (event) {
      case "sentence": h.onSentence((data as Extract<StreamEvent, { type: "sentence" }>).text); break;
      case "audio": {
        const a = data as Extract<StreamEvent, { type: "audio" }>;
        h.onAudio({ text: a.text, audioBase64: a.audioBase64, mime: a.mime });
        break;
      }
      case "done": h.onDone(); break;
      case "error": h.onError((data as Extract<StreamEvent, { type: "error" }>).message); break;
    }
  }
}
