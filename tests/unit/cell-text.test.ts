import { describe, expect, it } from "vitest";
import { cellText, parseCellText } from "@/domain/pricing/cell-text";

describe("parseCellText", () => {
  it.each([
    ["45", { status: "priced", minBani: 4500, maxBani: 4500, priceIsMinimum: false }],
    ["2,5", { status: "priced", minBani: 250, maxBani: 250, priceIsMinimum: false }],
    [" 45 lei ", { status: "priced", minBani: 4500, maxBani: 4500, priceIsMinimum: false }],
    ["45-60", { status: "priced", minBani: 4500, maxBani: 6000, priceIsMinimum: false }],
    ["100 – 150", { status: "priced", minBani: 10000, maxBani: 15000, priceIsMinimum: false }],
    ["20+", { status: "priced", minBani: 2000, maxBani: 2000, priceIsMinimum: true }],
    ["?", { status: "on_request", minBani: null, maxBani: null, priceIsMinimum: false }],
    ["X", { status: "not_offered", minBani: null, maxBani: null, priceIsMinimum: false }],
  ])("„%s”", (input, expected) => {
    expect(parseCellText(input)).toEqual({ ok: true, value: { kind: "cell", ...expected } });
  });

  it("gol înseamnă că nu există combinația", () => {
    expect(parseCellText("   ")).toEqual({ ok: true, value: { kind: "empty" } });
  });

  it.each(["abc", "60-45", "-5", "1.000.000", "45 / 60"])("refuză „%s” cu un mesaj clar", (input) => {
    const result = parseCellText(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(input.trim());
  });
});

describe("cellText", () => {
  it("scrie celulele exact cum le citește parseCellText", () => {
    for (const text of ["45", "2,5", "45-60", "20+", "?", "x", "1500"]) {
      const parsed = parseCellText(text);
      if (!parsed.ok || parsed.value.kind !== "cell") throw new Error(text);
      expect(cellText(parsed.value)).toBe(text);
    }
  });
});
