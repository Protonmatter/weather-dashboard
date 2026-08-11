import { useEffect, useRef, type RefObject } from "react";
import { Loader2, LocateFixed } from "lucide-react";
import { glass } from "./Card";

interface Props {
  open: boolean;
  busy: boolean;
  onUseLocation: () => void;
  onNotNow: () => void;
  restoreFocusRef: RefObject<HTMLInputElement>;
}

export function LocationOnboarding({
  open,
  busy,
  onUseLocation,
  onNotNow,
  restoreFocusRef,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  const notNowRef = useRef(onNotNow);
  busyRef.current = busy;
  notNowRef.current = onNotNow;

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        if (!busyRef.current) {
          event.preventDefault();
          notNowRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? [])];
      if (!controls.length) return;
      const first = controls[0]!;
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      requestAnimationFrame(() => restoreFocusRef.current?.focus());
    };
  }, [open, restoreFocusRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4" style={{ background: "rgba(3,10,22,0.72)" }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-welcome-title"
        aria-describedby="location-welcome-description location-welcome-privacy"
        className="w-full max-w-md rounded-3xl p-6"
        style={glass}
      >
        <span
          className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ background: "rgba(255,255,255,0.13)" }}
          aria-hidden="true"
        >
          <LocateFixed size={22} />
        </span>
        <h2 id="location-welcome-title" className="text-xl font-semibold">
          Use your local weather
        </h2>
        <p id="location-welcome-description" className="mt-2 text-sm leading-6 text-white/75">
          Start with conditions and local time for your physical location.
        </p>
        <p id="location-welcome-privacy" className="mt-2 text-xs leading-5 text-white/55">
          Your coordinates are used with weather and reverse-geocoding providers. Saved places stay in this browser.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onNotNow}
            disabled={busy}
            className="rounded-full px-4 py-2.5 text-sm text-white/80 disabled:opacity-50"
            style={{ border: "1px solid rgba(255,255,255,0.18)" }}
          >
            Not now
          </button>
          <button
            ref={primaryRef}
            type="button"
            onClick={onUseLocation}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium disabled:opacity-65"
            style={{ background: "rgba(255,255,255,0.92)", color: "#10203a" }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={16} aria-hidden="true" />}
            {busy ? "Finding location…" : "Use my location"}
          </button>
        </div>
      </div>
    </div>
  );
}
