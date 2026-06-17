import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Boxes, Factory, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/relatorios/producao", label: "Produção", icon: Factory },
  { to: "/relatorios/estoque", label: "Estoque", icon: Boxes },
  { to: "/relatorios/qualidade", label: "Qualidade", icon: FlaskConical },
] as const;

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosLayout,
});

function RelatoriosLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
