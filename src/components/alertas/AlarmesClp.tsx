import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Siren } from "lucide-react";
import { toast } from "sonner";

type TagRow = { nome: string; nome_amigavel: string | null; grupo: string | null; valor_num: number | null; atualizado_em: string | null };
type Regra = { id: string; nome: string; tag_nome: string | null; valor_ativacao: number; severidade: string; tag_nivel_primario: string | null; tag_nivel_secundario: string | null; ativo: boolean };
type Aberto = { alerta_id: string | null; severidade: string; created_at: string; contexto: Record<string, unknown> | null };

const isNivelPrim = (n: string) => /FOR\d*_ALARM_\d+$/i.test(n) && !/SECONDARY/i.test(n);
const isNivelSec = (n: string) => /SECONDARY_ALARM/i.test(n);

function dur(iso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min ${s % 60}s`;
}

export function AlarmesClpPanel() {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [tags, setTags] = useState<Record<string, TagRow>>({});
  const [abertos, setAbertos] = useState<Aberto[]>([]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [now, setNow] = useState(Date.now());

  async function load() {
    const { data: r } = await supabase.from("alertas").select("id,nome,tag_nome,valor_ativacao,severidade,tag_nivel_primario,tag_nivel_secundario,ativo").eq("tipo", "tag_digital");
    const rs = (r ?? []) as Regra[];
    setRegras(rs);
    const nomes = Array.from(new Set(rs.flatMap((x) => [x.tag_nome, x.tag_nivel_primario, x.tag_nivel_secundario]).filter(Boolean))) as string[];
    if (nomes.length) {
      const { data: t } = await supabase.from("tags_live").select("nome,nome_amigavel,grupo,valor_num,atualizado_em").in("nome", nomes);
      setTags(Object.fromEntries(((t ?? []) as TagRow[]).map((x) => [x.nome, x])));
    }
    const ids = rs.map((x) => x.id);
    if (ids.length) {
      const { data: d } = await supabase.from("alertas_disparos").select("alerta_id,severidade,created_at,contexto").in("alerta_id", ids).neq("status", "resolvido").order("created_at", { ascending: false });
      setAbertos((d ?? []) as Aberto[]);
    } else setAbertos([]);
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 5000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(i); clearInterval(c); };
  }, []);

  const linhas = useMemo(() => regras.map((r) => {
    const t = r.tag_nome ? tags[r.tag_nome] : undefined;
    const ativo = t?.valor_num != null && Number(t.valor_num) === Number(r.valor_ativacao);
    const ab = abertos.find((a) => a.alerta_id === r.id);
    const sev = ab?.severidade ?? r.severidade;
    return { r, t, ativo, ab, sev };
  }), [regras, tags, abertos]);

  const prim = regras.find((r) => r.tag_nivel_primario)?.tag_nivel_primario;
  const sec = regras.find((r) => r.tag_nivel_secundario)?.tag_nivel_secundario;
  const primAtivo = prim ? Number(tags[prim]?.valor_num) === 1 : false;
  const secAtivo = sec ? Number(tags[sec]?.valor_num) === 1 : false;
  const ativos = linhas.filter((l) => l.ativo);

  const vis = linhas
    .filter((l) => filtro === "todos" || (filtro === "ativos" ? l.ativo : !l.ativo))
    .filter((l) => !busca || `${l.r.nome} ${l.r.tag_nome} ${l.t?.nome_amigavel ?? ""}`.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo));

  if (regras.length === 0)
    return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
        Nenhum alarme CLP cadastrado. Use o botão <b>Importar alarmes CLP</b> para cadastrar as tags do endpoint.
      </CardContent></Card>
    );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Monitorados" value={regras.length} />
        <Kpi label="Ativos agora" value={ativos.length} tone={ativos.length ? "danger" : "ok"} />
        <Kpi label="Nível primário" value={primAtivo ? "ATIVO" : "normal"} tone={primAtivo ? "danger" : "ok"} />
        <Kpi label="Nível secundário" value={secAtivo ? "ATIVO" : "normal"} tone={secAtivo ? "warn" : "ok"} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar alarme…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativos">Em alarme</SelectItem>
            <SelectItem value="normais">Normais</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {vis.map(({ r, t, ativo, ab, sev }) => (
          <div key={r.id} className={`rounded-md border p-3 text-sm ${ativo ? (sev === "critical" ? "border-destructive bg-destructive/15 animate-pulse" : "border-amber-500/60 bg-amber-500/10") : "border-border bg-card"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{t?.nome_amigavel || r.nome}</div>
                <div className="truncate text-xs text-muted-foreground">{r.tag_nome}</div>
              </div>
              {ativo ? (
                <Badge variant={sev === "critical" ? "destructive" : "secondary"}>{sev === "critical" ? "PRIMÁRIO" : sev === "warn" ? "SECUNDÁRIO" : "ATIVO"}</Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">Normal</Badge>
              )}
            </div>
            {ativo && ab && (
              <div className="mt-1 text-xs text-muted-foreground">
                Desde {new Date(ab.created_at).toLocaleTimeString("pt-BR")} · há {dur(ab.created_at, now)}
              </div>
            )}
            {!r.ativo && <div className="mt-1 text-xs text-muted-foreground">Regra desativada</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" | "danger" }) {
  const c = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-500" : tone === "ok" ? "text-emerald-500" : "";
  return (
    <Card><CardContent className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${c}`}>{value}</div>
    </CardContent></Card>
  );
}

export function ImportarAlarmesClpDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone?: () => void }) {
  const [grupos, setGrupos] = useState<string[]>([]);
  const [grupo, setGrupo] = useState("");
  const [tags, setTags] = useState<TagRow[]>([]);
  const [existentes, setExistentes] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [prim, setPrim] = useState("");
  const [sec, setSec] = useState("");
  const [sev, setSev] = useState("warn");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from("tags_live").select("grupo").not("grupo", "is", null);
      const gs = Array.from(new Set((data ?? []).map((x) => x.grupo as string))).sort();
      setGrupos(gs);
      if (!grupo) setGrupo(gs.find((g) => /alarm/i.test(g)) ?? gs[0] ?? "");
      const { data: ex } = await supabase.from("alertas").select("tag_nome").eq("tipo", "tag_digital");
      setExistentes(new Set((ex ?? []).map((x) => x.tag_nome as string)));
    })();
  }, [open]);

  useEffect(() => {
    if (!grupo) return;
    (async () => {
      const { data } = await supabase.from("tags_live").select("nome,nome_amigavel,grupo,valor_num,atualizado_em").eq("grupo", grupo).order("nome");
      const ts = (data ?? []) as TagRow[];
      setTags(ts);
      const p = ts.find((t) => isNivelPrim(t.nome))?.nome ?? "";
      const s = ts.find((t) => isNivelSec(t.nome))?.nome ?? "";
      setPrim(p); setSec(s);
      setSel(new Set(ts.filter((t) => t.nome !== p && t.nome !== s).map((t) => t.nome)));
    })();
  }, [grupo]);

  const candidatas = tags.filter((t) => t.nome !== prim && t.nome !== sec);
  const novas = candidatas.filter((t) => sel.has(t.nome) && !existentes.has(t.nome));

  async function importar() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }
    const rows = novas.map((t) => ({
      owner_id: u.user!.id, nome: t.nome_amigavel || t.nome, tipo: "tag_digital", tag_nome: t.nome,
      valor_ativacao: 1, severidade: sev, ativo: true, cooldown_minutes: 0, grupo_tag: grupo,
      tag_nivel_primario: prim || null, tag_nivel_secundario: sec || null,
    }));
    const { error } = rows.length ? await supabase.from("alertas").insert(rows) : { error: null };
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} alarmes importados`);
    onOpenChange(false); onDone?.();
  }

  const toggle = (n: string) => setSel((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Importar alarmes do CLP</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1"><Label>Grupo de tags</Label>
              <Select value={grupo} onValueChange={setGrupo}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-1"><Label>Severidade padrão (sem nível)</Label>
              <Select value={sev} onValueChange={setSev}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Atenção</SelectItem><SelectItem value="critical">Crítico</SelectItem></SelectContent></Select></div>
            <div className="grid gap-1"><Label>Tag de nível primário (→ Crítico)</Label>
              <Select value={prim || "_"} onValueChange={(v) => setPrim(v === "_" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="_">Nenhuma</SelectItem>{tags.map((t) => <SelectItem key={t.nome} value={t.nome}>{t.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-1"><Label>Tag de nível secundário (→ Atenção)</Label>
              <Select value={sec || "_"} onValueChange={(v) => setSec(v === "_" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="_">Nenhuma</SelectItem>{tags.map((t) => <SelectItem key={t.nome} value={t.nome}>{t.nome}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>{sel.size} selecionadas · {novas.length} novas</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSel(new Set(candidatas.map((t) => t.nome)))}>Marcar todas</Button>
              <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Limpar</Button>
            </div>
          </div>
          <div className="max-h-72 overflow-auto rounded border">
            {candidatas.map((t) => (
              <label key={t.nome} className="flex items-center gap-2 border-b px-3 py-1.5 text-sm last:border-0">
                <Checkbox checked={sel.has(t.nome)} onCheckedChange={() => toggle(t.nome)} />
                <span className="flex-1 truncate">{t.nome_amigavel || t.nome}</span>
                {existentes.has(t.nome) && <Badge variant="outline">já cadastrado</Badge>}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={importar} disabled={saving || novas.length === 0}><Download className="mr-2 size-4" />Importar {novas.length}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { Siren };
