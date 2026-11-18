import { createContext, useContext } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import type { Actor } from "@afisa/shared";

export const HQ_VERSION = "0.1.0";
export const hqClient = { app: "hq" as const, version: HQ_VERSION };

export type Me = FunctionReturnType<typeof api.users.me>;

export type Hq = {
  me: Me;
  councilId: Id<"councils">;
  councilName: string;
  actor: Actor;
};

export const HqContext = createContext<Hq | null>(null);

export function useHq(): Hq {
  const ctx = useContext(HqContext);
  if (!ctx) throw new Error("useHq outside HqContext");
  return ctx;
}
