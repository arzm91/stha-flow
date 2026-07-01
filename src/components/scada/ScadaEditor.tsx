// Editor completo do supervisório.
import { useCallback, useMemo, useState } from "react";
import type { ScadaDoc, ScadaElement, SymbolKind, FluidType, BindingLevel, BindingValue, BindingColor, BindingOnOff, ColorRange } from "./types";
import { FLUID_COLORS, FLUID_LABEL } from "./types";
import { SYMBOL_CATALOG } from "./symbols";
import { ScadaCanvas } from "./ScadaCanvas";
import { useTagsLive } from "./useTagsLive";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Trash2, ArrowUpNarrowWide, ArrowDownNarrowWide, AlignLeft, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyEnd, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScadaEditorProps = {
  doc: ScadaDoc;
  onChange: (doc: ScadaDoc) => void;
  onSave: () => void;
  saving?: boolean;
  headerRight?: React.ReactNode;
};

export function ScadaEditor({ doc, onChange, onSave, saving, headerRight }: ScadaEditorProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const { tagNames } = useTagsLive();

  const selEls = useMemo(() => doc.elements.filter((e) => selected.includes(e.id)), [doc.elements, selected]);
  const selOne = selEls[0];

  // --- ações do documento ---
  const addSymbol = (kind: SymbolKind) => {
    const cat = SYMBOL_CATALOG.find((c) => c.kind === kind)!;
    const el: ScadaElement = {
      id: crypto.randomUUID(), kind,
      x: 200, y: 200, w: cat.defaultW, h: cat.defaultH, rot: 0,
      layerId: kind === "instrumento" ? "l-instrumentos" : "l-processo",
      z: doc.elements.length,
      label: kind === "instrumento" ? "" : cat.label,
      props: kind === "instrumento" ? { isaLetters: "TI", isaTag: "" }
           : kind === "text" ? { text: "Texto", fontSize: 24 }
           : {},
    };
    onChange({ ...doc, elements: [...doc.elements, el] });
    setSelected([el.id]);
  };

  const patchEl = (id: string, patch: Partial<ScadaElement>) => {
    onChange({ ...doc, elements: doc.elements.map((e) => e.id === id ? { ...e, ...patch } : e) });
  };
  const patchBindings = (id: string, key: "level" | "value" | "color" | "onOff", value: unknown) => {
    onChange({ ...doc, elements: doc.elements.map((e) => e.id === id ? {
      ...e, bindings: { ...(e.bindings ?? {}), [key]: value },
    } : e) });
  };
  const removeBinding = (id: string, key: "level" | "value" | "color" | "onOff") => {
    onChange({ ...doc, elements: doc.elements.map((e) => {
      if (e.id !== id) return e;
      const b = { ...(e.bindings ?? {}) }; delete (b as Record<string, unknown>)[key];
      return { ...e, bindings: b };
    }) });
  };
  const removeSelected = () => {
    onChange({
      ...doc,
      elements: doc.elements.filter((e) => !selected.includes(e.id)),
      pipes: doc.pipes.filter((p) => !selected.includes(p.fromEl) && !selected.includes(p.toEl)),
    });
    setSelected([]);
  };
  const bringForward = () => {
    if (!selOne) return;
    patchEl(selOne.id, { z: (selOne.z ?? 0) + 10 });
  };
  const sendBackward = () => {
    if (!selOne) return;
    patchEl(selOne.id, { z: (selOne.z ?? 0) - 10 });
  };
  const alignSelected = (axis: "left" | "right" | "top" | "bottom") => {
    if (selEls.length < 2) return;
    const ref = axis === "left" ? Math.min(...selEls.map((e) => e.x))
             : axis === "right" ? Math.max(...selEls.map((e) => e.x + e.w))
             : axis === "top" ? Math.min(...selEls.map((e) => e.y))
             : Math.max(...selEls.map((e) => e.y + e.h));
    onChange({ ...doc, elements: doc.elements.map((e) => {
      if (!selected.includes(e.id)) return e;
      if (axis === "left") return { ...e, x: ref };
      if (axis === "right") return { ...e, x: ref - e.w };
      if (axis === "top") return { ...e, y: ref };
      return { ...e, y: ref - e.h };
    }) });
  };

  const onConnect = useCallback((fromEl: string, fromPort: string, toEl: string, toPort: string) => {
    onChange({
      ...doc,
      pipes: [...doc.pipes, {
        id: crypto.randomUUID(), fromEl, fromPort, toEl, toPort,
        fluid: "produto", thickness: 2.5, animated: true,
        layerId: "l-processo",
      }],
    });
  }, [doc, onChange]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof SYMBOL_CATALOG>();
    SYMBOL_CATALOG.forEach((c) => { const a = m.get(c.group) ?? []; a.push(c); m.set(c.group, a); });
    return Array.from(m.entries());
  }, []);

  // Delete selected pipe from properties (when only one element selected we show pipes touching it)
  const removePipe = (id: string) => onChange({ ...doc, pipes: doc.pipes.filter((p) => p.id !== id) });
  const patchPipe = (id: string, patch: Partial<typeof doc.pipes[number]>) =>
    onChange({ ...doc, pipes: doc.pipes.map((p) => p.id === id ? { ...p, ...patch } : p) });

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        <Button size="sm" variant="default" onClick={onSave} disabled={saving}>
          <Save className="mr-1 h-4 w-4" /> {saving ? "Salvando…" : "Salvar"}
        </Button>
        <div className="mx-2 h-6 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={() => alignSelected("left")} title="Alinhar à esquerda"><AlignLeft className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => alignSelected("right")} title="Alinhar à direita"><AlignRight className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => alignSelected("top")} title="Alinhar topo"><AlignVerticalJustifyStart className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => alignSelected("bottom")} title="Alinhar base"><AlignVerticalJustifyEnd className="h-4 w-4" /></Button>
        <div className="mx-2 h-6 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={bringForward} title="Trazer p/ frente"><ArrowUpNarrowWide className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={sendBackward} title="Enviar p/ trás"><ArrowDownNarrowWide className="h-4 w-4" /></Button>
        <div className="mx-2 h-6 w-px bg-border" />
        <Button size="sm" variant="destructive" disabled={selected.length === 0} onClick={removeSelected}>
          <Trash2 className="mr-1 h-4 w-4" /> Excluir
        </Button>
        <div className="ml-auto flex items-center gap-2">{headerRight}</div>
      </div>

      <div className="grid flex-1 grid-cols-[240px_1fr_320px] gap-2 overflow-hidden">
        {/* Palette */}
        <div className="overflow-hidden rounded-md border bg-card">
          <div className="border-b px-3 py-2 text-xs font-medium uppercase text-muted-foreground">Biblioteca</div>
          <ScrollArea className="h-full">
            <Accordion type="multiple" defaultValue={["Tanques", "Rotativos", "Válvulas"]} className="px-2">
              {grouped.map(([group, items]) => (
                <AccordionItem key={group} value={group}>
                  <AccordionTrigger className="py-2 text-sm">{group}</AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-2 gap-1 pb-3">
                      {items.map((it) => (
                        <Button key={it.kind} variant="outline" size="sm" className="h-auto justify-start px-2 py-1 text-[11px]" onClick={() => addSymbol(it.kind)}>
                          {it.label}
                        </Button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </ScrollArea>
        </div>

        {/* Canvas */}
        <div className="min-w-0 overflow-hidden">
          <ScadaCanvas
            doc={doc}
            selectedIds={selected}
            onSelect={setSelected}
            onChange={onChange}
            onConnect={onConnect}
            height="100%"
          />
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>Clique num círculo azul da porta e depois em outro para conectar.</span>
            <span>Arraste no vazio para pan · Roda do mouse para zoom.</span>
          </div>
        </div>

        {/* Properties */}
        <div className="overflow-hidden rounded-md border bg-card">
          <div className="border-b px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
            {selEls.length === 0 ? "Documento" : selEls.length === 1 ? "Elemento" : `${selEls.length} elementos`}
          </div>
          <ScrollArea className="h-full">
            <div className="space-y-4 p-3">
              {selEls.length === 0 && <DocPanel doc={doc} onChange={onChange} />}
              {selOne && (
                <ElementPanel
                  el={selOne}
                  doc={doc}
                  tagNames={tagNames}
                  onPatch={(patch) => patchEl(selOne.id, patch)}
                  onBinding={(k, v) => patchBindings(selOne.id, k, v)}
                  onRemoveBinding={(k) => removeBinding(selOne.id, k)}
                  pipesForEl={doc.pipes.filter((p) => p.fromEl === selOne.id || p.toEl === selOne.id)}
                  onPatchPipe={patchPipe}
                  onRemovePipe={removePipe}
                />
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function DocPanel({ doc, onChange }: { doc: ScadaDoc; onChange: (d: ScadaDoc) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Fundo</Label>
        <Input type="color" value={doc.canvas.bg} onChange={(e) => onChange({ ...doc, canvas: { ...doc.canvas, bg: e.target.value } })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Largura</Label>
          <Input type="number" value={doc.canvas.width} onChange={(e) => onChange({ ...doc, canvas: { ...doc.canvas, width: Number(e.target.value) } })} />
        </div>
        <div>
          <Label className="text-xs">Altura</Label>
          <Input type="number" value={doc.canvas.height} onChange={(e) => onChange({ ...doc, canvas: { ...doc.canvas, height: Number(e.target.value) } })} />
        </div>
        <div>
          <Label className="text-xs">Grid</Label>
          <Input type="number" value={doc.canvas.grid} onChange={(e) => onChange({ ...doc, canvas: { ...doc.canvas, grid: Math.max(2, Number(e.target.value)) } })} />
        </div>
      </div>
      <div className="border-t pt-3">
        <Label className="text-xs font-medium">Camadas</Label>
        <div className="mt-1 space-y-1">
          {doc.layers.map((l) => (
            <div key={l.id} className="flex items-center gap-2">
              <Switch checked={l.visible} onCheckedChange={(v) => onChange({ ...doc, layers: doc.layers.map((x) => x.id === l.id ? { ...x, visible: v } : x) })} />
              <Input value={l.name} className="h-7 text-xs" onChange={(e) => onChange({ ...doc, layers: doc.layers.map((x) => x.id === l.id ? { ...x, name: e.target.value } : x) })} />
              <Input type="number" value={l.z} className="h-7 w-14 text-xs" onChange={(e) => onChange({ ...doc, layers: doc.layers.map((x) => x.id === l.id ? { ...x, z: Number(e.target.value) } : x) })} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type ElementPanelProps = {
  el: ScadaElement;
  doc: ScadaDoc;
  tagNames: string[];
  onPatch: (p: Partial<ScadaElement>) => void;
  onBinding: (k: "level" | "value" | "color" | "onOff", v: unknown) => void;
  onRemoveBinding: (k: "level" | "value" | "color" | "onOff") => void;
  pipesForEl: ScadaDoc["pipes"];
  onPatchPipe: (id: string, patch: Partial<ScadaDoc["pipes"][number]>) => void;
  onRemovePipe: (id: string) => void;
};

function ElementPanel({ el, doc, tagNames, onPatch, onBinding, onRemoveBinding, pipesForEl, onPatchPipe, onRemovePipe }: ElementPanelProps) {
  const patchProps = (patch: Record<string, unknown>) => onPatch({ props: { ...el.props, ...patch } });

  return (
    <Tabs defaultValue="geral">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="geral">Geral</TabsTrigger>
        <TabsTrigger value="tags">Tags</TabsTrigger>
        <TabsTrigger value="conexoes">Linhas</TabsTrigger>
      </TabsList>

      <TabsContent value="geral" className="space-y-3 pt-2">
        <div>
          <Label className="text-xs">Rótulo</Label>
          <Input value={el.label ?? ""} onChange={(e) => onPatch({ label: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={el.x} onChange={(v) => onPatch({ x: v })} />
          <NumberField label="Y" value={el.y} onChange={(v) => onPatch({ y: v })} />
          <NumberField label="Largura" value={el.w} onChange={(v) => onPatch({ w: Math.max(20, v) })} />
          <NumberField label="Altura" value={el.h} onChange={(v) => onPatch({ h: Math.max(20, v) })} />
          <NumberField label="Rotação°" value={el.rot} onChange={(v) => onPatch({ rot: v })} />
        </div>
        <div>
          <Label className="text-xs">Camada</Label>
          <Select value={el.layerId} onValueChange={(v) => onPatch({ layerId: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{doc.layers.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {el.kind === "instrumento" && (
          <>
            <div>
              <Label className="text-xs">Letras ISA</Label>
              <Input value={el.props.isaLetters ?? ""} maxLength={4} onChange={(e) => patchProps({ isaLetters: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label className="text-xs">Tag n°</Label>
              <Input value={el.props.isaTag ?? ""} onChange={(e) => patchProps({ isaTag: e.target.value })} />
            </div>
          </>
        )}
        {el.kind === "text" && (
          <>
            <div>
              <Label className="text-xs">Texto</Label>
              <Input value={el.props.text ?? ""} onChange={(e) => patchProps({ text: e.target.value })} />
            </div>
            <NumberField label="Tamanho" value={el.props.fontSize ?? 24} onChange={(v) => patchProps({ fontSize: v })} />
          </>
        )}
        {(el.kind.startsWith("shape_") || el.kind === "arrow" || el.kind === "text") && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Traço</Label>
              <Input type="color" value={el.props.strokeColor ?? "#e2e8f0"} onChange={(e) => patchProps({ strokeColor: e.target.value })} />
            </div>
            {el.kind !== "text" && el.kind !== "arrow" && (
              <div>
                <Label className="text-xs">Preencher</Label>
                <Input type="color" value={el.props.fillColor ?? "#00000000"} onChange={(e) => patchProps({ fillColor: e.target.value })} />
              </div>
            )}
          </div>
        )}
      </TabsContent>

      <TabsContent value="tags" className="space-y-3 pt-2">
        <BindingBlock title="Nível animado" enabled={!!el.bindings?.level}
          onToggle={(v) => v ? onBinding("level", { tag: "", min: 0, max: 100 } as BindingLevel) : onRemoveBinding("level")}>
          {el.bindings?.level && (
            <>
              <TagSelect value={el.bindings.level.tag} names={tagNames} onChange={(t) => onBinding("level", { ...el.bindings!.level!, tag: t })} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Min" value={el.bindings.level.min} onChange={(v) => onBinding("level", { ...el.bindings!.level!, min: v })} />
                <NumberField label="Max" value={el.bindings.level.max} onChange={(v) => onBinding("level", { ...el.bindings!.level!, max: v })} />
              </div>
            </>
          )}
        </BindingBlock>

        <BindingBlock title="Valor + unidade" enabled={!!el.bindings?.value}
          onToggle={(v) => v ? onBinding("value", { tag: "", decimals: 2, showUnit: true } as BindingValue) : onRemoveBinding("value")}>
          {el.bindings?.value && (
            <>
              <TagSelect value={el.bindings.value.tag} names={tagNames} onChange={(t) => onBinding("value", { ...el.bindings!.value!, tag: t })} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Casas dec." value={el.bindings.value.decimals} onChange={(v) => onBinding("value", { ...el.bindings!.value!, decimals: Math.max(0, Math.min(4, v)) })} />
                <div className="flex items-end gap-2">
                  <Switch checked={el.bindings.value.showUnit} onCheckedChange={(v) => onBinding("value", { ...el.bindings!.value!, showUnit: v })} />
                  <Label className="text-xs">Unidade</Label>
                </div>
              </div>
            </>
          )}
        </BindingBlock>

        <BindingBlock title="Cor por faixa" enabled={!!el.bindings?.color}
          onToggle={(v) => v ? onBinding("color", { tag: "", ranges: [{ op: "between", a: 0, b: 100, color: "#10b981" }] } as BindingColor) : onRemoveBinding("color")}>
          {el.bindings?.color && (
            <>
              <TagSelect value={el.bindings.color.tag} names={tagNames} onChange={(t) => onBinding("color", { ...el.bindings!.color!, tag: t })} />
              <div className="space-y-1">
                {el.bindings.color.ranges.map((r, i) => (
                  <div key={i} className="grid grid-cols-[64px_50px_50px_36px_auto] items-center gap-1">
                    <Select value={r.op} onValueChange={(op) => onBinding("color", { ...el.bindings!.color!, ranges: el.bindings!.color!.ranges.map((x, j) => j === i ? { ...x, op: op as ColorRange["op"] } : x) })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="<">{"<"}</SelectItem>
                        <SelectItem value=">">{">"}</SelectItem>
                        <SelectItem value="between">entre</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" className="h-8 text-xs" value={r.a} onChange={(e) => onBinding("color", { ...el.bindings!.color!, ranges: el.bindings!.color!.ranges.map((x, j) => j === i ? { ...x, a: Number(e.target.value) } : x) })} />
                    {r.op === "between" ? (
                      <Input type="number" className="h-8 text-xs" value={r.b ?? 0} onChange={(e) => onBinding("color", { ...el.bindings!.color!, ranges: el.bindings!.color!.ranges.map((x, j) => j === i ? { ...x, b: Number(e.target.value) } : x) })} />
                    ) : <span />}
                    <Input type="color" className="h-8 w-9 p-0" value={r.color} onChange={(e) => onBinding("color", { ...el.bindings!.color!, ranges: el.bindings!.color!.ranges.map((x, j) => j === i ? { ...x, color: e.target.value } : x) })} />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onBinding("color", { ...el.bindings!.color!, ranges: el.bindings!.color!.ranges.filter((_, j) => j !== i) })}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="w-full" onClick={() => onBinding("color", { ...el.bindings!.color!, ranges: [...el.bindings!.color!.ranges, { op: "between", a: 0, b: 100, color: "#f59e0b" }] })}>+ faixa</Button>
              </div>
            </>
          )}
        </BindingBlock>

        <BindingBlock title="Ligado / animação" enabled={!!el.bindings?.onOff}
          onToggle={(v) => v ? onBinding("onOff", { tag: "", threshold: 1 } as BindingOnOff) : onRemoveBinding("onOff")}>
          {el.bindings?.onOff && (
            <>
              <TagSelect value={el.bindings.onOff.tag} names={tagNames} onChange={(t) => onBinding("onOff", { ...el.bindings!.onOff!, tag: t })} />
              <NumberField label="Limiar" value={el.bindings.onOff.threshold} onChange={(v) => onBinding("onOff", { ...el.bindings!.onOff!, threshold: v })} />
            </>
          )}
        </BindingBlock>
      </TabsContent>

      <TabsContent value="conexoes" className="space-y-2 pt-2">
        {pipesForEl.length === 0 && <p className="text-xs text-muted-foreground">Este elemento não tem tubulações. Use os círculos azuis nas portas para conectar.</p>}
        {pipesForEl.map((p) => (
          <div key={p.id} className="space-y-2 rounded-md border p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{p.fromEl === el.id ? `${p.fromPort} → ${p.toPort}` : `${p.fromPort} → ${p.toPort}`}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRemovePipe(p.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
            <Select value={p.fluid} onValueChange={(v) => onPatchPipe(p.id, { fluid: v as FluidType })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(FLUID_LABEL).map((k) => (
                <SelectItem key={k} value={k}>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ background: FLUID_COLORS[k as FluidType] }} />
                    {FLUID_LABEL[k as FluidType]}
                  </span>
                </SelectItem>
              ))}</SelectContent>
            </Select>
            <div className="grid grid-cols-2 items-center gap-2">
              <NumberField label="Espessura" value={p.thickness} onChange={(v) => onPatchPipe(p.id, { thickness: Math.max(1, v) })} />
              <div className="flex items-end gap-2">
                <Switch checked={p.animated} onCheckedChange={(v) => onPatchPipe(p.id, { animated: v })} />
                <Label className="text-xs">Fluxo animado</Label>
              </div>
            </div>
            <Input placeholder="Rótulo (opcional)" className="h-8 text-xs" value={p.label ?? ""} onChange={(e) => onPatchPipe(p.id, { label: e.target.value })} />
          </div>
        ))}
      </TabsContent>
    </Tabs>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" className="h-8" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function TagSelect({ value, names, onChange }: { value: string; names: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">Tag</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-8"><SelectValue placeholder="selecione…" /></SelectTrigger>
        <SelectContent className="max-h-64">
          {names.map((n) => <SelectItem key={n} value={n} className="font-mono text-xs">{n}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function BindingBlock({ title, enabled, onToggle, children }: { title: string; enabled: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{title}</span>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && <div className={cn("mt-2 space-y-2")}>{children}</div>}
    </div>
  );
}
