import { scan } from "../core/scan.ts";
console.log(JSON.stringify(await scan(undefined, true), null, 2));
