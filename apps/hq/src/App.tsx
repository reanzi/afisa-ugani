import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { isHqRole, ROLE_LABELS, type Actor } from "@afisa/shared";
import { Select, useTheme } from "@afisa/ui";
import { HqContext, useHq, type Me } from "./context";
import { Requests } from "./pages/Requests";
import { Members } from "./pages/Members";
import { Areas } from "./pages/Areas";
import { Audit } from "./pages/Audit";
import { Councils } from "./pages/Councils";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { JoinWithCode, NoAccess, SignIn, Waiting } from "./auth";

const TABS = ["maombi", "ripoti", "wanachama", "maeneo", "kumbukumbu", "mipangilio", "halmashauri"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  maombi: "Maombi",
  ripoti: "Ripoti",
  wanachama: "Wanachama",
  maeneo: "Maeneo",
  kumbukumbu: "Kumbukumbu",
  mipangilio: "Mipangilio",
  halmashauri: "Halmashauri",
};

function hqCouncils(me: Me, rootCouncils: { _id: Id<"councils">; name: string }[] | undefined) {
  const isRoot = "isRoot" in me;
  if (isRoot) return (rootCouncils ?? []).map((c) => ({ councilId: c._id, councilName: c.name }));
  return me.memberships
    .filter((m) => m.status === "active" && isHqRole(m.role))
    .map((m) => ({ councilId: m.councilId, councilName: m.councilName }));
}

export function App() {
  useTheme();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const rootCouncils = useQuery(api.councils.listMine, me && "isRoot" in me ? {} : "skip");
  const [councilParam, setCouncilParam] = useQueryState("c", parseAsString);
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("maombi"));
  const { signOut } = useAuthActions();

  if (isLoading || (isAuthenticated && me === undefined)) {
    return <main className="hq-auth"><p className="muted">Inafungua…</p></main>;
  }
  if (!isAuthenticated || !me) return <SignIn />;

  const isRoot = "isRoot" in me;
  const councils = hqCouncils(me, rootCouncils);
  if (isRoot && rootCouncils === undefined) return null;
  if (!isRoot && councils.length === 0) {
    if (me.memberships.some((m) => m.status === "pending" || m.status === "suspended")) return <Waiting me={me} />;
    if (me.memberships.some((m) => m.status === "active")) return <NoAccess />;
    return <JoinWithCode me={me} />;
  }
  // Root with no councils yet: only the council page.
  if (councils.length === 0) {
    return (
      <div className="hq">
        <aside className="hq-side">
          <div className="hq-brand">
            <img src="/favicon.svg" alt="" width={36} height={36} />
            <div><strong>Afisa Ugani</strong><span className="muted">Msimamizi wa mfumo</span></div>
          </div>
          <nav className="hq-nav" aria-label="Kuu">
            <button aria-current="page">Halmashauri</button>
          </nav>
          <div className="hq-who">
            <strong>{me.name ?? "—"}</strong>
            <button className="btn btn-quiet btn-small" onClick={() => void signOut()}>Toka</button>
          </div>
        </aside>
        <main className="hq-main"><Councils /></main>
      </div>
    );
  }
  const current = councils.find((c) => c.councilId === councilParam) ?? councils[0]!;
  const membership = me.memberships.find((m) => m.councilId === current.councilId) ?? null;
  const actor: Actor = {
    userId: me.userId,
    isRoot: "isRoot" in me,
    role: membership?.role ?? null,
    status: membership?.status ?? null,
    primarySection: membership?.primarySection ?? null,
    sections: membership?.sections ?? [],
  };

  return (
    <HqContext.Provider value={{ me, councilId: current.councilId, councilName: current.councilName, actor }}>
      <div className="hq">
        <aside className="hq-side">
          <div className="hq-brand">
            <img src="/favicon.svg" alt="" width={36} height={36} />
            <div>
              <strong>Afisa Ugani</strong>
              {councils.length > 1 ? (
                <Select
                  size="sm"
                  label="Halmashauri"
                  value={current.councilId}
                  onChange={(v) => void setCouncilParam(v)}
                  options={councils.map((c) => ({ value: c.councilId, label: c.councilName }))}
                />
              ) : (
                <span className="muted">{current.councilName}</span>
              )}
            </div>
          </div>
          <nav className="hq-nav" aria-label="Kuu">
            {TABS.filter((t) => t !== "halmashauri" || isRoot).map((t) => (
              <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => void setTab(t)}>
                {TAB_LABELS[t]}
                {t === "maombi" && <PendingCount />}
              </button>
            ))}
          </nav>
          <div className="hq-who">
            <strong>{me.name ?? "—"}</strong>
            <span className="muted">{actor.isRoot ? "Msimamizi wa mfumo" : actor.role ? ROLE_LABELS[actor.role].sw : ""}</span>
            <button className="btn btn-quiet btn-small" onClick={() => void signOut()}>Toka</button>
          </div>
        </aside>
        <main className="hq-main" key={current.councilId}>
          {tab === "maombi" && <Requests />}
          {tab === "ripoti" && <Reports />}
          {tab === "wanachama" && <Members />}
          {tab === "maeneo" && <Areas />}
          {tab === "kumbukumbu" && <Audit />}
          {tab === "mipangilio" && <Settings />}
          {tab === "halmashauri" && isRoot && <Councils />}
        </main>
      </div>
    </HqContext.Provider>
  );
}

function PendingCount() {
  const { councilId } = useHq();
  const pending = useQuery(api.memberships.listForHq, { councilId, status: "pending" });
  if (!pending || pending.length === 0) return null;
  return <span className="badge" aria-label={`${pending.length} yanasubiri`}>{pending.length}</span>;
}
