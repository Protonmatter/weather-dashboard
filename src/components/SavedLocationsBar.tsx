import type { RefObject } from "react";
import { Columns2, Loader2, MapPin, Plus, X } from "lucide-react";
import { flag } from "../lib/units";
import { glassSurface } from "../lib/design/glass";
import type { Place } from "../lib/types";

interface Props { locations: readonly Place[]; activeId: string; pendingId: string | null; canSaveCurrent: boolean; compare: boolean; compareButtonRef: RefObject<HTMLButtonElement>; onSelect: (place: Place) => void; onSaveCurrent: () => void; onRemove: (id: string) => void; onCompare: () => void; }

const surface = glassSurface("control");

export function SavedLocationsBar(p: Props) {
  return <section aria-labelledby="saved-locations-title" className="mb-5 min-w-0">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 id="saved-locations-title" className="text-xs font-semibold uppercase tracking-wider text-white/65">Saved locations</h2>
      <div className="flex gap-2">
        <button onClick={p.onSaveCurrent} disabled={!p.canSaveCurrent} className="rounded-full px-3 py-2 text-xs" style={surface}><Plus size={14}/>Save</button>
        <button ref={p.compareButtonRef} onClick={p.onCompare} disabled={p.locations.length < 2} className="rounded-full px-3 py-2 text-xs" style={surface} aria-pressed={p.compare}><Columns2 size={14}/>Compare</button>
      </div>
    </div>
    <div className="hscroll max-w-full overflow-x-auto pb-1"><ul className="flex min-w-max gap-2">
      {p.locations.map((place) => { const id=`${place.lat.toFixed(4)},${place.lon.toFixed(4)}`; const active=id===p.activeId; return <li key={id} className="flex overflow-hidden rounded-2xl" style={{...surface,background:active?"rgba(255,255,255,.2)":surface.background}}><button onClick={()=>p.onSelect(place)} className="flex items-center gap-2 px-3 py-2 text-left"><span>{p.pendingId===id?<Loader2 size={14}/>:flag(place.cc)||<MapPin size={14}/>}</span><span className="text-xs">{place.name}</span></button><button onClick={()=>p.onRemove(id)} className="px-2"><X size={13}/></button></li> })}
    </ul></div>
  </section>;
}
