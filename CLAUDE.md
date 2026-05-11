# CLAUDE.md — Folhetim de Bucaré

Sistema de party game remoto baseado em turnos. Jogadores acessam via browser no celular. Cada jogador tem tela individual e privada. O sistema processa todas as ações — o porta-voz apenas lê os textos em voz alta.

---

## Stack

- **Frontend:** React + TypeScript + Vite — hospedado no Firebase Hosting (`apps/web`)
- **Backend:** Firebase Cloud Functions v2 (Admin SDK, TypeScript → esbuild → `lib/index.js`) + Firestore (`functions/`)
- **Engine:** pacote `folclore-game-engine` (local, `node_modules/`) — lógica de resolução de amanhecer, condições de vitória, ordem noturna
- **Acesso:** web app no browser, responsivo para mobile
- **Sincronização:** baseada em turnos — o sistema avança quando todos os jogadores ativos da fase concluíram suas ações
- **Bots:** jogadores artificiais (`isBot: true`) que agem automaticamente na noite e votam no dia

---

## Estrutura de dados

### Sala (`rooms/{roomCode}`)

```
{
  code: string,                  // código de 4 caracteres
  status: 'lobby' | 'night' | 'day' | 'ended',
  phase: string,                 // espelha status (usado pelo frontend)
  round: number,                 // rodada atual (começa em 1)
  maxRounds: number,             // lua cheia — definido pela composição
  hostUid: string,               // Firebase Auth uid do anfitrião
  spokespersonId: string,        // playerId do porta-voz
  expectedPlayerCount: number,   // vagas planejadas (lobby)
  nightPhaseIndex: number,       // índice na fila de papéis ativos da noite (0-based)
  currentActorRole: string | null, // papel cuja ação está pendente, ou null
  nightOrderRoles: RoleId[],     // ordem completa de papéis da noite (calculada no início)
  nightPendingRoles: RoleId[],   // papéis ainda não resolvidos nessa noite
  nightReadyPlayerIds: string[], // IDs de jogadores que já concluíram sua vez na noite (incluindo sem-ação que clicaram "Toque da alvorada")
  votingOpen: boolean,           // true durante todo o dia; false após finalizeDay()
  votesRound: number,            // rodada cujos votos estão sendo coletados
  saciActedThisNight: boolean,   // Saci agiu nessa noite (para dobrar votos em Brás Cubas)
  saciActedLastNight: boolean,   // Saci agiu na noite anterior (aplicado ao dia atual)
  geniInvestigatedTargets: string[], // IDs investigados pela Geni nessa noite (acumulados)
  pendingBrasChoice: boolean,    // Brás Cubas foi expulso e precisa escolher
  pendingNightStart: boolean,    // expulsão processada, aguardando anfitrião iniciar a noite
  pendingNightRound: number,     // próxima rodada a iniciar quando pendingNightStart for resolvido
  individualWins: [              // vitórias individuais registradas; não encerram a partida
    {
      playerId: string,
      role: string,
      type: string,
      round: number,
      timestamp: timestamp
    }
  ],
  winner: null | 'moradores' | 'criaturas' | 'bots' | playerId,
  createdAt: timestamp
}
```

Em implementações Firestore, preferir **subcoleções** para `publicLog` / `privateLog` / mensagens de chat em partidas longas (evitar limite de tamanho de array). O jogador inclui `uid` (Auth) para Security Rules amarrarem writes ao próprio participante.

### Jogador (`rooms/{roomCode}/players/{playerId}`)

```
{
  id: string,
  uid: string,                   // Firebase Auth uid (regras de acesso)
  name: string,
  role: string,                  // personagem sorteado
  side: 'criatura' | 'neutro' | 'morador',
  alive: boolean,
  eliminated: boolean,           // eliminado à noite
  expelled: boolean,             // expulso por votação
  isSpokesperson: boolean,
  actionUsed: boolean,           // poder especial de uso único já usado
  wolfBiteUsed: boolean,         // Lobisomem já usou morder nesta partida
  mulaExorcizeUsed: boolean,     // Mula já usou Exorcismo da Vingança
  geniCharmUsed: boolean,        // Geni já usou Charme de Verdade
  blockedNextNight: boolean,     // habilidade bloqueada pelo Saci
  silenced: boolean,             // aterrorizado pela Mula (silêncio no dia)
  silencedRounds: number,        // rodadas restantes de silêncio
  enchanted: boolean,            // enfeitiçado pelo Boto (não vota contra criaturas)
  seduced: boolean,              // seduzida pela Iara (perde o voto)
  jailed: boolean,               // preso pelo Delegado (sem voto)
  protected: boolean,            // protegido pelo Curupira ou Doutor nessa noite
  catechized: boolean,           // catequizado pelo Padre (imune a Iara e Mula por 1 rodada)
  invoked: boolean,              // invocado pela Mãe de Santo (retornou por 1 rodada)
  alignment: null | 'moradores' | 'criaturas',  // só para neutros
  secretInfo: {},                // informações privadas do personagem (inimigos secretos, investigações)
  individualObjectiveMet: boolean,
  votes: number                  // votos recebidos na fase do dia atual
}
```

