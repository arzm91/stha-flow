import { pageHead } from "@/lib/seo";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: pageHead({ title: "STHApc — Gestão Industrial", description: "STHApc: sistema de gestão industrial — produção, estoque, qualidade, indicadores e rastreabilidade.", path: "/" }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
