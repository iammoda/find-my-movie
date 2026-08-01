import { DEEP_TASTE_KINDS, MOVIE_GENRES } from "@/lib/constants";
import type { Movie, TasteFact, TasteKind } from "@/lib/types";

const GENRE_BY_ID = new Map(MOVIE_GENRES.map((genre) => [genre.id, genre.name]));
export const FEATURE_TEXT_VERSION = "movie-feature-text-v4";

const FACT_PATTERNS: Array<{
  kind: TasteKind;
  value: string;
  weight: number;
  patterns: RegExp[];
}> = [
  { kind: "tone", value: "tense", weight: 1, patterns: [/tense|suspense|danger|threat|paranoia/i] },
  { kind: "tone", value: "restrained", weight: 0.9, patterns: [/quiet|restrained|subtle|understated/i] },
  { kind: "tone", value: "darkly funny", weight: 0.9, patterns: [/satire|dark comedy|absurd|black comedy/i] },
  { kind: "pacing", value: "slow-burn", weight: 0.9, patterns: [/slow.?burn|gradual|unfolds|patient/i] },
  { kind: "pacing", value: "propulsive", weight: 0.95, patterns: [/race|urgent|deadline|chase|escape|mission/i] },
  { kind: "theme", value: "deception and identity", weight: 1, patterns: [/deception|fake|undercover|identity|double life|con/i] },
  { kind: "theme", value: "moral ambiguity", weight: 1, patterns: [/moral|compromise|corruption|ambiguous|ethic/i] },
  { kind: "theme", value: "institutional pressure", weight: 1, patterns: [/government|cia|police|bureaucracy|institution|agency|political/i] },
  { kind: "conflict", value: "system pressure", weight: 1, patterns: [/institution|agency|government|corporate|company|bureaucracy|official/i] },
  { kind: "stakes", value: "real-world stakes", weight: 1, patterns: [/true story|based on|hostage|war|historical|crisis/i] },
  { kind: "stakes", value: "survival pressure", weight: 1, patterns: [/survive|survival|trapped|escape|rescue/i] },
  { kind: "structure", value: "procedural problem-solving", weight: 1, patterns: [/investigation|plan|operation|procedure|case|scheme/i] },
  { kind: "structure", value: "ensemble under pressure", weight: 0.9, patterns: [/team|crew|group|ensemble|family/i] },
  { kind: "protagonist", value: "competent professional", weight: 0.85, patterns: [/agent|detective|journalist|lawyer|doctor|professional|operative/i] },
  { kind: "emotional_payoff", value: "cathartic justice", weight: 0.8, patterns: [/justice|revenge|redemption|truth|expose/i] }
];

const TAXONOMY_FACT_PATTERNS: Array<{
  kind: TasteKind;
  value: string;
  weight: number;
  patterns: RegExp[];
}> = [
  {
    kind: "theme",
    value: "family_legacy",
    weight: 1.05,
    patterns: [/family.*(legacy|history|secret|tradition|generation)|ancestor|ancestr|heritage|generations-old/i]
  },
  {
    kind: "emotional_payoff",
    value: "generational_reconciliation",
    weight: 1,
    patterns: [/reconcile|forgive|heal.*family|family.*(truth|wound|forgive)|generations-old/i]
  },
  {
    kind: "theme",
    value: "music_as_identity",
    weight: 1,
    patterns: [
      /musician|singer|songwriter|composer|guitarist|concert/i,
      /music.*(dream|identity|family|passion|career|life|ban)/i,
      /dreams? of becoming.*musician|ban on music/i
    ]
  },
  {
    kind: "emotional_payoff",
    value: "memory_and_grief",
    weight: 0.98,
    patterns: [/remember|memory|memories|afterlife|mourning|grief|loss of loved one|\bdead\b|\bdeath\b/i]
  },
  {
    kind: "theme",
    value: "cultural_belonging",
    weight: 0.9,
    patterns: [/heritage|tradition|cultural?|ancestr|diaspora|immigrant|ritual|festival|homeland/i]
  },
  {
    kind: "pacing",
    value: "kinetic_chase_escalation",
    weight: 1,
    patterns: [/chase|pursuit|flee|vehicle|road war|escape|convoy|high-speed|on the run/i]
  },
  {
    kind: "stakes",
    value: "wasteland_survival_pressure",
    weight: 1,
    patterns: [/wasteland|post-apocalyptic|desert|scarcity|survival|survive/i]
  },
  {
    kind: "emotional_payoff",
    value: "revenge_liberation_drive",
    weight: 0.95,
    patterns: [/revenge|vengeance|liberat|captivity|enslaved|freedom|tyrant/i]
  },
  {
    kind: "tone",
    value: "visceral_action_craft",
    weight: 0.95,
    patterns: [/stunt|fight|combat|warrior|martial|hand-to-hand|battle/i]
  }
];

