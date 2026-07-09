import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export function ReportShell({
  title, subtitle, accent = "#2563eb", periodo, children, onRefresh, actions, backTo = "/relatorios",
}: {
  title: string;
  subtitle?: string;
  accent?: string;
  periodo?: string;
  onRefresh?: () => void;
  actions?: ReactNode;
  backTo?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const now = new Date().toLocaleString("pt-BR");

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      {/* Toolbar (não imprime) */}
      <div className="print:hidden flex items-center gap-2 border-b bg-white px-4 py-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: backTo })}>
          <ArrowLeft className="mr-1 h-4 w-4" />Voltar
        </Button>
        <div className="flex-1" />
        {actions}
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-1 h-4 w-4" />Atualizar
          </Button>
        )}
        <Button size="sm" onClick={() => window.print()} style={{ background: accent }}>
          <Printer className="mr-1 h-4 w-4" />Imprimir / PDF
        </Button>
      </div>

      {/* Documento */}
      <div className="flex-1 overflow-auto">
        <div className="report-doc mx-auto my-4 max-w-[210mm] bg-white p-8 shadow-lg print:my-0 print:shadow-none">
          {/* Header */}
          <div className="mb-6 border-b-4 pb-4" style={{ borderColor: accent }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">STHA Cloud · Relatório</div>
                <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
              </div>
              <div className="text-right text-[10px] text-slate-500">
                <div className="font-semibold text-slate-700">Gerado em</div>
                <div>{now}</div>
                {periodo && <div className="mt-1"><span className="font-semibold text-slate-700">Período: </span>{periodo}</div>}
              </div>
            </div>
          </div>

          {children}

          <div className="mt-8 border-t pt-3 text-center text-[10px] text-slate-400">
            STHA Cloud · sthapc.cloud · Documento gerado automaticamente
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
          .report-doc { padding: 0 !important; box-shadow: none !important; max-width: none !important; }
          .print\\:hidden { display: none !important; }
          .break-avoid { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
