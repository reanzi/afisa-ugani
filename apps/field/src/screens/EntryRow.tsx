import type { ReactNode } from "react";
import { Link } from "react-router";
import { actionByType, L, summarize } from "@afisa/shared";
import { clock, IconCamera } from "@afisa/ui";
import type { LocalRecord } from "../lib/db";

const REJECT_REASONS: Record<string, [string, string]> = {
  SECTION_NOT_ALLOWED: ["Sehemu hii haikuruhusiwi", "Section not allowed"],
  AREA_NOT_ASSIGNED: ["Eneo hili si lako", "Not your area"],
  AREA_UNKNOWN: ["Eneo halipo tena", "Area no longer exists"],
  FUTURE_DATE: ["Tarehe iko mbele", "Date is in the future"],
  NOT_OWNER: ["Si kumbukumbu yako", "Not your record"],
  PAYLOAD_VERSION: ["Toleo la zamani", "Old version"],
  INVALID_ID: ["Hitilafu ya kumbukumbu", "Record error"],
};

function rejectText(reason?: string): string {
  if (reason?.startsWith("INVALID_PAYLOAD")) return L("Taarifa hazijakamilika", "Details incomplete");
  const r = REJECT_REASONS[reason ?? ""];
  return r ? L(...r) : L("Imekataliwa", "Rejected");
}

export function syncLabel(r: LocalRecord): { text: string; tone: string } {
  if (r.syncState === "synced") return { text: L("Imetumwa", "Sent"), tone: "ok" };
  if (r.syncState === "rejected") return { text: rejectText(r.rejectReason), tone: "danger" };
  return { text: L("Inasubiri", "Waiting"), tone: "wait" };
}

export function entryText(r: LocalRecord): string {
  return summarize(r.type, r.payload) || (actionByType(r.type)?.label ?? r.type);
}

export function EntryRow({ record, areaName, trailing, photos = 0 }: { record: LocalRecord; areaName?: string; trailing?: ReactNode; photos?: number }) {
  const s = syncLabel(record);
  return (
    <li className={trailing ? "entry-with-copy" : undefined}>
      <Link to={`/andika/${record.type}/${record.clientId}`} className={`entry sec sec-${record.section}`}>
        <span className="entry-time">{clock(record.occurredAt)}</span>
        <span className="entry-main">
          <span className="entry-text">{entryText(record)}</span>
          <span className="entry-meta">
            <span>{actionByType(record.type)?.label}</span>
            {areaName && <span>{areaName}</span>}
            {photos > 0 && (
              <span className="entry-photos" aria-label={L(`Picha ${photos}`, `${photos} photos`)}>
                <IconCamera size={16} /> {photos}
              </span>
            )}
          </span>
        </span>
        <span className={`entry-sync tone-${s.tone}`}>{s.text}</span>
      </Link>
      {trailing}
    </li>
  );
}
