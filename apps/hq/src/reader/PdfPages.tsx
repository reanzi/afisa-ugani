/**
 * PDF pages with pdf.js. Each page renders once it comes near the screen,
 * at the width it is shown and the screen's pixel density. In dark mode the
 * rendered page goes through the GPU shader (darkShader.ts); without WebGL a
 * CSS filter does a rougher job.
 */
import { useEffect, useRef, useState } from "react";
// The legacy build carries polyfills (e.g. Map.prototype.getOrInsertComputed) that
// the modern build expects from the newest browsers only; offices often run an older Chrome.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { useT } from "@afisa/ui";
import { drawDark } from "./darkShader";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type PageSize = { width: number; height: number };

function PdfPage({ doc, index, size, width, dark }: { doc: PDFDocumentProxy; index: number; size: PageSize; width: number; dark: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const shown = useRef<HTMLCanvasElement>(null);
  const raw = useRef<{ canvas: HTMLCanvasElement; width: number } | null>(null);
  const [near, setNear] = useState(false);
  const [cssDark, setCssDark] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const height = Math.round((width * size.height) / size.width);
  // Render in steps of 160 px so small resizes (a scroll bar appearing) do not restart rendering.
  const renderWidth = Math.ceil(width / 160) * 160;

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const target = Math.round(renderWidth * dpr);
      // Render again only when the size changes; a theme change reuses the render.
      if (!raw.current || raw.current.width !== target) {
        const canvas = document.createElement("canvas");
        try {
          const page = await doc.getPage(index + 1);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: target / page.getViewport({ scale: 1 }).width });
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const render = page.render({ canvas, viewport, background: "rgb(255,255,255)" });
          task = render;
          await render.promise;
        } catch (e) {
          if (cancelled || (e instanceof Error && e.name === "RenderingCancelledException")) return;
          console.error("Afisa Ugani: PDF page failed to render", e);
          setFailed(e instanceof Error ? e.message : String(e));
          return;
        }
        if (cancelled) return;
        raw.current = { canvas, width: target };
        setFailed(null);
      }
      const out = shown.current;
      if (!out || !raw.current) return;
      if (dark && drawDark(raw.current.canvas, out)) {
        setCssDark(false);
        return;
      }
      out.width = raw.current.canvas.width;
      out.height = raw.current.canvas.height;
      out.getContext("2d")?.drawImage(raw.current.canvas, 0, 0);
      setCssDark(dark);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, renderWidth, dark, doc, index]);

  return (
    <div ref={holder} className="sheet pdf-sheet" data-sheet={index} style={{ width, height }}>
      <canvas ref={shown} className={cssDark ? "css-dark" : undefined} style={{ width, height }} aria-label={`Ukurasa ${index + 1}`} />
      {failed && (
        <p className="pdf-failed" role="alert">
          Ukurasa {index + 1} haukuweza kuonyeshwa / Page {index + 1} could not be shown: {failed}
        </p>
      )}
    </div>
  );
}

export function PdfPages({ data, width, dark, onCount }: { data: ArrayBuffer; width: number; dark: boolean; onCount: (n: number) => void }) {
  const t = useT();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // pdf.js takes ownership of the buffer it is given: pass a copy.
    const base = `${import.meta.env.BASE_URL}pdfjs/`;
    const task = pdfjs.getDocument({
      data: new Uint8Array(data.slice(0)),
      // Served by vite-pdfjs-assets.ts: fonts the PDF does not embed, CMaps, decoders, colour profiles.
      standardFontDataUrl: `${base}standard_fonts/`,
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
      wasmUrl: `${base}wasm/`,
      iccUrl: `${base}iccs/`,
    });
    void task.promise
      .then(async (d) => {
        const all: PageSize[] = [];
        for (let i = 1; i <= d.numPages; i++) {
          const vp = (await d.getPage(i)).getViewport({ scale: 1 });
          all.push({ width: vp.width, height: vp.height });
        }
        if (!alive) return;
        setDoc(d);
        setSizes(all);
        onCount(d.numPages);
      })
      .catch(() => alive && setError(t("Faili hili si PDF au limeharibika.", "This file is not a PDF or is damaged.")));
    return () => {
      alive = false;
      void task.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (error) return <div className="notice notice-danger" role="alert"><p>{error}</p></div>;
  if (!doc) return <p className="reader-loading">{t("Inafungua PDF…", "Opening the PDF…")}</p>;
  return (
    <>
      {sizes.map((s, i) => (
        <PdfPage key={i} doc={doc} index={i} size={s} width={width} dark={dark} />
      ))}
    </>
  );
}
