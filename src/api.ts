import type { CvVersion } from "../core/types.ts";
export type { Bootstrap } from "../core/api-types.ts";
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
  });
  const data = await readJson(response);
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
export const jsonBody = (value: unknown) => JSON.stringify(value);
export const shortDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-MY", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "Unknown";
export const time = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-MY", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "Never";
export type { CvVersion };

export async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new Error(
      "The server returned an incomplete or invalid response. Retry to load the latest data.",
    );
  }
}
