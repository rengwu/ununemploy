import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button, Select, Input, InputArea, Dialog, Banner } from "./ui.tsx";
import { api, jsonBody, time, type Bootstrap } from "./api.ts";
import {
  coverLetterDocumentSchema,
  type CoverLetterVersion,
  type CoverLetterDocument,
} from "../core/types.ts";

import { coverLetterText } from "../core/cover-letter/template.ts";
import {
  onAssistantUpdate,
  type AssistantContext,
} from "./assistant-context.ts";
const LatexCvPage = lazy(() =>
  import("./LatexCvPage.tsx").then((m) => ({ default: m.LatexCvPage })),
);
type DocumentVersion = CoverLetterVersion;
type LetterDraft = Omit<CoverLetterDocument, "paragraphs"> & { body: string };
const draftFrom = ({
  paragraphs,
  ...fields
}: CoverLetterDocument): LetterDraft => ({
  ...fields,
  body: paragraphs.join("\n\n"),
});
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
  if (props.mode === "cover-letter") return <CoverLetterEditor {...props} />;
  return (
    <Suspense fallback={<div className="empty">Loading editor…</div>}>
      <LatexCvPage
        theme={props.theme}
        onDirty={props.onDirty}
        onAssistantContext={props.onAssistantContext}
      />
    </Suspense>
  );
}

