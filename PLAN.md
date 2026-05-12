# PLAN.md — Refatoração de Arquitetura

> **Motivação:** `App.tsx` (~2 400+ linhas) e `helpers.ts` / `index.ts` nas Functions concentram lógica que deveria estar distribuída. Qualquer nova feature aumenta o acoplamento e o tempo de revisão.

---

## Problema atual

| Arquivo | Tamanho (aprox.) | Problema |
|---|---|---|
| `apps/web/src/App.tsx` | ~2 420 linhas | UI, estado, tipos, mapeamentos e lógica de negócio misturados |
| `apps/web/src/dayActions.ts` | extraído | Ações de dia (Coronel, Cangaceiro, etc.) — **passo parcial** já feito no frontend |
| `functions/src/helpers.ts` | ~635 linhas | Helpers de jogo + noite em um só lugar — difícil testar e otimizar I/O isoladamente |
| `functions/src/index.ts` | ~750+ linhas | Handlers e lógica inlined; confunde responsabilidade |

**Lore / RoleCard:** o item “história do personagem colapsável” (CLAUDE.md) está **parcialmente** no `App.tsx` (`loreOpen`, etc.); ainda não existe `components/RoleCard.tsx` dedicado.

---

## Proposta de estrutura

### Frontend (`apps/web/src/`)

```
src/
  components/
    RoleCard.tsx          # colapsável de história do personagem (extrair de App.tsx)
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
  dayActions.ts           # já existe — ações callable do dia
  App.tsx                 # roteamento entre screens (meta: bem menor que hoje)
```

**Critérios de corte de componentes:**
- Cada screen exporta um componente único que recebe dados via props ou hooks
- Nenhum componente tem mais de 200 linhas
- Hooks isolam lógica de Firestore — componentes não importam `onSnapshot` diretamente

### Backend (`functions/src/`)

```
functions/src/
  handlers/
    game.ts       # createRoom, joinRoom, startGame, restartGame, setExpectedPlayerCount, addBots
    night.ts      # submitNightAction, markNightReady, startNight
    day.ts        # submitVote, advanceDay, sendChatMessage
    dayActions.ts # coronelStartAccusation, coronelAccusationVote, cangaceiroTiroCerto,
                  #   markSaciGorroOffer, saciGorroSwap, brasContinueChoice
  lib/
    db.ts         # init admin + export db (opcional; evita ciclo)
    helpers.ts    # loadPlayers, loadSecrets, startNightSequence, maybeFinalizeNight,
                  #   nightRolesInPlay, randomCode, randomId, re-exports usados pelos handlers
    finalize.ts   # finalizeNight, finalizeDay — resolução amanhecer / fim de dia
    bots.ts       # processBotNightActions
  index.ts        # re-exports onCall de handlers/
```

**Critérios de corte de handlers:**
- Cada handler valida `requireAuth` + parâmetros e delega para `lib/`
- `lib/finalize.ts` e `lib/bots.ts` não usam `HttpsError` — apenas Firestore + engine
- `bots.ts` pode ser testado com mocks de players/secrets

---

## Ordem de execução sugerida (rebalanceada para latência)

Prioridade **backend primeiro**: gargalos de latência estão em `finalizeNight` / `processBotNightActions` / leituras duplicadas; modularizar antes facilita PRs pequenos de I/O.

1. **Backend:** extrair `lib/bots.ts` e `lib/finalize.ts`; criar `handlers/` por domínio; manter `index.ts` só como re-export.
2. **Backend (latência):** uma passada em `Promise.all` de reads seguros, remover chamada duplicada a `maybeFinalizeNight`, agrupar escritas pós-amanhecer onde couber.
3. **Frontend:** extrair `types.ts` → `lib/roleStories.ts` → hooks Firestore → screens (Lobby → Night → Day → End) → `App.tsx` enxuto.
4. **Opcional (custo):** `minInstances` nas functions mais chamadas — documentar no deploy, não altera região.

---

## Trade-offs

| Pró | Contra |
|---|---|
| Cada arquivo tem responsabilidade única | Migração = várias sessões; risco de regressão se feito com pressa |
| Hooks isolados facilitam testes unitários | Aumenta número de arquivos importados |
| Backend fatiado permite otimizar Firestore sem tocar na UI | Exige disciplina de imports (evitar ciclos) |

**Recomendação:** PRs pequenos por etapa (bots → finalize → handlers → latência → types → hooks → screens), evitando um PR monolítico.
