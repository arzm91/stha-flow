import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import {
  Clock, Trash2, Filter, ImagePlus, X, User as UserIcon,
} from "lucide-react";
import { usePagePermissions } from "@/hooks/usePagePermissions";

export const Route = createFileRoute("/_authenticated/turnos")({
  component: TurnosPage,
});

const BUCKET = "turno-eventos";

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type EventoRow = {
  id: string;
  ocorrido_em: string;
  descricao: string | null;
  responsavel: string | null;
  imagens: string[] | null;
};

function TurnosPage() {
  const qc = useQueryClient();
  const { canEdit } = usePagePermissions();
  const editable = canEdit("turnos");

  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [ocorridoEm, setOcorridoEm] = useState(() => toLocalInput(new Date()));
  const [imagens, setImagens] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Filtros
  const today = new Date();
  const sevenAgo = new Date();
  sevenAgo.setDate(today.getDate() - 7);
  const [dataInicio, setDataInicio] = useState(toDateInput(sevenAgo));
  const [dataFim, setDataFim] = useState(toDateInput(today));
  const [busca, setBusca] = useState("");

  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ["turnos_eventos", dataInicio, dataFim],
    queryFn: async () => {
      let q = supabase
        .from("relatorio_turno_eventos")
        .select("id, ocorrido_em, descricao, responsavel, imagens")
        .order("ocorrido_em", { ascending: false });
      if (dataInicio) q = q.gte("ocorrido_em", new Date(`${dataInicio}T00:00:00`).toISOString());
      if (dataFim) q = q.lte("ocorrido_em", new Date(`${dataFim}T23:59:59`).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EventoRow[];
    },
  });

  const eventosFiltrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    if (!term) return eventos;
    return eventos.filter((e) =>
      (e.descricao ?? "").toLowerCase().includes(term) ||
      (e.responsavel ?? "").toLowerCase().includes(term),
    );
  }, [eventos, busca]);

  // Signed URLs for image previews
  const allPaths = useMemo(() => {
    const s = new Set<string>();
    for (const e of eventos) for (const p of e.imagens ?? []) if (p) s.add(p);
    return Array.from(s);
  }, [eventos]);

  const signedQ = useQuery({
    queryKey: ["turno_eventos_signed", allPaths.join("|")],
    enabled: allPaths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(allPaths, 60 * 60);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      return map;
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      if (!descricao.trim()) throw new Error("Descreva o ocorrido");
      const ts = new Date(ocorridoEm);
      if (isNaN(ts.getTime())) throw new Error("Data/hora inválida");

      // Resolve effective owner (tenant) for storage path scoping
      const { data: ownerData, error: ownerErr } = await supabase.rpc("effective_owner", { _user: u.user.id });
      if (ownerErr) throw ownerErr;
      const ownerId = (ownerData as string | null) ?? u.user.id;

      // Upload de imagens
      setUploading(true);
      const paths: string[] = [];
      try {
        for (const file of imagens) {
          const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
          const path = `${ownerId}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
            contentType: file.type || undefined,
            upsert: false,
          });
          if (upErr) throw upErr;
          paths.push(path);
        }
      } finally {
        setUploading(false);
      }

      const { error } = await supabase.from("relatorio_turno_eventos").insert({
        owner_id: u.user.id,
        created_by: u.user.id,
        ocorrido_em: ts.toISOString(),
        categoria: "geral",
        titulo: descricao.trim().slice(0, 80),
        descricao: descricao.trim(),
        responsavel: responsavel.trim() || null,
        imagens: paths,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento registrado");
      setDescricao("");
      setResponsavel("");
      setOcorridoEm(toLocalInput(new Date()));
      setImagens([]);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["turnos_eventos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (ev: EventoRow) => {
      const { guardAdmin } = await import("@/lib/security/guard-admin");
      await guardAdmin("excluir este evento de turno");
      if (ev.imagens && ev.imagens.length > 0) {
        await supabase.storage.from(BUCKET).remove(ev.imagens);
      }
      const { error } = await supabase.from("relatorio_turno_eventos").delete().eq("id", ev.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento removido");
      qc.invalidateQueries({ queryKey: ["turnos_eventos"] });
    },
    onError: async (e: Error) => {
      const { isAdminCancelled } = await import("@/lib/security/guard-admin");
      if (!isAdminCancelled(e)) toast.error(e.message);
    },
  });

  const grupos = useMemo(() => {
    const map = new Map<string, EventoRow[]>();
    for (const ev of eventosFiltrados) {
      const d = new Date(ev.ocorrido_em);
      const key = d.toLocaleDateString("pt-BR", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric",
      });
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [eventosFiltrados]);

  const setRangeShortcut = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setDataInicio(toDateInput(start));
    setDataFim(toDateInput(end));
  };

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setImagens((prev) => [...prev, ...arr].slice(0, 10));
  };
  const removePending = (idx: number) => setImagens((p) => p.filter((_, i) => i !== idx));

  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Turnos"
        description="Registre os ocorridos do turno com data, hora, responsável e imagens. Filtre por período para revisar acontecimentos passados."
      />

      {editable && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <form
              onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="descricao">Descrição do ocorrido</Label>
                <Textarea
                  id="descricao"
                  placeholder="O que aconteceu, quando, ações tomadas…"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ocorrido">Data e hora</Label>
                  <Input
                    id="ocorrido"
                    type="datetime-local"
                    value={ocorridoEm}
                    onChange={(e) => setOcorridoEm(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="responsavel">Responsável</Label>
                  <Input
                    id="responsavel"
                    placeholder="Nome do responsável"
                    value={responsavel}
                    onChange={(e) => setResponsavel(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Imagens</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImagePlus className="mr-2 h-4 w-4" />
                    Adicionar imagens
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => onPickFiles(e.target.files)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {imagens.length > 0 ? `${imagens.length} arquivo(s) selecionado(s)` : "Opcional · até 10 imagens"}
                  </span>
                </div>
                {imagens.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                    {imagens.map((f, idx) => {
                      const url = URL.createObjectURL(f);
                      return (
                        <div key={idx} className="group relative overflow-hidden rounded-md border">
                          <img src={url} alt={f.name} className="aspect-square w-full object-cover" onLoad={() => URL.revokeObjectURL(url)} />
                          <button
                            type="button"
                            onClick={() => removePending(idx)}
                            className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 opacity-0 transition group-hover:opacity-100"
                            aria-label="Remover"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={createMut.isPending || uploading}>
                  {uploading ? "Enviando imagens…" : createMut.isPending ? "Registrando…" : "Registrar evento"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filtros
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ini" className="text-xs">De</Label>
              <Input id="ini" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-[160px]" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fim" className="text-xs">Até</Label>
              <Input id="fim" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-[160px]" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="busca" className="text-xs">Buscar</Label>
              <Input id="busca" placeholder="Descrição ou responsável" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-[240px]" />
            </div>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRangeShortcut(0)}>Hoje</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setRangeShortcut(7)}>7 dias</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setRangeShortcut(30)}>30 dias</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <h2 className="text-lg font-semibold">Linha do tempo</h2>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : eventosFiltrados.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhum evento encontrado para o período selecionado.
            </CardContent>
          </Card>
        ) : (
          grupos.map(([dia, items]) => (
            <div key={dia}>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="capitalize">{dia}</span>
              </div>
              <ol className="relative space-y-4 border-l border-border pl-6">
                {items.map((ev) => {
                  const dt = new Date(ev.ocorrido_em);
                  const imgs = ev.imagens ?? [];
                  return (
                    <li key={ev.id} className="relative">
                      <span className="absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary ring-4 ring-background">
                        <Clock className="h-3.5 w-3.5" />
                      </span>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>
                                  {dt.toLocaleString("pt-BR", {
                                    day: "2-digit", month: "2-digit", year: "numeric",
                                    hour: "2-digit", minute: "2-digit",
                                  })}
                                </span>
                                {ev.responsavel && (
                                  <Badge variant="secondary" className="gap-1 text-xs">
                                    <UserIcon className="h-3 w-3" />
                                    {ev.responsavel}
                                  </Badge>
                                )}
                              </div>
                              {ev.descricao && (
                                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
                                  {ev.descricao}
                                </p>
                              )}
                              {imgs.length > 0 && (
                                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                                  {imgs.map((p) => {
                                    const url = signedQ.data?.[p];
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={() => url && setLightbox(url)}
                                        className="overflow-hidden rounded-md border bg-muted"
                                      >
                                        {url ? (
                                          <img src={url} alt="" className="aspect-square w-full object-cover" />
                                        ) : (
                                          <div className="aspect-square w-full animate-pulse bg-muted" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            {editable && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { if (confirm("Remover evento?")) deleteMut.mutate(ev); }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))
        )}
      </div>

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightbox && <img src={lightbox} alt="" className="h-full w-full rounded object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
