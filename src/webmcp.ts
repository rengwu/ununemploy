import { z } from "zod";
import { api, jsonBody } from "./api.ts";
import type { JobPage } from "../core/api-types.ts";
import type { Job, CvVersion, CoverLetterVersion } from "../core/types.ts";
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Promise<unknown>;
};
type Registry = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function registerJobTools(refresh: () => Promise<void>) {
  const context = (document as Document & { modelContext?: Registry })
    .modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const list = z
    .object({
      query: z.string().max(300).default(""),
      minScore: z.number().min(0).max(100).default(0),
      limit: z.number().int().min(1).max(100).default(25),
    })
    .strict();
  const save = z.object({ jobIds: z.array(z.uuid()).min(1).max(10) }).strict();
  const cv = z.object({ jobId: z.uuid().optional() }).strict();
  const tools: Tool[] = [
    {
      name: "list_jobs",
      title: "List jobs",
      description:
        "Search collected jobs and return their match scores and source URLs.",
      inputSchema: z.toJSONSchema(list),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input) => {
        const q = list.parse(input);
        const params = new URLSearchParams({
          query: q.query,
          minScore: String(q.minScore),
          pageSize: String(q.limit),
          eligibility: "all",
          availability: "all",
          duplicates: "all",
        });
        return (await api<JobPage>(`/jobs?${params}`)).items;
      },
    },
    {
      name: "save_jobs",
      title: "Save jobs",
      description:
        "Save selected jobs and queue private tailored cover-letter drafts. Never submits applications or contacts anyone.",
      inputSchema: z.toJSONSchema(save),
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input) => {
        const { jobIds } = save.parse(input);
        const result = [];
        for (const id of jobIds) {
          const job = await api<Job>(`/jobs/${id}`, {
            method: "PATCH",
            body: jsonBody({ status: "saved" }),
          });
          result.push({
            id: job.id,
            status: job.status,
            coverLetterState: job.coverLetterState,
          });
        }
        await refresh();
        return result;
      },
    },
    {
      name: "get_cover_letter",
      title: "Get cover letter",
      description:
        "Read the latest private cover letter and review notes for a saved job. Does not submit or send it.",
      inputSchema: z.toJSONSchema(z.object({ jobId: z.uuid() }).strict()),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input) => {
        const { jobId } = z.object({ jobId: z.uuid() }).strict().parse(input);
        const versions = await api<CoverLetterVersion[]>(
          `/cover-letters?jobId=${jobId}`,
        );
        return versions[0] || null;
      },
    },
    {
      name: "get_cv",
      title: "Get CV",
      description:
        "Read the master CV, or a previously saved resume for a job. New saved jobs generate cover letters instead.",
      inputSchema: z.toJSONSchema(cv),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input) => {
        const { jobId } = cv.parse(input);
        const versions = await api<CvVersion[]>(
          jobId ? `/cv?jobId=${jobId}` : "/cv",
        );
        const latest = versions[0];
        return latest
          ? {
              id: latest.id,
              version: latest.version,
              document: latest.document,
              reviewNotes: latest.reviewNotes,
            }
          : null;
      },
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch((error) => console.warn("WebMCP registration failed", error));
    } catch (error) {
      console.warn("WebMCP registration failed", error);
    }
  }
  return () => lifecycle.abort();
}
