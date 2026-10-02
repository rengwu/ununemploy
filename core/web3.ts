import type { IncomingJob } from "./types.ts";
import { htmlText, sourceDate } from "./source-text.ts";
import {
  FetchError,
  RequestLimitError,
  readUrl,
  type FetchContext,
} from "./http.ts";
import { web3Token } from "./web3-auth.ts";

const text = (value: unknown) =>
  typeof value === "string" ? htmlText(value) : "";
export function normalizeWeb3(data: unknown): IncomingJob[] {
  if (!Array.isArray(data))
    throw new Error("Unexpected Web3.career response: missing jobs array.");
  const rows =
    data.find(Array.isArray) ||
    (data.every((v) => v && typeof v === "object" && !Array.isArray(v))
      ? data
      : null);
  if (!rows)
    throw new Error("Unexpected Web3.career response: missing jobs array.");
  return rows.flatMap((j): IncomingJob[] => {
    if (!j || typeof j !== "object") return [];
    // Their API requires the unmodified apply_url for all user-facing links.
    const url = j.apply_url;
    if (typeof url !== "string") return [];
    try {
      const parsed = new URL(url);
      if (
        !["https:", "http:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      )
        return [];
    } catch {
      return [];
    }
    const title = text(j.title);
    if (!title) return [];
    const description = text(j.description);
    const location = text(j.location);
    return [
      {
        sourceItemId: j.id == null ? url : String(j.id),
        title,
        company: text(j.company) || "Not listed",
        location,
        arrangement:
          j.remote === true || /\bremote\b/i.test(location)
            ? "Remote"
            : "Unspecified",
        employmentType: "Unspecified",
        salary: text(j.salary),
        url,
        description,
        descriptionQuality: description ? "full" : "unknown",
        publishedAt: sourceDate(j.postedAt || j.date_epoch || j.date),
        kind: description ? "opening" : "lead",
      },
    ];
  });
}

export async function collectWeb3(
  ctx: FetchContext,
  emit: (job: IncomingJob) => void,
) {
  const token = web3Token();
  if (!token) throw new Error("Add a Web3.career API token in Settings.");
  const url = new URL("https://web3.career/api/v1");
  url.search = new URLSearchParams({
    token,
    limit: "100",
    show_description: "true",
  }).toString();
  let jobs: IncomingJob[];
  try {
    // Query-string credentials must not enter the HTTP cache, errors, or scan history.
    jobs = normalizeWeb3(
      JSON.parse(await readUrl(url.href, ctx, { sensitive: true })),
    );
  } catch (error) {
    if (error instanceof RequestLimitError) throw error;
    if (error instanceof FetchError && error.status)
      throw new FetchError(
        [401, 403].includes(error.status)
          ? "Web3.career rejected the API token. Update it in Settings."
          : `Web3.career returned HTTP ${error.status}.`,
        error.retryAfterMs,
        error.status,
      );
    throw new Error(
      "Could not read the Web3.career API response. Check the token and connection.",
    );
  }
  for (const job of jobs) emit(job);
}