### Ações da noite (`rooms/{roomCode}/nightActions/{round}`)

```
{
  [playerId]: {
    role: string,
    action: string,              // 'eliminate' | 'bite' | 'steal' | 'terrorize' | 'enchant' | 'seduce' | 'eliminate_special' | 'protect' | 'save' | 'investigate' | 'jail' | 'invoke' | 'converse' | 'query' | 'catechize'
    targetId: string | null,
    specialAction: string | null, // ações secundárias (ex: alinhamento do neutro)
    submitted: boolean,
    timestamp: timestamp
  }
}
```

### Votos do dia (`rooms/{roomCode}/votes/{round}`)

```
{
  [voterId]: targetId | null
}
```

### Log público (`rooms/{roomCode}/publicLog`)

```
[
  {
    round: number,
    type: 'death' | 'bite' | 'terror' | 'expulsion' | 'invocation' | 'dawn' | 'special',
    message: string,             // texto que o porta-voz lê
    timestamp: timestamp
  }
]
```

### Log privado (`rooms/{roomCode}/privateLog/{playerId}`)

```
[
  {
    round: number,
    message: string,             // informação exclusiva desse jogador
    timestamp: timestamp
  }
]
```

---

## Fluxo geral da partida

```
1. Anfitrião cria sala → gera código de 4 caracteres
2. Jogadores entram com o código e escolhem nome
3. Anfitrião inicia o jogo → sistema sorteia personagens e porta-voz
4. Loop de rodadas:
   a. Fase da noite — sistema chama personagens em ordem (nightPendingRoles)
      - Cada jogador vê descrição da ação do seu personagem enquanto espera/age
      - Jogadores sem ação noturna veem botão "Toque da alvorada" para confirmar que estão prontos (`markNightReady`)
      - A noite só avança quando `nightPendingRoles` está vazio E todos os vivos estão em `nightReadyPlayerIds`
      - Bots agem automaticamente via processBotNightActions()
   b. Amanhecer — sistema resolve ações via resolveDawn() e publica log público
      - Panorama visível a todos: mortes, aterrorizações, invocações, etc.
   c. Fase do dia — discussão + votação (sempre aberta)
      - Bots votam automaticamente no início do dia (alvos aleatórios entre todos os vivos quando há humanos; nulo quando só bots restam)
      - Dia encerra quando todos os elegíveis votaram → finalizeDay()
      - Se nenhum humano restar ao amanhecer: finalizeDay() é chamado automaticamente sem botão
   d. Dia encerra → `pendingNightStart: true` **sempre** (com ou sem expulsão, incluindo empate) → anfitrião vê botão "Toque de recolher"
   e. Anfitrião clica → startNight() → noite seguinte começa
   f. Verificação de condições de vitória → checkCollectiveWin()
5. Fim de jogo — sistema anuncia vencedor
   - Anfitrião pode reiniciar: botão "Recomeçar" reseta subcoleções e estado dos jogadores
```

---

## Lobby

- Anfitrião cria sala e recebe código de 4-6 caracteres
- Jogadores entram digitando o código e um nome de exibição
- Anfitrião vê lista de jogadores conectados em tempo real
- Anfitrião define número de jogadores esperados antes de iniciar
- Sistema valida mínimo de 5 jogadores para iniciar
- Ao iniciar: sistema sorteia personagens respeitando o pool correto para o número de jogadores e as regras de dependência entre pares

### Regras de sorteio

**Pools por número de jogadores:**

| Jogadores | Criaturas | Neutros | Moradores especiais | Aldeões | Brás Cubas |
|---|---|---|---|---|---|
| 5 | 1 | 1 | Delegado, Doutor | 1 | Não entra |
| 7 | 2 | 1 | Delegado, Doutor, Cartomante | 1 | Entra sempre |
| 9–11 | 3 | 2 | Delegado, Doutor, Cartomante, Coronel | 1–3 | Entra sempre |
| 12+ | 5 | 2 | Todos os especiais | 1+ | Entra sempre |

