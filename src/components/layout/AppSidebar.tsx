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

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Produção", url: "/producao", icon: Factory },
  { title: "Estoque", url: "/estoque", icon: Boxes },
  { title: "Tags ao Vivo", url: "/tags", icon: Radio },
  { title: "Automações", url: "/automacoes", icon: Workflow, prefix: "/automacoes" },
  { title: "Cadastros", url: "/cadastros", icon: ClipboardList, prefix: "/cadastros" },
  { title: "Relatórios", url: "/relatorios/producao", icon: FileBarChart, prefix: "/relatorios" },
  { title: "Indicadores", url: "/indicadores", icon: Activity },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
              {items.map((item) => (
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
