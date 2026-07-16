import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Factory,
  Boxes,
  ClipboardList,
  FileBarChart,
  Activity,
  Settings,
  Radio,
  Workflow,
  Bell,
  Table as TableIcon,
  CalendarClock,
  Wrench,
} from "lucide-react";

import sthaLogo from "@/assets/stha_logo.png.asset.json";
import sthaLogoMini from "@/assets/stha_logo_mini.png.asset.json";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { usePagePermissions } from "@/hooks/usePagePermissions";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, pageKey: "dashboard" },
  { title: "Produção", url: "/producao", icon: Factory, pageKey: "producao" },
  { title: "Estoque", url: "/estoque", icon: Boxes, pageKey: "estoque" },
  { title: "Tags ao Vivo", url: "/tags", icon: Radio, pageKey: "tags" },
  { title: "Tabelas", url: "/tabelas", icon: TableIcon, prefix: "/tabelas", pageKey: "tabelas" },
  { title: "Automações", url: "/automacoes", icon: Workflow, prefix: "/automacoes", pageKey: "automacoes" },
  { title: "Alertas", url: "/alertas", icon: Bell, prefix: "/alertas", pageKey: "alertas" },
  { title: "Cadastros", url: "/cadastros", icon: ClipboardList, prefix: "/cadastros", pageKey: "cadastros" },
  { title: "Turnos", url: "/turnos", icon: CalendarClock, pageKey: "turnos" },
  { title: "Manutenção", url: "/manutencao", icon: Wrench, prefix: "/manutencao", pageKey: "manutencao" },
  { title: "Relatórios", url: "/relatorios", icon: FileBarChart, prefix: "/relatorios", pageKey: "relatorios" },
  { title: "Indicadores", url: "/indicadores", icon: Activity, pageKey: "indicadores" },
  { title: "Configurações", url: "/configuracoes", icon: Settings, adminOnly: true },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin, canView } = usePagePermissions();
  const visible = items.filter((it) => {
    if (it.adminOnly) return isAdmin;
    if (!it.pageKey) return true;
    return canView(it.pageKey);
  });
  const isActive = (it: (typeof items)[number]) =>
    it.prefix ? pathname.startsWith(it.prefix) : pathname === it.url || pathname.startsWith(it.url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-center px-2 py-3">
          <img
            src={sthaLogo.url}
            alt="STHA"
            className="h-10 w-auto object-contain group-data-[collapsible=icon]:hidden"
          />
          <img
            src={sthaLogoMini.url}
            alt="STHA"
            className="hidden h-7 w-auto object-contain group-data-[collapsible=icon]:block"
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
