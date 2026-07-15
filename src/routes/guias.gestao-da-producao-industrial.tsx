import { createFileRoute, Link } from "@tanstack/react-router";

const CANONICAL = "https://sthapc.cloud/guias/gestao-da-producao-industrial";
const TITLE = "O que é Gestão da Produção Industrial e como otimizar a fábrica";
const DESCRIPTION =
  "Guia completo de Gestão da Produção Industrial: conceitos, PCP, indicadores (OEE, lead time, tempo de ciclo), MES/ERP e como o STHApc ajuda a otimizar a fábrica.";
const PUBLISHED_AT = "2026-07-15";

export const Route = createFileRoute("/guias/gestao-da-producao-industrial")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "keywords", content: "gestão da produção industrial, PCP, OEE, MES, ERP industrial, indústria 4.0, controle de produção, planejamento e controle da produção" },
      { name: "article:published_time", content: `${PUBLISHED_AT}T00:00:00Z` },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          inLanguage: "pt-BR",
          author: { "@type": "Organization", name: "STHApc" },
          publisher: { "@type": "Organization", name: "STHApc", url: "https://sthapc.cloud" },
          datePublished: PUBLISHED_AT,
          dateModified: PUBLISHED_AT,
          mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "O que é gestão da produção industrial?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "É o conjunto de práticas, processos e sistemas usados para planejar, executar e controlar a fabricação de produtos com o menor custo, no menor tempo e com a qualidade desejada, coordenando pessoas, máquinas, materiais e informação.",
              },
            },
            {
              "@type": "Question",
              name: "Qual a diferença entre PCP, MES e ERP?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "O ERP planeja demanda, compras e finanças; o PCP transforma o plano em ordens de produção; o MES executa e mede o chão de fábrica em tempo real, coletando apontamentos, paradas e qualidade.",
              },
            },
            {
              "@type": "Question",
              name: "O que é OEE e por que ele importa?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "OEE (Overall Equipment Effectiveness) mede a eficiência real de um equipamento combinando disponibilidade, performance e qualidade. É o principal indicador para identificar perdas e priorizar melhorias.",
              },
            },
            {
              "@type": "Question",
              name: "Como o STHApc ajuda na gestão da produção?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "O STHApc unifica ordens de produção, apontamentos, paradas, receitas, estoque, qualidade e indicadores como OEE em uma única plataforma, com alertas em tempo real e integração direta com CLPs e tags do chão de fábrica.",
              },
            },
          ],
        }),
      },
    ],
  }),
  component: GuiaGestaoProducao,
});

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h2>
      <div className="prose prose-neutral dark:prose-invert mt-4 max-w-none text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function GuiaGestaoProducao() {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link to="/" className="text-sm font-semibold text-foreground">STHApc</Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/auth" className="hover:text-foreground">Entrar</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs uppercase tracking-widest text-primary">Guia · Indústria</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
          Gestão da Produção Industrial: o que é, indicadores e como otimizar a fábrica
        </h1>
        <p className="mt-4 text-base text-muted-foreground md:text-lg">
          Um guia direto para quem gerencia uma fábrica: conceitos essenciais, os indicadores que
          realmente importam (OEE, lead time, tempo de ciclo), o papel de PCP, MES e ERP e um
          passo a passo prático para reduzir perdas usando dados do chão de fábrica.
        </p>

        <nav aria-label="Sumário" className="mt-8 rounded-lg border border-border/60 bg-card/40 p-5 text-sm">
          <p className="font-medium text-foreground">Neste guia</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li><a href="#o-que-e" className="hover:text-foreground">O que é gestão da produção industrial</a></li>
            <li><a href="#objetivos" className="hover:text-foreground">Objetivos e por que ela importa</a></li>
            <li><a href="#pilares" className="hover:text-foreground">Os 5 pilares da gestão da produção</a></li>
            <li><a href="#pcp-mes-erp" className="hover:text-foreground">PCP, MES e ERP: quem faz o quê</a></li>
            <li><a href="#indicadores" className="hover:text-foreground">Indicadores que realmente importam</a></li>
            <li><a href="#passo-a-passo" className="hover:text-foreground">Passo a passo para otimizar a fábrica</a></li>
            <li><a href="#sthapc" className="hover:text-foreground">Como o STHApc entra nesse processo</a></li>
            <li><a href="#faq" className="hover:text-foreground">Perguntas frequentes</a></li>
          </ol>
        </nav>

        <div className="mt-12 space-y-12">
          <Section id="o-que-e" title="O que é gestão da produção industrial">
            <p>
              <strong>Gestão da produção industrial</strong> é o conjunto de práticas, processos e
              sistemas usados para <em>planejar, executar e controlar</em> a fabricação de produtos
              com o menor custo, no menor tempo e com a qualidade desejada. Ela coordena pessoas,
              máquinas, materiais e informação para que a fábrica entregue o que o mercado pediu, na
              hora certa e no padrão certo.
            </p>
            <p>
              Na prática, envolve decidir <em>o que</em> produzir, <em>quanto</em>, <em>quando</em>,
              <em> em qual equipamento</em> e <em>com quais insumos</em> — e depois medir se aquilo
              que foi planejado realmente aconteceu.
            </p>
          </Section>

          <Section id="objetivos" title="Objetivos e por que ela importa">
            <ul>
              <li><strong>Atender demanda com previsibilidade</strong> — entregar prazos que a área comercial pode vender.</li>
              <li><strong>Reduzir perdas</strong> — retrabalho, refugo, paradas não planejadas, superprodução e estoque parado.</li>
              <li><strong>Elevar a produtividade dos ativos</strong> — extrair mais de cada máquina sem sacrificar qualidade.</li>
              <li><strong>Rastreabilidade</strong> — saber de qual lote, receita e equipamento saiu cada produto.</li>
              <li><strong>Segurança e conformidade</strong> — cumprir normas, registros e auditorias com dados confiáveis.</li>
            </ul>
            <p>
              Em fábricas sem uma gestão estruturada, decisões viram <em>achismo</em>: ninguém sabe
              ao certo por que a linha parou, quanto custou o refugo do turno ou por que o pedido
              atrasou. O primeiro ganho de uma boa gestão é substituir opinião por número.
            </p>
          </Section>

          <Section id="pilares" title="Os 5 pilares da gestão da produção">
            <ol>
              <li>
                <strong>Planejamento (PCP)</strong> — traduz previsões de demanda em ordens de
                produção, considerando capacidade, receitas, matérias-primas e setups.
              </li>
              <li>
                <strong>Execução e apontamento</strong> — registra em tempo real o que está sendo
                produzido, por quem, em qual equipamento e com quais lotes.
              </li>
              <li>
                <strong>Manutenção</strong> — preventiva e preditiva para reduzir paradas não
                planejadas — a maior fonte de perda de OEE.
              </li>
              <li>
                <strong>Qualidade</strong> — análises, coleta de amostras, controle estatístico e
                registro de não-conformidades ligados à ordem de produção.
              </li>
              <li>
                <strong>Indicadores e melhoria contínua</strong> — OEE, refugo, tempo de ciclo,
                lead time, custo por unidade — revisados em ciclos de PDCA / Kaizen.
              </li>
            </ol>
          </Section>

          <Section id="pcp-mes-erp" title="PCP, MES e ERP: quem faz o quê">
            <p>
              Três siglas aparecem sempre na gestão da produção industrial. Elas se complementam,
              não competem:
            </p>
            <ul>
              <li><strong>ERP</strong> (Enterprise Resource Planning) — planeja o negócio: vendas,
                compras, finanças, estoque contábil e demanda agregada.</li>
              <li><strong>PCP</strong> (Planejamento e Controle da Produção) — transforma o plano
                do ERP em ordens de produção sequenciadas, com data e recurso.</li>
              <li><strong>MES</strong> (Manufacturing Execution System) — executa e mede o chão de
                fábrica em tempo real: apontamentos, paradas, receitas, OEE, rastreabilidade.</li>
            </ul>
            <p>
              O ERP diz <em>o que</em> produzir e <em>quando entregar</em>. O PCP diz
              <em> como sequenciar</em>. O MES garante que aquilo <em>aconteça e seja medido</em>.
              Sem MES, o ERP fica cego: ele planeja, mas não sabe se o plano foi cumprido.
            </p>
          </Section>

          <Section id="indicadores" title="Indicadores que realmente importam">
            <ul>
              <li>
                <strong>OEE</strong> (Overall Equipment Effectiveness) — combina disponibilidade,
                performance e qualidade em um único número (0–100%). Classe mundial fica acima de
                85%; muitas fábricas brasileiras operam entre 40% e 60%.
              </li>
              <li>
                <strong>Lead time</strong> — tempo total entre entrada do pedido e entrega. Reduzir
                lead time libera capital de giro e melhora atendimento.
              </li>
              <li>
                <strong>Tempo de ciclo</strong> — quanto tempo cada unidade leva no processo. Base
                para dimensionar capacidade e turnos.
              </li>
              <li>
                <strong>Taxa de refugo / retrabalho</strong> — mede qualidade real do processo, não
                só do produto final.
              </li>
              <li>
                <strong>MTBF e MTTR</strong> — tempo médio entre falhas e tempo médio para reparo.
                Essenciais para justificar investimentos em manutenção preventiva.
              </li>
              <li>
                <strong>Aderência ao plano</strong> — quanto do que foi programado foi realmente
                produzido no prazo.
              </li>
            </ul>
          </Section>

          <Section id="passo-a-passo" title="Passo a passo para otimizar a fábrica">
            <ol>
              <li><strong>Mapeie o processo real</strong>, não o que está no manual. Faça
                gemba walk e desenhe o fluxo com quem opera.</li>
              <li><strong>Instrumente o chão de fábrica</strong> — colete apontamentos digitais,
                paradas com motivo e leituras de CLP/tags automaticamente.</li>
              <li><strong>Meça o OEE</strong> por equipamento e por turno antes de qualquer projeto
                de melhoria — é a linha de base.</li>
              <li><strong>Ataque as 3 maiores perdas</strong> primeiro (Pareto). Normalmente:
                paradas não planejadas, setup e refugo.</li>
              <li><strong>Padronize o que funciona</strong> em SOPs curtos e visuais, ligados à
                ordem de produção.</li>
              <li><strong>Automatize alertas</strong> — o supervisor deve receber um push quando um
                indicador crítico sair da faixa, não descobrir no fim do turno.</li>
              <li><strong>Revise em ciclos curtos</strong> — reuniões diárias de 15 minutos com o
                mesmo painel de indicadores, semana após semana.</li>
            </ol>
          </Section>

          <Section id="sthapc" title="Como o STHApc entra nesse processo">
            <p>
              O <strong>STHApc</strong> é um sistema de gestão industrial que unifica PCP,
              execução (MES) e indicadores em uma única plataforma, pensado para fábricas que
              hoje operam com planilhas ou vários sistemas desconectados. Com ele você:
            </p>
            <ul>
              <li>Cria e sequencia <strong>ordens de produção</strong> ligadas a receitas e produtos.</li>
              <li>Coleta <strong>apontamentos e paradas</strong> direto do chão, com motivo obrigatório.</li>
              <li>Integra <strong>tags de CLP</strong> e endpoints externos para calcular OEE automaticamente.</li>
              <li>Gerencia <strong>estoque, análises de qualidade e rastreabilidade</strong> por lote.</li>
              <li>Dispara <strong>alertas por e-mail e push</strong> quando indicadores saem da faixa
                — mesmo com o supervisor fora do sistema.</li>
              <li>Monta <strong>dashboards e relatórios de turno</strong> prontos para a reunião diária.</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Criar conta grátis
              </Link>
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-md border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                Voltar para o site
              </Link>
            </div>
          </Section>

          <Section id="faq" title="Perguntas frequentes">
            <h3>O que é gestão da produção industrial?</h3>
            <p>
              É o conjunto de práticas, processos e sistemas usados para planejar, executar e
              controlar a fabricação de produtos com o menor custo, no menor tempo e com a
              qualidade desejada.
            </p>
            <h3>Qual a diferença entre PCP, MES e ERP?</h3>
            <p>
              O ERP planeja demanda, compras e finanças; o PCP transforma o plano em ordens de
              produção sequenciadas; o MES executa e mede o chão de fábrica em tempo real.
            </p>
            <h3>O que é OEE e por que ele importa?</h3>
            <p>
              OEE mede a eficiência real de um equipamento combinando disponibilidade, performance
              e qualidade em um único percentual. É o principal indicador para identificar perdas
              e priorizar projetos de melhoria.
            </p>
            <h3>Preciso de um MES mesmo tendo ERP?</h3>
            <p>
              Sim, se você quer dados confiáveis do chão de fábrica. O ERP planeja; o MES garante
              que o plano seja executado e medido. Sem MES, indicadores como OEE, refugo e
              aderência ao plano dependem de digitação manual — o que costuma ser lento e
              impreciso.
            </p>
          </Section>
        </div>

        <footer className="mt-16 border-t border-border/60 pt-8 text-sm text-muted-foreground">
          <p>
            Publicado por <strong className="text-foreground">STHApc</strong> — plataforma de gestão
            industrial para fábricas que querem transformar dados em decisão.
          </p>
        </footer>
      </main>
    </div>
  );
}
