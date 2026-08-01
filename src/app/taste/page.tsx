"use client";

import { useCallback, useEffect, useState } from "react";
import type { Movie, Rating, Verdict } from "@/lib/types";
import { ComparisonPrompt } from "@/components/ComparisonPrompt";
import { RecommendationsPanel } from "@/components/RecommendationsPanel";
import { TasteDiagnostics } from "@/components/TasteDiagnostics";
import { TasteSummaryPanel } from "@/components/TasteSummaryPanel";
import { WatchlistPanel } from "@/components/WatchlistPanel";

const MAX_COMPARISON_ROUNDS = 3;

interface PlacementState {
  done: boolean;
  rankScore: number | null;
  opponentTmdbId: number | null;
  round: number;
  bucketSize: number;
}

interface VerdictResponse {
  rating: Rating;
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

export default function TastePage() {
  const [ratingsVersion, setRatingsVersion] = useState(0);
  const [comparison, setComparison] = useState<ComparisonSession | null>(null);
  const [comparisonBusy, setComparisonBusy] = useState(false);

  // Slim verdict flow for rating outside the deck: submit, then run the
  // placement comparison rounds in the same modal the deck uses.
  const rateMovie = useCallback(async (movie: Movie, verdict: Verdict) => {
    const response = await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId: movie.tmdbId, verdict })
    });
    if (!response.ok) return;
    const data = (await response.json()) as VerdictResponse;
    setRatingsVersion((current) => current + 1);
    if (data.placement && !data.placement.done && data.opponent) {
      setComparison({ movie, opponent: data.opponent, verdict, steps: [], round: data.placement.round });
    }
  }, []);

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
        if (data.rating) setRatingsVersion((current) => current + 1);
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setComparison(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="taste-page">
      <div className="taste-page-heading">
        <p className="eyebrow">Taste</p>
        <h1>Your taste &amp; picks</h1>
      </div>

      <div className="taste-page-grid">
        <div className="taste-page-summary">
          <TasteSummaryPanel />
          <TasteDiagnostics />
        </div>
        <div className="taste-page-main">
          <RecommendationsPanel ratingsVersion={ratingsVersion} onRate={rateMovie} />
        </div>
      </div>

      <WatchlistPanel version={ratingsVersion} onRate={rateMovie} />

      {comparison && (
        <ComparisonPrompt
          movie={comparison.movie}
          opponent={comparison.opponent}
          verdict={comparison.verdict}
          round={comparison.round}
          maxRounds={MAX_COMPARISON_ROUNDS}
          busy={comparisonBusy}
          onPick={(preferredNew) => void pickComparison(preferredNew)}
          onSkip={() => setComparison(null)}
        />
      )}
    </div>
  );
}
