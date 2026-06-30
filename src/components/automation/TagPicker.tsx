import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Tag = { nome: string; unidade: string | null; grupo: string | null; valor: string | null };

export function TagPicker({
  value,
  onChange,
  placeholder = "Selecione uma tag",
}: {
  value: string;
  onChange: (nome: string) => void;
  placeholder?: string;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tags_live")
        .select("nome,unidade,grupo,valor")
        .order("grupo", { ascending: true })
        .order("nome", { ascending: true })
        .limit(500);
      setTags((data ?? []) as Tag[]);
    })();
  }, []);

  const filtered = search
    ? tags.filter((t) =>
        t.nome.toLowerCase().includes(search.toLowerCase()) ||
        (t.grupo ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : tags;

  return (
    <div className="space-y-2">
      <Input
        placeholder="Filtrar tags…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {filtered.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              Nenhuma tag. Cadastre endpoints em Tags → Endpoints.
            </div>
          )}
          {filtered.map((t) => (
            <SelectItem key={t.nome} value={t.nome}>
              <div className="flex flex-col">
                <span className="text-sm">{t.nome}</span>
                <span className="text-[10px] text-muted-foreground">
                  {t.grupo ?? "—"} · {t.valor ?? "—"} {t.unidade ?? ""}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function EquipamentoPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [items, setItems] = useState<Array<{ id: string; codigo: string; nome: string; status: string }>>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("equipamentos")
        .select("id,codigo,nome,status")
        .eq("ativo", true)
        .order("nome");
      setItems(data ?? []);
    })();
  }, []);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Selecione equipamento…" /></SelectTrigger>
      <SelectContent>
        {items.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.codigo} — {e.nome} <span className="text-[10px] text-muted-foreground">({e.status})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProdutoPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [items, setItems] = useState<Array<{ id: string; codigo: string; nome: string }>>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("produtos").select("id,codigo,nome").eq("ativo", true).order("nome");
      setItems(data ?? []);
    })();
  }, []);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Selecione produto…" /></SelectTrigger>
      <SelectContent>
        {items.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
