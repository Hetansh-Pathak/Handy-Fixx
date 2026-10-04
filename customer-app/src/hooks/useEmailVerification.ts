import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Reads the server-side verdict (public.is_customer_email_verified).
 * The same function backs the RLS rule on bookings, so UI and database always agree.
 */
export const useEmailVerification = () => {
  const { user } = useAuth();
  const [verified, setVerified] = useState<boolean | null>(null); // null = still checking

  const refresh = useCallback(async () => {
    if (!user) { setVerified(null); return; }
    const { data, error } = await supabase.rpc("is_customer_email_verified");
    setVerified(error ? false : Boolean(data));
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { verified, refresh };
};
