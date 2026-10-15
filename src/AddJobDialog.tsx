import { useState, type FormEvent } from "react";
import { Dialog, Button, Input, InputArea, Banner } from "./ui.tsx";
import type { Source } from "../core/types.ts";

export function AddJobDialog({
  open,
  onClose,
  onAdd,
  source,
}: {
  source?: Source;
  open: boolean;
  onClose: () => void;
  onAdd: (value: unknown) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onAdd({
        ...Object.fromEntries(data),
        ...(source ? { sourceId: source.id } : {}),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the job.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog size="lg" className="app-dialog">
        <Dialog.Title>Add job</Dialog.Title>
        <form onSubmit={submit} className="form-stack">
          {source && <Input label="Source" value={source.name} readOnly />}
          <Input name="title" label="Role" required />
          <Input name="company" label="Company" required />
          <Input name="url" type="url" label="Posting URL" required />
          <Input name="location" label="Location" />
          <InputArea name="description" label="Job description" rows={8} />
          {error && <Banner variant="error" title={error} />}
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Add job
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
