import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/persona/PersonaPromptBuilder";
import { kiraPersona } from "../src/persona/persona";
import { MockDataService } from "../src/data/MockDataService";

const data = new MockDataService();

describe("PersonaPromptBuilder", () => {
  it("includes the persona name and tone instructions", () => {
    const p = buildSystemPrompt({ persona: kiraPersona, watchHistory: data.getWatchHistory(), newEpisodes: data.getNewEpisodes() });
    expect(p).toContain("Kira");
    expect(p.toLowerCase()).toContain("energetic");
  });

  it("includes every watched show title", () => {
    const p = buildSystemPrompt({ persona: kiraPersona, watchHistory: data.getWatchHistory(), newEpisodes: data.getNewEpisodes() });
    expect(p).toContain("Frieren");
    expect(p).toContain("Jujutsu Kaisen");
    expect(p).toContain("Demon Slayer");
  });

  it("references the new episode when present", () => {
    const p = buildSystemPrompt({ persona: kiraPersona, watchHistory: data.getWatchHistory(), newEpisodes: data.getNewEpisodes() });
    expect(p).toContain("new episode");
    expect(p).toContain("episode 35");
  });

  it("omits new-episode section when empty", () => {
    const p = buildSystemPrompt({ persona: kiraPersona, watchHistory: data.getWatchHistory(), newEpisodes: [] });
    expect(p).not.toContain("new episode");
  });
});
