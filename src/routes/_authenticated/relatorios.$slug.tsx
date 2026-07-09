import { createFileRoute, notFound } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { REPORTS } from "@/lib/reports-v2/registry";
import type { ReportSlug } from "@/lib/reports-v2/types";
import { ReportBySlug } from "@/components/reports-v2/views";
import { z } from "zod";

const search = z.object({
  equipamento: z.string().optional(),
  ordem: z.string().optional(),
  id: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/relatorios/$slug")({
  validateSearch: (s) => search.parse(s),
  head: ({ params }) => {
    const meta = REPORTS[(params as any).slug as ReportSlug];
    const title = meta ? `${meta.titulo} — STHApc` : "Relatório — STHApc";
    return pageHead({ title, description: meta?.descricao ?? "Relatório", path: "/relatorios" })({ params });
  },
  component: ReportViewer,
});

function ReportViewer() {
  const { slug } = Route.useParams();
  const s = Route.useSearch();
  const meta = REPORTS[slug as ReportSlug];
  if (!meta) throw notFound();
  return <ReportBySlug slug={slug as ReportSlug} params={{ equipamento: s.equipamento ?? "", ordem: s.ordem ?? "", id: s.id ?? "" }} />;
}
