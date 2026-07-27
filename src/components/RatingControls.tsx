"use client";

import { EyeOff, Heart, Meh, RotateCcw, ThumbsDown } from "lucide-react";
import type { Verdict } from "@/lib/types";

interface RatingControlsProps {
  disabled?: boolean;
  onVerdict: (verdict: Verdict) => void;
  onNotSeen: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
}

export function RatingControls({ disabled, onVerdict, onNotSeen, onUndo, canUndo }: RatingControlsProps) {
  return (
    <div className="rating-controls" aria-label="Rate movie">
      <button
        type="button"
        className="icon-button ghost"
        onClick={onUndo}
        disabled={!canUndo || disabled}
        title="Undo"
        aria-label="Undo previous rating"
      >
        <RotateCcw size={20} />
      </button>
      <button
        type="button"
        className="icon-button negative"
        onClick={() => onVerdict("disliked")}
        disabled={disabled}
        title="Not for me"
        aria-label="Not for me"
      >
        <ThumbsDown size={26} />
      </button>
      <button
        type="button"
        className="icon-button neutral"
        onClick={onNotSeen}
        disabled={disabled}
        title="Haven't seen it"
        aria-label="Haven't seen it"
      >
        <EyeOff size={22} />
      </button>
      <button
        type="button"
        className="icon-button neutral"
        onClick={() => onVerdict("fine")}
        disabled={disabled}
        title="It was fine"
        aria-label="It was fine"
      >
        <Meh size={24} />
      </button>
      <button
        type="button"
        className="icon-button positive"
        onClick={() => onVerdict("loved")}
        disabled={disabled}
        title="Loved it"
        aria-label="Loved it"
      >
        <Heart size={27} />
      </button>
    </div>
  );
}
