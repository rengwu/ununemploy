import { useEffect, useRef, useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Banner } from "@cloudflare/kumo/components/banner";
import { api, readJson } from "./api.ts";
import { MAX_ZIP_BYTES } from "../core/backup/limits.ts";

export function BackupSettings() {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(
    () => sessionStorage.getItem("jh-backup-imported") === "true",
  );
  useEffect(() => {
    sessionStorage.removeItem("jh-backup-imported");
  }, []);
  async function download() {
    setBusy("export");
    setError("");
    setDone(false);
    try {
      const response = await fetch("/api/backups/export");
      if (!response.ok)
        throw new Error(
          (await readJson(response)).error || "Could not export backup.",
        );
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || "ununemploy.zip";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export backup.");
    } finally {
      setBusy(null);
    }
  }
  async function restore(file: File) {
    setBusy("import");
    setError("");
    setDone(false);
    try {
      if (file.size > MAX_ZIP_BYTES)
        throw new Error("Choose a ZIP backup no larger than 128 MiB.");
      await api("/backups/import", {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      sessionStorage.setItem("jh-backup-imported", "true");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import backup.");
      setBusy(null);
    }
  }
  return (
    <section aria-labelledby="backup-heading">
      <h2 id="backup-heading">Backup</h2>
      <div className="form-stack backup-settings">
        <p>
          Export your current profile, scanned and saved jobs, LaTeX CV and
          cover letters. Only the latest saved document versions are included.
        </p>
        <p>
          History, conversations, source settings and credentials are excluded.
        </p>
        <div className="backup-actions">
          <Button
            disabled={busy !== null}
            loading={busy === "export"}
            onClick={() => void download()}
          >
            Export to Backup
          </Button>
          <Button
            disabled={busy !== null}
            loading={busy === "import"}
            onClick={() => picker.current?.click()}
          >
            Restore from Backup
          </Button>
        </div>
        <input
          ref={picker}
          hidden
          type="file"
          accept=".zip,application/zip"
          aria-label="ZIP backup"
          disabled={busy !== null}
          onChange={(e) => {
            const selected = e.target.files?.[0];
            e.target.value = "";
            if (selected) void restore(selected);
          }}
        />
        <p>
          Restoring replaces your personal data and removes its history and
          conversations. No automatic backup is made. Export first if you want
          to keep the existing data. Settings and source configuration stay
          unchanged.
        </p>
        {error && <Banner variant="error" title={error} />}
        {done && <p role="status">Backup restored.</p>}
      </div>
    </section>
  );
}
