import type { AppealSignal, MovieExposure, Rating } from "@/lib/types";

export function notSeenMovieIds(exposures: MovieExposure[]) {
  return new Set(exposures.filter((exposure) => exposure.source === "not_seen").map((exposure) => exposure.tmdbId));
}

export function handledMovieIds(ratings: Rating[], exposures: MovieExposure[] = [], appealSignals: AppealSignal[] = []) {
  return new Set([
    ...ratings.map((rating) => rating.tmdbId),
    ...exposures.filter((exposure) => exposure.source === "not_seen").map((exposure) => exposure.tmdbId),
    // Swiped cards ("want to watch" / "pass") mean the user hasn't seen the movie,
    // so it cannot be rated in the deck until it is rated elsewhere (e.g. watchlist).
    ...appealSignals.map((signal) => signal.tmdbId)
  ]);
}
