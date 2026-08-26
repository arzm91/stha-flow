import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Bell, LogOut, Mail, Shield, User, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { UserManagementCard } from "@/components/configuracoes/UserManagementCard";
import { ModulesAccessCard } from "@/components/configuracoes/ModulesAccessCard";
import { EmailTemplatesCard } from "@/components/configuracoes/EmailTemplatesCard";
import { PushNotificationsCard } from "@/components/configuracoes/PushNotificationsCard";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: pageHead({ title: "Configurações — STHApc", description: "Acesse e gerencie Configurações no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: "/configuracoes" }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
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
    if (!u.user) { setLoading(false); return; }
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

  const tabs = [
    { value: "conta", label: "Minha conta", icon: User, hint: "Perfil e sessão" },
    { value: "notificacoes", label: "Notificações", icon: Bell, hint: "Push e e-mail" },
    { value: "equipe", label: "Equipe", icon: Users, hint: "Usuários e convites" },
    { value: "modulos", label: "Módulos", icon: Shield, hint: "Acesso por página" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Configurações" description="Gerencie sua conta, notificações, equipe e acessos da empresa." />

      <Tabs defaultValue="conta" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          {tabs.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="flex flex-col items-center gap-0.5 py-2 sm:flex-row sm:gap-2 sm:py-1.5">
              <Icon className="h-4 w-4" />
              <span className="text-xs sm:text-sm">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="conta" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4 text-muted-foreground" />Perfil</CardTitle>
              <CardDescription>Seus dados de identificação no sistema.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={save} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
                  <div className="space-y-1.5"><Label>Empresa</Label><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} /></div>
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input value={email} disabled />
                  <p className="text-xs text-muted-foreground">O e-mail é gerenciado pela autenticação e não pode ser alterado aqui.</p>
                </div>
                <div className="flex items-center justify-end">
                  <Button type="submit" disabled={loading}>{loading ? "Salvando…" : "Salvar alterações"}</Button>
                </div>
              </form>
              <Separator className="my-6" />
              <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Sessão</p>
                  <p className="text-xs text-muted-foreground">Encerra o acesso neste dispositivo.</p>
                </div>
                <Button variant="destructive" onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Sair da conta</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notificacoes" className="mt-4 space-y-4">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <PushNotificationsCard />
            <EmailTemplatesCard />
          </div>
        </TabsContent>

        <TabsContent value="equipe" className="mt-4">
          <UserManagementCard />
        </TabsContent>

        <TabsContent value="modulos" className="mt-4">
          <ModulesAccessCard />
        </TabsContent>
      </Tabs>

      {/* ícone usado só para evitar import órfão caso cards internos mudem */}
      <span className="hidden"><Mail className="h-0 w-0" /></span>
    </div>
  );
}
