import { describe, expect, it } from "vitest";
import { isRoMobile, normalizeRoPhone } from "@/lib/validation/phone";

describe("normalizeRoPhone", () => {
  it.each([
    ["0766 777 130", "+40766777130"],
    ["0766777130", "+40766777130"],
    ["+40 766 777 130", "+40766777130"],
    ["0040766777130", "+40766777130"],
    ["(0766) 777-130", "+40766777130"],
    ["0248 123 456", "+40248123456"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeRoPhone(input)).toBe(expected);
  });

  it.each(["", "0766 777 13", "07667771300", "+44 7700 900123", "0866777130", "abc"])(
    "refuză %j",
    (input) => {
      expect(normalizeRoPhone(input)).toBeNull();
    },
  );
});

describe("isRoMobile", () => {
  it("acceptă doar numere de mobil", () => {
    expect(isRoMobile("+40766777130")).toBe(true);
    expect(isRoMobile("+40248123456")).toBe(false);
  });
});
