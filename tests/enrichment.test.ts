import { describe, expect, it } from "vitest";
import { parseEnrichmentResponse } from "@/lib/enrichment";
import { TAXONOMY_TRAITS } from "@/lib/taxonomy";

const validTraitId = TAXONOMY_TRAITS[0].id;
const secondTraitId = TAXONOMY_TRAITS[1].id;

describe("parseEnrichmentResponse", () => {
  it("keeps only known trait ids and clamps confidence", () => {
    const raw = JSON.stringify({
      traits: [
        { id: validTraitId, confidence: 0.9 },
        { id: "not_a_real_trait", confidence: 0.8 },
        { id: secondTraitId, confidence: 5 }
      ],
      essence: "A tense moral thriller."
    });
    const parsed = parseEnrichmentResponse(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.traits.map((trait) => trait.id)).toEqual([validTraitId, secondTraitId]);
    expect(parsed!.traits[1].confidence).toBe(1);
    expect(parsed!.essence).toBe("A tense moral thriller.");
  });

  it("dedupes repeated trait ids", () => {
    const raw = JSON.stringify({
      traits: [
        { id: validTraitId, confidence: 0.7 },
        { id: validTraitId, confidence: 0.6 }
      ],
      essence: ""
    });
    const parsed = parseEnrichmentResponse(raw);
    expect(parsed!.traits).toHaveLength(1);
  });

  it("defaults confidence when missing or non-numeric", () => {
    const raw = JSON.stringify({ traits: [{ id: validTraitId }], essence: "x" });
    expect(parseEnrichmentResponse(raw)!.traits[0].confidence).toBeCloseTo(0.6, 5);
  });

  it("returns null for invalid JSON or empty payloads", () => {
    expect(parseEnrichmentResponse("not json")).toBeNull();
    expect(parseEnrichmentResponse(JSON.stringify({ traits: [], essence: "" }))).toBeNull();
    expect(parseEnrichmentResponse(JSON.stringify({ traits: [{ id: "unknown" }], essence: "" }))).toBeNull();
  });

  it("accepts essence-only responses", () => {
    const parsed = parseEnrichmentResponse(JSON.stringify({ traits: [], essence: "Loved for its ensemble banter." }));
    expect(parsed).not.toBeNull();
    expect(parsed!.traits).toHaveLength(0);
    expect(parsed!.essence).toContain("ensemble");
  });
});
