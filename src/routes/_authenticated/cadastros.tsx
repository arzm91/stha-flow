import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Cpu, Package, Gauge, FlaskConical, Database, Wheat, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/cadastros/equipamentos", label: "Equipamentos", icon: Cpu },
  { to: "/cadastros/utilidades", label: "Utilidades", icon: Wrench },
  { to: "/cadastros/produtos", label: "Produtos", icon: Package },
  { to: "/cadastros/materias-primas", label: "Matérias-primas", icon: Wheat },
  { to: "/cadastros/parametros", label: "Parâmetros", icon: Gauge },
  { to: "/cadastros/analises", label: "Análises", icon: FlaskConical },
  { to: "/cadastros/tanques", label: "Locais", icon: Database },
] as const;

export const Route = createFileRoute("/_authenticated/cadastros")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/cadastros" || location.pathname === "/cadastros/") {
      throw redirect({ to: "/cadastros/equipamentos" });
    }
  },
  component: CadastrosLayout,
});

function CadastrosLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors -mb-px",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
