import type { WatchShow, NewEpisode } from "@crunchyfake/shared";

export const demoWatchHistory: WatchShow[] = [
  { id: "frieren", title: "Frieren: Beyond Journey's End", status: "watching", lastEpisode: 12,
    notes: "loved the quiet melancholy of the funeral arc" },
  { id: "jjk", title: "Jujutsu Kaisen", status: "watching", lastEpisode: 34,
    notes: "Shibuya arc cliffhanger last week" },
  { id: "ds", title: "Demon Slayer", status: "caught_up", lastEpisode: 55 },
];

export const demoNewEpisodes: NewEpisode[] = [
  { showId: "jjk", title: "Jujutsu Kaisen", episode: 35, episodeTitle: "Right and Wrong, Part 2" },
];
