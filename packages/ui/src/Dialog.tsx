/**
 * Our own modal dialogs, never the browser's alert/confirm: a bottom sheet on
 * phones, a centred card on wider screens. Built on <dialog> for focus
 * trapping and Escape; the backdrop closes it unless it is busy.
 */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useT } from "./i18n";

export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      {open && (
        <div className="dialog-body">
          <h2 id={titleId} className="dialog-title">{title}</h2>
          {children && <div className="dialog-content">{children}</div>}
          <div className="dialog-actions">{actions}</div>
        </div>
      )}
    </dialog>
  );
}

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" for deleting or anything that cannot be undone and loses work. */
  tone?: "primary" | "danger";
};

/** A dialog that asks once before an action. `onConfirm` may be async; the dialog waits for it. */
export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  children,
}: ConfirmOptions & { open: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void; children?: ReactNode }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      busy={busy}
      actions={
        <>
          <button
            type="button"
            className={`btn btn-block ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t("Subiri…", "Please wait…") : confirmLabel}
          </button>
          <button type="button" className="btn btn-quiet btn-block" disabled={busy} onClick={onCancel}>
            {cancelLabel ?? t("Hapana", "Cancel")}
          </button>
        </>
      }
    >
      {body}
      {children}
    </Dialog>
  );
}

type Ask = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Ask | null>(null);

/** Mount once near the root; then `const confirm = useConfirm(); if (await confirm({...}))`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback<Ask>((o) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <ConfirmDialog
        open={state !== null}
        title={state?.title ?? ""}
        body={state?.body}
        confirmLabel={state?.confirmLabel ?? ""}
        cancelLabel={state?.cancelLabel}
        tone={state?.tone}
        onConfirm={() => done(true)}
        onCancel={() => done(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error("useConfirm needs <ConfirmProvider> above it");
  return ask;
}
