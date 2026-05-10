# PLAN.md — Refatoração de Arquitetura

> **Status:** pendente — não executar ainda.  
> **Motivação:** `App.tsx` (~1 500 linhas) e `helpers.ts` (~700 linhas) concentram lógica que deveria estar distribuída. Qualquer nova feature aumenta o acoplamento e o tempo de revisão.

---

## Problema atual

| Arquivo | Tamanho | Problema |
|---|---|---|
| `apps/web/src/App.tsx` | ~1 500 linhas | UI, estado, tipos, mapeamentos e lógica de negócio misturados |
| `functions/src/helpers.ts` | ~700 linhas | Todas as helpers de jogo em um só lugar — difícil testar isoladamente |
| `functions/src/index.ts` | ~600 linhas | Handlers e lógica inlined; confunde responsabilidade |

---

## Proposta de estrutura

### Frontend (`apps/web/src/`)

```
src/
  components/
    RoleCard.tsx          # colapsável de história do personagem (item 1 — já implementado inline)
    Folhetim.tsx          # crônica e log público do dia
    NightScreen.tsx       # tela da fase noturna (seleção de alvo + ação)
    DayScreen.tsx         # tela da fase do dia (chat + voto + ações especiais)
    LobbyScreen.tsx       # tela de lobby (código + lista de jogadores)
    EndScreen.tsx         # tela de fim de jogo (resultado + revelação + crônica)
    ChatPanel.tsx         # panel de chat (isolado para reusar)
  hooks/
    useRoom.ts            # onSnapshot da sala — retorna RoomDoc | null
    usePlayers.ts         # onSnapshot da subcoleção players
    usePublicLog.ts       # onSnapshot de publicLogEntries
    usePrivateLog.ts      # onSnapshot de privateLog/{playerId}/entries
    useChat.ts            # onSnapshot de chat (só ativo no dia)
    useDayVotes.ts        # onSnapshot de votes/{round}
  lib/
    roleStories.ts        # ROLE_LORE + ROLE_DISPLAY + ROLE_NIGHT_DESCRIPTION (extraídos de App.tsx)
    firebase.ts           # já existe
  types.ts                # RoomDoc, PlayerDoc, LogEntry, ChatMessage (extraídos de App.tsx)
  App.tsx                 # só roteamento entre screens — < 80 linhas
```

**Critérios de corte de componentes:**
- Cada screen exporta um componente único que recebe dados via props ou hooks
- Nenhum componente tem mais de 200 linhas
- Hooks isolam lógica de Firestore — componentes não importam `onSnapshot` diretamente

### Backend (`functions/src/`)

```
functions/src/
  handlers/
    game.ts       # startGame, restartGame, setExpectedPlayerCount, addBots
    night.ts      # submitNightAction, startNight, processBotNightActions (handler)
    day.ts        # submitVote, advanceDay, finalizeDay (handler)
    chat.ts       # sendChatMessage
    dayActions.ts # coronelStartAccusation, coronelAccusationVote, cangaceiroTiroCerto,
                  #   markSaciGorroOffer, saciGorroSwap, brasContinueChoice
  lib/
    helpers.ts    # loadPlayers, loadSecrets, startNightSequence, finalizeNight, findPlayer
    finalize.ts   # finalizeDay, checkEndConditions — isolado para testar vitória
    bots.ts       # processBotNightActions — lógica de IA separada
  index.ts        # apenas re-exports de handlers/
```

**Critérios de corte de handlers:**
- Cada handler valida `requireAuth` + parâmetros e delega para `lib/`
- `lib/` não importa `HttpsError` — erros sobem como exceções tipadas
- `bots.ts` pode ser testado sem Firebase (mock de players)

---

## Ordem de execução sugerida

1. **Extrair `types.ts`** — move `RoomDoc`, `PlayerDoc` e tipos de log. Zero risco.
2. **Extrair `lib/roleStories.ts`** — move `ROLE_LORE`, `ROLE_DISPLAY`, `ROLE_NIGHT_DESCRIPTION`. Zero risco.
3. **Criar hooks** — `useRoom`, `usePlayers`, `usePublicLog`, `usePrivateLog`, `useChat`, `useDayVotes`. Cada hook é testável e independente.
4. **Extrair screens** — começar por `LobbyScreen` (mais isolado), depois `NightScreen`, `DayScreen`, `EndScreen`.
5. **Extrair `App.tsx`** — roteamento puro após screens extraídas.
6. **Backend: extrair `bots.ts`** — `processBotNightActions` é a função mais testável.
7. **Backend: extrair `finalize.ts`** — `finalizeDay` + `checkEndConditions`.
8. **Backend: criar `handlers/`** — mover exports de `index.ts` para arquivos por domínio.

---

## Trade-offs

| Pró | Contra |
|---|---|
| Cada arquivo tem responsabilidade única | Migração = ~2-3 dias de trabalho sem novas features |
| Hooks isolados facilitam testes unitários | Risco de regressão se feito de pressa |
| Screens menores = PR reviews mais rápidas | Aumenta número de arquivos importados |
| `bots.ts` separado permite mock fácil | Requer ajuste de imports em cascata |

**Recomendação:** executar após estabilizar as features principais. Fazer em PRs separados por etapa (types → hooks → screens → backend), nunca em um PR monolítico.
