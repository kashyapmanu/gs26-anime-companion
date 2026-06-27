export interface SseEvent {
  event: string;
  data: any;
}

export function parseSseStream(buffer: string): { events: SseEvent[]; remainder: string } {
  const events: SseEvent[] = [];
  let work = buffer;
  let idx: number;
  while ((idx = work.indexOf("\n\n")) !== -1) {
    const raw = work.slice(0, idx);
    work = work.slice(idx + 2);
    let event = "message";
    let data = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    let parsed: any = data;
    try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = data; }
    events.push({ event, data: parsed });
  }
  return { events, remainder: work };
}
