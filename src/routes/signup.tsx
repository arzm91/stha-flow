import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/landing/AuthShell";

export const Route = createFileRoute("/signup")({
  head: pageHead({
    title: "Criar conta — STHA",
    description: "Cadastre-se no STHA e comece a operar com mais visibilidade.",
    path: "/signup",
  }),
  ssr: false,
  component: SignupPage,
});

// ---------------------------------------------------------------------------
// INTEGRAÇÃO FUTURA — autenticação real
// Substituir por chamada de cadastro no provedor (Supabase, custom API...).
// ---------------------------------------------------------------------------
type SignupPayload = {
  nome: string;
  empresa: string;
  email: string;
  telefone: string;
  password: string;
};

async function signupUser(_payload: SignupPayload): Promise<{ ok: true }> {
  // TODO: integrar com cadastro real
  await new Promise((r) => setTimeout(r, 900));
  return { ok: true };
}

function SignupPage() {
  const [form, setForm] = useState({
    nome: "",
    empresa: "",
    email: "",
    telefone: "",
    password: "",
    confirm: "",
  });
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const update = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.empresa || !form.email || !form.telefone || !form.password) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    if (form.password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (form.password !== form.confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    if (!terms) {
      toast.error("Você precisa aceitar os termos de uso.");
      return;
    }
    setLoading(true);
    try {
      await signupUser({
        nome: form.nome,
        empresa: form.empresa,
        email: form.email,
        telefone: form.telefone,
        password: form.password,
      });
      setDone(true);
      toast.success("Cadastro simulado com sucesso!");
    } catch {
      toast.error("Não foi possível concluir o cadastro.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell
        title="Cadastro recebido!"
        subtitle="Em breve você poderá acessar sua conta STHA."
      >
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">
          Enviamos as instruções para o e-mail informado.
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/login"
            className="inline-flex h-10 items-center justify-center rounded-md bg-sky-500 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-400"
          >
            Ir para o login
          </Link>
          <Link to="/" className="text-center text-sm text-slate-400 hover:text-slate-200">
            Voltar para o site
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Comece a operar com mais visibilidade"
      subtitle="Crie sua conta STHA em poucos passos."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="nome" className="text-slate-300">Nome completo *</Label>
          <Input id="nome" value={form.nome} onChange={(e) => update("nome", e.target.value)} autoComplete="name" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="empresa" className="text-slate-300">Empresa *</Label>
            <Input id="empresa" value={form.empresa} onChange={(e) => update("empresa", e.target.value)} autoComplete="organization" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telefone" className="text-slate-300">Telefone *</Label>
            <Input id="telefone" value={form.telefone} onChange={(e) => update("telefone", e.target.value)} autoComplete="tel" inputMode="tel" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-slate-300">E-mail corporativo *</Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-slate-300">Senha *</Label>
            <Input id="password" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} minLength={6} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-slate-300">Confirmar senha *</Label>
            <Input id="confirm" type="password" value={form.confirm} onChange={(e) => update("confirm", e.target.value)} minLength={6} autoComplete="new-password" />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-300">
          <Checkbox
            className="mt-0.5"
            checked={terms}
            onCheckedChange={(v) => setTerms(v === true)}
          />
          <span>
            Li e concordo com os{" "}
            <a href="#" className="text-sky-400 hover:text-sky-300">termos de uso</a> e a{" "}
            <a href="#" className="text-sky-400 hover:text-sky-300">política de privacidade</a>.
          </span>
        </label>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-sky-500 text-slate-950 shadow-[0_10px_30px_-10px_rgba(56,189,248,0.7)] hover:bg-sky-400"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando conta...
            </>
          ) : (
            "Criar minha conta"
          )}
        </Button>

        <p className="pt-2 text-center text-sm text-slate-400">
          Já possui uma conta?{" "}
          <Link to="/login" className="font-medium text-sky-400 hover:text-sky-300">
            Entrar
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
