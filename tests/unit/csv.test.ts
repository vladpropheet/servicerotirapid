import { describe, expect, it } from "vitest";
import { csvCell, csvLei, toCsv } from "@/lib/csv";

describe("CSV pentru Excel", () => {
  it("începe cu BOM, folosește „;” și termină rândurile cu CRLF", () => {
    expect(toCsv(["Nume", "Oraș"], [["Ion", "Pitești"]])).toBe("﻿Nume;Oraș\r\nIon;Pitești\r\n");
  });

  it("pune între ghilimele textele cu ; ghilimele sau rânduri noi", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('spune "da"')).toBe('"spune ""da"""');
    expect(csvCell("rândul 1\nrândul 2")).toBe('"rândul 1\nrândul 2"');
  });

  it("textele care ar fi formule în Excel primesc apostrof (CSV injection)", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell("+40722")).toBe("'+40722");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("=1+2;x")).toBe(`"'=1+2;x"`);
  });

  it("numerele și celulele goale rămân simple", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("banii apar în lei, cu virgulă și fără separator de mii", () => {
    expect(csvLei(12050)).toBe("120,50");
    expect(csvLei(123456)).toBe("1234,56");
    expect(csvLei(0)).toBe("0,00");
    expect(csvLei(null)).toBe("");
  });
});
