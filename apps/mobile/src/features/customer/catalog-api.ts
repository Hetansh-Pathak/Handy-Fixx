import { isProviderAvailable, offersService, resolveListedPrice, servesArea } from "@handyfix/shared";
import { getSupabase } from "@/lib/supabase";
import type { ProviderListing, ServiceRow, SubItemRow } from "./types";

const SERVICE_COLUMNS = "id, name, slug, description, icon_name, base_price, duration_minutes, category";

function fail(error: { message: string }): never {
  throw new Error(error.message);
}

export async function fetchServices(): Promise<ServiceRow[]> {
  const { data, error } = await getSupabase().from("services").select(SERVICE_COLUMNS).eq("is_active", true).order("name");
  if (error) fail(error);
  return (data ?? []) as ServiceRow[];
}

export async function fetchServiceBySlug(slug: string): Promise<ServiceRow | null> {
  const { data, error } = await getSupabase().from("services").select(SERVICE_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) fail(error);
  return (data as ServiceRow | null) ?? null;
}

/** Sub-items ("Tap repair", "Pipe leak") with catalogue prices. The table is optional: no table means no sub-items. */
const SUB_ITEM_COLUMNS = "id, service_id, name, description, icon, base_price, duration_minutes";

export async function fetchSubItems(serviceId: string): Promise<SubItemRow[]> {
  const query = (columns: string) =>
    getSupabase().from("service_sub_items").select(columns).eq("service_id", serviceId).eq("is_active", true).order("sort_order");
  let { data, error } = await query(`${SUB_ITEM_COLUMNS}, section`);
  // The section column comes with proposal 20261106000000; until then read without it (one flat list).
  if (error && (error.code === "42703" || /section/i.test(error.message))) ({ data, error } = await query(SUB_ITEM_COLUMNS));
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    fail(error);
  }
  return ((data ?? []) as unknown as SubItemRow[]).filter((s) => Number(s.base_price) > 0).map((s) => ({ ...s, base_price: Number(s.base_price) }));
}

type ProviderViewRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  rating: number | null;
  total_reviews: number | null;
  total_jobs: number | null;
  experience_years: number | null;
  pincodes: string[] | null;
  service_ids: string[] | null;
  is_online: boolean | null;
  is_verified: boolean | null;
  is_email_verified: boolean | null;
  city: string | null;
  updated_at: string | null;
};

const PROVIDER_COLUMNS =
  "id, full_name, avatar_url, bio, rating, total_reviews, total_jobs, experience_years, pincodes, service_ids, is_online, is_verified, is_email_verified, city, updated_at";

/**
 * Pros who are online right now, offer this service and cover the customer's area, each with the price
 * the customer would pay. Customers read the `public_providers` view (never the table): it only exposes
 * approved, active pros and none of their contact or KYC data.
 */
export async function fetchProviderListings(args: ProviderSearchArgs): Promise<ProviderListing[]> {
  return (await searchProviders(args)).listings;
}

type ProviderSearchArgs = { service: ServiceRow; subItem: SubItemRow | null; area: string; now: Date };

/**
 * Same as fetchProviderListings, plus how many approved pros offer this service in this area but are
 * offline right now, so an empty list can say "pros are offline" instead of "nobody works here".
 */
export async function searchProviders(args: ProviderSearchArgs): Promise<{ listings: ProviderListing[]; offlineCount: number }> {
  const supabase = getSupabase();
  const [providers, rates] = await Promise.all([
    supabase.from("public_providers").select(PROVIDER_COLUMNS),
    supabase.from("provider_services").select("provider_id, custom_price").eq("service_id", args.service.id),
  ]);
  if (providers.error) fail(providers.error);
  if (rates.error) fail(rates.error);

  const customPrice = new Map<string, number>();
  for (const r of (rates.data ?? []) as { provider_id: string | null; custom_price: number | null }[]) {
    if (r.provider_id && r.custom_price != null) customPrice.set(r.provider_id, Number(r.custom_price));
  }

  const listings: ProviderListing[] = [];
  let offlineCount = 0;
  for (const p of (providers.data ?? []) as ProviderViewRow[]) {
    if (!offersService(p.service_ids, args.service.id)) continue;
    if (!servesArea(p.pincodes, args.area)) continue;
    if (!isProviderAvailable({ isOnline: p.is_online, updatedAt: p.updated_at }, args.now)) {
      offlineCount += 1;
      continue;
    }
    const price = resolveListedPrice({
      subItemPrice: args.subItem?.base_price,
      customPrice: customPrice.get(p.id),
      basePrice: args.service.base_price,
    });
    if (price === null) continue; // never show a card with no price
    listings.push({
      id: p.id,
      fullName: p.full_name?.trim() || "HandyFix Pro",
      avatarUrl: p.avatar_url,
      bio: p.bio,
      experienceYears: p.experience_years,
      totalReviews: p.total_reviews ?? 0,
      totalJobs: p.total_jobs ?? 0,
      isVerified: !!(p.is_verified || p.is_email_verified),
      price,
      rating: p.rating,
      distanceKm: null,
      avgResponseSeconds: null,
      isOnline: true,
      kycApproved: true,
      city: p.city,
      pincodes: p.pincodes,
    });
  }
  return { listings, offlineCount };
}

export type BookingContext = {
  service: ServiceRow;
  subItem: SubItemRow | null;
  provider: ProviderListing;
};

/** Everything the booking screens need for one pro, re-read from the database (never trusted from the URL). */
export async function fetchBookingContext(args: {
  serviceSlug: string;
  providerId: string;
  subItemId: string | null;
}): Promise<BookingContext> {
  const service = await fetchServiceBySlug(args.serviceSlug);
  if (!service) throw new Error("This service is no longer available.");
  const subItem = args.subItemId ? ((await fetchSubItems(service.id)).find((s) => s.id === args.subItemId) ?? null) : null;
  if (args.subItemId && !subItem) throw new Error("That option is no longer available.");

  const listings = await fetchProviderListings({ service, subItem, area: "", now: new Date() });
  const provider = listings.find((l) => l.id === args.providerId);
  if (!provider) throw new Error("This pro is not available right now. Pick another pro.");
  return { service, subItem, provider };
}
