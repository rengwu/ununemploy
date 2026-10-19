// Read-only live retrieval check; no inference, credentials or candidate records.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const [repository, author] = process.argv.slice(2);
if (!repository || !author)
  throw new Error("Pass a public GitHub repository URL and author account.");
const directory = mkdtempSync(join(tmpdir(), "ununemploy-reference-check-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = "";
const { readReference } = await import("../core/assistant/references.ts");
const { db } = await import("../core/db/index.ts");
try {
  const allowed = new Set([new URL(repository).href]);
  const budget = { requests: 0, limit: 8 };
  const signal = AbortSignal.timeout(60000);
  const commits = await readReference(
    `${repository}/commits?author=${encodeURIComponent(author)}`,
    allowed,
    budget,
    signal,
    `Research @${author}`,
  );
  const pulls = await readReference(
    `${repository}/pulls?q=${encodeURIComponent(`is:pr author:${author}`)}`,
    allowed,
    budget,
    signal,
    `Research @${author}`,
  );
  assert.ok(commits.text.length && pulls.text.includes('"total_count"'));
  const detail = commits.links?.find((url) => /\/commit\/[a-f\d]+$/.test(url));
  assert.ok(
    detail,
    "Fixture account must have public commits in this repository.",
  );
  const commit = await readReference(detail, allowed, budget, signal);
  assert.ok(commit.text.includes('"commit"'));
  const evidence = resolve(".local-data/verification/assistant-references");
  mkdirSync(evidence, { recursive: true });
  writeFileSync(
    join(evidence, "results.json"),
    JSON.stringify(
      {
        passed: true,
        publicCommitList: true,
        publicPullRequestList: true,
        derivedCommitDetail: true,
        credentialFree: true,
        requests: budget.requests,
      },
      null,
      2,
    ),
  );
  console.log("Live public reference checks passed.");
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
