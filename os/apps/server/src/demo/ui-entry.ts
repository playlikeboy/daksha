// A local server full of made-up content, for looking at and photographing the app's screens.
//
//   pnpm dev:ui-demo          (from os/)
//
// It runs the normal API in a sample workspace on 127.0.0.1 with the in-memory journal
// (DEBO_DEV_MEMORY) filled with invented entries (DEBO_DEV_SEED), the scripted sample agent,
// and no model, Google, database or provider keys. Data lives in ignored artifacts/ui-demo/
// and the journal is forgotten when it stops. Nothing here can reach a real account.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const port = Number(process.env.UI_DEMO_PORT ?? "8788");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("UI_DEMO_PORT must be an integer from 1 to 65535");
const dataDir = join(root, "artifacts", "ui-demo", "api");
const runtimeDir = join(root, "artifacts", "ui-demo", "runtime");
await mkdir(runtimeDir, { recursive: true });
// A fresh cwd stops config.ts from loading the project's private .env.
const cwd = await mkdtemp(join(runtimeDir, "process-"));
const publicUrl = `http://127.0.0.1:${port}`;

// An explicit environment: never copy real provider, Google, auth or database keys.
const api = spawn(
  process.execPath,
  ["--import", import.meta.resolve("tsx"), fileURLToPath(new URL("../index.ts", import.meta.url))],
  {
    cwd,
    stdio: "inherit",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      TZ: process.env.TZ ?? "Asia/Kolkata",
      WORKSPACE_MODE: "sample",
      AGENT_BACKEND: "sample",
      AUTH_MODE: "access-key",
      DEBO_DEV_MEMORY: "1",
      DEBO_DEV_SEED: "1",
      PORT: String(port),
      HOST: "127.0.0.1",
      PUBLIC_API_URL: publicUrl,
      DATA_DIR: dataDir,
      TASK_WORKER_ENABLED: "true",
      COMPUTER_ENABLED: "false",
      WEB_SEARCH_ENABLED: "false",
      ALLOWED_ORIGINS:
        process.env.UI_DEMO_ALLOWED_ORIGINS ??
        "http://localhost:8081,http://127.0.0.1:8081,http://127.0.0.1:8091",
      DO_NOT_TRACK: "1",
      COPILOTKIT_TELEMETRY_DISABLED: "true",
    },
  },
);
console.log(`Debo UI demo API (made-up content only): ${publicUrl}`);
console.log(`Start the app with EXPO_PUBLIC_API_URL=${publicUrl} pnpm dev:web`);

const stop = () => api.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
api.on("close", (code) => {
  process.exitCode = code ?? 0;
});
