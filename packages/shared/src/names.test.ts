import { describe, expect, it } from "vitest";
import { presentName, storeName } from "./names.ts";

describe("names: stored lower case, shown capitalised", () => {
  it("stores trimmed, single-spaced, lower case", () => {
    expect(storeName("  Halmashauri ya  Mji wa BAGAMOYO ")).toBe("halmashauri ya mji wa bagamoyo");
  });
  it("capitalises words but keeps joining words small and abbreviations in capitals", () => {
    expect(presentName("halmashauri ya mji wa bagamoyo")).toBe("Halmashauri ya Mji wa Bagamoyo");
    expect(presentName("bagamoyo tc")).toBe("Bagamoyo TC");
    expect(presentName("asha juma mrisho")).toBe("Asha Juma Mrisho");
    expect(presentName("mwana-hamisi saidi")).toBe("Mwana-Hamisi Saidi");
    expect(presentName("bagamoyo rd.")).toBe("Bagamoyo Rd.");
    expect(presentName("ya kwanza")).toBe("Ya Kwanza");
    expect(presentName("kisutu ii")).toBe("Kisutu II");
  });
  it("is safe on empty values and on text that already has capitals", () => {
    expect(presentName(null)).toBe("");
    expect(presentName("BAGAMOYO TC")).toBe("Bagamoyo TC");
  });
});
