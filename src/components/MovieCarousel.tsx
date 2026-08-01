"use client";

import { Info, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppealSignal, AppealSignalValue, MediaType, Movie, MovieExposure, Rating, Verdict } from "@/lib/types";
import { ComparisonPrompt } from "@/components/ComparisonPrompt";
import { MoviePoster } from "@/components/MoviePoster";
import { RatingControls } from "@/components/RatingControls";
import { SignInPrompt } from "@/components/SignInPrompt";
import { TasteSeedPanel } from "@/components/TasteSeedPanel";
import { posterUrl } from "@/lib/taste";

interface BrowseResponse {
  movies: Movie[];
}

interface PointerStart {
  x: number;
  y: number;
  at: number;
}

interface HistoryEntry {
  movie: Movie;
  previousRating: Rating | null;
  kind: "verdict" | "appeal" | "not_seen";
}

interface PlacementState {
  done: boolean;
  rankScore: number | null;
  opponentTmdbId: number | null;
  round: number;
  bucketSize: number;
}

interface VerdictResponse {
  rating: Rating;
  previousRating?: Rating | null;
  placement?: PlacementState;
  opponent?: Movie | null;
}

interface ComparisonResponse {
  placement: PlacementState;
  rating: Rating | null;
  opponent: Movie | null;
}

interface ComparisonStep {
  opponentTmdbId: number;
  preferredNew: boolean;
}

interface ComparisonSession {
  movie: Movie;
  opponent: Movie;
  verdict: Verdict;
  steps: ComparisonStep[];
  round: number;
}

interface ExposureContext {
  id: string;
  tmdbId: number;
  shownAt: number;
  flipped: boolean;
}

const MAX_COMPARISON_ROUNDS = 3;
/** Silently re-rank the remaining deck after this many verdicts so new cards reflect the updated model. */
const REPLAN_VERDICT_INTERVAL = 8;

/**
 * @param canRate false when accounts are enabled and the visitor is signed
 * out: browsing works, but rating actions redirect to login and no personal
 * signals (ratings, exposures, appeal) are read or written.
 * @param mediaType which catalog the deck draws from (movies or TV shows).
 */
