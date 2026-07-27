"use client";

import { Download, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ratingWeight } from "@/lib/rating";
import { deriveTasteFacts } from "@/lib/taste";
import { taxonomyLabelFor } from "@/lib/taxonomy";
import type { ExportPayload } from "@/lib/types";

const DEBUG_SURFACE_KINDS = new Set(["genre", "setting", "cast", "director", "period"]);

function tasteLabel(key: string) {
  const [kind, value] = key.split(":");
  return `${kind.replace(/_/g, " ")}: ${taxonomyLabelFor(value)}`;
}

export function DebugPanel() {
  const [data, setData] = useState<ExportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [promotingId, setPromotingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dev/export", { cache: "no-store" });
      setData(await response.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const latestRun = data?.recommendationRuns[0];
  const runEvaluation = useMemo(() => {
    if (!latestRun) return null;
    const baseline = latestRun.baselineAverage;
    const recommendation = latestRun.recommendationAverage;
    if (typeof baseline !== "number" || typeof recommendation !== "number") {
      return {
        label: "Waiting for enough rated recommendation outcomes",
        detail: "Rate recommendations directly to compare them against browse/taste-test ratings."
      };
    }
    const delta = recommendation - baseline;
    return {
      label: delta > 0 ? "Recommendations are outperforming browse" : delta < 0 ? "Recommendations are underperforming browse" : "Recommendations match browse",
      detail: `Delta ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} rating-weight points`
    };
  }, [latestRun]);
  const ratingGroups = useMemo(() => {
    if (!data) return [];
    const movieById = new Map(data.movies.map((movie) => [movie.tmdbId, movie]));
    const groups = [
      {
        key: "best_ever",
        title: "Best Ever",
        ratings: data.ratings.filter((rating) => rating.rating === "best_ever")
      },
      {
        key: "like",
        title: "Like",
        ratings: data.ratings.filter((rating) => rating.rating === "like")
      },
      {
        key: "skip",
        title: "Skip",
        ratings: data.ratings.filter((rating) => rating.rating === "skip")
      },
      {
        key: "dislike",
        title: "Dislike",
        ratings: data.ratings.filter((rating) => rating.rating === "dislike")
      },
      {
        key: "hate",
        title: "Hate",
        ratings: data.ratings.filter((rating) => rating.rating === "hate")
      }
    ];

    return groups.map((group) => ({
      ...group,
      ratings: group.ratings
        .map((rating) => ({ rating, movie: movieById.get(rating.tmdbId) }))
        .sort((a, b) => b.rating.updatedAt.localeCompare(a.rating.updatedAt))
    }));
  }, [data]);

  const notSeenMovies = useMemo(() => {
    if (!data) return [];
    const movieById = new Map(data.movies.map((movie) => [movie.tmdbId, movie]));
    return data.exposures
      .filter((exposure) => exposure.source === "not_seen")
      .map((exposure) => ({ exposure, movie: movieById.get(exposure.tmdbId) }))
      .sort((a, b) => b.exposure.createdAt.localeCompare(a.exposure.createdAt));
  }, [data]);

  const tasteProfile = useMemo(() => {
    if (!data) return { positive: [], negative: [], conflicted: [] };

    const byId = new Map(data.movies.map((movie) => [movie.tmdbId, movie]));
    const positive = new Map<string, number>();
    const negative = new Map<string, number>();

    for (const rating of data.ratings) {
      const movie = byId.get(rating.tmdbId);
      const weight = ratingWeight(rating.rating);
      if (!movie || weight === 0) continue;

      for (const fact of deriveTasteFacts(movie)) {
        if (DEBUG_SURFACE_KINDS.has(fact.kind)) continue;
        if (fact.source !== "taxonomy" && fact.source !== "heuristic") continue;
        const key = `${fact.kind}:${fact.value}`;
        const score = Math.abs(weight) * fact.weight * (fact.source === "taxonomy" ? 1.35 : 0.35);
        const target = weight > 0 ? positive : negative;
        const cap = fact.source === "taxonomy" ? 16 : 6;
        target.set(key, Math.min(cap, (target.get(key) ?? 0) + score));
      }
    }

    const allKeys = new Set([...positive.keys(), ...negative.keys()]);
    const netPositive = new Map<string, number>();
    const netNegative = new Map<string, number>();
    const conflicted = new Map<string, number>();

    for (const key of allKeys) {
      const positiveScore = positive.get(key) ?? 0;
      const negativeScore = negative.get(key) ?? 0;
      const netScore = positiveScore - negativeScore * 1.15;
      if (positiveScore > 1 && negativeScore > 1) conflicted.set(key, Math.min(positiveScore, negativeScore));
      if (netScore > 0.75) netPositive.set(key, netScore);
      if (netScore < -0.75) netNegative.set(key, Math.abs(netScore));
    }

    const toList = (map: Map<string, number>) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([key, score]) => ({ label: tasteLabel(key), score }));

    return { positive: toList(netPositive), negative: toList(netNegative), conflicted: toList(conflicted) };
  }, [data]);
  const exportHref = useMemo(() => {
    if (!data) return "";
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    return URL.createObjectURL(blob);
  }, [data]);

  const reset = async () => {
    await fetch("/api/dev/reset", { method: "POST" });
    await load();
  };

  const promoteToBestEver = async (tmdbId: number) => {
    setPromotingId(tmdbId);
    try {
      await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, rating: "best_ever" })
      });
      await load();
    } finally {
      setPromotingId(null);
    }
  };

  return (
    <section className="plain-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">One-user MVP</p>
          <h1>Debug</h1>
        </div>
        <div className="debug-actions">
          <a className="secondary-button" href={exportHref} download="find-my-movie-export.json">
            <Download size={16} />
            Export
          </a>
          <button type="button" className="danger-button" onClick={reset}>
            <Trash2 size={16} />
            Reset
          </button>
        </div>
      </div>

      {loading && <p className="muted">Loading debug data...</p>}
      {data && (
        <>
          <div className="debug-stats">
            <div>
              <span>{data.movies.length}</span>
              Movies cached
            </div>
            <div>
              <span>{data.ratings.length}</span>
              Ratings
            </div>
            <div>
              <span>{data.ratingReasons.length}</span>
              Generic reasons
            </div>
            <div>
              <span>{data.ratingTraitReasons.length}</span>
              Trait reasons
            </div>
            <div>
              <span>{data.exposures.length}</span>
              Exposures
            </div>
            <div>
              <span>{data.recommendationRuns.length}</span>
              Runs
            </div>
          </div>

          <h2>Taste profile</h2>
          <div className="taste-profile-grid">
            <article>
              <h3>Positive signals</h3>
              {tasteProfile.positive.length ? (
                <div className="trait-chip-row">
                  {tasteProfile.positive.map((trait) => (
                    <span className="trait-chip" key={trait.label}>
                      {trait.label} · {trait.score.toFixed(1)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted">No positive taste signals yet.</p>
              )}
            </article>
            <article>
              <h3>Negative signals</h3>
              {tasteProfile.negative.length ? (
                <div className="trait-chip-row">
                  {tasteProfile.negative.map((trait) => (
                    <span className="trait-chip negative-chip" key={trait.label}>
                      {trait.label} · {trait.score.toFixed(1)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted">No negative taste signals yet.</p>
              )}
            </article>
            <article>
              <h3>Conflicted signals</h3>
              {tasteProfile.conflicted.length ? (
                <div className="trait-chip-row">
                  {tasteProfile.conflicted.map((trait) => (
                    <span className="trait-chip" key={trait.label}>
                      {trait.label} · {trait.score.toFixed(1)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted">No conflicted taste signals yet.</p>
              )}
            </article>
          </div>

          <h2>Latest recommendation run</h2>
          {!latestRun && <p className="muted">No recommendation run yet.</p>}
          {latestRun && (
            <div className="debug-run">
              {runEvaluation && (
                <div className="debug-evaluation">
                  <strong>{runEvaluation.label}</strong>
                  <span>{runEvaluation.detail}</span>
                </div>
              )}
              <p>
                <strong>Status:</strong> {latestRun.status} · <strong>Prompt:</strong> {latestRun.promptVersion} ·{" "}
                <strong>Scoring:</strong> {latestRun.scoringVersion}
              </p>
              <p>
                Browse avg: {latestRun.baselineAverage?.toFixed?.(2) ?? "n/a"} · Recommendation avg:{" "}
                {latestRun.recommendationAverage?.toFixed?.(2) ?? "n/a"}
              </p>
              <pre>{JSON.stringify(latestRun.metadata, null, 2)}</pre>
              <div className="debug-list">
                {latestRun.items.map((item) => {
                  const breakdown = item.scoreBreakdown;
                  return (
                    <article key={item.id}>
                      <h3>
                        #{item.rank} {item.movie.title}
                      </h3>
                      <p>{item.explanation}</p>
                      <div className="debug-score-grid">
                        <span>Score {item.score.toFixed(2)}</span>
                        <span>Semantic {(breakdown.semanticScore ?? breakdown.embeddingSimilarityScore).toFixed(2)}</span>
                        <span>Traits {breakdown.positiveTraitScore.toFixed(2)}</span>
                        <span>Penalty {breakdown.negativeTraitPenalty.toFixed(2)}</span>
                        <span>Quality {breakdown.qualityScore.toFixed(2)}</span>
                      </div>
                      {Boolean(breakdown.nearestPositiveMovies?.length) && (
                        <p>
                          <strong>Nearest liked:</strong> {breakdown.nearestPositiveMovies?.join(", ")}
                        </p>
                      )}
                      {Boolean(breakdown.nearestNegativeMovies?.length) && (
                        <p>
                          <strong>Nearest disliked:</strong> {breakdown.nearestNegativeMovies?.join(", ")}
                        </p>
                      )}
                      {Boolean(breakdown.matchedTaxonomyTraits?.length) && (
                        <p>
                          <strong>Matched traits:</strong> {breakdown.matchedTaxonomyTraits?.join(", ")}
                        </p>
                      )}
                      {Boolean(breakdown.avoidedTraits?.length) && (
                        <p>
                          <strong>Avoided/penalized:</strong> {breakdown.avoidedTraits?.join(", ")}
                        </p>
                      )}
                      {Boolean(breakdown.selectedTraitMatches?.length || breakdown.selectedTraitAvoidances?.length) && (
                        <p>
                          <strong>Selected trait influence:</strong>{" "}
                          {[...(breakdown.selectedTraitMatches ?? []), ...(breakdown.selectedTraitAvoidances ?? [])].join(", ")}
                        </p>
                      )}
                      <details>
                        <summary>Raw breakdown</summary>
                        <pre>{JSON.stringify(item.scoreBreakdown, null, 2)}</pre>
                      </details>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          <h2>Ratings</h2>
          <div className="debug-rating-grid">
            {ratingGroups.map((group) => (
              <section className="debug-rating-group" key={group.key} aria-labelledby={`debug-ratings-${group.key}`}>
                <div className="debug-rating-group-header">
                  <h3 id={`debug-ratings-${group.key}`}>{group.title}</h3>
                  <span>{group.ratings.length}</span>
                </div>
                {group.ratings.length ? (
                  <div className="debug-list">
                    {group.ratings.map(({ rating, movie }) => (
                      <article className="debug-rating-row" key={rating.tmdbId}>
                        <h3>{movie?.title ?? rating.tmdbId}</h3>
                        {group.key === "like" && (
                          <button
                            type="button"
                            className="debug-promote-button"
                            onClick={() => void promoteToBestEver(rating.tmdbId)}
                            disabled={promotingId === rating.tmdbId}
                            title="Promote to Best Ever"
                            aria-label={`Promote ${movie?.title ?? rating.tmdbId} to Best Ever`}
                          >
                            <Sparkles size={16} />
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="muted debug-rating-empty">No {group.title.toLowerCase()} ratings.</p>
                )}
              </section>
            ))}
            <section className="debug-rating-group" aria-labelledby="debug-ratings-not-seen">
              <div className="debug-rating-group-header">
                <h3 id="debug-ratings-not-seen">Not Seen</h3>
                <span>{notSeenMovies.length}</span>
              </div>
              {notSeenMovies.length ? (
                <div className="debug-list">
                  {notSeenMovies.map(({ exposure, movie }) => (
                    <article key={exposure.id}>
                      <h3>{movie?.title ?? exposure.tmdbId}</h3>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted debug-rating-empty">No not seen movies.</p>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
