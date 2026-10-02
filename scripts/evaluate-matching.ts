import { readFileSync, writeFileSync } from "node:fs";
import { assessJob } from "../core/matching.ts";
import type { IncomingJob, Profile } from "../core/types.ts";
const data = JSON.parse(
  readFileSync(
    new URL("../tests/fixtures/listing-evaluation.json", import.meta.url),
    "utf8",
  ),
);
const profile = JSON.parse(
  readFileSync(
    new URL("../tests/fixtures/profile.json", import.meta.url),
    "utf8",
  ),
) as Profile;
const results = data.fixtures.map((fixture: any) => {
  const match = assessJob(fixture.job as IncomingJob, profile),
    expected = fixture.expected;
  const fitPass = match.score >= expected.min && match.score <= expected.max;
  const eligibilityPass =
    expected.eligibility === "not-incompatible"
      ? match.eligibility !== "incompatible"
      : match.eligibility === expected.eligibility;
  return {
    id: fixture.id,
    title: fixture.job.title,
    company: fixture.job.company,
    url: fixture.job.url,
    previousScore: fixture.baseline.score,
    score: match.score,
    eligibility: match.eligibility,
    expected,
    fitPass,
    eligibilityPass,
    gaps: match.gaps,
    evidence: match.eligibilityEvidence,
  };
});
const report = {
  evaluatedAt: new Date().toISOString(),
  method: data.method,
  total: results.length,
  fitPassed: results.filter((r: any) => r.fitPass).length,
  eligibilityPassed: results.filter((r: any) => r.eligibilityPass).length,
  results,
};
if (process.argv.includes("--write"))
  writeFileSync(
    new URL(
      "../.local-data/verification/matching-evaluation.json",
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
console.log(JSON.stringify(report, null, 2));
if (results.some((r: any) => !r.fitPass || !r.eligibilityPass))
  process.exitCode = 1;
