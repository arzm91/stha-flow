import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { REPORT_LIST } from "@/lib/reports-v2/registry";
import { Package, Factory, Gauge, CalendarRange, Wrench, ClipboardCheck, ScrollText, BellRing, FileText, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
  Package: <Package className="h-6 w-6" />,
  Factory: <Factory className="h-6 w-6" />,
  Gauge: <Gauge className="h-6 w-6" />,
  CalendarRange: <CalendarRange className="h-6 w-6" />,
  Wrench: <Wrench className="h-6 w-6" />,
  ClipboardCheck: <ClipboardCheck className="h-6 w-6" />,
  ScrollText: <ScrollText className="h-6 w-6" />,
  BellRing: <BellRing className="h-6 w-6" />,
};

const CATEGORIAS: Record<string, string> = {
  estoque: "Estoque",
  producao: "Produção",
  manutencao: "Manutenção",
  alertas: "Alertas",
};

export const Route = createFileRoute("/_authenticated/relatorios/")({
  head: pageHead({ title: "Relatórios — STHApc", description: "Relatórios pré-definidos do sistema.", path: "/relatorios" }),
  component: ReportsIndex,
});

function ReportsIndex() {
  const grupos = REPORT_LIST.reduce<Record<string, typeof REPORT_LIST>>((acc, r) => {
    (acc[r.categoria] ||= []).push(r);
    return acc;
  }, {});
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Relatórios" description="Relatórios prontos do sistema. Clique para gerar, visualizar e imprimir/baixar em PDF." icon={<FileText className="h-5 w-5" />} />
      <div className="flex-1 space-y-6 overflow-auto p-4 md:p-6">
        {Object.entries(grupos).map(([cat, items]) => (
          <section key={cat}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">{CATEGORIAS[cat]}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((r) => (
                <Link key={r.slug} to="/relatorios/$slug" params={{ slug: r.slug }}>
                  <Card className="group h-full cursor-pointer border-2 transition hover:shadow-md" style={{ borderLeftColor: r.cor, borderLeftWidth: 6 }}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg p-2 text-white" style={{ background: r.cor }}>{ICONS[r.icone]}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-foreground">{r.titulo}</div>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.descricao}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
                      </div>
                      {r.precisaParam && (
                        <div className="mt-3 text-[10px] uppercase tracking-wider text-amber-600">
                          Precisa selecionar {r.precisaParam === "equipamento" ? "equipamento" : r.precisaParam === "ordem-producao" ? "ordem de produção" : "OS"}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
