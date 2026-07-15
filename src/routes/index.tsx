import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Cpu,
  Database,
  Factory,
  Gauge,
  LineChart,
  Loader2,
  Menu,
  Radio,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: pageHead({
    title: "STHA — Controle sua operação industrial em tempo real",
    description:
      "STHA centraliza monitoramento de processos, ordens de produção, controle de tanques e alertas operacionais em uma única plataforma industrial.",
    path: "/",
  }),
  ssr: false,
  component: LandingPage,
});

// ---------------------------------------------------------------------------
// INTEGRAÇÃO FUTURA — formulário de contato
// Substitua o corpo de `submitContactForm` por uma chamada real
// (createServerFn + envio de e-mail / CRM / banco) quando disponível.
// ---------------------------------------------------------------------------
type ContactPayload = {
  nome: string;
  empresa: string;
  email: string;
  telefone: string;
  mensagem: string;
};

async function submitContactForm(_payload: ContactPayload): Promise<{ ok: true }> {
  // TODO: integrar com backend (server function, e-mail transacional, CRM etc.)
  await new Promise((r) => setTimeout(r, 900));
  return { ok: true };
}

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Se já estiver logado, oferece atalho pro dashboard (sem redirect forçado).
  const [isAuthed, setIsAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsAuthed(!!data.session));
  }, []);

  return (
    <div className="dark min-h-screen bg-[#070b14] text-foreground antialiased">
      {/* Background grid decorativo */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.25]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.08) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse at 50% 0%, black 40%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[600px] bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.25),transparent_60%)]"
      />

      <div className="relative z-10">
        <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} isAuthed={isAuthed} />
        <Hero />
        <Benefits />
        <Flow />
        <Features />
        <Results />
        <Contact />
        <Footer />
      </div>
    </div>
  );
}

/* -------------------------------- HEADER -------------------------------- */

