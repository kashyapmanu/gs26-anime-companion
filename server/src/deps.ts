import OpenAI from "openai";
import type { Persona } from "@crunchyfake/shared";
import { loadEnv, type Env } from "./env.js";
import { LLMProxy } from "./llm/LLMProxy.js";
import { TTSProxy, openAITTSProvider } from "./tts/TTSProxy.js";
import { MockDataService } from "./data/MockDataService.js";
import { Greeter } from "./greeter/Greeter.js";
import { kiraPersona } from "./persona/persona.js";
import { buildSystemPrompt } from "./persona/PersonaPromptBuilder.js";
import { createSessionStore } from "./sessions.js";

export interface Deps {
  persona: Persona;
  data: MockDataService;
  llm: LLMProxy;
  tts: TTSProxy;
  greeter: Greeter;
  buildSystemPrompt: typeof buildSystemPrompt;
  createSessionStore: typeof createSessionStore;
}

export function buildDeps(env: Env = loadEnv()): Deps {
  const sdk = new OpenAI({ baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY });
  const llm = new LLMProxy({ client: sdk as any, model: env.LLM_MODEL });
  const tts = new TTSProxy(openAITTSProvider(sdk as any, env.TTS_MODEL, env.TTS_VOICE));
  const data = new MockDataService();
  const greeter = new Greeter({ persona: kiraPersona, data, llm, tts });
  return { persona: kiraPersona, data, llm, tts, greeter, buildSystemPrompt, createSessionStore };
}
