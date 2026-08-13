import { CloudSun, Loader2, MapPin } from "lucide-react";
import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  locating: boolean;
  onUseLocation: () => void;
  onNotNow: () => void;
}

export function LocationOnboarding({
  open,
  locating,
  onUseLocation,
  onNotNow,
}: Props) {
  const useButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    useButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || locating) return;
      event.preventDefault();
      onNotNow();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [locating, onNotNow, open]);

  if (!open) return null;

  return (
    <div className="glass-scrim fixed inset-0 z-50 grid place-items-center p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-onboarding-title"
        aria-describedby="location-onboarding-description"
        className="glass-surface glass-surface--overlay w-full max-w-md p-6 sm:p-7"
        data-glass-level="overlay"
      >
        <div className="glass-inset mb-5 grid h-12 w-12 place-items-center rounded-2xl">
          <CloudSun size={24} aria-hidden="true" />
        </div>
        <h1 id="location-onboarding-title" className="text-2xl font-semibold">
          Use your local weather
        </h1>
        <p
          id="location-onboarding-description"
          className="mt-3 text-sm leading-6 text-white/65"
        >
          Allow location once to load nearby conditions. Your coordinates are used only
          for this forecast request and are not sent to an account or analytics service.
        </p>
        <p className="mt-3 text-xs leading-5 text-white/50">
          You can also choose Not now and search manually. A detected location is not
          saved until you select Save current location.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button
            ref={useButtonRef}
            type="button"
            onClick={onUseLocation}
            disabled={locating}
            className="glass-control glass-control--primary inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium disabled:opacity-65"
          >
            {locating ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <MapPin size={16} aria-hidden="true" />
            )}
            {locating ? "Finding location…" : "Use my location"}
          </button>
          <button
            type="button"
            onClick={onNotNow}
            disabled={locating}
            className="glass-control glass-inset rounded-full px-4 py-2.5 text-sm font-medium disabled:opacity-65"
          >
            Not now
          </button>
        </div>
      </section>
    </div>
  );
}
