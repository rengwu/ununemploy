import { z } from "zod";
export const contextSchema = z
  .object({
    page: z
      .enum([
        "jobs",
        "saved",
        "profile",
        "cv",
        "letters",
        "sources",
        "settings",
      ])
      .default("profile"),
    document: z
      .enum(["latex", "html_cv", "cover_letter", "legacy_cv"])
      .optional(),
    jobId: z.string().max(100).optional(),
    dirty: z.boolean().default(false),
  })
  .strict();
export type AssistantContext = z.infer<typeof contextSchema>;
export type Receipt = {
  kind: "profile" | "latex" | "html_cv" | "cover_letter" | "legacy_cv";
  label: string;
  href: string;
  version: number;
  preview: "compiled" | "rendered" | "failed" | "none";
  warning?: string;
};
export const stepSchema = z
  .object({
    reply: z.string().max(16000),
    done: z.boolean(),
    calls: z
      .array(
        z
          .object({
            name: z.enum([
              "search_jobs",
              "read_job",
              "read_profile",
              "read_document",
              "read_reference",
              "edit_profile",
              "edit_latex",
              "edit_document",
              "preview_latex",
            ]),
            argumentsJson: z.string().max(260000),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export type AssistantStep = z.infer<typeof stepSchema>;
