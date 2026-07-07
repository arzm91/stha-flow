import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrudTable } from "@/components/CrudTable";
import { Badge } from "@/components/ui/badge";

const TIPOS = [
  { value: "alerta", label: "Alerta do sistema" },
  { value: "mensagem", label: "Mensagem interna" },
  { value: "ordem", label: "Confirmação de ordem" },
  { value: "relatorio", label: "Relatório disponível" },
];

const TIPO_LABEL: Record<string, string> = Object.fromEntries(
  TIPOS.map((t) => [t.value, t.label]),
);

const PREDEFINIDOS = [
  { nome: "Alerta do sistema", assunto: "🚨 Alerta: {{alertTitle}}", tipo: "alerta",
    corpo: "Um novo alerta foi disparado no sistema.\n\nSeveridade: {{severity}}\nOrigem: {{source}}\nDetalhes: {{description}}" },
  { nome: "Mensagem interna", assunto: "Nova mensagem — STHApc", tipo: "mensagem",
    corpo: "Você recebeu uma nova mensagem no STHApc.\n\n{{body}}" },
  { nome: "Confirmação de ordem", assunto: "Ordem {{orderNumber}} confirmada", tipo: "ordem",
    corpo: "Sua ordem {{orderNumber}} foi confirmada.\n\nProduto: {{productName}}\nQuantidade: {{quantity}}\nInício previsto: {{startDate}}" },
  { nome: "Relatório disponível", assunto: "Relatório pronto — {{reportName}}", tipo: "relatorio",
    corpo: "O relatório {{reportName}} referente a {{period}} está pronto.\n\nAcesse: {{downloadUrl}}" },
];

export function EmailTemplatesCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configurador de e-mails</CardTitle>
        <p className="text-sm text-muted-foreground">
          Personalize os e-mails enviados pelo sistema. Use variáveis entre chaves duplas, ex.:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{alertTitle}}"}</code>.
        </p>
      </CardHeader>
      <CardContent>
        <details className="mb-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <summary className="cursor-pointer font-medium">Modelos pré-definidos (referência)</summary>
          <ul className="mt-2 space-y-2">
            {PREDEFINIDOS.map((p) => (
              <li key={p.tipo} className="rounded border border-border bg-background p-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{TIPO_LABEL[p.tipo]}</Badge>
                  <span className="font-medium">{p.nome}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground"><b>Assunto:</b> {p.assunto}</p>
                <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{p.corpo}</pre>
              </li>
            ))}
          </ul>
        </details>

        <CrudTable
          table="email_templates_config"
          title="Meus e-mails"
          description="Crie e edite seus próprios modelos de e-mail. Cada modelo é vinculado à sua conta."
          columns={[
            { key: "nome", label: "Nome" },
            { key: "tipo", label: "Tipo", render: (r) => <Badge variant="outline">{TIPO_LABEL[String(r.tipo)] ?? String(r.tipo)}</Badge> },
            { key: "assunto", label: "Assunto" },
            { key: "ativo", label: "Ativo", render: (r) => (r.ativo ? "Sim" : "Não") },
          ]}
          fields={[
            { key: "nome", label: "Nome", required: true, placeholder: "Ex.: Alerta crítico de tanque" },
            { key: "tipo", label: "Tipo de e-mail", type: "select", required: true, options: TIPOS },
            { key: "assunto", label: "Assunto", required: true, placeholder: "Ex.: 🚨 Alerta: {{alertTitle}}" },
            { key: "corpo", label: "Corpo do e-mail", type: "textarea",
              placeholder: "Escreva o conteúdo. Use {{variavel}} para injetar dados do gatilho.",
              help: "Variáveis comuns: {{alertTitle}}, {{severity}}, {{source}}, {{description}}, {{orderNumber}}, {{productName}}, {{quantity}}, {{startDate}}, {{reportName}}, {{period}}, {{downloadUrl}}, {{body}}." },
            { key: "ativo", label: "Ativo", type: "checkbox" },
          ]}
          initialValues={{ nome: "", tipo: "alerta", assunto: "", corpo: "", ativo: true }}
          searchKeys={["nome", "assunto", "tipo"]}
        />
      </CardContent>
    </Card>
  );
}
