import { deriveTasteFacts, factKey, isDeepFact } from "@/lib/taste";
import { traitLabelForKey } from "@/lib/tasteModel";
import type { Movie } from "@/lib/types";

/**
 * Grounded taste clusters: group the user's loved movies by embedding
 * similarity, then describe each group with the traits its members share and
 * name it by concrete exemplar titles. This is the "real commonalities" view -
 * abstract chips tell the tone, clusters point at actual movies.
 */

export interface LovedMovieSample {
  movie: Movie;
  rankScore: number;
  embedding: number[];
}

export interface TasteCluster {
  /** Shared-trait description, e.g. "institutional pressure, real-world stakes". */
  label: string;
  /** Dominant genres among members (theme context, not title lists). */
  genres: string[];
  /** Top member titles by rank score (kept for tooltips/debugging). */
  exemplars: string[];
  size: number;
  averageRankScore: number;
}

const MIN_MOVIES_FOR_CLUSTERING = 8;
const MIN_CLUSTER_SIZE = 3;
const MAX_KMEANS_ITERATIONS = 20;
const EXEMPLARS_PER_CLUSTER = 3;
const LABEL_TRAITS_PER_CLUSTER = 3;
/** A trait must appear in at least this share of cluster members to define it. */
const SHARED_TRAIT_MIN_SHARE = 0.4;

function normalize(vector: number[]): number[] {
  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  magnitude = Math.sqrt(magnitude);
  if (magnitude < 1e-9) return vector.map(() => 0);
  return vector.map((value) => value / magnitude);
}

function dot(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) sum += a[index] * b[index];
  return sum;
}

function meanVector(vectors: number[][], dim: number): number[] {
  const mean = new Array<number>(dim).fill(0);
  for (const vector of vectors) {
    for (let index = 0; index < dim; index += 1) mean[index] += vector[index] ?? 0;
  }
  for (let index = 0; index < dim; index += 1) mean[index] /= Math.max(1, vectors.length);
  return normalize(mean);
}

/** Deterministic farthest-point initialization: seed with the top-ranked movie. */
function initialCentroids(samples: LovedMovieSample[], normalized: number[][], k: number): number[][] {
  const chosen: number[] = [];
  let first = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].rankScore > samples[first].rankScore) first = index;
  }
  chosen.push(first);

  while (chosen.length < k) {
    let best = -1;
    let bestScore = Infinity;
    for (let index = 0; index < normalized.length; index += 1) {
      if (chosen.includes(index)) continue;
      let maxSimilarity = -Infinity;
      for (const centroidIndex of chosen) {
        maxSimilarity = Math.max(maxSimilarity, dot(normalized[index], normalized[centroidIndex]));
      }
      if (maxSimilarity < bestScore) {
        bestScore = maxSimilarity;
        best = index;
      }
    }
    if (best === -1) break;
    chosen.push(best);
  }

  return chosen.map((index) => normalized[index]);
}

function sharedGenres(members: LovedMovieSample[], limit = 3): string[] {
  const genreCounts = new Map<string, number>();
  for (const member of members) {
    for (const genre of member.movie.genres.slice(0, 2)) {
      genreCounts.set(genre.name, (genreCounts.get(genre.name) ?? 0) + 1);
    }
  }
  return [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

function clusterLabel(members: LovedMovieSample[]): string {
  const traitCounts = new Map<string, { count: number; weight: number }>();
  for (const member of members) {
    const counted = new Set<string>();
    for (const fact of deriveTasteFacts(member.movie)) {
      if (!isDeepFact(fact)) continue;
      const key = factKey(fact);
      if (counted.has(key)) continue;
      counted.add(key);
      const entry = traitCounts.get(key) ?? { count: 0, weight: 0 };
      entry.count += 1;
      entry.weight += fact.weight;
      traitCounts.set(key, entry);
    }
  }

  const shared = [...traitCounts.entries()]
    .filter(([, entry]) => entry.count >= Math.max(2, Math.ceil(members.length * SHARED_TRAIT_MIN_SHARE)))
    .sort((a, b) => b[1].count * b[1].weight - a[1].count * a[1].weight)
    .slice(0, LABEL_TRAITS_PER_CLUSTER)
    .map(([key]) => traitLabelForKey(key));
  if (shared.length) return shared.join(", ");

  // Fallback: dominant genres among members.
  return (
    sharedGenres(members, 2)
      .map((name) => name.toLowerCase())
      .join(", ") || "eclectic picks"
  );
}

export function buildTasteClusters(samples: LovedMovieSample[], maxClusters = 5): TasteCluster[] {
  const usable = samples.filter((sample) => sample.embedding.length > 0);
  if (usable.length < MIN_MOVIES_FOR_CLUSTERING) return [];

  const dim = usable[0].embedding.length;
  const normalized = usable.map((sample) => normalize(sample.embedding));
  const k = Math.max(2, Math.min(maxClusters, Math.floor(usable.length / MIN_MOVIES_FOR_CLUSTERING)));

  let centroids = initialCentroids(usable, normalized, k);
  const assignments = new Array<number>(usable.length).fill(0);

  for (let iteration = 0; iteration < MAX_KMEANS_ITERATIONS; iteration += 1) {
    let changed = false;
    for (let index = 0; index < normalized.length; index += 1) {
      let best = 0;
      let bestSimilarity = -Infinity;
      for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex += 1) {
        const similarity = dot(normalized[index], centroids[centroidIndex]);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          best = centroidIndex;
        }
      }
      if (assignments[index] !== best) {
        assignments[index] = best;
        changed = true;
      }
    }
    if (!changed && iteration > 0) break;

    centroids = centroids.map((centroid, centroidIndex) => {
      const memberVectors = normalized.filter((_, index) => assignments[index] === centroidIndex);
      return memberVectors.length ? meanVector(memberVectors, dim) : centroid;
    });
  }

  const clusters: TasteCluster[] = [];
  for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex += 1) {
    const members = usable.filter((_, index) => assignments[index] === centroidIndex);
    if (members.length < MIN_CLUSTER_SIZE) continue;
    const sorted = [...members].sort((a, b) => b.rankScore - a.rankScore);
    clusters.push({
      label: clusterLabel(members),
      genres: sharedGenres(members),
      exemplars: sorted.slice(0, EXEMPLARS_PER_CLUSTER).map((member) => member.movie.title),
      size: members.length,
      averageRankScore: members.reduce((sum, member) => sum + member.rankScore, 0) / members.length
    });
  }

  return clusters.sort((a, b) => b.size - a.size);
}

