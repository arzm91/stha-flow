import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { syncAllTagEndpoints } from "@/lib/tagEndpointSync";

/**
 * Mantém as tags "ao vivo":
 * - A cada 2 segundos chama o endpoint do servidor que consulta todos os
 *   endpoints HTTP cadastrados em `tag_endpoints` (respeitando o intervalo
 *   configurado em cada um) e grava os valores em `tags_live`.
 * - Em seguida invalida as queries de UI para refletir os novos valores.
 *
 * Falhas individuais são silenciadas para não poluir a tela com toasts —
 * o status de cada endpoint fica visível na página "Endpoints HTTP".
 */
const POLL_INTERVAL_MS = 2_000;

export function AutoTagSync() {
  const queryClient = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (running.current) return;
      running.current = true;
      try {
        await syncAllTagEndpoints();
      } catch {
        // silencioso — a UI mostra o status por endpoint
      } finally {
        running.current = false;
        if (!cancelled) {
          queryClient.invalidateQueries({ queryKey: ["tags-live"] });
          queryClient.invalidateQueries({ queryKey: ["tag_endpoints"] });
        }
      }
    }

    // Dispara imediatamente e depois a cada 2s
    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [queryClient]);

  return null;
}
