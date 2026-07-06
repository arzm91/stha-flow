import type { Aggregation, Row } from "./types";

function aggValue(vals: number[], op: Aggregation["op"]): number | null {
  if (op === "count") return vals.length;
  const nums = vals.filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  switch (op) {
    case "sum": return nums.reduce((a, b) => a + b, 0);
    case "avg": return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min": return Math.min(...nums);
    case "max": return Math.max(...nums);
  }
}

export function aggLabel(a: Aggregation): string {
  if (a.label) return a.label;
  const opLabel: Record<Aggregation["op"], string> = {
    sum: "Soma", avg: "Média", count: "Contagem", min: "Mín", max: "Máx",
  };
  return `${opLabel[a.op]} de ${a.column}`;
}

export function aggregate(rows: Row[], groupBy: string[], aggregations: Aggregation[]): {
  columns: string[];
  aggColumns: string[];
  rows: Row[];
} {
  if (!groupBy.length) {
    return { columns: [], aggColumns: aggregations.map(aggLabel), rows: rows };
  }
  const groups = new Map<string, { key: Row; buckets: Record<string, number[]> }>();
  for (const r of rows) {
    const keyObj: Row = {};
    const keyParts: string[] = [];
    for (const g of groupBy) {
      const v = r[g];
      keyObj[g] = v ?? "";
      keyParts.push(String(v ?? ""));
    }
    const k = keyParts.join("§");
    let g = groups.get(k);
    if (!g) {
      g = { key: keyObj, buckets: {} };
      for (const a of aggregations) g.buckets[aggLabel(a)] = [];
      groups.set(k, g);
    }
    for (const a of aggregations) {
      const v = a.op === "count" ? 1 : Number(r[a.column]);
      if (a.op === "count" || Number.isFinite(v)) g.buckets[aggLabel(a)].push(v);
    }
  }
  const outRows: Row[] = [];
  for (const { key, buckets } of groups.values()) {
    const row: Row = { ...key };
    for (const a of aggregations) {
      const val = aggValue(buckets[aggLabel(a)] ?? [], a.op);
      row[aggLabel(a)] = val == null ? null : Math.round(val * 100) / 100;
    }
    outRows.push(row);
  }
  // Sort by first group column
  outRows.sort((a, b) => String(a[groupBy[0]] ?? "").localeCompare(String(b[groupBy[0]] ?? "")));
  return { columns: groupBy, aggColumns: aggregations.map(aggLabel), rows: outRows };
}
