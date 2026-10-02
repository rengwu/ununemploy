import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
GlobalWorkerOptions.workerSrc = workerUrl;

function PdfPage({
  document,
  number,
  width,
  zoom,
}: {
  document: PDFDocumentProxy;
  number: number;
  width: number;
  zoom: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let cancel = () => {};
    setError("");
    void (async () => {
      const page = await document.getPage(number);
      if (!active || !host.current) return;
      const viewport = page.getViewport({
        scale:
          zoom === "fit"
            ? width / page.getViewport({ scale: 1 }).width
            : ((Number(zoom) / 100) * 96) / 72,
      });
      const canvas = window.document.createElement("canvas");
      const layer = window.document.createElement("div");
      layer.className = "textLayer";
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.setAttribute("aria-hidden", "true");
      host.current.style.setProperty("--scale-factor", String(viewport.scale));
      host.current.style.setProperty(
        "--total-scale-factor",
        String(viewport.scale),
      );
      host.current.style.width = `${viewport.width}px`;
      host.current.style.height = `${viewport.height}px`;
      host.current.replaceChildren(canvas, layer);
      const render = page.render({
        canvas,
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
      });
      const text = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: layer,
        viewport,
      });
      cancel = () => {
        render.cancel();
        text.cancel();
      };
      await Promise.all([render.promise, text.render()]);
    })().catch((e) => {
      if (active)
        setError(e instanceof Error ? e.message : "Could not render PDF page.");
    });
    return () => {
      active = false;
      cancel();
    };
  }, [document, number, width, zoom]);
  return (
    <div className="latex-page-wrap">
      {error && <p role="alert">{error}</p>}
      <div
        ref={host}
        className="latex-pdf-page"
        role="region"
        aria-label={`PDF page ${number}`}
      />
    </div>
  );
}
export function PdfPreview({
  hash,
  zoom = "fit",
}: {
  hash: string;
  zoom?: string;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [width, setWidth] = useState(600);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    setError("");
    setDocument(null);
    const task = getDocument({
      url: `/api/latex/pdf/${hash}`,
      isEvalSupported: false,
    });
    void task.promise
      .then((doc) => {
        if (active) setDocument(doc);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Could not open PDF.");
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [hash]);
  useEffect(() => {
    if (!scroll.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(200, Math.floor(entry.contentRect.width - 32))),
    );
    observer.observe(scroll.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={scroll} className="latex-pdf-scroll" aria-label="PDF preview">
      {error ? (
        <p role="alert" className="editor-error">
          {error}
        </p>
      ) : !document ? (
        <p className="empty">Loading PDF…</p>
      ) : (
        Array.from({ length: document.numPages }, (_, i) => (
          <PdfPage
            key={`${hash}-${i}`}
            document={document}
            number={i + 1}
            width={width}
            zoom={zoom}
          />
        ))
      )}
    </div>
  );
}