const LOW_VALUE_KEYWORDS = new Set([
  "aftercreditsstinger",
  "duringcreditsstinger",
  "based on comic",
  "based on comic book",
  "based on novel or book",
  "marvel cinematic universe (mcu)",
  "dc extended universe (dceu)",
  "sequel",
  "prequel",
  "superhero",
  "post credit scene"
]);

export function posterUrl(path: string | null, size = "w500"): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function normalizeFactValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function factKey(fact: Pick<TasteFact, "kind" | "value">): string {
  return `${fact.kind}:${normalizeFactValue(fact.value)}`;
}

function usableKeyword(keyword: string): string | null {
  const normalized = normalizeFactValue(keyword);
  if (!normalized || LOW_VALUE_KEYWORDS.has(normalized)) return null;
  if (/credit.*stinger|cinematic universe|^based on /.test(normalized)) return null;
  return normalized;
}

export function isDeepFact(fact: Pick<TasteFact, "kind">): boolean {
  return DEEP_TASTE_KINDS.has(fact.kind);
}

export function deriveTasteFacts(movie: Movie): TasteFact[] {
  const facts = new Map<string, TasteFact>();

  const add = (kind: TasteKind, value: string, weight = 1, source: TasteFact["source"] = "heuristic") => {
    const normalized = normalizeFactValue(value);
    if (!normalized) return;
    const key = `${kind}:${normalized}`;
    const existing = facts.get(key);
    const fact = {
      tmdbId: movie.tmdbId,
      kind,
      value: normalized,
      weight: Math.max(weight, existing?.weight ?? 0),
      source
    };
    facts.set(key, fact);
  };

  for (const fact of movie.tasteFacts ?? []) {
    add(fact.kind, fact.value, fact.weight, fact.source);
  }

  for (const genre of movie.genres) {
    add("genre", genre.name || GENRE_BY_ID.get(genre.id) || String(genre.id), 0.65, "tmdb");
  }

  for (const keyword of movie.keywords) {
    const usable = usableKeyword(keyword);
    if (usable) add("theme", usable, 0.18, "tmdb");
  }

  for (const country of movie.countries) {
    add("setting", country, 0.35, "tmdb");
  }

  if (movie.releaseDate) {
    const year = Number(movie.releaseDate.slice(0, 4));
    if (Number.isFinite(year)) add("period", `${Math.floor(year / 10) * 10}s`, 0.5, "heuristic");
  }

  if (movie.credits?.director) add("director", movie.credits.director, 0.65, "tmdb");
  for (const actor of movie.credits?.actors.slice(0, 4) ?? []) {
    add("cast", actor, 0.45, "tmdb");
  }

  // TV: the media itself and its format (limited vs long-running) are taste
  // signal - a shared movie+TV model uses these to learn per-media bias.
  if (movie.mediaType === "tv") {
    add("media", "tv", 1, "tmdb");
    const payload = movie.sourcePayload as { number_of_seasons?: unknown; status?: unknown } | null | undefined;
    const seasons = Number(payload?.number_of_seasons);
    if (Number.isFinite(seasons) && seasons > 0) {
      if (seasons <= 2) add("format", "limited_series", 1, "tmdb");
      else if (seasons >= 6) add("format", "long_running_series", 1, "tmdb");
    }
  }

  const text = `${movie.title}. ${movie.overview} ${movie.keywords.join(" ")}`;
  for (const pattern of FACT_PATTERNS) {
    if (pattern.patterns.some((regex) => regex.test(text))) {
      add(pattern.kind, pattern.value, pattern.weight, "heuristic");
    }
  }

  for (const pattern of TAXONOMY_FACT_PATTERNS) {
    if (pattern.patterns.some((regex) => regex.test(text))) {
      add(pattern.kind, pattern.value, pattern.weight, "taxonomy");
    }
  }

  return Array.from(facts.values());
}

export function featureTextForMovie(movie: Movie): string {
  const facts = deriveTasteFacts(movie);
  const storyFacts = facts
    .filter((fact) => fact.source !== "taxonomy" && fact.source !== "llm" && isDeepFact(fact))
    .map((fact) => `${fact.kind}: ${fact.value}`)
    .join("; ");
  const actors = movie.credits?.actors.slice(0, 5).join(", ") ?? "";
  const director = movie.credits?.director ?? "";

  return [
    `Feature text version: ${FEATURE_TEXT_VERSION}`,
    `Title: ${movie.title}`,
    `Premise and story engine: ${movie.overview}`,
    `Inferred story qualities: ${storyFacts || "none"}`,
    `Compare this film by protagonist pressure, central conflict, moral stakes, tone, pacing, structure, and emotional payoff.`,
    `Do not over-match on exact genre, country, decade, actor, director, franchise, or setting.`,
    `Supporting metadata, low weight only: genres ${movie.genres.map((genre) => genre.name).join(", ")}; director ${director}; actors ${actors}; release ${movie.releaseDate ?? "unknown"}.`,
    `Keywords, low weight only: ${movie.keywords.join(", ")}`
  ].join("\n");
}
