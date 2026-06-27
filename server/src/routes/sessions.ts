import type { FastifyInstance } from "fastify";
import type { Deps } from "../deps.js";
import { sseEvent } from "../sse.js";
import { createSentenceChunker } from "../util/sentenceChunker.js";

export function registerSessionRoutes(app: FastifyInstance, deps: Deps) {
  const store = deps.createSessionStore();

  app.post("/session/open", async (_req, reply) => {
    const sessionId = store.create();
    const greeting = await deps.greeter.generateGreeting();
    return reply.send({ sessionId, greeting });
  });

  app.post<{ Params: { id: string }; Body: { text?: string } }>(
    "/session/:id/send",
    async (req, reply) => {
      const session = store.get(req.params.id);
      if (!session) return reply.code(404).send({ error: "session not found" });
      const text = (req.body?.text ?? "").toString();

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      const write = (e: "sentence" | "audio" | "done" | "error", p: Record<string, unknown>) =>
        reply.raw.write(sseEvent(e, p));

      try {
        store.addUserMessage(req.params.id, text);
        const system = deps.buildSystemPrompt({
          persona: deps.persona,
          watchHistory: deps.data.getWatchHistory(),
          newEpisodes: deps.data.getNewEpisodes(),
        });

        const chunker = createSentenceChunker();
        let full = "";
        const flushSentence = async (sentence: string) => {
          const s = sentence.trim();
          if (!s) return;
          write("sentence", { text: s });
          try {
            const audio = await deps.tts.synthesize(s);
            write("audio", { text: s, audioBase64: audio.audioBase64, mime: audio.mime });
          } catch {
            // TTS failure: text already shown; keep going (degradation)
          }
          full += (full ? " " : "") + s;
        };

        for await (const token of deps.llm.chat({ system, messages: session.messages })) {
          for (const s of chunker.push(token)) await flushSentence(s);
        }
        for (const s of chunker.flush()) await flushSentence(s);

        if (full) store.addAssistantMessage(req.params.id, full);
        write("done", {});
      } catch (err) {
        write("error", { message: err instanceof Error ? err.message : "unknown error" });
      } finally {
        reply.raw.end();
      }
    }
  );
}