/**
 * Taste modes: the mixture components of a person's taste. A single learned
 * direction averages "comfort comedy nights" and "tense thriller nights" into
 * a centroid that matches neither; modes keep them separate so retrieval and
 * slate allocation can serve each side of the user proportionally.
 */
export interface TasteMode {
  label: string;
  centroid: number[];
  /** Discovery-weighted share of the user's loves (nostalgia/recency applied upstream). */
  share: number;
  memberIds: Set<number>;
  exemplars: string[];
}

export interface ModeSample extends LovedMovieSample {
  /** Discovery weight: nostalgia-discounted, recency-decayed. */
  weight: number;
}

export function buildTasteModes(samples: ModeSample[], maxModes = 5): TasteMode[] {
  const usable = samples.filter((sample) => sample.embedding.length > 0);
  if (usable.length < MIN_MOVIES_FOR_CLUSTERING) return [];

  const dim = usable[0].embedding.length;
  const normalized = usable.map((sample) => normalize(sample.embedding));
  const k = Math.max(2, Math.min(maxModes, Math.floor(usable.length / MIN_MOVIES_FOR_CLUSTERING)));

  let centroids = initialCentroids(usable, normalized, k);
  const assignments = new Array<number>(usable.length).fill(0);

  for (let iteration = 0; iteration < MAX_KMEANS_ITERATIONS; iteration += 1) {
    let changed = false;
    for (let index = 0; index < normalized.length; index += 1) {
      let best = 0;
      let bestSimilarity = -Infinity;
      for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex += 1) {
        const similarity = dot(normalized[index], centroids[centroidIndex]);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          best = centroidIndex;
        }
      }
      if (assignments[index] !== best) {
        assignments[index] = best;
        changed = true;
      }
    }
    if (!changed && iteration > 0) break;

    // Weighted centroid update: nostalgic/stale loves pull less.
    centroids = centroids.map((centroid, centroidIndex) => {
      const memberIndexes = normalized.map((_, index) => index).filter((index) => assignments[index] === centroidIndex);
      if (!memberIndexes.length) return centroid;
      const weighted = new Array<number>(dim).fill(0);
      let totalWeight = 0;
      for (const index of memberIndexes) {
        const weight = Math.max(0.01, usable[index].weight);
        totalWeight += weight;
        for (let d = 0; d < dim; d += 1) weighted[d] += normalized[index][d] * weight;
      }
      for (let d = 0; d < dim; d += 1) weighted[d] /= totalWeight;
      return normalize(weighted);
    });
  }

  const modes: TasteMode[] = [];
  let totalShare = 0;
  for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex += 1) {
    const memberIndexes = normalized.map((_, index) => index).filter((index) => assignments[index] === centroidIndex);
    if (memberIndexes.length < MIN_CLUSTER_SIZE) continue;
    const members = memberIndexes.map((index) => usable[index]);
    const share = members.reduce((sum, member) => sum + Math.max(0.01, member.weight), 0);
    totalShare += share;
    const sorted = [...members].sort((a, b) => b.weight * b.rankScore - a.weight * a.rankScore);
    modes.push({
      label: clusterLabel(members),
      centroid: centroids[centroidIndex],
      share,
      memberIds: new Set(members.map((member) => member.movie.tmdbId)),
      exemplars: sorted.slice(0, EXEMPLARS_PER_CLUSTER).map((member) => member.movie.title)
    });
  }

  if (totalShare > 0) {
    for (const mode of modes) mode.share /= totalShare;
  }
  return modes.sort((a, b) => b.share - a.share);
}
