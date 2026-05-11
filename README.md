# Folhetim de Bucaré

Party game remoto inspirado em Werewolf/Mafia, com personagens do folclore brasileiro. Cada jogador acessa pelo celular e tem uma tela privada. O sistema arbitra todas as ações — um porta-voz lê os textos em voz alta para o grupo.

## Personagens

Criaturas, moradores e neutros do folclore do sertão nordestino: Lobisomem, Saci Pererê, Mula sem Cabeça, Boto Cor-de-Rosa, Iara, Curupira, Doutor, Mãe de Santo, Geni, Boitatá, Cartomante, Delegado, Cangaceiro, Brás Cubas e mais.

## Stack

- **Frontend:** React + TypeScript + Vite (Firebase Hosting)
- **Backend:** Firebase Cloud Functions v2 + Firestore
- **Engine:** `folclore-game-engine` — lógica de resolução de amanhecer, condições de vitória, ordem noturna

## Estrutura do monorepo

```
apps/web/          # frontend React
functions/         # Cloud Functions (TypeScript)
packages/
  folclore-game-engine/  # engine de regras (pacote local)
```

## Desenvolvimento local

**Pré-requisitos:** Node >= 20, Java (para o emulador do Firestore), Firebase CLI

```bash
npm install
```

**Terminal 1 — emuladores Firebase** (Auth · Firestore · Functions · Hosting):

```bash
firebase emulators:start
```

Aguarde a mensagem `All emulators ready` antes de abrir o frontend.

**Terminal 2 — frontend com hot reload:**

```bash
cd apps/web
VITE_USE_EMULATORS=1 npm run dev
```

Acesse a URL exibida pelo Vite (ex: `http://localhost:5175`). Os emuladores precisam estar rodando para o login funcionar — sem eles você verá `auth/network-request-failed`.

## Build e deploy

```bash
npm run build       # compila engine + frontend + functions
firebase deploy     # deploy completo (hosting + functions)
```

## Como jogar

1. O anfitrião cria uma sala e compartilha o código de 4 letras
2. Jogadores entram pelo browser e escolhem um nome
3. O anfitrião inicia — o sistema sorteia personagens e porta-voz
4. Loop de rodadas:
   - **Noite:** cada personagem age em ordem; bots agem automaticamente
   - **Amanhecer:** panorama do que aconteceu (mortes, terror, invocações)
   - **Dia:** discussão livre + votação; dia encerra quando todos votam
5. Vencedor anunciado quando moradores eliminam todas as criaturas (ou criaturas tomam o controle)
