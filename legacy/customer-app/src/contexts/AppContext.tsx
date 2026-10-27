import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";


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
  const [pincode, setPincodeState] = useState(() => localStorage.getItem("hf_pincode") || "");
  const [upcomingBookingsCount, setUpcomingBookingsCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);

  const setPincode = (pin: string) => {
    setPincodeState(pin);
    localStorage.setItem("hf_pincode", pin);
  };

  const fetchProfile = async () => {
    if (!user) { setProfile(null); return; }
    const { data } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, avatar_url, phone, pincode, address, city")
    .eq("user_id", user.id)
    .single();
    setProfile(data as Profile | null);
  };

  const refetchBookingsCount = async () => {
    if (!user) { setUpcomingBookingsCount(0); return; }
    const today = new Date().toISOString().split("T")[0];
    const { count } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", user.id)
      .in("status", ["pending", "confirmed"])
      .gte("booking_date", today);
    setUpcomingBookingsCount(count || 0);
  };

  const refetchNotificationsCount = async () => {
    if (!user) { setUnreadNotificationsCount(0); return; }
    const { count } = await supabase
      .from("customer_notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setUnreadNotificationsCount(count || 0);
  };

  useEffect(() => { fetchProfile(); }, [user]);
  useEffect(() => { refetchBookingsCount(); }, [user]);
  useEffect(() => { refetchNotificationsCount(); }, [user]);

  // Sync profile pincode → AppContext if user has one saved
  useEffect(() => {
    if (profile?.pincode && !localStorage.getItem("hf_pincode")) {
      setPincode(profile.pincode);
    }
  }, [profile]);

  // Realtime: booking count
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("app-bookings-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `customer_id=eq.${user.id}` },
        () => refetchBookingsCount()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Realtime: notification count
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("app-notif-count")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "customer_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => setUnreadNotificationsCount((prev) => prev + 1)
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "customer_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => refetchNotificationsCount()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return (
    <AppContext.Provider
      value={{
        pincode,
        setPincode,
        upcomingBookingsCount,
        refetchBookingsCount,
        profile,
        refetchProfile: fetchProfile,
        unreadNotificationsCount,
        refetchNotificationsCount,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
