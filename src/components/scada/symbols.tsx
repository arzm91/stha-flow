// Renderizador unificado de símbolos SCADA em SVG.
// Cada símbolo desenha dentro do viewBox 100x100; o componente pai posiciona/escala.
import type { ScadaElement, SymbolKind } from "./types";
import type { EvaluatedBindings } from "./bindings";

// --- constantes de estilo (supervisório industrial) ---
const STROKE = "#e2e8f0";        // slate-200 sobre fundo escuro
const STROKE_ALT = "#94a3b8";    // slate-400
const FILL = "#1e293b";          // slate-800
const FILL_ALT = "#0f172a";      // slate-900
const ACCENT_ON = "#10b981";
const ACCENT_OFF = "#475569";

// Portas em coordenadas 0..100 (viewBox local do símbolo)
export type Port = { id: string; x: number; y: number };
export function symbolPorts(kind: SymbolKind): Port[] {
  // maioria: 4 portas cardinais
  const cardinal: Port[] = [
    { id: "top", x: 50, y: 0 },
    { id: "right", x: 100, y: 50 },
    { id: "bottom", x: 50, y: 100 },
    { id: "left", x: 0, y: 50 },
  ];
  if (kind === "text" || kind === "arrow") return [];
  return cardinal;
}

export type SymbolCatalog = {
  kind: SymbolKind; label: string; group: "Tanques" | "Rotativos" | "Térmicos" | "Válvulas" | "Instrumentos" | "Formas";
  defaultW: number; defaultH: number;
};

export const SYMBOL_CATALOG: SymbolCatalog[] = [
  { kind: "tanque_vertical", label: "Tanque vertical", group: "Tanques", defaultW: 90, defaultH: 140 },
  { kind: "tanque_horizontal", label: "Tanque horizontal", group: "Tanques", defaultW: 160, defaultH: 80 },
  { kind: "vaso_esferico", label: "Vaso esférico", group: "Tanques", defaultW: 120, defaultH: 120 },
  { kind: "coluna", label: "Coluna / torre", group: "Tanques", defaultW: 70, defaultH: 200 },
  { kind: "silo", label: "Silo", group: "Tanques", defaultW: 100, defaultH: 150 },
  { kind: "bomba_centrifuga", label: "Bomba centrífuga", group: "Rotativos", defaultW: 90, defaultH: 90 },
  { kind: "bomba_positiva", label: "Bomba positiva", group: "Rotativos", defaultW: 90, defaultH: 90 },
  { kind: "compressor", label: "Compressor", group: "Rotativos", defaultW: 100, defaultH: 90 },
  { kind: "ventilador", label: "Ventilador", group: "Rotativos", defaultW: 90, defaultH: 90 },
  { kind: "agitador", label: "Agitador", group: "Rotativos", defaultW: 90, defaultH: 110 },
  { kind: "trocador_casco", label: "Trocador casco-tubo", group: "Térmicos", defaultW: 160, defaultH: 80 },
  { kind: "trocador_placas", label: "Trocador de placas", group: "Térmicos", defaultW: 100, defaultH: 120 },
  { kind: "reator", label: "Reator", group: "Térmicos", defaultW: 120, defaultH: 140 },
  { kind: "filtro", label: "Filtro", group: "Térmicos", defaultW: 90, defaultH: 130 },
  { kind: "ciclone", label: "Ciclone", group: "Térmicos", defaultW: 90, defaultH: 140 },
  { kind: "valv_gaveta", label: "Válvula gaveta", group: "Válvulas", defaultW: 70, defaultH: 60 },
  { kind: "valv_globo", label: "Válvula globo", group: "Válvulas", defaultW: 70, defaultH: 60 },
  { kind: "valv_esfera", label: "Válvula esfera", group: "Válvulas", defaultW: 70, defaultH: 60 },
  { kind: "valv_retencao", label: "Retenção", group: "Válvulas", defaultW: 70, defaultH: 60 },
  { kind: "valv_controle", label: "Controle", group: "Válvulas", defaultW: 70, defaultH: 90 },
  { kind: "valv_alivio", label: "Alívio", group: "Válvulas", defaultW: 60, defaultH: 90 },
  { kind: "instrumento", label: "Instrumento ISA", group: "Instrumentos", defaultW: 70, defaultH: 70 },
  { kind: "shape_rect", label: "Retângulo", group: "Formas", defaultW: 120, defaultH: 60 },
  { kind: "shape_circle", label: "Círculo", group: "Formas", defaultW: 80, defaultH: 80 },
  { kind: "shape_polygon", label: "Polígono", group: "Formas", defaultW: 100, defaultH: 100 },
  { kind: "arrow", label: "Seta", group: "Formas", defaultW: 100, defaultH: 20 },
  { kind: "text", label: "Texto", group: "Formas", defaultW: 140, defaultH: 30 },
];

