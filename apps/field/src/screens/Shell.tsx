import { NavLink, Outlet, useLocation } from "react-router";
import { clock, useT } from "@afisa/ui";
import { useOnline, useWork } from "../lib/session";
import { requestSync, useSyncEngine } from "../lib/sync";
import { IconLog, IconMe, IconReport, IconToday } from "./icons";

const TABS = [
  { to: "/", label: ["Leo", "Today"], Icon: IconToday },
  { to: "/shughuli", label: ["Shughuli", "Activity"], Icon: IconLog },
  { to: "/ripoti", label: ["Ripoti", "Reports"], Icon: IconReport },
  { to: "/mimi", label: ["Mimi", "Me"], Icon: IconMe },
] as const;

/** The bottom bar belongs to the four main screens only; nested pages have their own way back. */
function isTopLevel(path: string) {
  const clean = path.replace(/\/+$/, "") || "/";
  return TABS.some((t) => t.to === clean);
}

function SyncStrip() {
  const t = useT();
  const { councilId } = useWork();
  const online = useOnline();
  const sync = useSyncEngine(councilId, true);

  let text: string;
  let tone: "ok" | "wait" | "off";
  if (!online) {
    text = sync.pending ? t(`Hakuna mtandao. ${sync.pending} zinasubiri`, `Offline. ${sync.pending} waiting`) : t("Hakuna mtandao. Endelea kuandika", "Offline. Keep recording");
    tone = "off";
  } else if (sync.running) {
    text = t("Inatuma…", "Sending…");
    tone = "wait";
  } else if (sync.pending) {
    text = t(`${sync.pending} zinasubiri kutumwa`, `${sync.pending} waiting to send`);
    tone = "wait";
  } else {
    text = sync.lastSyncedAt ? t(`Zote zimetumwa ${clock(sync.lastSyncedAt)}`, `All sent ${clock(sync.lastSyncedAt)}`) : t("Zote zimetumwa", "All sent");
    tone = "ok";
  }

  return (
    <>
      {sync.updateRequired && (
        <div className="notice notice-danger update-required" role="alert">
          <p>{t("Toleo hili ni la zamani. Fungua upya programu ukiwa na mtandao ili kupata toleo jipya.", "This version is out of date. Reopen the app while online to get the new one.")}</p>
        </div>
      )}
      <button className={`sync-strip sync-${tone}`} onClick={requestSync} aria-live="polite" title={t("Tuma sasa", "Send now")}>
        <span className="dot" aria-hidden />
        {text}
      </button>
    </>
  );
}

export function Shell() {
  const t = useT();
  const { pathname } = useLocation();
  const top = isTopLevel(pathname);
  return (
    <div className={`shell ${top ? "has-dock" : "is-nested"}`}>
      <div className="shell-body">
        <Outlet />
      </div>
      {/* Sync keeps running on nested pages; only the bar is hidden. */}
      <footer className="dock" hidden={!top}>
        <SyncStrip />
        <nav className="tabs" aria-label={t("Kuu", "Main")}>
          {TABS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {({ isActive }) => (
                <>
                  <span className="tab-icon">
                    <Icon active={isActive} />
                  </span>
                  <span className="tab-label">{t(label[0], label[1])}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </footer>
    </div>
  );
}
