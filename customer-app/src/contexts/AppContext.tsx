import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { qk } from "@/lib/queries";


interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  pincode: string | null;
  address: string | null;
  city: string | null;
}

interface AppContextType {
  pincode: string;
  setPincode: (pin: string) => void;
  upcomingBookingsCount: number;
  refetchBookingsCount: () => void;
  profile: Profile | null;
  refetchProfile: () => void;
  unreadNotificationsCount: number;
  refetchNotificationsCount: () => void;
}

const AppContext = createContext<AppContextType>({
  pincode: "",
  setPincode: () => {},
  upcomingBookingsCount: 0,
  refetchBookingsCount: () => {},
  profile: null,
  refetchProfile: () => {},
  unreadNotificationsCount: 0,
  refetchNotificationsCount: () => {},
});

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const [pincode, setPincodeState] = useState(() => localStorage.getItem("hf_pincode") || "");

  const setPincode = useCallback((pin: string) => {
    setPincodeState(pin);
    localStorage.setItem("hf_pincode", pin);
  }, []);

  // Everything below is cached in memory by react-query (never written to disk), so the navbar,
  // tab-bar badges and avatar paint instantly on every page instead of refetching per navigation.
  const { data: profile = null } = useQuery({
    queryKey: qk.profile(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, avatar_url, phone, pincode, address, city")
        .eq("user_id", userId as string)
        .maybeSingle();
      return (data as Profile | null) ?? null;
    },
  });

  const { data: upcomingBookingsCount = 0 } = useQuery({
    queryKey: qk.bookingCount(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: 1000 * 30,
    queryFn: async () => {
      // Local calendar date: toISOString() is UTC, which is yesterday for Indian users before 5:30 AM. Jobs that
      // are already on the way or in progress are still upcoming/active for the customer.
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const { count } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("customer_id", userId as string)
        .in("status", ["pending", "confirmed", "on_the_way", "in_progress"])
        .gte("booking_date", today);
      return count || 0;
    },
  });

  const { data: unreadNotificationsCount = 0 } = useQuery({
    queryKey: qk.notifCount(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { count } = await supabase
        .from("customer_notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId as string)
        .eq("is_read", false);
      return count || 0;
    },
  });

  const refetchProfile = useCallback(() => {
    if (userId) void queryClient.invalidateQueries({ queryKey: qk.profile(userId) });
  }, [queryClient, userId]);
  const refetchBookingsCount = useCallback(() => {
    if (userId) void queryClient.invalidateQueries({ queryKey: qk.bookingCount(userId) });
  }, [queryClient, userId]);
  const refetchNotificationsCount = useCallback(() => {
    if (userId) void queryClient.invalidateQueries({ queryKey: qk.notifCount(userId) });
  }, [queryClient, userId]);

  // Sync profile pincode → AppContext if user has one saved
  useEffect(() => {
    if (profile?.pincode && !localStorage.getItem("hf_pincode")) {
      setPincode(profile.pincode);
    }
  }, [profile, setPincode]);

  // Realtime: one channel for bookings + notifications; each event just refreshes the cached count.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("app-realtime-counts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `customer_id=eq.${userId}` },
        () => void queryClient.invalidateQueries({ queryKey: qk.bookingCount(userId) }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "customer_notifications", filter: `user_id=eq.${userId}` },
        () => queryClient.setQueryData<number>(qk.notifCount(userId), (prev) => (prev ?? 0) + 1),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "customer_notifications", filter: `user_id=eq.${userId}` },
        () => void queryClient.invalidateQueries({ queryKey: qk.notifCount(userId) }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const value = useMemo(
    () => ({
      pincode,
      setPincode,
      upcomingBookingsCount,
      refetchBookingsCount,
      profile,
      refetchProfile,
      unreadNotificationsCount,
      refetchNotificationsCount,
    }),
    [pincode, setPincode, upcomingBookingsCount, refetchBookingsCount, profile, refetchProfile, unreadNotificationsCount, refetchNotificationsCount],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
