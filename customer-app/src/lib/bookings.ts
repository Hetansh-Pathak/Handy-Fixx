/** Shared booking vocabulary for the list, cards and notifications. One status model, one colour language. */

/** Gold = waiting on someone. Ink = active. Green = confirmed or done. Red = cancelled. */
export type Tone = "gold" | "ink" | "green" | "red" | "neutral";

export const TONE_TILE: Record<Tone, string> = {
  gold: "bg-gold text-gold-foreground",
  ink: "bg-primary text-primary-foreground",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  neutral: "bg-secondary text-muted-foreground",
};

export const TONE_CHIP: Record<Tone, string> = {
  gold: "bg-gold/20 text-amber-900",
  ink: "bg-primary text-primary-foreground",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  neutral: "bg-secondary text-muted-foreground",
};

export const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for pro", tone: "gold" },
  confirmed: { label: "Confirmed", tone: "green" },
  on_the_way: { label: "On the way", tone: "ink" },
  in_progress: { label: "In progress", tone: "ink" },
  completed: { label: "Completed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export const statusMeta = (status: string) => STATUS_META[status] ?? STATUS_META.pending;

export const UPCOMING_STATUSES = ["pending", "confirmed", "on_the_way", "in_progress"];
export const CANCELLABLE_STATUSES = ["pending", "confirmed"];
export const CHATTABLE_STATUSES = ["confirmed", "on_the_way", "in_progress"];

export type BookingRow = {
  id: string;
  status: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  booking_date?: string | null;
  booking_time?: string | null;
  address?: string | null;
  city?: string | null;
  total_amount?: number | null;
  payment_status?: string | null;
  created_at: string;
  provider_id?: string | null;
  provider_eta_minutes?: number | null;
  services?: { name?: string | null; slug?: string | null } | null;
  service_providers?: { full_name?: string | null; name?: string | null } | null;
};

export type BookingItem = {
  id: string;
  status: string;
  serviceName: string;
  serviceSlug: string | null;
  providerId: string | null;
  providerName: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  place: string;
  totalAmount: number | null;
  /** 'paid' | 'unpaid' | 'refunded' | null (null on rows that pre-date online payment). */
  paymentStatus: string | null;
  createdAt: string;
  etaMinutes: number | null;
  /** Rating the customer already gave, or null if they haven't reviewed yet. */
  rating: number | null;
};

export const toBookingItem = (row: BookingRow, ratings: Map<string, number>): BookingItem => ({
  id: row.id,
  status: row.status ?? "pending",
  serviceName: row.services?.name ?? "Home service",
  serviceSlug: row.services?.slug ?? null,
  providerId: row.provider_id ?? null,
  providerName: row.service_providers?.full_name ?? row.service_providers?.name ?? "Your pro",
  scheduledDate: row.scheduled_date ?? row.booking_date ?? null,
  scheduledTime: row.scheduled_time ?? row.booking_time ?? null,
  place: [row.address, row.city].filter(Boolean).join(", "),
  totalAmount: row.total_amount ?? null,
  paymentStatus: row.payment_status ?? null,
  createdAt: row.created_at,
  etaMinutes: row.provider_eta_minutes ?? null,
  rating: ratings.get(row.id) ?? null,
});

const sortKey = (i: BookingItem) => (i.scheduledDate ? `${i.scheduledDate}T${i.scheduledTime ?? "00:00"}` : i.createdAt);
// Jobs happening right now come first, then waiting/confirmed ones by how soon they are.
const rank = (status: string) => (status === "in_progress" || status === "on_the_way" ? 0 : 1);

export type TabKey = "upcoming" | "completed" | "cancelled";

export const groupBookings = (items: BookingItem[]): Record<TabKey, BookingItem[]> => {
  const upcoming = items
    .filter((i) => UPCOMING_STATUSES.includes(i.status))
    .sort((a, b) => rank(a.status) - rank(b.status) || sortKey(a).localeCompare(sortKey(b)));
  const newestFirst = (a: BookingItem, b: BookingItem) => sortKey(b).localeCompare(sortKey(a));
  return {
    upcoming,
    completed: items.filter((i) => i.status === "completed").sort(newestFirst),
    cancelled: items.filter((i) => i.status === "cancelled").sort(newestFirst),
  };
};

/** Open on whatever the customer most likely wants: upcoming jobs, otherwise their history. */
export const defaultTab = (g: Record<TabKey, BookingItem[]>): TabKey =>
  g.upcoming.length > 0 ? "upcoming" : g.completed.length > 0 ? "completed" : g.cancelled.length > 0 ? "cancelled" : "upcoming";

/** Applies a live row update (from realtime) to the list without refetching. */
export const mergeRealtime = (items: BookingItem[], row: Partial<BookingRow> & { id: string }): BookingItem[] =>
  items.map((i) =>
    i.id !== row.id
      ? i
      : {
          ...i,
          status: row.status ?? i.status,
          etaMinutes: row.provider_eta_minutes === undefined ? i.etaMinutes : row.provider_eta_minutes,
          scheduledDate: row.scheduled_date ?? row.booking_date ?? i.scheduledDate,
          scheduledTime: row.scheduled_time ?? row.booking_time ?? i.scheduledTime,
        },
  );

/** Text for the live strip on active cards, or null when there's nothing live to say. */
export const liveLine = (i: Pick<BookingItem, "status" | "etaMinutes">): string | null => {
  if (i.status === "pending") return "Waiting for the pro to accept";
  if (i.status === "on_the_way") {
    if (i.etaMinutes === 0) return "Your pro has arrived";
    return i.etaMinutes ? `Arriving in about ${i.etaMinutes} min` : "Your pro is on the way";
  }
  if (i.status === "in_progress") return "Work in progress";
  return null;
};
