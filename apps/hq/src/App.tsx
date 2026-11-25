import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { isHqRole, ROLE_LABELS, type Actor } from "@afisa/shared";
import { ConfirmProvider, FitText, PolicyView, Select, useLabel, useT, useTheme, type T } from "@afisa/ui";
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
import { SectionCodes } from "./SectionCodes";
import { AccountPage } from "./pages/Account";
import { Slaughterhouses } from "./pages/Slaughterhouses";
import { NAV_ICONS } from "./navIcons";

const TABS = ["maombi", "ripoti", "viwango", "wanachama", "maeneo", "machinjio", "kumbukumbu", "mipangilio", "halmashauri", "akaunti", "sera"] as const;
/** Council pages in the side menu; "akaunti" and "sera" open from the account menu, "halmashauri" is root's system view. */
const NAV = ["maombi", "ripoti", "viwango", "wanachama", "maeneo", "machinjio", "kumbukumbu", "mipangilio"] as const;
type Tab = (typeof TABS)[number];
const tabLabel = (t: T, tab: Tab): string =>
  ({
    maombi: t("Maombi", "Requests"),
    ripoti: t("Ripoti", "Reports"),
    viwango: t("Viwango", "Presets"),
    wanachama: t("Wanachama", "Members"),
    maeneo: t("Maeneo", "Areas"),
    machinjio: t("Machinjio", "Slaughterhouses"),
    kumbukumbu: t("Kumbukumbu", "Activity log"),
    mipangilio: t("Mipangilio", "Settings"),
    halmashauri: t("Halmashauri zote", "All councils"),
    akaunti: t("Akaunti yangu", "My account"),
    sera: t("Sera ya matumizi", "Usage policy"),
  })[tab];

function hqCouncils(me: Me, rootCouncils: { _id: Id<"councils">; name: string; displayName: string | null }[] | undefined) {
  const isRoot = "isRoot" in me;
  if (isRoot) return (rootCouncils ?? []).map((c) => ({ councilId: c._id, councilName: c.displayName || c.name, councilFullName: c.name }));
  return me.memberships
    .filter((m) => m.status === "active" && isHqRole(m.role))
    .map((m) => ({ councilId: m.councilId, councilName: m.councilDisplayName || m.councilName, councilFullName: m.councilName }));
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
  // The council open on root's "All councils" page (see Councils).
  const [, setCouncilDetail] = useQueryState("halmashauri", parseAsString);
  const showAllCouncils = () => {
    void setCouncilDetail(null);
    void setTab("halmashauri");
  };
  const openCouncil = (id: string) => {
    void setCouncilDetail(null);
    void setCouncilParam(id);
    void setTab("maombi");
  };
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
            <button aria-current={tab !== "akaunti" && tab !== "sera" ? "page" : undefined} onClick={showAllCouncils}>
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
          {tab === "akaunti" ? <AccountPage me={me} /> : tab === "sera" ? <section className="hq-page"><PolicyView /></section> : <Councils onOpen={openCouncil} />}
        </main>
      </div>
    );
  }
  const current = councils.find((c) => c.councilId === councilParam) ?? councils[0]!;
  /** Root's system view: every council, not one council's data. */
  const inSystem = isRoot && tab === "halmashauri";
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
    <HqContext.Provider value={{ me, councilId: current.councilId, councilName: current.councilName, councilFullName: current.councilFullName, actor }}>
      <div className="hq">
        <aside className="hq-side">
          <div className="hq-brand">
            <img src="/favicon.svg" alt="" width={36} height={36} />
            <div>
              <strong>Afisa Ugani</strong>
              {isRoot && <span className="muted">{t("Msimamizi wa mfumo", "System administrator")}</span>}
              {!isRoot && councils.length === 1 && <FitText text={current.councilName} className="muted" />}
            </div>
          </div>
          {isRoot && (
            <nav className="hq-nav hq-nav-system" aria-label={t("Mfumo", "System")}>
              <button aria-current={inSystem ? "page" : undefined} onClick={showAllCouncils}>
                {NAV_ICONS.halmashauri}
                <span>{tabLabel(t, "halmashauri")}</span>
              </button>
            </nav>
          )}
          {(isRoot || councils.length > 1) && (
            <div className="hq-switcher">
              <span className="field-label" id="council-switch">{t("Halmashauri unayoiangalia", "Council you are viewing")}</span>
              <Select
                size="sm"
                labelledBy="council-switch"
                label={t("Halmashauri", "Council")}
                value={current.councilId}
                onChange={(v) => {
                  void setCouncilParam(v);
                  if (inSystem) void setTab("maombi");
                }}
                options={councils.map((c) => ({ value: c.councilId, label: c.councilName, hint: c.councilName !== c.councilFullName ? c.councilFullName : undefined }))}
              />
            </div>
          )}
          <nav className="hq-nav" aria-label={t("Halmashauri", "Council")}>
            {NAV.map((x) => (
              <button key={x} aria-current={tab === x ? "page" : undefined} onClick={() => void setTab(x)}>
                {NAV_ICONS[x]}
                <span>{tabLabel(t, x)}</span>
                {x === "maombi" && <PendingCount />}
                {x === "viwango" && <PendingPresets />}
              </button>
            ))}
          </nav>
          {!inSystem && <SectionCodes />}
          <AccountMenu
            name={me.name}
            roleText={actor.isRoot ? t("Msimamizi wa mfumo", "System administrator") : actor.role ? label(ROLE_LABELS[actor.role]) : ""}
            checkNumber={me.checkNumber}
            onAccount={() => void setTab("akaunti")}
            onPolicy={() => void setTab("sera")}
            onSignOut={() => void signOut()}
          />
        </aside>
        <main className="hq-main" key={inSystem ? "system" : current.councilId}>
          {isRoot && !inSystem && tab !== "akaunti" && tab !== "sera" && (
            <div className="hq-viewing" role="status">
              {t("Unaangalia:", "Viewing:")} <strong>{current.councilFullName}</strong>
              <button type="button" className="link small" onClick={showAllCouncils}>{t("Halmashauri zote", "All councils")}</button>
            </div>
          )}
          {tab === "maombi" && <Requests />}
          {tab === "ripoti" && <Reports />}
          {tab === "viwango" && <Presets />}
          {tab === "wanachama" && <Members />}
          {tab === "maeneo" && <Areas />}
          {tab === "machinjio" && <Slaughterhouses />}
          {tab === "kumbukumbu" && <Audit />}
          {tab === "mipangilio" && <Settings />}
          {inSystem && (
            <Councils onOpen={openCouncil} />
          )}
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
