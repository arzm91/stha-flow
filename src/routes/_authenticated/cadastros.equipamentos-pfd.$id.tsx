import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { ScadaDoc } from "@/components/scada/types";
import { emptyDoc, migrateLegacy } from "@/components/scada/types";
import { ScadaEditor } from "@/components/scada/ScadaEditor";

export const Route = createFileRoute("/_authenticated/cadastros/equipamentos-pfd/$id")({
  component: ScadaEditorPage,
});

function ScadaEditorPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [doc, setDoc] = useState<ScadaDoc>(emptyDoc());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const q = useQuery({
    queryKey: ["scada-editor", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("nome,pfd_graph").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (q.data?.pfd_graph) setDoc(migrateLegacy(q.data.pfd_graph));
  }, [q.data]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("equipamentos").update({ pfd_graph: doc as never }).eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Supervisório salvo");
    setDirty(false);
  };

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => nav({ to: "/cadastros/equipamentos" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        <h1 className="text-lg font-semibold">
          Supervisório · <span className="text-muted-foreground">{q.data?.nome ?? ""}</span>
        </h1>
        {dirty && <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-500">alterações não salvas</span>}
      </div>
      <ScadaEditor
        doc={doc}
        onChange={(d) => { setDoc(d); setDirty(true); }}
        onSave={save}
        saving={saving}
      />
    </div>
  );
}
