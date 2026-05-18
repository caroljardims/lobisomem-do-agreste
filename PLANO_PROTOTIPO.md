# Plano de Implementação — Protótipo → Produção

Baseado no `Folhetim de Bucaré - Protótipo.html` (Claude Design, 2026-05-18).

---

## Contexto e decisões já tomadas

| Pergunta | Decisão |
|---|---|
| Escopo | Um screen por vez, confirmado a cada etapa |
| Batismo do personagem | Adicionar tela nova antes da primeira noite |
| Amanhecer | Tela separada em tela cheia entre noite e dia |
| Estrutura do dia | Reformulada (etiqueta + mini-folhetim + stages + vote sheet) |
| Backend | Frontend + ajustes de estado local apenas |

---

## Diagnóstico: o que o protótipo resolve

O problema central das telas atuais: **tudo empilhado ao mesmo tempo** — personagem expandido, ação, folhetim, chat, voto. O protótipo resolve com três princípios:

1. **Uma coisa por vez** — cada momento tem uma ação dominante
2. **Carta como etiqueta** — depois que o jogador leu, vira pin no canto
3. **Folhetim merece o ato** — no amanhecer, ele é *a* tela

---

## Etapa 1 — CSS: novos componentes do protótipo

**Arquivo:** `apps/web/src/styles.css`

Adicionar as classes abaixo (que existem no protótipo mas não no CSS atual):

### 1a. Etiqueta (character pin no corner)
```css
/* .etiqueta, .etiqueta__pic, .etiqueta__pic--criatura */
/* .etiqueta__name, .etiqueta__sub, .etiqueta__arrow */
```
Uso: role-story-card vira etiqueta compacta nas telas de noite e dia.

### 1b. Folheto interativo (batismo)
```css
/* .folheto-int, .folheto-int--{criatura,morador,neutro} */
/* .folheto-int__capa, .folheto-int.is-open .folheto-int__capa */
/* .folheto-int__xilo, .folheto-int__name, .folheto-int__lado */
/* .folheto-int__hint (Caveat italic, hint to tap) */
/* .folheto-int__corpo (papel-velho background, max-height 0→600px on .is-open) */
/* .folheto-int__sec, .folheto-int__txt */
```
Uso: tela de batismo — capa clicável que expande o corpo de papel.

### 1c. Stages (progress indicator no dia)
```css
/* .stages, .stages__dot, .stages__dot--on, .stages__dot--done */
/* .stages__line */
```
Uso: barra Folhetim → Conversa → Voto acima do chat.

### 1d. Cordel card completo
```css
/* .cordel, .cordel--{criatura,morador,neutro} */
/* .cordel__furo (fuinho de corda no topo) */
/* .cordel__cabec, .cordel__num, .cordel__xilo */
/* .cordel__titulo, .cordel__lado */
/* .cordel__placeholder (quando sem xilo) */
```
Uso: overlay de releitura da carta durante noite/dia.

### 1e. Folhetim melhorias
```css
/* .folhetim__corpo .drop::first-letter (drop cap com Rye, tijolo) */
/* .screen--amanhecer::before (já existe — verificar se precisa ajuste) */
```

### 1f. Bottom sheet overlay (voto)
```css
/* backdrop semi-transparent, slide-up, drag handle */
/* reutiliza .jogador, .btn existentes */
```

### 1g. Código da sala (lobby)
```css
/* .codigo-sala, .codigo-sala__rotulo, .codigo-sala__codigo */
/* .codigo-sala__cantos::before/::after (ornamento ❋) */
```
A versão atual usa classes genéricas — migrar para `.codigo-sala`.

**Resultado da Etapa 1:** CSS com todos os componentes do protótipo. Ainda não aparece na UI — apenas fundação.

---

## Etapa 2 — Batismo do Personagem

**Arquivo:** `apps/web/src/App.tsx`

