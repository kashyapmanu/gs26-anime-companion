import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompanionWidget } from "../src/companion/CompanionWidget";

vi.mock("../src/companion/ConversationClient", () => ({
  ConversationClient: class {
    async openSession() { return { sessionId: "s1", greeting: { text: "hi", audioBase64: "", mime: "audio/mpeg" } }; }
    send() { return { abort() {} }; }
  },
}));
vi.mock("../src/companion/VRMStage", async () => {
  const React = await vi.importActual("react") as typeof import("react");
  return { VRMStage: React.forwardRef(() => null) };
});

describe("CompanionWidget", () => {
  it("shows the small button, then expands on click", async () => {
    render(<CompanionWidget apiBase="" modelUrl="/models/sample.vrm" />);
    expect(screen.getByRole("button", { name: /open companion/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /open companion/i }));
    await waitFor(() => expect(screen.getByText(/hi/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /close/i })).toBeTruthy();
  });
});
