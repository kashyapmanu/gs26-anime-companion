import { describe, it, expect } from "vitest";
import { MockDataService } from "../src/data/MockDataService";

describe("MockDataService", () => {
  const svc = new MockDataService();

  it("returns the demo watch list", () => {
    const list = svc.getWatchHistory("demo");
    expect(list.map((s) => s.title)).toEqual([
      "Frieren: Beyond Journey's End", "Jujutsu Kaisen", "Demon Slayer",
    ]);
    expect(list[0].status).toBe("watching");
  });

  it("returns the one new episode", () => {
    const eps = svc.getNewEpisodes("demo");
    expect(eps).toHaveLength(1);
    expect(eps[0].title).toBe("Jujutsu Kaisen");
    expect(eps[0].episode).toBeGreaterThan(0);
  });
});
