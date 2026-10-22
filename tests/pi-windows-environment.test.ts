import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertPrivateFile } from "./helpers/private-file.ts";

test(
  "Windows credentials ignore incompatible modules inherited through a parent shell",
  { skip: process.platform !== "win32" },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "ununemploy-pi-modules-"));
    const previous = process.env.PSModulePath;
    process.env.JH_DATA_DIR = directory;
    process.env.JH_PROFILE_SEED = "";
    const modules = join(directory, "modules");
    const security = join(modules, "Microsoft.PowerShell.Security");
    await mkdir(security, { recursive: true });
    // Reproduce PowerShell 7 -> Node -> Windows PowerShell 5.1 module discovery.
    // The incompatible manifest is sufficient; no external shell install needed.
    await writeFile(
      join(security, "Microsoft.PowerShell.Security.psd1"),
      "@{ ModuleVersion = '7.0.0'; RootModule = 'security.psm1'; FunctionsToExport = @('Get-Acl') }",
    );
    await writeFile(
      join(security, "security.psm1"),
      "throw 'Incompatible inherited module loaded'; function Get-Acl {} ",
    );
    process.env.PSModulePath = modules + ";" + (previous || "");
    const { db } = await import("../core/db/index.ts");
    try {
      const { credentials, hostId } =
        await import("../core/ai/pi-credentials.ts");
      assert.equal(await credentials.read("openai"), undefined);
      const value = {
        type: "oauth" as const,
        access: "synthetic",
        refresh: "synthetic",
        expires: Date.now() + 60000,
      };
      await credentials.modify("openai", async () => value);
      assert.deepEqual(await credentials.read("openai"), value);
      assertPrivateFile(join(directory, "pi-auth/credentials.json"));
      assert.equal(await hostId(), await hostId());
      assertPrivateFile(join(directory, "pi-auth/host-id"));
    } finally {
      if (previous === undefined) delete process.env.PSModulePath;
      else process.env.PSModulePath = previous;
      db.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
