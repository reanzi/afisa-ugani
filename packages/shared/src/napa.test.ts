import { describe, expect, it } from "vitest";
import { NapaFormatError, parseNapaRows, titleCase } from "./napa.ts";
import { formatCouncilCode, generateCouncilCode, isValidCouncilCode, normalizeCouncilCode } from "./councilCode.ts";

// Same layout as the NaPA export: title rows, header, ward and village written once per group.
const rows = [
  ["WIZARA YA MAWASILIANO NA TEKNOLOJIA YA HABARI", "", "", "", "", ""],
  ["RIPOTI YA IDADI YA ANWANI ZA BARABARA, BAGAMOYO DISTRICT COUNCIL", "", "", "", "", ""],
  ["IMETOLEWA TAREHE 01/07/2026", "", "", "", "", ""],
  ["KATA", "MTAA/KIJIJI/SHEHIA", "BARABARA/KITONGOJI", "AINA", "KIWANGO", "ANWANI"],
  ["DUNDA", "BENKI", "BAGAMOYO RD.", "ROAD", "PAVED", 7],
  ["", "", "FUKO ST.", "STREET", "EARTH", 2],
  ["", "MAJANI MAPANA", "KIHABU ST.", "STREET", "EARTH", 30],
  ["FUKAYOSI", "MWAVI", "KALIMANI", "", "EARTH", 134],
  ["", "", "MTAKUJA", "", "EARTH", 363],
  ["", "", "", "", "", ""],
  ["", "KIDOMOLE", "NGOGWE", "HAMLET", "EARTH", 0],
];

describe("NaPA address import", () => {
  it("rebuilds wards, villages and roads, filling the blank cells from above", () => {
    const out = parseNapaRows(rows);
    expect(out.councilTitle).toBe("Bagamoyo District Council");
    expect(out.reportDate).toBe("01/07/2026");
    expect(out.totals).toEqual({ wards: 2, villages: 4, streets: 6, addresses: 536 });
    expect(out.wards[0]!.villages.map((v) => v.name)).toEqual(["Benki", "Majani Mapana"]);
    expect(out.wards[0]!.villages[0]!.streets[0]).toEqual({ name: "Bagamoyo Rd.", kind: "ROAD", surface: "PAVED", addresses: 7 });
    expect(out.wards[1]!.villages[0]!.streets[0]!.kind).toBeUndefined();
    expect(out.skipped).toBe(0);
  });

  it("finds the columns by their headings, not their position", () => {
    const moved = rows.slice(3).map((r) => [r[5], r[0], r[1], r[2], r[3], r[4]]);
    expect(parseNapaRows(moved).totals.addresses).toBe(536);
  });

  it("rejects a file that is not the NaPA report", () => {
    expect(() => parseNapaRows([["Jina", "Simu"], ["Neema", "0712"]])).toThrow(NapaFormatError);
  });

  it("title-cases names the way people write them", () => {
    expect(titleCase("KWA MANOFU")).toBe("Kwa Manofu");
    expect(titleCase("NATIONA HAOUSING ST.")).toBe("Nationa Haousing St.");
  });
});

describe("council codes", () => {
  it("accepts 8 letters or digits, typed with or without the dash", () => {
    expect(normalizeCouncilCode(" abcd-ef12 ")).toBe("ABCDEF12");
    expect(isValidCouncilCode("ABCDEF12")).toBe(true);
    expect(isValidCouncilCode("BAMOYO")).toBe(false);
    expect(formatCouncilCode("abcdef12")).toBe("ABCD-EF12");
  });
  it("generates codes without look-alike characters", () => {
    let i = 0;
    const code = generateCouncilCode((n) => i++ % n);
    expect(code).toHaveLength(8);
    expect(code).not.toMatch(/[01OIL]/);
    expect(isValidCouncilCode(code)).toBe(true);
  });
});
