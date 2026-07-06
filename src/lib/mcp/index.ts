import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listOrdensProducao from "./tools/list-ordens-producao";
import listTanques from "./tools/list-tanques";
import listAlertasRecentes from "./tools/list-alertas-recentes";
import listTagsLive from "./tools/list-tags-live";

// The OAuth issuer MUST be the direct Supabase host. Read the ref via
// import.meta.env.VITE_SUPABASE_PROJECT_ID (Vite inlines it at build time).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "sthapc-mcp",
  title: "STHApc — Gestão Industrial",
  version: "0.1.0",
  instructions:
    "Ferramentas de leitura da plataforma STHApc: ordens de produção, tanques, alertas e tags ao vivo. Todos os dados respeitam as permissões (RLS) do usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listOrdensProducao, listTanques, listAlertasRecentes, listTagsLive],
});
