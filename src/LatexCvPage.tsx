import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Select, Dialog } from "./ui.tsx";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { EditorView } from "@codemirror/view";
import { api, jsonBody, time } from "./api.ts";
import { PdfPreview } from "./PdfPreview.tsx";
import {
  onAssistantUpdate,
  type AssistantContext,
} from "./assistant-context.ts";
import type {
  LatexBuild,
  LatexContext,
  LatexDiagnostic,
  LatexDocument,
  LatexVersion,
} from "../core/latex/types.ts";
const extensions = [
  StreamLanguage.define(stex),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ "aria-label": "LaTeX source" }),
];
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Request failed.";
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function LatexCvPage({
  theme,
  onDirty,
  onAssistantContext,
}: {
  theme: string;
  onDirty: (dirty: boolean) => void;
  onAssistantContext?: (context: AssistantContext) => void;
}) {
  const [source, setSource] = useState("");
  const [saved, setSaved] = useState("");
  const [head, setHead] = useState(0);
  const [selected, setSelected] = useState(0);
  const [versions, setVersions] = useState<LatexVersion[]>([]);
  const [hash, setHash] = useState<string | null>(null);
  const [zoom, setZoom] = useState("fit");
  const [builtSource, setBuiltSource] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<LatexDiagnostic[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [initialBuild, setInitialBuild] = useState<string | null>(null);
  const editor = useRef<ReactCodeMirrorRef>(null);
  const alive = useRef(true);
  const compilingRef = useRef(false);
  const versionRequest = useRef(0);
  const dirty = source !== saved;
  const stale = builtSource !== source;
  const historical = selected !== head;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const historicalRef = useRef(historical);
  historicalRef.current = historical;
  useEffect(() => {
    onAssistantContext?.({ page: "cv", document: "latex", dirty });
  }, [dirty, onAssistantContext]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const load = useCallback(async (protectEdits = false) => {
    setLoading(true);
    setError("");
    try {
      const value = await api<LatexContext>("/latex");
      if (!alive.current) return;
      if (protectEdits && dirtyRef.current) {
        setError(
          "The assistant saved a newer CV. Your unsaved source is preserved. Download your .tex copy before reloading.",
        );
        return;
      }
      setSource(value.current.source);
      setSaved(value.current.source);
      setHead(value.current.version);
      setSelected(value.current.version);
      setVersions(value.versions);
      setHash(value.previewHash);
      setDiagnostics(value.diagnostics);
      setBuiltSource(
        value.previewHash === value.current.hash ? value.current.source : null,
      );
      if (value.previewHash !== value.current.hash)
        setInitialBuild(value.current.source);
    } catch (e) {
      if (alive.current) setError(message(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(
    () =>
      onAssistantUpdate(({ receipts }) => {
        if (!receipts.some((r) => r.kind === "latex")) return;
        if (dirtyRef.current || historicalRef.current)
          setError(
            "The assistant saved a newer CV. Your current source is preserved. Download your .tex copy before reloading.",
          );
        else void load(true);
      }),
    [load],
  );
  const compile = useCallback(async (input: string) => {
    if (compilingRef.current || !input.trim()) return;
    compilingRef.current = true;
    setCompiling(true);
    setError("");
    setDiagnostics([]);
    try {
      const response = await fetch("/api/latex/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ source: input }),
      });
      const result = (await response.json()) as LatexBuild & { error?: string };
      if (!alive.current) return;
      setDiagnostics(result.diagnostics || []);
      if (!response.ok) throw new Error(result.error || "Compilation failed.");
      setHash(result.hash);
      setBuiltSource(input);
    } catch (e) {
      if (alive.current) setError(message(e));
    } finally {
      compilingRef.current = false;
      if (alive.current) setCompiling(false);
    }
  }, []);
  useEffect(() => {
    if (initialBuild === null) return;
    setInitialBuild(null);
    void compile(initialBuild);
  }, [initialBuild, compile]);
  const save = useCallback(async () => {
    if (saving || !source.trim()) return;
    setSaving(true);
    setError("");
    try {
      const value = await api<LatexDocument>("/latex", {
        method: "PUT",
        body: jsonBody({
          source,
          expectedVersion: head,
          ...(historical ? { restoredFrom: selected } : {}),
        }),
      });
      if (!alive.current) return;
      setSaved(value.source);
      setHead(value.version);
      setSelected(value.version);
      setVersions((v) => [
        value,
        ...v.filter((x) => x.version !== value.version),
      ]);
    } catch (e) {
      if (alive.current) setError(message(e));
    } finally {
      if (alive.current) setSaving(false);
    }
  }, [source, saving, head, selected, historical]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!loading && (dirty || historical)) void save();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (!loading) void compile(source);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [compile, save, source, loading, dirty, historical]);
  async function selectVersion(version: number) {
    const request = ++versionRequest.current;
    setLoading(true);
    setError("");
    try {
      const value = await api<LatexDocument>(`/latex/versions/${version}`);
      if (!alive.current || request !== versionRequest.current) return;
      setSource(value.source);
      setSaved(value.source);
      setSelected(value.version);
      setDiagnostics([]);
      void compile(value.source);
    } catch (e) {
      if (alive.current) setError(message(e));
    } finally {
      if (alive.current && request === versionRequest.current)
        setLoading(false);
    }
  }
  function goToLine(line: number) {
    const view = editor.current?.view;
    if (!view) return;
    const at = view.state.doc.line(
      Math.max(1, Math.min(line, view.state.doc.lines)),
    ).from;
    view.dispatch({
      selection: { anchor: at },
      effects: EditorView.scrollIntoView(at, { y: "center" }),
    });
    view.focus();
  }
  async function downloadPdf() {
    if (!hash || stale) return;
    try {
      const response = await fetch(`/api/latex/pdf/${hash}`);
      if (!response.ok)
        throw new Error("PDF unavailable. Recompile and try again.");
      downloadBlob(await response.blob(), "resume.pdf");
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <div className="cv-page latex-editor">
      <div className="toolbar">
        <Select
          aria-label="LaTeX version"
          value={String(selected)}
          disabled={loading || saving || compiling}
          items={Object.fromEntries(
            versions.map((v) => [String(v.version), `Version ${v.version}`]),
          )}
          onValueChange={(v) => {
            if (!v || Number(v) === selected) return;
            if (dirty) setPending(Number(v));
            else void selectVersion(Number(v));
          }}
        >
          {versions.map((v) => (
            <Select.Option key={v.version} value={String(v.version)}>
              Version {v.version} · {time(v.createdAt)}
            </Select.Option>
          ))}
        </Select>
        {dirty && <span className="muted">Unsaved changes</span>}
        <div className="toolbar-spacer" />
        <Button
          variant="secondary"
          disabled={loading || compiling || !source.trim()}
          loading={compiling}
          onClick={() => void compile(source)}
          title="Ctrl/Cmd+Enter"
        >
          Recompile
        </Button>
        <Button
          variant="primary"
          disabled={
            loading || saving || !source.trim() || (!dirty && !historical)
          }
          loading={saving}
          onClick={() => void save()}
        >
          {historical ? "Restore version" : "Save"}
        </Button>
      </div>
      {loading ? (
        <div className="empty">Loading LaTeX…</div>
      ) : !head ? (
        <div className="empty">
          <p role="alert">{error}</p>
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      ) : (
        <div className="cv-split">
          <section className="source-editor">
            <div className="preview-toolbar">
              <span>Resume.tex</span>
              <div className="toolbar-spacer" />
              <Button
                variant="ghost"
                onClick={() =>
                  downloadBlob(
                    new Blob([source], { type: "application/x-tex" }),
                    "resume.tex",
                  )
                }
              >
                Download .tex
              </Button>
            </div>
            <div className="code-editor">
              <CodeMirror
                ref={editor}
                value={source}
                onChange={setSource}
                height="100%"
                theme={theme === "dark" ? "dark" : "light"}
                extensions={extensions}
                editable={!saving}
                aria-label="LaTeX source"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                }}
              />
            </div>
            {(error || diagnostics.length > 0) && (
              <div className="editor-error" role={error ? "alert" : "status"}>
                {error && <p>{error}</p>}
                {diagnostics.map((d, i) => (
                  <div key={i} className="latex-diagnostic">
                    {d.line && (
                      <Button variant="ghost" onClick={() => goToLine(d.line!)}>
                        Line {d.line}
                      </Button>
                    )}
                    <span>{d.message}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="cv-preview" aria-label="LaTeX preview">
            <div className="preview-toolbar">
              <span>
                {compiling
                  ? "Compiling…"
                  : hash && stale
                    ? "Preview needs recompiling"
                    : "Preview"}
              </span>
              <div className="toolbar-spacer" />
              <Select
                aria-label="PDF zoom"
                value={zoom}
                onValueChange={(value) => value && setZoom(String(value))}
                items={{
                  fit: "Fit width",
                  "100": "100%",
                  "125": "125%",
                  "150": "150%",
                }}
              >
                <Select.Option value="fit">Fit width</Select.Option>
                <Select.Option value="100">100%</Select.Option>
                <Select.Option value="125">125%</Select.Option>
                <Select.Option value="150">150%</Select.Option>
              </Select>
              <Button
                variant="ghost"
                disabled={!hash || stale || compiling}
                onClick={() => void downloadPdf()}
              >
                Download PDF
              </Button>
            </div>
            {hash ? (
              <PdfPreview hash={hash} zoom={zoom} />
            ) : (
              <div className="empty">
                {compiling ? "Compiling PDF…" : "Recompile to preview the PDF."}
              </div>
            )}
          </section>
        </div>
      )}
      <Dialog.Root
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <Dialog className="app-dialog">
          <Dialog.Title>Discard unsaved changes?</Dialog.Title>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const version = pending!;
                setPending(null);
                void selectVersion(version);
              }}
            >
              Discard changes
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
