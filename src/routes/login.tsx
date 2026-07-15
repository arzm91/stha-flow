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

export const Route = createFileRoute("/login")({
  head: pageHead({
    title: "Entrar — STHA",
    description: "Acesse sua conta STHA para operar sua indústria em tempo real.",
    path: "/login",
  }),
  ssr: false,
  component: LoginPage,
});

// ---------------------------------------------------------------------------
// INTEGRAÇÃO FUTURA — autenticação real
// Substituir por chamada ao provedor (Supabase, OAuth etc.)
// ---------------------------------------------------------------------------
type LoginPayload = { email: string; password: string; remember: boolean };

async function loginUser(_payload: LoginPayload): Promise<{ ok: true }> {
  // TODO: integrar com autenticação real
  await new Promise((r) => setTimeout(r, 800));
  return { ok: true };
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Informe e-mail e senha.");
      return;
    }
    setLoading(true);
    try {
      await loginUser({ email, password, remember });
      toast.success("Autenticação simulada com sucesso.");
    } catch {
      toast.error("Não foi possível entrar. Verifique suas credenciais.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Acesse sua operação"
      subtitle="Entre com sua conta para continuar."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-slate-300">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-slate-300">Senha</Label>
            <a href="#" className="text-xs text-sky-400 hover:text-sky-300">
              Esqueci minha senha
            </a>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <Checkbox
            checked={remember}
            onCheckedChange={(v) => setRemember(v === true)}
          />
          Lembrar de mim
        </label>
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-sky-500 text-slate-950 shadow-[0_10px_30px_-10px_rgba(56,189,248,0.7)] hover:bg-sky-400"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando...
            </>
          ) : (
            "Entrar"
          )}
        </Button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
            <span className="bg-[#0b1120] px-2 text-slate-500">ou continue com</span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {/* Espaço preparado para OAuth futuro */}
          <button
            type="button"
            disabled
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 text-sm font-medium text-slate-400 opacity-70"
          >
            Google
          </button>
          <button
            type="button"
            disabled
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 text-sm font-medium text-slate-400 opacity-70"
          >
            Microsoft
          </button>
        </div>

        <p className="pt-2 text-center text-sm text-slate-400">
          Ainda não possui uma conta?{" "}
          <Link to="/signup" className="font-medium text-sky-400 hover:text-sky-300">
            Criar conta
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
