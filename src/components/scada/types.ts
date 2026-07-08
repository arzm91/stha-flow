// Modelo do supervisório (SCADA) — armazenado em equipamentos.pfd_graph.
// version:2 identifica o novo formato; docs antigos (ReactFlow) são migrados
// em runtime pelo helper migrateLegacy().

export type FluidType =
  | "produto" | "vapor" | "agua" | "ar" | "condensado"
  | "gas" | "quimico" | "outro";

export const FLUID_COLORS: Record<FluidType, string> = {
  produto: "#10b981",
  vapor: "#f97316",
  agua: "#3b82f6",
  ar: "#94a3b8",
  condensado: "#0ea5e9",
  gas: "#eab308",
  quimico: "#a855f7",
  outro: "#64748b",
};

export const FLUID_LABEL: Record<FluidType, string> = {
  produto: "Produto",
  vapor: "Vapor",
  agua: "Água",
  ar: "Ar comprimido",
  condensado: "Condensado",
  gas: "Gás",
  quimico: "Químico",
  outro: "Outro",
};

// Famílias de símbolos ISA + formas livres.
export type SymbolKind =
  // tanques / vasos
  | "tanque_vertical" | "tanque_horizontal" | "vaso_esferico" | "coluna" | "silo"
  // rotativos
  | "bomba_centrifuga" | "bomba_positiva" | "compressor" | "ventilador" | "agitador"
  // térmicos / reatores / filtros
  | "trocador_casco" | "trocador_placas" | "reator" | "filtro" | "ciclone"
  // válvulas
  | "valv_gaveta" | "valv_globo" | "valv_esfera" | "valv_retencao" | "valv_controle" | "valv_alivio"
  // instrumento ISA-5.1
  | "instrumento"
  // formas livres
  | "shape_rect" | "shape_circle" | "shape_polygon" | "text" | "arrow";

export type BindingLevel = { tag: string; min: number; max: number };
export type BindingValue = { tag: string; decimals: number; showUnit: boolean; fontSize?: number };
export type ColorRange = { op: "<" | ">" | "between"; a: number; b?: number; color: string };
export type BindingColor = { tag: string; ranges: ColorRange[] };
export type BindingOnOff = { tag: string; threshold: number };

export type Bindings = {
  level?: BindingLevel;
  value?: BindingValue;
  color?: BindingColor;
  onOff?: BindingOnOff;
};

export type ElementProps = {
  // instrumento
  isaLetters?: string;       // ex: "TI", "PT", "LT"
  isaTag?: string;           // ex: "101"
  // válvula
  valveOpen?: boolean;
  // texto
  text?: string;
  fontSize?: number;
  // shape
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  // polígono livre
  points?: { x: number; y: number }[];
  // orientação (tanque horizontal usa)
  // agitador (velocidade estática)
  rpm?: number;
};

export type ScadaElement = {
  id: string;
  kind: SymbolKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;                // graus
  layerId: string;
  z: number;
  label?: string;
  props: ElementProps;
  bindings?: Bindings;
};

export type ScadaPipe = {
  id: string;
  fromEl: string;             // id do elemento origem
  fromPort: string;           // 'top'|'bottom'|'left'|'right'
  toEl: string;
  toPort: string;
  fluid: FluidType;
  thickness: number;
  animated: boolean;
  layerId: string;
  // roteamento ortogonal: waypoints intermediários (calculado se vazio)
  waypoints?: { x: number; y: number }[];
  // opcional: bind on/off por tag pra controlar animação de fluxo
  onOff?: BindingOnOff;
  label?: string;
};

export type ScadaLayer = {
  id: string;
  name: string;
  visible: boolean;
  z: number;
};

export type ScadaBackground = {
  // data URL (image/png;base64,... ou image/svg+xml;base64,...) — embutido no doc pra
  // funcionar sem depender de storage. Nome original é só pra exibir na UI.
  dataUrl: string;
  filename?: string;
  opacity: number;   // 0..1
  fit: "contain" | "cover" | "stretch";
};

