import type { ProviderCard } from "@handyfix/shared";

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
};
