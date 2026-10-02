import type { Job } from "./types.ts";
// Apply grouping after search and eligibility filters, so a filtered-out primary cannot hide a matching copy.
export function visibleListings(jobs: Job[], showDuplicates: boolean): Job[] {
  if (showDuplicates) return jobs;
  const present = new Set(jobs.map((j) => j.id));
  const emitted = new Set<string>();
  return jobs.filter((job) => {
    const group = job.duplicateOf || job.id;
    if (job.duplicateOf && present.has(job.duplicateOf)) return false;
    if (emitted.has(group)) return false;
    emitted.add(group);
    return true;
  });
}
