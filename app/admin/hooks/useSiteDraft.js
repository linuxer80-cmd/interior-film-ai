"use client";
import { useEffect, useRef } from "react";

// Register a reader so navigation always checks the latest render, without rerender loops.
export default function useSiteDraft(onDraftState, id, state) {
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    onDraftState?.(id, () => latest.current);
    return () => onDraftState?.(id, null);
  }, [onDraftState, id]);
}
