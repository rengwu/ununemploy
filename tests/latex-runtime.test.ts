import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  rmSync,
  realpathSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  findTectonic,
  latexRuntimeDirectory,
  latexExecutableName,
} from "../core/latex/runtime.ts";
import { compileLatex, LatexCompileError } from "../core/latex/compile.ts";
import {
  setupLatex,
  tectonicRelease,
  verifyArchive,
  installTectonic,
} from "../core/latex/setup.ts";

const directory = mkdtempSync(join(tmpdir(), "ununemploy-runtime-test-"));
after(() => rmSync(directory, { recursive: true, force: true }));

test("managed compiler works with a restricted PATH; explicit overrides fail closed", async () => {
  const saved = { ...process.env };
  try {
    process.env.JH_DATA_DIR = directory;
    process.env.PATH = "/usr/bin:/bin";
    delete process.env.JH_TECTONIC_BIN;
    const bin = join(
      latexRuntimeDirectory(),
      "bin",
      latexExecutableName("tectonic"),
    );
    mkdirSync(join(latexRuntimeDirectory(), "bin"), { recursive: true });
    writeFileSync(bin, "#!/bin/sh\nexit 0\n");
    chmodSync(bin, 0o755);
    assert.equal(findTectonic(), realpathSync(bin));
    process.env.JH_TECTONIC_BIN = join(directory, "missing");
    assert.equal(findTectonic(), undefined);
    await assert.rejects(
      compileLatex("source stays local"),
      (error: unknown) =>
        error instanceof LatexCompileError && error.statusCode === 503,
    );
    await assert.rejects(setupLatex(), /JH_TECTONIC_BIN/);
    process.env.JH_TECTONIC_BIN = bin;
    assert.equal(findTectonic(), realpathSync(bin));
    if (process.platform !== "win32") {
      chmodSync(bin, 0o644);
      assert.equal(findTectonic(), undefined);
    }
  } finally {
    process.env = saved;
  }
});

test(
  "macOS detects Homebrew even when the launcher omits its PATH",
  { skip: process.platform !== "darwin" },
  () => {
    const saved = { ...process.env };
    try {
      process.env.JH_DATA_DIR = join(directory, "empty");
      delete process.env.JH_TECTONIC_BIN;
      process.env.PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
      const expected = findTectonic();
      process.env.PATH = "/usr/bin:/bin";
      assert.equal(findTectonic(), expected);
    } finally {
      process.env = saved;
    }
  },
);

test("compiler downloads are pinned per architecture and reject altered bytes", () => {
  for (const platform of ["darwin", "linux"] as const) {
    for (const arch of ["arm64", "x64"] as const) {
      const release = tectonicRelease(platform, arch);
      assert.match(
        release.url,
        /^https:\/\/github.com\/tectonic-typesetting\/tectonic\/releases\/download\/tectonic%400\.15\.0\//,
      );
      assert.match(release.sha256, /^[a-f0-9]{64}$/);
    }
  }
  assert.match(
    tectonicRelease("win32", "x64").url,
    /x86_64-pc-windows-msvc.zip$/,
  );
  assert.throws(() => tectonicRelease("win32", "arm64"), /Docker/);
  const archive = Buffer.from("test archive");
  const digest = createHash("sha256").update(archive).digest("hex");
  verifyArchive(archive, digest);
  assert.throws(
    () => verifyArchive(Buffer.from("altered"), digest),
    /checksum mismatch/,
  );
});

test("a failed download leaves the installed compiler intact and removes staging files", async () => {
  const saved = { ...process.env };
  const fetch = globalThis.fetch;
  try {
    process.env.JH_DATA_DIR = join(directory, "failed-download");
    const binDir = join(latexRuntimeDirectory(), "bin");
    mkdirSync(binDir, { recursive: true });
    const binary = join(binDir, latexExecutableName("tectonic"));
    writeFileSync(binary, "existing compiler");
    globalThis.fetch = async () => new Response("incorrect archive");
    await assert.rejects(installTectonic(), /checksum mismatch/);
    assert.equal(readFileSync(binary, "utf8"), "existing compiler");
    assert.deepEqual(readdirSync(binDir), [latexExecutableName("tectonic")]);
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    await assert.rejects(installTectonic(), /offline/);
    assert.deepEqual(readdirSync(binDir), [latexExecutableName("tectonic")]);
  } finally {
    globalThis.fetch = fetch;
    process.env = saved;
  }
});
