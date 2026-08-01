"use client";

import { Heart, Meh, Search, ThumbsDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MediaType, Movie, Rating, Verdict } from "@/lib/types";
import { MoviePoster } from "@/components/MoviePoster";
import { verdictLabel } from "@/lib/rating";

interface SearchResponse {
  movies: Movie[];
}

interface TasteSeedPanelProps {
  meaningfulRatingCount: number;
  ratings: Map<number, Rating>;
  mediaType?: MediaType;
  onRate: (movie: Movie, verdict: Verdict) => Promise<void>;
  onClearRating: (movie: Movie) => Promise<void>;
}

export function TasteSeedPanel({ meaningfulRatingCount, ratings, mediaType = "movie", onRate, onClearRating }: TasteSeedPanelProps) {
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const searchRequestId = useRef(0);
  const seedMode = meaningfulRatingCount < 5;

  useEffect(() => {
    const nextQuery = query.trim();
    searchRequestId.current += 1;
    const requestId = searchRequestId.current;

    if (nextQuery.length < 2) {
      setMovies([]);
      setMessage(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/movies/search?q=${encodeURIComponent(nextQuery)}&mediaType=${mediaType}`, {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Search failed");
        const data = (await response.json()) as SearchResponse;
        if (searchRequestId.current !== requestId) return;
        setMovies(data.movies);
        setMessage(data.movies.length ? null : "No matches found.");
      } catch {
        if (controller.signal.aborted || searchRequestId.current !== requestId) return;
        setMovies([]);
        setMessage("Search failed.");
      } finally {
        if (searchRequestId.current === requestId) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, mediaType]);

  const rate = async (movie: Movie, verdict: Verdict) => {
    const existing = ratings.get(movie.tmdbId);
    if (existing?.verdict === verdict) {
      await onClearRating(movie);
      setMessage(`${movie.title} cleared.`);
      return;
    }

    await onRate(movie, verdict);
    setMessage(existing ? `${movie.title} updated.` : `${movie.title} saved.`);
  };

  const clearSearch = () => {
    searchRequestId.current += 1;
    setQuery("");
    setMovies([]);
    setMessage(null);
    setLoading(false);
  };

  return (
    <section className={`taste-seed-panel ${seedMode ? "is-seed-mode" : ""}`} aria-labelledby="taste-seed-heading">
      <div className="taste-seed-heading">
        <div>
          <p className="eyebrow">{seedMode ? "Seed your taste" : "Add a movie"}</p>
          <h2 id="taste-seed-heading">Search favorites</h2>
        </div>
      </div>

      <div className="movie-search-form" role="search" aria-label="Search favorite movies">
        <div className="search-input-shell">
          <Search size={18} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            aria-label="Search a movie"
            placeholder="Search a movie"
          />
          {query && (
            <button type="button" className="search-clear-button" onClick={clearSearch} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {(message || loading) && <p className="seed-message">{loading ? "Searching..." : message}</p>}

      {movies.length > 0 && (
        <div className="search-results" aria-label="Search results">
          {movies.map((movie) => {
            const existing = ratings.get(movie.tmdbId);
            const year = movie.releaseDate?.slice(0, 4);
            return (
              <article className="search-result-card" key={movie.tmdbId}>
                <div className="search-result-poster">
                  <MoviePoster movie={movie} />
                </div>
                <div className="search-result-copy">
                  <p className="recommendation-meta">{[year, movie.genres.slice(0, 2).map((genre) => genre.name).join(", ")].filter(Boolean).join(" · ")}</p>
                  <h3>{movie.title}</h3>
                  <p>{movie.overview || "No synopsis available."}</p>
                  {existing?.verdict && (
                    <span className="saved-rating">
                      {verdictLabel(existing.verdict)}
                      {existing.rankScore != null ? ` · ${existing.rankScore.toFixed(1)}/10` : ""}
                    </span>
                  )}
                </div>
                <div className="manual-rating-actions" aria-label={`Rate ${movie.title}`}>
                  <button
                    type="button"
                    className={existing?.verdict === "loved" ? "is-selected" : undefined}
                    onClick={() => rate(movie, "loved")}
                    title="Loved it"
                    aria-label={existing?.verdict === "loved" ? `Clear loved for ${movie.title}` : `Mark ${movie.title} as loved`}
                    aria-pressed={existing?.verdict === "loved"}
                  >
                    <Heart size={18} />
                  </button>
                  <button
                    type="button"
                    className={existing?.verdict === "fine" ? "is-selected" : undefined}
                    onClick={() => rate(movie, "fine")}
                    title="It was fine"
                    aria-label={existing?.verdict === "fine" ? `Clear fine for ${movie.title}` : `Mark ${movie.title} as fine`}
                    aria-pressed={existing?.verdict === "fine"}
                  >
                    <Meh size={18} />
                  </button>
                  <button
                    type="button"
                    className={existing?.verdict === "disliked" ? "is-selected" : undefined}
                    onClick={() => rate(movie, "disliked")}
                    title="Not for me"
                    aria-label={existing?.verdict === "disliked" ? `Clear disliked for ${movie.title}` : `Mark ${movie.title} as not for me`}
                    aria-pressed={existing?.verdict === "disliked"}
                  >
                    <ThumbsDown size={18} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
