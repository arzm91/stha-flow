import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { AcompanhamentoView } from "./producao.$id";

export const Route = createFileRoute("/_authenticated/producao/equipamento/$equipId")({
  head: pageHead({ title: "Produção · Acompanhar equipamento — STHApc", description: "Acompanhamento contínuo do equipamento nas últimas 24 horas: produção, índices, paradas, análises e tags.", path: (p) => `/producao/equipamento/${p.equipId}` }),
  component: EquipPage,
});

function EquipPage() {
  const { equipId } = Route.useParams() as { equipId: string };
  return <AcompanhamentoView key={equipId} equipId={equipId} />;
}
