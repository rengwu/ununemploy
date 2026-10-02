import { Button } from "@cloudflare/kumo/components/button";
import { api } from "./api.ts";
import type { Job } from "../core/types.ts";
import type { JevChoice } from "../core/jev/types.ts";
const labels: Record<string, string> = {
  strong: "Strong",
  adjacent: "Adjacent",
  stretch: "Stretch",
  other: "Other",
  unknown: "Unconfirmed",
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "Onsite",
  available: "Offered",
  unavailable: "Not offered",
  conditional: "Conditional",
  conflict: "Apparent conflict — review evidence",
  possible: "Potentially compatible",
  review: "Needs review",
};
const result = (a: JevChoice, evidence = true) => {
  const certain =
    a.confidence >= 0.85 && a.probabilities[a.choice] >= 0.85 && evidence;
  const label = labels[a.choice] || a.choice;
  return `${certain || a.choice === "unknown" ? label : `Unconfirmed (model suggests: ${label})`} · ${Math.round(a.confidence * 100)}% model confidence`;
};
export function JevAssessment({
  job,
  busy,
  action,
}: {
  job: Job;
  busy: boolean;
  action: (fn: () => Promise<unknown>) => Promise<boolean>;
}) {
  const jev = job.jev;
  if (!jev) return null;
  const a = jev.assessment;
  return (
    <section className="jev-assessment">
      <h3>Jev assessment</h3>
      {a ? (
        <>
          <p>
            {new Date(a.assessedAt).toLocaleString()} · {a.model}
          </p>
          <dl className="match-breakdown">
            <div>
              <dt>Role fit</dt>
              <dd>{result(a.match)}</dd>
            </div>
            <div>
              <dt>Work arrangement</dt>
              <dd>{result(a.arrangement, !!a.arrangementEvidence)}</dd>
            </div>
            <div>
              <dt>Visa sponsorship</dt>
              <dd>{result(a.sponsorship, !!a.sponsorshipEvidence)}</dd>
            </div>
            <div>
              <dt>Eligibility</dt>
              <dd>
                {result(
                  a.eligibility,
                  a.eligibility.choice === "possible" ||
                    !!a.eligibilityEvidence,
                )}
              </dd>
            </div>
            <div>
              <dt>Workplace</dt>
              <dd>
                {a.locations
                  .filter((l) => l.kind === "workplace")
                  .map((l) => l.name)
                  .join(", ") || "Unconfirmed"}
              </dd>
            </div>
            <div>
              <dt>Hiring locations</dt>
              <dd>
                {a.locations
                  .filter((l) => l.kind === "hiring")
                  .map((l) => l.name)
                  .join(", ") || "Unconfirmed"}
              </dd>
            </div>
            <div>
              <dt>Original location</dt>
              <dd>{jev.sourceLocation || "Unspecified"}</dd>
            </div>
            <div>
              <dt>Original arrangement</dt>
              <dd>{jev.sourceArrangement || "Unspecified"}</dd>
            </div>
          </dl>
          {[
            ["Location evidence", a.locationEvidence],
            ["Arrangement evidence", a.arrangementEvidence],
            ["Sponsorship evidence", a.sponsorshipEvidence],
            ["Eligibility evidence", a.eligibilityEvidence],
          ].map(([label, quote]) =>
            quote ? (
              <div key={label}>
                <h4>{label}</h4>
                <blockquote>{quote}</blockquote>
              </div>
            ) : null,
          )}
          <p>
            Model confidence is not the chance of being hired or getting a visa.
            Uncertain assessments keep the original matching and remain
            available for review.
          </p>
        </>
      ) : (
        <>
          <p role="status">
            {jev.state === "running"
              ? "Assessing with Jev…"
              : jev.state === "queued"
                ? "Queued for Jev assessment."
                : jev.state === "failed"
                  ? "Jev assessment unavailable."
                  : "Not yet assessed. Existing matching is shown."}
          </p>
          {jev.error && <p className="source-error">{jev.error}</p>}
          <Button
            variant="secondary"
            disabled={busy || jev.state === "running" || jev.state === "queued"}
            onClick={() =>
              void action(() => api(`/jobs/${job.id}/jev`, { method: "POST" }))
            }
          >
            {jev.state === "failed"
              ? "Retry Jev assessment"
              : "Assess with Jev"}
          </Button>
        </>
      )}
    </section>
  );
}
