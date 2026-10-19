import { AiConnection } from "./AiConnection.tsx";
import { BackupSettings } from "./BackupSettings.tsx";
import { useState, type FormEvent } from "react";
import { Button, Input, Select, Dialog, Table, Banner } from "./ui.tsx";
import { PlusIcon, ArrowClockwiseIcon } from "@phosphor-icons/react";
import { api, jsonBody, time, type Bootstrap } from "./api.ts";
import type { Source } from "../core/types.ts";
type Action = (fn: () => Promise<unknown>) => Promise<boolean>;
import {
  sourceTypes,
  fixedIdentifiers,
  sourcePolicy,
} from "../core/source-catalog.ts";
import { publicBoards, boardHomepage } from "../core/boards/catalog.ts";
import { AddJobDialog } from "./AddJobDialog.tsx";
function Choice({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: Record<string, string>;
}) {
  return (
    <Select
      label={label}
      value={value}
      onValueChange={(v) => v !== null && onChange(String(v))}
      items={items}
    >
      {Object.entries(items).map(([v, text]) => (
        <Select.Option key={v} value={v}>
          {text}
        </Select.Option>
      ))}
    </Select>
  );
}
export function SourcesPage({
  boot,
  action,
}: {
  boot: Bootstrap;
  action: Action;
}) {
  const [edit, setEdit] = useState<Source | "new" | null>(null);
  const [manual, setManual] = useState<Source | undefined>();
  return (
    <div className="standard-page">
      <div className="toolbar">
        <Button
          variant="primary"
          icon={PlusIcon}
          onClick={() => setEdit("new")}
        >
          Add source
        </Button>
        <div className="toolbar-spacer" />
        <Button
          variant="secondary"
          icon={ArrowClockwiseIcon}
          onClick={() =>
            void action(() => api("/scan", { method: "POST", body: "{}" }))
          }
        >
          Scan all
        </Button>
      </div>
      <div className="source-table-scroll">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>Source</Table.Head>
              <Table.Head>Type</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Last scan</Table.Head>
              <Table.Head>Next scan</Table.Head>
              <Table.Head>Jobs</Table.Head>
              <Table.Head>Actions</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {boot.sources
              .filter((s) => s.identifier !== "manual")
              .map((s) => (
                <Table.Row key={s.id}>
                  <Table.Cell>
                    <button className="job-title" onClick={() => setEdit(s)}>
                      {s.name}
                    </button>
                    {s.lastError && (
                      <div className="source-error">{s.lastError}</div>
                    )}
                  </Table.Cell>
                  <Table.Cell>{sourceTypes[s.type]}</Table.Cell>
                  <Table.Cell>
                    {s.type === "website"
                      ? "Manual"
                      : s.type === "web3" &&
                          (!boot.web3.configured || s.state === "needs_token")
                        ? "Needs API token"
                        : s.type === "x" && !boot.settings.xEnabled
                          ? "Disabled in Settings"
                          : s.enabled
                            ? {
                                idle: "Ready",
                                running: "Scanning",
                                partial: "Partial",
                                failed: "Failed",
                                blocked: "Blocked",
                                unavailable: "Unavailable",
                                needs_setup: "Needs API setup",
                              }[s.state] || s.state
                            : "Paused"}
                  </Table.Cell>
                  <Table.Cell>
                    {s.type === "website" ? "—" : time(s.lastRunAt)}
                  </Table.Cell>
                  <Table.Cell>
                    {s.type === "website"
                      ? "—"
                      : s.type === "web3" &&
                          (!boot.web3.configured || s.state === "needs_token")
                        ? "Awaiting token"
                        : s.enabled &&
                            boot.settings.scheduleEnabled &&
                            (s.type !== "x" || boot.settings.xEnabled)
                          ? s.nextRunAt
                            ? time(s.nextRunAt)
                            : "Due"
                          : "Paused"}
                  </Table.Cell>
                  <Table.Cell>{s.jobCount}</Table.Cell>
                  <Table.Cell>
                    <div className="row-actions compact">
                      <Button variant="ghost" onClick={() => setEdit(s)}>
                        Edit
                      </Button>
                      {s.type === "public_board" && (
                        <>
                          <a
                            className="whitespace-nowrap"
                            href={boardHomepage(s.identifier)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open site
                          </a>
                          <Button variant="ghost" onClick={() => setManual(s)}>
                            Add job
                          </Button>
                        </>
                      )}
                      {s.type === "website" ? (
                        <>
                          <a
                            className="whitespace-nowrap"
                            href={s.identifier}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open site
                          </a>
                          <Button variant="ghost" onClick={() => setManual(s)}>
                            Add job
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              void action(() =>
                                api(`/sources/${s.id}`, {
                                  method: "PATCH",
                                  body: jsonBody({ enabled: !s.enabled }),
                                }),
                              )
                            }
                          >
                            {s.enabled ? "Pause" : "Enable"}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={
                              !s.enabled ||
                              s.state === "running" ||
                              (s.type === "x" && !boot.settings.xEnabled) ||
                              (s.type === "web3" &&
                                (!boot.web3.configured ||
                                  s.state === "needs_token"))
                            }
                            onClick={() =>
                              void action(() =>
                                api("/scan", {
                                  method: "POST",
                                  body: jsonBody({ sourceId: s.id }),
                                }),
                              )
                            }
                          >
                            Scan
                          </Button>
                        </>
                      )}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
          </Table.Body>
        </Table>
      </div>
      <AddJobDialog
        key={manual?.id || "closed"}
        open={!!manual}
        source={manual}
        onClose={() => setManual(undefined)}
        onAdd={async (value) => {
          const ok = await action(() =>
            api("/jobs", { method: "POST", body: jsonBody(value) }),
          );
          if (!ok)
            throw new Error("Could not add the job. Check the entered values.");
        }}
      />
      {boot.runs.length > 0 && (
        <section className="scan-history">
          <h2>Scan history</h2>
          <div className="source-table-scroll">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Source</Table.Head>
                  <Table.Head>Started</Table.Head>
                  <Table.Head>Status</Table.Head>
                  <Table.Head>Requests</Table.Head>
                  <Table.Head>Added</Table.Head>
                  <Table.Head>Updated</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {boot.runs.slice(0, 30).map((r) => (
                  <Table.Row key={r.id}>
                    <Table.Cell>
                      {r.sourceName ||
                        boot.sources.find((s) => s.id === r.sourceId)?.name}
                    </Table.Cell>
                    <Table.Cell>{time(r.startedAt)}</Table.Cell>
                    <Table.Cell>{r.status}</Table.Cell>
                    <Table.Cell>{r.requests}</Table.Cell>
                    <Table.Cell>{r.added}</Table.Cell>
                    <Table.Cell>{r.updated}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </section>
      )}
      {edit && (
        <SourceDialog
          key={edit === "new" ? "new" : edit.id}
          source={edit === "new" ? null : edit}
          action={action}
          close={() => setEdit(null)}
        />
      )}
    </div>
  );
}
function SourceDialog({
  source,
  action,
  close,
}: {
  source: Source | null;
  action: Action;
  close: () => void;
}) {
  const [type, setType] = useState(source?.type || "ashby");
  const [board, setBoard] = useState(
    source?.type === "public_board" ? source.identifier : "hiredly",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await action(() =>
      api(source ? `/sources/${source.id}` : "/sources", {
        method: source ? "PATCH" : "POST",
        body: jsonBody({
          name: data.get("name"),
          type,
          identifier:
            type === "public_board"
              ? board
              : fixedIdentifiers[type] || data.get("identifier"),
          intervalHours:
            type === "website" ? undefined : Number(data.get("intervalHours")),
          enabled: type === "website" ? false : (source?.enabled ?? true),
          requestLimit:
            type === "website" ? 1 : Number(data.get("requestLimit")),
        }),
      }),
    );
    setBusy(false);
    if (ok) close();
    else setError("Could not save the source. Check its configuration.");
  };
  const labels = {
    ashby: "Board name",
    greenhouse: "Board token",
    lever: "Site name",
    hn: "Account",
    hn_jobs: "Feed",
    himalayas: "Search keywords (separate with |)",
    remoteok: "Feed",
    workingnomads: "Feed",
    remotive: "Feed",
    jobicy: "Feed",
    fourdayweek: "Categories (separate with commas)",
    arbeitnow: "Region (de or uk)",
    rss: "Feed URL",
    x: "Search query",
    web3: "Feed",
    website: "Website URL",
    public_board: "Board",
  };
  return (
    <Dialog.Root open onOpenChange={(v) => !v && close()}>
      <Dialog className="app-dialog" size="lg">
        <Dialog.Title>{source ? "Edit source" : "Add source"}</Dialog.Title>
        <form className="form-stack" onSubmit={submit}>
          <Input
            label="Name"
            name="name"
            defaultValue={source?.name}
            required
          />
          <Choice
            label="Source type"
            value={type}
            onChange={(v) => setType(v as Source["type"])}
            items={sourceTypes}
          />
          {type === "public_board" && (
            <Choice
              label="Board"
              value={board}
              onChange={setBoard}
              items={Object.fromEntries(
                Object.entries(publicBoards).map(([key, value]) => [
                  key,
                  value.name,
                ]),
              )}
            />
          )}
          {!fixedIdentifiers[type] && type !== "public_board" && (
            <Input
              key={type}
              label={labels[type]}
              name="identifier"
              defaultValue={source?.type === type ? source.identifier : ""}
              placeholder={
                type === "website"
                  ? "https://example.com/jobs"
                  : type === "rss"
                    ? "https://example.com/jobs.xml"
                    : type === "x"
                      ? '("hiring" OR "join our team") (engineer OR developer) -is:retweet'
                      : undefined
              }
              required
            />
          )}
          {type !== "website" && (
            <>
              <Input
                key={`interval-${type}`}
                name="intervalHours"
                label="Scan interval (hours)"
                type="number"
                min={sourcePolicy({ type, identifier: "" }).minimumHours}
                max={168}
                defaultValue={Math.max(
                  source?.intervalHours || 4,
                  sourcePolicy({ type, identifier: "" }).minimumHours,
                )}
                required
              />
              <Input
                name="requestLimit"
                label="Maximum requests per scan"
                type="number"
                min={1}
                max={type === "public_board" ? 12 : 100}
                defaultValue={
                  source?.requestLimit || (type === "public_board" ? 12 : 30)
                }
                required
              />
            </>
          )}
          {error && <Banner variant="error" title={error} />}
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={busy}>
              Save source
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
export function SettingsPage({
  boot,
  action,
  theme,
  onThemeChange,
}: {
  boot: Bootstrap;
  action: Action;
  theme: string;
  onThemeChange: (theme: string) => void;
}) {
  const [section, setSection] = useState("general");
  const [token, setToken] = useState("");
  const [tokenBusy, setTokenBusy] = useState(false);
  const [web3Token, setWeb3Token] = useState("");
  const [web3Busy, setWeb3Busy] = useState(false);
  const [settings, setSettings] = useState(boot.settings);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const edit = (value: Partial<typeof settings>) => {
    setSettings((s) => ({ ...s, ...value }));
    setSaved(false);
  };
  return (
    <div className="settings-layout">
      <nav aria-label="Settings sections" className="settings-nav">
        {Object.entries({
          general: "General",
          collection: "Collection",
          ai: "AI",
          connections: "Connections",
        }).map(([key, label]) => (
          <button
            key={key}
            aria-current={section === key ? "page" : undefined}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="standard-page settings-page">
        <div hidden={section !== "general"}>
          <section>
            <h2>Appearance</h2>
            <Choice
              label="Theme"
              value={theme}
              onChange={onThemeChange}
              items={{ system: "System", light: "Light", dark: "Dark" }}
            />
          </section>
          <BackupSettings />
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await action(() =>
              api("/settings", { method: "PUT", body: jsonBody(settings) }),
            );
            setBusy(false);
            setSaved(ok);
          }}
        >
          <section hidden={section !== "collection"}>
            <h2>Collection</h2>
            <div className="form-stack">
              <Input
                label="Scan interval (hours)"
                type="number"
                min={4}
                max={168}
                value={settings.scanIntervalHours}
                onChange={(e) =>
                  edit({ scanIntervalHours: Number(e.target.value) })
                }
              />
              <Input
                label="Time zone"
                value={settings.timezone}
                onChange={(e) => edit({ timezone: e.target.value })}
              />
              <Choice
                label="Schedule"
                value={String(settings.scheduleEnabled)}
                onChange={(v) => edit({ scheduleEnabled: v === "true" })}
                items={{ true: "Schedule enabled", false: "Schedule paused" }}
              />
              <p>
                Each source is limited to at most six scans per day, including
                manual scans.
              </p>
            </div>
          </section>
          <section hidden={section !== "ai"}>
            <h2>ChatGPT</h2>
            <AiConnection
              action={action}
              signedIn={boot.ai.state !== "signed_out"}
            />
            <dl className="settings-facts">
              <div>
                <dt>Model</dt>
                <dd>{boot.ai.model}</dd>
              </div>
              <div>
                <dt>Reasoning</dt>
                <dd>{boot.ai.reasoning}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{boot.ai.state}</dd>
              </div>
            </dl>
            {boot.ai.message && <p>{boot.ai.message}</p>}
            <div className="row-actions">
              <Choice
                label="Cover letter generation"
                value={String(settings.aiEnabled)}
                onChange={(v) => edit({ aiEnabled: v === "true" })}
                items={{
                  true: "Generation enabled",
                  false: "Generation paused",
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void action(() => api("/ai/check", { method: "POST" }))
                }
              >
                Check connection
              </Button>
            </div>
          </section>
          <section hidden={section !== "connections"}>
            <h2>X</h2>
            <div className="form-stack">
              <p>
                Bearer token:{" "}
                {boot.x?.configured ? "Configured" : "Not configured"}
              </p>
              <Input
                label={
                  boot.x?.configured ? "Replace bearer token" : "Bearer token"
                }
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <div className="row-actions">
                <Button
                  type="button"
                  variant="secondary"
                  loading={tokenBusy}
                  disabled={token.length < 10}
                  onClick={async () => {
                    setTokenBusy(true);
                    const ok = await action(() =>
                      api("/x/token", {
                        method: "POST",
                        body: jsonBody({ token }),
                      }),
                    );
                    if (ok) setToken("");
                    setTokenBusy(false);
                  }}
                >
                  Save token
                </Button>
                <a
                  href="https://console.x.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  X developer console
                </a>
              </div>
              <Choice
                label="X collection"
                value={String(settings.xEnabled)}
                onChange={(v) => edit({ xEnabled: v === "true" })}
                items={{ false: "X disabled", true: "X enabled" }}
              />
              <Input
                label="Monthly post limit"
                type="number"
                min={0}
                max={100000}
                value={settings.xMonthlyPostLimit}
                onChange={(e) =>
                  edit({ xMonthlyPostLimit: Number(e.target.value) })
                }
              />
              <p>
                {boot.x?.used || 0} posts used or reserved this month. This
                limits retrieval volume; API charges follow your X account
                pricing.
              </p>
            </div>
          </section>
          <section hidden={section !== "connections"}>
            <h2>Web3.career</h2>
            <div className="form-stack">
              <p>
                API token:{" "}
                {boot.web3.configured ? "Configured" : "Not configured"}
              </p>
              <Input
                label={
                  boot.web3.configured
                    ? "Replace Web3.career API token"
                    : "Web3.career API token"
                }
                type="password"
                autoComplete="off"
                value={web3Token}
                onChange={(e) => setWeb3Token(e.target.value)}
              />
              <div className="row-actions">
                <Button
                  type="button"
                  variant="secondary"
                  loading={web3Busy}
                  disabled={!web3Token.trim()}
                  onClick={async () => {
                    setWeb3Busy(true);
                    const ok = await action(() =>
                      api("/web3/token", {
                        method: "POST",
                        body: jsonBody({ token: web3Token }),
                      }),
                    );
                    if (ok) setWeb3Token("");
                    setWeb3Busy(false);
                  }}
                >
                  Save token
                </Button>
                <a
                  href="https://web3.career/web3-jobs-api"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get API token
                </a>
              </div>
            </div>
          </section>
          <div className="row-actions" hidden={section === "general"}>
            <Button type="submit" variant="primary" loading={busy}>
              Save settings
            </Button>
            {saved && <span role="status">Settings saved.</span>}
          </div>
        </form>
        {boot.tasks.some(
          (t) =>
            t.kind === "cover_letter" &&
            ["paused", "failed", "needs_details"].includes(t.state),
        ) && (
          <section className="scan-history" hidden={section !== "ai"}>
            <h2>Cover letter tasks</h2>
            {boot.tasks
              .filter(
                (t) =>
                  t.kind === "cover_letter" &&
                  ["paused", "failed", "needs_details"].includes(t.state),
              )
              .map((t) => (
                <div className="task-row" key={t.id}>
                  <div>
                    {t.jobTitle}
                    <p className="source-error">{t.error}</p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void action(() =>
                        api(`/tasks/${t.id}/retry`, { method: "POST" }),
                      )
                    }
                  >
                    Retry
                  </Button>
                </div>
              ))}
          </section>
        )}
      </div>
    </div>
  );
}
