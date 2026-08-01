"use client";

import { EyeOff, Heart, Meh, RefreshCcw, ThumbsDown } from "lucide-react";
import { useState } from "react";
import type { Genre, MediaType, Movie, RecommendationItem, Verdict } from "@/lib/types";
import { genresForMedia } from "@/lib/constants";
import { MoviePoster } from "@/components/MoviePoster";

interface RecommendationsResponse {
  ready: boolean;
  readiness: {
    total: number;
    positives: number;
    neededRatings: number;
    neededPositiveRatings: number;
  };
  recommendations: RecommendationItem[];
  fallback: boolean;
  genre?: Genre | null;
  mediaType?: MediaType;
}

interface RecommendationsPanelProps {
  ratingsVersion: number;
  onRate: (movie: Movie, verdict: Verdict) => Promise<void>;
}

const SURFACE_TRAIT_PREFIXES = ["genre:", "setting:", "cast:", "director:", "period:"];

function formatTraitLabel(trait: string) {
  const [, ...rest] = trait.split(":");
  const value = rest.join(":").trim();
  if (!value) return trait;
  return value.replace(/_/g, " ");
}

function recommendationChips(item: RecommendationItem) {
  const sourceTraits = item.scoreBreakdown.selectedTraitMatches?.length
    ? item.scoreBreakdown.selectedTraitMatches
    : item.scoreBreakdown.matchedTaxonomyTraits?.length
      ? item.scoreBreakdown.matchedTaxonomyTraits
      : item.scoreBreakdown.topTraits;
  const deep = sourceTraits.filter((trait) => !SURFACE_TRAIT_PREFIXES.some((prefix) => trait.startsWith(prefix)));
  const surface = sourceTraits.filter((trait) => SURFACE_TRAIT_PREFIXES.some((prefix) => trait.startsWith(prefix)));
  return [...deep.slice(0, 3), ...surface.slice(0, Math.max(0, 3 - deep.length))].map(formatTraitLabel);
}

