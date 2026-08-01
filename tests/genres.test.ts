import { describe, expect, it } from "vitest";
import { resolveGenre } from "@/lib/genres";

describe("resolveGenre", () => {
  it("matches exact genre names case-insensitively", () => {
    expect(resolveGenre("horror")?.name).toBe("Horror");
    expect(resolveGenre("Sci-Fi")?.id).toBe(878);
  });

  it("ignores punctuation and whitespace", () => {
    expect(resolveGenre("sci fi")?.id).toBe(878);
    expect(resolveGenre("  tv movie ")?.id).toBe(10770);
  });

  it("resolves common aliases", () => {
    expect(resolveGenre("science fiction")?.id).toBe(878);
    expect(resolveGenre("scary")?.name).toBe("Horror");
    expect(resolveGenre("animated")?.name).toBe("Animation");
  });

  it("resolves unambiguous prefixes", () => {
    expect(resolveGenre("docu")?.name).toBe("Documentary");
    expect(resolveGenre("west")?.name).toBe("Western");
  });

  it("accepts TMDB genre ids", () => {
    expect(resolveGenre("35")?.name).toBe("Comedy");
  });

  it("returns null for unknown or ambiguous input", () => {
    expect(resolveGenre("zombie ballet")).toBeNull();
    expect(resolveGenre("")).toBeNull();
    expect(resolveGenre("999999")).toBeNull();
  });
});
