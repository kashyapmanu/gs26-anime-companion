import type { WatchShow, NewEpisode } from "@crunchyfake/shared";
import { demoWatchHistory, demoNewEpisodes } from "./watchHistory.js";

export class MockDataService {
  getWatchHistory(_userId = "demo"): WatchShow[] {
    return demoWatchHistory.map((s) => ({ ...s }));
  }
  getNewEpisodes(_userId = "demo"): NewEpisode[] {
    return demoNewEpisodes.map((e) => ({ ...e }));
  }
}
