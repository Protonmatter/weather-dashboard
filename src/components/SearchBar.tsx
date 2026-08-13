import { useEffect, useRef, type RefObject } from "react";
import { Search, X, Loader2, MapPin, RefreshCw } from "lucide-react";
import { flag } from "../lib/units";
import type { Place } from "../lib/types";

interface Props {
  query: string;
  onQuery: (q: string) => void;
  results: readonly Place[];
  busy: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  onPick: (p: Place) => void;
  onLocate: () => void;
  locating: boolean;
  inputRef: RefObject<HTMLInputElement>;
  onRefresh: () => void;
  refreshing: boolean;
  unit: "F" | "C";
  onUnit: () => void;
}

const controlClass = "glass-surface glass-surface--control glass-surface--interactive glass-control rounded-full";

export function SearchBar(p: Props) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) p.onOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [p]);

  return (
    <div className="mb-6 flex items-center gap-2">
      <div ref={boxRef} className="relative min-w-0 flex-1" style={{ maxWidth: 520 }}>
        <div className={`${controlClass} flex items-center gap-2 px-3.5 py-2`}>
          <Search size={15} className="shrink-0 text-white/60" aria-hidden="true" />
          <input
            ref={p.inputRef}
            value={p.query}
            onChange={(event) => p.onQuery(event.target.value)}
            onFocus={() => p.results.length && p.onOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && p.results[0]) p.onPick(p.results[0]);
              if (event.key === "Escape") p.onOpen(false);
            }}
            placeholder="City, postal code, or country"
            aria-label="Search for a city, postal code, or country"
            aria-expanded={p.open}
            role="combobox"
            aria-controls="place-results"
            data-glass-control="search"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
          />
          {p.query && (
            <button type="button" onClick={() => p.onQuery("")} aria-label="Clear search" className="grid h-8 w-8 place-items-center rounded-full">
              <X size={14} className="text-white/60" aria-hidden="true" />
            </button>
          )}
          {p.busy && <Loader2 size={14} className="animate-spin" aria-label="Searching" />}
        </div>

        {p.open && p.results.length > 0 && (
          <ul id="place-results" role="listbox" className="glass-surface glass-surface--overlay absolute left-0 right-0 z-20 mt-2 overflow-hidden p-1.5" data-glass-level="overlay">
            {p.results.map((result) => (
              <li key={`${result.lat},${result.lon},${result.name}`} role="option" aria-selected={false}>
                <button type="button" onClick={() => p.onPick(result)} className="glass-control w-full rounded-xl px-3 py-2 text-left">
                  <span className="flex items-center gap-2.5">
                    <span className="w-5 shrink-0 text-center text-[15px]">
                      {flag(result.cc) || <MapPin size={13} className="text-white/55" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px]">{result.name}</span>
                      <span className="block truncate text-[11.5px] text-white/50">
                        {[result.admin, result.country].filter(Boolean).join(", ") || "—"}
                      </span>
                    </span>
                    {result.postcode && <span className="glass-inset shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] text-white/75">{result.postcode}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" onClick={p.onLocate} disabled={p.locating} className={`${controlClass} grid w-11 shrink-0 place-items-center disabled:opacity-60`} data-glass-level="control" aria-label={p.locating ? "Finding your location" : "Use my location"} title={p.locating ? "Finding your location" : "Use my location"}>
        {p.locating ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />}
      </button>
      <button type="button" onClick={p.onUnit} className={`${controlClass} shrink-0 px-3.5 text-sm`} data-glass-level="control" aria-label={`Switch to ${p.unit === "F" ? "Celsius" : "Fahrenheit"}`}>
        °{p.unit}
      </button>
      <button type="button" onClick={p.onRefresh} className={`${controlClass} grid w-11 shrink-0 place-items-center`} data-glass-level="control" aria-label="Refresh forecast">
        <RefreshCw size={15} className={p.refreshing ? "animate-spin" : ""} aria-hidden="true" />
      </button>
    </div>
  );
}
