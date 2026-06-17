import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { syncDueTagEndpoints } from "@/lib/tagEndpointSync";

const SYNC_INTERVAL_MS = 2_000;

export function AutoTagSync() {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function syncTags() {
      if (cancelled || inFlight.current) return;
      inFlight.current = true;
      try {
        const data = await syncDueTagEndpoints();
        const updated = data.results.some((r) => r.ok);

        if (updated && !cancelled) {
          queryClient.invalidateQueries({ queryKey: ["tags-live"] });
          queryClient.invalidateQueries({ queryKey: ["tag_endpoints"] });
        }
      } catch {
        // A tela já exibe o status salvo do endpoint; evita alertas repetidos no ciclo automático.
      } finally {
        inFlight.current = false;
      }
    }

    syncTags();
    const intervalId = window.setInterval(syncTags, SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [queryClient]);

  return null;
}