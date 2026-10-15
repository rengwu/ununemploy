import type { AssistantContext } from "./assistant-context.ts";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Input, InputArea } from "@cloudflare/kumo/components/input";
import { Sidebar } from "@cloudflare/kumo/components/sidebar";
import { Select } from "@cloudflare/kumo/components/select";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Table } from "@cloudflare/kumo/components/table";
import { Banner } from "@cloudflare/kumo/components/banner";
import {
  BookmarkSimpleIcon,
  UserCircleIcon,
  BriefcaseIcon,
  FileTextIcon,
  GearSixIcon,
  RssIcon,
  ArrowClockwiseIcon,
  PlusIcon,
  ArrowSquareOutIcon,
  XIcon,
} from "@phosphor-icons/react";
const CvPage = lazy(() =>
  import("./CvPage.tsx").then((m) => ({ default: m.CvPage })),
);
const AssistantPane = lazy(() =>
  import("./AssistantPane.tsx").then((m) => ({ default: m.AssistantPane })),
);
import { AddJobDialog } from "./AddJobDialog.tsx";
import { useRemote } from "./useRemote.ts";
import type { JobPage, JobLocations } from "../core/api-types.ts";
import { LocationFilter } from "./LocationFilter.tsx";
import { parseLocationSelection, locationLabel } from "../core/locations.ts";
import { SourcesPage, SettingsPage } from "./SourcesSettings.tsx";
import { api, jsonBody, shortDate, time, type Bootstrap } from "./api.ts";
import type { Job } from "../core/types.ts";

const ProfilePage = lazy(() =>
  import("./ProfilePage.tsx").then((m) => ({ default: m.ProfilePage })),
);