### O que é
Overlay/substitução da tela de noite quando o jogador ainda não viu seu personagem. Aparece uma vez por sessão (primeira noite, rodada 1). O jogador toca o folheto para abrir, lê as três seções, então clica "Entendi — ir para a noite ☾".

### Estado novo
```ts
// Fora do componente (module-level) — persiste por sessão
const batismoSeenKey = (roomCode: string) => `batismo_${roomCode}`;

// Dentro do componente:
const [batismoSeen, setBatismoSeen] = useState<boolean>(() => {
  return sessionStorage.getItem(batismoSeenKey(roomCode ?? "")) === "1";
});
const [batismoOpen, setBatismoOpen] = useState(false); // folheto aberto?
```

### Lógica de exibição
```
room.status === "night"
  AND room.round === 1
  AND myRole !== null
  AND !batismoSeen
→ renderizar <BatismoScreen> em vez do conteúdo normal da noite
```

### Componente `BatismoScreen`
Layout baseado no protótipo `BatismoScreen` + `FolhetoInterativo`:

```
┌─────────────────────────────┐
│ Anno I · N.º 1              │  (chrome center, sem botões laterais)
│                             │
│   Editora Bucaré            │  (eyebrow luar)
│   Esta noite, você é —      │  (ff-display, 26px)
│                             │
│ ┌─────────────────────────┐ │
│ │  [xilo ou inicial]      │ │  (folheto-int__capa — clicável)
│ │  LOBISOMEM              │ │
│ │  — criatura —           │ │
│ │  toque o folheto        │ │  (Caveat, italic)
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │  (folheto-int__corpo — papel-velho)
│ │  quem você é            │ │  (só aparece após tap)
│ │  [narrative text]       │ │
│ │  o que você faz         │ │
│ │  [poder]                │ │
│ │  o que você quer        │ │
│ │  [objetivo]             │ │
│ └─────────────────────────┘ │
│                             │
│ [Entendi — ir para a noite] │  (btn--dia, disabled até abrir)
└─────────────────────────────┘
```

### Mapeamento ROLE_LORE → seções do batismo
O `ROLE_LORE` tem `narrative` e `sections` (KV + aside). Para o batismo, usar:
- **quem você é** → `lore.narrative`
- **o que você faz** → primeiro `kind: "kv"` onde title contém "Poder" ou "noturno"
- **o que você quer** → `kind: "kv"` onde title contém "Objetivo"

Criar helper `extractBatismoSections(lore: LoreRich | string)` no App.tsx.

### Assets (xilogravuras)
O protótipo tem 4 imagens: `xilo-lobisomem.png`, `xilo-mula.png`, `xilo-saci.png`, `xilo-iara.png`.
- Copiar para `apps/web/public/assets/`
- Adicionar mapeamento `ROLE_XILO: Record<string, string>` no App.tsx
- Para roles sem xilo: placeholder com inicial em Rye (como no protótipo)

### Ao clicar "Entendi"
```ts
setBatismoSeen(true);
sessionStorage.setItem(batismoSeenKey(roomCode), "1");
```
A tela da noite aparece normalmente.

**Resultado da Etapa 2:** Jogadores veem o folheto desdobrável antes da primeira noite.

---

## Etapa 3 — Amanhecer como Tela Própria

**Arquivo:** `apps/web/src/App.tsx`

### O que é
Quando `room.status === "day"`, antes de mostrar a fase do dia, exibir o Folhetim em tela cheia. O jogador lê e clica "Ler na praça →" para avançar.

### Estado novo
```ts
// Persiste por rodada, não por sessão
const [folhetimDismissedRound, setFolhetimDismissedRound] = useState<number>(0);
```

### Lógica de exibição
```
room.status === "day"
  AND room.round > folhetimDismissedRound
→ renderizar <AmanhecerScreen> em vez do dia
```

### Componente `AmanhecerScreen`
Layout baseado no protótipo `FolhetimScreen`:

