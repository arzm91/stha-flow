import { pageHead } from "@/lib/seo";
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
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  Check,
  AlertCircle,
  Copy,
} from "lucide-react";
import { formatRelative } from "@/lib/format";
import { syncAllTagEndpoints, syncTagEndpointById } from "@/lib/tagEndpointSync";

export const Route = createFileRoute("/_authenticated/tags/endpoints")({
  head: pageHead({ title: "Tags · Endpoints — STHApc", description: "Acesse e gerencie Tags · Endpoints no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: "/tags/endpoints" }),
  component: EndpointsPage,
});

type Endpoint = {
  id: string;
  nome: string;
  url: string;
  headers: Record<string, string> | null;
  intervalo_segundos: number;
  ativo: boolean;
  ultima_execucao: string | null;
  ultimo_status: string | null;
  ultimo_erro: string | null;
  tags_recebidas: number;
  push_token: string;
};

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
        .select("id,nome,url,headers,intervalo_segundos,ativo,ultima_execucao,ultimo_status,ultimo_erro,tags_recebidas,push_token")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Endpoint[];
    },
    refetchInterval: 3000,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { guardAdmin } = await import("@/lib/security/guard-admin");
      await guardAdmin("excluir este endpoint de tags");
      const { error } = await supabase.from("tag_endpoints" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Endpoint removido");
      qc.invalidateQueries({ queryKey: ["tag_endpoints"] });
    },
    onError: async (e: any) => {
      const { isAdminCancelled } = await import("@/lib/security/guard-admin");
      if (!isAdminCancelled(e)) toast.error(e.message);
    },
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
      return syncTagEndpointById(id);
    },
    onSuccess: (data) => {
      const r = data?.results?.[0] as { ok: boolean; count?: number; error?: string } | undefined;
      if (r?.ok) toast.success(`Sincronizado: ${r.count ?? 0} tags`);
      else toast.error(r?.error || "Falha ao sincronizar");
      qc.invalidateQueries({ queryKey: ["tag_endpoints"] });
      qc.invalidateQueries({ queryKey: ["tags-live"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runAll = useMutation({
    mutationFn: async () => {
      return syncAllTagEndpoints();
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

  async function copyWebhookUrl(ep: Endpoint) {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const webhookUrl = `${baseUrl}/api/public/tags/push?token=${ep.push_token}`;
    await navigator.clipboard.writeText(webhookUrl);
    toast.success("URL do webhook copiada");
  }

  return (
    <div>
      <PageHeader
        title="Endpoints HTTP"
        description="URLs que o sistema consulta automaticamente para buscar tags. O servidor faz GET no intervalo configurado e grava os valores em Tags ao Vivo."
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
            <Radio className="h-4 w-4" /> Formatos JSON aceitos
          </CardTitle>
          <CardDescription>
            O endpoint pode retornar qualquer um destes formatos — o sistema detecta automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border bg-card/40 p-3">
            <div className="mb-1 text-sm font-semibold">Array de tags</div>
            <pre className="overflow-auto rounded bg-muted p-2 text-[11px]">
{`[
  {"nome":"R8.Temp","valor":78.4,"unidade":"°C","grupo":"Reator 8"},
  {"nome":"R8.Pressao","valor":2.1,"unidade":"bar","grupo":"Reator 8"}
]`}
            </pre>
          </div>
          <div className="rounded-lg border bg-card/40 p-3">
            <div className="mb-1 text-sm font-semibold">Objeto chave-valor</div>
            <pre className="overflow-auto rounded bg-muted p-2 text-[11px]">
{`{
  "R8.Temp": 78.4,
  "R8.Pressao": 2.1
}`}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Endpoints cadastrados</CardTitle>
          <CardDescription>
            O servidor consulta cada endpoint no intervalo configurado (mínimo 2s). A tela "Tags ao
            Vivo" atualiza a exibição a cada 1 segundo.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          ) : (list.data?.length ?? 0) === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Radio className="h-6 w-6" />}
                title="Nenhum endpoint cadastrado"
                description="Cadastre uma URL HTTP para o sistema buscar tags automaticamente."
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
                    <TableHead>Webhook</TableHead>
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
                      {ep.url}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => copyWebhookUrl(ep)}
                        title="Copiar URL HTTPS para POST do Node-RED"
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" /> Copiar URL
                      </Button>
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
  const [intervalo, setIntervalo] = useState("2");
  const [headersText, setHeadersText] = useState("");
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
      setIntervalo(String(editing?.intervalo_segundos ?? 2));
      setHeadersText(editing?.headers ? JSON.stringify(editing.headers, null, 2) : "");
      setAtivo(editing?.ativo ?? true);
      setTestResult(null);
    }
  }, [open, editing]);

  function validate(): { headers: Record<string, string>; payload: any } {
    const u = url.trim();
    if (!nome.trim() || !u) throw new Error("Nome e URL são obrigatórios");
    if (!/^https?:\/\//i.test(u)) throw new Error("A URL deve começar com http:// ou https://");
    if (typeof window !== "undefined") {
      try {
        const parsed = new URL(u);
        const origem = window.location.origin;
        if (u.startsWith(origem) || parsed.hostname.endsWith(".lovable.app")) {
          throw new Error("Não use uma URL deste próprio sistema — isso cria um loop infinito.");
        }
      } catch (e: any) {
        if (e.message?.startsWith("Não")) throw e;
        throw new Error("URL inválida");
      }
    }
    let headers: Record<string, string> = {};
    if (headersText.trim()) {
      try {
        headers = JSON.parse(headersText);
        if (typeof headers !== "object" || Array.isArray(headers))
          throw new Error("Headers deve ser um objeto JSON");
      } catch (e: any) {
        throw new Error(`Headers inválidos: ${e.message}`);
      }
    }
    const seg = parseInt(intervalo, 10);
    if (!Number.isFinite(seg) || seg < 2) throw new Error("Intervalo mínimo é 2 segundos");

    return {
      headers,
      payload: {
        nome: nome.trim(),
        url: u,
        metodo: "GET",
        headers,
        body: null,
        intervalo_segundos: seg,
        ativo,
      },
    };
  }

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
      toast.success(editing ? "Endpoint atualizado" : "Endpoint cadastrado");
      qc.invalidateQueries({ queryKey: ["tag_endpoints"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function testar() {
    setTestResult(null);
    try {
      validate();
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message });
      return;
    }
    if (!editing) {
      setTestResult({
        ok: false,
        message: "Salve o endpoint primeiro e use o botão Sincronizar para testar.",
      });
      return;
    }
    try {
      const data = await syncTagEndpointById(editing.id);
      const count = data.results[0]?.count ?? 0;
      setTestResult({ ok: true, count, sample: undefined });
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar endpoint" : "Novo endpoint HTTP"}</DialogTitle>
          <DialogDescription>
            O servidor fará GET nesta URL no intervalo configurado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: CLP Reator 8"
            />
          </div>
          <div>
            <Label>URL *</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.100:1880/dados"
              className="font-mono text-xs"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Endpoint que retorna JSON. Deve ser alcançável pela internet.
            </p>
          </div>
          <div>
            <Label>Intervalo (segundos)</Label>
            <Input
              type="number"
              min={60}
              value={intervalo}
              onChange={(e) => setIntervalo(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Mínimo 60s. A tela atualiza a exibição a cada 1s, mas a chamada à URL externa segue
              este intervalo.
            </p>
          </div>
          <div>
            <Label>Headers (JSON, opcional)</Label>
            <Textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              placeholder={`{\n  "Authorization": "Bearer abc123"\n}`}
              className="font-mono text-xs"
              rows={4}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={ativo} onCheckedChange={setAtivo} />
            <Label className="!mt-0">Ativo</Label>
          </div>
          {testResult && (
            <div
              className={`rounded-md border p-3 text-xs ${
                testResult.ok
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              <div className="mb-1 flex items-center gap-1 font-semibold">
                {testResult.ok ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {testResult.ok
                  ? `OK — ${testResult.count} item(ns) detectado(s)`
                  : testResult.message}
              </div>
              {testResult.ok && testResult.sample && (
                <pre className="mt-2 overflow-auto rounded bg-background/50 p-2 text-[10px]">
                  {testResult.sample}
                </pre>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={testar}>
            Testar agora
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : editing ? "Atualizar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