**Pares de dependência obrigatória — se um for sorteado, o outro entra:**
- Mula sem Cabeça ↔ Padre
- Coronel ↔ Boitatá
- Geni ↔ Boto Cor-de-Rosa
- Cangaceiro ↔ Iara

**Se não houver Aldeão disponível para ceder o slot ao par dependente:** resorteie as criaturas.

### Sorteio do porta-voz

Após distribuir os personagens, o sistema sorteia um jogador para ser porta-voz. O porta-voz é um jogador normal — tem personagem, age à noite, vota no dia, vence ou perde com seu lado. Sua única função extra é ler os textos em voz alta para o grupo.

### Notificações iniciais — primeira noite

Após o sorteio, o sistema envia notificações privadas:
- Mula sem Cabeça → *"O Padre está nessa partida. Só você sabe disso."*
- Geni → *"O Boto Cor-de-Rosa está nessa partida. Só você sabe disso."*
- Cangaceiro → *"A Iara está nessa partida. Só você sabe disso."*

---

## Fase da noite

### Ordem de ação

| Ordem | Fase | Personagem | Ação |
|---|---|---|---|
| 1 | Atacantes | Lobisomem | Elimina ou morde |
| 2 | Atacantes | Saci Pererê | Rouba habilidade |
| 3 | Atacantes | Mula sem Cabeça | Aterroriza |
| 4 | Atacantes | Boto Cor-de-Rosa | Enfeitiça |
| 5 | Atacantes | Iara | Seduz ou elimina (especial) |
| 6 | Protetores | Curupira | Protege + alinhamento (1ª noite) |
| 7 | Protetores | Doutor | Salva |
| 8 | Protetores | Mãe de Santo | Invoca jogador eliminado |
| 9 | Protetores | Padre | Catequiza — imuniza alvo à Iara e Mula |
| 10 | Geni | Geni | Conversa / obtém identidade / Charme de Verdade |
| 11 | Informantes | Boitatá | Investiga + alinhamento (1ª noite) |
| 12 | Informantes | Cartomante | Investiga |
| 13 | Informantes | Delegado | Prende com justificativa pública |
| 14 | Informantes | Cangaceiro | Consulta prévia ao Tiro Certo |

### Comportamento do sistema por personagem

O sistema notifica cada jogador quando é sua vez. O jogador vê apenas as opções disponíveis para seu personagem. Após agir, volta para tela de espera. O sistema avança para o próximo personagem da ordem.

Se um personagem não está na partida ou está morto/expulso, o sistema pula automaticamente.

---

**Lobisomem**
- Opções: selecionar alvo + ação (eliminar ou morder)
- Morder: uso único por jogo — sistema bloqueia a opção após uso (`wolfBiteUsed: true`)
- Sistema verifica proteção (Curupira/Doutor/Geni Charme) na resolução do amanhecer
- Se alvo for Brás Cubas ou Mãe de Santo: sistema registra falha silenciosamente
- Se alvo for Cangaceiro: sistema registra falha silenciosamente (ele escapou)
- **Objetivo individual:** sobreviver até o início da rodada 4 sem ser expulso. Sistema verifica em `startNightSequence` ao iniciar a noite 4: se o Lobisomem estiver vivo e não expulso, registra `individualObjectiveMet: true`.

**Saci Pererê**
- Opções: selecionar alvo para roubo de habilidade
- Sistema marca `blockedNextNight: true` no alvo
- Gorro Vermelho: se o Saci for alvo de expulsão no dia **ou for preso pelo Delegado**, sistema oferece opção de ativar — ele troca de lugar (identidade secreta) com jogador à sua escolha. Uso único.
- **Aliança involuntária com Brás Cubas:** se o Saci agiu nessa noite e Brás Cubas receber ao menos um voto no dia seguinte, esse voto conta como dois. Sistema aplica silenciosamente.

**Mula sem Cabeça**
- Opções: selecionar alvo para aterrorizar **ou** usar Exorcismo da Vingança
- Aterrorizar: sistema marca `silenced: true` no alvo — chat desabilitado durante toda a fase do dia
- Exorcismo da Vingança: uso único — elimina o alvo permanentemente. Sistema marca `mulaExorcizeUsed: true`. Se alvo for o Padre, registra vitória individual da Mula.
- Todas as ações da Mula falham silenciosamente se o alvo estiver protegido (Curupira/Doutor/Geni Charme)
- Sistema é imune ao Lobisomem — se Lobisomem selecionar a Mula, sistema registra falha
- **Objetivo:** Padre sair da partida — eliminado pelo Exorcismo da Vingança da Mula **ou** expulso por votação do grupo. Sistema verifica após cada amanhecer e após cada expulsão.