// --- helper: envoltório fluido/animação ---
type DrawProps = {
  el: ScadaElement;
  ev: EvaluatedBindings;
  uid: string;   // sufixo único para ids de defs
};

function alarmStroke(ev: EvaluatedBindings, base = STROKE): string {
  if (ev.color) return ev.color;
  if (ev.alarm === "alert") return "#ef4444";
  if (ev.alarm === "warn") return "#f59e0b";
  if (ev.alarm === "ok") return "#10b981";
  return base;
}

// Tanque/coluna com nível animado.
// levelPct 0..1, ou null (sem binding = mostra shell só).
function TankShape({ el, ev, uid, orientation }: DrawProps & { orientation: "vertical" | "horizontal" | "cone" | "sphere" }) {
  const lvl = ev.levelPct;
  const stroke = alarmStroke(ev);
  const clipId = `clip-${uid}`;
  // shell path (em viewBox 100x100)
  let shellPath = "";
  if (orientation === "vertical") shellPath = "M15 15 L15 95 Q15 100 20 100 L80 100 Q85 100 85 95 L85 15 Q85 10 80 10 L20 10 Q15 10 15 15 Z";
  if (orientation === "cone")    shellPath = "M20 5 L80 5 L80 70 L60 95 L40 95 L20 70 Z";
  if (orientation === "horizontal") shellPath = "M5 30 Q5 20 15 20 L85 20 Q95 20 95 30 L95 70 Q95 80 85 80 L15 80 Q5 80 5 70 Z";
  if (orientation === "sphere") shellPath = ""; // usa circle
  const fillY = lvl != null ? 100 - lvl * (orientation === "cone" ? 90 : orientation === "horizontal" ? 60 : 90) : 100;
  const fillOffset = orientation === "cone" ? 5 : orientation === "horizontal" ? 20 : 10;
  const fillTop = Math.max(fillOffset, fillY);
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          {orientation === "sphere"
            ? <circle cx={50} cy={50} r={44} />
            : <path d={shellPath} />}
        </clipPath>
        <linearGradient id={`grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="1" stopColor="#0284c7" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {orientation === "sphere"
        ? <circle cx={50} cy={50} r={44} fill={FILL} stroke={stroke} strokeWidth={2.5} />
        : <path d={shellPath} fill={FILL} stroke={stroke} strokeWidth={2.5} />}
      {lvl != null && (
        <g clipPath={`url(#${clipId})`}>
          <rect x={0} y={fillTop} width={100} height={100 - fillTop} fill={`url(#grad-${uid})`}>
            <animate attributeName="y" from={fillTop + 1} to={fillTop} dur="0.6s" fill="freeze" />
          </rect>
          {/* linha de superfície */}
          <line x1={0} y1={fillTop} x2={100} y2={fillTop} stroke="#67e8f9" strokeWidth={0.8} opacity={0.8} />
        </g>
      )}
      {/* linhas de escala */}
      {orientation !== "sphere" && [25, 50, 75].map((p) => (
        <line key={p} x1={orientation === "horizontal" ? p : 15}
              y1={orientation === "horizontal" ? 20 : p}
              x2={orientation === "horizontal" ? p : 20}
              y2={orientation === "horizontal" ? 25 : p}
              stroke={STROKE_ALT} strokeWidth={0.6} />
      ))}
    </g>
  );
}

