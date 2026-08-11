import { useCallback, useEffect, useRef, useState } from "react";
import { fetchComparison } from "../lib/comparison/provider";
import { createComparisonScheduler } from "../lib/comparison/scheduler";
import type {
  ComparisonCache,
  ComparisonCardState,
  ComparisonSummary,
} from "../lib/comparison/types";
import { isAbort } from "../lib/http";
import { savedPlaceId } from "../lib/locations/store";
import type { Place } from "../lib/types";

const CACHE_TTL_MS = 600_000;
const UNAVAILABLE = "Comparison data is unavailable. Try again.";

export function useComparison(
  places: readonly Place[],
  cache: ComparisonCache
): { cards: readonly ComparisonCardState[]; retry: (place: Place) => void } {
  const [cards, setCards] = useState<ComparisonCardState[]>([]);
  const scheduler = useRef(createComparisonScheduler(2));
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const replaceCard = useCallback((id: string, next: ComparisonCardState, generation: number) => {
    if (generation !== generationRef.current) return;
    setCards((current) => current.map((card) => card.id === id ? next : card));
  }, []);

  const request = useCallback((place: Place, signal: AbortSignal, generation: number) => {
    const id = savedPlaceId(place);
    void scheduler.current
      .schedule(() => fetchComparison(place, signal), signal)
      .then((summary: ComparisonSummary) => {
        if (generation !== generationRef.current || signal.aborted) return;
        cache.set(id, { summary, storedAt: Date.now() });
        replaceCard(id, { id, place, status: "ready", summary }, generation);
      })
      .catch((error: unknown) => {
        if (isAbort(error) || generation !== generationRef.current || signal.aborted) return;
        const cached = cache.get(id);
        replaceCard(id, cached
          ? { id, place, status: "stale", summary: cached.summary, error: UNAVAILABLE }
          : { id, place, status: "error", error: UNAVAILABLE }, generation);
      });
  }, [cache, replaceCard]);

  useEffect(() => {
    const generation = ++generationRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const now = Date.now();

    setCards(places.map((place) => {
      const id = savedPlaceId(place);
      const current = cache.get(id);
      if (current && now - current.storedAt < CACHE_TTL_MS) {
        return { id, place, status: "refreshing", summary: current.summary };
      }
      if (current) cache.delete(id);
      return { id, place, status: "loading" };
    }));

    places.forEach((place) => request(place, controller.signal, generation));
    return () => controller.abort();
  }, [cache, places, request]);

  const retry = useCallback((place: Place) => {
    const controller = controllerRef.current;
    if (!controller || controller.signal.aborted) return;
    const generation = generationRef.current;
    const id = savedPlaceId(place);
    const current = cache.get(id);
    replaceCard(id, current
      ? { id, place, status: "refreshing", summary: current.summary }
      : { id, place, status: "loading" }, generation);
    request(place, controller.signal, generation);
  }, [cache, replaceCard, request]);

  return { cards, retry };
}
