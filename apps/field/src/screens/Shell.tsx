import { NavLink, Outlet, useLocation } from "react-router";
import { clock } from "@afisa/ui";
import { useOnline, useWork } from "../lib/session";
import { requestSync, useSyncEngine } from "../lib/sync";
import { IconLog, IconMe, IconReport, IconToday } from "./icons";

const TABS = [
  { to: "/", label: "Leo", Icon: IconToday },
  { to: "/shughuli", label: "Shughuli", Icon: IconLog },
  { to: "/ripoti", label: "Ripoti", Icon: IconReport },
  { to: "/mimi", label: "Mimi", Icon: IconMe },
] as const;

/** The bottom bar belongs to the four main screens only; nested pages have their own way back. */
function isTopLevel(path: string) {
  const clean = path.replace(/\/+$/, "") || "/";
  return TABS.some((t) => t.to === clean);
}

function SyncStrip() {
  const { councilId } = useWork();
  const online = useOnline();
  const sync = useSyncEngine(councilId, true);

  let text: string;
  let tone: "ok" | "wait" | "off";
  if (!online) {
    text = sync.pending ? `Hakuna mtandao. ${sync.pending} zinasubiri` : "Hakuna mtandao. Endelea kuandika";
    tone = "off";
  } else if (sync.running) {
    text = "Inatuma…";
    tone = "wait";
  } else if (sync.pending) {
    text = `${sync.pending} zinasubiri kutumwa`;
    tone = "wait";
  } else {
    text = sync.lastSyncedAt ? `Zote zimetumwa ${clock(sync.lastSyncedAt)}` : "Zote zimetumwa";
    tone = "ok";
  }

  return (
    <>
      {sync.updateRequired && (
        <div className="notice notice-danger update-required" role="alert">
          <p>Toleo hili ni la zamani. Fungua upya programu ukiwa na mtandao ili kupata toleo jipya.</p>
        </div>
      )}
      <button className={`sync-strip sync-${tone}`} onClick={requestSync} aria-live="polite" title="Tuma sasa">
        <span className="dot" aria-hidden />
        {text}
      </button>
    </>
  );
}

export function Shell() {
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
        <nav className="tabs" aria-label="Kuu">
          {TABS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {({ isActive }) => (
                <>
                  <span className="tab-icon">
                    <Icon active={isActive} />
                  </span>
                  <span className="tab-label">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </footer>
    </div>
  );
}
