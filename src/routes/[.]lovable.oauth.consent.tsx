import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import sthaLogo from "@/assets/stha_logo.png.asset.json";

type AuthorizationDetails = {
  client?: { name?: string; client_name?: string; redirect_uri?: string } | null;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
} | null;

// Beta namespace not in generated types — narrow local wrapper.
type OAuthResp<T> = { data: T | null; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResp<AuthorizationDetails>>;
  approveAuthorization: (id: string) => Promise<OAuthResp<{ redirect_url?: string; redirect_to?: string }>>;
  denyAuthorization: (id: string) => Promise<OAuthResp<{ redirect_url?: string; redirect_to?: string }>>;
};
function oauth(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Autorização indisponível</CardTitle>
          <CardDescription>Não foi possível carregar esta solicitação de autorização.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </CardContent>
      </Card>
    </div>
  ),
});

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "Aplicativo externo";
  const redirectUri = details?.client?.redirect_uri;
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O provedor de autorização não retornou uma URL de redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <img src={sthaLogo.url} alt="STHApc" className="mb-3 h-10 w-auto object-contain" />
          <CardTitle>Conectar {clientName} ao STHApc</CardTitle>
          <CardDescription>
            Isso permite que {clientName} use as ferramentas habilitadas do STHApc em seu nome.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {redirectUri && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">URL de retorno</div>
              <div className="break-all">{redirectUri}</div>
            </div>
          )}

          {scopes.length > 0 && (
            <div className="text-sm">
              <div className="mb-1 font-medium">Permissões solicitadas</div>
              <ul className="list-disc pl-5 text-muted-foreground">
                {scopes.map((s: string) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Suas permissões e políticas do STHApc continuam sendo aplicadas — este acesso não ignora as regras do sistema.
          </p>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
              Cancelar conexão
            </Button>
            <Button disabled={busy} onClick={() => decide(true)}>
              Aprovar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
