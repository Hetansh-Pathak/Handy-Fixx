// Starts the web app on port 8099 against the FAKE backend, for `npm run test:e2e-web`.
// Why a script: Expo reads apps/mobile/.env.local after the shell, and its values (for example
// EXPO_PUBLIC_ARRIVED_STATUS=1 or EXPO_PUBLIC_APP_VARIANT=provider) then change what the tests see.
// So .env.local is set aside while this runs and put back when it stops (Ctrl+C), so the test never
// depends on your own settings. If a crash left it set aside, it is restored the next time.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const envFile = path.join(root, ".env.local");
const held = path.join(root, ".env.local.held-by-e2e");

if (fs.existsSync(held)) {
  if (fs.existsSync(envFile)) fs.rmSync(held);
  else fs.renameSync(held, envFile);
}
let moved = false;
if (fs.existsSync(envFile)) {
  fs.renameSync(envFile, held);
  moved = true;
}
function restore() {
  if (moved && fs.existsSync(held) && !fs.existsSync(envFile)) fs.renameSync(held, envFile);
  moved = false;
}

const child = spawn(process.execPath, [require.resolve("expo/bin/cli"), "start", "--web", "--port", "8099", "--clear"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    EXPO_PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
    EXPO_PUBLIC_ENABLE_SPIKE: "0",
    // The animated opening screen would only slow the tests down; splash-flow.cjs starts the server with EXPO_PUBLIC_SKIP_SPLASH=0.
    EXPO_PUBLIC_SKIP_SPLASH: process.env.EXPO_PUBLIC_SKIP_SPLASH ?? "1",
    EXPO_PUBLIC_ARRIVED_STATUS: "0",
    EXPO_PUBLIC_PDF_PRICING_LIVE: "0",
    EXPO_PUBLIC_MAPS_ENABLED: "0",
    EXPO_PUBLIC_APP_VARIANT: ["customer", "provider"].includes(process.argv[2]) ? process.argv[2] : "both",
  },
});
const stop = (signal) => () => {
  restore();
  child.kill(signal);
};
process.on("SIGINT", stop("SIGINT"));
process.on("SIGTERM", stop("SIGTERM"));
child.on("exit", (code) => {
  restore();
  process.exit(code ?? 0);
});
process.on("exit", restore);
