import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadCustomerProfile } from "@/features/auth/api";
import { useSession } from "@/features/auth/session-provider";

type AreaContextValue = { area: string; setArea: (value: string) => void };
const AreaContext = createContext<AreaContextValue | null>(null);

/** The city or pincode the customer is searching in. Starts from their saved profile, then follows what they type. */
export function AreaProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const [area, setAreaState] = useState("");
  const touched = useRef(false);
  const profile = useQuery({
    queryKey: ["customer-profile", userId],
    enabled: !!userId,
    queryFn: () => loadCustomerProfile(userId!),
  });

  useEffect(() => {
    if (touched.current || !profile.data) return;
    const saved = profile.data.pincode || profile.data.city || "";
    if (saved) setAreaState(saved);
  }, [profile.data]);

  const value = useMemo<AreaContextValue>(
    () => ({ area, setArea: (v) => { touched.current = true; setAreaState(v); } }),
    [area],
  );
  return <AreaContext.Provider value={value}>{children}</AreaContext.Provider>;
}

export function useArea(): AreaContextValue {
  const ctx = useContext(AreaContext);
  if (!ctx) throw new Error("useArea must be used inside <AreaProvider>");
  return ctx;
}
