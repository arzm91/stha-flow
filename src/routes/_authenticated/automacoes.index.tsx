import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/automacoes/")({
  component: () => <div className="p-6">Automacoes OK</div>,
});
