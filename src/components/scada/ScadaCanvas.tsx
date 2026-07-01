// Canvas SVG que renderiza um ScadaDoc com pan/zoom, grid, elementos, tubulações
// e (opcional) interações de edição: seleção, arrastar, redimensionar, portas clicáveis.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { ScadaDoc, ScadaElement, ScadaPipe } from "./types";
import { FLUID_COLORS } from "./types";
import { SymbolRenderer, portAbs, symbolPorts } from "./symbols";
import { evaluateBindings, type EvaluatedBindings } from "./bindings";
import { useTagsLive } from "./useTagsLive";

type Pending = { fromEl: string; fromPort: string } | null;

export type ScadaCanvasProps = {
  doc: ScadaDoc;
  readOnly?: boolean;
  selectedIds?: string[];
  onSelect?: (ids: string[]) => void;
  onChange?: (doc: ScadaDoc) => void;
  onConnect?: (fromEl: string, fromPort: string, toEl: string, toPort: string) => void;
  className?: string;
  height?: number | string;
};

function orthogonalPath(from: { x: number; y: number }, to: { x: number; y: number }, fromPort: string, toPort: string): string {
  // roteamento simples em cotovelos: sai perpendicular à porta e entra perpendicular à porta.
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const horiz = (p: string) => p === "left" || p === "right";
  const p1 = horiz(fromPort) ? { x: midX, y: from.y } : { x: from.x, y: midY };
  const p2 = horiz(toPort) ? { x: midX, y: to.y } : { x: to.x, y: midY };
  return `M ${from.x} ${from.y} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${to.x} ${to.y}`;
}

