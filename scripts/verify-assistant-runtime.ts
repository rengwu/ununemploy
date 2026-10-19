import { connectPiFixture } from "./pi-test-auth.ts";
// Explicit opt-in: real subscription inference, isolated synthetic facts only.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-assistant-runtime-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = "";
const store = await import("../core/db/index.ts");
const assistant = await import("../core/assistant/service.ts");
const latex = await import("../core/latex/store.ts");
const { infer } = await import("../core/ai/pi.ts");
try {
  await connectPiFixture();
  const profile = store.getProfile();
  Object.assign(profile.basics, {
    name: "Maya Chen",
    location: "Kuala Lumpur, Malaysia",
    summary: "Software developer working on open source desktop tools.",
  });
  profile.preferences = {
    roleFamilies: ["software engineer"],
    workArrangements: ["remote", "hybrid"],
  };
  profile.projects = [
    {
      id: "chartr",
      name: "chartr",
      url: "https://chartr.dev",
      summary: "A Go and Svelte desktop workspace.",
      bullets: ["Organizes terminal sessions."],
      technologies: ["Go", "Svelte"],
      sources: [],
    },
  ];
  store.saveProfile(profile, profile.revision);
  const seeded = latex.latexVersion();
  latex.saveLatex(
    "\\documentclass{article}\n\\begin{document}\n\\section*{Maya Chen}\nSoftware developer working on open source desktop tools.\n\\section*{Projects}\n\\textbf{chartr} --- A Go and Svelte desktop workspace.\n\\begin{itemize}\n\\item Organizes terminal sessions.\n\\end{itemize}\n\\end{document}\n",
    seeded.version,
  );
  const initial = latex.latexVersion();
  assistant.startAssistant();
  assistant.enqueueAssistantMessage(
    "Update chartr in both my User profile and my actual LaTeX CV, preserving all unrelated content and formatting. Replace the stale Go/Svelte description with the current project description below. Rewrite the summary, project bullet and technologies from this pasted README; do not browse or invent employment experience. README: chartr is an open-source native desktop app built with Rust and GPUI. Keep your projects, tools, workflows, and agents together. Organize projects into spaces, arrange terminals and tools side by side. Herdr keeps terminal processes alive by default; reopen to restore sessions and layout. It runs locally with no chartr account. Upstream: Zed provides GPUI, UI components, themes and the terminal stack. Do the edits now and check the PDF.",
    randomUUID(),
    { page: "profile", dirty: false },
  );
  let round = 0;
  await assistant.processAssistantTurn({
    infer: async (prompt, schema, options) => {
      console.log(
        `Inference ${++round} started (${prompt.length} characters).`,
      );
      const output = await infer(prompt, schema, options);
      console.log(`Inference ${round} completed.`);
      return output;
    },
  });
  const state = assistant.assistantState();
  console.log(
    JSON.stringify(
      {
        turn: state.turn,
        reply: state.messages.at(-1)?.content,
        actions: store.db
          .prepare("SELECT tool FROM assistant_steps ORDER BY sequence")
          .all(),
      },
      null,
      2,
    ),
  );
  assert.equal(
    state.turn?.state,
    "complete",
    state.turn?.error || "No completed reply",
  );
  assert.ok(
    store.getProfile().projects[0].technologies.some((x) => /Rust/i.test(x)),
  );
  const updated = latex.latexVersion();
  assert.ok(updated.version > initial.version);
  assert.match(updated.source, /Rust/);
  assert.match(updated.source, /Maya Chen/);
  assert.ok(
    state.turn!.receipts.some(
      (r) => r.kind === "latex" && r.preview === "compiled",
    ),
  );
  assert.ok(latex.latexBuild(updated.hash));
  console.log(
    "Real Pi coordinated profile/LaTeX update and PDF compilation passed with synthetic data.",
  );
} finally {
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