```
┌─────────────────────────────┐
│ Amanhecer · Dia {round}     │  (chrome center — sem laterais)
│                             │
│         ☀                   │  (sol emoji, ocre, glow)
│    o sol entra na praça     │  (eyebrow ocre)
│                             │
│  ┌───────────────────────┐  │
│  │ Anno I · N.º 01       │  │
│  │ FOLHETIM DE BUCARÉ    │  │  (papel-velho, titulo Rye)
│  │ — edição da madrugada │  │
│  │ UM MORTO NO AÇUDE     │  │  (manchete)
│  │ A cidade acorda...    │  │  (corpo, drop cap)
│  │ — o redator que viu — │  │
│  │      [URGENTE]        │  │  (selo animado, se morte)
│  └───────────────────────┘  │
│                             │
│  [Log privado se houver]    │  (dashed border, ouro)
│                             │
│  [Ler na praça →]           │  (btn--dia, aparece após 2s)
└─────────────────────────────┘
```

### Conteúdo do Folhetim
Usar `publicLog` filtrado por `round === room.round` e `type !== "dawn"`:
- Morte → manchete "UM MORTO NO AÇUDE" / "O SERTÃO ENGOLIU MAIS UM"
- Silêncio → "NOITE EM PAZ" / "BUCARÉ DORMIU INTEIRA"
- Aterrorizado → mencionar no corpo
- Mordida → "MARCAS ESTRANHAS NA CIDADE"

Log privado do round atual (`privateLog`) aparece abaixo em bloco pontilhado ouro.

### Botão com delay
```ts
const [showCTA, setShowCTA] = useState(false);
useEffect(() => {
  const t = setTimeout(() => setShowCTA(true), 1800);
  return () => clearTimeout(t);
}, []);
```

### Ao clicar "Ler na praça →"
```ts
setFolhetimDismissedRound(room.round);
```
Dia aparece normalmente.

### Caso especial: expulsão
Quando `pendingNightStart: true` (dia terminou, aguardando anfitrião), também mostrar folhetim extra com evento de expulsão/empate. Nesse caso o botão/aviso é para o anfitrião (Toque de recolher).

**Resultado da Etapa 3:** O folhetim tem seu momento — tela cheia, papel envelhecido, sem competição.

---

## Etapa 4 — Fase do Dia Reformulada

**Arquivo:** `apps/web/src/App.tsx`

### O que muda
| Atual | Novo |
|---|---|
| role-story-card colapsável no topo | `.etiqueta` compacta (35px de altura) com botão ▸ reler |
| Folhetim inline completo no topo do dia | Mini-folhetim clicável (2 linhas: N.º + manchete), toca → overlay |
| Sem indicador de fase | Stages: Folhetim · Conversa · Voto |
| Vote selector inline expandido | Vote bar sticky + VoteSheet bottom sheet |
| Chat sem separação clara | Chat ocupa espaço restante, scroll interno |

### Layout do dia
```
┌─────────────────────────────┐
│ ← Sair  Dia 2 · praça   ?  │  (chrome)
│                             │
│ [etiqueta: LOBISOMEM ▸ler] │  (35px, clica → overlay)
│                             │
│ [Mini-folhetim clicável]    │  (papel-velho, 2 linhas, ▸ reler)
│                             │
│ ○──── Folhetim ────○──── Conversa ────○ Voto │  (stages)
│                             │
│ [chat mensagens...]         │  (scroll interno, flex 1)
│ [Benedita: texto aqui]      │
│ [você: minha resposta]      │
│                             │
│ [input ──────────── ▸]      │  (some quando stage = voto)
│                             │
│ ┌─────────────────────────┐ │
│ │ seu voto                │ │  (vote bar sticky)
│ │ [nome ou tocar p/escolh]│ │
│ │                trocar ▸ │ │
│ └─────────────────────────┘ │
│ [Apurar votos]              │  (btn--dia, só quando todos votaram)
└─────────────────────────────┘
```

