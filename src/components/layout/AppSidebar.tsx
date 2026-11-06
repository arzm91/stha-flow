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
  Gauge,
  ChevronRight,
  LayoutGrid,
} from "lucide-react";

import sthaLogo from "@/assets/stha_logo.png.asset.json";
import sthaLogoMini from "@/assets/stha_logo_mini.png.asset.json";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { SidebarPreview } from "@/components/layout/SidebarPreview";

type Item = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  pageKey?: string;
  prefix?: string;
  adminOnly?: boolean;
  group?: boolean;
};

const GROUP_TITLE = "Gestão";
const GROUP_KEY = "sidebar-grupo-gestao-aberto";

const items: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, pageKey: "dashboard" },
  { title: "Produção", url: "/producao", icon: Factory, pageKey: "producao" },
  { title: "Estoque", url: "/estoque", icon: Boxes, pageKey: "estoque", group: true },
  { title: "Turnos", url: "/turnos", icon: CalendarClock, pageKey: "turnos" },
  { title: "Parâmetros", url: "/parametros-unidade", icon: Gauge },
  { title: "Manutenção", url: "/manutencao", icon: Wrench, prefix: "/manutencao", pageKey: "manutencao", group: true },
  { title: "Tags ao Vivo", url: "/tags", icon: Radio, pageKey: "tags", group: true },
  { title: "Tabelas", url: "/tabelas", icon: TableIcon, prefix: "/tabelas", pageKey: "tabelas" },
  { title: "Alertas", url: "/alertas", icon: Bell, prefix: "/alertas", pageKey: "alertas" },
  { title: "Relatórios", url: "/relatorios", icon: FileBarChart, prefix: "/relatorios", pageKey: "relatorios", group: true },
  { title: "Automações", url: "/automacoes", icon: Workflow, prefix: "/automacoes", pageKey: "automacoes", group: true },
  { title: "Cadastros", url: "/cadastros", icon: ClipboardList, prefix: "/cadastros", pageKey: "cadastros", group: true },
  { title: "Configurações", url: "/configuracoes", icon: Settings, adminOnly: true },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin, canView } = usePagePermissions();

  const visibleItems = items.filter((it) => {
    if (it.adminOnly) return isAdmin;
    if (!it.pageKey) return true;
    return canView(it.pageKey);
  });

  const isActive = (it: Item) =>
    it.prefix ? pathname.startsWith(it.prefix) : pathname === it.url || pathname.startsWith(it.url + "/");

  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const groupItems = visibleItems.filter((it) => it.group);
  const groupActive = groupItems.some(isActive);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem(GROUP_KEY);
    setOpen(saved === null ? groupActive : saved === "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);
  const toggle = (v: boolean) => {
    setOpen(v);
    window.localStorage.setItem(GROUP_KEY, v ? "1" : "0");
  };

  const wrapPreview = (item: Item, node: React.ReactElement) =>
    !item.pageKey ? node : (
      <HoverCard key={item.title} openDelay={250} closeDelay={150}>
        <HoverCardTrigger asChild>{node}</HoverCardTrigger>
        <HoverCardContent side="right" align="start" sideOffset={12} className="w-auto p-3">
          <SidebarPreview pageKey={item.pageKey} title={item.title} />
        </HoverCardContent>
      </HoverCard>
    );

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
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                if (item.group) {
                  if (item !== groupItems[0]) return null;
                  return collapsed ? (
                    <SidebarMenuItem key="__grupo">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuButton isActive={groupActive} tooltip={GROUP_TITLE}>
                            <LayoutGrid />
                            <span>{GROUP_TITLE}</span>
                          </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                          {groupItems.map((g) => (
                            <DropdownMenuItem key={g.title} asChild>
                              <Link to={g.url} className="flex items-center gap-2">
                                <g.icon className="h-4 w-4" />
                                {g.title}
                              </Link>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ) : (
                    <Collapsible key="__grupo" open={open} onOpenChange={toggle} asChild>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton isActive={groupActive && !open} tooltip={GROUP_TITLE}>
                            <LayoutGrid />
                            <span>{GROUP_TITLE}</span>
                            <ChevronRight className={`ml-auto transition-transform ${open ? "rotate-90" : ""}`} />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {groupItems.map((g) => wrapPreview(g,
                              <SidebarMenuSubItem key={g.title}>
                                <SidebarMenuSubButton asChild isActive={isActive(g)}>
                                  <Link to={g.url}>
                                    <g.icon />
                                    <span>{g.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>,
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }
                return wrapPreview(item,
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>,
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
