import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { providersQuery, serviceQuery } from "@/lib/queries";
import { prefetchRoute } from "@/lib/routeModules";

/**
 * Returns a function you attach to onPointerEnter / onTouchStart of a service card.
 * By the time the tap lands, the page code AND its data are already loaded.
 */
export const usePrefetchService = () => {
  const queryClient = useQueryClient();
  return useCallback(
    (slug?: string | null) => {
      if (!slug) return;
      prefetchRoute(`/services/${slug}`);
      void queryClient.prefetchQuery(serviceQuery(slug));
      void queryClient.prefetchQuery(providersQuery());
    },
    [queryClient],
  );
};
