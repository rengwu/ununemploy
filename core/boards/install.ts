import { publicBoards, boardSourceDefaults } from "./catalog.ts";
import {
  addSource,
  listSources,
  saveSource,
  transaction,
} from "../db/index.ts";
export function addPublicBoards() {
  return transaction(() => {
    const sources = listSources();
    const added: string[] = [],
      upgraded: string[] = [];
    for (const [key, board] of Object.entries(publicBoards)) {
      if (
        sources.some((s) => s.type === "public_board" && s.identifier === key)
      )
        continue;
      const legacy = sources.find(
        (s) => s.type === "website" && s.identifier === board.legacy,
      );
      if (legacy) {
        // Manual-only sources were forcibly disabled, not user-paused collectors.
        saveSource({
          ...legacy,
          ...boardSourceDefaults(key),
          checkpoint: {},
          state: "idle",
          nextRunAt: null,
          retryAt: null,
          lastError: null,
        });
        upgraded.push(board.name);
      } else {
        addSource(boardSourceDefaults(key));
        added.push(board.name);
      }
    }
    return { added, upgraded };
  });
}
