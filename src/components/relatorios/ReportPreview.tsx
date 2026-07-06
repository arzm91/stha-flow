import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ChartConfig, ColumnDef, Row } from "@/lib/relatorios/types";

const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#eab308", "#ef4444", "#8b5cf6", "#06b6d4"];

function fmt(v: unknown, type: ColumnDef["type"]): string {
  if (v == null || v === "") return "—";
  if (type === "datetime") { const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR"); }
  if (type === "date") { const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR"); }
  if (type === "duration_seg") {
    const s = Number(v); if (!Number.isFinite(s)) return String(v);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return h > 0 ? `${h}h ${m}min` : m > 0 ? `${m}min ${sec}s` : `${sec}s`;
  }
  if (type === "number") { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString("pt-BR") : String(v); }
  return String(v);
}

type Props = {
  title: string;
  fonteLabel: string;
  filtros: Array<[string, string]>;
  columns: ColumnDef[];
  rows: Row[];
  chart: ChartConfig;
  groupBy: string[];
  firstAggLabel?: string;
};

export function ReportPreview({ title, fonteLabel, filtros, columns, rows, chart, groupBy, firstAggLabel }: Props) {
  const showChart = chart.enabled && groupBy.length > 0 && !!firstAggLabel && rows.length > 0;
  const chartData = showChart
    ? rows.map((r) => ({ name: String(r[groupBy[0]] ?? ""), value: Number(r[firstAggLabel!]) || 0 }))
    : [];

  return (
    <Card className="p-0 print:border-none print:shadow-none">
      <div className="border-b border-border p-4 print:p-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-1 text-xs text-muted-foreground">
          {fonteLabel}
          {filtros.length > 0 && (
            <> · {filtros.map(([k, v]) => `${k}: ${v}`).join(" · ")}</>
          )}
        </div>
      </div>

      {showChart && (
        <div className="border-b border-border p-4 print:break-inside-avoid">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chart.type === "bar" ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="value" fill={COLORS[0]} name={firstAggLabel} />
                </BarChart>
              ) : chart.type === "line" ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke={COLORS[0]} name={firstAggLabel} />
                </LineChart>
              ) : (
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={100} label>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.numeric ? "text-right" : ""}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} className="py-8 text-center text-sm text-muted-foreground">Nenhum resultado.</TableCell></TableRow>
            ) : rows.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.numeric ? "text-right tabular-nums" : ""}>{fmt(r[c.key], c.type)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
