import { Link } from "@tanstack/react-router";
import { ArrowLeft, Factory } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="dark relative min-h-screen overflow-hidden bg-[#070b14] text-foreground antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.08) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at 50% 0%, black 40%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.28),transparent_60%)]"
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-4 py-6 sm:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-md bg-gradient-to-br from-sky-500 to-blue-700 shadow-[0_0_20px_-4px_rgba(56,189,248,0.6)]">
              <Factory className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">STHA</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao site
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-white/10 bg-[#0b1120]/80 p-6 shadow-2xl shadow-sky-950/40 backdrop-blur sm:p-8">
              <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
                {subtitle ? (
                  <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
                ) : null}
              </div>
              {children}
            </div>
            <p className="mt-6 text-center text-xs text-slate-500">
              © {new Date().getFullYear()} STHA · Sistema de Processo e Produção Industrial
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
