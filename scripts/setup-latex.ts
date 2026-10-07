// Load .env without opening the database or reading candidate evidence.
import "../core/config.ts";
import { setupLatex } from "../core/latex/setup.ts";

try {
  await setupLatex();
} catch (error) {
  console.error(
    `LaTeX setup: ${error instanceof Error ? error.message : String(error)}`,
  );
  console.error(
    "Run npm run setup:latex to retry. Saved documents are preserved.",
  );
  // Allow the rest of the app to start if first-run downloads are unavailable.
  if (!process.argv.includes("--startup")) process.exitCode = 1;
}
