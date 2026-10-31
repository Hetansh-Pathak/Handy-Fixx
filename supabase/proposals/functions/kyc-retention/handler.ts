import { constantTimeEqual } from "../_shared/crypto.ts";
import { json } from "../_shared/http.ts";

// PROPOSAL 20261125000001 (finding H3), NOT DEPLOYED. Called once a day by pg_cron (public.kyc_retention_kick) with the
// shared secret header x-retention-secret (secret KYC_RETENTION_SECRET; the same value sits in the vault as
// kyc_retention_secret). Deletes the photos public.kyc_retention_due lists (Aadhaar photos, 30 days after approval as
// a PLACEHOLDER, never while on legal hold) through the Storage API, then clears the paths
// (public.kyc_retention_mark_done re-checks the legal hold under a row lock).

export const RETENTION_BATCH = 100;
export const RETENTION_MAX_BATCHES = 5;

export type RetentionDeps = {
  env: (name: string) => string | undefined;
  due: (limit: number) => Promise<{ provider_id: string; paths: string[] }[]>;
  /** Deletes files in the private provider-kyc bucket. Missing files count as deleted. */
  removeFiles: (paths: string[]) => Promise<boolean>;
  markDone: (providerId: string, paths: string[]) => Promise<number>;
};

export function createRetentionHandler(deps: RetentionDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const secret = deps.env("KYC_RETENTION_SECRET") ?? "";
    if (secret.length < 32) return json({ error: "KYC_RETENTION_SECRET is not set" }, 500);
    if (!constantTimeEqual(req.headers.get("x-retention-secret") ?? "", secret)) return json({ error: "forbidden" }, 401);

    let providers = 0, files = 0, failed = 0;
    const seen = new Set<string>();
    try {
      for (let batch = 0; batch < RETENTION_MAX_BATCHES; batch++) {
        const rows = (await deps.due(RETENTION_BATCH)).filter((r) => !seen.has(r.provider_id));
        if (!rows.length) break;
        for (const row of rows) {
          seen.add(row.provider_id);
          const paths = row.paths.filter((p) => typeof p === "string" && p.length > 0 && !p.includes(".."));
          if (!paths.length) continue;
          if (!(await deps.removeFiles(paths))) { failed++; continue; }
          const cleared = await deps.markDone(row.provider_id, paths);
          if (cleared > 0) { providers++; files += cleared; }
        }
      }
      return json({ ok: failed === 0, providers, files, failed });
    } catch (error) {
      console.error("[kyc-retention]", error instanceof Error ? error.message : "error");
      return json({ ok: false, providers, files, failed }, 500);
    }
  };
}
