import { useRegisterSW } from "virtual:pwa-register/react";

/** Registers the service worker on first load and asks before swapping versions. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="update-bar" role="status">
      <p>Toleo jipya lipo tayari.</p>
      <button className="btn btn-primary btn-small" onClick={() => void updateServiceWorker(true)}>
        Sasisha
      </button>
      <button className="btn btn-quiet btn-small" onClick={() => setNeedRefresh(false)}>
        Baadaye
      </button>
    </div>
  );
}
