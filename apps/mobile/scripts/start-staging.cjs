// Starts the app on the web against the STAGING Supabase project (handyfix-staging), without touching your live settings.
//   npm run start:staging              -> both apps in one build (dev)    npm run start:staging:provider | :customer
// Settings come from apps/mobile/.env.staging.local (never committed). Your live .env.local is set aside while this runs and
// put back when it stops (Ctrl+C); if a crash left it set aside, it is restored the next time.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const envFile = path.join(root, ".env.local");
const held = path.join(root, ".env.local.held-by-staging");
const stagingFile = path.join(root, ".env.staging.local");

if (!fs.existsSync(stagingFile)) {
  console.error("Missing apps/mobile/.env.staging.local (staging URL + key). See supabase/staging/README.md.");
  process.exit(2);
}
const staging = Object.fromEntries(
  fs.readFileSync(stagingFile, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!staging.EXPO_PUBLIC_SUPABASE_URL || !staging.EXPO_PUBLIC_SUPABASE_URL.includes("keukwovrtsenndtjejcp")) {
  console.error("REFUSED: .env.staging.local must point at the staging project (keukwovrtsenndtjejcp), not the live one.");
  process.exit(3);
}

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

const variant = ["customer", "provider"].includes(process.argv[2]) ? process.argv[2] : "";
const port = variant === "customer" ? "8083" : variant === "provider" ? "8084" : "8085";
console.log(`Starting the ${variant || "customer + pro"} app against STAGING on http://localhost:${port}`);
const child = spawn(process.execPath, [require.resolve("expo/bin/cli"), "start", "--web", "--port", port, "--clear"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, ...staging, EXPO_PUBLIC_APP_VARIANT: variant },
});
const stop = (signal) => () => { restore(); child.kill(signal); };
process.on("SIGINT", stop("SIGINT"));
process.on("SIGTERM", stop("SIGTERM"));
child.on("exit", (code) => { restore(); process.exit(code ?? 0); });
process.on("exit", restore);
