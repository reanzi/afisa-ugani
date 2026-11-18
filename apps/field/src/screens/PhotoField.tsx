/**
 * Photos in a record form, taken now with the camera (never from the gallery).
 * New photos are shrunk right away and held here
 * until the record is saved; photos already saved can be viewed or removed.
 * Tapping a photo opens it large, with its kind (whole / close-up) and a
 * caption.
 */
import { useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { isFreshPhoto, MEDIA_PER_RECORD, PHOTO_SHOTS, type PhotoShot } from "@afisa/shared";
import { Dialog, IconCamera, IconCheck, IconTrash } from "@afisa/ui";
import type { LocalMedia } from "../lib/db";
import { nextShot, shrinkPhoto, usePhotoSrc, type PhotoDraft } from "../lib/photos";

type Item =
  | { kind: "draft"; key: string; draft: PhotoDraft }
  | { kind: "saved"; key: string; media: LocalMedia };

const shotLabel = (s: PhotoShot) => PHOTO_SHOTS.find((x) => x.value === s)?.label ?? s;

function useDraftSrc(d: PhotoDraft | undefined, size: "thumb" | "full"): string | null {
  // Drafts are plain blobs; reuse the same hook by shaping them like stored photos.
  return usePhotoSrc(
    d
      ? ({ clientId: d.clientId, councilId: "", recordClientId: "", section: "kilimo", shot: d.shot, width: d.width, height: d.height, bytes: d.blob.size, takenAt: d.takenAt, blob: d.blob, thumb: d.thumb, syncState: "pending" } satisfies LocalMedia)
      : undefined,
    size,
  );
}

function Thumb({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const savedSrc = usePhotoSrc(item.kind === "saved" ? item.media : undefined, "thumb");
  const draftSrc = useDraftSrc(item.kind === "draft" ? item.draft : undefined, "thumb");
  const src = item.kind === "saved" ? savedSrc : draftSrc;
  const shot = item.kind === "saved" ? item.media.shot : item.draft.shot;
  const waiting = item.kind === "saved" && item.media.syncState === "pending";
  const refused = item.kind === "saved" && item.media.syncState === "rejected";
  return (
    <li>
      <button type="button" className="photo-tile" onClick={onOpen} aria-label={`Fungua picha: ${shotLabel(shot)}`}>
        {src ? <img src={src} alt="" /> : <span className="photo-missing">Picha iko kwenye seva</span>}
        <span className="photo-shot">{shotLabel(shot)}</span>
        {waiting && <span className="photo-state" title="Inasubiri kupakiwa">Inasubiri</span>}
        {refused && <span className="photo-state is-bad">Imekataliwa</span>}
      </button>
    </li>
  );
}

function Viewer({
  item,
  onClose,
  onShot,
  onCaption,
  onRemove,
}: {
  item: Item | null;
  onClose: () => void;
  onShot: (s: PhotoShot) => void;
  onCaption: (c: string) => void;
  onRemove: () => void;
}) {
  const savedSrc = usePhotoSrc(item?.kind === "saved" ? item.media : undefined, "full");
  const draftSrc = useDraftSrc(item?.kind === "draft" ? item.draft : undefined, "full");
  const src = item?.kind === "saved" ? savedSrc : draftSrc;
  const editable = item?.kind === "draft";
  const shot = item ? (item.kind === "saved" ? item.media.shot : item.draft.shot) : "nyingine";
  const caption = item ? (item.kind === "saved" ? item.media.caption : item.draft.caption) ?? "" : "";

  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title="Picha"
      actions={
        <>
          <button type="button" className="btn btn-primary btn-block" onClick={onClose}>Sawa</button>
          <button type="button" className="btn btn-quiet btn-block btn-with-icon is-danger-text" onClick={onRemove}>
            <IconTrash size={20} /> Ondoa picha hii
          </button>
        </>
      }
    >
      <div className="photo-view">
        {src ? <img src={src} alt="" /> : <p className="muted">Picha kamili inapatikana ukiwa na mtandao.</p>}
      </div>
      {item?.kind === "saved" && item.media.syncState === "rejected" && (
        <p className="field-error" role="alert">Imekataliwa: {item.media.rejectReason}</p>
      )}
      {editable ? (
        <>
          <fieldset className="field plain">
            <legend>Ni picha ya aina gani?</legend>
            <div className="shot-pick">
              {PHOTO_SHOTS.map((s) => (
                <button key={s.value} type="button" aria-pressed={shot === s.value} onClick={() => onShot(s.value)}>
                  <strong>{s.label}</strong>
                  <small>{s.hint}</small>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>Maelezo ya picha (si lazima)</span>
            <input className="input" maxLength={300} value={caption} onChange={(e) => onCaption(e.target.value)} placeholder="mfano: Jani lenye madoa ya kahawia" />
          </label>
        </>
      ) : (
        <p className="photo-meta">
          <strong>{shotLabel(shot)}</strong>
          {caption ? `: ${caption}` : ""}
        </p>
      )}
    </Dialog>
  );
}

export function PhotoField({
  saved,
  drafts,
  onDrafts,
  onRemoveSaved,
  required,
  error,
}: {
  saved: LocalMedia[];
  drafts: PhotoDraft[];
  onDrafts: (next: PhotoDraft[]) => void;
  onRemoveSaved: (clientId: string) => void;
  required: boolean;
  error?: string | null;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const items: Item[] = [
    ...saved.map((m) => ({ kind: "saved" as const, key: m.clientId, media: m })),
    ...drafts.map((d) => ({ kind: "draft" as const, key: d.clientId, draft: d })),
  ];
  const left = MEDIA_PER_RECORD - items.length;
  const shots = new Set(items.map((i) => (i.kind === "saved" ? i.media.shot : i.draft.shot)));
  const openItem = items.find((i) => i.key === open) ?? null;

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProblem(null);
    setBusy(true);
    const next = [...drafts];
    try {
      let old = 0;
      for (const f of [...files].slice(0, Math.max(0, left))) {
        if (!f.type.startsWith("image/")) continue;
        // Field photos only: a file that is not fresh from the camera came from the gallery.
        if (!isFreshPhoto(f.lastModified)) {
          old++;
          continue;
        }
        const shrunk = await shrinkPhoto(f);
        next.push({ ...shrunk, clientId: uuidv7(), shot: nextShot(saved.length + next.length), takenAt: f.lastModified });
      }
      if (old > 0) setProblem("Picha hii si mpya. Piga picha sasa hapa shambani kwa kamera; picha za zamani kwenye simu hazikubaliwi.");
      else if (files.length > left) setProblem(`Picha ${MEDIA_PER_RECORD} tu kwa kumbukumbu moja.`);
      onDrafts(next);
    } catch {
      setProblem("Picha hii haikuweza kufunguliwa. Jaribu nyingine.");
      onDrafts(next);
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = "";
    }
  };

  const updateDraft = (key: string, patch: Partial<PhotoDraft>) => onDrafts(drafts.map((d) => (d.clientId === key ? { ...d, ...patch } : d)));

  return (
    <section className={`photo-field${error ? " has-error" : ""}`} aria-labelledby="photo-title" id="f-photos">
      <div className="photo-head">
        <h2 id="photo-title" className="field-label">
          Picha{required ? "" : " (si lazima)"}
        </h2>
        {items.length > 0 && <span className="muted">{items.length} kati ya {MEDIA_PER_RECORD}</span>}
      </div>

      {required && (
        <ul className="photo-guide" aria-label="Picha zinazohitajika">
          <li className={shots.has("nzima") ? "is-done" : undefined}>
            <span className="tick" aria-hidden>{shots.has("nzima") ? <IconCheck size={16} /> : null}</span>
            Mmea au mnyama mzima
          </li>
          <li className={shots.has("karibu") ? "is-done" : undefined}>
            <span className="tick" aria-hidden>{shots.has("karibu") ? <IconCheck size={16} /> : null}</span>
            Karibu kwenye tatizo
          </li>
        </ul>
      )}

      {items.length > 0 && (
        <ul className="photo-grid">
          {items.map((it) => (
            <Thumb key={it.key} item={it} onOpen={() => setOpen(it.key)} />
          ))}
        </ul>
      )}

      {left > 0 && (
        <div className="photo-actions">
          <button type="button" className="btn btn-quiet btn-block btn-with-icon" disabled={busy} onClick={() => camera.current?.click()}>
            <IconCamera /> {busy ? "Inaandaa…" : items.length === 0 ? "Piga picha" : "Piga picha nyingine"}
          </button>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void add(e.target.files)} />
        </div>
      )}

      {(problem || error) && <p className="field-error" role="alert">{problem ?? error}</p>}
      {items.length === 0 && (
        <p className="muted small">Picha za shambani tu, zinazopigwa sasa. Epuka nyuso za watu na vitambulisho.</p>
      )}

      <Viewer
        item={openItem}
        onClose={() => setOpen(null)}
        onShot={(s) => openItem?.kind === "draft" && updateDraft(openItem.key, { shot: s })}
        onCaption={(c) => openItem?.kind === "draft" && updateDraft(openItem.key, { caption: c })}
        onRemove={() => {
          if (!openItem) return;
          if (openItem.kind === "draft") onDrafts(drafts.filter((d) => d.clientId !== openItem.key));
          else onRemoveSaved(openItem.key);
          setOpen(null);
        }}
      />
    </section>
  );
}
