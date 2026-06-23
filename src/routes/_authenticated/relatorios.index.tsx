import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Factory, Boxes, FlaskConical } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios/")({
  component: RelatoriosIndexPage,
});

const items = [
  { to: "/relatorios/producao", icon: Factory, label: "Produção", desc: "Diário, semanal, mensal, por equipamento e produto." },
  { to: "/relatorios/estoque", icon: Boxes, label: "Estoque", desc: "Movimentações, entradas, saídas e histórico." },
  { to: "/relatorios/qualidade", icon: FlaskConical, label: "Qualidade", desc: "Análises realizadas, tendências e histórico." },
] as const;

function RelatoriosIndexPage() {
  return (
    <div>
      <PageHeader title="Relatórios" description="Acesse os relatórios da operação." />
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((it) => (
          <Link key={it.to} to={it.to}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="p-5">
                <it.icon className="h-6 w-6 text-primary" />
                <div className="mt-3 text-base font-semibold">{it.label}</div>
                <p className="mt-1 text-sm text-muted-foreground">{it.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
