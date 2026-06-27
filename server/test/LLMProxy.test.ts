import { describe, it, expect } from "vitest";
import { LLMProxy } from "../src/llm/LLMProxy";

function fakeClient(tokens: string[]) {
  return {
    chat: {
      completions: {
        // @ts-expect-error minimal fake
        create: async ({ stream }) => {
          if (!stream) throw new Error("only stream supported");
          const gen = (async function* () {
            for (const t of tokens) yield { choices: [{ delta: { content: t } }] };
          })();
          return gen;
        },
      },
    },
  };
}

describe("LLMProxy", () => {
  it("yields token deltas", async () => {
    const llm = new LLMProxy({ client: fakeClient(["Hello", "!", " Boom"]) as any, model: "m" });
    const out: string[] = [];
    for await (const t of llm.chat({ system: "s", messages: [{ role: "user", content: "hi" }] })) out.push(t);
    expect(out.join("")).toBe("Hello! Boom");
  });

  it("passes system + messages through", async () => {
    let captured: any;
    const client = {
      chat: { completions: { create: async (opts: any) => { captured = opts; return (async function* () { yield { choices: [{ delta: { content: "ok" } }] }; })(); } } },
    };
    const llm = new LLMProxy({ client: client as any, model: "model-x" });
    for await (const _ of llm.chat({ system: "S", messages: [{ role: "user", content: "U" }] })) void _;
    expect(captured.model).toBe("model-x");
    expect(captured.messages[0]).toEqual({ role: "system", content: "S" });
    expect(captured.messages[1]).toEqual({ role: "user", content: "U" });
    expect(captured.stream).toBe(true);
  });
});