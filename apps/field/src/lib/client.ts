import { ConvexReactClient } from "convex/react";
import { v7 as uuidv7 } from "uuid";
import { getMeta, setMeta } from "./db";

declare const __APP_VERSION__: string;
export const APP_VERSION: string = __APP_VERSION__;

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!url) {
  throw new Error("VITE_CONVEX_URL haijawekwa. Nakili apps/field/.env.example kuwa .env.local.");
}

export const convex = new ConvexReactClient(url);

let deviceId: string | undefined;

/** A stable id for this installation, used only in the audit trail. */
export async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  const stored = await getMeta<string>("deviceId");
  deviceId = stored ?? uuidv7();
  if (!stored) await setMeta("deviceId", deviceId);
  return deviceId;
}

export async function clientMeta() {
  return { app: "field" as const, version: APP_VERSION, deviceId: await getDeviceId() };
}
