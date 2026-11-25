import { useRegisterSW } from "virtual:pwa-register/react";
import { useT } from "@afisa/ui";

/** Registers the service worker on first load and asks before swapping versions. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const t = useT();
  if (!needRefresh) return null;
  return (
    <div className="update-bar" role="status">
      <p>{t("Toleo jipya lipo tayari.", "A new version is ready.")}</p>
      <button className="btn btn-primary btn-small" onClick={() => void updateServiceWorker(true)}>
        {t("Sasisha", "Update")}
      </button>
      <button className="btn btn-quiet btn-small" onClick={() => setNeedRefresh(false)}>
        {t("Baadaye", "Later")}
      </button>
    </div>
  );
}
