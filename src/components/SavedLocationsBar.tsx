import type { RefObject } from "react";
import { Columns2, Loader2, MapPin, Plus, X } from "lucide-react";
import { flag } from "../lib/units";
import type { Place } from "../lib/types";

interface Props {
  locations: readonly Place[];
  activeId: string;
  pendingId: string | null;
  canSaveCurrent: boolean;
  compare: boolean;
  compareButtonRef: RefObject<HTMLButtonElement>;
  onSelect: (place: Place) => void;
  onSaveCurrent: () => void;
  onRemove: (id: string) => void;
  onCompare: () => void;
}

const surface = {
  background: "rgba(255,255,255,0.10)",
  border: "1px solid rgba(255,255,255,0.16)",
};

export function SavedLocationsBar({
  locations,
  activeId,
  pendingId,
  canSaveCurrent,
  compare,
  compareButtonRef,
  onSelect,
  onSaveCurrent,
  onRemove,
  onCompare,
}: Props) {
  const canCompare = locations.length >= 2;

  return (
    <section aria-labelledby="saved-locations-title" className="mb-5 min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="saved-locations-title" className="text-xs font-semibold uppercase tracking-wider text-white/65">
            Saved locations
          </h2>
          <p id="compare-guidance" className="mt-0.5 text-[10px] text-white/45">
            Compare is best on tablet or desktop
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSaveCurrent}
            disabled={!canSaveCurrent}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs disabled:opacity-50"
            style={surface}
            aria-label={canSaveCurrent ? "Save current location" : "Current location already saved"}
            title={canSaveCurrent ? "Save current location" : "Current location already saved"}
          >
            <Plus size={14} aria-hidden="true" />
            Save
          </button>
          <button
            ref={compareButtonRef}
            type="button"
            onClick={onCompare}
            disabled={!canCompare}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs disabled:opacity-50"
            style={surface}
            aria-label="Compare saved locations"
            aria-pressed={compare}
            aria-describedby="compare-guidance"
            title={canCompare ? "Compare saved locations" : "Save at least two locations to compare"}
          >
            <Columns2 size={14} aria-hidden="true" />
            Compare
          </button>
        </div>
      </div>

      <div
        className="hscroll max-w-full overflow-x-auto pb-1"
        data-testid="saved-locations-strip"
        tabIndex={locations.length ? undefined : 0}
      >
        <ul className="flex min-w-max gap-2" aria-label="Saved location shortcuts">
          {locations.map((place) => {
            const id = `${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
            const active = id === activeId;
            const pending = id === pendingId;
            return (
              <li
                key={id}
                className="flex shrink-0 items-stretch overflow-hidden rounded-2xl"
                style={{
                  ...surface,
                  background: active ? "rgba(255,255,255,0.20)" : surface.background,
                  boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.28)" : undefined,
                }}
                data-testid="saved-location-card"
              >
                <button
                  type="button"
                  onClick={() => onSelect(place)}
                  className="flex min-w-0 items-center gap-2 px-3 py-2 text-left"
                  aria-label={`Open ${place.name} forecast`}
                  aria-current={active ? "true" : undefined}
                  aria-busy={pending || undefined}
                  title={`Open ${place.name} forecast`}
                >
                  <span className="w-5 text-center" aria-hidden="true">
                    {pending ? <Loader2 size={14} className="animate-spin" /> : flag(place.cc) || <MapPin size={14} />}
                  </span>
                  <span>
                    <span className="block max-w-32 truncate text-xs font-medium">{place.name}</span>
                    <span className="block max-w-32 truncate text-[10px] text-white/50">
                      {[place.admin, place.country].filter(Boolean).join(", ") || "Saved place"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  disabled={pending}
                  className="px-2.5 text-white/50 hover:text-white disabled:opacity-40"
                  style={{ borderLeft: "1px solid rgba(255,255,255,0.12)" }}
                  aria-label={`Remove ${place.name} from saved locations`}
                  title={`Remove ${place.name}`}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
