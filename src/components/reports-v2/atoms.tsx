import { type ReactNode } from "react";

export function KpiCard({
  label, value, hint, tone = "default",
}: { label: string; value: ReactNode; hint?: string; tone?: "default" | "primary" | "success" | "warning" | "danger" }) {
  const toneClass = {
    default: "text-slate-900",
    primary: "text-blue-700",
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-red-700",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, accent = "#2563eb" }: { children: ReactNode; accent?: string }) {
  return (
    <div className="mt-6 mb-3 flex items-center gap-2">
      <div className="h-5 w-1 rounded-sm" style={{ background: accent }} />
      <h2 className="text-base font-bold text-slate-800">{children}</h2>
    </div>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, string> = {
    finalizada: "bg-emerald-100 text-emerald-800 border-emerald-200",
    em_andamento: "bg-blue-100 text-blue-800 border-blue-200",
    programada: "bg-amber-100 text-amber-800 border-amber-200",
    aberta: "bg-amber-100 text-amber-800 border-amber-200",
    cancelada: "bg-slate-100 text-slate-600 border-slate-200",
    resolvido: "bg-emerald-100 text-emerald-800 border-emerald-200",
    aberto: "bg-red-100 text-red-800 border-red-200",
  };
  const cls = map[status || ""] || "bg-slate-100 text-slate-700 border-slate-200";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{status ?? "—"}</span>;
}

export function SeverityBadge({ sev }: { sev: string | null | undefined }) {
  const map: Record<string, string> = {
    critical: "bg-red-600 text-white",
    high: "bg-orange-500 text-white",
    warn: "bg-amber-400 text-amber-900",
    warning: "bg-amber-400 text-amber-900",
    info: "bg-blue-100 text-blue-800",
    low: "bg-slate-200 text-slate-700",
  };
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${map[sev || "info"] || "bg-slate-200"}`}>{sev ?? "info"}</span>;
}

export function DataTable<T>({
  rows, columns, empty = "Sem dados", zebra = true,
}: {
  rows: T[];
  columns: Array<{ header: string; cell: (r: T, i: number) => ReactNode; className?: string; align?: "left" | "right" | "center" }>;
  empty?: string;
  zebra?: boolean;
}) {
  if (!rows.length) return <div className="rounded border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">{empty}</div>;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead className="bg-slate-100">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={`px-2 py-2 text-${c.align ?? "left"} font-semibold text-slate-700 ${c.className ?? ""}`}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={zebra && i % 2 ? "bg-slate-50" : ""}>
              {columns.map((c, ci) => (
                <td key={ci} className={`px-2 py-1.5 text-${c.align ?? "left"} ${c.className ?? ""} text-slate-800`}>{c.cell(r, i)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// SVG bar chart horizontal para top-N
export function HBarChart({ data, valueKey = "value", labelKey = "label", color = "#2563eb", max = 5 }: {
  data: Array<Record<string, any>>; valueKey?: string; labelKey?: string; color?: string; max?: number;
}) {
  const top = [...data].sort((a, b) => (b[valueKey] || 0) - (a[valueKey] || 0)).slice(0, max);
  const maxVal = Math.max(1, ...top.map((d) => d[valueKey] || 0));
  return (
    <div className="space-y-1.5">
      {top.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-32 truncate text-slate-700">{d[labelKey]}</div>
          <div className="relative h-4 flex-1 rounded bg-slate-100">
            <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${(d[valueKey] / maxVal) * 100}%`, background: color }} />
          </div>
          <div className="w-14 text-right font-mono text-slate-700">{d[valueKey]?.toLocaleString?.("pt-BR") ?? d[valueKey]}</div>
        </div>
      ))}
    </div>
  );
}
