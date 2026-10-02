import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessJob } from "../core/matching.ts";
import { assessEligibility } from "../core/eligibility.ts";
import type { IncomingJob, Profile } from "../core/types.ts";
const profile = JSON.parse(
  readFileSync(
    new URL("./fixtures/profile.json", import.meta.url),
    "utf8",
  ),
) as Profile;
const job = (
  description: string,
  patch: Partial<IncomingJob> = {},
): IncomingJob => ({
  sourceItemId: "test",
  title: "Senior Frontend Engineer",
  company: "Example",
  location: "United States",
  locationScope: "hiring",
  arrangement: "Remote",
  employmentType: "Full-time",
  salary: "",
  url: "https://example.com/job/1",
  description,
  descriptionQuality: "full",
  publishedAt: null,
  kind: "opening",
  ...patch,
});

test("citizenship rules ignore EEO, negation, preferred citizenship and unrelated mentions", () => {
  for (const description of [
    "We do not discriminate based on citizenship, race or religion.",
    "US citizenship is not required.",
    "US citizenship preferred.",
    "You will build services for US citizens.",
    "We require software that helps US citizens.",
  ]) {
    assert.notEqual(
      assessEligibility(job(description), profile).eligibility,
      "incompatible",
      description,
    );
  }
  for (const description of [
    "US citizens only.",
    "Due to contract requirements, this position requires U.S. citizenship.",
    "Applicants must be British citizens.",
    "US citizenship required. We sponsor visas for eligible positions.",
  ])
    assert.equal(
      assessEligibility(job(description), profile).eligibility,
      "incompatible",
      description,
    );
  assert.notEqual(
    assessEligibility(job("Malaysian citizens only."), profile).eligibility,
    "incompatible",
  );
});
test("citizenship alternatives honor known authorization and do not assume unknown residency", () => {
  const description =
    "We can only hire US citizens or lawful permanent residents.";
  assert.equal(
    assessEligibility(job(description), profile).eligibility,
    "incompatible",
  );
  const other = structuredClone(profile);
  other.preferences.existingWorkAuthorizationsOutsideMalaysia = [
    "United States",
  ];
  assert.equal(
    assessEligibility(job(description), other).eligibility,
    "review",
  );
  other.preferences.existingWorkAuthorizationsOutsideMalaysia = null;
  assert.equal(
    assessEligibility(job(description), other).eligibility,
    "review",
  );
});
test("remote geography permits relocation and unknown visas while explicit current restrictions are conflicts", () => {
  const limited = assessEligibility(
    job("Build React and TypeScript products."),
    profile,
  );
  assert.equal(limited.remoteEligibility, "restricted");
  assert.equal(limited.eligibility, "review");
  assert.equal(
    assessEligibility(
      job("Applicants must reside in the United States."),
      profile,
    ).eligibility,
    "review",
  );
  assert.equal(
    assessEligibility(
      job(
        "Applicants must currently reside in the United States. No relocation available.",
      ),
      profile,
    ).eligibility,
    "incompatible",
  );
  assert.equal(
    assessEligibility(
      job(
        "Existing right to work in Singapore is required for this role. We do sponsor visas!",
        { location: "Singapore" },
      ),
      profile,
    ).eligibility,
    "incompatible",
  );
  for (const location of [
    "Malaysia",
    "Malaysia · Singapore",
    "APAC",
    "Worldwide",
  ])
    assert.equal(
      assessEligibility(job("Build React products.", { location }), profile)
        .remoteEligibility,
      "possible",
    );
  assert.equal(
    assessEligibility(
      job("Build React products.", { location: "Worldwide except Malaysia" }),
      profile,
    ).remoteEligibility,
    "unknown",
  );
  assert.equal(
    assessEligibility(
      job("Build React products.", {
        location: "United States",
        locationScope: "listed",
      }),
      profile,
    ).remoteEligibility,
    "unknown",
  );
});
test("visa negation, conflicting boilerplate, and independently obtainable visas stay distinct", () => {
  assert.equal(
    assessEligibility(job("We cannot sponsor visas."), profile).eligibility,
    "review",
  );
  assert.equal(
    assessEligibility(
      job(
        "Candidates must be authorized to work in the US without current or future employer sponsorship.",
      ),
      profile,
    ).eligibility,
    "incompatible",
  );
  assert.notEqual(
    assessEligibility(job("We can sponsor visas."), profile).eligibility,
    "incompatible",
  );
  assert.equal(
    assessEligibility(
      job("We cannot sponsor visas. We offer visa sponsorship."),
      profile,
    ).eligibility,
    "review",
  );
  assert.equal(
    assessEligibility(
      job(
        "You must have work authorization in the US. You may independently obtain work authorization. We cannot sponsor visas.",
      ),
      profile,
    ).eligibility,
    "review",
  );
  assert.equal(
    assessEligibility(
      job("We cannot sponsor visas.", { location: "Malaysia" }),
      profile,
    ).eligibility,
    "review",
  );
  const unknown = structuredClone(profile);
  unknown.preferences.existingWorkAuthorizationsOutsideMalaysia = null;
  assert.equal(
    assessEligibility(job("We cannot sponsor visas."), unknown).eligibility,
    "review",
  );
});
test("time-zone notes do not match outcome, overlap of responsibilities or marketing text", () => {
  assert.ok(
    !assessEligibility(
      job("We improve outcomes. Significant overlap in skills."),
      profile,
    ).eligibilityEvidence?.some((e) => e.rule === "working_hours"),
  );
  assert.ok(
    assessEligibility(
      job("Four hours of overlap with UTC-5 are required."),
      profile,
    ).eligibilityEvidence?.some((e) => e.rule === "working_hours"),
  );
});
test("role fit outranks incidental AI keywords and uses professional versus project evidence", () => {
  const description =
    "Build interfaces using React, TypeScript, Swift and AppKit for coding agents and developer tools. Lead architecture and product delivery.";
  const direct = assessJob(job(description), profile),
    sales = assessJob(
      job(description, { title: "Account Executive, AI Native" }),
      profile,
    );
  assert.equal(direct.category, "strong");
  assert.equal(sales.category, "other");
  assert.ok(direct.score > sales.score + 50);
  assert.equal(
    direct.matchedEvidence?.find((e) => e.technology === "Swift")?.basis,
    "project",
  );
  assert.equal(
    direct.matchedEvidence?.find((e) => e.technology === "TypeScript")?.basis,
    "professional",
  );
  assert.ok(
    !assessJob(
      job("You will go to customer sites to discuss coding standards."),
      profile,
    ).matchedEvidence?.some((e) => e.technology === "Go"),
  );
  assert.equal(
    direct.score,
    direct.matchBreakdown?.reduce((n, e) => n + e.points, 0),
  );
});
test("specialist depth, level, AI tenure and excerpts do not become strong matches by stacking keywords", () => {
  const body =
    "Must have 9+ years of ML model training experience. PhD required. React TypeScript Python Docker coding agents developer tools.";
  for (const title of [
    "Research Scientist, AI",
    "Principal Frontend Engineer",
    "Junior Frontend Engineer",
    "Senior Full Stack Developer - Sitecore",
  ])
    assert.notEqual(
      assessJob(job(body, { title }), profile).category,
      "strong",
    );
  const ai = assessJob(job(body), profile);
  assert.ok(ai.gaps.some((g) => g.includes("professional AI/ML")));
  assert.ok(ai.gaps.some((g) => g.includes(`about ${profile.basics.professionalExperienceYearsApproximate} years`)));
  assert.notEqual(
    assessJob(
      job("TypeScript React desktop coding agents ".repeat(15), {
        descriptionQuality: "excerpt",
      }),
      profile,
    ).category,
    "strong",
  );
  assert.equal(
    assessJob(
      job(
        "Build product interfaces with React and TypeScript. No PhD required. Publications are a nice-to-have.",
      ),
      profile,
    ).category,
    "strong",
  );
});

