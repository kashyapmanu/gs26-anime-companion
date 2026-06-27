import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1),
  TTS_PROVIDER: z.string().default("openai"),
  TTS_MODEL: z.string().default("tts-1"),
  TTS_VOICE: z.string().default("alloy"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error("Invalid env:\n" + parsed.error.toString());
  }
  return parsed.data;
}