### Estado novo
```ts
const [dayStage, setDayStage] = useState<1 | 2>(1); // 1=conversa, 2=voto
const [voteSheetOpen, setVoteSheetOpen] = useState(false);
const [refolhetimOpen, setRefolhetimOpen] = useState(false);
```

### VoteSheet (bottom sheet)
```
┌─────────────────────────────┐
│ [drag handle bar]           │
│ Quem você acusa?            │
│ [JogadorRow p1]             │
│ [JogadorRow p2]             │
│ [JogadorRow p3]             │
│ [— em branco —]             │
└─────────────────────────────┘
```
Backdrop semi-opaco fecha ao tocar fora.

### Etiqueta de papel (mini-folhetim)
```jsx
<button className="mini-folhetim" onClick={() => setRefolhetimOpen(true)}>
  <div className="mini-folhetim__num">Folhetim · N.º {pad(round)}</div>
  <div className="mini-folhetim__manchete">{mancheteResumida}</div>
  <div className="mini-folhetim__reler">▸ reler</div>
</button>
```
Estilo: `background: var(--papel-velho)`, 1px solid papel-mancha, rotate(-0.4deg).

### Overlay de releitura
Quando `refolhetimOpen`: renderizar AmanhecerScreen inline mas com botão "Voltar" em vez de "Ler na praça".

**Resultado da Etapa 4:** Dia com hierarquia clara, voto acessível mas não dominante.

---

## Ordem de execução

```
Etapa 1 → CSS foundations     (sem tocar App.tsx — só estilos)
Etapa 2 → Batismo             (novo estado + BatismoScreen em App.tsx)
Etapa 3 → Amanhecer           (novo estado + AmanhecerScreen em App.tsx)
Etapa 4 → Dia reformulado     (refatorar bloco room.status === "day")
```

Cada etapa termina com commit + revisão visual antes de avançar.

---

## Assets a copiar (Etapa 2)

| Arquivo fonte | Destino |
|---|---|
| `/tmp/design_bundle2/.../assets/xilo-lobisomem.png` | `apps/web/public/assets/xilo-lobisomem.png` |
| `/tmp/design_bundle2/.../assets/xilo-mula.png` | `apps/web/public/assets/xilo-mula.png` |
| `/tmp/design_bundle2/.../assets/xilo-saci.png` | `apps/web/public/assets/xilo-saci.png` |
| `/tmp/design_bundle2/.../assets/xilo-iara.png` | `apps/web/public/assets/xilo-iara.png` |

Roles sem xilo (aldeao, cartomante, etc.): placeholder com inicial em Rye.

---

## O que NÃO está no escopo deste plano (Etapas 1–4)

- Redesign do Lobby → Etapa 5
- Redesign da Noite → Etapa 6
- Fim de Jogo com pódio → Etapa 7
- Lógica de Firebase / Cloud Functions
- Suporte a múltiplos jogadores no batismo (cada jogador tem seu próprio estado local)

---

## Etapa 5 — Lobby Reformulado

**Arquivo:** `apps/web/src/App.tsx` (bloco `inLobby`)

### Diagnóstico atual
O lobby atual tem: código no topo em card genérico, lista de jogadores com texto plano, seletor de número esperado como input numérico, botões de ação no rodapé. Não há distinção visual entre anfitrião e convidado, nem sensação de antecipação.

### O que o protótipo propõe (LobbyScreen)
Dois estados:
- **Esperando** (< 5 jogadores): código em destaque como herói, "À volta da fogueira", vagas vazias com dashed border + Caveat italic "vaga aberta — esperando…"
- **Pronto** (≥ 5 jogadores): código encolhe para barra compacta, foco passa para o botão de iniciar

