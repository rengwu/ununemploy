import type { IncomingJob, Job, Profile } from "./types.ts";
import { assessEligibility, requirementClauses } from "./eligibility.ts";
export const MATCH_VERSION = 4;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const aliases: Record<string, string> = {
  React: "react(?:\\.js|js)?",
  "Next.js": "next(?:\\.js|js)",
  JavaScript: "javascript|ecmascript",
  TypeScript: "typescript",
  Go: "golang|go(?= (?:language|programming|developer|engineer))",
  Kubernetes: "kubernetes|k8s",
  Vue: "vue(?:\\.js|js)?",
  "scikit-learn": "scikit[- ]learn",
  "C++": "c\\+\\+",
  "C#": "c#",
  ".NET": "\\.net|dotnet",
};
const technologyPattern = (s: string) =>
  new RegExp(`(?<![\\w])(?:${aliases[s] || escape(s)})(?![\\w])`, "i");
export function assessJob(
  job: IncomingJob,
  profile: Profile,
): Pick<
  Job,
  | "category"
  | "score"
  | "reasons"
  | "gaps"
  | "eligibility"
  | "eligibilityNotes"
  | "eligibilityEvidence"
  | "remoteEligibility"
  | "matchVersion"
  | "matchScoreCap"
  | "matchProfileRevision"
  | "matchBreakdown"
  | "matchedEvidence"