function PumpShape({ ev, uid }: DrawProps) {
  const stroke = alarmStroke(ev);
  const spin = ev.on;
  return (
    <g>
      <circle cx={50} cy={55} r={32} fill={FILL} stroke={stroke} strokeWidth={2.5} />
      <rect x={45} y={5} width={10} height={20} fill={FILL} stroke={stroke} strokeWidth={2} />
      <g transform={`translate(50 55)`}>
        {spin && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1s" repeatCount="indefinite" additive="sum" />}
        <path d="M0,-24 A24,24 0 0,1 20,12 L0,0 Z" fill={spin ? ACCENT_ON : ACCENT_OFF} opacity={0.85} />
        <path d="M0,0 L20,12 A24,24 0 0,1 -20,12 Z" fill={spin ? ACCENT_ON : ACCENT_OFF} opacity={0.65} />
      </g>
      <circle cx={50} cy={55} r={4} fill={STROKE} />
      <text x={50} y={95} textAnchor="middle" fontSize={10} fill={STROKE_ALT} fontFamily="monospace">P</text>
      {/* discriminator based on kind handled by caller wrapper via label */}
    </g>
  );
}

function CompressorShape({ ev }: DrawProps) {
  const stroke = alarmStroke(ev);
  return (
    <g>
      <path d="M10 30 L45 15 L45 85 L10 70 Z" fill={FILL} stroke={stroke} strokeWidth={2.5} />
      <path d="M55 20 L90 15 L90 85 L55 80 Z" fill={FILL_ALT} stroke={stroke} strokeWidth={2.5} />
      <line x1={45} y1={50} x2={55} y2={50} stroke={stroke} strokeWidth={2} />
    </g>
  );
}

function AgitatorShape({ ev }: DrawProps) {
  const stroke = alarmStroke(ev);
  const spin = ev.on;
  return (
    <g>
      <rect x={18} y={20} width={64} height={70} rx={4} fill={FILL} stroke={stroke} strokeWidth={2.5} />
      <line x1={50} y1={5} x2={50} y2={60} stroke={stroke} strokeWidth={3} />
      <rect x={46} y={4} width={8} height={10} fill={STROKE_ALT} />
      <g transform="translate(50 62)">
        {spin && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.8s" repeatCount="indefinite" additive="sum" />}
        <path d="M-22 0 L22 0 M-18 -4 L-22 0 L-18 4 M18 -4 L22 0 L18 4" stroke={spin ? ACCENT_ON : ACCENT_OFF} strokeWidth={3} fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

function HeatExchangerShellShape({ ev }: DrawProps) {
  const stroke = alarmStroke(ev);
  return (
    <g>
      <rect x={5} y={30} width={90} height={40} rx={6} fill={FILL} stroke={stroke} strokeWidth={2.5} />
      <line x1={15} y1={30} x2={15} y2={70} stroke={STROKE_ALT} />
      <line x1={85} y1={30} x2={85} y2={70} stroke={STROKE_ALT} />
      <path d="M15 50 L25 40 L35 60 L45 40 L55 60 L65 40 L75 60 L85 50" stroke={stroke} strokeWidth={1.5} fill="none" />
    </g>
  );
}

function HeatExchangerPlatesShape({ ev }: DrawProps) {
  const stroke = alarmStroke(ev);
  return (
    <g>
      <rect x={20} y={10} width={60} height={80} rx={3} fill={FILL} stroke={stroke} strokeWidth={2.5} />
      {[20, 30, 40, 50, 60, 70].map((y) => (
        <line key={y} x1={22} y1={y} x2={78} y2={y} stroke={STROKE_ALT} strokeWidth={0.8} />
      ))}
    </g>
  );
}

function ReactorShape({ ev, uid }: DrawProps) {
  const stroke = alarmStroke(ev);
  return (
    <g>
      <TankShape el={{} as ScadaElement} ev={ev} uid={uid} orientation="vertical" />
      <path d="M50 5 L50 30 M45 30 L55 30" stroke={stroke} strokeWidth={2} />
      <circle cx={50} cy={60} r={6} fill="none" stroke={STROKE_ALT} />
      <path d="M40 60 L60 60 M50 50 L50 70" stroke={STROKE_ALT} strokeWidth={1} />
    </g>
  );
}

function FilterShape({ ev }: DrawProps) {
  const stroke = alarmStroke(ev);
  return (
    <g>
      <path d="M15 10 L85 10 L60 55 L60 90 L40 90 L40 55 Z" fill={FILL} stroke={stroke} strokeWidth={2.5} />
      <line x1={30} y1={30} x2={70} y2={30} stroke={STROKE_ALT} strokeDasharray="2 2" />
    </g>
  );
}

function CicloneShape({ ev }: DrawProps) {
  const stroke = alarmStroke(ev);
  return (
    <g>
      <path d="M20 10 L80 10 L80 55 L60 95 L40 95 L20 55 Z" fill={FILL} stroke={stroke} strokeWidth={2.5} />
      <line x1={50} y1={10} x2={50} y2={5} stroke={stroke} strokeWidth={2} />
    </g>
  );
}

// --- Válvulas ---
function ValveBase({ ev, kind }: DrawProps & { kind: SymbolKind }) {
  const stroke = alarmStroke(ev);
  const open = ev.on || ev.value != null;
  const bodyFill = ev.on ? "#10b981" : ev.color ?? FILL;
  return (
    <g>
      <path d="M10 20 L50 50 L10 80 Z" fill={bodyFill} stroke={stroke} strokeWidth={2} />
      <path d="M90 20 L50 50 L90 80 Z" fill={bodyFill} stroke={stroke} strokeWidth={2} />
      {kind === "valv_globo" && <circle cx={50} cy={50} r={8} fill={FILL_ALT} stroke={stroke} strokeWidth={1.5} />}
      {kind === "valv_esfera" && <circle cx={50} cy={50} r={8} fill={FILL} stroke={stroke} strokeWidth={1.5} />}
      {kind === "valv_retencao" && <path d="M45 50 L55 42 L55 58 Z" fill={stroke} />}
      {kind === "valv_controle" && (
        <g>
          <line x1={50} y1={50} x2={50} y2={20} stroke={stroke} strokeWidth={2} />
          <rect x={35} y={5} width={30} height={15} rx={2} fill={FILL_ALT} stroke={stroke} strokeWidth={1.5} />
          <text x={50} y={16} textAnchor="middle" fontSize={9} fill={STROKE} fontFamily="monospace">FC</text>
        </g>
      )}
      {kind === "valv_alivio" && (
        <g>
          <line x1={50} y1={50} x2={50} y2={10} stroke={stroke} strokeWidth={2} />
          <path d="M40 10 L60 10 L50 0 Z" fill={FILL_ALT} stroke={stroke} strokeWidth={1.5} />
        </g>
      )}
      {kind === "valv_gaveta" && (
        <line x1={50} y1={20} x2={50} y2={80} stroke={STROKE} strokeWidth={1.5} />
      )}
    </g>
  );
}

function InstrumentShape({ el, ev }: DrawProps) {
  const letters = el.props.isaLetters ?? "TI";
  const tag = el.props.isaTag ?? "";
  const stroke = alarmStroke(ev);
  const alarmFill = ev.alarm === "alert" ? "rgba(239,68,68,0.2)" : ev.alarm === "warn" ? "rgba(245,158,11,0.15)" : FILL;
  return (
    <g>
      <circle cx={50} cy={50} r={45} fill={alarmFill} stroke={stroke} strokeWidth={2.5} />
      <line x1={5} y1={50} x2={95} y2={50} stroke={stroke} strokeWidth={1} />
      <text x={50} y={40} textAnchor="middle" fontSize={22} fontWeight="600" fill={STROKE} fontFamily="monospace">{letters}</text>
      <text x={50} y={72} textAnchor="middle" fontSize={16} fill={STROKE_ALT} fontFamily="monospace">{tag}</text>
    </g>
  );
}

function ShapeRect({ el, ev }: DrawProps) {
  return <rect x={2} y={2} width={96} height={96}
    fill={el.props.fillColor ?? "transparent"}
    stroke={el.props.strokeColor ?? alarmStroke(ev)}
    strokeWidth={el.props.strokeWidth ?? 2} rx={4} />;
}
function ShapeCircle({ el, ev }: DrawProps) {
  return <circle cx={50} cy={50} r={46}
    fill={el.props.fillColor ?? "transparent"}
    stroke={el.props.strokeColor ?? alarmStroke(ev)}
    strokeWidth={el.props.strokeWidth ?? 2} />;
}
function ShapePolygon({ el, ev }: DrawProps) {
  const pts = el.props.points ?? [{ x: 50, y: 5 }, { x: 95, y: 50 }, { x: 50, y: 95 }, { x: 5, y: 50 }];
  const d = pts.map((p) => `${p.x},${p.y}`).join(" ");
  return <polygon points={d} fill={el.props.fillColor ?? "transparent"}
    stroke={el.props.strokeColor ?? alarmStroke(ev)} strokeWidth={el.props.strokeWidth ?? 2} />;
}
function ArrowShape({ el, ev }: DrawProps) {
  return (
    <g>
      <line x1={5} y1={50} x2={80} y2={50}
        stroke={el.props.strokeColor ?? alarmStroke(ev)}
        strokeWidth={el.props.strokeWidth ?? 3} />
      <path d="M80 40 L95 50 L80 60 Z" fill={el.props.strokeColor ?? alarmStroke(ev)} />
    </g>
  );
}
function TextShape({ el }: DrawProps) {
  const text = el.props.text ?? "Texto";
  return <text x={50} y={60} textAnchor="middle"
    fontSize={el.props.fontSize ?? 28}
    fill={el.props.strokeColor ?? STROKE}
    fontFamily="sans-serif" fontWeight="600">{text}</text>;
}

export function SymbolRenderer(props: DrawProps) {
  const { el } = props;
  switch (el.kind) {
    case "tanque_vertical": case "silo": return <TankShape {...props} orientation="vertical" />;
    case "tanque_horizontal": return <TankShape {...props} orientation="horizontal" />;
    case "vaso_esferico": return <TankShape {...props} orientation="sphere" />;
    case "coluna": return <TankShape {...props} orientation="vertical" />;
    case "bomba_centrifuga": case "bomba_positiva": case "ventilador": return <PumpShape {...props} />;
    case "compressor": return <CompressorShape {...props} />;
    case "agitador": return <AgitatorShape {...props} />;
    case "trocador_casco": return <HeatExchangerShellShape {...props} />;
    case "trocador_placas": return <HeatExchangerPlatesShape {...props} />;
    case "reator": return <ReactorShape {...props} />;
    case "filtro": return <FilterShape {...props} />;
    case "ciclone": return <CicloneShape {...props} />;
    case "valv_gaveta": case "valv_globo": case "valv_esfera":
    case "valv_retencao": case "valv_controle": case "valv_alivio":
      return <ValveBase {...props} kind={el.kind} />;
    case "instrumento": return <InstrumentShape {...props} />;
    case "shape_rect": return <ShapeRect {...props} />;
    case "shape_circle": return <ShapeCircle {...props} />;
    case "shape_polygon": return <ShapePolygon {...props} />;
    case "arrow": return <ArrowShape {...props} />;
    case "text": return <TextShape {...props} />;
    default: return null;
  }
}

// Coordenadas absolutas da porta (no espaço do canvas).
export function portAbs(el: ScadaElement, portId: string): { x: number; y: number } {
  const p = symbolPorts(el.kind).find((pp) => pp.id === portId) ?? { id: "c", x: 50, y: 50 };
  return { x: el.x + (p.x / 100) * el.w, y: el.y + (p.y / 100) * el.h };
}
