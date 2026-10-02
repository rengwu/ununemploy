import { discoverySources } from "../core/source-catalog.ts";
import { addSource, listSources, transaction } from "../core/db/index.ts";
import { addPublicBoards } from "../core/boards/install.ts";

// Upgrade legacy manual entries first so the catalog does not duplicate them.
const boards = addPublicBoards();
const added = transaction(() => {
  const existing = new Set(
    listSources().map((s) => `${s.type}:${s.identifier}`),
  );
  return discoverySources
    .filter((s) => !existing.has(`${s.type}:${s.identifier}`))
    .map((s) => addSource(s).name);
});
console.log(
  JSON.stringify({
    added: [...boards.added, ...added],
    upgraded: boards.upgraded,
    count: boards.added.length + added.length,
  }),
);