### Layout novo
```
┌─────────────────────────────┐
│ ← Sair   Lobby · 3/5    —  │  (chrome com contagem)
│                             │
│  ╔═══════════════════════╗  │  ← código herói (estado: esperando)
│  ║   CÓDIGO DA SALA      ║  │  (.codigo-sala com .codigo-sala__cantos ❋)
│  ║       BXQR            ║  │  (Rye, 56px, ouro, text-shadow glow)
│  ╚═══════════════════════╝  │
│  [Copiar]  [Compartilhar]   │  (btn--ghost btn--sm, par)
│                             │
│  À volta da fogueira    3/5 │  (eyebrow + contagem)
│  [✦ Cecília    anfitriã]   │  (.jogador com .jogador__tag--anfitriao)
│  [✶ Severino   conectado]  │  (.jogador--static)
│  [◆ Benedita   conectado]  │  (.jogador--static)
│  [+ vaga aberta…]          │  (dashed, Caveat italic, opacidade 0.6)
│  [+ vaga aberta…]          │
│                             │
│  [Esperando jogadores…]     │  (btn--ghost desabilitado)
│  [+ Preencher com bots (2)] │  (btn--ghost btn--sm)
└─────────────────────────────┘

Estado pronto (≥ 5):
│  [BXQR    ···    copiar]    │  (.codigo-sala compacto: row com código menor)
│  ...lista de jogadores...   │
│  [Começar a noite ☾]        │  (btn--dia)
```

### Mudanças em CSS
- `.codigo-sala` já definido na Etapa 1
- `.codigo-sala--compact`: row layout, código em 18px
- `.jogador__tag--anfitriao` (vermelho sangue)
- `.jogador__tag--voce` (ouro)
- Vagas vazias: `border: 1px dashed var(--linha-fina)`, Caveat para o texto

### Mudanças em App.tsx
- Substituir `.code-card` / `.code-card-label` por `.codigo-sala` e `.codigo-sala__cantos`
- Substituir `.player-list` por `.col.gap-2` com `.jogador` rows
- Substituir `.player-count-selector` por seletor baseado em chips (opcional: manter select, trocar estilo)
- Adicionar vagas vazias renderizadas: `Array.from({ length: expectedPlayerCount - players.length })`
- Botão de início: `btn--dia` quando pronto, `btn--ghost` desabilitado + mensagem quando esperando
- Estado `isReady = players.length >= (room?.expectedPlayerCount ?? 5)`

### Não muda
- Lógica de `fillBots`, `startGame`, `expectedPlayerCount` — mesmos calls Firebase
- Sincronização de lista de jogadores via Firestore snapshot

---

## Etapa 6 — Fase da Noite Reformulada

**Arquivo:** `apps/web/src/App.tsx` (bloco `room.status === "night"`)

### Diagnóstico atual
A noite atual empilha: role-story-card (pode estar expandido), bloco de contexto de turno, seletor de ação, seletor de alvo, botão de confirmação, overlay de "Aguardando sua vez". Muita informação competindo.

### O que o protótipo propõe (NoiteScreen)
- Etiqueta no topo (personagem encolhido — igual ao Dia)
- Lua animada centralizada + "A vila dorme"
- Pergunta direta em itálico (actionPrompt do personagem)
- Lista de alvos como `.jogador` rows
- Botão de confirmação na base: "Devorar [Nome]"
- Se não é sua vez: "Aguarde o amanhecer" (sem lista de alvos)
- Botão `?` no chrome → overlay de releitura da carta (ReadCardOverlay)

