import { describe, expect, it } from "vitest";
import { fitWithin, isFreshPhoto, photoLabels, validateMediaMeta } from "./media.ts";

describe("media", () => {
  it("fits photos inside the limit without enlarging", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it("checks the photo's metadata", () => {
    const ok = { clientId: "x", recordClientId: "y", width: 1600, height: 1200, bytes: 310_000, shot: "karibu" as const, takenAt: 1 };
    expect(validateMediaMeta(ok)).toBeNull();
    expect(validateMediaMeta({ ...ok, width: 4000 })).toBe("BAD_SIZE:width");
    expect(validateMediaMeta({ ...ok, bytes: 5_000_000 })).toBe("TOO_LARGE");
    expect(validateMediaMeta({ ...ok, shot: "selfie" as never })).toBe("BAD_SHOT");
  });
  it("accepts only photos just taken", () => {
    const now = 1_800_000_000_000;
    expect(isFreshPhoto(now - 30_000, now)).toBe(true);
    expect(isFreshPhoto(now - 3 * 3600_000, now)).toBe(false);
    expect(isFreshPhoto(0, now)).toBe(false);
  });
});

describe("photoLabels", () => {
  it("names a record's crop, animal and severity instead of showing their codes", () => {
    expect(photoLabels({ type: "pest_outbreak", section: "kilimo", payload: { crop: "mahindi", pest: "Viwavijeshi vamizi", severity: "wastani" } })).toMatchObject({
      subject: "Mahindi",
      suspected: "Viwavijeshi vamizi",
      severity: "Wastani",
    });
    expect(photoLabels({ type: "vaccination", section: "mifugo", payload: { animal: "mbuzi" } }).subject).toBe("Mbuzi");
  });
});
