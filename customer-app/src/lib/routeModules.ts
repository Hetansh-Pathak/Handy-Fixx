/**
 * Single source of truth for lazy page chunks.
 * App.tsx lazy-loads from these loaders, and the prefetcher calls the very same
 * functions, so a prefetched page is already in the module cache when the user taps.
 */
export const pageLoaders = {
  auth: () => import("@/pages/Auth"),
  authCallback: () => import("@/pages/AuthCallback"),
  forgotPassword: () => import("@/pages/ForgotPassword"),
  resetPassword: () => import("@/pages/ResetPassword"),
  notFound: () => import("@/pages/NotFound"),
  profile: () => import("@/pages/Profile"),
  services: () => import("@/pages/Services"),
  serviceDetail: () => import("@/pages/ServiceDetail"),
  providerDetail: () => import("@/pages/ProviderDetail"),
  booking: () => import("@/pages/Booking"),
  bookingConfirmation: () => import("@/pages/BookingConfirmation"),
  myBookings: () => import("@/pages/MyBookings"),
  about: () => import("@/pages/About"),
  contact: () => import("@/pages/Contact"),
  becomePro: () => import("@/pages/BecomePro"),
  notifications: () => import("@/pages/Notifications"),
  deleteAccount: () => import("@/pages/DeleteAccount"),
  legal: () => import("@/pages/Legal"),
} as const;

const routeToLoader: Array<[RegExp, keyof typeof pageLoaders]> = [
  [/^\/services\/[^/]+/, "serviceDetail"],
  [/^\/services/, "services"],
  [/^\/provider\//, "providerDetail"],
  [/^\/book\//, "booking"],
  [/^\/booking-confirmation/, "bookingConfirmation"],
  [/^\/my-bookings/, "myBookings"],
  [/^\/notifications/, "notifications"],
  [/^\/profile/, "profile"],
  [/^\/auth/, "auth"],
  [/^\/about/, "about"],
  [/^\/contact/, "contact"],
  [/^\/become-a-pro/, "becomePro"],
  [/^\/delete-account/, "deleteAccount"],
  [/^\/(privacy|terms)/, "legal"],
];

const warmed = new Set<string>();

/** Start downloading the chunk for a path. Safe to call repeatedly and never throws. */
export const prefetchRoute = (path: string) => {
  const pathname = path.split("?")[0];
  const hit = routeToLoader.find(([re]) => re.test(pathname));
  if (!hit) return;
  const key = hit[1];
  if (warmed.has(key)) return;
  warmed.add(key);
  pageLoaders[key]().catch(() => warmed.delete(key));
};

/** After first paint, quietly warm the pages people open most. Skipped on data-saver / 2G. */
export const warmCommonRoutes = () => {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return;
  const run = () => ["/services", "/my-bookings", "/notifications", "/profile"].forEach(prefetchRoute);
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (ric) ric(run, { timeout: 4000 });
  else setTimeout(run, 2500);
};