**Boto Cor-de-Rosa**
- Opções: selecionar alvo para enfeitiçar
- Sistema marca `enchanted: true` no alvo — ele não pode votar contra criaturas no próximo dia
- Ação falha silenciosamente se alvo estiver protegido (Curupira/Doutor/Geni Charme)
- Chapéu: se alguém solicitar verificação do Boto no dia, sistema confirma apenas "usa chapéu" — não revela se é criatura
- **Objetivo:** enfeitiçar todos os jogadores de alinhamento morador ao menos uma vez ao longo do jogo. Sistema acumula `botoEnchantedMoradores: string[]` na sala. Quando todos os moradores ativos estão na lista, registra `individualObjectiveMet: true` no Boto.

**Iara**
- Opções: selecionar alvo + ação (seduzir ou usar Voz Encantadora)
- Sedução: marca `seduced: true` no alvo — perde o voto
- Voz Encantadora: elimina o alvo permanentemente. Uso único. Após uso, poder de sedução bloqueado por 2 noites
- Todas as ações da Iara falham silenciosamente se o alvo estiver protegido (Curupira/Doutor/Geni Charme) ou catequizado pelo Padre
- **Objetivo:** se alvo da Voz Encantadora for o Delegado, sistema registra vitória individual da Iara

**Curupira**
- Primeira noite: sistema solicita alinhamento (moradores ou criaturas) antes da ação
- Opções: selecionar alvo para proteger
- Sistema marca `protected: true` no alvo — bloqueia **qualquer** ação noturna de criatura (Lobisomem, Saci, Mula, Boto, Iara) e impede ações do Padre sobre o alvo
- Pés ao Contrário: se a Cartomante investigar o Curupira, sistema inverte a resposta automaticamente
- **Objetivo:** sistema contabiliza proteções do lado escolhido

**Doutor**
- Opções: selecionar alvo para salvar (não pode repetir o mesmo alvo da noite anterior)
- Sistema marca `protected: true` no alvo
- Se alvo salvo for o mesmo que o Lobisomem mordeu: licantropia revertida, sistema não anuncia

**Mãe de Santo**
- Opções: selecionar jogador eliminado para invocar (qualquer lado)
- Se não houver eliminados: sistema informa e pula a ação
- Jogador invocado retorna com `invoked: true` por uma rodada — fala e vota normalmente
- Ao fim do dia: `invoked` volta para false, jogador retorna ao silêncio
- Sistema é imune ao Lobisomem — se Lobisomem selecionar a Mãe de Santo, sistema registra falha e informa ao Lobisomem que o alvo não pôde ser tocado

**Geni**
- Opções: selecionar alvo para **conversar** (investigar) **ou** usar Charme de Verdade (proteger)
- Conversar: sistema responde apenas a ela — morador ou criatura. Acumula alvo em `geniInvestigatedTargets`
- Charme de Verdade: uso único — protege o alvo de qualquer ação noturna de criatura nessa noite (adiciona ao conjunto de alvos protegidos, igual a Curupira/Doutor). Sistema marca `geniCharmUsed: true` no jogador. Alvo não sabe que foi protegido.
- Se alvo da conversa for o Cangaceiro (Romance da Caatinga): sistema revela ao Cangaceiro a identidade completa de todos os jogadores que a Geni já investigou até essa rodada
- Inimigo secreto: sistema notifica na primeira noite sobre o Boto

**Boitatá**
- Primeira noite: sistema solicita alinhamento antes da ação
- Opções: selecionar alvo para investigar
- Sistema responde apenas a ele: morador ou criatura
- Nunca pode ser eliminado pelo Lobisomem — sistema registra falha silenciosamente
- **Objetivo:** sistema contabiliza identificações corretas do lado escolhido

**Cartomante**
- Opções: selecionar alvo para investigar
- Sistema responde apenas a ela: morador ou criatura
- Se alvo for o Curupira: sistema inverte a resposta automaticamente
- **Objetivo:** sistema contabiliza identificações corretas comunicadas ao grupo no dia

**Delegado**
- Opções: selecionar alvo + escrever motivo da prisão (texto obrigatório)
- Sistema marca `jailed: true` no alvo — sem voto no próximo dia
- Motivo é publicado no log público do amanhecer (porta-voz lê em voz alta)
- Delegado não descobre se o alvo é morador ou criatura
- Pode prender toda noite (sem limite de usos)

