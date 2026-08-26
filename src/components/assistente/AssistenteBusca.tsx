import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Loader2, Sparkles, Activity, Factory, Table2, Package, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { askAssistente } from "@/lib/assistente/ask.functions";
import { MANAGED_PAGES } from "@/lib/permissions/pages";

type Hit = {
  key: string;
  grupo: "Tags" | "Ordens" | "Tabelas" | "Produtos" | "Páginas";
  titulo: string;
  detalhe?: string | null;
  to?: string;
  icon: typeof Activity;
};

function useDebounced(value: string, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AssistenteBusca() {
  const navigate = useNavigate();
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const q = useDebounced(termo.trim(), 300);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Diálogo com a resposta do assistente
  const [dlgOpen, setDlgOpen] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [loading, setLoading] = useState(false);
  const [resposta, setResposta] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ask = useServerFn(askAssistente);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setAberto(true);
      }
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["assistente_preview", q],
    enabled: q.length >= 2,
    staleTime: 15_000,
    queryFn: async (): Promise<Hit[]> => {
      const like = `%${q}%`;
      const [tags, ordens, sheets, produtos] = await Promise.all([
        supabase
          .from("tags_live")
          .select("nome,nome_amigavel,unidade,valor,valor_num,atualizado_em")
          .or(`nome.ilike.${like},nome_amigavel.ilike.${like}`)
          .limit(6),
        supabase
          .from("ordens_producao")
          .select("id,numero,status,qtd_produzida,qtd_planejada")
          .ilike("numero", like)
          .order("created_at", { ascending: false })
          .limit(4),
        supabase.from("custom_sheets").select("id,nome,descricao").ilike("nome", like).limit(4),
        supabase.from("produtos").select("id,nome,unidade").ilike("nome", like).limit(4),
      ]);

      const out: Hit[] = [];
      for (const t of tags.data ?? []) {
        const val = t.valor_num ?? t.valor;
        out.push({
          key: `tag-${t.nome}`,
          grupo: "Tags",
          titulo: t.nome_amigavel || t.nome,
          detalhe: val != null ? `${val}${t.unidade ? " " + t.unidade : ""}` : "sem valor",
          to: "/tags",
          icon: Activity,
        });
      }
      for (const o of ordens.data ?? []) {
        out.push({
          key: `op-${o.id}`,
          grupo: "Ordens",
          titulo: `OP ${o.numero}`,
          detalhe: `${o.status} · ${o.qtd_produzida ?? 0}/${o.qtd_planejada}`,
          to: o.status === "finalizada" ? `/producao/finalizada/${o.id}` : `/producao/${o.id}`,
          icon: Factory,
        });
      }
      for (const s of sheets.data ?? []) {
        out.push({
          key: `sheet-${s.id}`,
          grupo: "Tabelas",
          titulo: s.nome,
          detalhe: s.descricao,
          to: `/tabelas/${s.id}`,
          icon: Table2,
        });
      }
      for (const p of produtos.data ?? []) {
        out.push({
          key: `prod-${p.id}`,
          grupo: "Produtos",
          titulo: p.nome,
          detalhe: p.unidade,
          to: "/cadastros/produtos",
          icon: Package,
        });
      }
      return out;
    },
  });

  const paginas = useMemo<Hit[]>(() => {
    if (q.length < 2) return [];
    const nq = q.toLowerCase();
    return MANAGED_PAGES.filter((p) => p.label.toLowerCase().includes(nq))
      .slice(0, 3)
      .map((p) => ({
        key: `page-${p.key}`,
        grupo: "Páginas" as const,
        titulo: p.label,
        detalhe: p.pathPrefix,
        to: p.pathPrefix,
        icon: Search,
      }));
  }, [q]);

  const todos = [...paginas, ...hits];
  const grupos = ["Tags", "Ordens", "Tabelas", "Produtos", "Páginas"] as const;

  const perguntar = async (texto: string) => {
    const p = texto.trim();
    if (p.length < 2) return;
    setAberto(false);
    setPergunta(p);
    setDlgOpen(true);
    setLoading(true);
    setErro(null);
    setResposta(null);
    try {
      const r = await ask({ data: { pergunta: p } });
      setResposta(r.resposta);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível consultar agora.");
    } finally {
      setLoading(false);
    }
  };

  const irPara = (to?: string) => {
    if (!to) return;
    setAberto(false);
    setTermo("");
    void navigate({ to });
  };

  return (
    <>
      <div ref={boxRef} className="relative w-40 sm:w-64 md:w-80">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void perguntar(termo);
            }
          }}
          placeholder="Buscar ou perguntar..."
          className="h-9 pl-7 pr-7 text-sm"
          maxLength={500}
        />
        {termo && (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => {
              setTermo("");
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {aberto && termo.trim().length >= 2 && (
          <div className="absolute right-0 top-11 z-50 w-[min(26rem,90vw)] overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            <button
              type="button"
              onClick={() => void perguntar(termo)}
              className="flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                Perguntar ao assistente:{" "}
                <span className="text-muted-foreground">“{termo.trim()}”</span>
              </span>
            </button>

            <div className="max-h-80 overflow-y-auto py-1">
              {isFetching && todos.length === 0 && (
                <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...
                </p>
              )}
              {!isFetching && todos.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Nada encontrado. Pressione Enter para perguntar ao assistente.
                </p>
              )}
              {grupos.map((g) => {
                const itens = todos.filter((h) => h.grupo === g);
                if (itens.length === 0) return null;
                return (
                  <div key={g} className="py-1">
                    <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {g}
                    </p>
                    {itens.map((h) => (
                      <button
                        key={h.key}
                        type="button"
                        onClick={() => irPara(h.to)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        <h.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{h.titulo}</span>
                        {h.detalhe && (
                          <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                            {h.detalhe}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Assistente
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="mb-2 text-xs text-muted-foreground">“{pergunta}”</p>
            {loading && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Consultando o sistema...
              </p>
            )}
            {erro && <p className="text-destructive">{erro}</p>}
            {resposta && <p className="whitespace-pre-wrap leading-relaxed">{resposta}</p>}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setDlgOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
