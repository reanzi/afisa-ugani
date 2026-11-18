/**
 * HQ's document reader: reports (and PDFs) as pages on a desk, with a list
 * of pages, zoom, dark paper, print and Word download. Photos that came
 * with a report open large, one after another.
 */
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import type { Report } from "@afisa/shared";
import { errorMessage, FitText, IconClose, IconDownload, useT, useTheme } from "@afisa/ui";
import { useHq } from "../context";
import { ReportSheets, sheetTitles, type ReaderPhoto } from "./ReportSheets";
// pdf.js is large: load it only when a PDF is opened.
const PdfPages = lazy(() => import("./PdfPages").then((m) => ({ default: m.PdfPages })));
import "./reader.css";

export type ReaderDoc =
  | { kind: "report"; title: string; subtitle?: string; report: Report; submissionId?: Id<"submissions"> }
  | { kind: "pdf"; title: string; subtitle?: string; data: ArrayBuffer };

/** Width the paper is laid out at (A4 landscape at 96 dpi); zoom scales it. */
const SHEET_WIDTH = 1123;
const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

const Sun = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
);
const Printer = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <path d="M7 14h10v7H7z" />
  </svg>
);

function ReportPhotos({ submissionId, children }: { submissionId?: Id<"submissions">; children: (photos: ReaderPhoto[]) => React.ReactNode }) {
  const { councilId } = useHq();
  const photos = useQuery(api.submissions.photosForHq, submissionId ? { councilId, submissionId } : "skip");
  return <>{children(photos ?? [])}</>;
}

function PhotoViewer({ photos, index, onIndex, onClose }: { photos: ReaderPhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const t = useT();
  const p = photos[index]!;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onIndex]);
  const l = p.record.labels;
  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={t("Picha", "Photo")}>
      <div className="photo-viewer-bar">
        <span>{index + 1} / {photos.length}</span>
        <button type="button" className="reader-btn" onClick={onClose} aria-label={t("Funga picha", "Close photo")}>
          <IconClose />
        </button>
      </div>
      <div className="photo-viewer-stage">
        <button type="button" className="photo-nav" disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label={t("Iliyotangulia", "Previous")}>‹</button>
        <img src={p.url} alt="" />
        <button type="button" className="photo-nav" disabled={index === photos.length - 1} onClick={() => onIndex(index + 1)} aria-label={t("Inayofuata", "Next")}>›</button>
      </div>
      <dl className="photo-viewer-labels">
        {l.category && <div><dt>{t("Inaonyesha", "Shows")}</dt><dd>{l.category}</dd></div>}
        {l.subject && <div><dt>{t("Zao au mnyama", "Crop or animal")}</dt><dd>{l.subject}</dd></div>}
        {l.suspected && <div><dt>{t("Inadhaniwa", "Suspected")}</dt><dd>{l.suspected}</dd></div>}
        {l.severity && <div><dt>{t("Ukubwa", "Severity")}</dt><dd>{l.severity}</dd></div>}
        {l.stage && <div><dt>{t("Hatua", "Stage")}</dt><dd>{l.stage}</dd></div>}
        <div className="wide"><dt>{t("Kumbukumbu", "Record")}</dt><dd>{p.record.summary}</dd></div>
        {p.caption && <div className="wide"><dt>{t("Maelezo ya picha", "Caption")}</dt><dd>{p.caption}</dd></div>}
      </dl>
    </div>
  );
}

