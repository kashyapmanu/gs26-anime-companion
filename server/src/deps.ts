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
  const meshClient = new OpenAI({ baseURL: env.MESH_BASE_URL, apiKey: env.MESH_API_KEY });
  const openrouterClient = new OpenAI({ baseURL: env.OPENROUTER_BASE_URL, apiKey: env.OPENROUTER_API_KEY });

  const llm = new LLMProxy({
    providers: [
      { name: "mesh", client: meshClient as any, model: env.MESH_LLM_MODEL },
      { name: "openrouter", client: openrouterClient as any, model: env.OPENROUTER_LLM_MODEL },
    ],
  });

  const tts = new TTSProxy(openAITTSProvider(meshClient as any, env.MESH_TTS_MODEL, env.MESH_TTS_VOICE));
  const data = new MockDataService();
  const greeter = new Greeter({ persona: kiraPersona, data, llm, tts });
  return { persona: kiraPersona, data, llm, tts, greeter, buildSystemPrompt, createSessionStore };
}
