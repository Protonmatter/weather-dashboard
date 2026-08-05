/**
 * Query shape routing.
 *
 * One search field has to serve "Tokyo", "94301", "10115 Germany", "SW1A 1AA UK" and
 * "35.68, 139.69". Rather than guessing from a single geocoder's response, we classify
 * the input first and dispatch only to providers that can answer it.
 */

export type ParsedQuery =
  | { kind: "coords"; lat: number; lon: number }
  | { kind: "postal"; code: string; cc: string | null; text: string }
  | { kind: "text"; text: string; cc: string | null };

/** Country tokens people actually type after a postal code. */
export const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  us: "us", usa: "us", "united states": "us", america: "us",
  uk: "gb", gb: "gb", "great britain": "gb", "united kingdom": "gb", england: "gb",
  ca: "ca", canada: "ca", de: "de", germany: "de", deutschland: "de",
  fr: "fr", france: "fr", es: "es", spain: "es", it: "it", italy: "it",
  nl: "nl", netherlands: "nl", be: "be", belgium: "be", ch: "ch", switzerland: "ch",
  at: "at", austria: "at", pl: "pl", poland: "pl", pt: "pt", portugal: "pt",
  jp: "jp", japan: "jp", au: "au", australia: "au", nz: "nz", "new zealand": "nz",
  in: "in", india: "in", br: "br", brazil: "br", mx: "mx", mexico: "mx",
  se: "se", sweden: "se", no: "no", norway: "no", dk: "dk", denmark: "dk",
  fi: "fi", finland: "fi", ie: "ie", ireland: "ie", kr: "kr", "south korea": "kr",
  za: "za", "south africa": "za", tr: "tr", turkey: "tr", ru: "ru", russia: "ru",
};

/**
 * Postal shapes, most specific first. `cc: null` means the shape is ambiguous across
 * countries — a bare 5-digit code is valid in the US, Germany, France, Spain and Italy,
 * so we fan out rather than silently assuming the US.
 */
export const POSTAL_SHAPES: ReadonlyArray<{ re: RegExp; cc: string | null }> = [
  { re: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, cc: "gb" },
  { re: /^[A-Z]\d[A-Z][\s-]?\d[A-Z]\d$/i, cc: "ca" },
  { re: /^\d{3}-\d{4}$/, cc: "jp" },
  { re: /^\d{5}-\d{4}$/, cc: "us" },
  { re: /^\d{4}\s?[A-Z]{2}$/i, cc: "nl" },
  { re: /^\d{5}$/, cc: null },
  { re: /^\d{4}$/, cc: null },
  { re: /^\d{6}$/, cc: null },
];

/** Countries tried for an ambiguous numeric postal code, in rough traffic order. */
export const AMBIGUOUS_POSTAL_COUNTRIES = ["us", "de", "fr", "es", "it"] as const;

export function parseQuery(raw: string): ParsedQuery {
  const q = raw.trim().replace(/\s+/g, " ");

  const coord = q.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (coord) {
    const lat = Number.parseFloat(coord[1]!);
    const lon = Number.parseFloat(coord[2]!);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { kind: "coords", lat, lon };
  }

  // Strip a trailing country token: "75008 France", "SW1A 1AA UK", "10115, DE".
  // Two-word names ("united states") are checked before one-word ones.
  let body = q;
  let cc: string | null = null;
  const parts = q.split(/[,\s]+/).filter(Boolean);
  for (let take = 2; take >= 1; take--) {
    if (parts.length <= take) continue;
    const tail = parts.slice(-take).join(" ").toLowerCase();
    const hit = COUNTRY_ALIASES[tail];
    if (hit) {
      cc = hit;
      body = parts.slice(0, -take).join(" ");
      break;
    }
  }

  const code = body.replace(/,$/, "").trim();
  const shape = POSTAL_SHAPES.find((s) => s.re.test(code));
  if (shape) return { kind: "postal", code, cc: cc ?? shape.cc, text: q };

  return { kind: "text", text: q, cc };
}
