import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * The actual endpoint polling now happens server-side via pg_net + pg_cron
 * (every 2 seconds). This component just refreshes the cached queries so
 * the UI reflects the latest values.
 */
const REFRESH_INTERVAL_MS = 2_000;

export function AutoTagSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["tags-live"] });
      queryClient.invalidateQueries({ queryKey: ["tag_endpoints"] });
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [queryClient]);

  return null;
}
