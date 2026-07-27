import { POSITIVE_RATINGS } from "@/lib/constants";
import { getStore, type MovieStore } from "@/lib/store";
import type { Friend, Movie, Rating, WatchlistItem } from "@/lib/types";

/**
 * Friend data access lives here and only here. Rules:
 * - Cross-profile reads require a verified (accepted) friendship.
 * - Only positive signals are ever shared: loved/liked ratings and queued
 *   watchlist items. Dislikes, exposures, comparisons, and behavior stay private.
 */

/** Positive = new-style "loved" verdict, or a legacy positive rating value. */
export function isPositiveRating(rating: Rating): boolean {
  return rating.verdict === "loved" || POSITIVE_RATINGS.has(rating.rating);
}

export interface CommonTasteMovies {
  /** Movies both profiles rated positively, best combined rank first. */
  commonLovedTmdbIds: number[];
  /** Movies both profiles have queued on their watchlists. */
  sharedWatchlistTmdbIds: number[];
  /** Movies the friend rated positively that the viewer hasn't handled at all. */
  friendLovedUnseenTmdbIds: number[];
}

/** Pure projection over both profiles' signals; unit-testable without a store. */
export function commonTaste(
  ownRatings: Rating[],
  friendRatings: Rating[],
  ownWatchlist: WatchlistItem[],
  friendWatchlist: WatchlistItem[]
): CommonTasteMovies {
  const ownPositive = new Map(ownRatings.filter(isPositiveRating).map((rating) => [rating.tmdbId, rating]));
  const friendPositive = friendRatings.filter(isPositiveRating);
  const ownHandled = new Set(ownRatings.map((rating) => rating.tmdbId));
  for (const item of ownWatchlist) ownHandled.add(item.tmdbId);

  const commonLovedTmdbIds = friendPositive
    .filter((rating) => ownPositive.has(rating.tmdbId))
    .sort((a, b) => {
      const combinedA = (a.rankScore ?? 0) + (ownPositive.get(a.tmdbId)?.rankScore ?? 0);
      const combinedB = (b.rankScore ?? 0) + (ownPositive.get(b.tmdbId)?.rankScore ?? 0);
      return combinedB - combinedA;
    })
    .map((rating) => rating.tmdbId);

  const ownQueued = new Set(ownWatchlist.filter((item) => item.status === "queued").map((item) => item.tmdbId));
  const sharedWatchlistTmdbIds = friendWatchlist
    .filter((item) => item.status === "queued" && ownQueued.has(item.tmdbId))
    .map((item) => item.tmdbId);

  const friendLovedUnseenTmdbIds = friendPositive
    .filter((rating) => !ownHandled.has(rating.tmdbId))
    .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0))
    .map((rating) => rating.tmdbId);

  return { commonLovedTmdbIds, sharedWatchlistTmdbIds, friendLovedUnseenTmdbIds };
}

export interface FriendCommonView {
  friend: Friend;
  commonLoved: Movie[];
  sharedWatchlist: Movie[];
  friendLovedUnseen: Movie[];
}

const FRIEND_LOVED_UNSEEN_LIMIT = 24;

/**
 * Verified friend view. Returns null when the two profiles are not friends.
 * NOTE: intentionally uses the unscoped store for the friend's positive
 * signals after the friendship check - the narrow, deliberate exception to
 * per-profile isolation.
 */
export async function getFriendCommonView(sessionProfileId: string, friendProfileId: string): Promise<FriendCommonView | null> {
  const store: MovieStore = getStore();
  const friends = await store.listFriends(sessionProfileId);
  const friend = friends.find((entry) => entry.profileId === friendProfileId);
  if (!friend) return null;

  const [ownRatings, friendRatings, ownWatchlist, friendWatchlist] = await Promise.all([
    store.listRatings(sessionProfileId),
    store.listRatings(friendProfileId),
    store.listWatchlist(sessionProfileId),
    store.listWatchlist(friendProfileId)
  ]);

  const projection = commonTaste(ownRatings, friendRatings, ownWatchlist, friendWatchlist);
  const wantedIds = new Set([
    ...projection.commonLovedTmdbIds,
    ...projection.sharedWatchlistTmdbIds,
    ...projection.friendLovedUnseenTmdbIds.slice(0, FRIEND_LOVED_UNSEEN_LIMIT)
  ]);
  const movies = await store.listMovies();
  const movieById = new Map(movies.filter((movie) => wantedIds.has(movie.tmdbId)).map((movie) => [movie.tmdbId, movie]));
  const hydrate = (tmdbIds: number[]) => tmdbIds.flatMap((tmdbId) => movieById.get(tmdbId) ?? []);

  return {
    friend,
    commonLoved: hydrate(projection.commonLovedTmdbIds),
    sharedWatchlist: hydrate(projection.sharedWatchlistTmdbIds),
    friendLovedUnseen: hydrate(projection.friendLovedUnseenTmdbIds.slice(0, FRIEND_LOVED_UNSEEN_LIMIT))
  };
}
