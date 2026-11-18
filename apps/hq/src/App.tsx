import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { isHqRole, ROLE_LABELS, type Actor } from "@afisa/shared";
import { ConfirmProvider, PolicyView, Select, useLabel, useT, useTheme, type T } from "@afisa/ui";
import { HqContext, useHq, type Me } from "./context";
import { Requests } from "./pages/Requests";
import { Members } from "./pages/Members";
import { Areas } from "./pages/Areas";
import { Audit } from "./pages/Audit";
import { Councils } from "./pages/Councils";
import { Reports } from "./pages/Reports";
import { Presets } from "./pages/Presets";
import { Settings } from "./pages/Settings";
import { JoinWithCode, NoAccess, SignIn, Waiting } from "./auth";
import { AccountMenu } from "./AccountMenu";
import { AccountPage } from "./pages/Account";
import { NAV_ICONS } from "./navIcons";

const TABS = ["maombi", "ripoti", "viwango", "wanachama", "maeneo", "kumbukumbu", "mipangilio", "halmashauri", "akaunti", "sera"] as const;
/** Pages in the side menu; "akaunti" and "sera" open from the account menu. */
const NAV = ["maombi", "ripoti", "viwango", "wanachama", "maeneo", "kumbukumbu", "mipangilio", "halmashauri"] as const;
type Tab = (typeof TABS)[number];
const tabLabel = (t: T, tab: Tab): string =>
  ({
    maombi: t("Maombi", "Requests"),
    ripoti: t("Ripoti", "Reports"),
    viwango: t("Viwango", "Presets"),
    wanachama: t("Wanachama", "Members"),
    maeneo: t("Maeneo", "Areas"),
    kumbukumbu: t("Kumbukumbu", "Activity log"),
    mipangilio: t("Mipangilio", "Settings"),
    halmashauri: t("Halmashauri", "Councils"),
    akaunti: t("Akaunti yangu", "My account"),
    sera: t("Sera ya matumizi", "Usage policy"),
  })[tab];

function hqCouncils(me: Me, rootCouncils: { _id: Id<"councils">; name: string }[] | undefined) {
  const isRoot = "isRoot" in me;
  if (isRoot) return (rootCouncils ?? []).map((c) => ({ councilId: c._id, councilName: c.name }));
  return me.memberships
    .filter((m) => m.status === "active" && isHqRole(m.role))
    .map((m) => ({ councilId: m.councilId, councilName: m.councilName }));
}

export function App() {
  return (
    <ConfirmProvider>
      <Main />
    </ConfirmProvider>
  );
}

function Main() {
  useTheme();
  const t = useT();
  const label = useLabel();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const rootCouncils = useQuery(api.councils.listMine, me && "isRoot" in me ? {} : "skip");
  const [councilParam, setCouncilParam] = useQueryState("c", parseAsString);
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("maombi"));
  const { signOut } = useAuthActions();

  if (isLoading || (isAuthenticated && me === undefined)) {
    return <main className="hq-auth"><p className="muted">{t("Inafungua…", "Opening…")}</p></main>;
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
            <div><strong>Afisa Ugani</strong><span className="muted">{t("Msimamizi wa mfumo", "System administrator")}</span></div>
          </div>
          <nav className="hq-nav" aria-label={t("Kuu", "Main")}>
            <button aria-current={tab !== "akaunti" && tab !== "sera" ? "page" : undefined} onClick={() => void setTab("halmashauri")}>
              {NAV_ICONS.halmashauri}<span>{tabLabel(t, "halmashauri")}</span>
            </button>
          </nav>
          <AccountMenu
            name={me.name}
            roleText={t("Msimamizi wa mfumo", "System administrator")}
            checkNumber={me.checkNumber}
            onAccount={() => void setTab("akaunti")}
            onPolicy={() => void setTab("sera")}
            onSignOut={() => void signOut()}
          />
        </aside>
        <main className="hq-main">
          {tab === "akaunti" ? <AccountPage me={me} /> : tab === "sera" ? <section className="hq-page"><PolicyView /></section> : <Councils />}
        </main>
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
                  label={t("Halmashauri", "Council")}
                  value={current.councilId}
                  onChange={(v) => void setCouncilParam(v)}
                  options={councils.map((c) => ({ value: c.councilId, label: c.councilName }))}
                />
              ) : (
                <span className="muted">{current.councilName}</span>
              )}
            </div>
          </div>
          <nav className="hq-nav" aria-label={t("Kuu", "Main")}>
            {NAV.filter((x) => x !== "halmashauri" || isRoot).map((x) => (
              <button key={x} aria-current={tab === x ? "page" : undefined} onClick={() => void setTab(x)}>
                {NAV_ICONS[x]}
                <span>{tabLabel(t, x)}</span>
                {x === "maombi" && <PendingCount />}
                {x === "viwango" && <PendingPresets />}
              </button>
            ))}
          </nav>
          <AccountMenu
            name={me.name}
            roleText={actor.isRoot ? t("Msimamizi wa mfumo", "System administrator") : actor.role ? label(ROLE_LABELS[actor.role]) : ""}
            checkNumber={me.checkNumber}
            onAccount={() => void setTab("akaunti")}
            onPolicy={() => void setTab("sera")}
            onSignOut={() => void signOut()}
          />
        </aside>
        <main className="hq-main" key={current.councilId}>
          {tab === "maombi" && <Requests />}
          {tab === "ripoti" && <Reports />}
          {tab === "viwango" && <Presets />}
          {tab === "wanachama" && <Members />}
          {tab === "maeneo" && <Areas />}
          {tab === "kumbukumbu" && <Audit />}
          {tab === "mipangilio" && <Settings />}
          {tab === "halmashauri" && isRoot && <Councils />}
          {tab === "akaunti" && <AccountPage me={me} />}
          {tab === "sera" && <section className="hq-page"><PolicyView /></section>}
        </main>
      </div>
    </HqContext.Provider>
  );
}

function PendingCount() {
  const t = useT();
  const { councilId } = useHq();
  const pending = useQuery(api.memberships.listForHq, { councilId, status: "pending" });
  if (!pending || pending.length === 0) return null;
  return <span className="badge" aria-label={t(`${pending.length} yanasubiri`, `${pending.length} waiting`)}>{pending.length}</span>;
}

function PendingPresets() {
  const t = useT();
  const { councilId } = useHq();
  const pending = useQuery(api.presets.forHq, { councilId, status: "pending" });
  const mine = pending?.filter((p) => p.canDecide).length ?? 0;
  if (mine === 0) return null;
  return <span className="badge" aria-label={t(`${mine} vinasubiri idhini yako`, `${mine} waiting for your approval`)}>{mine}</span>;
}
