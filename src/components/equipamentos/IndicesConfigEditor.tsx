import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { calcularIndice, parseIndices, type IndiceConfig } from "@/lib/indices/calc";

type TagOpt = { value: string; label: string };

export function IndicesConfigEditor({
  value, onChange, tagOptions, tagValue, concExemplo,
}: {
  value: unknown;
  onChange: (v: IndiceConfig[]) => void;
  tagOptions: TagOpt[];
  tagValue: (n: string) => number | null | undefined;
  concExemplo: number | null;
}) {
  const list = parseIndices(value);
  const set = (i: number, patch: Partial<IndiceConfig>) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
      <p className="text-xs text-muted-foreground">
        Na fórmula use <b>VALOR</b> (tag base), <b>CONC_PROD</b> (concentração do produto em produção), nomes de outras tags e números.
        Ex.: <code>VALOR * CONC_PROD / 55</code> ou <code>VALOR * CONC_PROD / TAG_CONC</code>. Sem fórmula, mostra a tag direta.
      </p>
      {list.map((c, i) => {
        const prev = calcularIndice(c, tagValue, concExemplo);
        return (
          <div key={i} className="grid grid-cols-12 gap-2 rounded border border-border bg-background p-2">
            <Input className="col-span-6 h-8" placeholder="Nome (ex.: Índice a 50%)" value={c.nome} onChange={(e) => set(i, { nome: e.target.value })} />
            <select className="col-span-6 h-8 rounded-md border border-input bg-background px-2 text-xs" value={c.tag} onChange={(e) => set(i, { tag: e.target.value })}>
              <option value="">— tag base —</option>
              {tagOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <Input className="col-span-12 h-8 font-mono text-xs" placeholder="Fórmula de correção (opcional)" value={c.formula} onChange={(e) => set(i, { formula: e.target.value })} />
            <Input className="col-span-4 h-8" placeholder="Unidade" value={c.unidade} onChange={(e) => set(i, { unidade: e.target.value })} />
            <Input className="col-span-3 h-8" type="number" min={0} max={6} title="Casas decimais" value={c.decimais} onChange={(e) => set(i, { decimais: Number(e.target.value) })} />
            <div className="col-span-4 flex items-center text-xs text-muted-foreground">
              Agora: <span className="ml-1 font-mono font-semibold text-foreground">{prev == null ? "—" : prev.toLocaleString("pt-BR", { minimumFractionDigits: c.decimais, maximumFractionDigits: c.decimais })}</span>
            </div>
            <Button type="button" variant="ghost" size="icon" className="col-span-1 h-8 w-8" onClick={() => onChange(list.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        );
      })}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...list, { nome: "", tag: "", formula: "", unidade: "", decimais: 3 }])}>
        <Plus className="mr-1 h-4 w-4" /> Índice
      </Button>
      {concExemplo == null ? <p className="text-[11px] text-muted-foreground">Prévia sem concentração: nenhum produto com concentração vinculado a este equipamento.</p> : <p className="text-[11px] text-muted-foreground">Prévia usando concentração {concExemplo}% (produto ativo pela tag).</p>}
    </div>
  );
}
