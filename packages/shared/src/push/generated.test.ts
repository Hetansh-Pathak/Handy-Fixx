import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The Edge Function that sends the push uses a generated copy of messages.ts. If this fails, run: npm run push:build
const script = resolve(__dirname, "../../../../scripts/build-push-function.mjs");
const generated = resolve(__dirname, "../../../../supabase/proposals/functions/notify-push/shared-push.js");

describe("the notify-push function uses the current wording", () => {
  it("shared-push.js is up to date", () => {
    expect(execFileSync(process.execPath, [script, "--check"], { encoding: "utf8" })).toContain("up to date");
  });
  it("and the check really fails on an out-of-date file (not a rubber stamp); it works on a temporary copy, never the real file", () => {
    const dir = mkdtempSync(join(tmpdir(), "push-check-"));
    try {
      const stale = join(dir, "shared-push.js");
      writeFileSync(stale, readFileSync(generated, "utf8").replace("New job request", "Changed wording"), "utf8");
      expect(() => execFileSync(process.execPath, [script, "--check", stale], { encoding: "utf8", stdio: "pipe" })).toThrow();
      const missing = join(dir, "does-not-exist.js");
      expect(() => execFileSync(process.execPath, [script, "--check", missing], { encoding: "utf8", stdio: "pipe" })).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
