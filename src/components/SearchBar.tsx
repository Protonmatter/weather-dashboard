import { useEffect, useRef, type RefObject } from "react";
import { Search, X, Loader2, MapPin, RefreshCw } from "lucide-react";
import { glassSurface } from "../lib/design/glass";
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

const pill = glassSurface("control");

export function SearchBar(p: Props) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) p.onOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [p]);

  return (
    <div className="flex items-center gap-2 mb-6">
      <div ref={boxRef} className="relative flex-1" style={{ maxWidth: 420 }}>
        <div className="flex items-center gap-2 rounded-full px-3.5 py-2" style={pill}>
          <Search size={15} />
          <input ref={p.inputRef} value={p.query} onChange={(e) => p.onQuery(e.target.value)} onFocus={() => p.results.length && p.onOpen(true)} onKeyDown={(e) => { if (e.key === "Enter" && p.results[0]) p.onPick(p.results[0]); if (e.key === "Escape") p.onOpen(false); }} placeholder="City, postal code, or country" aria-label="Search for a city, postal code, or country" aria-expanded={p.open} role="combobox" className="flex-1 bg-transparent text-sm" style={{ outline: "none", color: "#fff" }} />
          {p.query && <button onClick={() => p.onQuery("")} aria-label="Clear search"><X size={14} /></button>}
          {p.busy && <Loader2 size={14} className="animate-spin" />}
        </div>
        {p.open && p.results.length > 0 && (
          <ul id="place-results" role="listbox" className="absolute left-0 right-0 mt-2 rounded-2xl overflow-hidden z-20" style={{ ...glassSurface("overlay"), padding: 6 }}>
            {p.results.map((r) => <li key={`${r.lat},${r.lon},${r.name}`} role="option"><button onClick={() => p.onPick(r)} className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2.5 text-white"><span>{flag(r.cc) || <MapPin size={13} />}</span><span>{r.name}</span></button></li>)}
          </ul>
        )}
      </div>
      <button onClick={p.onLocate} disabled={p.locating} className="rounded-full p-2.5" style={pill} aria-label="Use my location">{p.locating ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />}</button>
      <button onClick={p.onUnit} className="rounded-full px-3.5 py-2 text-sm" style={pill}>°{p.unit}</button>
      <button onClick={p.onRefresh} className="rounded-full p-2.5" style={pill} aria-label="Refresh forecast"><RefreshCw size={15} /></button>
    </div>
  );
}
