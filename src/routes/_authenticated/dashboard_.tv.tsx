import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";
import { resolveDashboardPeriod } from "@/lib/dashboard/period";
import { Button } from "@/components/ui/button";
import { Maximize2, WifiOff, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard_/tv")({
  validateSearch: zodValidator(z.object({ painel: z.string().optional() })),
  head: () => ({
    meta: [
      { title: "Modo TV — Dashboard STHApc" },
      { name: "description", content: "Painéis do dashboard em tela cheia para TV, com rotação automática." },
      { property: "og:title", content: "Modo TV — Dashboard STHApc" },
      { property: "og:description", content: "Painéis do dashboard em tela cheia para TV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TvPage,
});

type Widget = { id: string; titulo: string; tipo: string; fonte: string; config: Record<string, unknown>; layout: { x: number; y: number; w: number; h: number }; dashboard_id: string | null };

function TvPage() {
  const search = Route.useSearch();
  const [now, setNow] = useState(() => new Date());
  const [idx, setIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const t = setInterval(() => { setNow(new Date()); setTick((x) => x + 1); }, 1000);
    const on = () => setOnline(true), off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Mantém a tela acesa quando o navegador permite
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try { lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { /* ignore */ }
    };
    void req();
    const vis = () => { if (document.visibilityState === "visible") void req(); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); void lock?.release().catch(() => {}); };
  }, []);

  const data = useQuery({
    queryKey: ["tv-dashboards"],
    refetchInterval: 60000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { paineis: [], widgets: [] as Widget[] };
      const [p, w] = await Promise.all([
        supabase.from("dashboards").select("id,nome,ordem,tv_incluir,tv_rotacao_seg").eq("user_id", u.user.id).order("ordem").order("created_at"),
        supabase.from("dashboard_widgets").select("id,titulo,tipo,fonte,config,layout,dashboard_id").eq("user_id", u.user.id),
      ]);
      if (p.error) throw p.error;
      if (w.error) throw w.error;
      return { paineis: p.data ?? [], widgets: (w.data ?? []) as unknown as Widget[] };
    },
  });

  // Batida de "dado atualizado": último sinal recebido das tags
  const pulse = useQuery({
    queryKey: ["tv-pulse"],
    refetchInterval: 10000,
    retry: false,
    queryFn: async () => {
      const { error } = await supabase.from("tags_live").select("nome").limit(1);
      if (error) throw error;
      return Date.now();
    },
  });

  const paineis = data.data?.paineis ?? [];
  const principal = paineis[0]?.id;
  const rotacao = useMemo(() => {
    const inc = paineis.filter((p) => p.tv_incluir);
    const list = inc.length ? inc : paineis.slice(0, 1);
    const start = list.findIndex((p) => p.id === search.painel);
    return start > 0 ? [...list.slice(start), ...list.slice(0, start)] : list;
  }, [paineis, search.painel]);
  const atual = rotacao[idx % Math.max(1, rotacao.length)];
  const segs = Math.max(10, atual?.tv_rotacao_seg ?? 30);

  useEffect(() => { setTick(0); }, [idx]);
  useEffect(() => {
    if (rotacao.length > 1 && tick >= segs) setIdx((i) => (i + 1) % rotacao.length);
  }, [tick, segs, rotacao.length]);

  const widgets = compact((data.data?.widgets ?? []).filter((w) => atual && (w.dashboard_id ?? principal) === atual.id));
  const rows = Math.max(1, ...widgets.map((w) => w.layout.y + w.layout.h));
  const period = useMemo(() => resolveDashboardPeriod("today"), [Math.floor(now.getTime() / 60000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const atrasoSeg = pulse.dataUpdatedAt ? Math.round((now.getTime() - pulse.dataUpdatedAt) / 1000) : null;
  const atrasado = !online || pulse.isError || (atrasoSeg !== null && atrasoSeg > 60);

  return (
    <div className="dark fixed inset-0 z-[100] flex flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-2">
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold">{atual?.nome ?? "Dashboard"}</span>
          {rotacao.length > 1 && <span className="text-sm text-muted-foreground">{(idx % rotacao.length) + 1}/{rotacao.length}</span>}
        </div>
        <div className="flex items-center gap-6">
          <span className={`text-base ${atrasado ? "text-destructive font-bold" : "text-muted-foreground"}`}>
            {atrasado ? "SEM ATUALIZAÇÃO" : `dados atualizados há ${atrasoSeg ?? 0}s`}
          </span>
          <span className="text-3xl font-semibold tabular-nums">{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="text-base text-muted-foreground capitalize">{now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
          <div className="flex gap-1 opacity-30 hover:opacity-100 transition-opacity">
            <Button size="icon" variant="ghost" aria-label="Tela cheia" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}><Maximize2 className="h-5 w-5" /></Button>
            <Button size="icon" variant="ghost" aria-label="Sair do modo TV" asChild><Link to="/dashboard"><X className="h-5 w-5" /></Link></Button>
          </div>
        </div>
      </header>
      {rotacao.length > 1 && (
        <div className="h-1 bg-muted"><div className="h-full bg-primary transition-all duration-1000 ease-linear" style={{ width: `${Math.min(100, (tick / segs) * 100)}%` }} /></div>
      )}
      {atrasado && (
        <div className="flex items-center justify-center gap-3 bg-destructive py-3 text-2xl font-bold text-destructive-foreground animate-pulse">
          <WifiOff className="h-7 w-7" />Conexão perdida — os valores podem estar desatualizados
        </div>
      )}
      <main className="flex-1 overflow-hidden p-4">
        {widgets.length === 0 ? (
          <div className="grid h-full place-items-center text-2xl text-muted-foreground">{data.isLoading ? "Carregando…" : "Este painel não tem cards"}</div>
        ) : (
          <div className="grid h-full gap-4" style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
            {widgets.map((w) => (
              <div key={w.id} className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card"
                style={{ gridColumn: `${w.layout.x + 1} / span ${w.layout.w}`, gridRow: `${w.layout.y + 1} / span ${w.layout.h}` }}>
                <div className="truncate border-b px-4 py-1.5 text-lg font-semibold">{w.titulo}</div>
                <div className="min-h-0 flex-1 text-lg"><DashboardWidget widget={w} period={period} filters={{}} /></div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// Compactação vertical simples (mesma ideia da grade do dashboard) para a TV.
function compact(list: Widget[]): Widget[] {
  const placed: Widget[] = [];
  const sorted = [...list].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
  for (const w of sorted) {
    const x = Math.max(0, Math.min(11, w.layout.x));
    const ww = Math.max(1, Math.min(12 - x, w.layout.w));
    const h = Math.max(1, w.layout.h);
    let y = 0;
    const hit = (yy: number) => placed.some((p) => x < p.layout.x + p.layout.w && x + ww > p.layout.x && yy < p.layout.y + p.layout.h && yy + h > p.layout.y);
    while (hit(y)) y++;
    placed.push({ ...w, layout: { x, y, w: ww, h } });
  }
  return placed;
}