### Layout novo
```
┌─────────────────────────────┐
│ ← Sair  Rodada 2 · Noite ?  │  (chrome: ? abre overlay de carta)
│                             │
│ [etiqueta: LOBISOMEM ▸ler] │  (.etiqueta, 35px)
│                             │
│         ☾                   │  (.lua, 56px, animação lua-pisca)
│     A vila dorme            │  (eyebrow--luar)
│                             │
│  Lobisomem, quem você      │  (serif italic, 18px, texto-claro)
│  caça esta noite?           │
│                             │
│  [✶ Severino    →alvo]     │  (.jogador, selectable)
│  [◆ Benedita              ]│
│  [✸ Eustácio              ]│
│                             │
│  [Devorar Severino]         │  (.btn--noite, base da tela)
└─────────────────────────────┘

Quando não é sua vez (papel sem poder / aguardando):
│         ☾                   │
│     A vila dorme            │
│                             │
│  Você não tem ação          │  (serif italic, luar)
│  esta noite.                │
│  Aguarde o amanhecer.       │
│                             │
│  [Outros jogadores agindo…] │  (btn--ghost, cursor default, desabilitado)
│  [Toque da alvorada]        │  (aparece quando nightReady disponível)
└─────────────────────────────┘
```

### Separação de casos (já existe parcialmente)
| Caso | `myRoleIsPending` | Tem poder | UI |
|---|---|---|---|
| Minha vez, com poder | true | true | pergunta + lista de alvos + btn--noite |
| Minha vez, sem poder (aldeão etc.) | false | false | lua + mensagem de espera + Toque da alvorada |
| Aguardando vez de outro | false | — | lua + mensagem de espera |
| Ação já enviada | — | — | mensagem de confirmação |

### Mudanças em CSS
- `.lua` (já na Etapa 1)
- `.btn--noite` (ghost dourado — já existe, verificar se está correto)
- `.screen--noite::before` (já existe)

### Mudanças em App.tsx
- Substituir `role-story-card` no topo da noite por `.etiqueta`
- Adicionar `lua` centralizada com texto "A vila dorme"
- Substituir `actionPrompt` genérico pelo texto específico do papel (já existe em `nightAction` lógica — só reorganizar hierarquia visual)
- Mover botão de confirmação para `margin-top: auto` na base
- Overlay "?" → `ReadCardOverlay` (mostrar lore expandido com `.cordel` + corpo de papel)
- Não muda: lógica de `submitNightAction`, `markNightReady`, `nightTarget`, validações

### Personagens especiais
Os papéis com fluxo especial (delegado, geni, cangaceiro, curupira/boitatá na 1ª noite) mantêm sua lógica atual — só reorganizar o layout visual ao redor deles.

---

## Etapa 7 — Fim de Jogo: Pódio + Revelação + Crônica

**Arquivo:** `apps/web/src/components/screens/EndScreen.tsx`

### Diagnóstico atual
EndScreen tem três blocos verticais: role-story-card, ended-card (vencedor + botão recomeçar), log-card de revelação, chronicle-card longa. Tudo empilhado, sem hierarquia emocional — o fim de jogo não tem peso.

### O que o protótipo propõe (FimScreen — 3 páginas)
Três "edições" navegáveis com dots e botões anterior/próximo:

**Página 1 — Manchete (FimManchete)**
```
┌─────────────────────────────┐
│     Edição final · 1/3      │
│                             │
│     Anno I · Edição final   │  (eyebrow)
│     Folhetim                │  (Rye 44px, letterpress)
│     de Bucaré               │
│                             │
│  ┌───────────────────────┐  │  (.folhetim, papel-velho)
│  │ — a última edição —   │  │
│  │ A VILA VENCEU O       │  │  (.folhetim__manchete, 18px)
│  │ FOLCLORE              │  │
│  │ A vila identificou o  │  │  (serif italic, tinta-papel-mid)
│  │ Lobisomem (Severino)  │  │
│  │ — o redator que viu — │  │
│  └───────────────────────┘  │
│                             │
│     deslize →               │  (serif italic, muted)
└─────────────────────────────┘
```

