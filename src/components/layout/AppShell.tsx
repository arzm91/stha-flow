import { type ReactNode, useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, User, Sun, Moon, Bell } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { ChatPopup } from "@/components/chat/ChatPopup";
import { CalculatedTagsSync } from "@/components/tags/CalculatedTagsSync";
import { AssistenteBusca } from "@/components/assistente/AssistenteBusca";

import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { theme, toggle } = useTheme();
  const [profile, setProfile] = useState<{ nome: string; empresa: string | null; email: string | null } | null>(null);

  const { data: activeAlerts = 0 } = useQuery({
    queryKey: ["active_alerts_count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("alertas_disparos")
        .select("*", { count: "exact", head: true })
        .eq("status", "novo");
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("header_alerts_count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alertas_disparos" },
        () => qc.invalidateQueries({ queryKey: ["active_alerts_count"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return;
      const { data } = await supabase
        .from("profiles")
        .select("nome,empresa,email")
        .eq("id", uid)
        .maybeSingle();
      if (data) setProfile(data);
    })();
  }, []);

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <SidebarProvider>
      <CalculatedTagsSync />
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="ml-2 hidden md:flex flex-col leading-tight">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Empresa</span>
              <span className="text-sm font-semibold">{profile?.empresa ?? "—"}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <AssistenteBusca />

              <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
                title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>

              <Link to="/alertas">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Alertas ativos"
                  title="Alertas ativos"
                  className="relative"
                >
                  <Bell className="h-4 w-4" />
                  {activeAlerts > 0 && (
                    <Badge
                      variant="destructive"
                      className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full p-0 text-[10px]"
                    >
                      {activeAlerts > 99 ? "99+" : activeAlerts}
                    </Badge>
                  )}
                </Button>
              </Link>

              <ChatPopup />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">{profile?.nome ?? "Usuário"}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="text-sm">{profile?.nome}</span>
                      <span className="text-xs text-muted-foreground">{profile?.email}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate({ to: "/configuracoes" })}>
                    Configurações
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