const evaluation = JSON.parse(
  readFileSync(
    new URL("./fixtures/listing-evaluation.json", import.meta.url),
    "utf8",
  ),
);
for (const fixture of evaluation.fixtures)
  test(`collected listing: ${fixture.job.company} / ${fixture.job.title}`, () => {
    const result = assessJob(fixture.job, profile),
      expected = fixture.expected;
    assert.ok(
      result.score >= expected.min && result.score <= expected.max,
      `${result.score}: ${expected.rationale}`,
    );
    if (expected.eligibility === "not-incompatible")
      assert.notEqual(result.eligibility, "incompatible", expected.rationale);
    else
      assert.equal(
        result.eligibility,
        expected.eligibility,
        expected.rationale,
      );
  });

test("company tenure and sponsorship-not-needed statements are not applicant requirements", () => {
  const result = assessJob(
    job(
      "Our company has over 25 years of experience. Build React and TypeScript product interfaces. No visa sponsorship is needed for our worldwide contractor roles.",
      { location: "Worldwide" },
    ),
    profile,
  );
  assert.equal(result.category, "strong");
  assert.notEqual(result.eligibility, "incompatible");
  assert.ok(!result.gaps.some((g) => g.includes("25+ years")));
});

test("preferred citizenship and uncertain visa support do not become hard exclusions", () => {
  for (const description of [
    "US citizenship is preferred but not required.",
    "We cannot guarantee visa sponsorship.",
    "We cannot sponsor visas for every candidate.",
  ])
    assert.notEqual(
      assessEligibility(job(description), profile).eligibility,
      "incompatible",
      description,
    );
  assert.equal(
    assessEligibility(
      job(
        "You must be authorized to work in the US without requiring visa sponsorship.",
      ),
      profile,
    ).eligibility,
    "incompatible",
  );
});
