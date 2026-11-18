import { useState, type FormEvent } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useSignInWithUsernamePassword } from "@convex-dev/auth/methods/username-password/react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { isHqRole, ROLE_LABELS, type Actor } from "@afisa/shared";
import { authErrorMessage, useTheme } from "@afisa/ui";
import { HqContext, useHq, type Me } from "./context";
import { Requests } from "./pages/Requests";
import { Members } from "./pages/Members";
import { Areas } from "./pages/Areas";
import { Audit } from "./pages/Audit";

const TABS = ["maombi", "wanachama", "maeneo", "kumbukumbu"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  maombi: "Maombi",
  wanachama: "Wanachama",
  maeneo: "Maeneo",
  kumbukumbu: "Kumbukumbu",
};

function SignIn() {
  const { signIn, pending } = useSignInWithUsernamePassword(api.auth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await signIn({ username: username.trim(), password });
    if (res.status !== "complete") setError(authErrorMessage(res.userError));
  };
  return (
    <main className="hq-auth">
      <form className="hq-auth-card" onSubmit={submit}>
        <h1>Afisa Ugani</h1>
        <p className="muted">Makao makuu: maombi, wanachama, maeneo na kumbukumbu.</p>
        <label className="field">
          <span>Jina la mtumiaji</span>
          <input id="username" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">
          <span>Nenosiri</span>
          <input id="password" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
        <button className="btn btn-primary btn-block" disabled={pending || !username || !password}>
          {pending ? "Subiri…" : "Ingia"}
        </button>
      </form>
    </main>
  );
}

function NoAccess() {
  const { signOut } = useAuthActions();
  return (
    <main className="hq-auth">
      <div className="hq-auth-card">
        <h1>Huna ruhusa ya makao makuu</h1>
        <p>Akaunti hii ni ya afisa ugani. Tumia programu ya Afisa Ugani kwenye simu kuandika kazi zako.</p>
        <button className="btn btn-quiet btn-block" onClick={() => void signOut()}>Toka</button>
      </div>
    </main>
  );
}

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

  const councils = hqCouncils(me, rootCouncils);
  if (councils.length === 0) return "isRoot" in me && rootCouncils === undefined ? null : <NoAccess />;
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
                <select
                  className="select council-select"
                  value={current.councilId}
                  onChange={(e) => void setCouncilParam(e.target.value)}
                  aria-label="Halmashauri"
                >
                  {councils.map((c) => <option key={c.councilId} value={c.councilId}>{c.councilName}</option>)}
                </select>
              ) : (
                <span className="muted">{current.councilName}</span>
              )}
            </div>
          </div>
          <nav className="hq-nav" aria-label="Kuu">
            {TABS.map((t) => (
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
          {tab === "wanachama" && <Members />}
          {tab === "maeneo" && <Areas />}
          {tab === "kumbukumbu" && <Audit />}
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
