import { NextResponse } from "next/server";
import { getSessionStore, unauthorized } from "@/lib/auth";
import { VERDICT_BANDS } from "@/lib/ranking";
import { ratingWeight, recommendationReadiness } from "@/lib/rating";
import { buildTasteClusters, type LovedMovieSample } from "@/lib/tasteClusters";
import { loadTasteModel, traitLabelForKey } from "@/lib/tasteModel";
import type { Movie, Rating } from "@/lib/types";

export const dynamic = "force-dynamic";

const DRAWN_TO_LIMIT = 6;
const AVOIDS_LIMIT = 5;
const GENRE_LIMIT = 5;
const MAX_CLUSTERS = 5;
const PEOPLE_LIMIT = 5;
/** Directors/actors need at least this many loved movies to count as an affinity. */
const MIN_LOVED_FOR_PERSON = 2;
/** Location/era chips read as noise in a taste summary. */
const EXCLUDED_TRAIT_PREFIXES = ["genre:", "setting:", "period:"];
/** Trait weights below this fraction of the strongest weight are too weak to show. */
const MIN_RELATIVE_TRAIT_WEIGHT = 0.25;

function lovedRatings(ratings: Rating[]): Rating[] {
  return ratings.filter((rating) => rating.verdict === "loved" || (rating.rankScore ?? 0) >= VERDICT_BANDS.loved.min);
}

interface PersonAffinity {
  name: string;
  lovedCount: number;
  lovedTitles: string[];
}

function peopleAffinity(loved: Rating[], byId: Map<number, Movie>, credits: Map<number, { director: string | null; actors: string[] }>) {
  const directorMap = new Map<string, PersonAffinity>();
  const actorMap = new Map<string, PersonAffinity>();

  const record = (map: Map<string, PersonAffinity>, name: string, title: string) => {
    const entry = map.get(name) ?? { name, lovedCount: 0, lovedTitles: [] };
    entry.lovedCount += 1;
    if (entry.lovedTitles.length < 3) entry.lovedTitles.push(title);
    map.set(name, entry);
  };

  for (const rating of loved) {
    const movie = byId.get(rating.tmdbId);
    const credit = credits.get(rating.tmdbId);
    if (!movie || !credit) continue;
    if (credit.director) record(directorMap, credit.director, movie.title);
    for (const actor of credit.actors.slice(0, 4)) record(actorMap, actor, movie.title);
  }

  const rank = (map: Map<string, PersonAffinity>) =>
    [...map.values()]
      .filter((person) => person.lovedCount >= MIN_LOVED_FOR_PERSON)
      .sort((a, b) => b.lovedCount - a.lovedCount || a.name.localeCompare(b.name))
      .slice(0, PEOPLE_LIMIT);

  return { directors: rank(directorMap), actors: rank(actorMap) };
}

/**
 * A grounded snapshot of the learned taste: embedding clusters of loved movies
 * named by exemplar titles, director/actor affinities, genre affinity, and the
 * model's strongest (filtered) trait weights.
 */
export async function GET() {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const [movies, ratings, exposures, appealSignals, watchlist] = await Promise.all([
    store.listMovies(),
    store.listRatings(),
    store.listExposures(),
    store.listAppealSignals(),
    store.listWatchlist()
  ]);

  const readiness = recommendationReadiness(ratings);

  const verdictCounts = { loved: 0, fine: 0, disliked: 0 };
  for (const rating of ratings) {
    if (rating.verdict === "loved") verdictCounts.loved += 1;
    else if (rating.verdict === "fine") verdictCounts.fine += 1;
    else if (rating.verdict === "disliked") verdictCounts.disliked += 1;
  }

  const byId = new Map(movies.map((movie) => [movie.tmdbId, movie]));
  const genreScores = new Map<string, number>();
  for (const rating of ratings) {
    const movie = byId.get(rating.tmdbId);
    const weight = ratingWeight(rating.rating);
    if (!movie || weight === 0) continue;
    for (const genre of movie.genres.slice(0, 2)) {
      genreScores.set(genre.name, (genreScores.get(genre.name) ?? 0) + weight);
    }
  }
  const topGenres = [...genreScores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, GENRE_LIMIT)
    .map(([name]) => name);

  const { model, signalEmbeddingsById } = await loadTasteModel(store, { movies, ratings, exposures, appealSignals, watchlist });

  // Taste clusters: the concrete "movies like these" view of what they love.
  const loved = lovedRatings(ratings);
  const clusterSamples: LovedMovieSample[] = loved.flatMap((rating) => {
    const movie = byId.get(rating.tmdbId);
    const embedding = signalEmbeddingsById.get(rating.tmdbId);
    if (!movie || !embedding?.length) return [];
    return [{ movie, rankScore: rating.rankScore ?? VERDICT_BANDS.loved.min, embedding }];
  });
  const clusters = buildTasteClusters(clusterSamples, MAX_CLUSTERS).map((cluster) => ({
    label: cluster.label,
    exemplars: cluster.exemplars,
    size: cluster.size
  }));

  // People affinity from loved movies' credits.
  let people: { directors: PersonAffinity[]; actors: PersonAffinity[] } = { directors: [], actors: [] };
  try {
    const creditRows = await store.listMovieCredits(loved.map((rating) => rating.tmdbId));
    const credits = new Map(creditRows.map((credit) => [credit.tmdbId, { director: credit.director, actors: credit.actors }]));
    people = peopleAffinity(loved, byId, credits);
  } catch (error) {
    console.warn("Credits unavailable for taste profile", error instanceof Error ? error.message : error);
  }

  let drawnTo: string[] = [];
  let avoids: string[] = [];
  if (model) {
    // Global trait weights from the fitted model, minus noisy location/era tags.
    const traits = model.traitVocab
      .map((key, position) => ({ key, weight: model.weights[model.embeddingDim + position] }))
      .filter((trait) => !EXCLUDED_TRAIT_PREFIXES.some((prefix) => trait.key.startsWith(prefix)));
    const strongest = traits.reduce((max, trait) => Math.max(max, Math.abs(trait.weight)), 0);
    const floor = strongest * MIN_RELATIVE_TRAIT_WEIGHT;
    drawnTo = traits
      .filter((trait) => trait.weight > floor)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, DRAWN_TO_LIMIT)
      .map((trait) => traitLabelForKey(trait.key));
    avoids = traits
      .filter((trait) => trait.weight < -floor)
      .sort((a, b) => a.weight - b.weight)
      .slice(0, AVOIDS_LIMIT)
      .map((trait) => traitLabelForKey(trait.key));
  }

  return NextResponse.json({
    ready: Boolean(model),
    readiness,
    sampleCount: model?.ratingSampleCount ?? 0,
    verdictCounts,
    topGenres,
    clusters,
    directors: people.directors,
    actors: people.actors,
    drawnTo,
    avoids
  });
}
