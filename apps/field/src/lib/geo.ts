import type { Geo } from "./db";

export type GeoStatus =
  | { state: "searching"; best?: Geo }
  | { state: "found"; geo: Geo }
  | { state: "weak"; geo: Geo }
  | { state: "denied" }
  | { state: "unavailable" };

const TARGET_ACCURACY_M = 20;
const TIMEOUT_MS = 30_000;

/**
 * Keep reading GPS until a fix is within 20 m or 30 s pass, reporting
 * progress. Returns a stop function. No map: we only store the point and its
 * accuracy so researchers can judge it.
 */
export function captureLocation(onStatus: (s: GeoStatus) => void): () => void {
  if (!("geolocation" in navigator)) {
    onStatus({ state: "unavailable" });
    return () => {};
  }
  let best: Geo | undefined;
  let done = false;
  const finish = (s: GeoStatus) => {
    if (done) return;
    done = true;
    navigator.geolocation.clearWatch(watchId);
    window.clearTimeout(timer);
    onStatus(s);
  };

  onStatus({ state: "searching" });
  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const geo: Geo = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
        altitude: pos.coords.altitude ?? undefined,
        capturedAt: pos.timestamp,
      };
      if (!best || geo.accuracy < best.accuracy) best = geo;
      if (geo.accuracy <= TARGET_ACCURACY_M) finish({ state: "found", geo });
      else onStatus({ state: "searching", best });
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) finish({ state: "denied" });
      else if (!best) finish({ state: "unavailable" });
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: TIMEOUT_MS },
  );
  const timer = window.setTimeout(() => {
    finish(best ? { state: "weak", geo: best } : { state: "unavailable" });
  }, TIMEOUT_MS);

  return () => {
    if (done) return;
    done = true;
    navigator.geolocation.clearWatch(watchId);
    window.clearTimeout(timer);
  };
}
