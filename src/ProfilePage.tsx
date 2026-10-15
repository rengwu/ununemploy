import { useEffect, useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Select } from "@cloudflare/kumo/components/select";
import { Banner } from "@cloudflare/kumo/components/banner";
import { api, jsonBody, type Bootstrap } from "./api.ts";
import { useRemote } from "./useRemote.ts";
import { SafeMarkdown } from "./SafeMarkdown.tsx";
import { openAssistant, onAssistantUpdate } from "./assistant-context.ts";
import type { UserProfileState } from "../core/api-types.ts";
export function ProfilePage({
  boot,
  refresh,
}: {
  boot: Bootstrap;
  refresh: () => Promise<void>;
}) {
  const resource = useRemote<UserProfileState>(
    "/profile",
    String(boot.profile.revision),
    3000,
  );
  const [error, setError] = useState("");
  const [restoreRevision, setRestoreRevision] = useState("");
  const [saving, setSaving] = useState(false);
  const state = resource.data,
    readiness = state?.readiness || boot.profile;
  useEffect(
    () => onAssistantUpdate(() => void resource.reload()),
    [resource.reload],
  );
  const restore = async () => {
    if (!state) return;
    setSaving(true);
    setError("");
    try {
      await api("/profile/restore", {
        method: "POST",
        body: jsonBody({
          revision: Number(restoreRevision),
          expectedRevision: state.profile.revision,
        }),
      });
      setRestoreRevision("");
      await resource.reload();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore profile.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="profile-page profile-facts-page">
      {(error || resource.error) && (
        <div className="page-error" role="alert">
          <Banner
            variant="error"
            title={error || resource.error}
            action={
              <Button
                variant="ghost"
                onClick={() => {
                  setError("");
                  void resource.reload();
                }}
              >
                Retry
              </Button>
            }
          />
        </div>
      )}
      <header className="profile-toolbar">
        <div className="profile-readiness" role="status">
          {readiness.ready ? (
            <p>
              {boot.settings.scheduleEnabled
                ? "Ready for job discovery."
                : "Profile ready. Scheduled scanning is paused in Settings."}
            </p>
          ) : (
            <>
              <p>Job scanning is waiting for your profile.</p>
              <p className="muted">
                Still needed:{" "}
                {readiness.missing.map((m) => m.label.toLowerCase()).join(", ")}
                .
              </p>
            </>
          )}
        </div>
        <div className="profile-toolbar-actions">
          {!!state && state.versions.length > 1 && (
            <div className="profile-version-actions">
              <Select
                aria-label="Profile version to restore"
                value={restoreRevision}
                onValueChange={(v) => setRestoreRevision(String(v))}
                placeholder="Previous versions"
              >
                {state.versions
                  .filter((v) => v.revision !== state.profile.revision)
                  .map((v) => (
                    <Select.Option key={v.revision} value={String(v.revision)}>
                      Revision {v.revision} ·{" "}
                      {new Date(v.createdAt).toLocaleDateString()}
                    </Select.Option>
                  ))}
              </Select>
              <Button
                variant="secondary"
                disabled={
                  !restoreRevision ||
                  saving ||
                  ["queued", "running"].includes(state.turn?.state || "")
                }
                onClick={() => void restore()}
              >
                Restore version
              </Button>
            </div>
          )}
          {!readiness.ready && (
            <Button variant="secondary" onClick={openAssistant}>
              Build profile
            </Button>
          )}
        </div>
      </header>
      <div
        className="profile-facts-scroll"
        aria-label="Read-only profile facts"
      >
        {state ? (
          <SafeMarkdown text={state.markdown} />
        ) : (
          <p role="status">Loading profile…</p>
        )}
      </div>
    </div>
  );
}
