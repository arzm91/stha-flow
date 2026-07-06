import { type RefObject, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, Loader2, Printer } from "lucide-react";
import { exportCsv, exportPdf, exportXlsx } from "@/lib/relatorios/export";
import type { ColumnDef, Row } from "@/lib/relatorios/types";
import { toast } from "sonner";

type Props = {
  name: string;
  fonteLabel: string;
  filtros: Array<[string, string]>;
  columns: ColumnDef[];
  rows: Row[];
  chartEnabled: boolean;
  previewRef: RefObject<HTMLDivElement | null>;
};

async function captureChartPng(previewRef: RefObject<HTMLDivElement | null>): Promise<string | undefined> {
  const svg = previewRef.current?.querySelector("svg");
  if (!svg) return undefined;
  const xml = new XMLSerializer().serializeToString(svg);
  const svg64 = btoa(unescape(encodeURIComponent(xml)));
  const src = "data:image/svg+xml;base64," + svg64;
  return await new Promise<string | undefined>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = (svg as SVGSVGElement).clientWidth * 2 || 1600;
      canvas.height = (svg as SVGSVGElement).clientHeight * 2 || 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(undefined);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

export function ExportMenu({ name, fonteLabel, filtros, columns, rows, chartEnabled, previewRef }: Props) {
  const [busy, setBusy] = useState(false);
  const headers = columns.map((c) => c.label);
  const keys = columns.map((c) => c.key);

  async function run(fn: () => Promise<void> | void) {
    setBusy(true);
    try { await fn(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run(async () => {
          const chart = chartEnabled ? await captureChartPng(previewRef) : undefined;
          await exportXlsx(name, headers, keys, rows, { fonte: fonteLabel, filtros }, chart);
        })}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(() => exportPdf(name, headers, keys, rows, { fonte: fonteLabel, filtros }))}>
          <FileText className="mr-2 h-4 w-4" /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(() => exportCsv(name, headers, keys, rows))}>
          <Download className="mr-2 h-4 w-4" /> CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