**Padre**
- Opções: selecionar alvo para catequizar
- Sistema marca `catechized: true` no alvo por uma rodada — imune à sedução da Iara e ao terror da Mula nessa noite
- Ação da Mula falha se alvo estiver catequizado pelo Padre nessa mesma noite (resolvido antes dos atacantes no engine)
- Acumula alvo em `padreCatechizedMoradores: string[]` na sala (apenas moradores; criaturas não são acumuladas)
- **Objetivo:** catequizar todos os moradores vivos ao menos uma vez ao longo do jogo. Quando todos os moradores ativos aparecem em `padreCatechizedMoradores`, sistema registra `individualObjectiveMet: true` no Padre.

**Cangaceiro**
- Opções: consultar alvo ou passar
- Consulta — sistema verifica:
  - Se a Geni **já investigou** o alvo: sistema revela ao Cangaceiro se é criatura ou morador
  - Se a Geni **não investigou** o alvo: sistema marca `blockedNextNight: true` na Geni
- Tiro Certo é ação do dia — não aparece aqui
- Inimigo secreto: sistema notifica na primeira noite sobre a Iara

---

## Resolução do amanhecer

Após todos agirem, o sistema resolve na seguinte ordem antes de publicar qualquer anúncio:

1. **Computar alvos protegidos:** Curupira + Doutor + Geni Charme de Verdade → conjunto `protectedTargets`
2. **Padre:** catequizar alvo — marcar `catechized: true`; acumular em `padreCatechizedMoradores` (moradores apenas)
3. **Saci:** marcar `blockedNextNight` no alvo (falha silenciosa se alvo protegido)
4. **Mula:** marcar `silenced` no alvo (falha silenciosa se alvo protegido ou catequizado); ou Exorcismo da Vingança — eliminar alvo (falha silenciosa se protegido)
   - Se Exorcismo no Padre → registrar vitória individual da Mula
5. **Boto:** marcar `enchanted` no alvo (falha silenciosa se alvo protegido)
6. **Iara:** processar sedução ou Voz Encantadora (falha silenciosa se alvo protegido ou catequizado)
   - Se Voz Encantadora no Delegado → registrar vitória individual da Iara
7. **Lobisomem:** verificar proteção do alvo
   - Alvo protegido (`protectedTargets`) → ataque falhou, não anunciar nada
   - Alvo não protegido + ação eliminar → morte confirmada
   - Alvo não protegido + ação morder → registrar mordida em segredo
   - Alvo mordido + Doutor salvou → licantropia revertida, não anunciar
   - Alvo é Brás Cubas, Mãe de Santo, Cangaceiro ou Boitatá → falha silenciosa
8. **Mãe de Santo:** ativar `invoked` no jogador escolhido
9. **Boitatá/Cartomante/Cangaceiro:** registrar resultados nos logs privados; **Delegado:** publicar prisão + motivo no log público
   - Se Delegado prendeu o Saci → sistema seta `pendingSaciGorro: true`
10. **Verificar objetivos individuais:**
    - Mula usou Exorcismo no Padre → registrar vitória individual da Mula
    - Iara usou Voz Encantadora no Delegado → registrar vitória individual da Iara
    - Boto enfeitiçou todos os moradores → registrar vitória individual do Boto
    - Padre catequizou todos os moradores vivos → registrar vitória individual do Padre
11. **Verificar condições de vitória coletiva**

### Anúncios públicos do amanhecer

Sistema publica no log público apenas efeitos visíveis. Porta-voz lê em voz alta.

| Situação | Texto |
|---|---|
| Morte | *"A cidade acorda com uma ausência. [Nome] foi encontrado(a) sem vida."* + revelar identidade |
| Mordida sem morte | *"Há marcas estranhas na cidade. Alguém foi tocado pelo folclore essa noite — mas ainda respira."* |
| Aterrorizado | *"[Nome] acorda em pânico. Ficará em silêncio pelos próximos dois minutos."* |
| Nenhum efeito visível | *"A noite passou em silêncio. Mas o silêncio, aqui, nunca é inocente."* |
| Invocado | *"Uma presença retorna por mais um dia. [Nome] tem algo a dizer."* |

---

## Fase do dia

### Abertura

Sistema publica texto de abertura no log público. Porta-voz lê.

> *"A cidade está acordada. Conversem, investiguem, desconfiem. Ao fim, votarão para expulsar alguém."*

Sistema aplica efeitos ativos:
- `silenced: true` → jogador vê aviso de silêncio na tela, não pode enviar mensagens por 2 minutos
- `seduced: true` → jogador não tem opção de voto
- `enchanted: true` → jogador pode votar, mas sistema bloqueia voto contra criaturas
- `jailed: true` → jogador não tem opção de voto
- `invoked: true` → jogador pode falar e votar normalmente

### Chat

Sistema de chat por sala disponível durante a fase do dia. Jogadores silenciados não podem enviar mensagens pelo período definido.

