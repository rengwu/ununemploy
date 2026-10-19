import {
  attachmentAdapter,
  AttachmentList,
  ComposerAttachments,
} from "./AssistantAttachments.tsx";
import type { AssistantAttachment } from "../core/assistant/attachment-types.ts";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  useExternalStoreRuntime,
  useAuiState,
  MessageNotSentError,
  type ThreadMessageLike,
  type AppendMessage,
  type TextMessagePartProps,
} from "@assistant-ui/react";
import { Button, Tooltip, TooltipProvider, InputArea } from "./ui.tsx";
import {
  ArrowUpIcon,
  StopIcon,
  XIcon,
  ChatCircleIcon,
} from "@phosphor-icons/react";
import { api, jsonBody, type Bootstrap } from "./api.ts";
import { useRemote } from "./useRemote.ts";
import { SafeMarkdown } from "./SafeMarkdown.tsx";
import type { AssistantContext } from "./assistant-context.ts";
import type { ProfileMessage } from "../core/profile/chat.ts";
import type { assistantState } from "../core/assistant/service.ts";
const ChatAttachments = createContext<AssistantAttachment[]>([]);
const MarkdownPart = ({ text }: TextMessagePartProps) => (
  <SafeMarkdown
    text={text.replace(
      /(?:\n\nNo changes saved\.){2,}\s*$/,
      "\n\nNo changes saved.",
    )}
    attachments={useContext(ChatAttachments)}
    onNavigate={() => window.dispatchEvent(new Event("jh-assistant-hide"))}
  />
);
function ChatMessage() {
  const role = useAuiState((s) => s.message.role);
  const attachments = useAuiState(
    (s) => s.message.metadata.custom.attachments,
  ) as AssistantAttachment[] | undefined;
  const kind = useAuiState((s) => s.message.metadata.custom.kind);
  return (
    <MessagePrimitive.Root
      className={`profile-message profile-message-${role}`}
    >
      <div className="profile-message-author">
        {role === "user"
          ? "You"
          : ["welcome", "notice", "assistant-intro"].includes(String(kind))
            ? "Assistant"
            : "Assistant"}
      </div>
      {!!attachments?.length && <AttachmentList items={attachments} />}
      <MessagePrimitive.Parts components={{ Text: MarkdownPart }} />
    </MessagePrimitive.Root>
  );
}
const convertMessage = (
  m: ProfileMessage & { attachments?: AssistantAttachment[] },
): ThreadMessageLike => ({
  id: m.id,
  role: m.role,
  createdAt: new Date(m.createdAt),
  content: [{ type: "text", text: m.content }],
  metadata: { custom: { kind: m.kind, attachments: m.attachments || [] } },
});
export function AssistantPane({
  boot,
  context,
  refresh,
  launcherContainer,
}: {
  boot: Bootstrap;
  context: AssistantContext;
  refresh: () => Promise<void>;
  launcherContainer: HTMLElement | null;
}) {
  const [open, setOpen] = useState(
    () =>
      sessionStorage.getItem("jh-assistant-open") === "true" ||
      (sessionStorage.getItem("jh-assistant-open") === null &&
        !boot.profile.ready),
  );
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 600px)").matches,
  );
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const panel = useRef<HTMLElement>(null),
    launcher = useRef<HTMLButtonElement>(null);
  const pendingMessage = useRef<{ id: string; text: string } | null>(null);
  const resource = useRemote<ReturnType<typeof assistantState>>(
    initialized ? "/assistant" : null,
    undefined,
    open ? 1200 : 3000,
  );
  const state = resource.data,
    turn = state?.turn;
  const running = !!turn && ["queued", "running"].includes(turn.state);
  const start = async () => {
    try {
      await api("/assistant/start", { method: "POST" });
      setInitialized(true);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load the assistant.",
      );
    }
  };
  useEffect(() => {
    if (open && !initialized) void start();
  }, [open, initialized]);
  useEffect(() => {
    const show = () => setOpen(true),
      hide = () => setOpen(false);
    window.addEventListener("jh-assistant-open", show);
    window.addEventListener("jh-assistant-hide", hide);
    const media = matchMedia("(max-width: 600px)");
    const resize = () => setMobile(media.matches);
    media.addEventListener("change", resize);
    return () => {
      window.removeEventListener("jh-assistant-open", show);
      window.removeEventListener("jh-assistant-hide", hide);
      media.removeEventListener("change", resize);
    };
  }, []);
  const lastOpen = useRef(false);
  useEffect(() => {
    sessionStorage.setItem("jh-assistant-open", String(open));
    if (open && !lastOpen.current)
      panel.current
        ?.querySelector<HTMLButtonElement>("button:not([disabled])")
        ?.focus();
    if (!open && lastOpen.current) launcher.current?.focus();
    lastOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (mobile && event.key === "Tab") {
        const elements = Array.from(
          panel.current!.querySelectorAll<HTMLElement>(
            'button:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
          ),
        ).filter((e) => e.offsetParent !== null);
        const first = elements[0],
          last = elements.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !panel.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", keyboard);
    const background = document.querySelector<HTMLElement>(".app-frame");
    if (mobile && background) background.inert = true;
    return () => {
      window.removeEventListener("keydown", keyboard);
      if (background) background.inert = false;
    };
  }, [open, mobile]);
  const run = async (path: string, body?: unknown) => {
    setSending(true);
    setError("");
    try {
      await api(path, {
        method: "POST",
        ...(body ? { body: jsonBody(body) } : {}),
      });
      await resource.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setSending(false);
    }
  };
  const onNew = async (message: AppendMessage) => {
    const text = message.content
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    const attachmentIds = (message.attachments || []).map((a) => a.id);
    if (!text && !attachmentIds.length) throw new MessageNotSentError();
    const key = JSON.stringify([text, attachmentIds]);
    const id =
      pendingMessage.current?.text === key
        ? pendingMessage.current.id
        : crypto.randomUUID();
    pendingMessage.current = { id, text: key };
    setSending(true);
    setError("");
    try {
      await api("/assistant/messages", {
        method: "POST",
        body: jsonBody({
          message: text,
          clientId: id,
          context,
          attachments: attachmentIds,
        }),
      });
      pendingMessage.current = null;
      sessionStorage.removeItem("jh-assistant-draft");
      sessionStorage.removeItem("jh-profile-draft");
      await resource.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message not sent.");
      throw new MessageNotSentError();
    } finally {
      setSending(false);
    }
  };
  const attachments = useMemo(() => attachmentAdapter(setError), []);
  const runtime = useExternalStoreRuntime({
    adapters: { attachments },
    messages: state?.messages || [],
    convertMessage,
    isRunning: running,
    isDisabled: !initialized || sending || !state,
    onNew,
    onCancel: async () => {
      if (turn) await run(`/assistant/${turn.id}/cancel`);
    },
  });
  useEffect(() => {
    runtime.thread.composer.setText(
      sessionStorage.getItem("jh-assistant-draft") ||
        sessionStorage.getItem("jh-profile-draft") ||
        "",
    );
    const saved = sessionStorage.getItem("jh-assistant-attachments");
    if (saved) {
      try {
        for (const item of JSON.parse(saved) as AssistantAttachment[]) {
          void api<AssistantAttachment>(`/assistant/attachments/${item.id}`)
            .then((meta) => {
              if (!meta.messageId)
                runtime.thread.composer.addAttachment({
                  id: meta.id,
                  type: meta.mediaType.startsWith("image/")
                    ? "image"
                    : "document",
                  name: meta.name,
                  contentType: meta.mediaType,
                  content: [],
                });
            })
            .catch(() =>
              setError(
                "A draft attachment is no longer available. Attach it again.",
              ),
            );
        }
      } catch {
        sessionStorage.removeItem("jh-assistant-attachments");
      }
    }
    return runtime.thread.composer.subscribe(() => {
      const items = runtime.thread.composer
        .getState()
        .attachments.filter(
          (a) => a.status.type !== "running" && a.status.type !== "incomplete",
        )
        .map((a) => ({ id: a.id, name: a.name, mediaType: a.contentType }));
      if (items.length)
        sessionStorage.setItem(
          "jh-assistant-attachments",
          JSON.stringify(items),
        );
      else sessionStorage.removeItem("jh-assistant-attachments");
      const text = runtime.thread.composer.getState().text;
      if (text) sessionStorage.setItem("jh-assistant-draft", text);
      else sessionStorage.removeItem("jh-assistant-draft");
    });
  }, [runtime]);
  const observed = useRef<string | null>(null);
  const newChat = async () => {
    setSending(true);
    setError("");
    try {
      await api("/assistant/new", { method: "POST" });
      pendingMessage.current = null;
      sessionStorage.removeItem("jh-assistant-draft");
      sessionStorage.removeItem("jh-profile-draft");
      runtime.thread.composer.reset();
      sessionStorage.removeItem("jh-assistant-attachments");
      await resource.reload();
      requestAnimationFrame(() =>
        panel.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus(),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start a new chat.");
    } finally {
      setSending(false);
    }
  };
  useEffect(() => {
    if (turn?.state !== "complete" || observed.current === turn.id) return;
    observed.current = turn.id;
    window.dispatchEvent(
      new CustomEvent("jh-assistant-updated", {
        detail: { turnId: turn.id, receipts: turn.receipts },
      }),
    );
    void refresh();
  }, [turn?.id, turn?.state, refresh]);
  return (
    <>
      {launcherContainer &&
        createPortal(
          <TooltipProvider>
            <Tooltip
              content={running ? "Open assistant · Working" : "Open assistant"}
              side="bottom"
              disabled={open}
              render={
                <Button
                  ref={launcher}
                  className="assistant-launcher"
                  variant="secondary"
                  shape="square"
                  icon={ChatCircleIcon}
                  aria-label="Open assistant"
                  aria-controls="app-assistant"
                  aria-expanded={open}
                  tabIndex={open ? -1 : 0}
                  data-hidden={open}
                  onClick={() => setOpen(true)}
                />
              }
            />
          </TooltipProvider>,
          launcherContainer,
        )}
      <aside
        ref={panel}
        id="app-assistant"
        className="assistant-pane"
        data-open={open}
        inert={!open}
        aria-hidden={!open}
        role="dialog"
        aria-modal={mobile && open ? true : undefined}
        aria-labelledby="assistant-title"
      >
        <header className="assistant-header">
          <h2 id="assistant-title">Assistant</h2>
          <div className="assistant-header-actions">
            <Button
              variant="secondary"
              disabled={!state || sending || running}
              onClick={() => void newChat()}
            >
              New chat
            </Button>
            <Button
              variant="ghost"
              shape="square"
              icon={XIcon}
              aria-label="Hide assistant"
              onClick={() => setOpen(false)}
            />
          </div>
        </header>
        {(error || resource.error) && (
          <div className="assistant-error" role="alert">
            <p>{error || resource.error}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setError("");
                void (initialized ? resource.reload() : start());
              }}
            >
              Retry
            </Button>
          </div>
        )}
        <ChatAttachments.Provider
          value={state?.messages.flatMap((m) => m.attachments) || []}
        >
          <AssistantRuntimeProvider runtime={runtime}>
            <ThreadPrimitive.Root className="profile-thread">
              <ThreadPrimitive.Viewport
                className="profile-chat-viewport"
                aria-label="Assistant conversation"
              >
                <ThreadPrimitive.Messages
                  components={{ Message: ChatMessage }}
                />
                {!state && <p role="status">Loading conversation…</p>}
                {running && (
                  <p className="profile-run-state" role="status">
                    {turn.state === "queued"
                      ? "Waiting for the model…"
                      : turn.activity || "Thinking…"}
                  </p>
                )}
                {turn?.error && (
                  <div className="profile-turn-error" role="alert">
                    <p>{turn.error}</p>
                    <Button
                      variant="secondary"
                      disabled={sending || running}
                      onClick={() =>
                        void run(`/assistant/${turn.id}/retry`, { context })
                      }
                    >
                      Retry message
                    </Button>
                  </div>
                )}
                {turn?.state === "cancelled" && (
                  <p role="status">Stopped. No changes were saved.</p>
                )}
              </ThreadPrimitive.Viewport>
              <ComposerPrimitive.Root className="profile-composer">
                <ComposerAttachments
                  remove={(id) =>
                    void runtime.thread.composer
                      .getAttachmentByIndex(
                        runtime.thread.composer
                          .getState()
                          .attachments.findIndex((a) => a.id === id),
                      )
                      .remove()
                  }
                />
                <ComposerPrimitive.Input
                  asChild
                  maxLength={16000}
                  addAttachmentOnPaste={true}
                  unstable_insertNewlineOnTouchEnter
                >
                  <InputArea
                    aria-label="Message assistant"
                    placeholder="Ask about jobs or edit your profile, CV, or letters…"
                    rows={3}
                  />
                </ComposerPrimitive.Input>
                <div className="profile-composer-actions">
                  <ComposerPrimitive.AddAttachment asChild>
                    <Button variant="ghost" disabled={running || sending}>
                      Attach files
                    </Button>
                  </ComposerPrimitive.AddAttachment>
                  {running ? (
                    <ComposerPrimitive.Cancel asChild>
                      <Button variant="secondary" icon={StopIcon}>
                        Stop
                      </Button>
                    </ComposerPrimitive.Cancel>
                  ) : (
                    <ComposerPrimitive.Send asChild>
                      <Button variant="primary" icon={ArrowUpIcon}>
                        Send
                      </Button>
                    </ComposerPrimitive.Send>
                  )}
                </div>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.Root>
          </AssistantRuntimeProvider>
        </ChatAttachments.Provider>
      </aside>
    </>
  );
}
