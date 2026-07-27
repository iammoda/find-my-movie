import OpenAI from "openai";
import { TAXONOMY_TRAITS, TAXONOMY_VERSION, TAXONOMY_TRAITS_BY_ID } from "@/lib/taxonomy";
import type { Movie, MovieEnrichment, TasteFact } from "@/lib/types";

/**
 * LLM enrichment: read a movie's overview + user reviews and extract "what this film is
 * loved/known for" as taxonomy-aligned traits plus a one-line "essence" summary. Output
 * is constrained to the existing 90-trait vocabulary so it feeds the same feature space
 * as the deterministic taxonomy scorer, just with review-grounded signal.
 */

export const ENRICHMENT_MODEL = "gpt-4o-mini";
export const ENRICHMENT_VERSION = `llm-enrichment-v1:${TAXONOMY_VERSION}`;
const MAX_TRAITS = 6;

let client: OpenAI | null = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export function enrichmentConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export interface EnrichmentResult {
  facts: TasteFact[];
  enrichment: MovieEnrichment;
}

function traitCatalogText(): string {
  return TAXONOMY_TRAITS.map((trait) => `${trait.id} (${trait.facet}): ${trait.label} - ${trait.description}`).join("\n");
}

interface ParsedEnrichment {
  traits: Array<{ id: string; confidence: number }>;
  essence: string;
}

/** Parse + validate the model's JSON against the trait vocabulary. Returns null if unusable. */
export function parseEnrichmentResponse(raw: string): ParsedEnrichment | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  const essence = typeof record.essence === "string" ? record.essence.trim().slice(0, 400) : "";
  const rawTraits = Array.isArray(record.traits) ? record.traits : [];

  const seen = new Set<string>();
  const traits: Array<{ id: string; confidence: number }> = [];
  for (const item of rawTraits) {
    if (!item || typeof item !== "object") continue;
    const id = String((item as Record<string, unknown>).id ?? "").trim();
    if (!TAXONOMY_TRAITS_BY_ID.has(id) || seen.has(id)) continue;
    const rawConfidence = Number((item as Record<string, unknown>).confidence);
    const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0.6;
    seen.add(id);
    traits.push({ id, confidence });
    if (traits.length >= MAX_TRAITS) break;
  }

  if (!traits.length && !essence) return null;
  return { traits, essence };
}

function enrichmentFactWeight(confidence: number, baseWeight: number): number {
  return Number(Math.min(1.25, Math.max(0.3, confidence * baseWeight)).toFixed(4));
}

const SYSTEM_PROMPT = [
  "You are a film analyst. Given a movie's premise and audience reviews, identify which of the provided",
  "taxonomy traits genuinely describe what the film is about and what audiences respond to - its story",
  "engine, character pressure, tone, and emotional payoff. Only choose traits that clearly apply.",
  "Judge by narrative and thematic substance, not by genre label, cast, or era.",
  'Respond ONLY with JSON: {"traits":[{"id":"<trait_id>","confidence":0-1}],"essence":"one sentence on why people love or dislike it"}.'
].join(" ");

export async function enrichMovie(movie: Movie, reviews: string[]): Promise<EnrichmentResult | null> {
  const openai = getClient();
  if (!openai) return null;

  const reviewBlock = reviews.slice(0, 6).map((review, index) => `Review ${index + 1}: ${review}`).join("\n\n") || "No audience reviews available.";
  const userPrompt = [
    `Title: ${movie.title} (${movie.releaseDate?.slice(0, 4) ?? "unknown year"})`,
    `Premise: ${movie.overview || "unknown"}`,
    `Genres: ${movie.genres.map((genre) => genre.name).join(", ") || "unknown"}`,
    "",
    "Available taxonomy traits (choose only from these ids):",
    traitCatalogText(),
    "",
    "Audience reviews:",
    reviewBlock
  ].join("\n");

  let content: string;
  try {
    const response = await openai.chat.completions.create({
      model: ENRICHMENT_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    });
    content = response.choices[0]?.message?.content ?? "";
  } catch (error) {
    console.warn(`Enrichment call failed for ${movie.tmdbId}`, error instanceof Error ? error.message : error);
    return null;
  }

  const parsed = parseEnrichmentResponse(content);
  if (!parsed) return null;

  const facts: TasteFact[] = parsed.traits.flatMap((item) => {
    const trait = TAXONOMY_TRAITS_BY_ID.get(item.id);
    if (!trait) return [];
    return [
      {
        tmdbId: movie.tmdbId,
        kind: trait.facet,
        value: trait.id,
        weight: enrichmentFactWeight(item.confidence, trait.weight),
        source: "llm" as const
      }
    ];
  });

  return {
    facts,
    enrichment: {
      tmdbId: movie.tmdbId,
      version: ENRICHMENT_VERSION,
      essence: parsed.essence || null,
      traitCount: facts.length,
      enrichedAt: new Date().toISOString()
    }
  };
}
