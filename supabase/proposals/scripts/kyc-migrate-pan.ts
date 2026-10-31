// One-time KYC migration (proposal 20261125000001). NOT RUN. Dry run by default; nothing is written without --apply.
//
// Run from the repo root, with the secrets only in your shell (never in a file in the repo):
//   export SUPABASE_URL=https://jviwwhjwtyneqrguumro.supabase.co
//   export SUPABASE_SERVICE_ROLE_KEY=...   KYC_PAN_KEY=...   KYC_PAN_HMAC_KEY=...   (KYC_PAN_KEY_VERSION=1)
//   node --experimental-strip-types supabase/proposals/scripts/kyc-migrate-pan.ts            # dry run: prints what it would do
//   node --experimental-strip-types supabase/proposals/scripts/kyc-migrate-pan.ts --apply    # does it
// Needs Node 22.6+. Use the SAME KYC_PAN_* values as the Edge Function secrets, or the app cannot read the PANs.
// Take a database backup first. Safe to run again: a second run reports 0 changes.
import { loadKeyring } from "../functions/_shared/pan-crypto.ts";
import { migrateKyc, type KycRow } from "./kyc-migrate-pan-core.ts";

const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const apply = process.argv.includes("--apply");
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell first.");
  process.exit(2);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

type ApiRow = Omit<KycRow, "user_id" | "phone" | "bank_account_name"> & {
  service_providers: { user_id: string | null; phone: string | null; bank_account_name: string | null } | null;
};

const ring = await loadKeyring((n) => process.env[n]);
const report = await migrateKyc({
  listRows: async () => {
    const out: KycRow[] = [];
    const cols = "provider_id,pan_number,pan_encrypted,pan_nonce,pan_key_version,pan_blind_index,aadhaar_last4,aadhaar_hash,"
      + "aadhaar_front_path,aadhaar_back_path,service_providers(user_id,phone,bank_account_name)";
    for (let offset = 0; ; offset += 500) {
      const page = (await call(`/rest/v1/provider_kyc?select=${cols}&order=provider_id&limit=500&offset=${offset}`)) as ApiRow[];
      for (const { service_providers: sp, ...r } of page) out.push({ ...r, user_id: sp?.user_id ?? null, phone: sp?.phone ?? null, bank_account_name: sp?.bank_account_name ?? null });
      if (page.length < 500) break;
    }
    return out;
  },
  listAadhaarFiles: async (userId) => {
    const items = (await call("/storage/v1/object/list/provider-kyc", {
      method: "POST", body: JSON.stringify({ prefix: `${userId}/`, limit: 1000, offset: 0 }),
    })) as { name: string }[] | null;
    return (items ?? []).filter((i) => /^aadhaar_/i.test(i.name)).map((i) => `${userId}/${i.name}`);
  },
  removeFiles: async (paths) => {
    await call("/storage/v1/object/provider-kyc", { method: "DELETE", body: JSON.stringify({ prefixes: paths }) });
  },
  updateRow: async (providerId, patch) => {
    await call(`/rest/v1/provider_kyc?provider_id=eq.${encodeURIComponent(providerId)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch),
    });
  },
}, ring, { apply });

console.log(apply ? "APPLIED" : "DRY RUN (nothing written; add --apply to do it)");
console.log(JSON.stringify(report, null, 2));
if (report.panInvalid.length || report.panDuplicate.length || report.panMismatch.length) {
  console.log("Some rows need a person: see panInvalid / panDuplicate / panMismatch (provider ids). Proposal 20261125000002 will refuse to run until they are fixed.");
}
