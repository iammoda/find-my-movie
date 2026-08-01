import { describe, expect, it, vi } from "vitest";
import { friendDisplayName } from "@/lib/displayName";
import { acceptFriendInvite, commonTaste, isPositiveRating } from "@/lib/friends";
import type { MovieStore } from "@/lib/store";
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

describe("friendDisplayName", () => {
  it("prefers the explicit display name", () => {
    expect(friendDisplayName("Yoda", "mgounder@example.com")).toBe("Yoda");
  });

  it("falls back to the email prefix, never the full address", () => {
    expect(friendDisplayName(null, "mgounder@example.com")).toBe("mgounder");
    expect(friendDisplayName("  ", "mgounder@example.com")).toBe("mgounder");
  });

  it("returns null when neither is available", () => {
    expect(friendDisplayName(null, null)).toBeNull();
    expect(friendDisplayName("", "")).toBeNull();
  });
});

describe("acceptFriendInvite", () => {
  function mockStore(invite: { token: string; inviterProfileId: string; expiresAt: string } | null) {
    return {
      getFriendInvite: vi.fn(async () => (invite ? { ...invite, createdAt: "2026-01-01T00:00:00.000Z" } : null)),
      addFriendship: vi.fn(async () => undefined)
    } as unknown as MovieStore & { addFriendship: ReturnType<typeof vi.fn> };
  }

  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();

  it("creates the friendship for a valid invite", async () => {
    const store = mockStore({ token: "t1", inviterProfileId: "inviter", expiresAt: future });
    const result = await acceptFriendInvite(store, "acceptor", "t1");
    expect(result).toEqual({ ok: true, inviterProfileId: "inviter" });
    expect(store.addFriendship).toHaveBeenCalledWith("inviter", "inviter");
  });

  it("rejects unknown, expired, and self invites without creating friendships", async () => {
    expect(await acceptFriendInvite(mockStore(null), "acceptor", "missing")).toEqual({ ok: false, reason: "not_found" });

    const expiredStore = mockStore({ token: "t2", inviterProfileId: "inviter", expiresAt: past });
    expect(await acceptFriendInvite(expiredStore, "acceptor", "t2")).toEqual({ ok: false, reason: "expired" });
    expect(expiredStore.addFriendship).not.toHaveBeenCalled();

    const selfStore = mockStore({ token: "t3", inviterProfileId: "me", expiresAt: future });
    expect(await acceptFriendInvite(selfStore, "me", "t3")).toEqual({ ok: false, reason: "self" });
    expect(selfStore.addFriendship).not.toHaveBeenCalled();
  });
});