export function MovieCarousel({ canRate = true, mediaType = "movie" }: { canRate?: boolean; mediaType?: MediaType }) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deckExhausted, setDeckExhausted] = useState(false);
  const [ratings, setRatings] = useState<Map<number, Rating>>(new Map());
  const [notSeenIds, setNotSeenIds] = useState<Set<number>>(new Set());
  const [appealIds, setAppealIds] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailMovie, setDetailMovie] = useState<Movie | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comparison, setComparison] = useState<ComparisonSession | null>(null);
  const [comparisonBusy, setComparisonBusy] = useState(false);
  // Guests see the sign-in prompt once on load, and again on rating attempts.
  const [signInPromptOpen, setSignInPromptOpen] = useState(!canRate);
  const pointerStart = useRef<PointerStart | null>(null);
  const browseRequestId = useRef(0);
  const handledIdsRef = useRef<Set<number>>(new Set());
  const exposureRef = useRef<ExposureContext | null>(null);
  const indexRef = useRef(0);
  const verdictsSinceLoadRef = useRef(0);

  const currentMovie = movies[index] ?? null;
  const displayMovie = detailMovie?.tmdbId === currentMovie?.tmdbId ? detailMovie : currentMovie;
  const nextMovies = movies.slice(index + 1, index + 4);
  const meaningfulRatingCount = useMemo(() => {
    return [...ratings.values()].filter((rating) => (rating.verdict ? true : rating.rating !== "skip")).length;
  }, [ratings]);
  const cinematicBackdrop = posterUrl(currentMovie?.backdropPath ?? currentMovie?.posterPath ?? null, "w780");

  const filterUnhandledMovies = useCallback((items: Movie[]) => {
    return items.filter((movie) => !handledIdsRef.current.has(movie.tmdbId));
  }, []);

  /** Signed-out visitors get the sign-in prompt the moment they try to rate. */
  const promptSignIn = useCallback(() => {
    setSignInPromptOpen(true);
  }, []);

  const removeMovieFromDeck = useCallback((tmdbId: number) => {
    setMovies((current) => {
      const removedIndex = current.findIndex((movie) => movie.tmdbId === tmdbId);
      const next = current.filter((movie) => movie.tmdbId !== tmdbId);
      setIndex((currentIndex) => {
        if (removedIndex !== -1 && removedIndex < currentIndex) return Math.max(0, currentIndex - 1);
        return Math.min(currentIndex, Math.max(next.length - 1, 0));
      });
      return next;
    });
  }, []);

  const loadRatings = useCallback(async () => {
    const response = await fetch("/api/ratings", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { ratings: Rating[] };
    setRatings(new Map(data.ratings.map((rating) => [rating.tmdbId, rating])));
  }, []);

  const loadNotSeen = useCallback(async () => {
    const response = await fetch("/api/exposures", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { exposures: MovieExposure[] };
    setNotSeenIds(new Set(data.exposures.filter((exposure) => exposure.source === "not_seen").map((exposure) => exposure.tmdbId)));
  }, []);

  const loadAppealSignals = useCallback(async () => {
    const response = await fetch("/api/appeal-signals", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { appealSignals: AppealSignal[] };
    setAppealIds(new Set(data.appealSignals.map((signal) => signal.tmdbId)));
  }, []);

  const loadMovies = useCallback(async () => {
    const requestId = browseRequestId.current + 1;
    browseRequestId.current = requestId;
    setLoading(true);
    setLoadError(null);
    setDeckExhausted(false);
    verdictsSinceLoadRef.current = 0;
    try {
      const params = new URLSearchParams({ category: "taste_test", mediaType });
      const response = await fetch(`/api/movies/browse?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Browse failed with ${response.status}`);
      const data = (await response.json()) as BrowseResponse;
      if (browseRequestId.current !== requestId) return;
      const nextMovies = filterUnhandledMovies(data.movies);
      setMovies(nextMovies);
      setDeckExhausted(nextMovies.length === 0);
      setIndex(0);
    } catch (error) {
      if (browseRequestId.current !== requestId) return;
      setMovies([]);
      setLoadError(error instanceof Error ? error.message : "Could not load movies.");
    } finally {
      if (browseRequestId.current === requestId) setLoading(false);
    }
  }, [filterUnhandledMovies, mediaType]);

  /**
   * Background deck re-rank: keeps the card the user is looking at, replaces
   * the tail with a fresh model-driven queue. No loading state, no UI jump.
   */
  const replanDeck = useCallback(async () => {
    const requestId = browseRequestId.current + 1;
    browseRequestId.current = requestId;
    try {
      const params = new URLSearchParams({ category: "taste_test", mediaType });
      const response = await fetch(`/api/movies/browse?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as BrowseResponse;
      if (browseRequestId.current !== requestId) return;
      const nextMovies = filterUnhandledMovies(data.movies);
      if (!nextMovies.length) return;
      setMovies((current) => {
        const currentCard = current[indexRef.current];
        if (!currentCard) return nextMovies;
        return [currentCard, ...nextMovies.filter((movie) => movie.tmdbId !== currentCard.tmdbId)];
      });
      setIndex(0);
    } catch {
      // Silent: the existing deck keeps working; the next full load recovers.
    }
  }, [filterUnhandledMovies, mediaType]);

  const noteVerdictForReplan = useCallback(() => {
    verdictsSinceLoadRef.current += 1;
    if (verdictsSinceLoadRef.current >= REPLAN_VERDICT_INTERVAL) {
      verdictsSinceLoadRef.current = 0;
      void replanDeck();
    }
  }, [replanDeck]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (!canRate) return;
    void loadRatings();
    void loadNotSeen();
    void loadAppealSignals();
  }, [canRate, loadRatings, loadNotSeen, loadAppealSignals]);

  useEffect(() => {
    void loadMovies();
  }, [loadMovies]);

  useEffect(() => {
    if (loading || loadError || deckExhausted || movies.length > 0) return;
    void loadMovies();
  }, [deckExhausted, loadError, loadMovies, loading, movies.length]);

  useEffect(() => {
    handledIdsRef.current = new Set([...ratings.keys(), ...notSeenIds, ...appealIds]);
    setMovies((current) => {
      const next = current.filter((movie) => !handledIdsRef.current.has(movie.tmdbId));
      if (next.length !== current.length) {
        setIndex((currentIndex) => Math.min(currentIndex, Math.max(next.length - 1, 0)));
      }
      return next;
    });
  }, [ratings, notSeenIds, appealIds]);

  useEffect(() => {
    if (!currentMovie) return;
    setDetailsOpen(false);
    setDetailMovie(null);
    exposureRef.current = null;
    if (!canRate) return; // guests browse without leaving impression logs
    void (async () => {
      const response = await fetch("/api/exposures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: currentMovie.tmdbId,
          source: "taste_test",
          sourceDetail: "verdict-deck"
        })
      });
      if (!response.ok) return;
      const data = (await response.json()) as { exposure?: MovieExposure };
      if (data.exposure) {
        exposureRef.current = { id: data.exposure.id, tmdbId: currentMovie.tmdbId, shownAt: Date.now(), flipped: false };
      }
    })();
  }, [canRate, currentMovie]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (comparison) setComparison(null);
      else setDetailsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [comparison]);

  /** Flush passive behavior (decision latency, card flip) for the current card. */
  const flushBehavior = useCallback((tmdbId: number) => {
    const context = exposureRef.current;
    if (!context || context.tmdbId !== tmdbId) return;
    exposureRef.current = null;
    const elapsed = Math.min(10 * 60 * 1000, Date.now() - context.shownAt);
    void fetch("/api/exposures", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exposureId: context.id,
        dwellMs: elapsed,
        decisionMs: elapsed,
        flipped: context.flipped
      })
    });
  }, []);

  const beginComparisonIfNeeded = useCallback((movie: Movie, verdict: Verdict, placement?: PlacementState, opponent?: Movie | null) => {
    if (!placement || placement.done || !opponent) return;
    setComparison({ movie, opponent, verdict, steps: [], round: placement.round });
  }, []);

  const submitVerdict = useCallback(
    async (movie: Movie, verdict: Verdict): Promise<VerdictResponse> => {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: movie.tmdbId, verdict })
      });
      const data = (await response.json()) as VerdictResponse;
      setRatings((current) => new Map(current).set(movie.tmdbId, data.rating));
      return data;
    },
    []
  );

  const rateMovie = useCallback(
    async (verdict: Verdict, movie = currentMovie) => {
      if (!movie) return;
      if (!canRate) {
        promptSignIn();
        return;
      }
      flushBehavior(movie.tmdbId);
      const previousRating = ratings.get(movie.tmdbId) ?? null;
      setHistory((current) => [...current.slice(-19), { movie, previousRating, kind: "verdict" }]);
      setDetailsOpen(false);
      removeMovieFromDeck(movie.tmdbId);
      const data = await submitVerdict(movie, verdict);
      beginComparisonIfNeeded(movie, verdict, data.placement, data.opponent);
      noteVerdictForReplan();
    },
    [beginComparisonIfNeeded, canRate, currentMovie, flushBehavior, noteVerdictForReplan, ratings, promptSignIn, removeMovieFromDeck, submitVerdict]
  );

  const recordAppeal = useCallback(
    async (signal: AppealSignalValue, movie = currentMovie) => {
      if (!movie) return;
      if (!canRate) {
        promptSignIn();
        return;
      }
      flushBehavior(movie.tmdbId);
      setHistory((current) => [...current.slice(-19), { movie, previousRating: null, kind: "appeal" }]);
      setDetailsOpen(false);
      setAppealIds((current) => new Set(current).add(movie.tmdbId));
      removeMovieFromDeck(movie.tmdbId);
      await fetch("/api/appeal-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: movie.tmdbId, signal })
      });
    },
    [canRate, currentMovie, flushBehavior, promptSignIn, removeMovieFromDeck]
  );

  const markNotSeen = useCallback(
    async (movie = currentMovie) => {
      if (!movie) return;
      if (!canRate) {
        promptSignIn();
        return;
      }
      flushBehavior(movie.tmdbId);
      setHistory((current) => [...current.slice(-19), { movie, previousRating: null, kind: "not_seen" }]);
      await fetch("/api/exposures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: movie.tmdbId,
          source: "not_seen",
          sourceDetail: "verdict-deck-control"
        })
      });
      setNotSeenIds((current) => new Set(current).add(movie.tmdbId));
      setDetailsOpen(false);
      removeMovieFromDeck(movie.tmdbId);
    },
    [canRate, currentMovie, flushBehavior, promptSignIn, removeMovieFromDeck]
  );

  const rateManualMovie = useCallback(
    async (movie: Movie, verdict: Verdict) => {
      if (!canRate) {
        promptSignIn();
        return;
      }
      await fetch("/api/exposures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: movie.tmdbId,
          source: "manual_search",
          sourceDetail: "search-input"
        })
      });
      const previousRating = ratings.get(movie.tmdbId) ?? null;
      setHistory((current) => [...current.slice(-19), { movie, previousRating, kind: "verdict" }]);
      removeMovieFromDeck(movie.tmdbId);
      const data = await submitVerdict(movie, verdict);
      beginComparisonIfNeeded(movie, verdict, data.placement, data.opponent);
      await loadMovies();
    },
    [beginComparisonIfNeeded, canRate, loadMovies, ratings, promptSignIn, removeMovieFromDeck, submitVerdict]
  );

  const pickComparison = useCallback(
    async (preferredNew: boolean) => {
      if (!comparison || comparisonBusy) return;
      setComparisonBusy(true);
      try {
        const steps = [...comparison.steps, { opponentTmdbId: comparison.opponent.tmdbId, preferredNew }];
        const response = await fetch("/api/comparisons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tmdbId: comparison.movie.tmdbId, comparisons: steps })
        });
        if (!response.ok) {
          setComparison(null);
          return;
        }
        const data = (await response.json()) as ComparisonResponse;
        if (data.rating) {
          const rated = data.rating;
          setRatings((current) => new Map(current).set(rated.tmdbId, rated));
        }
        if (data.placement.done || !data.opponent) {
          setComparison(null);
        } else {
          setComparison({ ...comparison, opponent: data.opponent, steps, round: data.placement.round });
        }
      } finally {
        setComparisonBusy(false);
      }
    },
    [comparison, comparisonBusy]
  );

  const skipComparison = useCallback(() => {
    setComparison(null);
  }, []);

  const clearManualRating = useCallback(
    async (movie: Movie) => {
      await fetch(`/api/ratings?tmdbId=${movie.tmdbId}`, { method: "DELETE" });
      setRatings((current) => {
        const next = new Map(current);
        next.delete(movie.tmdbId);
        return next;
      });
      setComparison((current) => (current?.movie.tmdbId === movie.tmdbId ? null : current));
      await loadMovies();
    },
    [loadMovies]
  );

  const undo = useCallback(async () => {
    const last = history.at(-1);
    if (!last) return;

    setHistory((current) => current.slice(0, -1));
    setComparison((current) => (current?.movie.tmdbId === last.movie.tmdbId ? null : current));

    if (last.kind === "not_seen") {
      await fetch(`/api/exposures?tmdbId=${last.movie.tmdbId}`, { method: "DELETE" });
      setNotSeenIds((current) => {
        const next = new Set(current);
        next.delete(last.movie.tmdbId);
        return next;
      });
      setMovies((current) => (current.some((movie) => movie.tmdbId === last.movie.tmdbId) ? current : [last.movie, ...current]));
      setIndex(0);
      return;
    }

    if (last.kind === "appeal") {
      await fetch(`/api/appeal-signals?tmdbId=${last.movie.tmdbId}`, { method: "DELETE" });
      setAppealIds((current) => {
        const next = new Set(current);
        next.delete(last.movie.tmdbId);
        return next;
      });
      setMovies((current) => (current.some((movie) => movie.tmdbId === last.movie.tmdbId) ? current : [last.movie, ...current]));
      setIndex(0);
      return;
    }

    if (last.previousRating) {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: last.movie.tmdbId,
          rating: last.previousRating.rating,
          verdict: last.previousRating.verdict ?? null,
          rankScore: last.previousRating.rankScore ?? null
        })
      });
      const data = (await response.json()) as { rating: Rating };
      setRatings((current) => new Map(current).set(last.movie.tmdbId, data.rating));
    } else {
      await fetch(`/api/ratings?tmdbId=${last.movie.tmdbId}`, { method: "DELETE" });
      setRatings((current) => {
        const next = new Map(current);
        next.delete(last.movie.tmdbId);
        return next;
      });
      setMovies((current) => (current.some((movie) => movie.tmdbId === last.movie.tmdbId) ? current : [last.movie, ...current]));
      setIndex(0);
    }
  }, [history]);

  const openDetails = useCallback(async (movie: Movie) => {
    setDetailsOpen(true);
    setDetailMovie(movie);
    setDetailLoading(true);
    if (exposureRef.current?.tmdbId === movie.tmdbId) {
      exposureRef.current = { ...exposureRef.current, flipped: true };
    }
    try {
      const response = await fetch(`/api/movies/${movie.tmdbId}`, { cache: "no-store" });
      const data = (await response.json()) as { movie: Movie };
      if (data.movie) setDetailMovie(data.movie);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const onPointerDown = (event: React.PointerEvent) => {
    pointerStart.current = { x: event.clientX, y: event.clientY, at: Date.now() };
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (!pointerStart.current || !currentMovie) return;
    const dx = event.clientX - pointerStart.current.x;
    const dy = event.clientY - pointerStart.current.y;
    const distance = Math.hypot(dx, dy);
    pointerStart.current = null;

    if (detailsOpen) return;
    if (dx > 80 && Math.abs(dx) > Math.abs(dy)) void recordAppeal("want_to_watch");
    else if (dx < -80 && Math.abs(dx) > Math.abs(dy)) void recordAppeal("not_interested");
    else if (distance < 12) void openDetails(currentMovie);
  };

  return (
    <div className="carousel-page" suppressHydrationWarning>
      {cinematicBackdrop && <div className="cinematic-backdrop" style={{ backgroundImage: `url(${cinematicBackdrop})` }} aria-hidden />}
      <section className="carousel-workspace" aria-labelledby="carousel-heading">
        <div className="carousel-heading">
          <div>
            <p className="eyebrow">Taste ranking</p>
            <h1 id="carousel-heading">Rate movies fast</h1>
          </div>
        </div>

        <div className="taste-stream-chip" aria-label="How to rate">
          Seen it? Use the buttons. Haven&apos;t? Swipe right to watchlist, left to pass.
        </div>

        <TasteSeedPanel meaningfulRatingCount={meaningfulRatingCount} ratings={ratings} mediaType={mediaType} onRate={rateManualMovie} onClearRating={clearManualRating} />

        <div className="deck-zone">
          {loading && <div className="deck-placeholder">Loading movies...</div>}
          {!loading && loadError && (
            <div className="deck-placeholder">
              <div className="deck-placeholder-copy">
                <strong>Could not load movies.</strong>
                <span>{loadError}</span>
                <button type="button" className="secondary-button" onClick={() => void loadMovies()}>
                  Retry
                </button>
              </div>
            </div>
          )}
          {!loading && !loadError && !currentMovie && (
            <div className="deck-placeholder">
              <div className="deck-placeholder-copy">
                <strong>No more movies in this batch.</strong>
                <span>Refresh the deck for more unrated movies.</span>
                <button type="button" className="secondary-button" onClick={() => void loadMovies()}>
                  Check for more
                </button>
              </div>
            </div>
          )}
          {currentMovie && displayMovie && (
            <article className={`movie-card ${detailsOpen ? "is-flipped" : ""}`} aria-label={currentMovie.title}>
              <div className="flip-shell">
                <div className="flip-card">
                  <button
                    type="button"
                    className="poster-button poster-front"
                    onPointerDown={onPointerDown}
                    onPointerUp={onPointerUp}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowRight") void recordAppeal("want_to_watch");
                      if (event.key === "ArrowLeft") void recordAppeal("not_interested");
                      if (event.key === "l" || event.key === "L") void rateMovie("loved");
                      if (event.key === "f" || event.key === "F") void rateMovie("fine");
                      if (event.key === "d" || event.key === "D") void rateMovie("disliked");
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openDetails(currentMovie);
                      }
                    }}
                    aria-label={`Open details for ${currentMovie.title}. Swipe right to watchlist, left to pass, or press L, F, or D to rate.`}
                  >
                    <MoviePoster movie={currentMovie} />
                  </button>
                  <section
                    className="poster-back"
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby="movie-detail-title"
                    aria-label={`Close details for ${displayMovie.title}`}
                    tabIndex={0}
                    onClick={() => setDetailsOpen(false)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDetailsOpen(false);
                      }
                    }}
                  >
                    {posterUrl(displayMovie.backdropPath ?? displayMovie.posterPath, "w780") && (
                      <div
                        className="poster-backdrop-art"
                        style={{ backgroundImage: `url(${posterUrl(displayMovie.backdropPath ?? displayMovie.posterPath, "w780")})` }}
                        aria-hidden
                      />
                    )}
                    <div className="poster-back-content">
                      <button type="button" className="modal-close" onClick={() => setDetailsOpen(false)} aria-label="Close details">
                        <X size={18} />
                      </button>
                      <p className="eyebrow">{displayMovie.releaseDate?.slice(0, 4) ?? "Unknown year"}</p>
                      <h2 id="movie-detail-title">{displayMovie.title}</h2>
                      <p className="detail-overview">{detailLoading ? "Loading details..." : displayMovie.overview || "No synopsis available."}</p>
                      <dl>
                        <div>
                          <dt>Director</dt>
                          <dd>{displayMovie.credits?.director ?? "Unknown"}</dd>
                        </div>
                        <div>
                          <dt>Actors</dt>
                          <dd>{displayMovie.credits?.actors.slice(0, 5).join(", ") || "Unknown"}</dd>
                        </div>
                      </dl>
                    </div>
                  </section>
                </div>
              </div>
              <div className="movie-meta">
                <div>
                  <h2>{currentMovie.title}</h2>
                  <p>
                    {currentMovie.releaseDate?.slice(0, 4) ?? "Unknown"} · {currentMovie.genres.slice(0, 2).map((genre) => genre.name).join(", ")}
                  </p>
                </div>
                <button type="button" className="meta-info-button" onClick={() => void openDetails(currentMovie)} aria-label={`Open details for ${currentMovie.title}`}>
                  <Info size={18} />
                </button>
              </div>
              <RatingControls onVerdict={(verdict) => void rateMovie(verdict)} onNotSeen={() => void markNotSeen()} onUndo={() => void undo()} canUndo={history.length > 0} />
            </article>
          )}
        </div>

        <div className="queue-preview" aria-label="Upcoming movies">
          {nextMovies.map((movie) => (
            <div className="queue-poster" key={movie.tmdbId}>
              <MoviePoster movie={movie} />
            </div>
          ))}
        </div>
      </section>

      {comparison && (
        <ComparisonPrompt
          movie={comparison.movie}
          opponent={comparison.opponent}
          verdict={comparison.verdict}
          round={comparison.round}
          maxRounds={MAX_COMPARISON_ROUNDS}
          busy={comparisonBusy}
          onPick={(preferredNew) => void pickComparison(preferredNew)}
          onSkip={skipComparison}
        />
      )}

      {!canRate && signInPromptOpen && <SignInPrompt onDismiss={() => setSignInPromptOpen(false)} />}
    </div>
  );
}
