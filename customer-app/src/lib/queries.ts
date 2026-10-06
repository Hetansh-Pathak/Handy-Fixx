import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ── Types shared by catalogue pages ─────────────────────────────────────── */

export type ServiceInfo = {
  id: string;
  name: string;
  description: string | null;
  base_price: number | null;
  duration_minutes: number | null;
  slug: string | null;
};

export type ProviderRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  experience_years: number | null;
  rating: number | null;
  total_reviews: number | null;
  total_jobs: number | null;
  is_verified: boolean | null;
  is_email_verified: boolean | null;
  is_online: boolean | null;
  is_available: boolean | null;
  pincodes: string[] | null;
  service_ids: string[] | null;
  updated_at?: string | null;
  name?: string | null;
};

/* ── Query keys ──────────────────────────────────────────────────────────── */

export const qk = {
  services: ["services"] as const,
  service: (slug: string) => ["service", slug] as const,
  subItems: (serviceId: string) => ["service-sub-items", serviceId] as const,
  providers: ["public-providers"] as const,
  provider: (id: string) => ["provider", id] as const,
  profile: (userId: string) => ["profile", userId] as const,
  bookingCount: (userId: string) => ["booking-count", userId] as const,
  notifCount: (userId: string) => ["notif-count", userId] as const,
};

const TEN_MIN = 1000 * 60 * 10;

/* ── Catalogue (public, safe to persist) ─────────────────────────────────── */

export const servicesQuery = () =>
  queryOptions({
    queryKey: qk.services,
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: TEN_MIN,
    meta: { persist: true },
  });

export const serviceQuery = (slug: string) =>
  queryOptions({
    queryKey: qk.service(slug),
    queryFn: async (): Promise<ServiceInfo> => {
      if (!slug || slug === "undefined" || slug === "null") {
        throw new Error("Invalid service URL. Please go back and select a service.");
      }
      const cols = "id, name, description, base_price, duration_minutes, slug";
      const { data: bySlug } = await supabase.from("services").select(cols).eq("slug", slug).maybeSingle();
      if (bySlug) return bySlug;
      const { data: byId } = await supabase.from("services").select(cols).eq("id", slug).maybeSingle();
      if (byId) return byId;
      throw new Error("Service not found. Please go back and choose a service.");
    },
    staleTime: TEN_MIN,
    retry: false,
    meta: { persist: true },
  });

export const subItemsQuery = (serviceId: string | undefined) =>
  queryOptions({
    queryKey: qk.subItems(serviceId ?? ""),
    enabled: Boolean(serviceId),
    queryFn: async (): Promise<Record<string, unknown>[]> => {
      // `service_sub_items` is not in the generated types yet, so go through a loose client.
      const loose = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string | boolean) => {
              eq: (c: string, v: string | boolean) => {
                order: (c: string) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
              };
            };
          };
        };
      };
      const { data, error } = await loose
        .from("service_sub_items")
        .select("*")
        .eq("service_id", serviceId as string)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: TEN_MIN,
    meta: { persist: true },
  });

/* ── Live data (never persisted: online status goes stale in seconds) ────── */

export const providersQuery = () =>
  queryOptions({
    queryKey: qk.providers,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_providers")
        .select("*")
        .order("rating", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProviderRow[];
    },
    staleTime: 10_000,
    // Poll quietly while the tab is visible; react-query pauses this in the background.
    refetchInterval: 15_000,
  });

export const providerDetailQuery = (providerId: string) =>
  queryOptions({
    queryKey: qk.provider(providerId),
    queryFn: async () => {
      const [{ data: provider }, { data: services }, { data: reviews }] = await Promise.all([
        supabase
          .from("public_providers")
          .select(
            "id, name, full_name, avatar_url, bio, rating, total_reviews, total_jobs, experience_years, is_verified, is_email_verified, city",
          )
          .eq("id", providerId)
          .single(),
        supabase
          .from("provider_services")
          .select("custom_price, services(name, slug, icon_name, base_price)")
          .eq("provider_id", providerId),
        supabase
          .from("reviews")
          .select("id, rating, comment, created_at")
          .eq("provider_id", providerId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      return { provider, services: services ?? [], reviews: reviews ?? [] };
    },
    staleTime: 60_000,
  });
