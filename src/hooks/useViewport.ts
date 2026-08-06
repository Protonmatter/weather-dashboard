import { useEffect, useState } from "react";

/**
 * Presentation target selection (RFC 0001 §5).
 *
 * Chosen by `matchMedia`, never by user-agent sniffing: a Surface in tablet mode and an
 * iPad want the same layout regardless of what their UA string claims, and UA parsing
 * breaks every time a vendor changes it.
 */
export type Target = "phone" | "tablet" | "cinema";

const PHONE = "(max-width: 767px)";
/** 16:9 and genuinely large — the case where a denser, fuller-bleed layout pays off. */
const CINEMA = "(min-width: 1600px) and (min-aspect-ratio: 16/10)";

function current(): Target {
  if (typeof matchMedia !== "function") return "tablet";
  if (matchMedia(PHONE).matches) return "phone";
  if (matchMedia(CINEMA).matches) return "cinema";
  return "tablet";
}

export function useViewport(): Target {
  const [target, setTarget] = useState<Target>(current);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const queries = [matchMedia(PHONE), matchMedia(CINEMA)];
    const update = (): void => setTarget(current());
    for (const q of queries) q.addEventListener("change", update);
    update();
    return () => {
      for (const q of queries) q.removeEventListener("change", update);
    };
  }, []);

  return target;
}
