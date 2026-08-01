"use client";

import { useState } from "react";

interface DiagnosticsResponse {
  deck: {
    recentWindow: number;
    recentNotSeenRate: number | null;
    totalRatings: number;
  };
  model: {
    ready: boolean;
    ratingSampleCount: number;
    looRmseRankPoints: number | null;
  };
  recommendations: {
    baselineAverage: number | null;
    recommendationAverage: number | null;
    lastRunAt: string | null;
  };
}

function formatPercent(value: number | null) {
  return value == null ? "–" : `${Math.round(value * 100)}%`;
}

function formatSigned(value: number | null) {
  return value == null ? "–" : value.toFixed(2);
}

/**
 * Passive, read-only health readout. Exists so "the recommendations feel off"
 * is diagnosable: which layer regressed - deck ratability, model accuracy, or
 * recommendation outcomes - instead of a vibe.
 */
export function TasteDiagnostics() {
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) {
      setLoading(true);
      try {
        const response = await fetch("/api/diagnostics", { cache: "no-store" });
        if (response.ok) setData(await response.json());
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <section className="diagnostics-panel">
      <button type="button" className="diagnostics-toggle" onClick={toggle} aria-expanded={open}>
        Engine health {open ? "▾" : "▸"}
      </button>

      {open && (
        <div className="diagnostics-body">
          {loading && <p className="muted">Checking…</p>}
          {!loading && !data && <p className="muted">Diagnostics unavailable.</p>}
          {data && (
            <dl className="diagnostics-grid">
              <div>
                <dt>Deck cards you hadn&apos;t seen</dt>
                <dd>
                  {formatPercent(data.deck.recentNotSeenRate)}
                  <span className="muted"> of last {data.deck.recentWindow}</span>
                </dd>
              </div>
              <div>
                <dt>Taste prediction error</dt>
                <dd>
                  {data.model.ready && data.model.looRmseRankPoints != null ? `±${data.model.looRmseRankPoints} pts` : "–"}
                  <span className="muted"> on {data.model.ratingSampleCount} ratings</span>
                </dd>
              </div>
              <div>
                <dt>Recs you rated vs browsed</dt>
                <dd>
                  {formatSigned(data.recommendations.recommendationAverage)}
                  <span className="muted"> vs {formatSigned(data.recommendations.baselineAverage)}</span>
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
