# CLAUDE.md — Folclore Oculto (nome TBD)

Sistema de party game remoto baseado em turnos. Jogadores acessam via browser no celular. Cada jogador tem tela individual e privada. O sistema processa todas as ações — o porta-voz apenas lê os textos em voz alta.

---

## Stack

- **Frontend:** a decidir (componentes descritos de forma agnóstica)
- **Backend:** Firebase — Realtime Database ou Firestore
- **Acesso:** web app no browser, responsivo para mobile
- **Sincronização:** baseada em turnos — o sistema avança quando todos os jogadores ativos da fase concluíram suas ações

---

## Estrutura de dados

### Sala (`rooms/{roomCode}`)

```
{
  code: string,                  // código de 4-6 caracteres
  status: 'lobby' | 'night' | 'dawn' | 'day' | 'ended',
  round: number,                 // rodada atual (começa em 1)
  phase: string,                 // fase noturna atual (ex: 'lobisomem', 'saci', 'geni'...)
  maxRounds: number,             // lua cheia — definido pela composição
  spokespersonId: string,        // playerId do porta-voz (único leitor-aloud; mesmo jogador tem personagem)
  nightPhaseIndex: number,       // índice na fila de papéis ativos da noite (0-based; motor avança)
  currentActorRole: string | null, // papel cuja ação está pendente, ou null entre etapas / fora da noite
  individualWins: [              // vitórias individuais registradas; não encerram a partida
    {
      playerId: string,
      role: string,              // personagem que conquistou
      type: string,              // ex: 'mula_padre' | 'iara_delegado' | 'cangaceiro_iara' | ...
      round: number,
      timestamp: timestamp
    }
  ],
  winner: null | 'moradores' | 'criaturas' | playerId,
  hostUid: string,               // Firebase Auth uid do anfitrião
  expectedPlayerCount: number,   // vagas planejadas (lobby)
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
1. Anfitrião cria sala → gera código
2. Jogadores entram com o código e escolhem nome
3. Anfitrião inicia o jogo → sistema sorteia personagens e porta-voz
4. Loop de rodadas:
   a. Fase da noite — sistema chama personagens em ordem
   b. Amanhecer — sistema resolve ações e publica log público
   c. Fase do dia — discussão + votação
   d. Verificação de condições de vitória
5. Fim de jogo — sistema anuncia vencedor
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
| 9 | Geni | Geni | Conversa / obtém identidade |
| 10 | Informantes | Boitatá | Investiga + alinhamento (1ª noite) |
| 11 | Informantes | Cartomante | Investiga |
| 12 | Informantes | Delegado | Prende e investiga |
| 13 | Informantes | Cangaceiro | Consulta prévia ao Tiro Certo |

### Comportamento do sistema por personagem

O sistema notifica cada jogador quando é sua vez. O jogador vê apenas as opções disponíveis para seu personagem. Após agir, volta para tela de espera. O sistema avança para o próximo personagem da ordem.

Se um personagem não está na partida ou está morto/expulso, o sistema pula automaticamente.

---

**Lobisomem**
- Opções: selecionar alvo + ação (eliminar ou morder)
- Morder: uso único por jogo — sistema bloqueia a opção após uso
- Sistema verifica proteção (Curupira/Doutor) na resolução do amanhecer
- Se alvo for Brás Cubas ou Mãe de Santo: sistema registra falha silenciosamente
- Se alvo for Cangaceiro: sistema registra falha silenciosamente (ele escapou)

**Saci Pererê**
- Opções: selecionar alvo para roubo de habilidade
- Sistema marca `blockedNextNight: true` no alvo
- Gorro Vermelho: se o Saci for alvo de expulsão no dia, sistema oferece opção de ativar — ele troca de lugar com jogador à sua escolha. Uso único.
- **Aliança involuntária com Brás Cubas:** se o Saci agiu nessa noite e Brás Cubas receber ao menos um voto no dia seguinte, esse voto conta como dois. Sistema aplica silenciosamente.

**Mula sem Cabeça**
- Opções: selecionar alvo para aterrorizar
- Sistema marca `silenced: true` e `silencedRounds: 1` no alvo
- Sistema é imune ao Lobisomem — se Lobisomem selecionar a Mula, sistema registra falha
- **Objetivo:** se alvo selecionado for o Padre e a Mula tiver poder de eliminação disponível, sistema processa vitória individual

**Boto Cor-de-Rosa**
- Opções: selecionar alvo para enfeitiçar
- Sistema marca `enchanted: true` no alvo — ele não pode votar contra criaturas no próximo dia
- Chapéu: se alguém solicitar verificação do Boto no dia, sistema confirma apenas "usa chapéu" — não revela se é criatura

**Iara**
- Opções: selecionar alvo + ação (seduzir ou usar Voz Encantadora)
- Sedução: marca `seduced: true` no alvo — perde o voto
- Voz Encantadora: elimina o alvo permanentemente. Uso único. Após uso, poder de sedução bloqueado por 2 noites
- **Objetivo:** se alvo da Voz Encantadora for o Delegado, sistema registra vitória individual da Iara

**Curupira**
- Primeira noite: sistema solicita alinhamento (moradores ou criaturas) antes da ação
- Opções: selecionar alvo para proteger
- Sistema marca `protected: true` no alvo
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
- Opções: selecionar alvo para conversar
- Sistema responde apenas a ela: morador ou criatura
- Se alvo for o Cangaceiro (Romance da Caatinga): sistema revela ao Cangaceiro a identidade completa de todos os jogadores que a Geni já investigou até essa rodada
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
- Opções: selecionar alvo para prender ou passar
- Sistema marca `jailed: true` no alvo — sem voto no próximo dia
- Sistema responde apenas ao Delegado: morador ou criatura
- Uso único por jogo

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

1. **Saci:** marcar `blockedNextNight` no alvo
2. **Mula:** marcar `silenced` no alvo
3. **Boto:** marcar `enchanted` no alvo
4. **Iara:** processar sedução ou Voz Encantadora
   - Se Voz Encantadora no Delegado → registrar vitória individual da Iara
5. **Lobisomem:** verificar proteção do alvo
   - Alvo protegido (Curupira ou Doutor) → ataque falhou, não anunciar nada
   - Alvo não protegido + ação eliminar → morte confirmada
   - Alvo não protegido + ação morder → registrar mordida em segredo
   - Alvo mordido + Doutor salvou → licantropia revertida, não anunciar
   - Alvo é Brás Cubas, Mãe de Santo ou Cangaceiro → falha silenciosa
6. **Curupira/Doutor:** proteções já verificadas no passo anterior
7. **Mãe de Santo:** ativar `invoked` no jogador escolhido
8. **Boitatá/Cartomante/Delegado/Cangaceiro:** registrar resultados nos logs privados
9. **Verificar vitórias individuais:**
   - Mula eliminou o Padre?
   - Iara eliminou o Delegado com Voz Encantadora?
10. **Verificar condições de vitória coletiva**

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

Ao fim da discussão, porta-voz encerra o debate e sistema abre votação.

- Cada jogador seleciona um alvo (ou voto nulo)
- Jogadores sem direito a voto não veem a interface de votação
- Jogadores `enchanted` não podem selecionar criaturas como alvo
- **Aliança involuntária Saci/Brás Cubas:** se o Saci agiu nessa noite, qualquer voto em Brás Cubas conta como dois — sistema aplica silenciosamente
- Maioria simples define o expulso
- Empate: sem expulsão nessa rodada

### Expulsão

Sistema revela identidade do expulso imediatamente.

| Situação | Texto |
|---|---|
| Criatura | *"[Nome] é expulso(a) da cidade. Era [identidade]. O folclore perde uma de suas forças."* |
| Morador | *"[Nome] é expulso(a) da cidade. Era apenas [identidade]. A cidade cometeu um erro."* |
| Neutro | *"[Nome] é expulso(a) da cidade. Era [identidade]. Nem humano, nem monstro."* |
| Brás Cubas | *"Espera. [Nome] sorri. Era o Tolo — e ser expulso era exatamente o que queria."* |

Se Brás Cubas for expulso: sistema oferece escolha a ele — encerrar o jogo com sua vitória ou continuar como Aldeão por mais uma rodada.

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
| Mula elimina o Padre | Mula vence individualmente — jogo continua |
| Iara elimina o Delegado com Voz Encantadora | Iara vence individualmente — jogo continua |
| Cangaceiro usa Tiro Certo na Iara | Cangaceiro vence individualmente — jogo continua |

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
| Mula elimina Padre | *"A maldição foi cumprida. A Mula sem Cabeça encontrou o Padre. Ela vence."* |
| Iara elimina Delegado | *"O Delegado foi arrastado para as profundezas. Iara vence."* |
| Cangaceiro elimina Iara | *"O acerto de contas foi feito. O Cangaceiro vence."* |

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
