import { describe, it, expect } from "vitest";
import { parseQuery } from "../query";

describe("parseQuery — coordinates", () => {
  it("parses comma-separated coordinates", () => {
    expect(parseQuery("35.68, 139.69")).toEqual({ kind: "coords", lat: 35.68, lon: 139.69 });
  });

  it("parses space-separated and negative coordinates", () => {
    expect(parseQuery("-33.87 151.21")).toEqual({ kind: "coords", lat: -33.87, lon: 151.21 });
  });

  it("rejects out-of-range latitude and falls through to text", () => {
    expect(parseQuery("95.0, 20.0").kind).toBe("text");
  });

  it("rejects out-of-range longitude", () => {
    expect(parseQuery("45.0, 200.0").kind).toBe("text");
  });
});

describe("parseQuery — postal codes", () => {
  it("treats a bare 5-digit code as ambiguous rather than assuming the US", () => {
    const p = parseQuery("94301");
    expect(p).toMatchObject({ kind: "postal", code: "94301", cc: null });
  });

  it("resolves ambiguity from a trailing country name", () => {
    expect(parseQuery("10115 Germany")).toMatchObject({ kind: "postal", code: "10115", cc: "de" });
  });

  it("accepts a two-letter country code", () => {
    expect(parseQuery("75008 FR")).toMatchObject({ kind: "postal", code: "75008", cc: "fr" });
  });

  it("handles multi-word country names", () => {
    expect(parseQuery("10001 united states")).toMatchObject({ code: "10001", cc: "us" });
  });

  it("recognises UK postcodes without a country hint", () => {
    expect(parseQuery("SW1A 1AA")).toMatchObject({ kind: "postal", cc: "gb" });
  });

  it("recognises Canadian postcodes", () => {
    expect(parseQuery("K1A 0B1")).toMatchObject({ kind: "postal", cc: "ca" });
  });

  it("recognises ZIP+4 as unambiguously US", () => {
    expect(parseQuery("94301-1234")).toMatchObject({ kind: "postal", cc: "us" });
  });

  it("recognises Japanese postal codes", () => {
    expect(parseQuery("100-0001")).toMatchObject({ kind: "postal", cc: "jp" });
  });

  it("recognises Dutch postal codes", () => {
    expect(parseQuery("1012 AB")).toMatchObject({ kind: "postal", cc: "nl" });
  });

  it("strips a trailing comma before the country token", () => {
    expect(parseQuery("10115, DE")).toMatchObject({ kind: "postal", code: "10115", cc: "de" });
  });
});

describe("parseQuery — text", () => {
  it("classifies a plain city name as text", () => {
    expect(parseQuery("Tokyo")).toEqual({ kind: "text", text: "Tokyo", cc: null });
  });

  it("keeps a city with a country hint as text and captures the country", () => {
    expect(parseQuery("Paris France")).toMatchObject({ kind: "text", cc: "fr" });
  });

  it("does not strip a country token that is the entire query", () => {
    // "Japan" alone is a country search, not an empty query scoped to Japan.
    expect(parseQuery("Japan")).toMatchObject({ kind: "text", text: "Japan", cc: null });
  });

  it("normalises runs of whitespace", () => {
    expect(parseQuery("  San    Francisco  ")).toMatchObject({ text: "San Francisco" });
  });

  it("treats names containing digits as text, not postal", () => {
    expect(parseQuery("Route 66 Diner").kind).toBe("text");
  });
});
