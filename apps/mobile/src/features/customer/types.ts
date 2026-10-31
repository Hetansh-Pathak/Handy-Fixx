import type { LatLng, ProviderCard } from "@handyfix/shared";

export type ServiceRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_name: string | null;
  base_price: number | null;
  duration_minutes: number | null;
  category: string | null;
};

export type SubItemRow = {
  id: string;
  service_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  base_price: number;
  duration_minutes: number | null;
  /** Section inside the service ("Fan", "Toilet" …); null until the sections proposal is applied. */
  section?: string | null;
  /** Admin band a pro's own rate for this job must sit in (both null = no own rates). */
  price_min?: number | string | null;
  price_max?: number | string | null;
};

/** A pro as shown in the list: the shared ranking shape plus what the card displays. */
export type ProviderListing = ProviderCard & {
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
  experienceYears: number | null;
  totalReviews: number;
  totalJobs: number;
  isVerified: boolean;
  /** The pro's area rounded to about 1 km. Null until the pro shares it (needs the location proposal). */
  point: LatLng | null;
  /** One job at a time: the pro is on a job right now (proposal 20261126000000; absent until it is applied). */
  busyNow?: boolean;
};
