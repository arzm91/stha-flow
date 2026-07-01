## Objetivo

Transformar o "Diagrama PFD" em um **supervisório industrial** editável, com símbolos ISA profissionais desenhados em SVG vetorial, ferramentas de layout (grid, snap, alinhar, agrupar, camadas), tubulações ortogonais coloridas por fluido e **bindings de tag** com animação (nível, valor, cor por faixa, on/off, rotação, fluxo). O mesmo desenho é exibido em modo somente-leitura na tela de acompanhamento da produção, substituindo o PFD antigo.

## Escopo aprovado pelo usuário

- **Símbolos**: tanques/vasos/colunas (com nível animado), bombas/compressores/agitadores (rotação + on/off), trocadores/reatores/filtros, válvulas (gaveta, globo, esfera, retenção, controle, alívio) e balões de instrumento ISA-5.1 (TI, PI, FI, LT, PT, FT, AT…).
- **Animações**: nível (fill vertical entre min/max), valor numérico + unidade sobreposto, cor por faixa/alarme (verde/amarelo/vermelho), on/off + rotação, fluxo animado na tubulação.
- **Editor**: linhas ortogonais coloridas por fluido, formas livres (retângulo/círculo/polígono/texto), seleção múltipla + agrupar + alinhar + distribuir + snap-to-grid, camadas com z-index (processo × instrumentação).
- **Viewer**: substitui totalmente o PFD antigo em `producao.$id.tsx`.

## Arquitetura

```text
src/components/scada/
  symbols/            # SVGs vetoriais dos símbolos ISA (um arquivo por família)
    Tank.tsx          # tanque/vaso/coluna com <clipPath> pra nível animado
    Pump.tsx          # bomba/compressor com rotor rotacionável
    Agitator.tsx
    HeatExchanger.tsx
    Reactor.tsx
    Filter.tsx
    Valve.tsx         # gaveta/globo/esfera/retenção/controle/alívio
    Instrument.tsx    # balão ISA (2 letras + tag)
    FreeShape.tsx     # retângulo/círculo/polígono/texto
  ScadaCanvas.tsx     # canvas SVG com pan/zoom, grid, snap, seleção
  ScadaEditor.tsx     # editor: toolbar, palette, properties panel, layers
  ScadaViewer.tsx     # render read-only + live tags (substitui PfdViewer)
  bindings.ts         # avalia binding {tag, min, max, faixas} -> {fill%, color, valor, on}
  types.ts            # ScadaDoc, ScadaElement, Binding, FluidType, Layer
  useTagsLive.ts      # hook central: consulta tags_live + alertas (polling 2s)
```

**Modelo de dados** (JSON em `equipamentos.pfd_graph`, mantendo a coluna):

```ts
type ScadaDoc = {
  version: 2;
  canvas: { width: number; height: number; grid: number; bg: string };
  layers: { id: string; name: string; visible: boolean; z: number }[];
  elements: ScadaElement[];  // símbolos + formas livres
  pipes: ScadaPipe[];        // tubulações ortogonais
};
type ScadaElement = {
  id: string; kind: SymbolKind | "shape" | "text" | "instrument";
  x: number; y: number; w: number; h: number; rot: number;
  layerId: string; z: number; label?: string;
  props: Record<string, unknown>;   // por símbolo (ex: valveType, tankOrientation)
  bindings?: {
    level?:   { tag: string; min: number; max: number };
    value?:   { tag: string; decimals: number; showUnit: boolean };
    color?:   { tag: string; ranges: { op: "<"|">"|"between"; a: number; b?: number; color: string }[] };
    onOff?:   { tag: string; threshold: number };  // controla rotação/animação
  };
};
type ScadaPipe = {
  id: string; from: { elId: string; port: string }; to: { elId: string; port: string };
  waypoints: { x: number; y: number }[];   // ortogonal
  fluid: FluidType; thickness: number; animated: boolean; layerId: string;
};
```

`version: 2` permite migrar em runtime docs antigos (v1 = ReactFlow) pra v2 novo — os elementos existentes viram símbolos equivalentes.

## Passos de implementação

1. **Fundamentos** — criar `types.ts`, `bindings.ts` (avaliação pura de bindings), `useTagsLive.ts` (query `tags_live` + `alertas`), catálogo de fluidos e cores.
2. **Símbolos ISA** — desenhar cada família em SVG vetorial escalável, com portas de conexão nomeadas (top/bottom/left/right/inlet/outlet). Tanque/coluna usam `<clipPath>` animado por altura. Bomba tem `<g>` rotor com `animate` conforme on/off. Válvula muda cor por estado.
3. **ScadaCanvas** — SVG raiz com pan/zoom (roda + arrastar), grid pontilhado, snap ao grid, régua opcional. Renderiza elementos + tubulações + handles de seleção.
4. **ScadaEditor** — três painéis:
   - **Palette** à esquerda: categorias colapsáveis (Tanques, Rotativos, Trocadores, Válvulas, Instrumentos, Formas, Texto). Drag-to-place ou click-to-place.
   - **Canvas** ao centro com toolbar (undo/redo, zoom, alinhar, distribuir, agrupar, camadas, snap on/off, salvar).
   - **Properties** à direita: dimensões, rotação, camada, propriedades do símbolo, **bindings de tag** com autocomplete de tags (`tags_live.nome`).
5. **Tubulações ortogonais** — roteamento automático em cotovelos 90°, cor por fluido, seta ISO, animação de fluxo (dashoffset) quando `bindings.onOff` da tubulação for verdadeiro ou o elemento de origem estiver "ligado".
6. **Migração v1→v2** — ao abrir doc antigo, converter nodes/edges do ReactFlow em ScadaElements/ScadaPipes. Salvamento sempre em v2.
7. **ScadaViewer** — mesmo render do canvas em modo `readOnly`, sem toolbar/palette, com pan/zoom disponível e polling de tags. Substitui `PfdViewer` em `producao.$id.tsx`.
8. **Persistência** — mantém `equipamentos.pfd_graph JSONB`, sem migration de schema. Auto-save no botão salvar; garantia de round-trip (todas as dimensões, cores, camadas, bindings preservados).
9. **Cleanup** — remove `PfdViewer.tsx` e o editor ReactFlow antigo depois que o novo estiver funcional; renomeia rota interna se necessário (mantendo URL para não quebrar links).

## Detalhes técnicos importantes

- **Sem ReactFlow**. SVG puro dá controle total dos símbolos, das animações e do visual industrial. ReactFlow é ótimo pra grafo abstrato, ruim pra supervisório.
- **Sem novas dependências pesadas**. Só `nanoid` (já presente via shadcn ecosystem — se faltar, adiciono). Pan/zoom implementado à mão em ~80 linhas.
- **Tags live**: reuso do polling existente (`AutoTagSync` já roda a cada 2s → `tags_live`). O hook `useTagsLive` só assina a query.
- **Alarmes**: reuso `alertas` (`tag_nome`, `min_val`, `max_val`) — se o binding `color` não tiver faixas explícitas, cai no fallback do alarme.
- **Performance**: elementos memoizados por id; re-render só quando o valor da tag ligada muda.
- **Nada de mudança de schema**, nada de mudança de fluxo de automação/produção. Só substituição visual do PFD.

## Fora do escopo desta entrega

- Comandos de escrita nas tags (isso é supervisório de leitura, como você pediu — "apenas observar").
- Histórico/tendências dentro do supervisório (existem telas próprias pra isso).
- Alarmes novos — usamos os já cadastrados em `alertas`.

Confirma que posso seguir por esse caminho? É uma reescrita grande (estimo ~1500 linhas novas + remoção do editor antigo).