/** A bottom sheet that asks once before something that cannot be undone. */
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ConfirmSheet({
  open,
  title,
  confirmLabel,
  cancelLabel = "Bado",
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="confirm-sheet"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
    >
      <div className="confirm-body">
        <h2 id="confirm-title">{title}</h2>
        {children}
        <div className="confirm-actions">
          <button
            type="button"
            className="btn btn-primary btn-block"
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
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-quiet btn-block" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
