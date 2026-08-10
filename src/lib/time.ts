/** Validate a provider-supplied IANA timezone before it reaches UI formatters. */
export function assertTimeZone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
  } catch {
    throw new Error("forecast: invalid timezone");
  }
  return value;
}

export function formatLocalTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export function formatLocalWallTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  }).format(date);
}

export function formatLocalDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
}

export function formatLocalHour(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    timeZone,
  }).format(date).replace(" ", "");
}

export function formatLocalWeekday(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  }).format(date);
}

export function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

/** Construct a real instant from a wall time in an IANA timezone, independent of the viewer timezone. */
export function dateAtLocalTime(
  anchor: Date,
  timeZone: string,
  hour: number,
  minute: number,
  dayOffset = 0
): Date {
  const local = zonedParts(anchor, timeZone);
  const intended = Date.UTC(local.year, local.month - 1, local.day + dayOffset, hour, minute);
  let candidate = intended;
  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = zonedParts(new Date(candidate), timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const correction = intended - represented;
    if (correction === 0) return new Date(candidate);
    candidate += correction;
  }
  return new Date(candidate);
}

export function timezoneLabel(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(date);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}
