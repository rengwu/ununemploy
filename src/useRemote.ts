import { useCallback, useEffect, useRef, useState } from "react";
import { readJson } from "./api.ts";

// A resource owns its response and ETag. Superseded requests never replace newer data.
export function useRemote<T>(
  url: string | null,
  revision?: string,
  interval = 0,
) {
  const [result, setResult] = useState<{ url: string; data: T } | null>(null);
  const [failure, setFailure] = useState<{
    url: string;
    message: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const previous = useRef<{ url: string; data: T; etag: string | null } | null>(
    null,
  );
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    controller.current?.abort();
    const id = ++sequence.current;
    if (!url) {
      setPending(false);
      return;
    }
    const request = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      request.abort();
    }, 15000);
    controller.current = request;
    const cached = previous.current?.url === url ? previous.current : null;
    setPending(true);
    setFailure(null);
    try {
      const response = await fetch(`/api${url}`, {
        signal: request.signal,
        cache: "no-store",
        headers: {
          ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
          ...(revision ? { "X-Jobs-Revision": revision } : {}),
        },
      });
      let data: T;
      if (response.status === 304 && cached) data = cached.data;
      else {
        data = await readJson(response);
        if (!response.ok)
          throw new Error(
            (data as { error?: string }).error ||
              `Request failed (${response.status}).`,
          );
      }
      if (id !== sequence.current) return;
      previous.current = {
        url,
        data,
        etag: response.headers.get("ETag") || cached?.etag || null,
      };
      setResult((current) =>
        current?.url === url && current.data === data ? current : { url, data },
      );
    } catch (error) {
      if (id === sequence.current && (!request.signal.aborted || timedOut))
        setFailure({
          url,
          message: timedOut
            ? "The request timed out. Retry to load the latest data."
            : error instanceof Error
              ? error.message
              : "Request failed.",
        });
    } finally {
      clearTimeout(timeout);
      if (id === sequence.current) setPending(false);
    }
  }, [url, revision]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      clearTimeout(timer);
      await reload();
      if (active && interval && document.visibilityState !== "hidden")
        timer = setTimeout(poll, interval);
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "hidden") void poll();
    };
    void poll();
    if (interval) document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      controller.current?.abort();
      sequence.current++;
    };
  }, [reload, revision, interval]);
  return {
    data: result?.url === url ? result.data : null,
    error: failure?.url === url ? failure.message : "",
    pending,
    reload,
  };
}
