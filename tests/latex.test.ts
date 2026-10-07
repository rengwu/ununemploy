import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-latex-test-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = new URL(
  "./fixtures/profile.json",
  import.meta.url,
).pathname;
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const { app } = await import("../server/index.ts");
const { parseLatexDiagnostics, compileLatex, LatexCompileError } =
  await import("../core/latex/compile.ts");
const { sourceHash, latexVersion, latexBuild } =
  await import("../core/latex/store.ts");
const starter = readFileSync(
  new URL("../core/latex/starter.tex", import.meta.url),
  "utf8",
);
const { findTectonic, latexSandboxExecutable } =
  await import("../core/latex/runtime.ts");
const compiler = findTectonic();
const compilerAvailable =
  !!compiler &&
  spawnSync(compiler, ["--version"]).status === 0 &&
  (process.platform === "darwin" || existsSync(latexSandboxExecutable()));
after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("LaTeX versions preserve facts, legacy CVs and conflicts; invalid TeX can be saved", async () => {
  const facts = JSON.stringify(store.getProfile());
  const cvs = JSON.stringify(store.listCvVersions());
  const initial = (
    await app.inject({ method: "GET", url: "/api/latex" })
  ).json();
  assert.match(initial.current.source, /\\documentclass/);
  const edit = starter.replace("Edit your resume here.", "Local draft.");
  const saved = await app.inject({
    method: "PUT",
    url: "/api/latex",
    payload: { source: edit, expectedVersion: 1 },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().version, 2);
  const conflict = await app.inject({
    method: "PUT",
    url: "/api/latex",
    payload: { source: "obsolete", expectedVersion: 1 },
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(latexVersion().source, edit);
  const bad = await app.inject({
    method: "PUT",
    url: "/api/latex",
    payload: { source: "\\broken{", expectedVersion: 2 },
  });
  assert.equal(bad.statusCode, 200);
  const restored = await app.inject({
    method: "PUT",
    url: "/api/latex",
    payload: { source: edit, expectedVersion: 3, restoredFrom: 2 },
  });
  assert.equal(restored.json().version, 4);
  assert.equal(restored.json().restoredFrom, 2);
  assert.equal(latexVersion(3).source, "\\broken{");
  assert.equal(JSON.stringify(store.getProfile()), facts);
  assert.equal(JSON.stringify(store.listCvVersions()), cvs);
  const persisted = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.argv[1],{readOnly:true}); console.log(db.prepare('SELECT source FROM latex_versions ORDER BY version DESC LIMIT 1').get().source);`,
      join(directory, "job-hunter.db"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(persisted.status, 0);
  assert.equal(persisted.stdout.trim(), edit.trim());
});
test("compile diagnostics retain source line numbers", () => {
  assert.deepEqual(
    parseLatexDiagnostics(
      "error: resume.tex:14: Undefined control sequence\nwarning: resume.tex:12: Overfull box",
    ),
    [
      { severity: "error", message: "Undefined control sequence", line: 14 },
      { severity: "warning", message: "Overfull box", line: 12 },
    ],
  );
});
test("source and PDF routes reject oversized input and invalid paths", async () => {
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/latex/compile",
        payload: { source: "x".repeat(120001) },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/latex/pdf/not-a-hash" }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: `/api/latex/pdf/${"a".repeat(64)}`,
      })
    ).statusCode,
    404,
  );
});
test(
  "real offline compilation serves matching PDF and retains last good preview after errors",
  { skip: !compilerAvailable },
  async () => {
    const result = await app.inject({
      method: "POST",
      url: "/api/latex/compile",
      payload: { source: starter },
    });
    assert.equal(result.statusCode, 200, result.body);
    const hash = result.json().hash;
    assert.equal(hash, sourceHash(starter));
    const pdf = await app.inject({
      method: "GET",
      url: `/api/latex/pdf/${hash}`,
    });
    assert.equal(pdf.statusCode, 200);
    assert.equal(pdf.rawPayload.subarray(0, 5).toString(), "%PDF-");
    assert.match(String(pdf.headers["cache-control"]), /no-store/);
    const bad = await app.inject({
      method: "POST",
      url: "/api/latex/compile",
      payload: {
        source: starter.replace("Edit your resume here.", "\\NotACommand"),
      },
    });
    assert.equal(bad.statusCode, 422);
    assert.ok(bad.json().diagnostics.some((x: { line?: number }) => x.line));
    assert.equal(
      (await app.inject({ method: "GET", url: "/api/latex" })).json()
        .previewHash,
      hash,
    );
    assert.ok(latexBuild(hash));
  },
);
test(
  "compiler cannot read a private file through relative path traversal or write shell output",
  { skip: !compilerAvailable },
  async () => {
    const secret = join(directory, "private-secret.tex");
    writeFileSync(secret, "PRIVATE_SENTINEL_SHOULD_NOT_RENDER");
    // Work is a sibling beneath tmpdir, so this remains relative from every compile directory.
    const traversal = `../${relative(tmpdir(), secret)}`;
    await assert.rejects(
      compileLatex(
        starter.replace("Edit your resume here.", `\\input{${traversal}}`),
      ),
      LatexCompileError,
    );
    const output = join(directory, "shell-output");
    await compileLatex(
      starter.replace(
        "Edit your resume here.",
        `\\immediate\\write18{touch ${output}}No shell.`,
      ),
    );
    assert.equal(existsSync(output), false);
    // Missing packages must fail offline rather than reaching out to a server.
    await assert.rejects(
      compileLatex(
        starter.replace(
          "\\begin{document}",
          "\\usepackage{ununemploy-package-that-does-not-exist}\n\\begin{document}",
        ),
      ),
      LatexCompileError,
    );
  },
);
