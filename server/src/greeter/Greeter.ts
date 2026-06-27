import type { Persona } from "@crunchyfake/shared";
import type { MockDataService } from "../data/MockDataService.js";
import type { TTSProxy } from "../tts/TTSProxy.js";
import { buildSystemPrompt } from "../persona/PersonaPromptBuilder.js";
import type { LLMProxy } from "../llm/LLMProxy.js";

export interface GreeterDeps {
  persona: Persona;
  data: MockDataService;
  llm: Pick<LLMProxy, "chat">;
  tts: TTSProxy;
}

const GREETING_INSTRUCTION =
  "In one short, energetic spoken sentence (max ~25 words), greet the user and naturally flag the newest episode from their list. No emoji, no quotes.";

export class Greeter {
  constructor(private deps: GreeterDeps) {}

  async generateGreeting(): Promise<{ text: string; audioBase64: string; mime: string }> {
    const { persona, data, llm, tts } = this.deps;
    const system = buildSystemPrompt({
      persona,
      watchHistory: data.getWatchHistory(),
      newEpisodes: data.getNewEpisodes(),
    }) + "\n\n" + GREETING_INSTRUCTION;

    let text = "";
    try {
      let raw = "";
      for await (const t of llm.chat({ system, messages: [{ role: "user", content: "Greet me!" }] })) raw += t;
      text = raw.trim();
    } catch {
      text = "";
    }
    if (!text) text = this.templateGreeting();

    const audio = await tts.synthesize(text);
    return { text, ...audio };
  }

  private templateGreeting(): string {
    const ep = this.deps.data.getNewEpisodes()[0];
    if (ep) return `Yo! ${ep.title} episode ${ep.episode} just dropped — let's get into it!`;
    const show = this.deps.data.getWatchHistory()[0];
    return show ? `Hey! Ready to keep watching ${show.title}?` : "Hey! What are we watching today?";
  }
}