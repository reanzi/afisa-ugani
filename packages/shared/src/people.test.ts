import { describe, expect, it } from "vitest";
import { displayName, initialsOf, isFullName, isValidCheckNumber, isValidPhone, normalizeCheckNumber, normalizePhone, registrationProblems, titleCaseName } from "./people.ts";

describe("people", () => {
  it("normalises and checks phone numbers", () => {
    expect(normalizePhone("+255 712 345 678")).toBe("0712345678");
    expect(normalizePhone("255612345678")).toBe("0612345678");
    expect(isValidPhone("0712 345 678")).toBe(true);
    expect(isValidPhone("0512345678")).toBe(false);
    expect(isValidPhone("071234567")).toBe(false);
  });
  it("checks check numbers and full names", () => {
    expect(normalizeCheckNumber("1112 3456-7")).toBe("111234567");
    expect(isValidCheckNumber("111234567")).toBe(true);
    expect(isValidCheckNumber("12ab5")).toBe(false);
    expect(isValidCheckNumber("1234")).toBe(false);
    expect(isFullName("Neema Mwakalinga")).toBe(true);
    expect(isFullName("Neema")).toBe(false);
    expect(isFullName("Neema J")).toBe(false);
  });
  it("lists every problem at once", () => {
    expect(registrationProblems({ name: "Neema", phone: "07", checkNumber: "x", password: "short" })).toEqual(["name", "phone", "checkNumber", "password"]);
    expect(registrationProblems({ name: "Neema Mwakalinga", phone: "0712345678", checkNumber: "111234567", password: "mvua-ya-vuli" })).toEqual([]);
  });
});

describe("names on one line", () => {
  it("title-cases names typed in capitals or small letters", () => {
    expect(titleCaseName("ASHA juma  MRISHO")).toBe("Asha Juma Mrisho");
    expect(titleCaseName("mary-anne ng’wanakilala")).toBe("Mary-Anne Ng’wanakilala");
  });
  it("shortens long names: initials for middle names, then first and last", () => {
    expect(displayName("Asha Juma Mrisho")).toBe("Asha Juma Mrisho");
    expect(displayName("Asha Juma Mrisho Mohamedali")).toBe("Asha J. M. Mohamedali");
    expect(displayName("Bartholomew Emmanuel Josephat Mwakalinga", 22)).toBe("Bartholomew Mwakalinga");
    expect(displayName(null)).toBe("");
  });
  it("makes avatar initials from the first and last names", () => {
    expect(initialsOf("Asha Juma Mrisho")).toBe("AM");
    expect(initialsOf("neema")).toBe("N");
    expect(initialsOf("")).toBe("?");
  });
});