### Coronel — acusação formal

O Coronel tem botão de "Acusação Formal" disponível durante o dia. Ao acionar:
- Sistema solicita alvo
- Votação imediata e exclusiva sobre aquele alvo — sim ou não
- Maioria simples decide
- Se alvo for o Boitatá: sistema registra objetivo individual cumprido
- Se alvo não for o Boitatá: Coronel perde o poder e identidade é revelada ao grupo

### Votação de expulsão

A votação fica **sempre aberta** durante toda a fase do dia — não há botão de abrir/encerrar. O dia encerra automaticamente quando todos os jogadores elegíveis votaram.

- Cada jogador seleciona um alvo (ou voto nulo)
- Jogadores sem direito a voto (`seduced`, `jailed`, mortos/expulsos) não veem a interface de votação
- Jogadores `enchanted` não podem selecionar criaturas como alvo
- **Aliança involuntária Saci/Brás Cubas:** se o Saci agiu nessa noite, qualquer voto em Brás Cubas conta como dois — sistema aplica silenciosamente
- Quando todos os elegíveis votaram: sistema chama `finalizeDay()` automaticamente
- `finalizeDay()` tem guarda de idempotência: `if (status !== "day" || votingOpen === false) return`
- Maioria simples define o expulso
- Empate: sem expulsão nessa rodada → Folhetim exibe *"A votação terminou em empate. Ninguém foi expulso."* → sistema pausa com `pendingNightStart: true`

### Expulsão

Sistema registra a expulsão e exibe no Folhetim. Anfitrião vê botão "Toque de recolher" para iniciar a noite após a leitura.

| Situação | Texto no Folhetim |
|---|---|
| Qualquer jogador | *"A cidade votou pela expulsão de: [Nome]."* |
| Brás Cubas | *"Espera. [Nome] sorri. Era o Tolo — e ser expulso era exatamente o que queria."* |

Se Brás Cubas for expulso: sistema oferece escolha a ele — encerrar o jogo com sua vitória ou continuar como **qualquer personagem disponível no jogo** por mais uma rodada (o jogador seleciona o personagem desejado via UI; sistema troca o segredo na subcoleção `secrets`).

### Cangaceiro — Tiro Certo

O Cangaceiro tem botão de "Tiro Certo" disponível durante o dia. Ao acionar:
- Sistema solicita alvo
- Sistema verifica se a Geni investigou esse jogador
  - Se sim: sistema confirma em segredo ao Cangaceiro se é criatura ou morador antes de confirmar o disparo
  - Se não: sistema dispara sem confirmação prévia
- Jogador confirma o disparo
- Se acertar (alvo é criatura): eliminação imediata sem votação
  - Se alvo for a Iara: sistema registra vitória individual do Cangaceiro
- Se errar (alvo é morador ou neutro): jogador inocente é eliminado, identidade do Cangaceiro revelada ao grupo

---

## Verificação de condições de vitória

Sistema verifica após cada amanhecer e após cada expulsão:

| Condição | Vencedor |
|---|---|
| Todas as criaturas expulsas ou eliminadas | Moradores |
| Criaturas vivas ≥ moradores vivos | Criaturas |
| Todas as criaturas cumpriram objetivos individuais | Criaturas |
| Rodada atual > maxRounds (lua cheia) | Criaturas |
| Brás Cubas expulso por votação (e opta por encerrar) | Brás Cubas |
| Padre sai da partida (Exorcismo da Mula **ou** expulsão por voto) | Mula vence individualmente — jogo continua |
| Iara elimina o Delegado com Voz Encantadora | Iara vence individualmente — jogo continua |
| Cangaceiro usa Tiro Certo na Iara | Cangaceiro vence individualmente — jogo continua |
| Lobisomem chega vivo e não expulso ao início da rodada 4 | Lobisomem vence individualmente — jogo continua |
| Padre catequiza todos os moradores vivos ao menos uma vez | Padre vence individualmente — jogo continua |
| Boto enfeitiça todos os moradores ao menos uma vez | Boto vence individualmente — jogo continua |
| Todos os jogadores humanos eliminados/expulsos, só bots restam | Apocalipse Robô (`winner: "bots"`) |

**Vitórias individuais não encerram o jogo** — apenas registram a conquista do personagem. O jogo segue até uma condição coletiva ser atingida.

**Moradores com objetivo individual não cumprido** vencem com o grupo se os moradores vencerem — objetivo é bônus, nunca penalidade.

**Neutros** vencem apenas se seu lado vencer e eles ainda estiverem no jogo. Objetivo individual não basta sozinho.

