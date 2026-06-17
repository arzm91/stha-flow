import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/relatorios")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/relatorios" || location.pathname === "/relatorios/") {
      throw redirect({ to: "/relatorios/producao" });
    }
  },
  component: () => <Outlet />,
});
