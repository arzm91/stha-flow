import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { UserManagementCard } from "@/components/configuracoes/UserManagementCard";
import { ModulesAccessCard } from "@/components/configuracoes/ModulesAccessCard";
import { EmailTemplatesCard } from "@/components/configuracoes/EmailTemplatesCard";
import { PushNotificationsCard } from "@/components/configuracoes/PushNotificationsCard";
import { usePagePermissions } from "@/hooks/usePagePermissions";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: pageHead({ title: "Configurações — STHApc", description: "Acesse e gerencie Configurações no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: "/configuracoes" }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, isGerente } = usePagePermissions();
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("nome,empresa,email").eq("id", u.user.id).maybeSingle();
      if (data) { setNome(data.nome ?? ""); setEmpresa(data.empresa ?? ""); setEmail(data.email ?? ""); }
    })();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("profiles").update({ nome, empresa }).eq("id", u.user.id);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
  };

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div>
      <PageHeader title="Configurações" description="Atualize seu perfil e gerencie a sessão." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Perfil</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Empresa</Label><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>E-mail</Label><Input value={email} disabled /></div>
              <Button type="submit" disabled={loading}>Salvar</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Sessão</CardTitle></CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Sair da conta</Button>
          </CardContent>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <PushNotificationsCard />
        <EmailTemplatesCard />
      </div>
      {(isAdmin || isGerente) && (
        <div className="mt-4">
          <UserManagementCard />
        </div>
      )}
    </div>
  );
}