### Textos de encerramento

| Situação | Texto |
|---|---|
| Moradores vencem | *"A cidade respirou. O folclore recuou para as sombras. Os moradores venceram."* |
| Criaturas em maioria | *"Não há mais como resistir. O folclore tomou a cidade. As criaturas venceram."* |
| Todas criaturas cumprem objetivos | *"O folclore não precisava de força — precisava de paciência. As criaturas venceram."* |
| Lua cheia | *"A lua cheia chegou. O folclore está completo. A cidade pertence às criaturas."* |
| Brás Cubas expulso | *"Espera. [Nome] sorri. Era o Tolo — e ser expulso era exatamente o que queria."* |
| Mula — Padre sai da partida | *"A maldição foi cumprida. A Mula sem Cabeça encontrou o Padre. Ela vence."* |
| Iara elimina Delegado | *"O Delegado foi arrastado para as profundezas. Iara vence."* |
| Cangaceiro elimina Iara | *"O acerto de contas foi feito. O Cangaceiro vence."* |
| Lobisomem sobrevive à rodada 4 | *"Quatro luas. O lobisomem ainda respira. A maldição está completa."* |
| Padre catequiza todos moradores | *"A fé, mesmo falsa, foi suficiente. O Padre cumpriu sua missão."* |
| Boto enfeitiça todos moradores | *"Não sobrou nenhum coração intacto. O Boto venceu."* |
| Apocalipse Robô | *"Apocalipse Robô"* (tela de fim de jogo com `winner: "bots"`) |

---

## Lua cheia — número máximo de rodadas

| Jogadores | Rodadas máximas |
|---|---|
| 5 | 4 |
| 7 | 5 |
| 9–11 | 6 |
| 12+ | 7 |

---

## Regras de consistência do sistema

- O sistema nunca revela informações privadas de um jogador para outro, exceto quando explicitamente definido por uma mecânica
- O sistema nunca confirma ou nega quais personagens estão na partida — só revela identidades quando um jogador é eliminado ou expulso
- O porta-voz lê os textos públicos — o sistema nunca age por ele
- Ações de uso único são bloqueadas pelo sistema após o primeiro uso — o jogador não vê mais a opção
- Jogadores eliminados à noite ou expulsos por votação têm `alive: false` — não agem, não votam, não aparecem como alvos disponíveis (exceto para a Mãe de Santo)
- Jogadores invocados pela Mãe de Santo são exceção temporária — `invoked: true` reativa participação por uma rodada

---

## Arquitetura de implementação

### Cloud Functions (`functions/src/`)

| Arquivo | Responsabilidade |
|---|---|
| `index.ts` | Exports de todas as `onCall` functions |
| `helpers.ts` | Lógica compartilhada: `loadPlayers`, `loadSecrets`, `startNightSequence`, `maybeFinalizeNight`, `finalizeNight`, `finalizeDay`, `processBotNightActions` |

**Funções principais:**

- `startGame` — sorteia personagens, porta-voz, inicia noite 1; executa bots se presentes
- `submitNightAction` — registra ação noturna; avança `nightPendingRoles`; adiciona jogador a `nightReadyPlayerIds`; chama `maybeFinalizeNight`
- `markNightReady` — jogadores sem ação noturna confirmam que estão prontos; adiciona a `nightReadyPlayerIds`; chama `maybeFinalizeNight`
- `maybeFinalizeNight` — verifica se `nightPendingRoles` está vazio **e** todos os vivos estão em `nightReadyPlayerIds`; se sim, chama `finalizeNight`
- `submitVote` — registra voto; se todos elegíveis votaram → chama `finalizeDay`
- `finalizeNight` — resolve `resolveDawn()`, aplica resultados, muda `status` para `"day"`, vota bots automaticamente; se só restam bots, chama `finalizeDay()` automaticamente
- `finalizeDay` — tally de votos, processa expulsão; se nenhum humano vivo → encerra como Apocalipse Robô; **sempre** seta `pendingNightStart: true` ao fim (com expulsão, empate ou sem expulsão); se expulsão → verifica vitória coletiva antes de pausar
- `startNight` — (host only) lê `pendingNightRound`, limpa `pendingNightStart`, chama `startNightSequence`
- `restartGame` — (host only, status `"ended"`) deleta subcoleções via `db.recursiveDelete()`, reseta jogadores e sala para lobby
- `processBotNightActions` — bots escolhem alvos aleatórios e submetem ações noturnas
- `findPlayer(players, req)` — helper em `index.ts`: busca jogador por `playerId` (localStorage, estável) antes de fallback para `uid` (pode mudar em re-auth anônima)