function Header({
  menuOpen,
  setMenuOpen,
  isAuthed,
}: {
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
  isAuthed: boolean;
}) {
  const nav = [
    { href: "#recursos", label: "Recursos" },
    { href: "#como-funciona", label: "Como funciona" },
    { href: "#beneficios", label: "Benefícios" },
    { href: "#contato", label: "Contato" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#070b14]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex items-center gap-2">
          <LogoMark />
          <span className="text-lg font-bold tracking-tight text-white">STHA</span>
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          {isAuthed ? (
            <Link
              to="/dashboard"
              className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              Ir para o dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              Entrar
            </Link>
          )}
          <Link
            to="/signup"
            className="inline-flex h-9 items-center rounded-md bg-sky-500 px-4 text-sm font-semibold text-slate-950 shadow-[0_0_0_1px_rgba(56,189,248,0.4),0_10px_30px_-10px_rgba(56,189,248,0.6)] transition-all hover:bg-sky-400"
          >
            Criar conta
          </Link>
        </div>
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/10 text-slate-200 md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Abrir menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {menuOpen ? (
        <div className="border-t border-white/5 bg-[#070b14] md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white"
              >
                {n.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-white/5 pt-3">
              <Link
                to="/login"
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5"
              >
                Entrar
              </Link>
              <Link
                to="/signup"
                className="rounded-md bg-sky-500 px-3 py-2 text-center text-sm font-semibold text-slate-950 hover:bg-sky-400"
              >
                Criar conta
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function LogoMark() {
  return (
    <div className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-md bg-gradient-to-br from-sky-500 to-blue-700 shadow-[0_0_20px_-4px_rgba(56,189,248,0.6)]">
      <Factory className="h-4 w-4 text-white" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />
    </div>
  );
}

/* --------------------------------- HERO --------------------------------- */

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden px-4 pb-16 pt-16 sm:px-6 lg:px-8 lg:pb-24 lg:pt-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-sky-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Plataforma industrial 4.0
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Controle sua operação{" "}
            <span className="bg-gradient-to-r from-sky-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">
              industrial em tempo real.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
            Monitore processos, acompanhe ordens de produção, controle estoques e
            receba alertas críticos em uma única plataforma.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#contato"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-sky-500 px-6 text-sm font-semibold text-slate-950 shadow-[0_10px_40px_-10px_rgba(56,189,248,0.8)] transition-all hover:bg-sky-400 hover:shadow-[0_15px_50px_-10px_rgba(56,189,248,0.9)]"
            >
              Agendar demonstração
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#recursos"
              className="inline-flex h-12 items-center justify-center rounded-md border border-white/10 bg-white/5 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Conhecer a plataforma
            </a>
          </div>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/5 pt-8">
            {[
              { k: "Tempo real", v: "< 3s" },
              { k: "Uptime alvo", v: "99,9%" },
              { k: "Módulos", v: "12+" },
            ].map((s) => (
              <div key={s.k}>
                <dt className="text-xs uppercase tracking-widest text-slate-500">{s.k}</dt>
                <dd className="mt-1 font-mono text-2xl font-semibold text-white">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <DashboardMockup />
      </div>
    </section>
  );
}

function DashboardMockup() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-sky-500/20 via-blue-600/10 to-transparent blur-2xl"
      />
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl shadow-sky-950/50 backdrop-blur">
        {/* Header do mockup */}
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500/70" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
            <span className="ml-3 text-xs font-medium text-slate-400">
              STHA · Painel operacional
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            AO VIVO
          </div>
        </div>

        {/* Grid de KPIs */}
        <div className="grid grid-cols-3 gap-3 border-b border-white/5 p-4">
          {[
            { l: "OEE", v: "87.4%", d: "+2.1%", tone: "emerald" },
            { l: "Produção", v: "1.284 t", d: "hoje", tone: "sky" },
            { l: "Alertas", v: "3", d: "1 crítico", tone: "amber" },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{k.l}</div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">{k.v}</div>
              <div
                className={`mt-0.5 text-[10px] ${
                  k.tone === "emerald"
                    ? "text-emerald-400"
                    : k.tone === "amber"
                      ? "text-amber-400"
                      : "text-sky-400"
                }`}
              >
                {k.d}
              </div>
            </div>
          ))}
        </div>

        {/* Gráfico + tanques */}
        <div className="grid grid-cols-5 gap-4 p-4">
          <div className="col-span-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Tendência de processo</span>
              <span className="text-[10px] text-slate-500">últimas 24h</span>
            </div>
            <TrendChart />
          </div>
          <div className="col-span-2 space-y-2">
            <div className="text-xs font-medium text-slate-300">Tanques</div>
            {[
              { n: "TQ-01", p: 78, color: "bg-sky-500" },
              { n: "TQ-02", p: 42, color: "bg-emerald-500" },
              { n: "TQ-03", p: 91, color: "bg-amber-500" },
              { n: "TQ-04", p: 15, color: "bg-rose-500" },
            ].map((t) => (
              <div key={t.n} className="flex items-center gap-2">
                <span className="w-10 font-mono text-[10px] text-slate-400">{t.n}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div className={`h-full ${t.color}`} style={{ width: `${t.p}%` }} />
                </div>
                <span className="w-8 text-right font-mono text-[10px] text-slate-300">{t.p}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas */}
        <div className="border-t border-white/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-300">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            Alertas recentes
          </div>
          <ul className="space-y-1.5">
            {[
              { t: "Temperatura elevada · Reator R-02", s: "crítico", c: "text-rose-400" },
              { t: "Pressão fora da faixa · Linha 3", s: "atenção", c: "text-amber-400" },
              { t: "Nível baixo · TQ-04", s: "info", c: "text-sky-400" },
            ].map((a) => (
              <li
                key={a.t}
                className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5"
              >
                <span className="truncate text-xs text-slate-300">{a.t}</span>
                <span className={`text-[10px] font-medium ${a.c}`}>{a.s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TrendChart() {
  // SVG minimal com linha suave
  const points = [8, 14, 10, 18, 22, 17, 25, 28, 24, 30, 34, 30, 36, 42, 38, 45];
  const w = 320;
  const h = 90;
  const max = 50;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`)
    .join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full">
      <defs>
        <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#g1)" />
      <path d={path} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
    </svg>
  );
}

/* ------------------------------ BENEFÍCIOS ------------------------------ */

function Benefits() {
  const items = [
    {
      icon: Activity,
      title: "Processo em tempo real",
      text: "Acompanhe tags e variáveis importantes da operação no momento em que acontecem.",
    },
    {
      icon: ClipboardList,
      title: "Produção sob controle",
      text: "Gerencie e acompanhe ordens de produção com mais clareza.",
    },
    {
      icon: Database,
      title: "Estoque de tanques",
      text: "Visualize saldo, capacidade e produto armazenado em cada tanque.",
    },
    {
      icon: AlertTriangle,
      title: "Alertas inteligentes",
      text: "Identifique situações críticas rapidamente para agir no tempo certo.",
    },
  ];
  return (
    <section id="beneficios" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow="Benefícios"
          title="Uma visão completa da sua operação."
          subtitle="Tudo o que sua equipe precisa para operar com confiança, em um único lugar."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => (
            <div
              key={it.title}
              className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-6 transition-all hover:border-sky-500/40 hover:bg-white/[0.04]"
            >
              <div
                aria-hidden
                className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl opacity-0 transition-opacity group-hover:opacity-100"
              />
              <div className="relative">
                <div className="grid h-11 w-11 place-items-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-400">
                  <it.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">{it.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{it.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------- Do chão de fábrica à decisão --------------------- */

function Flow() {
  const steps = [
    { icon: Radio, label: "Monitoramento" },
    { icon: Factory, label: "Produção" },
    { icon: Boxes, label: "Estoque" },
    { icon: AlertTriangle, label: "Alertas" },
    { icon: Sparkles, label: "Decisão" },
  ];
  return (
    <section id="como-funciona" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <SectionHeader
              align="left"
              eyebrow="Do chão de fábrica à decisão"
              title="Dados operacionais que viram decisão."
              subtitle="O STHA transforma dados operacionais em uma visão prática para quem precisa manter a produção fluindo. Menos planilhas, menos incerteza e mais controle sobre cada etapa."
            />
          </div>

          <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-6 sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {steps.map((s, i) => (
                <div key={s.label} className="flex flex-1 items-center gap-3 sm:flex-col sm:gap-2">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 shadow-[0_0_20px_-6px_rgba(56,189,248,0.6)]">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-medium text-slate-200 sm:text-center">{s.label}</span>
                  {i < steps.length - 1 ? (
                    <span
                      aria-hidden
                      className="hidden h-px flex-1 bg-gradient-to-r from-sky-500/40 to-transparent sm:block"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- RECURSOS ------------------------------ */

function Features() {
  const items = [
    { icon: Gauge, title: "Dashboard operacional", text: "Painéis prontos com os indicadores que sua operação precisa." },
    { icon: Radio, title: "Monitoramento de tags", text: "Leitura em tempo real de variáveis de processo e utilidades." },
    { icon: ClipboardList, title: "Gestão de ordens de produção", text: "Programação, acompanhamento e apontamento de OPs." },
    { icon: Database, title: "Controle de tanques e estoque", text: "Nível, capacidade e produto armazenado de forma clara." },
    { icon: AlertTriangle, title: "Histórico de alertas", text: "Rastreie eventos críticos e tempo de resposta da equipe." },
    { icon: LineChart, title: "Indicadores para tomada de decisão", text: "KPIs consolidados para análise operacional e gerencial." },
  ];
  return (
    <section id="recursos" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow="Recursos"
          title="A plataforma que conecta sua operação."
          subtitle="Módulos integrados para eliminar planilhas dispersas e centralizar decisões."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.title}
              className="flex gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-sky-500/30 hover:bg-white/[0.04]"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-slate-900 text-sky-400">
                <it.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">{it.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{it.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- RESULTS ------------------------------- */

function Results() {
  const items = [
    { icon: Zap, title: "Decisões mais ágeis", text: "Informação relevante disponível no momento em que a operação exige." },
    { icon: ShieldCheck, title: "Menos dependência de controles manuais", text: "Menos planilhas, menos retrabalho, menos margem para erro." },
    { icon: BarChart3, title: "Maior rastreabilidade da operação", text: "Histórico consistente de produção, estoque e eventos operacionais." },
  ];
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow="Resultados"
          title="Mais visibilidade para operar com confiança."
          subtitle="Uma base sólida para times de operação, produção e gestão."
        />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.title}
              className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-slate-900/70 to-slate-950/70 p-6"
            >
              <div className="grid h-11 w-11 place-items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <it.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-white">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{it.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- CONTATO ------------------------------- */

function Contact() {
  const [form, setForm] = useState<ContactPayload>({
    nome: "",
    empresa: "",
    email: "",
    telefone: "",
    mensagem: "",
  });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const update = <K extends keyof ContactPayload>(k: K, v: ContactPayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.empresa || !form.email || !form.telefone) {
      toast.error("Preencha os campos obrigatórios.");
      return;
    }
    setLoading(true);
    try {
      await submitContactForm(form);
      setSent(true);
    } catch {
      toast.error("Não foi possível enviar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="contato" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950">
        <div className="grid gap-0 lg:grid-cols-[1fr_1.2fr]">
          <div className="relative overflow-hidden border-b border-white/5 p-8 lg:border-b-0 lg:border-r lg:p-12">
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.2),transparent_60%)]"
            />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-sky-300">
                <Cpu className="h-3.5 w-3.5" />
                Fale com a equipe STHA
              </span>
              <h2 className="mt-5 text-3xl font-bold leading-tight text-white sm:text-4xl">
                Pronto para enxergar sua operação de ponta a ponta?
              </h2>
              <p className="mt-4 text-slate-300">
                Fale com nossa equipe e descubra como o STHA pode centralizar as
                informações que movem sua indústria.
              </p>
              <ul className="mt-8 space-y-3">
                {[
                  "Demonstração personalizada da plataforma",
                  "Análise dos módulos aderentes à sua operação",
                  "Proposta comercial sem compromisso",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-slate-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="p-8 lg:p-12">
            {sent ? (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
                <div className="grid h-14 w-14 place-items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-white">
                  Recebemos sua solicitação.
                </h3>
                <p className="mt-2 max-w-sm text-sm text-slate-400">
                  Em breve nossa equipe entrará em contato.
                </p>
                <button
                  className="mt-6 text-sm font-medium text-sky-400 hover:text-sky-300"
                  onClick={() => {
                    setSent(false);
                    setForm({ nome: "", empresa: "", email: "", telefone: "", mensagem: "" });
                  }}
                >
                  Enviar outra solicitação
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <FormField id="nome" label="Nome completo" required>
                  <Input
                    id="nome"
                    value={form.nome}
                    onChange={(e) => update("nome", e.target.value)}
                    autoComplete="name"
                  />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField id="empresa" label="Empresa" required>
                    <Input
                      id="empresa"
                      value={form.empresa}
                      onChange={(e) => update("empresa", e.target.value)}
                      autoComplete="organization"
                    />
                  </FormField>
                  <FormField id="telefone" label="Telefone" required>
                    <Input
                      id="telefone"
                      value={form.telefone}
                      onChange={(e) => update("telefone", e.target.value)}
                      autoComplete="tel"
                      inputMode="tel"
                    />
                  </FormField>
                </div>
                <FormField id="email" label="E-mail corporativo" required>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    autoComplete="email"
                  />
                </FormField>
                <FormField id="mensagem" label="Mensagem">
                  <Textarea
                    id="mensagem"
                    rows={4}
                    value={form.mensagem}
                    onChange={(e) => update("mensagem", e.target.value)}
                    placeholder="Conte brevemente sobre sua operação e o que gostaria de ver na demonstração."
                  />
                </FormField>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-sky-500 text-slate-950 shadow-[0_10px_30px_-10px_rgba(56,189,248,0.7)] hover:bg-sky-400"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    "Solicitar demonstração"
                  )}
                </Button>
                <p className="text-center text-xs text-slate-500">
                  Ao enviar você concorda com nossos termos de uso e política de privacidade.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FormField({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-slate-300">
        {label} {required ? <span className="text-sky-400">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

/* -------------------------------- FOOTER -------------------------------- */

function Footer() {
  return (
    <footer className="border-t border-white/5 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span className="text-sm font-semibold text-white">STHA</span>
          <span className="text-xs text-slate-500">· Sistema de Processo e Produção Industrial</span>
        </div>
        <div className="text-xs text-slate-500">
          © {new Date().getFullYear()} STHA. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}

/* ------------------------- helpers de composição ----------------------- */

function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
}) {
  const isCenter = align === "center";
  return (
    <div className={isCenter ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow ? (
        <span className="inline-block text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
          {eyebrow}
        </span>
      ) : null}
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
      {subtitle ? <p className="mt-4 text-base leading-relaxed text-slate-400">{subtitle}</p> : null}
    </div>
  );
}