export type ScadaDoc = {
  version: 2;
  canvas: { width: number; height: number; grid: number; bg: string; background?: ScadaBackground };
  layers: ScadaLayer[];
  elements: ScadaElement[];
  pipes: ScadaPipe[];
};

export function emptyDoc(): ScadaDoc {
  return {
    version: 2,
    canvas: { width: 2000, height: 1400, grid: 10, bg: "#0b1220" },

    layers: [
      { id: "l-processo", name: "Processo", visible: true, z: 1 },
      { id: "l-instrumentos", name: "Instrumentação", visible: true, z: 2 },
      { id: "l-anotacoes", name: "Anotações", visible: true, z: 3 },
    ],
    elements: [],
    pipes: [],
  };
}

// Migra o formato antigo (ReactFlow: nodes/edges) para v2.
// Mapeamento aproximado só pra não perder o desenho anterior.
export function migrateLegacy(raw: unknown): ScadaDoc {
  const doc = emptyDoc();
  if (!raw || typeof raw !== "object") return doc;
  const anyRaw = raw as { version?: number; nodes?: unknown[]; edges?: unknown[] } & Partial<ScadaDoc>;
  if (anyRaw.version === 2 && Array.isArray(anyRaw.elements)) {
    // já é o novo formato; garante campos
    return {
      ...doc,
      ...(anyRaw as ScadaDoc),
      layers: anyRaw.layers?.length ? anyRaw.layers : doc.layers,
    };
  }
  const nodes = Array.isArray(anyRaw.nodes) ? anyRaw.nodes : [];
  const idMap = new Map<string, string>();
  const legacyToKind: Record<string, SymbolKind> = {
    tanque: "tanque_vertical",
    vaso: "vaso_esferico",
    coluna: "coluna",
    bomba: "bomba_centrifuga",
    compressor: "compressor",
    trocador: "trocador_casco",
    valvula: "valv_globo",
    reator: "reator",
    filtro: "filtro",
    misturador: "agitador",
  };
  for (const n of nodes as Array<{
    id: string; type?: string; position?: { x: number; y: number };
    width?: number; height?: number;
    data?: { kind?: string; symbol?: string; label?: string; tagNome?: string; width?: number; height?: number };
  }>) {
    const newId = crypto.randomUUID();
    idMap.set(n.id, newId);
    const w = n.data?.width ?? n.width ?? 90;
    const h = n.data?.height ?? n.height ?? 90;
    if (n.data?.kind === "tag") {
      doc.elements.push({
        id: newId, kind: "instrumento",
        x: n.position?.x ?? 0, y: n.position?.y ?? 0, w, h, rot: 0,
        layerId: "l-instrumentos", z: 2,
        label: n.data.label,
        props: { isaLetters: "TI", isaTag: (n.data.label ?? "").slice(0, 4) },
        bindings: n.data.tagNome ? { value: { tag: n.data.tagNome, decimals: 2, showUnit: true } } : undefined,
      });
    } else {
      const kind = legacyToKind[n.data?.symbol ?? ""] ?? "shape_rect";
      doc.elements.push({
        id: newId, kind,
        x: n.position?.x ?? 0, y: n.position?.y ?? 0, w, h, rot: 0,
        layerId: "l-processo", z: 1,
        label: n.data?.label ?? "",
        props: {},
      });
    }
  }
  const edges = Array.isArray(anyRaw.edges) ? anyRaw.edges : [];
  for (const e of edges as Array<{ id: string; source: string; target: string; data?: { tipo?: FluidType; label?: string } }>) {
    const from = idMap.get(e.source); const to = idMap.get(e.target);
    if (!from || !to) continue;
    doc.pipes.push({
      id: crypto.randomUUID(),
      fromEl: from, fromPort: "right",
      toEl: to, toPort: "left",
      fluid: (e.data?.tipo as FluidType) ?? "produto",
      thickness: 2, animated: true,
      layerId: "l-processo",
      label: e.data?.label,
    });
  }
  return doc;
}
