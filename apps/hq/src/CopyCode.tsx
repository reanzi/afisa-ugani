import { useState } from "react";
import { formatCouncilCode } from "@afisa/shared";
import { IconCheck, IconCopy, useT } from "@afisa/ui";

/** Copies a council code ("ABCD-EFGH"). `compact` shows the icon only, for tables. */
export function CopyCode({ code, compact = false }: { code: string; compact?: boolean }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const label = copied ? t("Imenakiliwa", "Copied") : t("Nakili msimbo", "Copy code");
  return (
    <button
      type="button"
      className={compact ? "icon-btn copy-btn" : "btn btn-quiet btn-small copy-btn"}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(formatCouncilCode(code));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <IconCheck size={compact ? 16 : 18} /> : <IconCopy size={compact ? 16 : 18} />}
      {!compact && <span>{copied ? t("Imenakiliwa", "Copied") : t("Nakili", "Copy")}</span>}
    </button>
  );
}
