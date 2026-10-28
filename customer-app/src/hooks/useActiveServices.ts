import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createRequestTimeoutSignal } from "@/lib/requestTimeout";

export type ActiveService = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_name: string | null;
  base_price: number | null;
  duration_minutes: number | null;
  category: string | null;
};

export const ACTIVE_SERVICES_QUERY_KEY = ["active-services"] as const;

export const useActiveServices = () =>
  useQuery({
    queryKey: ACTIVE_SERVICES_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const request = createRequestTimeoutSignal(signal);
      try {
        const { data, error } = await supabase
          .from("services")
          .select("id, name, slug, description, icon_name, base_price, duration_minutes, category")
          .eq("is_active", true)
          .abortSignal(request.signal);
        if (error) throw error;
        return (data ?? []) as ActiveService[];
      } finally {
        request.clear();
      }
    },
  });
