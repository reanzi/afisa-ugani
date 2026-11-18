import { NavLink, Outlet } from "react-router";
import { clock } from "@afisa/ui";
import { useOnline, useWork } from "../lib/session";
import { requestSync, useSyncEngine } from "../lib/sync";

function SyncStatus() {
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
      <button className={`sync-pill sync-${tone}`} onClick={requestSync} aria-live="polite">
        <span className="dot" aria-hidden />
        {text}
      </button>
    </>
  );
}

export function Shell() {
  return (
    <div className="shell">
      <div className="shell-body">
        <Outlet />
      </div>
      <footer className="dock">
        <SyncStatus />
        <nav className="tabs" aria-label="Kuu">
          <NavLink to="/" end>
            Leo
          </NavLink>
          <NavLink to="/shughuli">Shughuli</NavLink>
          <NavLink to="/ripoti">Ripoti</NavLink>
          <NavLink to="/mimi">Mimi</NavLink>
        </nav>
      </footer>
    </div>
  );
}
