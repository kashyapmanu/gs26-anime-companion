export interface Persona {
  name: string;
  description: string;
  voice: string;
}

export type WatchStatus = "watching" | "caught_up";

export interface WatchShow {
  id: string;
  title: string;
  status: WatchStatus;
  lastEpisode: number;
  notes?: string;
}

export interface NewEpisode {
  showId: string;
  title: string;
  episode: number;
  episodeTitle?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OpenSessionResponse {
  sessionId: string;
  greeting: { text: string; audioBase64: string; mime: string };
}

export type StreamEvent =
  | { type: "sentence"; text: string }
  | { type: "audio"; text: string; audioBase64: string; mime: string }
  | { type: "done" }
  | { type: "error"; message: string };