**Página 2 — Revelação (FimRevelacao)**
```
┌─────────────────────────────┐
│     Edição final · 2/3      │
│                             │
│  II · a revelação           │  (eyebrow)
│  agora a vila sabe quem     │  (serif italic, muted)
│  era cada um.               │
│                             │
│  [✦ Cecília   Cartomante   ]│  (.jogador, morador)
│  [✶ Severino  Lobisomem   ]│  (.jogador, criatura, eliminado)
│  [◆ Benedita  Aldeão      ]│  (.jogador)
│  [✸ Eustácio  Aldeão      ]│
│  [❋ Caboclo   Aldeão      ]│
└─────────────────────────────┘
```
Usar `.jogador__sim` com cor por lado (criatura: sangue, morador: texto-claro, neutro: luar). Nome do papel como `.jogador__sub` colorido por lado.

**Página 3 — Crônica & Pódio (FimCronica)**
```
┌─────────────────────────────┐
│     Edição final · 3/3      │
│                             │
│  III · a crônica & pódio   │  (eyebrow)
│                             │
│       ┌─────┐               │
│  ┌────┤  I  ├────┐          │  (.podio)
│  │ II │NOME │III │          │
│  │    │     │    │          │
│  │    │     │    │          │
│  └────┴─────┴────┘          │
│                             │
│  ┌───────────────────────┐  │  (.folhetim, papel-velho)
│  │ a crônica             │  │
│  │ Noite 1: Severino...  │  │  (linhas por rodada)
│  │ Dia 1: A vila votou…  │
│  └───────────────────────┘  │
│                             │
│  [Jogar outra edição]       │  (btn--dia, chama restartGame)
└─────────────────────────────┘
```

### Estado novo
```ts
// Dentro de EndScreen (ou App.tsx passando como prop)
const [endPage, setEndPage] = useState<0 | 1 | 2>(0);
```

### Mudanças em CSS
- `.podio`, `.podio__lugar`, `.podio__lugar--1/2/3`
- `.podio__base`, `.podio__nome`, `.podio__pts`
- `.pages__dots`, `.pages__dot`, `.pages__dot--on`
- `.deck` (grid 2 colunas para revelação)

### Mudanças em EndScreen.tsx
- Adicionar `endPage` state
- Renderizar condicionalmente os três blocos em vez de tudo empilhado
- Paginação: botões "← anterior" / "próxima →" + dots
- **Página 1:** montar manchete baseado em `room.winner` (usar textos do CLAUDE.md)
- **Página 2:** lista revelação com `.jogador` rows coloridos por lado
- **Página 3:** pódio (usar `useGameEndHistory` que já existe) + crônica simplificada
- Manter botão "Recomeçar" (apenas para host) na Página 3
- Manter o role-story-card colapsável para o próprio jogador (pode ir em qualquer página ou acima do paginador)

### Pontos
O `useGameEndHistory` já calcula pontos. Usar esses dados para o pódio. O pódio tem 3 posições, na ordem II / I / III visual (como o protótipo).

### Manchetes por vencedor
| `room.winner` | Manchete |
|---|---|
| `"moradores"` | "A VILA VENCEU O FOLCLORE" / "O SERTÃO RESPIRA TRANQUILO" |
| `"criaturas"` | "AS CRIATURAS DOMINARAM BUCARÉ" / "O FOLCLORE ENGOLIU A VILA" |
| `"bots"` | "APOCALIPSE ROBÔ" |
| playerId (vitória individual) | "[NOME] VENCEU" (usar `winnerLabel` existente) |

---

## Ordem de execução completa

```
Etapa 1 → CSS foundations         (styles.css)
Etapa 2 → Batismo                 (App.tsx)
Etapa 3 → Amanhecer               (App.tsx)
Etapa 4 → Dia reformulado         (App.tsx)
Etapa 5 → Lobby reformulado       (App.tsx)
Etapa 6 → Noite reformulada       (App.tsx)
Etapa 7 → Fim de jogo             (EndScreen.tsx)
```

Cada etapa: commit próprio, revisão visual antes de avançar.

## O que NÃO entra em nenhuma etapa

- Landing: já reformulada (commit 3336641)
- Lógica de Firebase / Cloud Functions / game-engine
- Mudanças em regras de jogo ou mecânicas
- Modo claro / responsividade desktop além do atual
