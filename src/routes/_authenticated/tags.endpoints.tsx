import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { ArrowLeft, Copy, Pencil, Play, Plus, Radio, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";

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
const pollUrl =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/public/tags/poll`
    : "/api/public/tags/poll";

function EndpointsPage() {
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Endpoint | null>(null);

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
        .update({ ativo: !ep.ativo })
        .eq("id", ep.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tag_endpoints"] }),
  });

  const runNow = useMutation({
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

  return (
    <div>
      <PageHeader
        title="Endpoints de Tags"
        description="Configure fontes de tags via HTTP — push (envio) e pull (busca)."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/tags">
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Link>
            </Button>
            <Dialog
              open={openForm}
              onOpenChange={(o) => {
                setOpenForm(o);
                if (!o) setEditing(null);
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Novo endpoint
                </Button>
              </DialogTrigger>
              <EndpointForm
                editing={editing}
                onClose={() => {
                  setOpenForm(false);
                  setEditing(null);
                }}
              />
            </Dialog>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4" /> Receber tags (push)
            </CardTitle>
            <CardDescription>
              Configure seu CLP/SCADA para enviar POST com JSON para a URL abaixo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <CopyField label="URL de ingestão" value={ingestUrl} />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Ver exemplo de payload</summary>
              <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-[11px]">
{`POST ${ingestUrl}
Content-Type: application/json

{
  "tags": [
    { "nome": "R8.Temp", "valor": 78.4, "unidade": "°C", "grupo": "Reator 8" },
    { "nome": "R8.Pressao", "valor": 2.1, "unidade": "bar" }
  ]
}`}
            </pre>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Buscar tags (pull)</CardTitle>
            <CardDescription>
              Cadastre URLs externas — o sistema faz GET periódico e grava as tags automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <CopyField label="URL do worker (cron)" value={pollUrl} />
            <p className="text-xs text-muted-foreground">
              Já agendado a cada 1 minuto. Endpoints com intervalo menor são limitados a 1 min pelo
              agendador.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fontes cadastradas (pull)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          ) : (list.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Radio className="h-6 w-6" />}
              title="Nenhuma fonte cadastrada"
              description="Cadastre uma URL para o sistema buscar tags automaticamente."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Intervalo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data!.map((ep) => (
                  <TableRow key={ep.id}>
                    <TableCell className="font-medium">{ep.nome}</TableCell>
                    <TableCell className="max-w-[260px] truncate font-mono text-xs">
                      {ep.metodo} {ep.url}
                    </TableCell>
                    <TableCell className="text-xs">{ep.intervalo_segundos}s</TableCell>
                    <TableCell>
                      {ep.ultimo_status ? (
                        <Badge
                          variant="outline"
                          className={
                            ep.ultimo_status.startsWith("OK")
                              ? "border-success/30 bg-success/10 text-success"
                              : "border-destructive/30 bg-destructive/10 text-destructive"
                          }
                        >
                          {ep.ultimo_status}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {ep.ultimo_erro && (
                        <div
                          className="mt-1 max-w-[220px] truncate text-[10px] text-destructive"
                          title={ep.ultimo_erro}
                        >
                          {ep.ultimo_erro}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ep.ultima_execucao ? formatDate(ep.ultima_execucao) : "—"}
                    </TableCell>
                    <TableCell>
                      <Switch checked={ep.ativo} onCheckedChange={() => toggle.mutate(ep)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => runNow.mutate(ep.id)}
                          disabled={runNow.isPending}
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
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Remover endpoint "${ep.nome}"?`)) remove.mutate(ep.id);
                          }}
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
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 flex gap-1">
        <Input readOnly value={value} className="font-mono text-xs" />
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success("Copiado");
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function EndpointForm({ editing, onClose }: { editing: Endpoint | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [metodo, setMetodo] = useState(editing?.metodo ?? "GET");
  const [intervalo, setIntervalo] = useState(String(editing?.intervalo_segundos ?? 60));
  const [headersText, setHeadersText] = useState(
    editing?.headers ? JSON.stringify(editing.headers, null, 2) : "",
  );
  const [body, setBody] = useState(editing?.body ?? "");
  const [ativo, setAtivo] = useState(editing?.ativo ?? true);

  const save = useMutation({
    mutationFn: async () => {
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
        url: url.trim(),
        metodo,
        headers,
        body: body.trim() || null,
        intervalo_segundos: Math.max(5, Number(intervalo) || 60),
        ativo,
      };
      if (!payload.nome || !payload.url) throw new Error("Nome e URL são obrigatórios");

      if (editing) {
        const { error } = await supabase
          .from("tag_endpoints" as never)
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tag_endpoints" as never).insert(payload);
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
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Editar endpoint" : "Novo endpoint"}</DialogTitle>
        <DialogDescription>
          Configure uma URL externa de onde as tags serão buscadas.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Nome</Label>
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
            <Label>URL</Label>
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
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
