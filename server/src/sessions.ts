import { randomUUID } from "node:crypto";
import type { ChatMessage } from "@crunchyfake/shared";

export interface Session {
  id: string;
  messages: ChatMessage[];
}

export function createSessionStore() {
  const map = new Map<string, Session>();
  return {
    create(): string {
      const id = randomUUID();
      map.set(id, { id, messages: [] });
      return id;
    },
    get(id: string): Session | undefined {
      return map.get(id);
    },
    addUserMessage(id: string, content: string): void {
      map.get(id)?.messages.push({ role: "user", content });
    },
    addAssistantMessage(id: string, content: string): void {
      map.get(id)?.messages.push({ role: "assistant", content });
    },
  };
}