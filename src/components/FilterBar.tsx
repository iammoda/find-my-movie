"use client";

import { MOVIE_GENRES } from "@/lib/constants";
import type { BrowseCategory } from "@/lib/types";

export interface FilterState {
  category: BrowseCategory;
  genreId?: number;
  label: string;
}

interface FilterBarProps {
  value: FilterState;
  onChange: (value: FilterState) => void;
}

export function FilterBar({ value, onChange }: FilterBarProps) {
  const filters: FilterState[] = [
    { category: "popular", label: "Popular" },
    { category: "top_rated", label: "Top Rated" },
    ...MOVIE_GENRES.filter((genre) => genre.name !== "TV Movie").map((genre) => ({
      category: "genre" as const,
      genreId: genre.id,
      label: genre.name
    }))
  ];

  return (
    <div className="filter-strip" role="tablist" aria-label="Movie filters">
      {filters.map((filter) => {
        const active = filter.category === value.category && filter.genreId === value.genreId;
        return (
          <button
            key={`${filter.category}-${filter.genreId ?? "all"}`}
            type="button"
            className={active ? "filter-pill active" : "filter-pill"}
            onClick={() => onChange(filter)}
            aria-pressed={active}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