export function ScadaCanvas({
  doc, readOnly = false, selectedIds = [], onSelect, onChange, onConnect,
  className, height = "70vh",
}: ScadaCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [panning, setPanning] = useState<{ startX: number; startY: number; vx: number; vy: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; startX: number; startY: number; origW: number; origH: number } | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [snap, setSnap] = useState(true);

  const { tagsMap, alertasMap } = useTagsLive();

  const evalCache = useMemo(() => {
    const m = new Map<string, EvaluatedBindings>();
    doc.elements.forEach((el) => m.set(el.id, evaluateBindings(el.bindings, tagsMap, alertasMap)));
    return m;
  }, [doc.elements, tagsMap, alertasMap]);

  const grid = doc.canvas.grid;
  const snapVal = useCallback((v: number) => snap ? Math.round(v / grid) * grid : v, [snap, grid]);

  // Conversão pixel-tela -> coordenada do doc
  const toDoc = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.k,
      y: (clientY - rect.top - view.y) / view.k,
    };
  }, [view]);

  // Zoom com wheel
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const cx = e.clientX - rect.left; const cy = e.clientY - rect.top;
      const delta = -e.deltaY * 0.0015;
      setView((v) => {
        const k = Math.max(0.25, Math.min(3, v.k * (1 + delta)));
        const ratio = k / v.k;
        return { k, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // Mouse handlers
  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // pan com botão do meio ou space+arraste (aqui: botão direito ou middle)
    if (e.button === 1 || e.button === 2 || (e.target === svgRef.current && e.button === 0 && !e.shiftKey)) {
      setPanning({ startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y });
      if (e.target === svgRef.current && e.button === 0) onSelect?.([]);
    }
  };
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (panning) {
      setView((v) => ({ ...v, x: panning.vx + (e.clientX - panning.startX), y: panning.vy + (e.clientY - panning.startY) }));
      return;
    }
    if (drag && !readOnly && onChange) {
      const p = toDoc(e.clientX, e.clientY);
      const nx = snapVal(drag.origX + (p.x - drag.startX));
      const ny = snapVal(drag.origY + (p.y - drag.startY));
      onChange({ ...doc, elements: doc.elements.map((el) => el.id === drag.id ? { ...el, x: nx, y: ny } : el) });
    }
    if (resize && !readOnly && onChange) {
      const p = toDoc(e.clientX, e.clientY);
      const nw = Math.max(20, snapVal(resize.origW + (p.x - resize.startX)));
      const nh = Math.max(20, snapVal(resize.origH + (p.y - resize.startY)));
      onChange({ ...doc, elements: doc.elements.map((el) => el.id === resize.id ? { ...el, w: nw, h: nh } : el) });
    }
  };
  const onMouseUp = () => { setPanning(null); setDrag(null); setResize(null); };

  const startDrag = (e: React.MouseEvent, el: ScadaElement) => {
    if (readOnly) return;
    e.stopPropagation();
    onSelect?.(e.shiftKey ? [...selectedIds, el.id] : [el.id]);
    const p = toDoc(e.clientX, e.clientY);
    setDrag({ id: el.id, startX: p.x, startY: p.y, origX: el.x, origY: el.y });
  };

  const startResize = (e: React.MouseEvent, el: ScadaElement) => {
    if (readOnly) return;
    e.stopPropagation();
    const p = toDoc(e.clientX, e.clientY);
    setResize({ id: el.id, startX: p.x, startY: p.y, origW: el.w, origH: el.h });
  };

  const clickPort = (e: React.MouseEvent, el: ScadaElement, portId: string) => {
    if (readOnly || !onConnect) return;
    e.stopPropagation();
    if (!pending) { setPending({ fromEl: el.id, fromPort: portId }); return; }
    if (pending.fromEl !== el.id) onConnect(pending.fromEl, pending.fromPort, el.id, portId);
    setPending(null);
  };

  const visibleLayers = new Set(doc.layers.filter((l) => l.visible).map((l) => l.id));
  const layerZ = new Map(doc.layers.map((l) => [l.id, l.z]));
  const orderedEls = [...doc.elements]
    .filter((el) => visibleLayers.has(el.layerId))
    .sort((a, b) => ((layerZ.get(a.layerId) ?? 0) - (layerZ.get(b.layerId) ?? 0)) || a.z - b.z);
  const orderedPipes = doc.pipes.filter((p) => visibleLayers.has(p.layerId));

  return (
    <div className={className} style={{ height, background: doc.canvas.bg, borderRadius: 8, position: "relative", overflow: "hidden" }}>
      <svg
        ref={svgRef}
        width="100%" height="100%"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: panning ? "grabbing" : pending ? "crosshair" : "default", userSelect: "none" }}
      >
        <defs>
          <pattern id="scada-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
            <circle cx={0.5} cy={0.5} r={0.6} fill="#334155" />
          </pattern>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <rect x={0} y={0} width={doc.canvas.width} height={doc.canvas.height} fill="url(#scada-grid)" />
          {/* pipes */}
          {orderedPipes.map((pipe) => {
            const from = doc.elements.find((e) => e.id === pipe.fromEl);
            const to = doc.elements.find((e) => e.id === pipe.toEl);
            if (!from || !to) return null;
            const a = portAbs(from, pipe.fromPort);
            const b = portAbs(to, pipe.toPort);
            const path = orthogonalPath(a, b, pipe.fromPort, pipe.toPort);
            const color = FLUID_COLORS[pipe.fluid];
            const on = pipe.onOff ? (evaluateBindings({ onOff: pipe.onOff }, tagsMap, alertasMap).on) : pipe.animated;
            return (
              <g key={pipe.id}>
                <path d={path} fill="none" stroke={color} strokeWidth={pipe.thickness} strokeLinecap="round" strokeLinejoin="round" />
                {on && (
                  <path d={path} fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={pipe.thickness} strokeDasharray="6 10" strokeLinecap="round">
                    <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="0.7s" repeatCount="indefinite" />
                  </path>
                )}
                {/* seta */}
                <polygon
                  points={`${b.x},${b.y} ${b.x - 8},${b.y - 5} ${b.x - 8},${b.y + 5}`}
                  transform={`rotate(${pipe.toPort === "left" ? 0 : pipe.toPort === "right" ? 180 : pipe.toPort === "top" ? 90 : -90} ${b.x} ${b.y})`}
                  fill={color}
                />
                {pipe.label && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} fontSize={10} fill={color} textAnchor="middle" fontFamily="monospace">{pipe.label}</text>}
              </g>
            );
          })}
          {/* elementos */}
          {orderedEls.map((el) => {
            const ev = evalCache.get(el.id)!;
            const selected = selectedIds.includes(el.id);
            const showValue = ev.value && !["text", "arrow", "shape_rect", "shape_circle", "shape_polygon"].includes(el.kind);
            return (
              <g key={el.id} transform={`translate(${el.x} ${el.y}) rotate(${el.rot} ${el.w / 2} ${el.h / 2})`}>
                <g onMouseDown={(e) => startDrag(e, el)} style={{ cursor: readOnly ? "default" : "move" }}>
                  <g transform={`scale(${el.w / 100} ${el.h / 100})`}>
                    <SymbolRenderer el={el} ev={ev} uid={el.id.slice(0, 8)} />
                  </g>
                  {el.label && el.kind !== "text" && (
                    <text x={el.w / 2} y={el.h + 14} textAnchor="middle" fontSize={12} fill="#e2e8f0" fontFamily="monospace">{el.label}</text>
                  )}
                  {showValue && (
                    <g transform={`translate(${el.w / 2} ${el.h - 8})`}>
                      <rect x={-38} y={-14} width={76} height={20} rx={4} fill="rgba(0,0,0,0.55)" />
                      <text x={0} y={1} textAnchor="middle" fontSize={12} fill="#f8fafc" fontFamily="monospace" fontWeight="600">
                        {ev.value!.text}{ev.value!.unit ? ` ${ev.value!.unit}` : ""}
                      </text>
                    </g>
                  )}
                </g>
                {selected && !readOnly && (
                  <>
                    <rect x={-2} y={-2} width={el.w + 4} height={el.h + 4} fill="none" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" />
                    <rect x={el.w - 4} y={el.h - 4} width={10} height={10} fill="#38bdf8"
                      onMouseDown={(e) => startResize(e, el)}
                      style={{ cursor: "nwse-resize" }} />
                  </>
                )}
                {!readOnly && onConnect && symbolPorts(el.kind).map((p) => (
                  <circle key={p.id}
                    cx={(p.x / 100) * el.w} cy={(p.y / 100) * el.h} r={5}
                    fill={pending?.fromEl === el.id && pending?.fromPort === p.id ? "#f97316" : "#38bdf8"}
                    stroke="#0f172a" strokeWidth={1.5}
                    onMouseDown={(e) => clickPort(e, el, p.id)}
                    style={{ cursor: "crosshair" }} />
                ))}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