> {
  const title = job.title.replace(/[–—]/g, "-").trim();
  // Company descriptions and EEO statements cannot turn sales jobs into engineering matches.
  const clauses = requirementClauses(job.description).filter(
    (s) =>
      !/equal opportunity|do not discriminate|without regard|regardless of/i.test(
        s,
      ),
  );
  const content = `${title}\n${clauses.join("\n")}`;
  const reasons: string[] = [],
    gaps: string[] = [];
  const breakdown: NonNullable<Job["matchBreakdown"]> = [];
  const points = (label: string, value: number) =>
    breakdown.push({ label, points: value });
  const engineering = /engineer|developer|architect|\bdevrel\b|\bswe\b/i.test(
    title,
  );
  const direct =
    engineering &&
    /front[ -]?end|full[ -]?stack|product|design engineer|web|desktop|native|mobile|\bui\b|developer (?:tools|experience)|dev.?ex|coding agent|harness|\bIDE\b/i.test(
      title,
    );
  const applied =
    engineering &&
    /\bAI\b|\bLLM\b|agent|applied|forward[ -]deployed|evaluation/i.test(title);
  const research =
    /research scientist|machine learning|\bML\b|model training|training infrastructure/i.test(
      title,
    );
  const adjacent =
    engineering &&
    /back[ -]?end|platform|infrastructure|devops|SRE|solutions|support|devrel/i.test(
      title,
    );
  const nonEngineering =
    !engineering ||
    /mechanical|civil engineer|electrical engineer|structural|chemical engineer|industrial engineer/i.test(
      title,
    ) ||
    /account executive|sales (?:manager|director)|growth sales|recruiter|marketing manager/i.test(
      title,
    );
  let rolePoints = nonEngineering
    ? /product designer|ux designer/i.test(title)
      ? 20
      : 0
    : research
      ? 22
      : direct
        ? 54
        : applied
          ? 42
          : adjacent
            ? 28
            : 34;
  points("Role", rolePoints);
  if (rolePoints >= 40)
    reasons.push(
      direct
        ? "The role focuses on product, interface, or developer-tool engineering."
        : "The role aligns with applied AI and agent engineering.",
    );
  else if (rolePoints > 0)
    reasons.push(
      "The role is adjacent to your product and frontend background.",
    );
  else
    gaps.push("The listed role is outside your target engineering families.");
  const evidence: NonNullable<Job["matchedEvidence"]> = [];
  const skills = new Set([
    ...profile.experience.flatMap((e) => e.technologies),
    ...profile.projects.flatMap((p) => p.technologies),
  ]);
  for (const technology of skills) {
    if (!technologyPattern(technology).test(content)) continue;
    const professional = profile.experience.filter((e) =>
      e.technologies.includes(technology),
    );
    const projects = profile.projects.filter((p) =>
      p.technologies.includes(technology),
    );
    evidence.push({
      technology,
      basis: professional.length ? "professional" : "project",
      ids: (professional.length ? professional : projects).map((e) => e.id),
    });
  }
  points(
    "Technologies",
    Math.min(
      18,
      evidence.reduce((n, e) => n + (e.basis === "professional" ? 4 : 2), 0),
    ),
  );
  const professionalSkills = evidence
    .filter((e) => e.basis === "professional")
    .map((e) => e.technology);
  const projectSkills = evidence
    .filter((e) => e.basis === "project")
    .map((e) => e.technology);
  if (professionalSkills.length)
    reasons.push(
      `Professional experience: ${professionalSkills.slice(0, 7).join(", ")}.`,
    );
  if (projectSkills.length)
    reasons.push(`Project evidence: ${projectSkills.slice(0, 7).join(", ")}.`);
  const domain =
    /coding[ -]agents?|agent(?:ic)? (?:orchestration|harness|workflow)|developer (?:tools|experience)|code editor|\bIDE\b|eval(?:uation)?s? (?:platform|framework)|(?:LLM|agent) eval/i.test(
      content,
    );
  points("Domain", engineering && domain ? 14 : 0);
  if (engineering && domain)
    reasons.push(
      "The posting mentions coding agents, developer tools, or evaluation workflows covered by your projects.",
    );
  const senior = /\bsenior\b|\bsr\.?\b/i.test(title),
    staff = /staff|principal|distinguished/i.test(title);
  points(
    "Level",
    /junior|internship|\bintern\b|graduate|entry[ -]level/i.test(title)
      ? -18
      : staff
        ? -8
        : senior
          ? 8
          : /lead|founding/i.test(title)
            ? 5
            : 4,
  );
  if (/support engineer|sales engineer|devrel/i.test(title))
    gaps.push(
      "Review the support, sales, or developer-relations responsibilities against your preference for building products.",
    );
  if (staff)
    gaps.push(
      "Staff or principal scope requires review beyond the documented senior and team-lead experience.",
    );
  if (/junior|internship|\bintern\b|graduate|entry[ -]level/i.test(title))
    gaps.push("The listed level is below your usual scope.");
  if (/director|head of|vp |vice president|engineering manager/i.test(title))
    gaps.push(
      "Review formal management scope; frontend team leadership does not establish department-level management experience.",
    );
  const years = Number(
    profile.basics.professionalExperienceYearsApproximate ?? NaN,
  );
  const requirements = clauses.filter(
    (s) =>
      /require|must|minimum|at least|you (?:have|bring)|experience (?:with|in)|\d\+? years|proficien|expertise/i.test(
        s,
      ) &&
      !/preferred|nice.to.have|bonus|not required|no (?:Ph\.?D|doctorate) required/i.test(
        s,
      ),
  );
  for (const clause of requirements) {
    if (
      /\b(?:we|our company|our team)\b.{0,30}(?:have|has|bring|brings|over|more than)\b/i.test(
        clause,
      )
    )
      continue;
    const m = clause.match(
      /(?:at least |minimum (?:of )?)?(\d{1,2})(?:\+|\s*[-–]\s*\d{1,2})?\s*(?:years|yrs)/i,
    );
    if (m && Number.isFinite(years) && Number(m[1]) > years)
      gaps.push(
        `The posting asks for ${m[1]}+ years in a requirement; your confirmed total is about ${years} years.`,
      );
    if (
      m &&
      /(?:AI|ML|machine learning|LLM|deep learning|model training)/.test(clause)
    )
      gaps.push(
        "Years of professional AI/ML experience are not established by your total engineering tenure or project work.",
      );
  }
  const deepResearch = requirements.some((s) =>
    /Ph\.?D|doctorate|publications|distributed training|CUDA|pre[ -]?training/i.test(
      s,
    ),
  );
  if (deepResearch || research)
    gaps.push(
      "Research credentials and large-scale model-training experience need checking against your evidence.",
    );
  const specialist = [
    "React Native",
    "Java",
    "C#",
    "C++",
    ".NET",
    "Ruby",
    "Elixir",
    "Scala",
    "CUDA",
    "Salesforce",
    "Sitecore",
    "SAP",
  ].filter((s) => !skills.has(s) && technologyPattern(s).test(title));
  if (specialist.length)
    gaps.push(
      `Primary specialization without recorded evidence: ${specialist.join(", ")}.`,
    );
  let score = breakdown.reduce((n, b) => n + b.points, 0);
  let cap = nonEngineering ? (rolePoints ? 44 : 14) : 100;
  if (
    research ||
    deepResearch ||
    specialist.length ||
    staff ||
    /director|head of|vice president|engineering manager|support engineer|sales engineer|devrel/i.test(
      title,
    )
  )
    cap = Math.min(cap, 64);
  if (/junior|internship|\bintern\b|graduate|entry[ -]level/i.test(title))
    cap = Math.min(cap, 34);
  if (gaps.some((g) => g.startsWith("The posting asks")))
    cap = Math.min(cap, 64);
  if (
    job.descriptionQuality === "excerpt" ||
    job.description.trim().length < 80
  ) {
    gaps.push("The description is incomplete; this match is provisional.");
    cap = Math.min(cap, 64);
  }
  if (cap < score) points("Evidence limit", cap - score);
  score = Math.max(0, Math.min(cap, score));
  return {
    score,
    category:
      score >= 65
        ? "strong"
        : score >= 40
          ? "adjacent"
          : score >= 20
            ? "stretch"
            : "other",
    reasons,
    gaps: [...new Set(gaps)],
    matchBreakdown: breakdown,
    matchedEvidence: evidence,
    matchVersion: MATCH_VERSION,
    matchScoreCap: cap,
    matchProfileRevision: profile.revision,
    ...assessEligibility(job, profile),
  };
}
