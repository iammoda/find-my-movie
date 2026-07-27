"use client";

import { Check, Heart, Meh, RefreshCcw, ThumbsDown, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Movie, Verdict, WatchlistItem } from "@/lib/types";
import { MoviePoster } from "@/components/MoviePoster";

interface WatchlistEntry extends WatchlistItem {
  movie: Movie;
}

interface WatchlistResponse {
  watchlist: WatchlistEntry[];
}

interface WatchlistPanelProps {
  version: number;
  onRate: (movie: Movie, verdict: Verdict) => Promise<void>;
}

export function WatchlistPanel({ version, onRate }: WatchlistPanelProps) {
  const [items, setItems] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/watchlist", { cache: "no-store" });
      const data = (await response.json()) as WatchlistResponse;
      setItems((data.watchlist ?? []).filter((entry) => entry.status === "queued"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const setStatus = useCallback(async (tmdbId: number, status: "watched" | "abandoned") => {
    await fetch("/api/watchlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId, status })
    });
  }, []);

  const watched = useCallback(
    async (entry: WatchlistEntry, verdict: Verdict) => {
      setBusyId(entry.tmdbId);
      try {
        await setStatus(entry.tmdbId, "watched");
        await onRate(entry.movie, verdict);
        setItems((current) => current.filter((item) => item.tmdbId !== entry.tmdbId));
      } finally {
        setBusyId(null);
      }
    },
    [onRate, setStatus]
  );

  const abandon = useCallback(
    async (entry: WatchlistEntry) => {
      setBusyId(entry.tmdbId);
      try {
        await setStatus(entry.tmdbId, "abandoned");
        setItems((current) => current.filter((item) => item.tmdbId !== entry.tmdbId));
      } finally {
        setBusyId(null);
      }
    },
    [setStatus]
  );

  const remove = useCallback(async (tmdbId: number) => {
    setBusyId(tmdbId);
    try {
      await fetch(`/api/watchlist?tmdbId=${tmdbId}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.tmdbId !== tmdbId));
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <section className="watchlist-section" aria-labelledby="watchlist-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your watchlist</p>
          <h2 id="watchlist-heading">Seen anything? Rate it.</h2>
        </div>
        <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>
          <RefreshCcw size={16} />
          {loading ? "Loading" : "Refresh"}
        </button>
      </div>

      {!items.length && <p className="muted">Swipe right on movies you want to watch and they will show up here for a post-watch check-in.</p>}

      {items.length > 0 && (
        <div className="watchlist-grid">
          {items.map((entry) => {
            const busy = busyId === entry.tmdbId;
            const year = entry.movie.releaseDate?.slice(0, 4);
            return (
              <article className="watchlist-card" key={entry.tmdbId}>
                <div className="watchlist-poster">
                  <MoviePoster movie={entry.movie} />
                </div>
                <div className="watchlist-body">
                  <p className="recommendation-meta">{[year, entry.movie.genres.slice(0, 2).map((genre) => genre.name).join(", ")].filter(Boolean).join(" · ")}</p>
                  <h3>{entry.movie.title}</h3>
                  <p className="watchlist-prompt">Watched it? How was it?</p>
                  <div className="watchlist-actions" aria-label={`Rate ${entry.movie.title} after watching`}>
                    <button type="button" onClick={() => void watched(entry, "loved")} disabled={busy} title="Loved it" aria-label={`Loved ${entry.movie.title}`}>
                      <Heart size={18} />
                    </button>
                    <button type="button" onClick={() => void watched(entry, "fine")} disabled={busy} title="It was fine" aria-label={`${entry.movie.title} was fine`}>
                      <Meh size={18} />
                    </button>
                    <button type="button" onClick={() => void watched(entry, "disliked")} disabled={busy} title="Not for me" aria-label={`${entry.movie.title} not for me`}>
                      <ThumbsDown size={18} />
                    </button>
                    <button type="button" className="watchlist-secondary" onClick={() => void abandon(entry)} disabled={busy} title="Didn't finish" aria-label={`Didn't finish ${entry.movie.title}`}>
                      <X size={18} />
                    </button>
                    <button type="button" className="watchlist-secondary" onClick={() => void remove(entry.tmdbId)} disabled={busy} title="Remove from watchlist" aria-label={`Remove ${entry.movie.title} from watchlist`}>
                      <Check size={18} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
