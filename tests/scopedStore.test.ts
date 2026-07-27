import { describe, expect, it, vi } from "vitest";
import { scopedStore } from "@/lib/scopedStore";
import type { MovieStore } from "@/lib/store";

/**
 * The scoped store must force its bound profile id onto every profile-scoped
 * call (even when a caller passes a different id) and leave catalog methods
 * untouched.
 */
function mockStore(): MovieStore {
  const target = {} as Record<string, ReturnType<typeof vi.fn>>;
  const methods = [
    "listMovies",
    "getMovie",
    "listMovieCredits",
    "upsertMovies",
    "replaceTasteFactsForSource",
    "replaceTasteFactsForMovie",
    "listRatings",
    "upsertRating",
    "updateRatingRanks",
    "deleteRating",
    "listComparisons",
    "addComparison",
    "listAppealSignals",
    "upsertAppealSignal",
    "deleteAppealSignal",
    "listRatingReasons",
    "saveRatingReasons",
    "listRatingTraitReasons",
    "saveRatingTraitReasons",
    "logExposure",
    "updateExposureBehavior",
    "listExposures",
    "deleteExposures",
    "listMovieEmbeddings",
    "upsertMovieEmbedding",
    "matchMovieEmbeddings",
    "hideRecommendation",
    "listHiddenRecommendations",
    "saveRecommendationRun",
    "listRecommendationRuns",
    "listWatchlist",
    "upsertWatchlistItem",
    "removeWatchlistItem",
    "getMovieEnrichment",
    "listMovieEnrichments",
    "saveMovieEnrichment",
    "listTaxonomyEmbeddings",
    "saveTaxonomyEmbeddings",
    "getProfile",
    "updateProfileDisplayName",
    "createFriendInvite",
    "getFriendInvite",
    "listFriendInvites",
    "deleteFriendInvite",
    "addFriendship",
    "listFriends",
    "removeFriendship",
    "reset",
    "exportData"
  ];
  for (const method of methods) target[method] = vi.fn().mockResolvedValue(undefined);
  return target as unknown as MovieStore;
}

describe("scopedStore", () => {
  it("binds the profile id on profile-scoped reads and writes", async () => {
    const inner = mockStore();
    const store = scopedStore(inner, "user-123");

    await store.listRatings();
    expect(inner.listRatings).toHaveBeenCalledWith("user-123");

    await store.upsertRating(42, "like", undefined, { verdict: "loved", rankScore: 9 });
    expect(inner.upsertRating).toHaveBeenCalledWith(42, "like", "user-123", { verdict: "loved", rankScore: 9 });

    await store.logExposure(42, "taste_test", "deck");
    expect(inner.logExposure).toHaveBeenCalledWith(42, "taste_test", "deck", "user-123");

    await store.upsertWatchlistItem(42, "queued");
    expect(inner.upsertWatchlistItem).toHaveBeenCalledWith(42, "queued", "user-123");

    await store.reset();
    expect(inner.reset).toHaveBeenCalledWith("user-123");
  });

  it("binds friend methods to the session profile, except explicit-id lookups", async () => {
    const inner = mockStore();
    const store = scopedStore(inner, "user-123");

    await store.createFriendInvite("someone-else");
    expect(inner.createFriendInvite).toHaveBeenCalledWith("user-123");

    await store.addFriendship("friend-9", "friend-9", "someone-else");
    expect(inner.addFriendship).toHaveBeenCalledWith("friend-9", "friend-9", "user-123");

    await store.listFriends("someone-else");
    expect(inner.listFriends).toHaveBeenCalledWith("user-123");

    await store.removeFriendship("friend-9");
    expect(inner.removeFriendship).toHaveBeenCalledWith("friend-9", "user-123");

    await store.updateProfileDisplayName("Mo", "someone-else");
    expect(inner.updateProfileDisplayName).toHaveBeenCalledWith("Mo", "user-123");

    // Cross-profile identity lookups take the explicit id (public fields only).
    await store.getProfile("friend-9");
    expect(inner.getProfile).toHaveBeenCalledWith("friend-9");

    await store.getFriendInvite("tok-1");
    expect(inner.getFriendInvite).toHaveBeenCalledWith("tok-1");
  });

  it("overrides a caller-provided profile id", async () => {
    const inner = mockStore();
    const store = scopedStore(inner, "user-123");

    await store.upsertRating(7, "like", "someone-else");
    expect(inner.upsertRating).toHaveBeenCalledWith(7, "like", "user-123", undefined);

    await store.listRatings("someone-else");
    expect(inner.listRatings).toHaveBeenCalledWith("user-123");
  });

  it("passes catalog methods through unscoped", async () => {
    const inner = mockStore();
    const store = scopedStore(inner, "user-123");

    await store.getMovie(603);
    expect(inner.getMovie).toHaveBeenCalledWith(603);

    await store.matchMovieEmbeddings([0.1], 5, [1]);
    expect(inner.matchMovieEmbeddings).toHaveBeenCalledWith([0.1], 5, [1]);
  });
});
