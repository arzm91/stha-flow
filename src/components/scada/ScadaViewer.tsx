// Modo somente-leitura para exibir o supervisório salvo na tela de produção.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Workflow } from "lucide-react";
import { migrateLegacy } from "./types";
import { ScadaCanvas } from "./ScadaCanvas";

export function ScadaViewer({ equipamentoId }: { equipamentoId: string }) {
  const q = useQuery({
    queryKey: ["scada-viewer", equipamentoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("pfd_graph,nome").eq("id", equipamentoId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading || !q.data?.pfd_graph) return null;
  const doc = migrateLegacy(q.data.pfd_graph);
  if (doc.elements.length === 0) return null;
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Workflow className="h-4 w-4" /> Supervisório
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScadaCanvas doc={doc} readOnly height={480} />
      </CardContent>
    </Card>
  );
}
