/**
 * Before first use: the usage policy, agreed once. Works offline; the
 * agreement reaches the server with the next sync.
 */
import { useState } from "react";
import { POLICY_VERSION } from "@afisa/shared";
import { PolicyView, useT } from "@afisa/ui";
import { setMeta } from "../lib/db";
import { requestSync } from "../lib/sync";

export const POLICY_META = "policyAccepted";

export function PolicyGate({ onAccepted }: { onAccepted: () => void }) {
  const [read, setRead] = useState(false);
  const t = useT();
  const accept = async () => {
    await setMeta(POLICY_META, { version: POLICY_VERSION, at: Date.now() });
    requestSync();
    onAccepted();
  };
  return (
    <main className="page narrow policy-gate">
      <PolicyView />
      <label className="check-row">
        <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
        <span>{t("Nimesoma na kuelewa sera hii.", "I have read and understood this policy.")}</span>
      </label>
      <button className="btn btn-primary btn-block" disabled={!read} onClick={() => void accept()}>
        {t("Nakubali, endelea", "I agree, continue")}
      </button>
    </main>
  );
}
