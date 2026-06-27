import { describe, it, expect } from "vitest";
import { parseSseStream } from "../src/companion/sseParser";

describe("parseSseStream", () => {
  it("parses complete events", () => {
    const buf = "event: sentence\ndata: {\"text\":\"hi\"}\n\nevent: done\ndata: {}\n\n";
    const { events, remainder } = parseSseStream(buf);
    expect(events).toEqual([
      { event: "sentence", data: { text: "hi" } },
      { event: "done", data: {} },
    ]);
    expect(remainder).toBe("");
  });

  it("keeps a trailing partial as remainder", () => {
    const buf = "event: audio\ndata: {\"text\":\"x\"";
    const { events, remainder } = parseSseStream(buf);
    expect(events).toEqual([]);
    expect(remainder).toBe(buf);
  });

  it("handles split across chunks via remainder", () => {
    const a = parseSseStream("event: sentence\ndata: {\"text\":\"hel");
    const b = parseSseStream(a.remainder + "lo\"}\n\n");
    expect(b.events).toEqual([{ event: "sentence", data: { text: "hello" } }]);
  });
});
