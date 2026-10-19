import { build } from "esbuild";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// Bundle only the selected provider, including its Node OAuth implementation.
// Upstream deliberately hides OAuth imports from bundlers; make this one explicit.
export async function packagePi(app: string) {
  const result = await build({
    entryPoints: [resolve("core/ai/pi-sdk.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    write: false,
    minify: true,
    metafile: true,
    legalComments: "eof",
    plugins: [
      {
        name: "openai-oauth",
        setup(build) {
          build.onLoad(
            { filter: /auth[\\/]oauth[\\/]load\.js$/ },
            async (args) => ({
              contents:
                'export async function loadOpenAIChatGPTOAuth() { return (await import("./openai-chatgpt.js")).openaiChatGPTOAuth; }',
              resolveDir: dirname(args.path),
              loader: "js",
            }),
          );
        },
      },
    ],
  });
  const output = result.outputFiles[0].contents;
  await writeFile(join(app, "core/ai/pi-sdk.ts"), output);
  const packagePath = join(
    dirname(
      dirname(
        fileURLToPath(import.meta.resolve("@earendil-works/pi-ai/models")),
      ),
    ),
    "package.json",
  );
  const metadata = JSON.parse(await readFile(packagePath, "utf8"));
  await writeFile(
    join(app, "core/ai/pi-runtime.json"),
    JSON.stringify(
      {
        package: metadata.name,
        version: metadata.version,
        bytes: output.length,
      },
      null,
      2,
    ) + "\n",
  );
  const packages = new Set<string>();
  for (const input of Object.keys(result.metafile.inputs)) {
    const match = input
      .replaceAll("\\", "/")
      .match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
    if (match) packages.add(resolve(match[1]));
  }
  const licenses: string[] = [];
  for (const root of [...packages].sort()) {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const names = (await readdir(root)).filter((name) =>
      /^(?:licen[cs]e|copying|notice)(?:\.|$)/i.test(name),
    );
    licenses.push(
      `${pkg.name}@${pkg.version} (${pkg.license || "see package"})`,
    );
    for (const name of names)
      licenses.push(await readFile(join(root, name), "utf8"));
  }
  await writeFile(
    join(app, "core/ai/pi-runtime-licenses.txt"),
    licenses.join("\n\n") + "\n",
  );
  return output.length;
}
