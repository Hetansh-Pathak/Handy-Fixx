import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { PersistQueryClientProviderProps } from "@tanstack/react-query-persist-client";

/**
 * One shared client for the whole app.
 *
 * - staleTime: data younger than this renders instantly with no refetch.
 * - gcTime: unused data stays in memory for a day so going back is instant.
 * - Only queries tagged `meta: { persist: true }` are written to disk. Those are
 *   public catalogue data (services, sub-items). Bookings, profile, notifications
 *   and anything user-specific are NEVER persisted to localStorage.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

const ONE_DAY = 1000 * 60 * 60 * 24;

// Bump this string to invalidate every user's persisted cache after a schema change.
export const CACHE_BUSTER = "hf-customer-cache-v1";

const persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: "hf-rq-cache",
  throttleTime: 1000,
});

export const persistOptions: PersistQueryClientProviderProps["persistOptions"] = {
  persister,
  maxAge: ONE_DAY,
  buster: CACHE_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === "success" && query.meta?.persist === true,
  },
};

/** Wipe everything (memory + disk). Call on sign-out so the next user never sees old data. */
export const clearAllCaches = () => {
  queryClient.clear();
  try {
    window.localStorage.removeItem("hf-rq-cache");
  } catch {
    /* storage unavailable — nothing to clear */
  }
};
