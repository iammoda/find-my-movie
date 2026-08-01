"use client";

import { X } from "lucide-react";
import type { Movie, Verdict } from "@/lib/types";
import { MoviePoster } from "@/components/MoviePoster";

interface ComparisonPromptProps {
  movie: Movie;
  opponent: Movie;
  verdict: Verdict;
  round: number;
  maxRounds: number;
  busy?: boolean;
  onPick: (preferredNew: boolean) => void;
  onSkip: () => void;
}

function promptCopy(verdict: Verdict) {
  if (verdict === "disliked") return "Which did you dislike less?";
  return "Which did you prefer?";
}

export function ComparisonPrompt({ movie, opponent, verdict, round, maxRounds, busy, onPick, onSkip }: ComparisonPromptProps) {
  return (
    <div className="reason-modal-scrim" role="presentation" onClick={onSkip}>
      <section
        className="reason-modal comparison-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="comparison-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="reason-modal-content">
          <button type="button" className="modal-close" onClick={onSkip} aria-label="Skip comparisons" disabled={busy}>
            <X size={18} />
          </button>
          <p className="eyebrow">
            Placing it for you · {Math.min(round + 1, maxRounds)}/{maxRounds}
          </p>
          <h2 id="comparison-modal-title">{promptCopy(verdict)}</h2>
          <div className="comparison-pair" aria-label="Pick the movie you preferred">
            <button
              type="button"
              className="comparison-option"
              onClick={() => onPick(true)}
              disabled={busy}
              aria-label={`I preferred ${movie.title}`}
            >
              <div className="comparison-poster">
                <MoviePoster movie={movie} />
              </div>
            </button>
            <span className="comparison-vs" aria-hidden>
              vs
            </span>
            <button
              type="button"
              className="comparison-option"
              onClick={() => onPick(false)}
              disabled={busy}
              aria-label={`I preferred ${opponent.title}`}
            >
              <div className="comparison-poster">
                <MoviePoster movie={opponent} />
              </div>
            </button>
          </div>
          <div className="reason-modal-actions">
            <button type="button" className="secondary-button" onClick={onSkip} disabled={busy}>
              Skip - place it for me
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
