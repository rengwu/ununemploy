import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { existsSync } from "node:fs";

// Only explicit runtime assets and reachable code enter the distributable.
// All generated chunks live in runtime/, so source-relative asset URLs remain
// relocatable without embedding build-machine paths or relying on a checkout.
export async function packageWindowsApp(app: string) {
  const root = resolve(".");
  await mkdir(app, { recursive: true });
  const result = await build({
    entryPoints: {
      "desktop-service": "scripts/desktop-service.ts",
      worker: "worker/index.ts",
    },
    outdir: join(app, "runtime"),
    outExtension: { ".js": ".mjs" },
    chunkNames: "chunk-[hash]",
    bundle: true,
    splitting: true,
    platform: "node",
    target: "node22",
    format: "esm",
    minify: true,
    metafile: true,
    legalComments: "eof",
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
    external: ["playwright", "pdfjs-dist", "@napi-rs/canvas"],
    plugins: [
      {
        name: "desktop-assets-and-oauth",
        setup(builder) {
          builder.onLoad(
            { filter: /auth[\\/]oauth[\\/]load\.js$/ },
            async (args) => ({
              contents:
                'export async function loadOpenAIChatGPTOAuth() { return (await import("./openai-chatgpt.js")).openaiChatGPTOAuth; }',
              resolveDir: dirname(args.path),
              loader: "js",
            }),
          );
          builder.onLoad({ filter: /\.ts$/ }, async (args) => {
            const name = relative(root, args.path).replaceAll("\\", "/");
            if (!/^(core|server|worker|scripts)\//.test(name)) return;
            const contents = (await readFile(args.path, "utf8")).replaceAll(
              "import.meta.url",
              `new URL(${JSON.stringify("../" + name)}, import.meta.url).href`,
            );
            return { contents, loader: "ts", resolveDir: dirname(args.path) };
          });
        },
      },
    ],
  });
  for (const name of [
    "dist",
    "data/geography",
    "core/db/migrations",
    "core/latex/starter.tex",
    "core/profile/skills/build-user-profile/SKILL.md",
    "core/assistant/extract-pdf.worker.mjs",
    "scripts/desktop-bootstrap.mjs",
  ]) {
    await mkdir(dirname(join(app, name)), { recursive: true });
    await cp(join(root, name), join(app, name), { recursive: true });
  }
  const external = [
    "pdfjs-dist",
    "@napi-rs/canvas",
    "@napi-rs/canvas-win32-x64-msvc",
  ];
  for (const name of external) {
    const source = join(root, "node_modules", name);
    await cp(source, join(app, "node_modules", name), {
      recursive: true,
      filter: (path) => {
        const file = relative(source, path).replaceAll("\\", "/");
        if (/\.(map|d\.ts)$/.test(file)) return false;
        if (name !== "pdfjs-dist") return true;
        return (
          !file ||
          /^(legacy($|\/build($|\/pdf(?:\.worker)?\.mjs$))|cmaps($|\/)|standard_fonts($|\/)|wasm($|\/)|package\.json$|LICENSE$)/.test(
            file,
          )
        );
      },
    });
  }
  const packages = new Set<string>(
    external.map((name) => resolve("node_modules", name)),
  );
  for (const input of Object.keys(result.metafile.inputs)) {
    const match = input
      .replaceAll("\\", "/")
      .match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
    if (match) packages.add(resolve(match[1]));
  }
  const licenses: string[] = [];
  // Include notices for the frontend's installed production dependencies too;
  // their JavaScript is already compiled into dist rather than shipped as npm
  // packages. Keep the dependency lock outside the executable application tree.
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  for (const [name, metadata] of Object.entries(lock.packages) as [
    string,
    { dev?: boolean },
  ][]) {
    if (
      name.startsWith("node_modules/") &&
      !metadata.dev &&
      existsSync(join(root, name, "package.json"))
    )
      packages.add(resolve(root, name));
  }
  for (const directory of [...packages].sort()) {
    const pkg = JSON.parse(
      await readFile(join(directory, "package.json"), "utf8"),
    );
    licenses.push(
      `${pkg.name}@${pkg.version} (${pkg.license || "see license"})`,
    );
    for (const name of (await readdir(directory)).filter((n) =>
      /^(licen[cs]e|copying|notice)(\.|$)/i.test(n),
    ))
      licenses.push(await readFile(join(directory, name), "utf8"));
  }
  await writeFile(
    join(app, "THIRD-PARTY-NOTICES.txt"),
    licenses.join("\n\n") + "\n",
  );
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  await writeFile(
    join(app, "package.json"),
    JSON.stringify(
      { name: pkg.name, version: pkg.version, private: true, type: "module" },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(app, "runtime-build.json"),
    JSON.stringify(
      {
        format: 1,
        external,
        modules: Object.keys(result.metafile.inputs).length,
        bytes: Object.values(result.metafile.outputs).reduce(
          (n, item) => n + item.bytes,
          0,
        ),
      },
      null,
      2,
    ) + "\n",
  );
}