function CoverLetterEditor({
  boot,
  refresh,
  onDirty,
  initialJobId,
  onAssistantContext,
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
  const label = "Cover letter";
  const apiBase = "/cover-letters";
  const [defaultTarget] = useState(() => boot.coverLetterJobs[0]?.id || "");
  const initialTarget = initialJobId || defaultTarget;
  const [jobId, setJobId] = useState(initialTarget);
  const [source, setSource] = useState<LetterDraft | null>(null);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [loadError, setLoadError] = useState("");
  const loadTarget = useRef<Target>({ jobId: initialTarget });
  const [saved, setSaved] = useState("");
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [current, setCurrent] = useState<DocumentVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Target | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const requestId = useRef(0);
  const currentSnapshot = JSON.stringify(source);
  const dirty = !!saved && currentSnapshot !== saved;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
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
        const versions = await api<DocumentVersion[]>(
          `${apiBase}?jobId=${encodeURIComponent(target.jobId)}`,
        );
        const cv =
          versions.find((v) => v.id === target.versionId) ||
          versions[0] ||
          null;
        const data = cv?.document || null;
        if (request !== requestId.current) return;
        if (protectEdits && dirtyRef.current) {
          setError(
            "The assistant saved a newer version. Your unsaved text is preserved; save a copy before reloading.",
          );
          return;
        }
        const nextSource = data ? draftFrom(data) : null;
        setSource(nextSource);
        setVersions(versions);
        setCurrent(cv);
        setJobId(target.jobId);
        setSaved(JSON.stringify(nextSource));
        setShowNotes(false);
      } catch (e) {
        if (request === requestId.current) setLoadError(message(e));
      } finally {
        if (request === requestId.current) setLoading(false);
      }
    },
    [apiBase],
  );
  useEffect(() => {
    void load({ jobId: initialTarget });
  }, [load, initialTarget]);
  useEffect(() => {
    onAssistantContext?.({
      page: "saved",
      document: "cover_letter",
      jobId,
      dirty,
    });
  }, [jobId, dirty, onAssistantContext]);
  useEffect(
    () =>
      onAssistantUpdate(({ receipts }) => {
        const relevant = receipts.some(
          (r) =>
            r.kind === "cover_letter" &&
            r.href.includes(`job=${encodeURIComponent(jobId)}`),
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
  const task = [...boot.tasks]
    .reverse()
    .find((t) => t.kind === "cover_letter" && t.jobId === jobId);
  useEffect(() => {
    if (
      task?.state === "complete" &&
      task.resultId &&
      !current &&
      !dirtyRef.current
    )
      void load({ jobId });
  }, [task?.state, task?.resultId, current, jobId, load]);
  const payload = useCallback(() => {
    if (!source) throw new Error("No cover letter loaded.");
    const { body, ...fields } = source;
    if (!body.trim()) throw new Error("Enter the letter body.");
    return {
      document: coverLetterDocumentSchema.parse({
        ...fields,
        paragraphs: body
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean),
      }),
    };
  }, [source]);
  useEffect(() => setCopied(false), [source]);
  const copy = async () => {
    setError("");
    try {
      const text = coverLetterText(payload().document);
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(text);
      else {
        const focused = document.activeElement as HTMLElement | null;
        const field = document.createElement("textarea");
        field.value = text;
        field.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        document.body.append(field);
        field.select();
        try {
          if (!document.execCommand("copy"))
            throw new Error(
              "Copy failed. Select and copy the letter text manually.",
            );
        } finally {
          field.remove();
          focused?.focus();
        }
      }
      setCopied(true);
    } catch (e) {
      setError(message(e));
    }
  };
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
  }, [source, payload, apiBase]);
  const save = useCallback(async () => {
    if (!source) return;
    setBusy(true);
    setError("");
    try {
      if (current) {
        const cv = await api<DocumentVersion>(
          `${apiBase}/${current.id}/versions`,
          {
            method: "POST",
            body: jsonBody({ ...payload(), expectedId: versions[0]?.id }),
          },
        );
        setCurrent(cv);
        setVersions((v) => [cv, ...v]);
        setSaved(JSON.stringify(source));
      }
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, [source, payload, current, refresh, apiBase, versions]);
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
  const candidates = boot.coverLetterJobs;
  const activeTask = task && ["running", "queued"].includes(task.state);
  const notes = current?.reviewNotes || [];
  return (
    <div className={`cv-page ${embedded ? "embedded-letter" : ""}`}>
      <div className="toolbar">
        {!embedded && (
          <Select
            className="cv-document-select"
            aria-label={label}
            disabled={busy || loading || !candidates.length}
            value={jobId}
            onValueChange={(v) => v && select({ jobId: String(v) })}
            items={{
              ...Object.fromEntries(
                candidates.map((j) => [j.id, `${j.company} · ${j.title}`]),
              ),
            }}
          >
            {candidates.map((j) => (
              <Select.Option key={j.id} value={j.id}>
                {j.company} · {j.title}
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
        {jobId && (
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
                  (jobId
                    ? "No cover letter generated yet."
                    : "Save a job to generate a cover letter.")}
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
              <fieldset
                className="letter-fields"
                disabled={busy}
                aria-label="Cover letter fields"
              >
                <details>
                  <summary>Contact details</summary>
                  <div className="form-stack">
                    <Input
                      label="Name"
                      value={source.name}
                      onChange={(e) =>
                        setSource({ ...source, name: e.target.value })
                      }
                    />
                    <Input
                      label="Location"
                      value={source.location}
                      onChange={(e) =>
                        setSource({ ...source, location: e.target.value })
                      }
                    />
                    {source.contacts.map((contact, i) => (
                      <div className="form-stack" key={i}>
                        <Input
                          label={`Contact ${i + 1}`}
                          value={contact.label}
                          onChange={(e) =>
                            setSource({
                              ...source,
                              contacts: source.contacts.map((c, n) =>
                                n === i ? { ...c, label: e.target.value } : c,
                              ),
                            })
                          }
                        />
                        <Input
                          label={`Contact ${i + 1} link`}
                          value={contact.url || ""}
                          onChange={(e) =>
                            setSource({
                              ...source,
                              contacts: source.contacts.map((c, n) =>
                                n === i
                                  ? { ...c, url: e.target.value || undefined }
                                  : c,
                              ),
                            })
                          }
                        />
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setSource({
                              ...source,
                              contacts: source.contacts.filter(
                                (_, n) => n !== i,
                              ),
                            })
                          }
                        >
                          Remove contact {i + 1}
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="secondary"
                      disabled={source.contacts.length >= 12}
                      onClick={() =>
                        setSource({
                          ...source,
                          contacts: [...source.contacts, { label: "" }],
                        })
                      }
                    >
                      Add contact
                    </Button>
                  </div>
                </details>
                <Input
                  label="Company"
                  value={source.company}
                  onChange={(e) =>
                    setSource({ ...source, company: e.target.value })
                  }
                />
                <Input
                  label="Role"
                  value={source.role}
                  onChange={(e) =>
                    setSource({ ...source, role: e.target.value })
                  }
                />
                <Input
                  label="Greeting"
                  value={source.salutation}
                  onChange={(e) =>
                    setSource({ ...source, salutation: e.target.value })
                  }
                />
                <InputArea
                  label="Letter body"
                  rows={14}
                  value={source.body}
                  onChange={(e) =>
                    setSource({ ...source, body: e.target.value })
                  }
                />
                <Input
                  label="Sign-off"
                  value={source.closing}
                  onChange={(e) =>
                    setSource({ ...source, closing: e.target.value })
                  }
                />
              </fieldset>
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
                  onClick={() => void copy()}
                >
                  Copy text
                </Button>
              </div>
              {copied && (
                <span role="status" className="copy-status">
                  Copied
                </span>
              )}
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
