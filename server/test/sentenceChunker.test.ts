import { describe, it, expect } from "vitest";
import { createSentenceChunker } from "../src/util/sentenceChunker";

function feed(chunks: string[]): string[] {
  const c = createSentenceChunker();
  const out: string[] = [];
  for (const ch of chunks) for (const s of c.push(ch)) out.push(s.trim());
  out.push(...c.flush().map((s) => s.trim()));
  return out;
}

describe("sentenceChunker", () => {
  it("emits nothing from push() for a fragment with no terminator", () => {
    const c = createSentenceChunker();
    expect(c.push("hello there")).toEqual([]);
  });

  it("emits on . ! ?", () => {
    expect(feed(["Hello! ", "How are you? ", "I am fine. "])).toEqual([
      "Hello!", "How are you?", "I am fine.",
    ]);
  });

  it("reassembles a sentence split across tokens", () => {
    expect(feed(["Jujutsu", " Kaisen", " is", " wild", "!"])).toEqual(["Jujutsu Kaisen is wild!"]);
  });

  it("flushes trailing partial on flush()", () => {
    expect(feed(["leftover partial"])).toEqual(["leftover partial"]);
  });

  it("force-flushes long runs without punctuation as a single chunk", () => {
    const long = "a".repeat(250);
    expect(feed([long])).toEqual([long]);
  });
});
