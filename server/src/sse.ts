import type { StreamEvent } from "@crunchyfake/shared";

export function sseEvent(event: StreamEvent["type"], payload: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}