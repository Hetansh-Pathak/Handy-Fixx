import { normalizeClock, type AvailabilityRow } from "@handyfix/shared";
import { getSupabase } from "@/lib/supabase";

export type ScheduleRow = AvailabilityRow & { id: string };

export const availabilityKey = (providerId: string) => ["provider-availability", providerId] as const;

/** Customers can read any pro's hours (the table is public to read), so the booking screen uses this too. */
export async function fetchAvailability(providerId: string): Promise<ScheduleRow[]> {
  const { data, error } = await getSupabase()
    .from("provider_availability").select("id, day_of_week, start_time, end_time, is_available").eq("provider_id", providerId).order("start_time");
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error("Could not load the working hours. Check your internet and try again.");
  }
  return (data ?? []) as ScheduleRow[];
}

const failed = () => new Error("Your working hours could not be saved. Please try again.");

export async function addWindow(providerId: string, day: string, start: string, end: string): Promise<void> {
  const { error } = await getSupabase().from("provider_availability").insert({
    provider_id: providerId, day_of_week: day, start_time: normalizeClock(start), end_time: normalizeClock(end), is_available: true,
  });
  if (error) throw failed();
}

export async function updateWindow(id: string, patch: { start_time?: string; end_time?: string; is_available?: boolean }): Promise<void> {
  const { error } = await getSupabase().from("provider_availability").update(patch).eq("id", id);
  if (error) throw failed();
}

export async function deleteWindow(id: string): Promise<void> {
  const { error } = await getSupabase().from("provider_availability").delete().eq("id", id);
  if (error) throw failed();
}

/** Replaces the hours of the listed days with `rows` (used by "Copy to weekdays"). */
export async function replaceDays(providerId: string, days: readonly string[], rows: readonly AvailabilityRow[]): Promise<void> {
  const supabase = getSupabase();
  const del = await supabase.from("provider_availability").delete().eq("provider_id", providerId).in("day_of_week", [...days]);
  if (del.error) throw failed();
  if (!rows.length) return;
  const ins = await supabase.from("provider_availability").insert(rows.map((r) => ({ ...r, provider_id: providerId })));
  if (ins.error) throw failed();
}
