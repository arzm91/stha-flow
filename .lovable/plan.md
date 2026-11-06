# Agrupar páginas no menu lateral

## O que muda
- Estoque, Manutenção, Tags ao Vivo, Relatórios, Automações e Cadastros passam a ficar dentro de um grupo recolhível no menu lateral, chamado **"Gestão"** (o nome pode ser trocado).
- O grupo abre e fecha com um clique na seta. Ele abre sozinho quando você está em uma dessas páginas e lembra se você o deixou aberto ou fechado.
- Com o menu recolhido (só ícones), clicar no ícone do grupo mostra as 6 páginas numa lista suspensa.
- As demais páginas (Dashboard, Produção, Turnos, Parâmetros, Tabelas, Alertas, Configurações) continuam soltas, na mesma ordem.

## O que não muda
- Endereços das páginas, permissões, destaque da página atual e as prévias ao passar o mouse continuam iguais, inclusive dentro do grupo.
- Nada fora do menu lateral é alterado.

## Detalhes técnicos
- Edição apenas em `src/components/layout/AppSidebar.tsx`: separar `items` em soltos + grupo, usando `Collapsible` + `SidebarMenuSub` do shadcn, reaproveitando o mesmo render de item (HoverCard/SidebarPreview, `canView`, `prefix`).
- Estado aberto/fechado salvo em `localStorage`, lido após a montagem para evitar divergência de hidratação.
