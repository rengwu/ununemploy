import { useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { api, jsonBody, type Bootstrap } from "./api.ts";
export function JevSettings({
  status,
  action,
}: {
  status: Bootstrap["jev"];
  action: (fn: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [key, setKey] = useState("");
  const [limit, setLimit] = useState(status.dailyLimit);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      return await action(fn);
    } finally {
      setBusy(false);
    }
  };
  const states: Record<string, string> = {
    not_configured: "Not configured",
    paused: "Paused",
    daily_limit: "Daily request limit reached",
    ready: "Enabled",
    blocked: "Needs attention",
    retrying: "Waiting to retry",
  };
  return (
    <section>
      <h2>Jev</h2>
      <div className="form-stack">
        <p>
          Optional assessment of job fit, location, work arrangement, and
          eligibility. Enabling Jev sends postings and relevant career,
          citizenship, location, and work authorization facts to TypeSafe AI.
          API usage is billed to your TypeSafe account.
        </p>
        <p role="status">{states[status.state] || status.state}</p>
        {status.message && <p className="source-error">{status.message}</p>}
        {status.retryAt && (
          <p>Next retry: {new Date(status.retryAt).toLocaleString()}</p>
        )}
        <Input
          label={status.configured ? "Replace Jev API key" : "Jev API key"}
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <div className="row-actions">
          <Button
            type="button"
            variant="secondary"
            loading={busy}
            disabled={!key.trim()}
            onClick={() =>
              void run(() =>
                api("/jev/key", {
                  method: "POST",
                  body: jsonBody({ token: key }),
                }),
              ).then((ok) => {
                if (ok) setKey("");
              })
            }
          >
            Save API key
          </Button>
          {status.configured && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(() => api("/jev/key", { method: "DELETE" }))
              }
            >
              Remove API key
            </Button>
          )}
          <a
            href="https://console.typesafe.ai/"
            target="_blank"
            rel="noreferrer"
          >
            TypeSafe console
          </a>
        </div>
        <Input
          label="Jev requests per day (UTC)"
          type="number"
          min={0}
          max={10000}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
        <p>
          {status.used} requests used or reserved today.{" "}
          {status.inputTokens.toLocaleString()} input tokens reported. Saving a
          key enables background assessment, up to this limit. Saved jobs are
          assessed first. Results are refreshed when posting or relevant profile
          facts change.
        </p>
        <div className="row-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={
              busy || !Number.isInteger(limit) || limit < 0 || limit > 10000
            }
            onClick={() =>
              void run(() =>
                api("/jev/settings", {
                  method: "PUT",
                  body: jsonBody({
                    enabled: status.enabled,
                    dailyLimit: limit,
                  }),
                }),
              )
            }
          >
            Save Jev limit
          </Button>
          {status.configured && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  api("/jev/settings", {
                    method: "PUT",
                    body: jsonBody({
                      enabled: !status.enabled,
                      dailyLimit: status.dailyLimit,
                    }),
                  }),
                )
              }
            >
              {status.enabled ? "Pause Jev" : "Enable Jev"}
            </Button>
          )}
          {status.configured &&
            ["blocked", "retrying"].includes(status.state) && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(() => api("/jev/retry", { method: "POST" }))
                }
              >
                Retry connection
              </Button>
            )}
        </div>
        <p>
          Keep citizenship, work authorization and relocation preferences
          current in User profile. Missing information stays unconfirmed.
          Pausing Jev or removing the key restores the original matching and
          filters.
        </p>
      </div>
    </section>
  );
}
