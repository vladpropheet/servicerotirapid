import { describe, expect, it } from "vitest";
import { formatBani, leiToBani } from "@/domain/money";

describe("leiToBani", () => {
  it.each([
    [40, 4000],
    [2.5, 250],
    [0, 0],
    ["2,5", 250],
    ["2.50", 250],
    ["150", 15000],
    [" 7,05 ", 705],
  ])("%j lei = %i bani", (input, expected) => {
    expect(leiToBani(input)).toBe(expected);
  });

  it.each([-1, "abc", "2,555", "", "1e3", Number.NaN])("refuză %j", (input) => {
    expect(() => leiToBani(input)).toThrow();
  });
});

describe("formatBani", () => {
  it("afișează lei fără zecimale inutile", () => {
    expect(formatBani(25000)).toBe("250 lei");
    expect(formatBani(250)).toBe("2,5 lei");
    expect(formatBani(150000)).toBe("1.500 lei");
  });
});
