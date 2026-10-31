// Shared helpers for the security SQL tests: a throwaway real Postgres 17, a Supabase-like role switch, a pass / fail counter.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const here = new URL(".", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
export const results = [];
export const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : "  " + extra}`);
};
export const denied = (r) => r.error !== null && /permission denied|row-level security|violates row-level|42501|not allowed|cannot be changed|cannot change|completion requires|Direct completion|must start as pending|can only cancel/i.test(r.error.message + (r.error.code ?? ""));

/** A fresh database loaded with the given SQL files (paths relative to this folder). */
export async function freshDb(label, files = ["stub.sql"]) {
  const dir = mkdtempSync(join(tmpdir(), `hf-sec-${label}-`));
  const port = 57000 + Math.floor(Math.random() * 900);
  const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => {}, onError: () => {} });
  await server.initialise();
  await server.start();
  await server.createDatabase("hf");
  const open = async () => {
    const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "hf" });
    await c.connect();
    c.on("error", () => {});
    return c;
  };
  const c = await open();
  for (const f of files) await c.query(readFileSync(join(here, f), "utf8"));
  const q = async (sql, params) => (await c.query(sql, params)).rows;
  /** Runs `sql` as a Supabase role with auth.uid() = uid. Rolled back unless `keep` and it worked. */
  const as = async (role, uid, sql, params, keep = false) => {
    await c.query("begin");
    let ok = false;
    try {
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
      await c.query(`set local role ${role}`);
      const r = await c.query(sql, params);
      ok = true;
      return { rows: r.rows, count: r.rowCount, error: null };
    } catch (e) {
      return { rows: [], count: 0, error: e };
    } finally {
      await c.query(keep && ok ? "commit" : "rollback");
    }
  };
  const extra = [];
  const stop = async () => {
    for (const x of extra) await x.end().catch(() => undefined);
    await c.end();
    await server.stop();
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* Windows may hold the folder a moment */ }
  };
  return { c, q, as, stop, newClient: async () => { const x = await open(); extra.push(x); return x; } };
}

export function finish() {
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ""}`);
  process.exit(failed ? 1 : 0);
}
