import { scan } from "../core/scan.ts";
import { listSources } from "../core/db/index.ts";
const source = listSources().find(
  (s) => s.type === "ashby" && s.identifier === "cursor",
);
if (!source) throw new Error("Cursor source is not configured.");
console.log(JSON.stringify(await scan(source.id, true)));
