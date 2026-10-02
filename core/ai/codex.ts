import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.ts";
import { lease, release } from "../db/index.ts";
import { randomUUID } from "node:crypto";

const exec = promisify(execFile);
// No user/project tools or notification hooks are available to job-description input.
export const disabledFeatures = [
  "shell_tool",
  "unified_exec",
  "apps",
  "plugins",
  "hooks",
  "multi_agent",
  "multi_agent_v2",
  "browser_use",
  "browser_use_external",
  "computer_use",
  "in_app_browser",
  "image_generation",
  "view_image",
  "skill_search",
  "tool_suggest",
  "code_mode",
  "code_mode_host",
  "goals",
  "sleep_tool",
  "memories",
];
export function codexEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "CODEX_HOME",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
  ])
    if (process.env[key]) env[key] = process.env[key];
  // Map the app setting to the official runtime's documented credential directory.
  if (config.codexHome) env.CODEX_HOME = config.codexHome;
  return env;
}
export async function checkCodex() {
  try {
    const result = await exec(config.codexCommand, ["login", "status"], {
      env: codexEnvironment(),
      timeout: 15000,
      maxBuffer: 100000,
    });
    if (!/chatgpt/i.test(result.stdout + result.stderr))
      return {
        state: "signed_out",
        message: "Sign in to Codex with your ChatGPT subscription.",
      };
    return { state: "ready", message: "" };
  } catch (error) {
    return {
      state: "signed_out",
      message:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "Codex is not installed."
          : "Sign in to Codex with your ChatGPT subscription.",
    };
  }
}
export function codexArgs(
  cwd: string,
  schemaPath: string,
  outputPath: string,
): string[] {
  return [
    "exec",
    "--ignore-user-config",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--cd",
    cwd,
    "--model",
    config.model,
    "-c",
    `model_reasoning_effort=${JSON.stringify(config.reasoning)}`,
    "-c",
    'model_provider="openai"',
    "-c",
    'forced_login_method="chatgpt"',
    "-c",
    'approval_policy="never"',
    "-c",
    'web_search="disabled"',
    "-c",
    "tools.view_image=false",
    "-c",
    "agents.enabled=false",
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    "mcp_servers={}",
    "-c",
    "notify=[]",
    "-c",
    "features.skip_host_skill_discovery=true",
    ...disabledFeatures.flatMap((feature) => ["--disable", feature]),
    "--json",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    "-",
  ];
}
export async function infer<T>(
  prompt: string,
  schema: object,
  options: { signal?: AbortSignal } = {},
): Promise<{ result: T; usage: unknown }> {
  if (options.signal?.aborted) throw new Error("Codex request cancelled.");
  const owner = randomUUID();
  if (!lease("codex-inference", owner, 300000))
    throw new Error("Another Codex generation is running.");
  const heartbeat = setInterval(
    () => lease("codex-inference", owner, 300000),
    30000,
  );
  let taskDir = "";
  let stderr = "";
  let stdout = "";
  let usage: unknown = null;
  try {
    const runtimeDir = join(config.dataDir, "inference");
    await mkdir(runtimeDir, { recursive: true });
    taskDir = await mkdtemp(join(runtimeDir, "run-"));
    const schemaPath = join(taskDir, "schema.json");
    const outputPath = join(taskDir, "result.json");
    await writeFile(schemaPath, JSON.stringify(schema));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        config.codexCommand,
        codexArgs(taskDir, schemaPath, outputPath),
        {
          cwd: taskDir,
          env: codexEnvironment(),
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let terminationReason: string | null = null;
      let hardTimeout: NodeJS.Timeout | undefined;
      const stop = () => child.kill("SIGTERM");
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
      const terminate = (message: string) => {
        terminationReason = message;
        child.kill("SIGTERM");
        hardTimeout = setTimeout(() => child.kill("SIGKILL"), 3000);
      };
      const onAbort = () => terminate("Codex request cancelled.");
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
      const timeout = setTimeout(
        () => terminate("Codex generation timed out. Retry when ready."),
        240000,
      );
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
        if (stdout.length > 2000000 && !terminationReason)
          terminate("Codex returned too much output.");
      });
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + String(chunk)).slice(-12000);
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        options.signal?.removeEventListener("abort", onAbort);
        process.removeListener("SIGTERM", stop);
        process.removeListener("SIGINT", stop);
        clearTimeout(timeout);
        clearTimeout(hardTimeout);
        if (terminationReason) {
          reject(new Error(terminationReason));
          return;
        }
        if (code === 0) resolve();
        else {
          let message =
            "Codex could not complete this draft. Retry or check the subscription sign-in.";
          if (
            /usage limit|rate.limit|quota|429|exceeded/i.test(stderr + stdout)
          )
            message =
              "Codex subscription allowance is unavailable. Retry after it resets.";
          else if (
            /not supported|model.*not.*found|model.*unavailable|model.*access/i.test(
              stderr + stdout,
            )
          )
            message = `The signed-in account cannot use ${config.model}. No fallback model was used.`;
          else if (
            /unknown feature|error loading|invalid.*config|parse.*config/i.test(
              stderr,
            )
          )
            message = `Codex configuration failed: ${stderr
              .split("\n")
              .filter((l) => /error|unknown|invalid/i.test(l))
              .slice(0, 2)
              .join(" ")
              .slice(0, 500)}`;
          reject(new Error(message));
        }
      });
      child.stdin.end(prompt);
    });
    for (const line of stdout.split("\n")) {
      try {
        const event = JSON.parse(line);
        if (event.type === "turn.completed") usage = event.usage;
        if (
          event.item &&
          [
            "command_execution",
            "mcp_tool_call",
            "web_search",
            "file_change",
          ].includes(event.item.type)
        )
          throw new Error("Unexpected tool operation in document generation.");
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Unexpected tool operation in document generation."
        )
          throw error;
      }
    }
    return {
      result: JSON.parse(await readFile(outputPath, "utf8")) as T,
      usage,
    };
  } finally {
    clearInterval(heartbeat);
    release("codex-inference", owner);
    if (taskDir) await rm(taskDir, { recursive: true, force: true });
  }
}
