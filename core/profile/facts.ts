import type { Profile } from "../types.ts";

export function emptyProfile(): Profile {
  return {
    schemaVersion: 1,
    revision: 1,
    basics: {
      name: "",
      headline: "",
      location: "",
      summary: "",
      email: null,
      phone: null,
      website: "",
      github: "",
      linkedin: "",
      citizenship: "",
      sources: [],
    },
    experience: [],
    projects: [],
    education: [],
    awards: [],
    sources: [],
    openItems: [],
    preferences: {},
    presentation: {},
  };
}
export type ProfileReadiness = {
  ready: boolean;
  missing: { field: string; label: string; question: string }[];
};
const meaningful = (value: unknown): boolean =>
  typeof value === "string" &&
  !!value.trim() &&
  !/^(unknown|unspecified|not provided|n\/?a|none|tbd)$/i.test(value.trim());
export function profileReadiness(p: Profile): ProfileReadiness {
  const roles = p.preferences.roleFamilies ?? p.preferences.targetRoles;
  const arrangements = p.preferences.workArrangements;
  const requirements = [
    {
      field: "basics.name",
      label: "Name",
      question: "What name would you like to use?",
      complete: meaningful(p.basics.name),
    },
    {
      field: "basics.location",
      label: "Current location",
      question: "Which city and country are you based in?",
      complete: meaningful(p.basics.location),
    },
    {
      field: "preferences.roleFamilies",
      label: "Target roles",
      question: "What kinds of roles would you like to find?",
      complete: Array.isArray(roles)
        ? roles.some(meaningful)
        : meaningful(roles),
    },
    {
      field: "background",
      label: "Career background",
      question:
        "Tell me about your experience, skills, education or a project. If you are starting your career, tell me what you have been learning.",
      complete:
        (meaningful(p.basics.summary) &&
          p.basics.summary.trim().length >= 30) ||
        p.experience.some(
          (e) =>
            meaningful(e.employer) && e.bullets.some((b) => meaningful(b.text)),
        ) ||
        p.projects.some((e) => meaningful(e.name) && meaningful(e.summary)) ||
        p.education.some(
          (e) => meaningful(e.qualification) && meaningful(e.institution),
        ),
    },
    {
      field: "preferences.workArrangements",
      label: "Work preferences",
      question:
        "Are you looking for remote, hybrid, onsite work, or any arrangement?",
      complete: Array.isArray(arrangements)
        ? arrangements.some(meaningful)
        : meaningful(arrangements),
    },
  ];
  const missing = requirements
    .filter((r) => !r.complete)
    .map(({ complete, ...r }) => r);
  return { ready: missing.length === 0, missing };
}
export function profileWelcome(p: Profile): string {
  const readiness = profileReadiness(p);
  if (readiness.ready)
    return "Your current profile is shown on the right. Tell me what you would like to add, correct, or remove. I’ll keep confirmed facts separate from preferences and unanswered questions.";
  return `Let’s build your profile. I’ll save the details you share so you can review them alongside our conversation. Job scanning will begin once we have enough information to match roles.\n\n${readiness.missing
    .slice(0, 3)
    .map((r) => `- ${r.question}`)
    .join("\n")}`;
}
const labels: Record<string, string> = {
  basics: "Personal details",
  experience: "Professional experience",
  projects: "Projects",
  education: "Education",
  awards: "Awards",
  facts: "Additional facts",
  preferences: "Job preferences",
  openItems: "Missing information",
  presentation: "CV presentation preferences",
  sources: "Evidence sources",
  professionalExperienceYearsApproximate:
    "Approximate total professional experience (years)",
  existingWorkAuthorizationsOutsideMalaysia:
    "Existing work authorizations outside Malaysia",
  workAuthorizationCountries: "Work authorization countries",
};
const label = (key: string) =>
  labels[key] ||
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^./, (s) => s.toUpperCase());
const escape = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/([`*_{}\[\]<>#+.!|~])/g, "\\$1");
function renderValue(value: unknown, depth = 0): string[] {
  if (value === null || value === undefined || value === "")
    return ["Not provided"];
  if (typeof value === "boolean") return [value ? "Yes" : "No"];
  if (typeof value !== "object") return escape(String(value)).split("\n");
  if (Array.isArray(value)) {
    if (!value.length) return ["None recorded"];
    return value.flatMap((v, i) => {
      const lines = renderValue(v, depth + 1);
      return [
        `${i + 1}. ${lines[0]}`,
        ...lines.slice(1).map((s) => `   ${s}`),
        "",
      ];
    });
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return ["None recorded"];
  return entries.flatMap(([k, v]) => {
    const lines = renderValue(v, depth + 1);
    if (v && typeof v === "object" && Object.keys(v).length)
      return [`- **${escape(label(k))}:**`, ...lines.map((s) => `  ${s}`)];
    return [
      `- **${escape(label(k))}:** ${lines[0]}`,
      ...lines.slice(1).map((s) => `  ${s}`),
    ];
  });
}
/** Generated exclusively from the canonical document; every extension field is retained. */
export function profileMarkdown(p: Profile): string {
  const lines = ["# User profile", "", `Revision ${p.revision}`, ""];
  for (const [key, value] of Object.entries(p)) {
    if (["schemaVersion", "revision"].includes(key)) continue;
    lines.push(`## ${label(key)}`, "");
    if (key === "sources")
      lines.push(
        "These records show where information came from. Historical source descriptions do not override current facts above.",
        "",
      );
    if (key === "facts")
      lines.push(
        "Status distinguishes confirmed facts, preferences and unconfirmed inferences.",
        "",
      );
    lines.push(...renderValue(value), "");
  }
  return lines.join("\n");
}