export function Reader({ doc, onClose }: { doc: ReaderDoc; onClose: () => void }) {
  const t = useT();
  const { theme } = useTheme();
  const [dark, setDark] = useState(theme === "usiku");
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fitWidth, setFitWidth] = useState(SHEET_WIDTH);
  const [current, setCurrent] = useState(0);
  const [pdfCount, setPdfCount] = useState(0);
  const [photo, setPhoto] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desk = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  // Fit: the paper as wide as the desk allows, never wider than the sheet.
  useLayoutEffect(() => {
    const el = desk.current;
    if (!el) return;
    const measure = () => setFitWidth(Math.min(SHEET_WIDTH, el.clientWidth - 48));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const width = Math.round(zoom === "fit" ? fitWidth : SHEET_WIDTH * zoom);
  const scale = width / SHEET_WIDTH;

  // Which page is in view.
  useEffect(() => {
    const el = desk.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setCurrent(Number((top.target as HTMLElement).dataset.sheet ?? 0));
      },
      { root: el, threshold: 0.25 },
    );
    const watch = () => el.querySelectorAll("[data-sheet]").forEach((s) => io.observe(s));
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  // Keys: Escape closes (or the photo first); +/- zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (photo !== null) setPhoto(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    root.current?.focus();
    document.body.classList.add("reader-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("reader-open");
    };
  }, [onClose, photo]);

  const goTo = useCallback((i: number) => {
    desk.current?.querySelector(`[data-sheet="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const step = (d: 1 | -1) => {
    const now = zoom === "fit" ? scale : zoom;
    const next = d > 0 ? ZOOMS.find((z) => z > now + 0.01) : [...ZOOMS].reverse().find((z) => z < now - 0.01);
    if (next) setZoom(next);
  };

  const print = () => {
    // Paper prints light whatever the screen shows.
    const was = dark;
    setDark(false);
    window.setTimeout(() => {
      window.print();
      setDark(was);
    }, 300);
  };

  const download = async () => {
    if (doc.kind !== "report") return;
    setBusy(true);
    setError(null);
    try {
      const { reportToDocx, reportFileName } = await import("@afisa/ui/docx");
      const blob = await reportToDocx(doc.report);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportFileName(doc.report);
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const body = (photos: ReaderPhoto[]) => {
    const titles = doc.kind === "report" ? sheetTitles(doc.report, photos.length, t) : Array.from({ length: pdfCount }, (_, i) => `${t("Ukurasa", "Page")} ${i + 1}`);
    return (
      <>
        <header className="reader-bar">
          <button type="button" className="reader-btn" onClick={onClose} aria-label={t("Funga", "Close")} title={t("Funga (Esc)", "Close (Esc)")}>
            <IconClose />
          </button>
          <div className="reader-title">
            <FitText text={doc.title} className="reader-title-main" />
            {doc.subtitle && <FitText text={doc.subtitle} className="reader-title-sub" />}
          </div>
          <span className="reader-page" aria-live="polite">
            {titles.length ? `${current + 1} / ${titles.length}` : ""}
          </span>
          <div className="reader-zoom" role="group" aria-label={t("Ukubwa", "Zoom")}>
            <button type="button" className="reader-btn" onClick={() => step(-1)} aria-label={t("Punguza", "Zoom out")}>−</button>
            <button type="button" className="reader-btn reader-zoom-value" onClick={() => setZoom("fit")} title={t("Upana wa skrini", "Fit width")}>
              {Math.round(scale * 100)}%
            </button>
            <button type="button" className="reader-btn" onClick={() => step(1)} aria-label={t("Ongeza", "Zoom in")}>+</button>
          </div>
          <button
            type="button"
            className="reader-btn"
            aria-pressed={dark}
            onClick={() => setDark((d) => !d)}
            title={dark ? t("Karatasi nyeupe", "Light paper") : t("Karatasi nyeusi", "Dark paper")}
            aria-label={dark ? t("Karatasi nyeupe", "Light paper") : t("Karatasi nyeusi", "Dark paper")}
          >
            {dark ? <Sun /> : <Moon />}
          </button>
          <button type="button" className="reader-btn" onClick={print} aria-label={t("Chapisha", "Print")} title={t("Chapisha", "Print")}>
            <Printer />
          </button>
          {doc.kind === "report" && (
            <button type="button" className="reader-btn reader-btn-text" disabled={busy} onClick={() => void download()}>
              <IconDownload size={18} /> {busy ? t("Inaandaa…", "Preparing…") : "Word"}
            </button>
          )}
        </header>
        {error && <div className="notice notice-danger reader-error" role="alert"><p>{error}</p></div>}
        <div className="reader-main">
          <nav className="reader-toc" aria-label={t("Kurasa", "Pages")}>
            <ol>
              {titles.map((title, i) => (
                <li key={i}>
                  <button type="button" aria-current={i === current ? "page" : undefined} onClick={() => goTo(i)}>
                    <span className="toc-n">{i + 1}</span>
                    <span className="toc-t">{title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div ref={desk} className="reader-desk" tabIndex={0}>
            <div className="reader-pages" style={{ ["--sheet-scale" as string]: scale }}>
              {doc.kind === "report" ? (
                <ReportSheets report={doc.report} photos={photos} onPhoto={setPhoto} />
              ) : (
                <Suspense fallback={<p className="reader-loading">{t("Inafungua PDF…", "Opening the PDF…")}</p>}>
                  <PdfPages data={doc.data} width={width} dark={dark} onCount={setPdfCount} />
                </Suspense>
              )}
            </div>
          </div>
        </div>
        {photo !== null && photos[photo] && <PhotoViewer photos={photos} index={photo} onIndex={setPhoto} onClose={() => setPhoto(null)} />}
      </>
    );
  };

  return (
    <div ref={root} className={`reader${dark ? " is-dark" : ""}`} role="dialog" aria-modal="true" aria-label={doc.title} tabIndex={-1}>
      {doc.kind === "report" ? <ReportPhotos submissionId={doc.submissionId}>{body}</ReportPhotos> : body([])}
    </div>
  );
}
