import { describe, expect, it } from "vitest";
import { commonTaste, isPositiveRating } from "@/lib/friends";
import type { Rating, WatchlistItem } from "@/lib/types";

function rating(tmdbId: number, overrides: Partial<Rating> = {}): Rating {
  return {
    profileId: "p",
    tmdbId,
    rating: "like",
    verdict: null,
    rankScore: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function watch(tmdbId: number, status: WatchlistItem["status"] = "queued"): WatchlistItem {
  return { profileId: "p", tmdbId, status, addedAt: new Date().toISOString(), resolvedAt: null };
}

describe("isPositiveRating", () => {
  it("treats loved verdicts and legacy positive ratings as positive", () => {
    expect(isPositiveRating(rating(1, { verdict: "loved", rating: "best_ever" }))).toBe(true);
    expect(isPositiveRating(rating(1, { rating: "like" }))).toBe(true);
    expect(isPositiveRating(rating(1, { rating: "best_ever" }))).toBe(true);
  });

  it("keeps neutral and negative signals private", () => {
    expect(isPositiveRating(rating(1, { verdict: "fine", rating: "skip" }))).toBe(false);
    expect(isPositiveRating(rating(1, { verdict: "disliked", rating: "hate" }))).toBe(false);
    expect(isPositiveRating(rating(1, { rating: "dislike" }))).toBe(false);
    expect(isPositiveRating(rating(1, { rating: "skip" }))).toBe(false);
  });
});

describe("commonTaste", () => {
  it("intersects only mutually positive movies, sorted by combined rank", () => {
    const own = [
      rating(1, { verdict: "loved", rating: "like", rankScore: 8 }),
      rating(2, { verdict: "loved", rating: "best_ever", rankScore: 9.5 }),
      rating(3, { verdict: "disliked", rating: "hate", rankScore: 1 })
    ];
    const friend = [
      rating(1, { verdict: "loved", rating: "best_ever", rankScore: 9 }),
      rating(2, { verdict: "loved", rating: "like", rankScore: 7 }),
      rating(3, { verdict: "loved", rating: "best_ever", rankScore: 10 }) // own disliked it: excluded
    ];
    const result = commonTaste(own, friend, [], []);
    expect(result.commonLovedTmdbIds).toEqual([1, 2]); // 8+9=17 beats 9.5+7=16.5
  });

  it("shares only queued watchlist overlaps", () => {
    const ownList = [watch(10), watch(11, "watched"), watch(12)];
    const friendList = [watch(10), watch(11), watch(13)];
    const result = commonTaste([], [], ownList, friendList);
    expect(result.sharedWatchlistTmdbIds).toEqual([10]);
  });

  it("surfaces friend favorites the viewer has not handled", () => {
    const own = [rating(1, { rating: "like" }), rating(2, { rating: "dislike" })];
    const ownList = [watch(3)];
    const friend = [
      rating(1, { rating: "best_ever", rankScore: 9 }), // common, not unseen
      rating(2, { rating: "like", rankScore: 8 }), // own rated (disliked): handled
      rating(3, { rating: "like", rankScore: 7 }), // on own watchlist: handled
      rating(4, { verdict: "loved", rating: "like", rankScore: 6 }),
      rating(5, { verdict: "loved", rating: "best_ever", rankScore: 9 })
    ];
    const result = commonTaste(own, friend, ownList, []);
    expect(result.friendLovedUnseenTmdbIds).toEqual([5, 4]);
  });
});
