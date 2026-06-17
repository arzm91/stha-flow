import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Factory,
  Boxes,
  ClipboardList,
  FileBarChart,
  Activity,
  Settings,
  Cpu,
} from "lucide-react";
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
  { title: "Cadastros", url: "/cadastros", icon: ClipboardList, prefix: "/cadastros" },
  { title: "Relatórios", url: "/relatorios", icon: FileBarChart },
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
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-base font-bold tracking-tight">STHApc</span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Gestão Industrial</span>
          </div>
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