### UX do frontend (`apps/web/src/App.tsx`)

**Fase da noite:**
- Jogador vê descrição textual do que seu personagem está fazendo enquanto age (ex: *"O Lobisomem está à espreita…"*)
- Após confirmar ação, volta à tela de espera
- Jogadores sem ação noturna (aldeão, coronel, brás_cubas) veem botão **"Toque da alvorada"** — clicam para confirmar que estão prontos (`markNightReady`)
- O amanhecer só é processado quando todos os pendentes agiram **e** todos os vivos confirmaram (`nightReadyPlayerIds`)

**Transição noite → dia:**
- Panorama visível a todos: lista de eventos da noite atual (`type: death | bite | terror | invocation | dawn | special` com `round === currentRound`)

**Fase do dia:**
- Campo de voto sempre exibido para jogadores elegíveis (alive, não seduced, não jailed)
- Jogadores inelegíveis veem mensagem de aviso
- Não há botões de "abrir" ou "encerrar" votação — o processo é automático
- Folhetim exibe eventos da noite + expulsão do dia corrente (seção dedicada, tipo `"expulsion"`)
- Após expulsão sem vitória: anfitrião vê botão **"Toque de recolher"** → chama `startNight`

**Fim de jogo:**
- Anfitrião vê botão "Recomeçar" → chama `restartGame` → sala volta ao lobby com os mesmos jogadores
- `winner: "bots"` → tela exibe "Apocalipse Robô"


# To Do

## Pendente

- **Componente colapsável com a história do Personagem:** Em todas as telas o player pode ver a história do seu personagem para lembrar seu papel no role play. Isso pode ficar num componente colapsável no topo da tela pra não ocupar espaço o tempo todo. na primeira noite, ele aparece aberto.

- **Crônica da partida:** pode ficar grande, aumentar a altura para caber mais texto. Pode ter a mesma fonte do folhetim no título e textos.

- **Refatoração dos arquivos grandes:** Projeto não tem arquitetura. Propor modelo escalável para refatoração. Não executar imediatamente.



## Concluído

- ✓ Botões de ação do dia filtrados por `myRole` — cada jogador só vê as ações do seu personagem (`dayActions.ts`)
- ✓ Duplicação de log removida do porta-voz — panorama unificado visível a todos
- ✓ Chat bloqueado para mortos e expulsos — backend rejeita, frontend esconde input; invocados são exceção
- ✓ Anúncio de voto no chat — `submitVote` grava `{ type: "vote", text: "Fulano votou." }` no chat; exibido em estilo muted no frontend
- ✓ Regra de retorno — backend bloqueia invocação de jogadores `expelled`; frontend filtra pool para `eliminated && !expelled`; bot idem
- ✓ Fase do dia — parecer da noite — exibe sempre o bloco; mostra "ninguém foi eliminado" se sem mortes; lista quem está fora do jogo
- ✓ Feedback dos botões — ações noturnas e do dia têm estado de carregamento e confirmação (✓ Ação registrada); botão fica inativo após envio
- ✓ Chat — altura e design — `.chat-card` com `min-height: 160px / max-height: 320px`; mensagens de voto em estilo muted menor
- ✓ Bots interativos no chat — ao início do dia, um bot aleatório envia frase temática do banco de frases (`BOT_PHRASES` em `finalizeNight`)
- ✓ Toque de recolher — após votação (com expulsão, empate ou sem expulsão), jogo **sempre** pausa em `status: "day"` com `pendingNightStart: true`; anfitrião clica "Toque de recolher" → `startNight` → noite começa; expulsão ou mensagem de empate exibida no Folhetim durante a pausa
- ✓ Toque da alvorada — jogadores sem ação noturna confirmam prontidão via botão "Toque da alvorada" (`markNightReady`); amanhecer só processa quando todos os vivos estão em `nightReadyPlayerIds`
- ✓ Mensagem de empate no Folhetim — quando votação termina em empate, Folhetim exibe *"A votação terminou em empate. Ninguém foi expulso."* (type: expulsion)
- ✓ Apocalipse Robô — quando todos os humanos saem e só bots restam, `finalizeDay()` detecta e encerra com `winner: "bots"`; bots votam nulo neste cenário (votam em qualquer vivo quando há humanos)
- ✓ findPlayer — lookup por `playerId` (localStorage) antes de uid, evitando quebra quando Firebase renova uid de auth anônima
- ✓ Flags de status por rodada — `dawnResolver` reseta `seduced`, `jailed`, `enchanted`, `blockedNextNight`, `invoked`, `silenced`, `silencedRounds` a cada amanhecer (antes eram acumulados permanentemente)