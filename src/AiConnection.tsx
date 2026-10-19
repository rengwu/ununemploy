import { useState } from "react";
import { Button, Input } from "./ui.tsx";
import { useRemote } from "./useRemote.ts";
import { api, jsonBody } from "./api.ts";
export function AiConnection({
  action,
  signedIn,
}: {
  action: (fn: () => Promise<unknown>) => Promise<boolean>;
  signedIn: boolean;
}) {
  const [callback, setCallback] = useState("");
  const remote = useRemote<{
    state: string;
    url?: string;
    message?: string;
    manual?: boolean;
  }>("/ai/connection", undefined, 1500);
  const current = remote.data;
  return (
    <div className="form-stack">
      {current?.state === "connecting" ? (
        <>
          {current.url ? (
            <a
              className="text-link"
              href={current.url}
              target="_blank"
              rel="noreferrer"
            >
              Continue with ChatGPT
            </a>
          ) : (
            <p role="status">Preparing sign-in…</p>
          )}
          {current.manual && (
            <details>
              <summary>Finish sign-in from another device</summary>
              <Input
                label="Final redirect URL"
                value={callback}
                onChange={(e) => setCallback(e.target.value)}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!callback.trim()}
                onClick={() =>
                  void action(async () => {
                    await api("/ai/connect/callback", {
                      method: "POST",
                      body: jsonBody({ url: callback }),
                    });
                    setCallback("");
                  })
                }
              >
                Finish sign-in
              </Button>
            </details>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              void action(async () => {
                await api("/ai/connect/cancel", { method: "POST" });
                await remote.reload();
              })
            }
          >
            Cancel sign-in
          </Button>
        </>
      ) : (
        <div className="row-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              void action(async () => {
                await api("/ai/connect", { method: "POST" });
                await remote.reload();
              })
            }
          >
            Sign in with ChatGPT
          </Button>
          {signedIn && (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                void action(async () => {
                  await api("/ai/disconnect", { method: "POST" });
                  await remote.reload();
                })
              }
            >
              Sign out
            </Button>
          )}
        </div>
      )}
      {current?.message && <p role="status">{current.message}</p>}
      {remote.error && <p role="alert">{remote.error}</p>}
    </div>
  );
}