export function RecommendationsPanel({ ratingsVersion, onRate }: RecommendationsPanelProps) {
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [genreInput, setGenreInput] = useState("");
  const [genreError, setGenreError] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>("movie");

  const load = async (media: MediaType = mediaType) => {
    setLoading(true);
    setGenreError(null);
    try {
      const params = new URLSearchParams({ ratingsVersion: String(ratingsVersion), media });
      if (genreInput.trim()) params.set("genre", genreInput.trim());
      const response = await fetch(`/api/recommendations?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setGenreError(payload.error ?? "Could not generate recommendations.");
        return;
      }
      setData(payload);
    } finally {
      setLoading(false);
    }
  };

  const switchMedia = (media: MediaType) => {
    if (media === mediaType) return;
    setMediaType(media);
    setGenreInput("");
    setGenreError(null);
    if (data) void load(media);
  };

  const hide = async (item: RecommendationItem) => {
    await fetch(`/api/recommendations/${item.id}/hide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId: item.tmdbId, reason: "not_interested" })
    });
    setData((current) =>
      current
        ? {
            ...current,
            recommendations: current.recommendations.filter((recommendation) => recommendation.tmdbId !== item.tmdbId)
          }
        : current
    );
  };

  const rate = async (item: RecommendationItem, verdict: Verdict) => {
    await onRate(item.movie, verdict);
    setData((current) =>
      current
        ? {
            ...current,
            recommendations: current.recommendations.filter((recommendation) => recommendation.tmdbId !== item.tmdbId)
          }
        : current
    );
  };

  return (
    <section className="recommendations-section" aria-labelledby="recommendations-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Taste test</p>
          <h2 id="recommendations-heading">
            Recommendations
            {data?.genre ? <span className="genre-filter-label"> · {data.genre.name}</span> : null}
          </h2>
        </div>
        <div className="recommendation-controls">
          <div className="media-switch" role="group" aria-label="Recommendation catalog">
            <button type="button" className={mediaType === "movie" ? "is-active" : ""} onClick={() => switchMedia("movie")}>
              Movies
            </button>
            <button type="button" className={mediaType === "tv" ? "is-active" : ""} onClick={() => switchMedia("tv")}>
              TV
            </button>
          </div>
          <input
            type="text"
            className="genre-input"
            list="recommendation-genres"
            placeholder="Any genre"
            aria-label="Filter recommendations by genre"
            value={genreInput}
            onChange={(event) => {
              setGenreInput(event.target.value);
              setGenreError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !loading) load();
            }}
          />
          <datalist id="recommendation-genres">
            {genresForMedia(mediaType).map((genre) => (
              <option key={genre.id} value={genre.name} />
            ))}
          </datalist>
          <button type="button" className="secondary-button" onClick={() => load()} disabled={loading}>
            <RefreshCcw size={16} />
            {loading ? "Checking" : "Generate"}
          </button>
        </div>
      </div>

      {genreError && <p className="notice">{genreError} Try one of: {genresForMedia(mediaType).map((genre) => genre.name).join(", ")}.</p>}

      {!data && !genreError && <p className="muted">Rate movies first, then generate a debuggable recommendation run.</p>}

      {data && !data.ready && (
        <p className="muted">
          Recommendations unlock after more signal. You have {data.readiness.total} ratings and {data.readiness.positives} positive ratings.
          Need {data.readiness.neededRatings} more rating{data.readiness.neededRatings === 1 ? "" : "s"} and{" "}
          {data.readiness.neededPositiveRatings} more positive rating{data.readiness.neededPositiveRatings === 1 ? "" : "s"}.
        </p>
      )}

      {data?.ready && (
        <>
          {data.fallback && <p className="notice">Fallback ranking is active because taste scoring was unavailable.</p>}
          {data.recommendations.length === 0 && (
            <p className="muted">
              {data.genre
                ? `No recommendations available for ${data.genre.name} right now. Try another genre or rate more movies.`
                : "No recommendations available right now. Rate more movies to add signal."}
            </p>
          )}
          <div className="recommendation-grid">
            {data.recommendations.map((item) => {
              const expanded = expandedId === item.id;
              const year = item.movie.releaseDate?.slice(0, 4);

              return (
                <article className={`recommendation-card ${expanded ? "is-expanded" : ""}`} key={item.id}>
                  <button
                    type="button"
                    className="recommendation-summary"
                    onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                    aria-expanded={expanded}
                  >
                    <div className="recommendation-poster">
                      <MoviePoster movie={item.movie} />
                    </div>
                    <div className="recommendation-body">
                      <p className="recommendation-meta">
                        <span className="recommendation-meta-text">{year}</span>
                        {item.scoreBreakdown.predictedRankScore != null && (
                          <span
                            className="predicted-score"
                            title={`Predicted ${item.scoreBreakdown.predictedRankScore.toFixed(1)}/10 for you`}
                          >
                            {item.scoreBreakdown.predictedRankScore.toFixed(1)}/10
                          </span>
                        )}
                      </p>
                      <h3>{item.movie.title}</h3>
                      {item.movie.genres.length > 0 && (
                        <span className="genre-chip-row" aria-label="Genres">
                          {item.movie.genres.map((genre) => (
                            <span className="genre-chip" key={genre.id}>
                              {genre.name}
                            </span>
                          ))}
                        </span>
                      )}
                      <p>{item.movie.overview || "No synopsis available."}</p>
                    </div>
                  </button>

                  {expanded && (
                    <div className="recommendation-expanded">
                      {item.explanation && <p className="recommendation-explanation">{item.explanation}</p>}
                      <div className="trait-chip-row" aria-label="Taste reasons">
                        {recommendationChips(item).map((chip) => (
                          <span className="trait-chip" key={chip}>
                            {chip}
                          </span>
                        ))}
                      </div>
                      <div className="mini-actions" aria-label={`Rate or hide ${item.movie.title}`}>
                        <button type="button" onClick={() => rate(item, "loved")} title="Loved it" aria-label={`Mark ${item.movie.title} as loved`}>
                          <Heart size={18} />
                        </button>
                        <button type="button" onClick={() => rate(item, "fine")} title="It was fine" aria-label={`Mark ${item.movie.title} as fine`}>
                          <Meh size={18} />
                        </button>
                        <button type="button" onClick={() => rate(item, "disliked")} title="Not for me" aria-label={`Mark ${item.movie.title} as not for me`}>
                          <ThumbsDown size={18} />
                        </button>
                        <button type="button" onClick={() => hide(item)} title="Hide" aria-label={`Hide ${item.movie.title}`}>
                          <EyeOff size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
