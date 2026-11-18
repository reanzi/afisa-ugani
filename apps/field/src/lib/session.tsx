/**
 * Who is using the app, available offline.
 *
 * Online, `users.me` comes live from Convex and is cached on the phone. Offline
 * (or while the auth token refreshes), the cached copy keeps the officer
 * working. Only a definite "signed out" while online sends them to sign-in.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useLiveQuery } from "dexie-react-hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@afisa/backend/api";
import { workingSections, type Actor, type Section } from "@afisa/shared";
import { db, setMeta } from "./db";

export type MeData = FunctionReturnType<typeof api.users.me>;
export type MembershipInfo = MeData["memberships"][number];

export type SessionState =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "ready"; me: MeData; fromCache: boolean };

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

export function useSessionState(): SessionState {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const online = useOnline();
  const live = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const cached = useLiveQuery(async () => (await db.meta.get("me"))?.value as MeData | undefined, [], null);

  useEffect(() => {
    if (live) void setMeta("me", live);
  }, [live]);

  if (live) return { kind: "ready", me: live, fromCache: false };
  if (cached === null) return { kind: "loading" }; // Dexie still opening
  if (cached && (isLoading || isAuthenticated || !online)) {
    return { kind: "ready", me: cached, fromCache: true };
  }
  if (isLoading || isAuthenticated) return { kind: "loading" };
  return { kind: "signedOut" };
}

/** The membership the officer is working under right now. */
export type WorkContext = {
  me: MeData;
  membership: MembershipInfo;
  councilId: string;
  actor: Actor;
  sections: Section[];
  fromCache: boolean;
};

const WorkCtx = createContext<WorkContext | null>(null);

export function WorkProvider({ value, children }: { value: Omit<WorkContext, "actor" | "sections">; children: ReactNode }) {
  const full = useMemo<WorkContext>(() => {
    const actor: Actor = {
      userId: value.me.userId,
      isRoot: "isRoot" in value.me,
      role: value.membership.role,
      status: value.membership.status,
      primarySection: value.membership.primarySection,
      sections: value.membership.sections,
    };
    return { ...value, actor, sections: workingSections(actor) };
  }, [value]);
  return <WorkCtx.Provider value={full}>{children}</WorkCtx.Provider>;
}

export function useWork(): WorkContext {
  const ctx = useContext(WorkCtx);
  if (!ctx) throw new Error("useWork must be used inside WorkProvider");
  return ctx;
}
