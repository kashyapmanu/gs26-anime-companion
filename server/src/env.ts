import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  MESH_BASE_URL: z.string().url().default("https://api.meshapi.ai/v1"),
  MESH_API_KEY: z.string().min(1),
  MESH_LLM_MODEL: z.string().min(1),
  MESH_TTS_MODEL: z.string().min(1).default("sarvam/bulbul:v3"),
  MESH_TTS_VOICE: z.string().min(1).default("anushka"),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_LLM_MODEL: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error("Invalid env:\n" + parsed.error.toString());
  }
  return parsed.data;
}
