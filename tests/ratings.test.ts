import { describe, expect, it } from "vitest";
import { ratingSentiment, ratingSupportsTraitPrompt, recommendationReadiness, ratingWeight } from "@/lib/rating";
import type { Rating } from "@/lib/types";

function rating(tmdbId: number, value: Rating["rating"]): Rating {
  return {
    profileId: "default",
    tmdbId,
    rating: value,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

describe("ratings", () => {
  it("uses the five-value MVP scale", () => {
    expect(ratingWeight("best_ever")).toBe(3);
    expect(ratingWeight("like")).toBe(1);
    expect(ratingWeight("skip")).toBe(0);
    expect(ratingWeight("dislike")).toBe(-1);
    expect(ratingWeight("hate")).toBe(-3);
  });

  it("maps only meaningful preference ratings to factor sentiment", () => {
    expect(ratingSentiment("best_ever")).toBe("positive");
    expect(ratingSentiment("like")).toBe("positive");
    expect(ratingSentiment("dislike")).toBe("negative");
    expect(ratingSentiment("hate")).toBe("negative");
    expect(ratingSentiment("skip")).toBeNull();
  });

  it("asks for trait feedback only on high-intensity ratings", () => {
    expect(ratingSupportsTraitPrompt("best_ever")).toBe(true);
    expect(ratingSupportsTraitPrompt("hate")).toBe(true);
    expect(ratingSupportsTraitPrompt("like")).toBe(false);
    expect(ratingSupportsTraitPrompt("dislike")).toBe(false);
    expect(ratingSupportsTraitPrompt("skip")).toBe(false);
  });

  it("requires enough positive and total signal before recommendations unlock", () => {
    const tooFew = [
      rating(1, "best_ever"),
      rating(2, "like"),
      rating(3, "dislike"),
      rating(4, "hate"),
      rating(5, "skip")
    ];
    expect(recommendationReadiness(tooFew).ready).toBe(false);

    const ready = [
      rating(1, "best_ever"),
      rating(2, "like"),
      rating(3, "like"),
      rating(4, "dislike"),
      rating(5, "hate"),
      rating(6, "dislike"),
      rating(7, "like"),
      rating(8, "dislike"),
      rating(9, "like"),
      rating(10, "dislike")
    ];
    expect(recommendationReadiness(ready).ready).toBe(true);
  });
});
