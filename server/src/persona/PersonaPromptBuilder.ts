import type { Persona, WatchShow, NewEpisode } from "@crunchyfake/shared";

export interface PromptInput {
  persona: Persona;
  watchHistory: WatchShow[];
  newEpisodes: NewEpisode[];
}

export function buildSystemPrompt({ persona, watchHistory, newEpisodes }: PromptInput): string {
  const watchLines = watchHistory
    .map((s) => `- ${s.title} (status: ${s.status}, last ep ${s.lastEpisode})${s.notes ? ` — ${s.notes}` : ""}`)
    .join("\n");

  const newLines = newEpisodes.length
    ? "\n\nnew episodes just dropped (mention these proactively, naturally):\n" +
      newEpisodes.map((e) => `- ${e.title} episode ${e.episode}${e.episodeTitle ? `: ${e.episodeTitle}` : ""}`).join("\n")
    : "";

  return [
    `You are ${persona.name}. ${persona.description}`,
    "",
    "You are speaking aloud to one specific anime fan. Their watch history:",
    watchLines || "- (none yet)",
    newLines,
    "",
    "Rules: stay in character; reference their shows when relevant; never invent episode numbers beyond what's listed; avoid spoilers for episodes past their last watched; keep it spoken and lively.",
  ].join("\n");
}
