import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Factory,
  Boxes,
  ClipboardList,
  FileBarChart,
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { SidebarPreview } from "@/components/layout/SidebarPreview";

type Item = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  pageKey?: string;
  prefix?: string;
  adminOnly?: boolean;
};

type Group = { label: string; items: Item[] };

// Menus agrupados por área — cada grupo pode ser recolhido/expandido.
const groups: Group[] = [
  {
    label: "Principal",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, pageKey: "dashboard" },
    ],
  },
  {
    label: "Operação",
    items: [
      { title: "Produção", url: "/producao", icon: Factory, pageKey: "producao" },
      { title: "Estoque", url: "/estoque", icon: Boxes, pageKey: "estoque" },
      { title: "Turnos", url: "/turnos", icon: CalendarClock, pageKey: "turnos" },
      { title: "Manutenção", url: "/manutencao", icon: Wrench, prefix: "/manutencao", pageKey: "manutencao" },
    ],
  },
  {
    label: "Dados e análise",
    items: [
      { title: "Tags ao Vivo", url: "/tags", icon: Radio, pageKey: "tags" },
      { title: "Tabelas", url: "/tabelas", icon: TableIcon, prefix: "/tabelas", pageKey: "tabelas" },
      { title: "Alertas", url: "/alertas", icon: Bell, prefix: "/alertas", pageKey: "alertas" },
      { title: "Relatórios", url: "/relatorios", icon: FileBarChart, prefix: "/relatorios", pageKey: "relatorios" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Automações", url: "/automacoes", icon: Workflow, prefix: "/automacoes", pageKey: "automacoes" },
      { title: "Cadastros", url: "/cadastros", icon: ClipboardList, prefix: "/cadastros", pageKey: "cadastros" },
      { title: "Configurações", url: "/configuracoes", icon: Settings, adminOnly: true },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin, canView } = usePagePermissions();

  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (it.adminOnly) return isAdmin;
        if (!it.pageKey) return true;
        return canView(it.pageKey);
      }),
    }))
    .filter((g) => g.items.length > 0);

  const isActive = (it: Item) =>
    it.prefix ? pathname.startsWith(it.prefix) : pathname === it.url || pathname.startsWith(it.url + "/");

  const groupHasActive = (g: Group) => g.items.some((it) => isActive(it));

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
        {visibleGroups.map((group, gi) => (
          <Collapsible
            key={group.label}
            defaultOpen={gi === 0 || groupHasActive(group)}
            className="group/collapsible"
          >
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer select-none hover:bg-sidebar-accent rounded-md transition-colors">
                  {group.label}
                  <span className="ml-auto text-[10px] text-muted-foreground transition-transform group-data-[state=open]/collapsible:rotate-90">
                    ▸
                  </span>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const button = (
                        <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.title}>
                          <Link to={item.url}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      );
                      // Itens sem pageKey (Configurações) não têm prévia.
                      if (!item.pageKey) {
                        return <SidebarMenuItem key={item.title}>{button}</SidebarMenuItem>;
                      }
                      return (
                        <SidebarMenuItem key={item.title}>
                          <HoverCard openDelay={250} closeDelay={120}>
                            <HoverCardTrigger asChild>{button}</HoverCardTrigger>
                            <HoverCardContent side="right" align="start" sideOffset={10} className="w-auto p-2">
                              <SidebarPreview pageKey={item.pageKey} title={item.title} />
                            </HoverCardContent>
                          </HoverCard>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
