import { friendlyDbError, type ProSubItemRow } from "@handyfix/shared";
import { getSupabase } from "@/lib/supabase";

/** One job in the catalogue, with the admin band a pro's own rate must sit in. */
export type CatalogueJob = {
  id: string;
  service_id: string;
  name: string;
  section: string | null;
  base_price: number;
  price_min: number | null;
  price_max: number | null;
};

export const myServicesKey = (providerId: string) => ["provider-sub-items", providerId] as const;
export const catalogueJobsKey = ["catalogue-jobs"] as const;

const missingTable = (e: { code?: string }) => e.code === "42P01" || e.code === "PGRST205";
const missingColumn = (e: { code?: string; message: string }) => e.code === "42703" || /section|price_m/i.test(e.message);

/** Every active job of every service (the pro picks from all of them on one screen). */
export async function fetchCatalogueJobs(): Promise<CatalogueJob[]> {
  const query = (columns: string) =>
    getSupabase().from("service_sub_items").select(columns).eq("is_active", true).order("sort_order");
  let { data, error } = await query("id, service_id, name, section, base_price, price_min, price_max");
  if (error && missingColumn(error)) ({ data, error } = await query("id, service_id, name, base_price"));
  if (error) {
    if (missingTable(error)) return [];
    throw new Error(friendlyDbError(error));
  }
  return ((data ?? []) as unknown as Partial<CatalogueJob>[])
    .map((j) => ({
      id: j.id!, service_id: j.service_id!, name: j.name!, section: j.section ?? null,
      base_price: Number(j.base_price), price_min: j.price_min == null ? null : Number(j.price_min), price_max: j.price_max == null ? null : Number(j.price_max),
    }))
    .filter((j) => j.base_price > 0);
}

/** The pro's ticked jobs. Null when the table is not in the database yet (proposal 20261113000002 not applied). */
export async function fetchMySubItems(providerId: string): Promise<ProSubItemRow[] | null> {
  const { data, error } = await getSupabase().from("provider_sub_items").select("provider_id, sub_item_id, custom_price").eq("provider_id", providerId);
  if (error) {
    if (missingTable(error)) return null;
    throw new Error(friendlyDbError(error));
  }
  return (data ?? []) as ProSubItemRow[];
}

/**
 * Saves the services and the ticked jobs. New rows go in first and leftovers are removed after, so a lost
 * connection can leave an extra job ticked but never wipes the pro's list. `rows: null` saves services only
 * (job table not switched on yet).
 */
export async function saveMyServices(args: {
  providerId: string;
  serviceIds: string[];
  rows: { subItemId: string; customPrice: number | null }[] | null;
}): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("service_providers").update({ service_ids: args.serviceIds }).eq("id", args.providerId).select("id").maybeSingle();
  if (error) throw new Error(friendlyDbError(error));
  if (!data) throw new Error("Your services could not be saved. Sign out and in again, then retry.");
  if (!args.rows) return;

  if (args.rows.length) {
    const up = await supabase.from("provider_sub_items").upsert(
      args.rows.map((r) => ({ provider_id: args.providerId, sub_item_id: r.subItemId, custom_price: r.customPrice })),
      { onConflict: "provider_id,sub_item_id" },
    );
    if (up.error) throw new Error(friendlyDbError(up.error));
  }
  let del = supabase.from("provider_sub_items").delete().eq("provider_id", args.providerId);
  if (args.rows.length) del = del.not("sub_item_id", "in", `(${args.rows.map((r) => r.subItemId).join(",")})`);
  const { error: delError } = await del;
  if (delError) throw new Error(friendlyDbError(delError));
}
