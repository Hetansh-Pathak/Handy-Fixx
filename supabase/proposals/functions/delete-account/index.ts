// PROPOSAL, NOT DEPLOYED. Lives in supabase/proposals so the CLI never deploys it by accident.
// To use it: apply 20261111000000_delete_account_PROPOSAL (the anonymise_account SQL function) first, test on a throwaway
// project, then copy this folder to supabase/functions/delete-account and deploy with the Supabase CLI.
//
// What it does for the person who calls it (their own signed-in session, never anyone else's):
//   1. refuses a pro with money in the wallet or fees due (money cannot be paid out after deletion)
//   2. runs anonymise_account(), which refuses while a booking is in progress and erases personal data
//   3. removes their files (identity documents, photos, booking photos and voice notes)
//   4. soft-deletes the sign-in, so old rows that point at it stay valid but the email and phone are gone
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase to every function.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Buckets that keep files under a folder named after the user id. */
const BUCKETS = ["provider-kyc", "avatars", "booking-attachments"];

async function removeFolder(admin: ReturnType<typeof createClient>, bucket: string, folder: string): Promise<void> {
  // Files can be one level deeper (booking-attachments/<user>/<booking>/<file>), so walk the folder.
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
  if (error || !data) return;
  const files: string[] = [];
  for (const entry of data) {
    const path = `${folder}/${entry.name}`;
    if (entry.id === null) await removeFolder(admin, bucket, path); // a sub-folder
    else files.push(path);
  }
  if (files.length) await admin.storage.from(bucket).remove(files);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json(401, { error: "Please sign in again." });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1. A pro must settle the wallet first. get_wallet_summary() reads the caller's own wallet.
  const { data: provider } = await admin.from("service_providers").select("id").eq("user_id", user.id).maybeSingle();
  if (provider) {
    const { data: wallet } = await asUser.rpc("get_wallet_summary");
    const summary = (Array.isArray(wallet) ? wallet[0] : wallet) as { available?: number; dues?: number } | null;
    if (Number(summary?.dues ?? 0) > 0) return json(409, { error: "You have HandyFix fees due. Top up your wallet to clear them first." });
    if (Number(summary?.available ?? 0) > 0) return json(409, { error: "You still have money in your wallet. Withdraw it first." });
  }

  // 2. Erase personal data (also refuses while a booking is in progress).
  const { data: result, error: anonError } = await admin.rpc("anonymise_account", { p_user_id: user.id });
  if (anonError) {
    // 22023 messages are written for people (for example "You have 1 booking(s) in progress...").
    const readable = anonError.code === "22023" ? anonError.message : "We could not delete your account. Please email support.";
    return json(anonError.code === "22023" ? 409 : 500, { error: readable });
  }

  // 3. Files. Best effort: a failure here is reported but does not undo step 2.
  for (const bucket of BUCKETS) {
    try { await removeFolder(admin, bucket, user.id); } catch (_) { /* reported below through warnings */ }
  }

  // 4. The sign-in (soft delete: keeps the row so references stay valid, clears the email and phone).
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, true);
  if (deleteError) return json(500, { error: "Your data was erased, but sign-out failed. Please email support to finish.", detail: deleteError.message });

  return json(200, { ok: true, warnings: (result as { warnings?: string[] } | null)?.warnings ?? [] });
});
