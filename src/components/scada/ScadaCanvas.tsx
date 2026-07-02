// Canvas SVG que renderiza um ScadaDoc — modo fit-to-view (estático), sem pan/zoom.
// O conteúdo escala pra caber no container mantendo aspecto (viewBox + preserveAspectRatio),
// para que o editor mostre exatamente o mesmo enquadramento do viewer de produção.
import { useCallback, useRef, useState } from "react";
import type { ScadaDoc, ScadaElement } from "./types";
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
  const [drag, setDrag] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; startX: number; startY: number; origW: number; origH: number } | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const snap = true;

  const { tagsMap, alertasMap } = useTagsLive();

  const grid = doc.canvas.grid;
  const snapVal = useCallback((v: number) => snap ? Math.round(v / grid) * grid : v, [snap, grid]);

  // Converte pixel-tela -> coordenada do doc usando o CTM do SVG (respeita viewBox/preserveAspectRatio).
  const toDoc = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.target === svgRef.current && e.button === 0) onSelect?.([]);
  };
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
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
  const onMouseUp = () => { setDrag(null); setResize(null); };

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

  const evalCache = new Map<string, EvaluatedBindings>();
  doc.elements.forEach((el) => evalCache.set(el.id, evaluateBindings(el.bindings, tagsMap, alertasMap)));

  const visibleLayers = new Set(doc.layers.filter((l) => l.visible).map((l) => l.id));
  const layerZ = new Map(doc.layers.map((l) => [l.id, l.z]));
  const orderedEls = [...doc.elements]
    .filter((el) => visibleLayers.has(el.layerId))
    .sort((a, b) => ((layerZ.get(a.layerId) ?? 0) - (layerZ.get(b.layerId) ?? 0)) || a.z - b.z);
  const orderedPipes = doc.pipes.filter((p) => visibleLayers.has(p.layerId));

  const [zoom, setZoom] = useState(1);
  const canZoom = !readOnly;
  const onWheel = (e: React.WheelEvent) => {
    if (!canZoom || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom((z) => Math.max(0.3, Math.min(4, z - e.deltaY * 0.0015)));
  };

  return (
    <div className={className} style={{ height, background: doc.canvas.bg, borderRadius: 8, position: "relative", overflow: canZoom ? "auto" : "hidden" }} onWheel={onWheel}>
      {canZoom && (
        <div style={{ position: "sticky", top: 8, left: 8, zIndex: 10, display: "inline-flex", gap: 4, background: "rgba(15,23,42,0.85)", padding: "4px 6px", borderRadius: 6, marginLeft: 8, marginTop: 8, width: "fit-content", alignItems: "center", fontSize: 12, color: "#e2e8f0", fontFamily: "monospace" }}>
          <button type="button" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} style={{ width: 22, height: 22, background: "#1e293b", color: "#e2e8f0", borderRadius: 4, border: "none", cursor: "pointer" }}>−</button>
          <span style={{ minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.1))} style={{ width: 22, height: 22, background: "#1e293b", color: "#e2e8f0", borderRadius: 4, border: "none", cursor: "pointer" }}>+</button>
          <button type="button" onClick={() => setZoom(1)} style={{ height: 22, padding: "0 6px", background: "#1e293b", color: "#e2e8f0", borderRadius: 4, border: "none", cursor: "pointer" }}>reset</button>
        </div>
      )}
      <svg
        ref={svgRef}
        width={canZoom ? `${zoom * 100}%` : "100%"}
        height={canZoom ? `${zoom * 100}%` : "100%"}
        viewBox={`0 0 ${doc.canvas.width} ${doc.canvas.height}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ cursor: pending ? "crosshair" : "default", userSelect: "none", display: "block", marginTop: canZoom ? -30 : 0 }}
      >

        <defs>
          <pattern id="scada-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
            <circle cx={0.5} cy={0.5} r={0.6} fill="#334155" />
          </pattern>
        </defs>
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
          const valueFs = el.bindings?.value?.fontSize ?? 14;
          const valueText = ev.value ? `${ev.value.text}${ev.value.unit ? ` ${ev.value.unit}` : ""}` : "";
          const boxW = Math.max(76, valueText.length * valueFs * 0.62 + 20);
          const boxH = valueFs + 10;
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
                    <rect x={-boxW / 2} y={-boxH + 4} width={boxW} height={boxH} rx={4} fill="rgba(0,0,0,0.65)" />
                    <text x={0} y={0} textAnchor="middle" dominantBaseline="middle" fontSize={valueFs} fill="#f8fafc" fontFamily="monospace" fontWeight="700" transform={`translate(0 ${-boxH / 2 + 4})`}>
                      {valueText}
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
      </svg>
    </div>
  );
}
