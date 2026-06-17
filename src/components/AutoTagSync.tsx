import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

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
        const res = await fetch("/api/public/tags/poll?force=1", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        const updated = Array.isArray(data?.results) && data.results.some((r: any) => r?.ok);

        if (res.ok && updated && !cancelled) {
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