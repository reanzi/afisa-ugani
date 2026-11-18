import { describe, expect, it } from "vitest";
import { fitWithin, validateMediaMeta } from "./media.ts";

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
});
