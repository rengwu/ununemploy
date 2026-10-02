import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Select } from "@cloudflare/kumo/components/select";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Banner } from "@cloudflare/kumo/components/banner";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { api, jsonBody, time, type Bootstrap } from "./api.ts";
import type { CvContext } from "../core/api-types.ts";
import type {
  CvVersion,
  CoverLetterVersion,
  Profile,
  Template,
} from "../core/types.ts";

import { defaultCoverLetterTemplate } from "../core/cover-letter/template.ts";
import {
  onAssistantUpdate,
  type AssistantContext,
} from "./assistant-context.ts";
const LatexCvPage = lazy(() =>
  import("./LatexCvPage.tsx").then((m) => ({ default: m.LatexCvPage })),
);
type DocumentVersion = CvVersion | CoverLetterVersion;
type Target = { jobId: string; versionId?: string };
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Request failed.";
type CvPageProps = {
  boot: Bootstrap;
  refresh: () => Promise<void>;
  onDirty: (dirty: boolean) => void;
  theme: string;
  initialJobId: string | null;
  initialView?: string | null;
  onAssistantContext?: (context: AssistantContext) => void;
  mode?: "cv" | "cover-letter";
  embedded?: boolean;
};
export function CvPage(props: CvPageProps) {
  const [view, setView] = useState(
    props.initialView === "html" || props.initialJobId ? "html" : "latex",
  );
  const [dirty, setDirty] = useState(false);
  const [pendingView, setPendingView] = useState<string | null>(null);
  const onDirty = useCallback(
    (value: boolean) => {
      setDirty(value);
      props.onDirty(value);
    },
    [props.onDirty],
  );
  if (props.mode === "cover-letter") return <HtmlCvPage {...props} />;
  return (
    <div className="cv-workspace">
      <Tabs
        variant="underline"
        className="pane-tabs"
        listClassName="pane-tab-list"
        value={view}
        onValueChange={(next) => {
          if (next === view) return;
          if (dirty) setPendingView(next);
          else setView(next);
        }}
        tabs={[
          { value: "latex", label: "LaTeX" },
          { value: "html", label: "Data and HTML" },
        ]}
      />
      <Suspense fallback={<div className="empty">Loading editor…</div>}>
        {view === "latex" ? (
          <LatexCvPage
            theme={props.theme}
            onDirty={onDirty}
            onAssistantContext={props.onAssistantContext}
          />
        ) : (
          <HtmlCvPage {...props} onDirty={onDirty} />
        )}
      </Suspense>
      <Dialog.Root
        open={pendingView !== null}
        onOpenChange={(open) => {
          if (!open) setPendingView(null);
        }}
      >
        <Dialog className="app-dialog">
          <Dialog.Title>Discard unsaved changes?</Dialog.Title>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setPendingView(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setView(pendingView!);
                setPendingView(null);
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
function HtmlCvPage({
  boot,
  refresh,
  onDirty,
  theme,
  initialJobId,
  onAssistantContext,
  mode = "cv",
  embedded = false,
}: {
  boot: Bootstrap;
  refresh: () => Promise<void>;
  onDirty: (dirty: boolean) => void;
  theme: string;
  initialJobId: string | null;
  onAssistantContext?: (context: AssistantContext) => void;
  mode?: "cv" | "cover-letter";
  embedded?: boolean;
}) {
  const letterMode = mode === "cover-letter";
  const label = letterMode ? "Cover letter" : "CV";
  const apiBase = letterMode ? "/cover-letters" : "/cv";
  const [defaultTarget] = useState(() =>
    letterMode ? boot.coverLetterJobs[0]?.id || "" : "master",
  );
  const initialTarget = initialJobId || defaultTarget;
  const [jobId, setJobId] = useState(initialTarget);
  const [source, setSource] = useState("");
  const [template, setTemplate] = useState<Template>({ html: "", css: "" });
  const [file, setFile] = useState("data");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [loadError, setLoadError] = useState("");
  const loadTarget = useRef<Target>({ jobId: initialTarget });
  const [saved, setSaved] = useState("");
  const [revision, setRevision] = useState(0);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [current, setCurrent] = useState<DocumentVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Target | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const requestId = useRef(0);
  const currentSnapshot = JSON.stringify({ source, template });
  const dirty = !!saved && currentSnapshot !== saved;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [context, setContext] = useState<CvContext | null>(null);
  const load = useCallback(
    async (target: Target, protectEdits = false) => {
      loadTarget.current = target;
      const request = ++requestId.current;
      setLoading(true);
      setLoadError("");
      setError("");
      setPreviewError("");
      if (!target.jobId) {
        setLoading(false);
        return;
      }
      try {
        const master = target.jobId === "master";
        const context = await api<CvContext>("/master");
        const versions = await api<DocumentVersion[]>(
          master
            ? "/cv"
            : `${apiBase}?jobId=${encodeURIComponent(target.jobId)}`,
        );
        const cv =
          versions.find((v) => v.id === target.versionId) ||
          versions[0] ||
          null;
        let data: unknown;
        if (master) {
          data =
            target.versionId && cv
              ? await api<Profile>(`/profile/${cv.profileRevision}`)
              : context.profile;
        } else data = cv?.document || null;
        if (request !== requestId.current) return;
        if (protectEdits && dirtyRef.current) {
          setError(
            "The assistant saved a newer version. Your unsaved text is preserved; save a copy before reloading.",
          );
          return;
        }
        const nextSource = data ? JSON.stringify(data, null, 2) : "";
        const nextTemplate =
          (master && !target.versionId ? context.template : cv?.template) ||
          (letterMode ? defaultCoverLetterTemplate : context.template);
        setContext(context);
        setSource(nextSource);
        setTemplate(nextTemplate);
        setVersions(versions);
        setCurrent(cv);
        setJobId(target.jobId);
        setRevision(context.profile.revision);
        setSaved(
          JSON.stringify({ source: nextSource, template: nextTemplate }),
        );
        setShowNotes(false);
      } catch (e) {
        if (request === requestId.current) setLoadError(message(e));
      } finally {
        if (request === requestId.current) setLoading(false);
      }
    },
    [apiBase, letterMode],
  );
  useEffect(() => {
    void load({ jobId: initialTarget });
  }, [load, initialTarget]);
  useEffect(() => {
    onAssistantContext?.({
      page: letterMode ? "saved" : "cv",
      document: letterMode
        ? "cover_letter"
        : jobId === "master"
          ? "html_cv"
          : "legacy_cv",
      ...(jobId !== "master" ? { jobId } : {}),
      dirty,
    });
  }, [letterMode, jobId, dirty, onAssistantContext]);
  useEffect(
    () =>
      onAssistantUpdate(({ receipts }) => {
        const relevant = receipts.some((r) =>
          jobId === "master"
            ? r.kind === "profile" || r.kind === "html_cv"
            : r.href.includes(`job=${encodeURIComponent(jobId)}`),
        );
        if (!relevant) return;
        if (dirtyRef.current || loadTarget.current.versionId)
          setError(
            "The assistant saved a newer version. Your current text is preserved; save a copy before reloading.",
          );
        else void load({ jobId }, true);
      }),
    [jobId, load],
  );
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const task =
    jobId === "master"
      ? null
      : [...boot.tasks]
          .reverse()
          .find(
            (t) => letterMode && t.kind === "cover_letter" && t.jobId === jobId,
          );
  useEffect(() => {
    if (
      task?.state === "complete" &&
      task.resultId &&
      !current &&
      !dirtyRef.current
    )
      void load({ jobId });
  }, [task?.state, task?.resultId, current, jobId, load]);
  const payload = useCallback(
    () => ({
      [jobId === "master" ? "profile" : "document"]: JSON.parse(source),
      template,
    }),
    [jobId, source, template],
  );
  useEffect(() => {
    if (!source) {
      setPreview("");
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      try {
        void api<{ html: string }>(`${apiBase}/preview`, {
          method: "POST",
          body: jsonBody(payload()),
        })
          .then((result) => {
            if (active) {
              setPreview(result.html);
              setPreviewError("");
            }
          })
          .catch((e) => {
            if (active) setPreviewError(message(e));
          });
      } catch (e) {
        if (active) setPreviewError(message(e));
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [source, template, payload, apiBase]);
  const save = useCallback(async () => {
    if (!source) return;
    setBusy(true);
    setError("");
    try {
      if (jobId === "master") {
        const result = await api<{ profile: Profile; cv: CvVersion }>(
          "/master",
          {
            method: "PUT",
            body: jsonBody({
              ...payload(),
              expectedRevision: revision,
              expectedCvId: versions[0]?.id,
            }),
          },
        );
        const next = JSON.stringify(result.profile, null, 2);
        setSource(next);
        setRevision(result.profile.revision);
        setCurrent(result.cv);
        setVersions((v) => [result.cv, ...v]);
        setSaved(JSON.stringify({ source: next, template }));
      } else if (current) {
        const cv = await api<DocumentVersion>(
          `${apiBase}/${current.id}/versions`,
          {
            method: "POST",
            body: jsonBody({ ...payload(), expectedId: versions[0]?.id }),
          },
        );
        setCurrent(cv);
        setVersions((v) => [cv, ...v]);
        setSaved(JSON.stringify({ source, template }));
      }
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, [
    source,
    jobId,
    payload,
    revision,
    current,
    template,
    refresh,
    apiBase,
    versions,
  ]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && !busy) void save();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [save, dirty, busy]);
  const select = (target: Target) => {
    if (dirty) setPending(target);
    else void load(target);
  };
  const download = async (format: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api${apiBase}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ ...payload(), format }),
      });
      if (!response.ok)
        throw new Error((await response.json()).error || "Export failed.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || `${label}.${format}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const generate = async () => {
    setBusy(true);
    try {
      await api(`/jobs/${jobId}/generate`, { method: "POST" });
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const retry = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await api(`/tasks/${task.id}/retry`, { method: "POST" });
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const value =
    file === "data"
      ? source
      : file === "template"
        ? template.html
        : template.css;
  const extensions = useMemo(
    () =>
      file === "data" ? [json()] : file === "template" ? [html()] : [css()],
    [file],
  );
  const candidates = letterMode ? boot.coverLetterJobs : boot.cvJobs;
  const activeTask = task && ["running", "queued"].includes(task.state);
  const notes =
    jobId === "master"
      ? context?.profile.openItems.map((i) => i.question) || []
      : current?.reviewNotes || [];
  return (
    <div className={`cv-page ${embedded ? "embedded-letter" : ""}`}>
      <div className="toolbar">
        {!embedded && (
          <Select
            className="cv-document-select"
            aria-label={label}
            disabled={busy || loading || (letterMode && !candidates.length)}
            value={jobId}
            onValueChange={(v) => v && select({ jobId: String(v) })}
            items={{
              ...(!letterMode ? { master: "Master CV" } : {}),
              ...Object.fromEntries(
                candidates.map((j) => [
                  j.id,
                  `${j.company} · ${j.title}${!letterMode ? " (saved resume)" : ""}`,
                ]),
              ),
            }}
          >
            {!letterMode && (
              <Select.Option value="master">Master CV</Select.Option>
            )}
            {candidates.map((j) => (
              <Select.Option key={j.id} value={j.id}>
                {j.company} · {j.title}
                {!letterMode ? " (saved resume)" : ""}
              </Select.Option>
            ))}
          </Select>
        )}
        {versions.length > 0 && (
          <Select
            aria-label={`${label} version`}
            disabled={busy || loading}
            value={current?.id || ""}
            onValueChange={(v) => v && select({ jobId, versionId: String(v) })}
            items={Object.fromEntries(
              versions.map((v) => [v.id, `Version ${v.version}`]),
            )}
          >
            {versions.map((v) => (
              <Select.Option key={v.id} value={v.id}>
                Version {v.version} · {time(v.createdAt)}
              </Select.Option>
            ))}
          </Select>
        )}
        {task?.resultId &&
          current &&
          task.resultId !== current.id &&
          !versions.some((v) => v.id === task.resultId) && (
            <Button variant="secondary" onClick={() => select({ jobId })}>
              Open new draft
            </Button>
          )}
        <div className="toolbar-spacer" />
        {dirty && <span className="muted">Unsaved changes</span>}
        {current && versions[0]?.id !== current.id && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void save()}
          >
            Restore version
          </Button>
        )}
        {letterMode && jobId && (
          <Button
            variant="secondary"
            disabled={busy || !!activeTask}
            onClick={() => void generate()}
          >
            Generate cover letter
          </Button>
        )}
        <Button
          variant="primary"
          disabled={!dirty || busy || loading}
          loading={busy}
          onClick={() => void save()}
        >
          Save
        </Button>
      </div>
      {loadError && (
        <div className="page-error">
          <Banner
            variant="error"
            title={loadError}
            action={
              <Button
                variant="ghost"
                onClick={() => void load(loadTarget.current)}
              >
                Retry
              </Button>
            }
          />
        </div>
      )}
      {source &&
        task &&
        ["failed", "paused", "needs_details"].includes(task.state) && (
          <div className="page-error">
            <Banner
              variant="error"
              title={task.error || "Generation paused."}
              action={
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void retry()}
                >
                  Retry
                </Button>
              }
            />
          </div>
        )}
      {loading ? (
        <div className="empty">Loading {label.toLowerCase()}…</div>
      ) : !source ? (
        <div className="empty">
          <p>
            {task?.state === "running"
              ? "Generating cover letter…"
              : task?.state === "queued"
                ? "Cover letter generation queued."
                : task?.error ||
                  (letterMode
                    ? jobId
                      ? "No cover letter generated yet."
                      : "Save a job to generate a cover letter."
                    : "No CV saved.")}
          </p>
          {task &&
            ["paused", "failed", "needs_details"].includes(task.state) && (
              <Button variant="secondary" onClick={() => void retry()}>
                Retry
              </Button>
            )}
        </div>
      ) : (
        <>
          <div className="cv-split">
            <section className="source-editor">
              <Tabs
                variant="underline"
                className="pane-tabs"
                listClassName="pane-tab-list"
                value={file}
                onValueChange={setFile}
                tabs={[
                  { value: "data", label: "Data.json" },
                  { value: "template", label: "Template.html" },
                  { value: "css", label: "Styles.css" },
                ]}
              />
              <div className="code-editor">
                <CodeMirror
                  readOnly={busy}
                  editable={!busy}
                  value={value}
                  height="100%"
                  theme={theme === "dark" ? "dark" : "light"}
                  extensions={extensions}
                  onChange={(v) =>
                    file === "data"
                      ? setSource(v)
                      : setTemplate((t) => ({
                          ...t,
                          [file === "template" ? "html" : "css"]: v,
                        }))
                  }
                  basicSetup={{
                    foldGutter: true,
                    lineNumbers: true,
                    highlightActiveLine: true,
                  }}
                  aria-label={
                    file === "data"
                      ? `${label} data`
                      : file === "template"
                        ? `${label} template`
                        : `${label} styles`
                  }
                />
              </div>
              {(error || previewError) && (
                <div className="editor-error" role="alert">
                  {error || previewError}
                </div>
              )}
            </section>
            <section className="cv-preview" aria-label={`${label} preview`}>
              <div
                className="preview-toolbar"
                onFocus={(event) =>
                  event.target.scrollIntoView({
                    block: "nearest",
                    inline: "nearest",
                  })
                }
              >
                <span>Preview</span>
                <div className="toolbar-spacer" />
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void download("pdf")}
                >
                  Download PDF
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  title="Editable Word document with its own formatting"
                  onClick={() => void download("docx")}
                >
                  Download DOCX
                </Button>
              </div>
              <iframe title={`${label} preview`} sandbox="" srcDoc={preview} />
            </section>
          </div>
          {notes.length > 0 && (
            <div className="cv-review">
              <Button variant="ghost" onClick={() => setShowNotes((v) => !v)}>
                Review notes ({notes.length})
              </Button>
              {showNotes && (
                <ul>
                  {notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      {error && !source && (
        <div className="editor-error" role="alert">
          {error}
        </div>
      )}
      <Dialog.Root
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
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
                const target = pending!;
                setPending(null);
                void load(target);
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
