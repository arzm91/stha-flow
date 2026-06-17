import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  Check,
  AlertCircle,
} from "lucide-react";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tags/endpoints")({
  component: EndpointsPage,
});

type Endpoint = {
  id: string;
  nome: string;
  url: string;
  metodo: string;
  headers: Record<string, string> | null;
  body: string | null;
  intervalo_segundos: number;
  ativo: boolean;
  ultima_execucao: string | null;
  ultimo_status: string | null;
  ultimo_erro: string | null;
  tags_recebidas: number;
};

const ingestUrl =
  typeof window !== "undefined" ? `${window.location.origin}/api/public/tags` : "/api/public/tags";

function EndpointsPage() {
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Endpoint | null>(null);
  const [removing, setRemoving] = useState<Endpoint | null>(null);

  const list = useQuery({
    queryKey: ["tag_endpoints"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tag_endpoints" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Endpoint[];
    },
    refetchInterval: 5000,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tag_endpoints" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Endpoint removido");
      qc.invalidateQueries({ queryKey: ["tag_endpoints"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (ep: Endpoint) => {
      const { error } = await supabase
        .from("tag_endpoints" as never)
        .update({ ativo: !ep.ativo } as never)
        .eq("id", ep.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tag_endpoints"] }),
  });

  const runOne = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/public/tags/poll?id=${id}&force=1`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha");
      return json;
    },
    onSuccess: (data) => {
      const r = data?.results?.[0];
      if (r?.ok) toast.success(`Sincronizado: ${r.count ?? 0} tags`);
      else toast.error(r?.error || `Falha: ${r?.status ?? "?"}`);
      qc.invalidateQueries({ queryKey: ["tag_endpoints"] });
      qc.invalidateQueries({ queryKey: ["tags-live"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runAll = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/tags/poll?force=1`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha");
      return json;
    },
    onSuccess: (data) => {
      const ok = (data?.results ?? []).filter((r: any) => r.ok).length;
      const tot = data?.processed ?? 0;
      toast.success(`${ok}/${tot} endpoints sincronizados`);
      qc.invalidateQueries({ queryKey: ["tag_endpoints"] });
      qc.invalidateQueries({ queryKey: ["tags-live"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Endpoints de Tags"
        description="Configure fontes de tags via HTTP — envio (push) e busca periódica (pull)."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/tags">
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runAll.mutate()}
              disabled={runAll.isPending}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${runAll.isPending ? "animate-spin" : ""}`} />
              Sincronizar tudo
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpenForm(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Novo endpoint
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4" /> Como alimentar tags neste sistema
          </CardTitle>
          <CardDescription>
            Você pode usar um, dois ou os três fluxos ao mesmo tempo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <FluxoCard
            n={1}
            titulo="Push"
            descricao="Seu CLP/SCADA envia POST quando os valores mudam. Mais rápido e econômico."
            extra={
              <div className="space-y-2">
                <CopyField label="URL" value={ingestUrl} />
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">Ver exemplo</summary>
                  <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-[11px]">
{`curl -X POST ${ingestUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"tags":[
    {"nome":"R8.Temp","valor":78.4,"unidade":"°C","grupo":"Reator 8"}
  ]}'`}
                  </pre>
                </details>
              </div>
            }
          />
          <FluxoCard
            n={2}
            titulo="Pull"
            descricao="Cadastre uma URL externa abaixo — o servidor faz GET a cada N segundos e grava as tags."
            extra={
              <p className="text-xs text-muted-foreground">
                O agendador roda a cada 1 minuto; intervalos menores são limitados a 60s.
              </p>
            }
          />
          <FluxoCard
            n={3}
            titulo="Manual"
            descricao="Crie tags na mão pela tela Tags ao Vivo — útil para testes e demonstrações."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fontes cadastradas (pull)</CardTitle>
          <CardDescription>
            URLs que o sistema consulta periodicamente para buscar tags.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          ) : (list.data?.length ?? 0) === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Radio className="h-6 w-6" />}
                title="Nenhuma fonte cadastrada"
                description="Cadastre uma URL para o sistema buscar tags automaticamente."
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditing(null);
                      setOpenForm(true);
                    }}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Novo endpoint
                  </Button>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead className="text-right">Intervalo</TableHead>
                  <TableHead>Última execução</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data!.map((ep) => (
                  <TableRow key={ep.id}>
                    <TableCell className="font-medium">{ep.nome}</TableCell>
                    <TableCell className="max-w-[280px] truncate font-mono text-xs">
                      <span className="mr-1 rounded bg-muted px-1 py-0.5 text-[10px] font-semibold">
                        {ep.metodo}
                      </span>
                      {ep.url}
                    </TableCell>
                    <TableCell className="text-right text-xs">{ep.intervalo_segundos}s</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ep.ultima_execucao ? (
                        <>
                          {formatRelative(ep.ultima_execucao)}
                          {ep.tags_recebidas > 0 && (
                            <div className="text-[10px]">{ep.tags_recebidas} tags</div>
                          )}
                        </>
                      ) : (
                        "nunca"
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={ep.ultimo_status} erro={ep.ultimo_erro} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={ep.ativo} onCheckedChange={() => toggle.mutate(ep)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => runOne.mutate(ep.id)}
                          disabled={runOne.isPending}
                          title="Sincronizar agora"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(ep);
                            setOpenForm(true);
                          }}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRemoving(ep)}
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EndpointForm
        open={openForm}
        editing={editing}
        onClose={() => {
          setOpenForm(false);
          setEditing(null);
        }}
      />

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              O endpoint <strong>{removing?.nome}</strong> deixará de ser consultado. As tags já
              recebidas continuam disponíveis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (removing) remove.mutate(removing.id);
                setRemoving(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FluxoCard({
  n,
  titulo,
  descricao,
  extra,
}: {
  n: number;
  titulo: string;
  descricao: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card/40 p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
          {n}
        </span>
        <span className="text-sm font-semibold">{titulo}</span>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{descricao}</p>
      {extra}
    </div>
  );
}

function StatusBadge({ status, erro }: { status: string | null; erro: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const ok = status.startsWith("OK");
  return (
    <div className="space-y-1">
      <Badge
        variant="outline"
        className={
          ok
            ? "border-success/30 bg-success/10 text-success"
            : "border-destructive/30 bg-destructive/10 text-destructive"
        }
      >
        {status}
      </Badge>
      {erro && (
        <div className="max-w-[220px] truncate text-[10px] text-destructive" title={erro}>
          {erro}
        </div>
      )}
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1 flex gap-1">
        <Input readOnly value={value} className="h-8 font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success("Copiado");
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function EndpointForm({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: Endpoint | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [metodo, setMetodo] = useState("GET");
  const [intervalo, setIntervalo] = useState("60");
  const [headersText, setHeadersText] = useState("");
  const [body, setBody] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [testResult, setTestResult] = useState<
    | { ok: true; count: number; sample?: string }
    | { ok: false; message: string }
    | null
  >(null);

  useEffect(() => {
    if (open) {
      setNome(editing?.nome ?? "");
      setUrl(editing?.url ?? "");
      setMetodo(editing?.metodo ?? "GET");
      setIntervalo(String(editing?.intervalo_segundos ?? 60));
      setHeadersText(editing?.headers ? JSON.stringify(editing.headers, null, 2) : "");
      setBody(editing?.body ?? "");
      setAtivo(editing?.ativo ?? true);
      setTestResult(null);
    }
  }, [open, editing]);

  function validate(): { headers: Record<string, string>; payload: any } {
    const u = url.trim();
    if (!nome.trim() || !u) throw new Error("Nome e URL são obrigatórios");
    if (typeof window !== "undefined") {
      try {
        const parsed = new URL(u);
        if (parsed.host === window.location.host && parsed.pathname.startsWith("/api/public/tags")) {
          throw new Error(
            "URL aponta para o próprio sistema — isso causaria um loop. Use a URL do seu CLP/SCADA.",
          );
        }
      } catch (e: any) {
        if (e?.message?.startsWith("URL aponta")) throw e;
        throw new Error("URL inválida");
      }
    }
    let headers: Record<string, string> = {};
    if (headersText.trim()) {
      try {
        headers = JSON.parse(headersText);
      } catch {
        throw new Error("Headers deve ser JSON válido");
      }
    }
    const payload = {
      nome: nome.trim(),
      url: u,
      metodo,
      headers,
      body: body.trim() || null,
      intervalo_segundos: Math.max(5, Number(intervalo) || 60),
      ativo,
    };
    return { headers, payload };
  }

  const test = useMutation({
    mutationFn: async () => {
      const { headers } = validate();
      const res = await fetch(url.trim(), {
        method: metodo,
        headers: { Accept: "application/json", ...headers },
        body: metodo !== "GET" && body.trim() ? body : undefined,
      });
      const text = await res.text();
      if (!res.ok) {
        setTestResult({ ok: false, message: `HTTP ${res.status}: ${text.slice(0, 200)}` });
        return;
      }
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        setTestResult({ ok: false, message: "Resposta não é JSON" });
        return;
      }
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.tags)
          ? data.tags
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.items)
              ? data.items
              : typeof data === "object"
                ? Object.entries(data).map(([k, v]) => ({ nome: k, valor: v }))
                : [];
      setTestResult({
        ok: true,
        count: list.length,
        sample: JSON.stringify(list.slice(0, 3), null, 2),
      });
    },
    onError: (e: any) => {
      setTestResult({ ok: false, message: e.message });
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { payload } = validate();
      if (editing) {
        const { error } = await supabase
          .from("tag_endpoints" as never)
          .update(payload as never)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tag_endpoints" as never).insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Endpoint atualizado" : "Endpoint criado");
      qc.invalidateQueries({ queryKey: ["tag_endpoints"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar endpoint" : "Novo endpoint"}</DialogTitle>
          <DialogDescription>
            URL externa que o sistema consultará periodicamente para buscar tags.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Reator 8" />
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-2">
            <div>
              <Label>Método</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>URL *</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://seu-clp.local/api/tags"
              />
            </div>
          </div>
          <div>
            <Label>Intervalo (segundos)</Label>
            <Input
              type="number"
              min={5}
              value={intervalo}
              onChange={(e) => setIntervalo(e.target.value)}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              O agendador roda a cada 60s. Valores menores são limitados a 60s na prática.
            </p>
          </div>
          <div>
            <Label>Headers (JSON, opcional)</Label>
            <Textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              placeholder={`{ "Authorization": "Bearer ..." }`}
              rows={3}
              className="font-mono text-xs"
            />
          </div>
          {metodo === "POST" && (
            <div>
              <Label>Body (opcional)</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={ativo} onCheckedChange={setAtivo} />
            <Label>Ativo</Label>
          </div>

          {testResult && (
            <div
              className={`rounded border p-2 text-xs ${
                testResult.ok
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              <div className="flex items-center gap-1 font-medium">
                {testResult.ok ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Resposta OK — {testResult.count} tags detectadas
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5" /> Falha no teste
                  </>
                )}
              </div>
              {testResult.ok && testResult.sample && (
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-background/50 p-1 font-mono text-[10px]">
                  {testResult.sample}
                </pre>
              )}
              {!testResult.ok && <div className="mt-1">{testResult.message}</div>}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => test.mutate()}
            disabled={test.isPending}
          >
            {test.isPending ? "Testando…" : "Testar agora"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
