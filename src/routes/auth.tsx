import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import sthaLogo from "@/assets/stha_logo.png.asset.json";

import { signUpWithAccessCode } from "@/lib/signup.functions";

export const Route = createFileRoute("/auth")({
  head: pageHead({ title: "Acessar STHApc", description: "Entre na sua conta ou cadastre-se no STHApc — sistema de gestão industrial.", path: "/auth" }),
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const goNext = () => {
    if (next) window.location.assign(next);
    else navigate({ to: "/dashboard", replace: true });
  };
  const [loading, setLoading] = useState(false);

  // login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // signup
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [showAccessDeniedDialog, setShowAccessDeniedDialog] = useState(false);

  // recover
  const [recoverEmail, setRecoverEmail] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goNext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Login realizado");
    goNext();
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode.trim() !== SIGNUP_ACCESS_CODE) {
      setShowAccessDeniedDialog(true);
      return;
    }
    if (!nome.trim()) return toast.error("Informe seu nome");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${next ?? "/dashboard"}`,
        data: { nome, empresa },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Cadastro realizado. Você já pode entrar.");
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(recoverEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Se o e-mail existir, você receberá instruções.");
  };

  return (
    <main className="dark min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-2">
        <div className="hidden flex-col justify-between bg-gradient-to-br from-card via-background to-card p-12 lg:flex">
          <div className="flex items-center gap-3">
            <img src={sthaLogo.url} alt="STHA" className="h-14 w-auto object-contain" />
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Gestão Industrial</div>
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl font-bold leading-tight">
              Controle total da sua operação industrial.
            </h2>
            <p className="text-muted-foreground">
              Produção, estoque, qualidade, indicadores e rastreabilidade — em um único sistema
              moderno, responsivo e preparado para escalar.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">© STHApc · Sistema de Gestão Industrial</div>
        </div>

        <div className="flex items-center justify-center p-6">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="mb-4 flex justify-center lg:hidden">
                <img src={sthaLogo.url} alt="STHA" className="h-12 w-auto object-contain" />
              </div>
              <CardTitle><h1 className="text-xl font-semibold leading-none tracking-tight">Acessar STHApc</h1></CardTitle>
              <CardDescription>Entre na sua conta ou crie um novo cadastro.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="signup">Cadastro</TabsTrigger>
                  <TabsTrigger value="recover">Recuperar</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">E-mail</Label>
                      <Input id="login-email" type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Senha</Label>
                      <Input id="login-password" type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>Entrar</Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  <form onSubmit={handleSignup} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="access-code">Senha de acesso ao cadastro</Label>
                      <Input
                        id="access-code"
                        type="password"
                        required
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        placeholder="Senha fornecida pelo administrador"
                      />
                      <p className="text-xs text-muted-foreground">
                        Fornecida apenas a clientes do plano. Não possui? Solicite uma demonstração ao administrador.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nome">Nome</Label>
                      <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="empresa">Empresa</Label>
                      <Input id="empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">E-mail</Label>
                      <Input id="signup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Senha</Label>
                      <Input id="signup-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>Criar conta</Button>
                  </form>
                </TabsContent>

                <TabsContent value="recover">
                  <form onSubmit={handleRecover} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="recover-email">E-mail cadastrado</Label>
                      <Input id="recover-email" type="email" required value={recoverEmail} onChange={(e) => setRecoverEmail(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>Enviar instruções</Button>
                  </form>
                </TabsContent>
              </Tabs>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Ao continuar você concorda com os termos de uso do STHApc.{" "}
                <Link to="/" className="underline">Voltar</Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showAccessDeniedDialog} onOpenChange={setShowAccessDeniedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acesso ao cadastro restrito</DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <span className="block">
                A senha de acesso ao cadastro está incorreta ou não foi informada.
              </span>
              <span className="block">
                O cadastro no STHA é liberado apenas para clientes que aderiram ao plano de pagamento do sistema.
              </span>
              <span className="block">
                Para solicitar uma <strong>demonstração</strong> ou receber a senha de acesso, entre em contato com o administrador do sistema.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowAccessDeniedDialog(false)} className="w-full">
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