type Page = "profile" | "jobs" | "saved" | "cv" | "sources" | "settings";
const titles: Record<Page, string> = {
  profile: "User profile",
  jobs: "Jobs",
  saved: "Saved",
  cv: "CV",
  sources: "Sources",
  settings: "Settings",
};
const matchLabels = {
  strong: "Strong",
  adjacent: "Adjacent",
  stretch: "Stretch",
  other: "Other",
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
export function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Record<string, string>;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onValueChange={(v) => v !== null && onChange(String(v))}
      items={options}
    >
      {Object.entries(options).map(([value, text]) => (
        <Select.Option key={value} value={value}>
          {text}
        </Select.Option>
      ))}
    </Select>
  );
}
export function App() {
  const {
    data: boot,
    error: loadError,
    reload: refresh,
  } = useRemote<Bootstrap>("/bootstrap", undefined, 8000);
  const readRoute = () => {
    const [name, query = ""] = location.hash.slice(1).split("?");
    const params = new URLSearchParams(query);
    if (name === "letters") {
      params.set("tab", "cover-letter");
      return { page: "saved" as Page, query: params.toString() };
    }
    return { page: (name in titles ? name : "jobs") as Page, query };
  };
  const [page, setPage] = useState<Page>(() => readRoute().page);
  const [routeQuery, setRouteQuery] = useState(() => readRoute().query);
  useEffect(() => {
    if (location.hash.startsWith("#letters"))
      history.replaceState(null, "", `#saved?${readRoute().query}`);
  }, []);
  const [pendingQuery, setPendingQuery] = useState("");
  const [assistantContext, setAssistantContext] = useState<AssistantContext>({
    page: "jobs",
    dirty: false,
  });
  const [assistantLauncher, setAssistantLauncher] =
    useState<HTMLDivElement | null>(null);
  const routeParams = new URLSearchParams(routeQuery);
  const initialRoute = useRef(!location.hash);
  useEffect(() => {
    if (!boot || !initialRoute.current) return;
    initialRoute.current = false;
    if (!boot.profile.ready) {
      setPage("profile");
      history.replaceState(null, "", "#profile");
    }
  }, [boot]);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [discardRevision, setDiscardRevision] = useState(0);
  const [pendingPage, setPendingPage] = useState<Page | null>(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("jh-theme") || "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = "kumo";
    document.documentElement.dataset.mode = theme;
    localStorage.setItem("jh-theme", theme);
  }, [theme]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const navigate = (target: Page, query = "") => {
    if (target === page && query === routeQuery) {
      history.replaceState(null, "", `#${target}${query ? `?${query}` : ""}`);
      return;
    }
    if (dirty) {
      setPendingQuery(query);
      setPendingPage(target);
      return;
    }
    setPage(target);
    setRouteQuery(query);
    history.replaceState(null, "", `#${target}${query ? `?${query}` : ""}`);
  };
  useEffect(() => {
    const handleHash = () => {
      const { page: target, query } = readRoute();
      if (dirty)
        history.replaceState(
          null,
          "",
          `#${page}${routeQuery ? `?${routeQuery}` : ""}`,
        );
      navigate(target as Page, query);
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [dirty, page, routeQuery]);
  const action = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };
  return (
    <>
      <Sidebar.Provider
        className="app-frame"
        defaultOpen
        collapsible="icon"
        animationDuration={0}
      >
        <Sidebar className="app-sidebar">
          <Sidebar.Header className="app-sidebar-header">
            <span className="app-name" title="ununemploy">
              ununemploy
            </span>
            <Sidebar.Trigger aria-label="Toggle navigation" />
          </Sidebar.Header>
          <Sidebar.Content>
            <Sidebar.Group>
              <Sidebar.Menu>
                <Sidebar.MenuButton
                  icon={BriefcaseIcon}
                  tooltip="Jobs"
                  active={page === "jobs"}
                  onClick={() => navigate("jobs")}
                >
                  Jobs
                </Sidebar.MenuButton>
                <Sidebar.MenuButton
                  icon={BookmarkSimpleIcon}
                  tooltip="Saved"
                  active={page === "saved"}
                  onClick={() => navigate("saved")}
                >
                  Saved
                </Sidebar.MenuButton>
                <Sidebar.MenuButton
                  icon={UserCircleIcon}
                  tooltip="User profile"
                  active={page === "profile"}
                  onClick={() => navigate("profile")}
                >
                  User profile
                </Sidebar.MenuButton>
                <Sidebar.MenuButton
                  icon={FileTextIcon}
                  tooltip="CV"
                  active={page === "cv"}
                  onClick={() => navigate("cv")}
                >
                  CV
                </Sidebar.MenuButton>
                <Sidebar.MenuButton
                  icon={RssIcon}
                  tooltip="Sources"
                  active={page === "sources"}
                  onClick={() => navigate("sources")}
                >
                  Sources
                </Sidebar.MenuButton>
              </Sidebar.Menu>
            </Sidebar.Group>
          </Sidebar.Content>
          <Sidebar.Footer className="app-sidebar-footer">
            <Sidebar.Menu>
              <Sidebar.MenuButton
                icon={GearSixIcon}
                tooltip="Settings"
                active={page === "settings"}
                onClick={() => navigate("settings")}
              >
                Settings
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Footer>
        </Sidebar>
        <main className="app-main">
          <header className="page-header">
            <div className="page-heading">
              <Sidebar.Trigger
                className="mobile-nav"
                aria-label="Open navigation"
              />
              <h1>{titles[page]}</h1>
            </div>
            {boot && (page === "jobs" || page === "saved") && (
              <span className="muted">
                {page === "saved" ? boot.counts.saved : boot.counts.jobs} jobs
              </span>
            )}
            <div className="page-header-actions" ref={setAssistantLauncher} />
          </header>
          {(error || loadError) && (
            <div className="page-error">
              <Banner
                variant="error"
                title={error || loadError}
                action={
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setError("");
                      void refresh();
                    }}
                  >
                    Retry
                  </Button>
                }
              />
            </div>
          )}
          {!boot ? (
            <div className="empty" role="status">
              Loading…
            </div>
          ) : (
            <>
              {!boot.profile.ready &&
                (page === "jobs" || page === "sources") && (
                  <div className="page-error">
                    <Banner
                      title="Complete your profile before scanning for jobs."
                      action={
                        <Button
                          variant="ghost"
                          onClick={() => navigate("profile")}
                        >
                          Open User profile
                        </Button>
                      }
                    />
                  </div>
                )}
              {page === "profile" && (
                <Suspense
                  fallback={<div className="empty">Loading profile…</div>}
                >
                  <ProfilePage boot={boot} refresh={refresh} />
                </Suspense>
              )}
              {(page === "jobs" || page === "saved") && (
                <JobsPage
                  key={`${page}:${discardRevision}`}
                  boot={boot}
                  saved={page === "saved"}
                  initialJobId={routeParams.get("job")}
                  onAssistantContext={setAssistantContext}
                  action={action}
                  initialTab={routeParams.get("tab")}
                  onLocation={(id, tab) => {
                    const query = id
                      ? new URLSearchParams({
                          job: id,
                          ...(tab ? { tab } : {}),
                        }).toString()
                      : "";
                    setRouteQuery(query);
                    history.replaceState(
                      null,
                      "",
                      `#${page}${query ? `?${query}` : ""}`,
                    );
                  }}
                  theme={theme}
                  refresh={refresh}
                  onDirty={setDirty}
                />
              )}
              {page === "cv" && (
                <Suspense
                  fallback={<div className="empty">Loading editor…</div>}
                >
                  <CvPage
                    key={`${page}:${routeQuery}`}
                    boot={boot}
                    refresh={refresh}
                    onDirty={setDirty}
                    theme={theme}
                    initialJobId={routeParams.get("job")}
                    initialView={routeParams.get("view")}
                    onAssistantContext={setAssistantContext}
                  />
                </Suspense>
              )}
              {page === "sources" && (
                <SourcesPage boot={boot} action={action} />
              )}
              {page === "settings" && (
                <SettingsPage
                  boot={boot}
                  action={action}
                  theme={theme}
                  onThemeChange={setTheme}
                />
              )}
            </>
          )}
        </main>
        <Dialog.Root
          open={pendingPage !== null}
          onOpenChange={(open) => !open && setPendingPage(null)}
        >
          <Dialog className="app-dialog">
            <Dialog.Title>Discard unsaved changes?</Dialog.Title>
            <div className="dialog-actions">
              <Button variant="secondary" onClick={() => setPendingPage(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setDirty(false);
                  setDiscardRevision((value) => value + 1);
                  setPage(pendingPage!);
                  setRouteQuery(pendingQuery);
                  history.replaceState(
                    null,
                    "",
                    `#${pendingPage}${pendingQuery ? `?${pendingQuery}` : ""}`,
                  );
                  setPendingPage(null);
                }}
              >
                Discard changes
              </Button>
            </div>
          </Dialog>
        </Dialog.Root>
      </Sidebar.Provider>
      {boot && (
        <Suspense fallback={null}>
          <AssistantPane
            boot={boot}
            launcherContainer={assistantLauncher}
            refresh={refresh}
            context={
              assistantContext.page === page
                ? { ...assistantContext, dirty }
                : { page, dirty }
            }
          />
        </Suspense>
      )}
    </>
  );
}
type Action = (fn: () => Promise<unknown>) => Promise<boolean>;
function JobsPage({
  boot,
  saved,
  action,
  initialTab,
  onLocation,
  theme,
  refresh,
  onDirty,
  initialJobId,
  onAssistantContext,
}: {
  boot: Bootstrap;
  saved: boolean;
  action: Action;
  initialTab: string | null;
  onLocation: (id: string | null, tab?: string) => void;
  theme: string;
  refresh: () => Promise<void>;
  onDirty: (value: boolean) => void;
  initialJobId: string | null;
  onAssistantContext: (context: AssistantContext) => void;
}) {
  const [query, setQuery] = useState(
    () => sessionStorage.getItem("jh-query") || "",
  );
  const [category, setCategory] = useState(
    () => sessionStorage.getItem("jh-category") || "all",
  );
  const [arrangement, setArrangement] = useState(
    () => sessionStorage.getItem("jh-arrangement") || "all",
  );
  const [locations, setLocations] = useState(() =>
    parseLocationSelection(sessionStorage.getItem("jh-locations")),
  );
  const locationIndex = useRemote<JobLocations>(
    "/job-locations",
    boot.jobsRevision,
  );
  const [review, setReview] = useState("all");
  const [seen, setSeen] = useState(() => {
    const stored = sessionStorage.getItem("jh-seen");
    return stored === "seen" || stored === "unseen" ? stored : "all";
  });
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  const [availability, setAvailability] = useState("current");
  const [eligibility, setEligibility] = useState(
    () => sessionStorage.getItem("jh-eligibility") || "possible",
  );
  const [duplicates, setDuplicates] = useState("grouped");
  const [sort, setSort] = useState(
    () => sessionStorage.getItem("jh-sort") || "match",
  );
  const [pageSelection, setPageSelection] = useState({ filters: "", page: 0 });
  const [search, setSearch] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    sessionStorage.setItem("jh-query", query);
    sessionStorage.setItem("jh-category", category);
    sessionStorage.setItem("jh-arrangement", arrangement);
    sessionStorage.setItem("jh-locations", JSON.stringify(locations));
    sessionStorage.setItem("jh-sort", sort);
    sessionStorage.setItem("jh-eligibility", eligibility);
    sessionStorage.setItem("jh-seen", seen);
  }, [
    query,
    category,
    arrangement,
    locations,
    sort,
    review,
    saved,
    availability,
    eligibility,
    duplicates,
    seen,
  ]);
  const [selection, setSelection] = useState<{
    id: string;
    scope: string;
  } | null>(null);
  const [showDesktopDetail, setShowDesktopDetail] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setShowDesktopDetail(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const filters = new URLSearchParams({
    query: search,
    view: saved ? "saved" : "jobs",
    category,
    arrangement,
    locations: JSON.stringify(locations),
    review,
    seen,
    availability,
    eligibility,
    duplicates,
    sort,
  }).toString();
  const resultPage = pageSelection.filters === filters ? pageSelection.page : 0;
  const selectionScope = `${filters}&page=${resultPage}`;
  const selected = selection?.scope === selectionScope ? selection.id : null;
  const [dirtyJobId, setDirtyJobId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{
    id: string | null;
  } | null>(null);
  const setSelected = (id: string | null) => {
    if (dirtyJobId && id !== dirtyJobId) setPendingSelection({ id });
    else {
      setSelection(id ? { id, scope: selectionScope } : null);
      onLocation(id);
    }
  };
  const setResultPage = (page: number) => setPageSelection({ filters, page });
  const results = useRemote<JobPage>(
    `/jobs?${filters}&page=${resultPage}`,
    boot.jobsRevision,
  );
  const filtered = results.data?.items || [];
  const selectedId =
    dirtyJobId || selected || initialJobId || filtered[0]?.id || null;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const handleDirty = useCallback(
    (value: boolean) => {
      setDirtyJobId(value ? selectedIdRef.current : null);
      onDirty(value);
    },
    [onDirty],
  );
  useEffect(() => {
    if (initialJobId) setSelection({ id: initialJobId, scope: selectionScope });
  }, [initialJobId]);
  const markSeen = (id: string) => {
    if (seenIds.has(id) || filtered.find((j) => j.id === id)?.seenAt) return;
    void action(async () => {
      await api(`/jobs/${id}/seen`, { method: "POST", body: "{}" });
      setSeenIds((previous) => new Set(previous).add(id));
    });
  };
  const detail = useRemote<Job>(
    selectedId && (showDesktopDetail || selected || dirtyJobId)
      ? `/jobs/${selectedId}`
      : null,
    boot.jobsRevision,
  );
  const job = detail.data;
  const listScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listScroll.current?.scrollTo(0, 0);
  }, [filters, resultPage]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    const ok = await action(fn);
    setBusy(false);
    return ok;
  };
  const scanning = boot.sources.some((s) => s.state === "running");
  return (
    <div className="jobs-page">
      <div className="toolbar">
        <Input
          className="job-search"
          placeholder="Search jobs"
          aria-label="Search jobs"
          maxLength={300}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Filter
          label="Match"
          value={category}
          onChange={setCategory}
          options={{
            all: "All matches",
            strong: "Strong",
            adjacent: "Adjacent",
            stretch: "Stretch",
            other: "Other",
          }}
        />
        {!saved && (
          <Filter
            label="Posting availability"
            value={availability}
            onChange={setAvailability}
            options={{
              current: "Current postings",
              stale: "Stale postings",
              all: "Include stale and closed",
            }}
          />
        )}
        <Filter
          label="Work arrangement"
          value={arrangement}
          onChange={setArrangement}
          options={{
            all: "Any arrangement",
            remote: "Remote",
            hybrid: "Hybrid",
            onsite: "On-site",
          }}
        />
        <LocationFilter
          options={locationIndex.data?.options || []}
          value={locations}
          onChange={setLocations}
        />
        <Filter
          label="Seen status"
          value={seen}
          onChange={setSeen}
          options={{ all: "Seen and unseen", unseen: "Unseen", seen: "Seen" }}
        />
        {!saved && (
          <Filter
            label="Eligibility"
            value={eligibility}
            onChange={setEligibility}
            options={{
              possible: "No known conflict",
              all: "Any eligibility",
              review: "Needs review",
              incompatible: "Incompatible",
            }}
          />
        )}
        <div className="toolbar-spacer" />
        <div className="toolbar-actions">
          <Button
            variant="secondary"
            icon={PlusIcon}
            onClick={() => setAddOpen(true)}
          >
            Add job
          </Button>
          <Button
            variant="secondary"
            icon={ArrowClockwiseIcon}
            loading={scanning}
            disabled={busy}
            onClick={() =>
              void run(() => api("/scan", { method: "POST", body: "{}" }))
            }
          >
            Scan
          </Button>
        </div>
      </div>
      <div
        className={`jobs-split ${selected || dirtyJobId ? "has-selection" : ""}`}
      >
        <section className="job-list" aria-label="Job results">
          <div className="list-controls">
            <Filter
              label="Review status"
              value={review}
              onChange={setReview}
              options={
                saved
                  ? {
                      all: "Saved and applied",
                      saved: "Saved",
                      applied: "Applied",
                    }
                  : {
                      all: "All jobs",
                      new: "New",
                      saved: "Saved",
                      dismissed: "Dismissed",
                    }
              }
            />
            {!saved && (
              <Filter
                label="Duplicate listings"
                value={duplicates}
                onChange={setDuplicates}
                options={{
                  grouped: "Group duplicates",
                  all: "Show duplicates",
                }}
              />
            )}
            <span className="muted" aria-live="polite">
              {results.data ? `${results.data.total} results` : "Loading jobs…"}
            </span>
            <div className="toolbar-spacer" />
            <Filter
              label="Sort jobs"
              value={sort}
              onChange={setSort}
              options={{ match: "Best match", newest: "Newest" }}
            />
          </div>
          <div
            className="list-scroll"
            ref={listScroll}
            aria-busy={results.pending}
          >
            <Table className="jobs-table">
              <Table.Header sticky>
                <Table.Row>
                  <Table.Head>Role</Table.Head>
                  <Table.Head className="match-column">Match</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filtered.map((j) => (
                  <Table.Row
                    key={j.id}
                    className={`job-row${selectedId === j.id ? " selected-row" : ""}`}
                    onClick={() => {
                      setSelected(j.id);
                      markSeen(j.id);
                    }}
                  >
                    <Table.Cell>
                      <button
                        className="job-title"
                        aria-current={selectedId === j.id ? "true" : undefined}
                      >
                        {j.title}
                      </button>
                      <div className="company-line">
                        {j.company}
                        {(j.seenAt || seenIds.has(j.id)) && (
                          <span className="job-seen">Seen</span>
                        )}
                        {j.status === "saved" && (
                          <BookmarkSimpleIcon
                            aria-label="Saved"
                            weight="fill"
                            size={14}
                          />
                        )}
                      </div>
                      <div className="job-location">
                        {j.location || "Location unspecified"}
                      </div>
                    </Table.Cell>
                    <Table.Cell className="match-column">
                      <span className={`match ${j.category}`}>
                        {matchLabels[j.category]}
                      </span>
                      <div className="job-date">
                        {shortDate(j.publishedAt || j.firstSeenAt)}
                      </div>
                      {j.eligibility === "incompatible" && (
                        <div className="muted">Incompatible</div>
                      )}
                      {j.freshness === "stale" && (
                        <div className="muted">Stale</div>
                      )}
                      {j.listingCount > 1 ? (
                        <div className="muted">{j.listingCount} listings</div>
                      ) : null}
                      {j.kind === "lead" && (
                        <span className="muted">Hiring post</span>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
            {(results.error || locationIndex.error) && (
              <div className="page-error" role="alert">
                <Banner
                  variant="error"
                  title={results.error || locationIndex.error}
                  action={
                    <Button
                      variant="ghost"
                      onClick={() => {
                        void results.reload();
                        void locationIndex.reload();
                      }}
                    >
                      Retry
                    </Button>
                  }
                />
              </div>
            )}
            {!results.data && !results.error && (
              <div className="empty" role="status">
                Loading jobs…
              </div>
            )}
            {results.data && !filtered.length && (
              <div className="empty">
                {boot.counts.total
                  ? "No jobs match these filters."
                  : scanning
                    ? "Collecting jobs…"
                    : "No jobs yet. Run a scan or add a job."}
              </div>
            )}
            {results.data && results.data.totalPages > 1 && (
              <div className="list-footer row-actions">
                <Button
                  variant="secondary"
                  disabled={results.pending || results.data.page === 0}
                  onClick={() => setResultPage(results.data!.page - 1)}
                >
                  Previous
                </Button>
                <span>
                  Page {results.data.page + 1} of {results.data.totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={
                    results.pending ||
                    results.data.page + 1 >= results.data.totalPages
                  }
                  onClick={() => setResultPage(results.data!.page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </section>
        <section className="job-detail" aria-label="Job details">
          {detail.error && (
            <div className="page-error" role="alert">
              <Banner
                variant="error"
                title={detail.error}
                action={
                  <Button variant="ghost" onClick={() => void detail.reload()}>
                    Retry
                  </Button>
                }
              />
            </div>
          )}
          {job ? (
            <JobDetail
              key={job.id}
              job={job}
              busy={busy}
              action={run}
              close={() => setSelected(null)}
              boot={boot}
              theme={theme}
              refresh={refresh}
              onDirty={handleDirty}
              onAssistantContext={onAssistantContext}
              page={saved ? "saved" : "jobs"}
              initialTab={initialTab}
              onTabLocation={(tab) => onLocation(job.id, tab)}
              markSeen={() => markSeen(job.id)}
            />
          ) : (
            <div className="empty">
              {selectedId && !detail.error
                ? "Loading job…"
                : "Select a job to view its details."}
            </div>
          )}
        </section>
      </div>
      <Dialog.Root
        open={pendingSelection !== null}
        onOpenChange={(open) => !open && setPendingSelection(null)}
      >
        <Dialog className="app-dialog">
          <Dialog.Title>Discard unsaved changes?</Dialog.Title>
          <div className="dialog-actions">
            <Button
              variant="secondary"
              onClick={() => setPendingSelection(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const id = pendingSelection!.id;
                handleDirty(false);
                setSelection(id ? { id, scope: selectionScope } : null);
                onLocation(id);
                setPendingSelection(null);
              }}
            >
              Discard changes
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>
      <AddJobDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={async (value) => {
          const ok = await run(() =>
            api("/jobs", { method: "POST", body: jsonBody(value) }),
          );
          if (!ok)
            throw new Error("Could not add the job. Check the entered values.");
        }}
      />
    </div>
  );
}
function JobDetail({
  job,
  busy,
  action,
  close,
  boot,
  theme,
  refresh,
  onDirty,
  onAssistantContext,
  page,
  initialTab,
  onTabLocation,
  markSeen,
}: {
  job: Job;
  busy: boolean;
  action: Action;
  close: () => void;
  boot: Bootstrap;
  theme: string;
  refresh: () => Promise<void>;
  onDirty: (value: boolean) => void;
  onAssistantContext: (context: AssistantContext) => void;
  page: "jobs" | "saved";
  initialTab: string | null;
  markSeen: () => void;
  onTabLocation: (tab: string) => void;
}) {
  const [tab, setTab] = useState(
    ["description", "match", "notes", "cover-letter"].includes(initialTab || "")
      ? initialTab!
      : "description",
  );
  const [letterDirty, setLetterDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const handleDirty = useCallback(
    (value: boolean) => {
      setLetterDirty(value);
      onDirty(value);
    },
    [onDirty],
  );
  useEffect(() => {
    setTab(
      ["description", "match", "notes", "cover-letter"].includes(
        initialTab || "",
      )
        ? initialTab!
        : "description",
    );
  }, [initialTab]);
  useEffect(() => {
    onAssistantContext({
      page,
      jobId: job.id,
      dirty: letterDirty,
      ...(tab === "cover-letter" ? { document: "cover_letter" as const } : {}),
    });
  }, [page, job.id, tab, letterDirty, onAssistantContext]);
  const [notes, setNotes] = useState(
    () => localStorage.getItem(`jh-note-${job.id}`) ?? job.notes,
  );
  const [noteDirty, setNoteDirty] = useState(
    () => localStorage.getItem(`jh-note-${job.id}`) !== null,
  );
  const [description, setDescription] = useState(job.description);
  const [editingDescription, setEditingDescription] = useState(false);
  const update = (value: unknown) =>
    action(() =>
      api(`/jobs/${job.id}`, { method: "PATCH", body: jsonBody(value) }),
    );
  return (
    <>
      <header className="detail-header">
        <div className="detail-company">
          <span>{job.company}</span>
          <Button
            className="mobile-detail-close"
            variant="ghost"
            shape="square"
            icon={XIcon}
            aria-label="Back to jobs"
            onClick={close}
          />
        </div>
        <h2>{job.title}</h2>
        <div className="detail-location">
          {locationLabel(job)}
          : {job.location || "Unspecified"}
        </div>
        <div className="job-actions">
          <Button
            variant="primary"
            icon={BookmarkSimpleIcon}
            disabled={busy || job.status === "saved"}
            onClick={() => void update({ status: "saved" })}
          >
            {job.status === "saved" ? "Saved" : "Save"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void update({
                status: job.status === "dismissed" ? "new" : "dismissed",
              })
            }
          >
            {job.status === "dismissed" ? "Restore" : "Dismiss"}
          </Button>
          <a
            className="source-link"
            href={job.url}
            target="_blank"
            rel="follow noreferrer"
            onClick={markSeen}
            onAuxClick={(event) => {
              if (event.button === 1) markSeen();
            }}
          >
            View posting <ArrowSquareOutIcon size={16} />
          </a>
        </div>
      </header>
      <dl className="job-facts">
        <div>
          <dt>Arrangement</dt>
          <dd>{job.arrangement}</dd>
        </div>
        <div>
          <dt>Compensation</dt>
          <dd>{job.salary || "Not listed"}</dd>
        </div>
        <div>
          <dt>Posted</dt>
          <dd>{shortDate(job.publishedAt)}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{job.sourceName}</dd>
        </div>
        <div>
          <dt>Availability</dt>
          <dd>
            {job.availability === "closed"
              ? "Closed or expired"
              : job.freshness === "stale"
                ? "Stale — needs checking"
                : job.availability === "unknown"
                  ? "Unconfirmed"
                  : "Listed at last check"}
          </dd>
        </div>
        <div>
          <dt>Eligibility</dt>
          <dd>
            {job.eligibility === "incompatible"
              ? "Incompatible"
              : job.eligibility === "review"
                ? "Needs review"
                : "Unconfirmed"}
          </dd>
        </div>
      </dl>
      <Tabs
        variant="underline"
        className="pane-tabs detail-tabs"
        listClassName="pane-tab-list"
        value={tab}
        onValueChange={(next) => {
          if (next === tab) return;
          if (letterDirty) setPendingTab(next);
          else {
            setTab(next);
            onTabLocation(next);
          }
        }}
        tabs={[
          { value: "description", label: "Description" },
          { value: "match", label: "Match" },
          { value: "notes", label: "Notes" },
          { value: "cover-letter", label: "Cover letter" },
        ]}
      />
      <div
        className={`detail-body ${tab === "cover-letter" ? "detail-letter" : ""}`}
      >
        {tab === "description" && (
          <>
            {!!job.qualityNotes?.length && (
              <ul className="reason-list">
                {job.qualityNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            )}
            {job.descriptionSource && (
              <p className="muted">
                Description: {job.descriptionSource.name} · checked{" "}
                {shortDate(job.descriptionSource.checkedAt)}
              </p>
            )}
            {!!job.relatedListings?.length && (
              <details className="listing-sources">
                <summary>Other listings ({job.relatedListings.length})</summary>
                <ul>
                  {job.relatedListings.map((listing) => (
                    <li key={listing.id}>
                      <a
                        className="source-link"
                        href={listing.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {listing.name}
                      </a>
                      {["saved", "applied"].includes(listing.status)
                        ? ` · ${listing.status}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {editingDescription ? (
              <div className="form-stack">
                <InputArea
                  aria-label="Job description"
                  disabled={busy}
                  rows={18}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="row-actions">
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      void update({ description }).then((ok) => {
                        if (ok) setEditingDescription(false);
                      })
                    }
                  >
                    Save description
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingDescription(false);
                      setDescription(job.description);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="description">
                  {job.description || "No job description available."}
                </div>
                <div className="row-actions">
                  {job.canLoadDescription && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void action(() =>
                          api(`/jobs/${job.id}/description/fetch`, {
                            method: "POST",
                          }),
                        )
                      }
                    >
                      Load full description
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDescription(job.description);
                      setEditingDescription(true);
                    }}
                  >
                    Edit description
                  </Button>
                </div>
              </>
            )}
          </>
        )}
        {tab === "match" && (
          <>
            <h3>{matchLabels[job.category]} match</h3>
            <ul className="reason-list">
              {job.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            {job.gaps.length > 0 && (
              <>
                <h3>Requirements to check</h3>
                <ul className="reason-list">
                  {job.gaps.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </>
            )}
            {!!job.matchBreakdown?.length && (
              <>
                <h3>Score: {job.score}/100</h3>
                <dl className="match-breakdown">
                  {job.matchBreakdown.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.points}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            <h3>
              Eligibility:{" "}
              {job.eligibility === "incompatible"
                ? "Incompatible"
                : job.eligibility === "review"
                  ? "Needs review"
                  : "Unconfirmed"}
            </h3>
            <ul className="reason-list">
              {job.eligibilityNotes.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </>
        )}
        {tab === "notes" && (
          <div className="notes-editor">
            <InputArea
              aria-label="Job notes"
              disabled={busy}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                localStorage.setItem(`jh-note-${job.id}`, e.target.value);
                setNoteDirty(true);
              }}
              rows={12}
            />
            <div className="row-actions">
              <Button
                variant="primary"
                disabled={!noteDirty || busy}
                onClick={() =>
                  void update({ notes }).then((ok) => {
                    if (ok) {
                      setNoteDirty(false);
                      localStorage.removeItem(`jh-note-${job.id}`);
                    }
                  })
                }
              >
                Save notes
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void update({
                    status: job.status === "applied" ? "saved" : "applied",
                  })
                }
              >
                {job.status === "applied" ? "Mark saved" : "Mark applied"}
              </Button>
            </div>
          </div>
        )}
        {tab === "cover-letter" &&
          (job.savedAt ? (
            <Suspense
              fallback={<div className="empty">Loading cover letter…</div>}
            >
              <CvPage
                mode="cover-letter"
                embedded
                boot={boot}
                refresh={refresh}
                theme={theme}
                initialJobId={job.id}
                onDirty={handleDirty}
              />
            </Suspense>
          ) : (
            <div className="empty">
              Save this job to generate a cover letter.
            </div>
          ))}
      </div>
      <Dialog.Root
        open={pendingTab !== null}
        onOpenChange={(open) => !open && setPendingTab(null)}
      >
        <Dialog className="app-dialog">
          <Dialog.Title>Discard unsaved changes?</Dialog.Title>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setPendingTab(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                handleDirty(false);
                setTab(pendingTab!);
                onTabLocation(pendingTab!);
                setPendingTab(null);
              }}
            >
              Discard changes
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
}
