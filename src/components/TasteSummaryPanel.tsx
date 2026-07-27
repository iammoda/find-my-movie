"use client";

import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface PersonAffinity {
  name: string;
  lovedCount: number;
  lovedTitles: string[];
}

interface TasteProfileResponse {
  ready: boolean;
  readiness: {
    total: number;
    positives: number;
    neededRatings: number;
    neededPositiveRatings: number;
  };
  sampleCount: number;
  verdictCounts: { loved: number; fine: number; disliked: number };
  topGenres: string[];
  clusters: Array<{ label: string; exemplars: string[]; size: number }>;
  directors: PersonAffinity[];
  actors: PersonAffinity[];
  drawnTo: string[];
  avoids: string[];
}

export function TasteSummaryPanel() {
  const [data, setData] = useState<TasteProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/taste-profile", { cache: "no-store" });
      if (response.ok) setData((await response.json()) as TasteProfileResponse);
    } catch {
      // Keep whatever was shown last; the refresh button retries.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="taste-summary" aria-labelledby="taste-summary-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your taste</p>
          <h2 id="taste-summary-heading">What we think you like</h2>
        </div>
        <button
          type="button"
          className="icon-button ghost"
          onClick={() => void load()}
          disabled={loading}
          title="Refresh taste summary"
          aria-label="Refresh taste summary"
        >
          <RefreshCcw size={16} />
        </button>
      </div>

      {!data && <p className="muted">{loading ? "Reading your ratings..." : "Rate movies to build your taste profile."}</p>}

      {data && !data.ready && (
        <p className="muted">
          Still learning. Rate {Math.max(data.readiness.neededRatings, 1)} more movie
          {data.readiness.neededRatings === 1 ? "" : "s"} (including a few loves and dislikes) to unlock your taste profile.
        </p>
      )}

      {data?.ready && (
        <div className="taste-summary-body">
          <p className="taste-summary-confidence">
            Learned from <strong>{data.sampleCount}</strong> rated movies · {data.verdictCounts.loved} loved ·{" "}
            {data.verdictCounts.fine} fine · {data.verdictCounts.disliked} not for you
          </p>

          {data.clusters.length > 0 && (
            <div className="taste-summary-group">
              <h3>Your loves cluster around</h3>
              <ul className="taste-cluster-list">
                {data.clusters.map((cluster) => (
                  <li className="taste-cluster" key={`${cluster.label}-${cluster.exemplars[0] ?? ""}`}>
                    <span className="taste-cluster-label">{cluster.label}</span>
                    <span className="taste-cluster-movies">{cluster.exemplars.join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.directors.length > 0 && (
            <p className="taste-summary-genres">
              Directors you love:{" "}
              <strong>
                {data.directors.map((person) => `${person.name} (${person.lovedCount})`).join(", ")}
              </strong>
            </p>
          )}
          {data.actors.length > 0 && (
            <p className="taste-summary-genres">
              Actors you love:{" "}
              <strong>
                {data.actors.map((person) => `${person.name} (${person.lovedCount})`).join(", ")}
              </strong>
            </p>
          )}
          {data.topGenres.length > 0 && (
            <p className="taste-summary-genres">
              Comfort genres: <strong>{data.topGenres.join(", ")}</strong>
            </p>
          )}

          {data.drawnTo.length > 0 && (
            <div className="taste-summary-group">
              <h3>Drawn to</h3>
              <div className="trait-chip-row">
                {data.drawnTo.map((label) => (
                  <span className="trait-chip" key={label}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {data.avoids.length > 0 && (
            <div className="taste-summary-group">
              <h3>Tends to avoid</h3>
              <div className="trait-chip-row">
                {data.avoids.map((label) => (
                  <span className="trait-chip trait-chip-negative" key={label}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
