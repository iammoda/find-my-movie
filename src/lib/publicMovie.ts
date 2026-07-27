import type { RecommendationResult } from "@/lib/recommendations";
import { taxonomyLabelFor } from "@/lib/taxonomy";
import type { Movie, MovieTasteTrait, RecommendationItem, RecommendationRun } from "@/lib/types";

const LOW_SIGNAL_PROMPT_TRAIT_IDS = new Set([
  "feel_good_momentum",
  "mythic_heroism",
  "propulsive_momentum",
  "real_world_consequences",
  "spectacle_adventure"
]);

const MIN_PROMPT_TRAIT_WEIGHT = 0.65;

function hasGenre(movie: Movie, genreName: string) {
  return movie.genres.some((genre) => genre.name.toLowerCase() === genreName.toLowerCase());
}

function promptableTrait(movie: Movie, trait: NonNullable<Movie["tasteFacts"]>[number]) {
  if (trait.source !== "taxonomy") return false;
  if (trait.weight < MIN_PROMPT_TRAIT_WEIGHT) return false;
  if (LOW_SIGNAL_PROMPT_TRAIT_IDS.has(trait.value)) return false;
  if (trait.value === "monster_as_metaphor" && !hasGenre(movie, "Horror")) return false;
  return true;
}

export function publicMovieTasteTraits(movie: Movie, limit = 5): MovieTasteTrait[] {
  const source = movie.tasteFacts?.filter((fact) => promptableTrait(movie, fact)) ?? [];
  const byId = new Map<string, MovieTasteTrait>();

  for (const fact of source.sort((a, b) => b.weight - a.weight)) {
    if (byId.has(fact.value)) continue;
    byId.set(fact.value, {
      id: fact.value,
      label: taxonomyLabelFor(fact.value),
      kind: fact.kind,
      weight: fact.weight
    });
    if (byId.size >= limit) break;
  }

  return [...byId.values()];
}

export function publicMovie(movie: Movie): Movie {
  return {
    ...movie,
    sourcePayload: undefined,
    tasteFacts: undefined,
    tasteTraits: movie.tasteTraits ?? publicMovieTasteTraits(movie)
  };
}

export function publicRecommendationItem(item: RecommendationItem): RecommendationItem {
  return {
    ...item,
    movie: publicMovie(item.movie)
  };
}

export function publicRecommendationRun(run: RecommendationRun): RecommendationRun {
  return {
    ...run,
    items: run.items.map(publicRecommendationItem)
  };
}

export function publicRecommendationResult(result: RecommendationResult): RecommendationResult {
  return {
    ...result,
    run: result.run ? publicRecommendationRun(result.run) : null,
    recommendations: result.recommendations.map(publicRecommendationItem)
  };
}
