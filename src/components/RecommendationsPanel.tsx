"use client";

import { EyeOff, Heart, History, Meh, RefreshCcw, Sparkles, ThumbsDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Genre, Movie, RecommendationItem, RecommendationRun, Verdict } from "@/lib/types";
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
  cached?: boolean;
  stale?: boolean;
  generatedAt?: string | null;
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

function relativeTime(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function RecommendationsPanel({ ratingsVersion, onRate }: RecommendationsPanelProps) {
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [genreInput, setGenreInput] = useState("");
  const [genreError, setGenreError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<RecommendationRun[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const autoLoaded = useRef(false);

  const load = async (options: { fresh?: boolean } = {}) => {
    const fresh = Boolean(options.fresh);
    if (fresh) setRegenerating(true);
    else setLoading(true);
    setGenreError(null);
    try {
      const params = new URLSearchParams({ ratingsVersion: String(ratingsVersion) });
      if (genreInput.trim()) params.set("genre", genreInput.trim());
      if (fresh) params.set("fresh", "1");
      const response = await fetch(`/api/recommendations?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setGenreError(payload.error ?? "Could not generate recommendations.");
        return;
      }
      setData(payload);
      // The old list just moved into history; refetch it if the panel is open.
      if (fresh && historyOpen) void loadHistory();
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/recommendations/history", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { runs: RecommendationRun[] };
      setHistory(payload.runs);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = () => {
    setHistoryOpen((open) => {
      const next = !open;
      if (next && history === null) void loadHistory();
      return next;
    });
  };

  // Show the last run immediately: the server reuses the stored run when no
  // new ratings landed, so this mount fetch is cheap.
  useEffect(() => {
    if (autoLoaded.current) return;
    autoLoaded.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const busy = loading || regenerating;

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
              if (event.key === "Enter" && !busy) load();
            }}
          />
          <datalist id="recommendation-genres">
            {genresForMedia("movie").map((genre) => (
              <option key={genre.id} value={genre.name} />
            ))}
          </datalist>
          <button type="button" className="secondary-button" onClick={() => load()} disabled={busy} title="Reload the current list">
            <RefreshCcw size={16} />
            {loading ? "Checking" : "Refresh"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => load({ fresh: true })}
            disabled={busy}
            title="Generate a completely new list; the current one moves to history"
          >
            <Sparkles size={16} />
            {regenerating ? "Generating" : "New list"}
          </button>
        </div>
      </div>

      {genreError && <p className="notice">{genreError} Try one of: {genresForMedia("movie").map((genre) => genre.name).join(", ")}.</p>}

      {!data && !genreError && <p className="muted">{busy ? "Loading your recommendations…" : "Rate movies first, then generate a recommendation run."}</p>}

      {data && !data.ready && (
        <p className="muted">
          Recommendations unlock after more signal. You have {data.readiness.total} ratings and {data.readiness.positives} positive ratings.
          Need {data.readiness.neededRatings} more rating{data.readiness.neededRatings === 1 ? "" : "s"} and{" "}
          {data.readiness.neededPositiveRatings} more positive rating{data.readiness.neededPositiveRatings === 1 ? "" : "s"}.
        </p>
      )}

      {data?.ready && (
        <>
          {data.generatedAt && (
            <p className="muted recommendation-freshness">
              Generated {relativeTime(data.generatedAt)}
              {data.cached && !data.stale ? " · up to date with your ratings" : ""}
              {data.stale ? " · new ratings since - hit New list to rebuild" : ""}
              {data.recommendations.length > 0 ? ` · ${data.recommendations.length} pick${data.recommendations.length === 1 ? "" : "s"} cleared your quality bar` : ""}
            </p>
          )}
          {data.fallback && <p className="notice">Fallback ranking is active because taste scoring was unavailable.</p>}
          {data.recommendations.length === 0 && (
            <p className="muted">
              {data.genre
                ? `Nothing clears your quality bar for ${data.genre.name} right now. Try another genre or rate more movies.`
                : "Nothing clears your quality bar right now. Rate more movies to add signal, or try New list again later as the catalog grows."}
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

          <div className="recommendation-history">
            <button type="button" className="secondary-button" onClick={toggleHistory} aria-expanded={historyOpen}>
              <History size={16} />
              {historyOpen ? "Hide previous lists" : "Previous lists"}
            </button>
            {historyOpen && (
              <div className="recommendation-history-runs">
                {historyLoading && <p className="muted">Loading previous lists…</p>}
                {!historyLoading && history && history.length <= 1 && <p className="muted">No previous lists yet - hit New list to start one.</p>}
                {!historyLoading &&
                  history &&
                  history.slice(1).map((run) => (
                    <details className="recommendation-history-run" key={run.id}>
                      <summary>
                        Generated {relativeTime(run.createdAt)} · {run.items.length} pick{run.items.length === 1 ? "" : "s"}
                      </summary>
                      <ul>
                        {run.items.map((item) => (
                          <li key={item.id}>
                            <span className="history-title">{item.movie.title}</span>
                            <span className="history-year">{item.movie.releaseDate?.slice(0, 4) ?? ""}</span>
                            {item.scoreBreakdown.predictedRankScore != null && (
                              <span className="history-score">{item.scoreBreakdown.predictedRankScore.toFixed(1)}/10</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
