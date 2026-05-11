import { signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from "firebase/firestore";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { auth, call, db } from "./firebase.js";
import {
  canShowCangaceiroTiro,
  canShowCoronelAccusationVotes,
  canShowCoronelAccuse,
  canShowSaciGorroOffer,
  canShowSaciGorroSwap,
} from "./dayActions.js";

function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

const LS_ROOM = "folclore_roomCode";
const LS_PLAYER = "folclore_playerId";
const LS_GLYPH = "folclore_glyph";

const AVATAR_GLYPHS = ["☽", "✦", "◆", "❖", "✧", "☆", "★", "◉"];

const ROLE_DISPLAY: Record<string, string> = {
  lobisomem: "🐺 Lobisomem",
  saci: "🌪️ Saci Pererê",
  mula: "🔥 Mula sem Cabeça",
  boto: "🐬 Boto Cor-de-Rosa",
  iara: "🧜‍♀️ Iara",
  curupira: "🌳 Curupira",
  doutor: "👨‍⚕️ Doutor",
  mae_de_santo: "🌺 Mãe de Santo",
  geni: "🌹 Geni",
  boitata: "🐍 Boitatá",
  cartomante: "🔮 Cartomante",
  delegado: "👮 Delegado",
  cangaceiro: "🔫 Cangaceiro",
  bras_cubas: "🃏 Brás Cubas (Tolo)",
  padre: "⛪️ Padre",
  coronel: "💰 Coronel",
  aldeao: "👨‍🌾 Aldeão",
};

type LoreSection =
  | { kind: "kv"; title: string; content: ReactNode }
  | { kind: "aside"; text: ReactNode };

type LoreRich = {
  narrative: string;
  sections: LoreSection[];
};

const ROLE_LORE: Record<string, string | LoreRich> = {
  lobisomem: {
    narrative:
      "Você era um homem antes da maldição. Ninguém sabe exatamente quem — você mesmo já não tem certeza. A transformação apagou partes da memória junto com a forma humana. O que sobrou é fome e instinto, e uma consciência que aparece nos momentos errados, tarde demais pra mudar o que já foi feito.",
    sections: [
      { kind: "kv", title: "Lado", content: "Criatura" },
      { kind: "kv", title: "Poder noturno", content: "Elimina um morador por noite." },
      {
        kind: "kv",
        title: "Alcatéia (especial)",
        content: (
          <>
            Em vez de matar, pode <em>morder</em> um morador — ele vira criatura secretamente na próxima
            noite.
          </>
        ),
      },
      {
        kind: "aside",
        text: "Custo: abre mão da eliminação nessa noite. Uso único por jogo.",
      },
      {
        kind: "kv",
        title: "Contra-medida",
        content:
          "Se o Doutor salvar um morador mordido antes da próxima noite, a licantropia é revertida.",
      },
      {
        kind: "kv",
        title: "Objetivo individual",
        content: "Sobreviver até o início da 4ª rodada sem ser expulso. Ao atingir esse marco, vence individualmente — independente do resultado geral da partida.",
      },
    ],
  },
  saci: {
    narrative:
      "Você não tem raiva de ninguém em particular. Tem raiva de todo mundo em geral. Bucaré é uma cidade de gente que se leva a sério demais — e você não aguenta gente que se leva a sério. Você embaralha as coisas por prazer, por princípio, e porque o caos que deixa pra trás sempre revela algo que a ordem estava escondendo.",
    sections: [
      { kind: "kv", title: "Lado", content: "Criatura" },
      {
        kind: "kv",
        title: "Poder noturno",
        content:
          "Rouba a habilidade de um morador — ele não pode usá-la na próxima rodada.",
      },
      {
        kind: "kv",
        title: "Gorro Vermelho (especial)",
        content:
          "Se um jogador tentar prendê-lo ou expulsá-lo, pode invocar um redemoinho: troca de lugar secretamente com outro jogador à sua escolha.",
      },
      {
        kind: "aside",
        text: "Custo: uso único por jogo. Revelado ao sistema, nunca ao grupo.",
      },
      {
        kind: "kv",
        title: "Objetivo",
        content: "Roubar a habilidade do Delegado ao menos uma vez antes de ser descoberto.",
      },
    ],
  },
  mula: {
    narrative:
      "Você foi Donária. Uma mulher devota, casada, destruída pelo homem em quem mais confiava. Quando a verdade veio à tona de forma torta — como as verdades sempre vêm em cidade pequena — foi você quem pagou o preço. Donária desapareceu numa quinta-feira à noite. A Mula sem Cabeça não esqueceu o nome do homem que a destruiu.",
    sections: [
      { kind: "kv", title: "Lado", content: "Criatura" },
      {
        kind: "kv",
        title: "Poder noturno — Terror",
        content:
          "Aterroriza um morador — o chat dele fica desabilitado durante toda a fase do dia seguinte.",
      },
      {
        kind: "kv",
        title: "Exorcismo da Vingança (especial)",
        content: (
          <>
            Uma vez por jogo, em vez de aterrorizar, pode <em>eliminar permanentemente</em> um alvo.
            Se o alvo for o Padre, vence individualmente naquele mesmo instante.
          </>
        ),
      },
      {
        kind: "aside",
        text: "Custo: uso único por jogo. O Exorcismo falha silenciosamente se o alvo estiver protegido pelo Curupira, Doutor ou Geni.",
      },
      {
        kind: "kv",
        title: "Cantar do Galo",
        content:
          "Imune à eliminação noturna do Lobisomem. Vulnerável a expulsão por votação normalmente.",
      },
      {
        kind: "kv",
        title: "A maldição e o alvo",
        content: (
          <>
            Na primeira noite, o sistema avisa a Mula em segredo:{" "}
            <em>&quot;o Padre está nessa partida&quot;</em>. Ela sabe que ele existe — mas não quem é.
          </>
        ),
      },
      {
        kind: "aside",
        text: "Ela pode usar o terror para calar suspeitos e observar reações — quem defende o silenciado pode ser o Padre tentando proteger seu catequizado.",
      },
      {
        kind: "kv",
        title: "Objetivo",
        content:
          "O Padre precisa sair da partida — eliminado pelo Exorcismo da Vingança ou expulso por votação do grupo. Se isso acontecer, vence individualmente — independente do resultado geral da partida.",
      },
    ],
  },
  boto: {
    narrative:
      "Você aparece nas festas com chapéu de palha branca e paletó de linho. Ninguém sabe de onde vem. Você dança bem, fala melhor ainda, e toda vez que aparece, alguém acorda no dia seguinte sem memória da noite anterior. A cidade desconfia, mas você sempre tem uma história pronta — e as suas histórias são sempre melhores que a verdade.",
    sections: [
      { kind: "kv", title: "Lado", content: "Criatura" },
      {
        kind: "kv",
        title: "Poder noturno",
        content:
          "Enfeitiça um morador — ele não pode votar contra uma criatura na fase do dia seguinte.",
      },
      {
        kind: "kv",
        title: "Chapéu (especial)",
        content: (
          <>
            Se alguém pedir ao grupo para verificar seu chapéu (tentativa de identificá-lo), o sistema
            confirma apenas que <em>usa chapéu</em> — sem revelar se é criatura.
          </>
        ),
      },
      {
        kind: "kv",
        title: "Objetivo",
        content:
          "Enfeitiçar todos os moradores da partida ao menos uma vez ao longo do jogo. Quando o último morador entrar na lista, vence individualmente — independente do resultado geral da partida.",
      },
    ],
  },
  iara: {
    narrative:
      "Você não veio ao baile. Você não vai à feira. Você mora no rio que passa atrás da cidade, e as pessoas que vão buscar água tarde da noite às vezes ouvem uma voz que não é de gente. Os que voltam, voltam distraídos. Os que não voltam, não voltam.",
    sections: [
      { kind: "kv", title: "Lado", content: "Criatura" },
      {
        kind: "kv",
        title: "Poder noturno",
        content:
          "Seduz um morador — ele perde o voto nessa rodada, mas não é eliminado.",
      },
      {
        kind: "kv",
        title: "Voz Encantadora (especial)",
        content: (
          <>
            Uma vez por jogo, pode seduzir e eliminar permanentemente em vez de apenas neutralizar — o
            morador <em>&quot;desaparece nas profundezas&quot;</em>.
          </>
        ),
      },
      {
        kind: "aside",
        text: "Custo: perde o poder de sedução nas 2 noites seguintes.",
      },
      {
        kind: "kv",
        title: "Objetivo",
        content:
          "Eliminar o Delegado usando a Voz Encantadora. Se conseguir, vence individualmente — independente do resultado geral da partida.",
      },
    ],
  },
  curupira: {
    narrative:
      "Você não quer nada com Bucaré. Você é da floresta — e a floresta está sendo derrubada pelo Coronel Agenor para plantar mais pasto. Você entrou na cidade porque a floresta está diminuindo e você com ela. Você não tem lado: tem território. E qualquer pessoa que ameace o que sobrou do mato vai descobrir o que significa se perder sem bússola numa mata fechada.",
    sections: [
      { kind: "kv", title: "Lado", content: "Neutro" },
      {
        kind: "kv",
        title: "Poder noturno",
        content:
          "Protege uma pessoa de qualquer ação nessa noite — inclusive do Lobisomem.",
      },
      {
        kind: "kv",
        title: "Pés ao Contrário",
        content:
          "Se o Curupira for investigado pela Cartomante, o sistema inverte a resposta automaticamente: morador aparece como criatura e vice-versa.",
      },
      {
        kind: "kv",
        title: "Alinhamento secreto",
        content:
          "Na primeira noite, escolhe silenciosamente: moradores ou criaturas. Vence se seu lado vencer e ele ainda estiver no jogo.",
      },
      {
        kind: "kv",
        title: "Objetivo próprio",
        content: "Proteger 3 jogadores diferentes do mesmo lado que escolheu ao longo do jogo.",
      },
    ],
  },
  doutor: {
    narrative:
      "Você é Ernesto Cavalcante. Chegou de fora — formado no Recife, veio pra Bucaré porque a cidade precisava de médico e você precisava de um lugar longe dos credores. É competente, cínico, e o único homem na cidade que fala a verdade com regularidade — não por virtude, mas porque a mentira dá trabalho e você é preguiçoso. Você salva quem consegue salvar. Quem não consegue, enterra e segue em frente.",
    sections: [
      { kind: "kv", title: "Lado", content: "Morador" },
      {
        kind: "kv",
        title: "Poder noturno",
        content:
          "Salva uma pessoa da eliminação. Não pode salvar a mesma pessoa duas noites seguidas.",
      },
      {
        kind: "kv",
        title: "Contra-licantropia",
        content:
          "Se salvar um morador mordido pelo Lobisomem antes da próxima noite, a transformação é revertida.",
      },
      {
        kind: "kv",
        title: "Objetivo",
        content:
          "Salvar pelo menos 2 pessoas de eliminações confirmadas ao longo do jogo.",
      },
    ],
  },
  mae_de_santo: {
    narrative:
      "Você é Maria Conga. Chegou a Bucaré vinda de não se sabe onde, instalou seu terreiro na beira do rio e nunca mais saiu. A cidade oficial finge que você não existe. O povo vai ao terreiro às escondidas, de madrugada, quando a medicina do Doutor não resolve e a fé do Padre não chega. Você conhece o folclore do sertão melhor do que qualquer criatura conhece a si mesma.",
    sections: [
      { kind: "kv", title: "Lado", content: "Morador" },
      {
        kind: "kv",
        title: "Imunidade — Proteção dos Orixás",
        content: (
          <>
            Não pode ser eliminada pelo Lobisomem à noite. O Lobisomem recebe do sistema a mensagem:{" "}
            <em>&quot;essa pessoa não pode ser tocada.&quot;</em> Ele sabe que errou o alvo — mas não sabe
            por quê.
          </>
        ),
      },
      {
        kind: "kv",
        title: "Poder noturno — Abre Gira",
        content:
          "Escolhe qualquer jogador eliminado para invocar — morador ou criatura. Esse jogador retorna por uma rodada completa: fala livremente na fase do dia e vota normalmente. Ao fim do dia, retorna ao silêncio.",
      },
      {
        kind: "aside",
        text:
          "O jogador invocado observou a partida inteira depois de morrer. Volta com tudo que viu — e pode usar esse conhecimento como quiser. Uma criatura invocada não tem obrigação de falar a verdade.\n\nSe não houver jogadores eliminados, o poder é perdido nessa noite.",
      },
      {
        kind: "kv",
        title: "Objetivo",
        content:
          "Invocar pelo menos 2 jogadores diferentes ao longo do jogo e sobreviver até o fim.",
      },
    ],
  },
  geni: {
    narrative:
      "Você era filha de ninguém, criada na casa grande do Coronel desde menina. Aprendeu cedo que não tinha herança nem sobrenome — só o que o próprio corpo e coração podiam oferecer. Virou a mulher mais desejada de Bucaré não por malícia, mas por genuína generosidade. Trinta anos servindo na casa do Coronel ensinaram que quem serve vê tudo. E quem vê tudo tem poder.",
    sections: [
      { kind: "kv", title: "Lado", content: "Morador" },
      {
        kind: "kv",
        title: "Poder noturno — Confiança",
        content: (
          <>
            Escolhe um jogador por noite para <em>&quot;conversar&quot;</em>. O sistema informa à Geni apenas
            se ele é criatura ou morador.
          </>
        ),
      },
      {
        kind: "kv",
        title: "Charme de Verdade (especial)",
        content: (
          <>
            Uma vez por jogo, em vez de conversar, pode <em>proteger</em> um jogador de qualquer ação noturna
            de criatura nessa noite — inclusive sedução da Iara, terror da Mula e enfeitiço do Boto.
          </>
        ),
      },
      {
        kind: "aside",
        text: "Custo: uso único por jogo. O jogador protegido não sabe que foi protegido.",
      },
      {
        kind: "kv",
        title: "Romance da Caatinga (especial)",
        content:
          "Se a Geni usar o poder de Confiança no Cangaceiro durante a noite, ela compartilha o que sabe — o sistema revela ao Cangaceiro a identidade completa de todos os jogadores que a Geni já investigou até aquela rodada.",
      },
      {
        kind: "aside",
        text:
          "Na manhã seguinte, ele sabe mais do que qualquer outro jogador. Mas agora tem que decidir o que fazer com isso — e sem trair de onde veio a informação.",
      },
      {
        kind: "kv",
        title: "Inimigo secreto",
        content: (
          <>
            O sistema avisa Geni na primeira noite:{" "}
            <em>&quot;O Boto Cor-de-Rosa está nessa partida.&quot;</em> Ela reconhece o tipo — homem que
            seduz sem amar, usa sem dar.
          </>
        ),
      },
      {
        kind: "kv",
        title: "Objetivo",
        content:
          "Expor o Boto — convencer o grupo a expulsá-lo por votação sem revelar que sabia que ele era criatura e sem usar nenhum poder especial para forçar o voto.",
      },
      {
        kind: "aside",
        text:
          "A vingança tem que ser conquistada com palavras, não com poder. Se o Boto for eliminado à noite antes da expulsão pública, o objetivo é cancelado.",
      },
    ],
  },
  boitata: {
    narrative:
      "Você vigia os campos à noite. Seus muitos olhos — comidos de cadáveres de animais mortos pelos incêndios do Coronel — enxergam tudo no escuro. Você não gosta de Bucaré. Não gosta do Coronel. Mas também não gosta das criaturas que saem caçando à noite sem necessidade. Você está aqui porque alguém precisa ver, e você é o único que enxerga no escuro sem se perder.",
    sections: [
      { kind: "kv", title: "Lado", content: "Neutro" },
      {
        kind: "kv",
        title: "Poder noturno",
        content:
          "Investiga um jogador — o sistema revela apenas a ele se a pessoa é criatura ou morador.",
      },
      {
        kind: "kv",
        title: "Muitos Olhos",
        content:
          "Nunca pode ser eliminado pelo Lobisomem à noite. Pode ser expulso por votação normalmente.",
      },
      {
        kind: "kv",
        title: "Alinhamento secreto",
        content:
          "Na primeira noite, escolhe silenciosamente: moradores ou criaturas. Pode usar suas revelações para ajudar ou sabotar a investigação pública conforme seu lado.",
      },
      {
        kind: "kv",
        title: "Objetivo próprio",
        content:
          "Identificar corretamente 3 criaturas (ou 3 moradores, conforme seu lado) sem revelar seu próprio papel até o fim do jogo.",
      },
    ],
  },
  cartomante: {
    narrative:
      "Você é Perpétua. Lê as cartas há quarenta anos na mesma mesa, no mesmo cômodo, com a mesma toalha bordada. Nunca errou uma previsão — ou melhor, nunca fez uma previsão que não pudesse ser interpretada como certa depois dos fatos. Você sabe o que as pessoas escondem. Não por dom sobrenatural, mas porque em cidade pequena, segredo que um guarda dois já sabem — e você ouve muito e fala pouco.",
    sections: [
      { kind: "kv", title: "Lado", content: "Morador" },
      {
        kind: "kv",
        title: "Poder noturno",
        content:
          "Investiga uma pessoa. O sistema responde: morador ou criatura.",
      },
      {
        kind: "aside",
        text: "Atenção: se investigar o Curupira, o sistema inverte o resultado automaticamente.",
      },
      {
        kind: "kv",
        title: "Objetivo",
        content:
          "Identificar corretamente 2 criaturas e comunicar ao grupo sem ser eliminada antes.",
      },
    ],
  },
  delegado: {
    narrative:
      "Você é Tobias Mourão. Na prática, o braço do Coronel. Não por maldade — você acredita genuinamente que manter a ordem é manter o Coronel, e manter o Coronel é manter a cidade funcionando. Você prende quem o Coronel indica, investiga quem o Coronel suspeita, e dorme bem todas as noites porque nunca se perguntou se estava do lado certo.",
    sections: [
      { kind: "kv", title: "Lado", content: "Morador" },
      {
        kind: "kv",
        title: "Poder noturno — Prisão",
        content:
          "Toda noite, pode prender um suspeito com justificativa — o motivo é lido em voz alta pelo porta-voz no amanhecer. O preso fica sem votar no dia seguinte, mas não é expulso. O Delegado não descobre se o alvo é criatura ou morador.",
      },
      {
        kind: "kv",
        title: "Objetivo",
        content: "Prender pelo menos uma criatura e sobreviver até o fim do jogo.",
      },
    ],
  },
  cangaceiro: {
    narrative:
      "Ninguém sabe o seu nome verdadeiro. Você apareceu em Bucaré há três anos, vive nas bordas da caatinga, entra na cidade quando quer e some quando precisa. O que te trouxe até aqui foi o rio — ou melhor, o que o rio levou. Sua irmã desapareceu numa noite de festa ribeirinha. Encontraram o chapéu dela na beira d'água. Você rastreou o folclore do sertão inteiro e ficou em Bucaré. Dizem que você é duro como pedra. Mas Geni é a única pessoa da cidade que já te viu rir.",
    sections: [
      { kind: "kv", title: "Lado", content: "Morador" },
      {
        kind: "kv",
        title: "Poder ativo — Tiro Certo (especial)",
        content: (
          <>
            Uma vez por jogo, durante a fase do dia, pode apontar para um jogador e declarar:{" "}
            <em>&quot;Esse é uma criatura.&quot;</em> Se estiver certo, a criatura é eliminada imediatamente —
            sem votação. Se errar, o jogador inocente é eliminado do mesmo jeito e a identidade do Cangaceiro
            é revelada ao grupo.
          </>
        ),
      },
      {
        kind: "aside",
        text:
          "É o único poder do jogo que elimina sem votação durante o dia. Sem rede. Sem volta.",
      },
      {
        kind: "kv",
        title: "O jogo deles — consulta prévia",
        content: (
          <>
            <p style={{ margin: "0 0 10px" }}>Antes de disparar, o Cangaceiro pode consultar o sistema sobre um alvo:</p>
            <ul className="lore-card__fact-list">
              <li>
                Se a Geni <strong>já investigou</strong> esse jogador: o sistema revela imediatamente se é
                criatura ou morador — ela conta de boa, sem custo nenhum.
              </li>
              <li>
                Se a Geni <strong>não investigou</strong> ainda: o sistema bloqueia o poder de Confiança da
                Geni na noite seguinte — ele perguntou sem ela ter nada pra oferecer, e ela não gostou.
              </li>
            </ul>
          </>
        ),
      },
      {
        kind: "aside",
        text:
          "Ele pode atirar sem consultar. Mas aí é na fé.\n\nO grupo vai perceber que às vezes o Cangaceiro hesita antes de agir. Sorte ou jogo de olhares — ninguém sabe.",
      },
      {
        kind: "kv",
        title: "Inimigo secreto",
        content: (
          <>
            O sistema avisa o Cangaceiro na primeira noite:{" "}
            <em>&quot;A Iara está nessa partida.&quot;</em>
          </>
        ),
      },
      {
        kind: "kv",
        title: "Objetivo",
        content:
          "Usar o Tiro Certo para eliminar a Iara. Se conseguir, vence individualmente — independente do resultado geral da partida.",
      },
      {
        kind: "aside",
        text:
          "Se a Iara for expulsa ou eliminada de outra forma antes do Tiro Certo, o objetivo é cancelado. O acerto de contas tem que ser dele.",
      },
    ],
  },
  bras_cubas: {
    narrative:
      "Você era o filho mais velho de uma família que já teve dinheiro e agora só tem o sobrenome. Estudou em Olinda, leu todos os livros errados, voltou convencido de que a vida não tem sentido e que a única coisa honesta que um homem pode fazer é reconhecer isso abertamente. A cidade acha que você é louco. Você acha que a cidade é que é louca. Nenhum dos dois está completamente errado. Você quer ser expulso por votação pública — não por merecer, mas como ato filosófico.",
    sections: [
      { kind: "kv", title: "Lado", content: "Neutro" },
      {
        kind: "kv",
        title: "Carta secreta",
        content:
          "Ninguém sabe se o Tolo está na partida. Parece um aldeão comum. Sua identidade só é revelada se for expulso por votação — nunca se for eliminado à noite.",
      },
      {
        kind: "kv",
        title: "Imunidade noturna (passiva)",
        content: (
          <>
            Não pode ser eliminado por nenhuma criatura à noite. As criaturas não recebem aviso — o sistema
            apenas diz <em>&quot;ninguém morreu essa noite&quot;</em>.
          </>
        ),
      },
      {
        kind: "aside",
        text: "O Lobisomem que tentou matar o Tolo pode achar que foi bloqueado pelo Curupira.",
      },
      {
        kind: "kv",
        title: "Aliança involuntária — Saci ↔ Brás Cubas",
        content:
          "Se o Saci roubar a habilidade de qualquer jogador numa rodada em que Brás Cubas receber pelo menos um voto de expulsão, esse voto conta como dois.",
      },
      {
        kind: "aside",
        text:
          "Nenhum dos dois sabe da regra. Nenhum dos dois sabe da existência do outro. O sistema aplica silenciosamente.\n\nSe Brás Cubas receber votos em múltiplas rodadas, a regra só se aplica nas rodadas em que o Saci também agiu.",
      },
      {
        kind: "kv",
        title: "Objetivo",
        content:
          "Ser expulso por votação do grupo antes do fim do jogo. Ao ser expulso, pode encerrar o jogo com sua vitória — ou escolher qualquer personagem disponível e voltar por mais uma rodada com essa nova identidade.",
      },
      {
        kind: "aside",
        text:
          "Se sobreviver até o fim sem ser expulso, perde — mesmo que os moradores vençam.",
      },
    ],
  },
  padre: {
    narrative:
      "Você é Anselmo Coutinho. Chegou à cidade trinta anos atrás com a missão de catequizar o sertão. É respeitado, temido um pouco, e tem a chave da única igreja da cidade. O que a cidade não sabe — ou finge não saber — é que você não é um homem de fé. É um homem de poder. A batina é um uniforme como outro qualquer. Você catequiza porque catequizar é controlar. E há um nome que você prefere não ouvir em voz alta: Donária.",
    sections: [
      { kind: "kv", title: "Lado", content: "Morador" },
      {
        kind: "kv",
        title: "Poder noturno — Catequese",
        content:
          "Escolhe um jogador para catequizar. O alvo fica imune à sedução da Iara e ao terror da Mula nessa mesma noite.",
      },
      {
        kind: "aside",
        text: (
          <>
            <strong>O duelo da maldição:</strong> A Mula sem Cabeça sabe que o Padre está na partida. O
            Padre não sabe que é alvo.
          </>
        ),
      },
      {
        kind: "kv",
        title: "Objetivo individual",
        content:
          "Catequizar todos os moradores vivos ao menos uma vez ao longo do jogo. Quando o último morador entrar na lista, vence individualmente — independente do resultado geral da partida.",
      },
    ],
  },
  coronel: {
    narrative:
      "Você é Agenor Furtado. Sempre mandou. Seu pai mandava antes de você, e o pai do pai antes disso. As terras ao redor da cidade têm o sobrenome da família gravado nos mourões de cerca. Você não é um homem violento. É pior: é um homem paciente. Você espera. Você cobra. E quando decide que alguém precisa sair da cidade, aquela pessoa some — da maneira mais prosaica possível.",
    sections: [
      { kind: "kv", title: "Lado", content: "Morador" },
      {
        kind: "kv",
        title: "Sem poder noturno",
        content:
          "O Coronel não age à noite. Toda sua força está na fase do dia.",
      },
      {
        kind: "kv",
        title: "Acusação Formal (poder de dia)",
        content:
          "Uma vez por jogo, indica um jogador e força uma votação exclusiva sobre aquele alvo — a maioria decide a expulsão imediatamente.",
      },
      {
        kind: "aside",
        text:
          "Se usar a acusação em alguém que não é o Boitatá, perde o poder para o resto do jogo e sua identidade é revelada ao grupo.",
      },
      {
        kind: "kv",
        title: "O blefe",
        content:
          "Para cumprir seu objetivo, o Coronel precisa convencer o grupo sem revelar seu papel. Revelar o papel antes da expulsão cancela o objetivo individual.",
      },
      {
        kind: "kv",
        title: "Objetivo",
        content:
          "Usar a acusação formal para expulsar o Boitatá — sem revelar seu próprio papel antes da expulsão acontecer.",
      },
      {
        kind: "aside",
        text:
          "Se revelar o papel antes, vence com os moradores normalmente, mas sem conquista individual.",
      },
    ],
  },
  aldeao: {
    narrative:
      "Você é gente comum de Bucaré — padeiro, lavadeira, homem do armazém ou dona de casa que cuida da roça. Conhece os vizinhos pelo nome, sabe quem deve a quem e quem chega tarde da feira. As últimas noites mudaram: menos riso na rua, mais vela acesa atrás da porta, e histórias que ninguém quer contar até o fim. Você não carrega reza forte nem pacto com entidade nenhuma. Você tem o que todo mundo deveria ter em cidade pequena: olho no olho, paciência e desconfiança saudável do que não se explica.",
    sections: [
      { kind: "kv", title: "Lado", content: "Morador" },
      {
        kind: "kv",
        title: "Sem poderes",
        content:
          "Você não tem ação à noite nem carta especial. Participa do dia como qualquer outro morador: conversa, vota na expulsão e ouve o que o porta-voz lê em voz alta. Sua força é perceber contradição antes de virar pânico.",
      },
      {
        kind: "kv",
        title: "Objetivo",
        content:
          "Vencer com os moradores estando vivo quando a partida terminar e, em pelo menos uma rodada, ter votado (com voto válido) em alguém que seja expulso e revelado como criatura — não precisa ser seu voto sozinho que decide; basta ter apontado para o perigo certo nessa ocasião.",
      },
    ],
  },
};

function RoleLoreContent({ lore }: { lore: string | LoreRich }) {
  if (typeof lore === "string") {
    return (
      <p className="lore-card__body" style={{ margin: 0 }}>
        {lore}
      </p>
    );
  }
  return (
    <>
      <p className="lore-card__body lore-card__narrative" style={{ margin: 0 }}>
        {lore.narrative}
      </p>
      <div className="lore-card__extra">
        {lore.sections.map((block, i) =>
          block.kind === "aside" ? (
            <blockquote key={i} className="lore-card__aside">
              {block.text}
            </blockquote>
          ) : (
            <div key={i} className="lore-card__section">
              <div className="lore-card__section-title">{block.title}</div>
              <div className="lore-card__section-body">{block.content}</div>
            </div>
          ),
        )}
      </div>
    </>
  );
}

type View = "intro" | "create" | "join" | "joinName";

type RoomDoc = DocumentData & {
  status?: string;
  hostUid?: string;
  expectedPlayerCount?: number;
  round?: number;
  spokespersonId?: string;
  currentActorRole?: string | null;
  nightPendingRoles?: string[];
  votingOpen?: boolean;
  votesRound?: number;
  pendingBrasChoice?: boolean;
  pendingNightStart?: boolean;
  pendingNightRound?: number;
  winner?: string | null;
  daySubPhase?: string;
  pendingSaciGorro?: boolean;
  coronelAccusationTarget?: string;
  revealedRoles?: Record<string, string>;
};

type PlayerDoc = DocumentData & {
  id?: string;
  name?: string;
  uid?: string;
  alive?: boolean;
  eliminated?: boolean;
  expelled?: boolean;
  isSpokesperson?: boolean;
  isBot?: boolean;
  wolfBiteUsed?: boolean;
  mulaExorcizeUsed?: boolean;
  geniCharmUsed?: boolean;
  seduced?: boolean;
  jailed?: boolean;
  silenced?: boolean;
  invoked?: boolean;
  individualObjectiveMet?: boolean;
};

function describeNightAction(
  actorName: string,
  role: string,
  action: string,
  targetName: string,
  specialAction?: string | null,
): string {
  switch (role) {
    case "lobisomem":
      return action === "bite"
        ? `${actorName} mordeu ${targetName}`
        : `${actorName} tentou eliminar ${targetName}`;
    case "saci":
      return `${actorName} bloqueou ${targetName} para a próxima noite`;
    case "mula":
      return action === "exorcize"
        ? `${actorName} usou o Exorcismo da Vingança em ${targetName}`
        : `${actorName} aterrorizou ${targetName}`;
    case "boto":
      return `${actorName} enfeitiçou ${targetName}`;
    case "iara":
      return action === "eliminate_special"
        ? `${actorName} usou a Voz Encantadora em ${targetName}`
        : `${actorName} seduziu ${targetName}`;
    case "curupira":
      return `${actorName} protegeu ${targetName}`;
    case "doutor":
      return `${actorName} tentou salvar ${targetName}`;
    case "mae_de_santo":
      return `${actorName} invocou ${targetName}`;
    case "geni":
      return action === "charm"
        ? `${actorName} usou o Charme de Verdade em ${targetName}`
        : `${actorName} conversou com ${targetName}`;
    case "padre":
      return `${actorName} catequizou ${targetName}`;
    case "boitata":
      return `${actorName} investigou ${targetName}`;
    case "cartomante":
      return `${actorName} investigou ${targetName}`;
    case "delegado": {
      const reason = specialAction?.trim();
      return reason
        ? `${actorName} prendeu ${targetName} — "${reason}"`
        : `${actorName} prendeu ${targetName}`;
    }
    case "cangaceiro":
      return `${actorName} consultou ${targetName}`;
    default:
      return "";
  }
}

export function App() {
  const [uid, setUid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(LS_ROOM) ?? "");
  const [playerId, setPlayerId] = useState(() => localStorage.getItem(LS_PLAYER) ?? "");
  const [name, setName] = useState("");
  const [expected, setExpected] = useState(5);
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [players, setPlayers] = useState<PlayerDoc[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [publicLog, setPublicLog] = useState<{ id: string; message?: string; round?: number; type?: string }[]>([]);
  const [privateLog, setPrivateLog] = useState<{ id: string; message?: string; round?: number }[]>([]);
  const [chat, setChat] = useState<{ id: string; name?: string; text?: string }[]>([]);
  const [chatText, setChatText] = useState("");
  const [voteTarget, setVoteTarget] = useState<string>("");
  /** Votos da rodada atual (`votes/{round}`), chaves = playerId (exceto `updatedAt`). */
  const [dayRoundVotes, setDayRoundVotes] = useState<Record<string, string | null>>({});
  const [nightTarget, setNightTarget] = useState<string>("");
  const [nightAction, setNightAction] = useState("eliminate");
  const [nightSpecialAction, setNightSpecialAction] = useState<string | null>(null);
  const [nightActionSent, setNightActionSent] = useState(false);
  const [dayActionSent, setDayActionSent] = useState<string | null>(null);
  const [allRoundVotes, setAllRoundVotes] = useState<Record<number, Record<string, string | null>>>({});
  const [allNightActions, setAllNightActions] = useState<Record<number, Record<string, { role?: string; action?: string; targetId?: string | null; specialAction?: string | null }>>>({});
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [loreOpen, setLoreOpen] = useState(false);
  const [brasChosenRole, setBrasChosenRole] = useState("aldeao");

  // Entry flow
  const [view, setView] = useState<View>("intro");
  const [glyph, setGlyph] = useState(() => localStorage.getItem(LS_GLYPH) ?? "☽");
  const [joinCodeArr, setJoinCodeArr] = useState(["", "", "", ""]);
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);
  const [copied, setCopied] = useState(false);
  // tracks locally whether the current user created the room (avoids waiting for Firestore)
  const [amHost, setAmHost] = useState(false);

  useEffect(() => {
    signInAnonymously(auth)
      .then((c) => setUid(c.user.uid))
      .catch((e) => setErr(String(e.message)));
  }, []);

  useEffect(() => {
    if (!roomCode) {
      setRoom(null);
      setPlayers([]);
      return;
    }
    const unsubR = onSnapshot(doc(db, "rooms", roomCode), (s) =>
      setRoom(s.exists() ? (s.data() as RoomDoc) : null),
    );
    const unsubP = onSnapshot(collection(db, "rooms", roomCode, "players"), (snap) =>
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlayerDoc)),
    );
    const qLog = query(
      collection(db, "rooms", roomCode, "publicLogEntries"),
      orderBy("timestamp", "asc"),
    );
    const unsubL = onSnapshot(qLog, (snap) =>
      setPublicLog(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => {
      unsubR();
      unsubP();
      unsubL();
    };
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !playerId) {
      setMyRole(null);
      return;
    }
    return onSnapshot(doc(db, "rooms", roomCode, "secrets", playerId), (s) => {
      setMyRole(s.exists() ? String((s.data() as { role?: string }).role ?? "") : null);
    });
  }, [roomCode, playerId]);

  useEffect(() => {
    if (!roomCode || !playerId) { setPrivateLog([]); return; }
    const q = query(
      collection(db, "rooms", roomCode, "privateLog", playerId, "entries"),
      orderBy("round", "asc"),
    );
    return onSnapshot(q, (snap) =>
      setPrivateLog(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
  }, [roomCode, playerId]);

  useEffect(() => {
    if (room?.status !== "ended" || !roomCode || !room?.round) {
      setAllRoundVotes({});
      setAllNightActions({});
      setHistoryLoaded(false);
      return;
    }
    const totalRounds = Number(room.round);
    setHistoryLoaded(false);
    const fetchHistory = async () => {
      const votesAcc: Record<number, Record<string, string | null>> = {};
      const actionsAcc: Record<number, Record<string, { role?: string; action?: string; targetId?: string | null; specialAction?: string | null }>> = {};
      await Promise.all(
        Array.from({ length: totalRounds }, (_, i) => i + 1).map(async (r) => {
          const [vSnap, aSnap] = await Promise.all([
            getDoc(doc(db, "rooms", roomCode, "votes", String(r))),
            getDoc(doc(db, "rooms", roomCode, "nightActions", String(r))),
          ]);
          if (vSnap.exists()) {
            const raw = vSnap.data() as Record<string, unknown>;
            const votes: Record<string, string | null> = {};
            for (const [k, v] of Object.entries(raw)) {
              if (k === "updatedAt") continue;
              votes[k] = v == null ? null : String(v);
            }
            votesAcc[r] = votes;
          }
          if (aSnap.exists()) {
            actionsAcc[r] = aSnap.data() as Record<string, { role?: string; action?: string; targetId?: string | null; specialAction?: string | null }>;
          }
        }),
      );
      setAllRoundVotes(votesAcc);
      setAllNightActions(actionsAcc);
      setHistoryLoaded(true);
    };
    fetchHistory().catch(console.error);
  }, [room?.status, room?.round, roomCode]);

  useEffect(() => {
    if (!roomCode || room?.status !== "day") {
      setChat([]);
      return;
    }
    const q = query(
      collection(db, "rooms", roomCode, "chat"),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(q, (snap) =>
      setChat(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
  }, [roomCode, room?.status]);

  useEffect(() => {
    if (!roomCode || !room || room.status !== "day") {
      setDayRoundVotes({});
      return;
    }
    const round = String(Number(room.votesRound ?? room.round ?? 1));
    return onSnapshot(doc(db, "rooms", roomCode, "votes", round), (snap) => {
      const raw = snap.data() as Record<string, unknown> | undefined;
      if (!raw) {
        setDayRoundVotes({});
        return;
      }
      const next: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (k === "updatedAt") continue;
        next[k] = v == null || v === undefined ? null : String(v);
      }
      setDayRoundVotes(next);
    });
  }, [roomCode, room?.status, room?.votesRound, room?.round]);

  useEffect(() => {
    if (room?.status !== "day") return;
    setVoteTarget("");
  }, [roomCode, room?.votesRound, room?.round, room?.status]);

  // Sync local stepper with Firestore whenever the room doc changes
  useEffect(() => {
    if (room?.expectedPlayerCount) {
      setExpected(Number(room.expectedPlayerCount));
    }
  }, [room?.expectedPlayerCount]);

  // Auto-advance join view when all 4 cells filled
  useEffect(() => {
    if (view === "join" && joinCodeArr.every((c) => c.length === 1)) {
      setView("joinName");
    }
  }, [joinCodeArr, view]);

  // Auto-focus first code cell
  useEffect(() => {
    if (view !== "join") return;
    const t = requestAnimationFrame(() => codeInputRefs.current[0]?.focus());
    return () => cancelAnimationFrame(t);
  }, [view]);

  const isHost = !!(room?.hostUid && uid === room.hostUid);

  const run = useCallback(async (fnName: string, data: Record<string, unknown>) => {
    setErr(null);
    setLoading(true);
    try {
      const c = call(fnName);
      const res = await c({ playerId, ...data });
      return res.data as Record<string, unknown>;
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : String(e);
      setErr(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  const createRoom = async () => {
    localStorage.setItem(LS_GLYPH, glyph);
    setAmHost(true);
    const r = await run("createRoom", { name, expectedPlayerCount: expected });
    const code = String(r.roomCode ?? "");
    const pid = String(r.playerId ?? "");
    setRoomCode(code);
    setPlayerId(pid);
    localStorage.setItem(LS_ROOM, code);
    localStorage.setItem(LS_PLAYER, pid);
  };

  const joinRoom = async () => {
    localStorage.setItem(LS_GLYPH, glyph);
    const code = joinCodeArr.join("").toUpperCase().trim();
    const r = await run("joinRoom", { roomCode: code, name });
    const pid = String(r.playerId ?? "");
    setRoomCode(code);
    setPlayerId(pid);
    localStorage.setItem(LS_ROOM, code);
    localStorage.setItem(LS_PLAYER, pid);
  };

  const leave = () => {
    localStorage.removeItem(LS_ROOM);
    localStorage.removeItem(LS_PLAYER);
    setRoomCode("");
    setPlayerId("");
    setAmHost(false);
    setView("intro");
  };

  const copyCode = () => {
    copyToClipboard(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const goIntro = () => {
    setView("intro");
    setJoinCodeArr(["", "", "", ""]);
    setErr(null);
  };

  const updateJoinDigit = (index: number, raw: string) => {
    const ch = raw.replace(/[^a-zA-Z0-9]/g, "").slice(-1).toUpperCase();
    const next = [...joinCodeArr];
    next[index] = ch;
    setJoinCodeArr(next);
    if (ch && index < 3) codeInputRefs.current[index + 1]?.focus();
  };

  const onCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !joinCodeArr[index] && index > 0) {
      e.preventDefault();
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const displayGlyph = (p: PlayerDoc): string => {
    if (p.id === playerId) return glyph;
    return (p.name?.[0] ?? "?").toUpperCase();
  };

  const startGame = () => run("startGame", { roomCode });

  const ROLE_NIGHT_DESCRIPTION: Record<string, string> = {
    lobisomem:    "Você sai para caçar. Escolha um alvo para eliminar — ou use a mordida para converter (uso único).",
    saci:         "Você rouba a habilidade de alguém esta noite, bloqueando sua ação na próxima.",
    mula:         "Você aterroriza alguém para silenciá-lo no chat durante o dia — ou usa o Exorcismo da Vingança para eliminá-lo permanentemente (uso único).",
    boto:         "Você enfeitiça alguém para que não possa votar contra as criaturas.",
    iara:         "Você seduz alguém para roubar seu voto — ou usa a Voz Encantadora para eliminá-lo (uso único).",
    curupira:     "Você protege alguém de qualquer ação noturna de criatura esta noite.",
    doutor:       "Você salva alguém de ser eliminado. Não pode repetir o mesmo alvo da noite anterior.",
    mae_de_santo: "Você invoca um jogador já eliminado para retornar por mais um dia.",
    geni:         "Você conversa com alguém e o sistema revela: morador ou criatura — ou usa o Charme de Verdade para protegê-lo de qualquer criatura esta noite (uso único).",
    boitata:      "Você investiga alguém para descobrir seu lado.",
    cartomante:   "Você lê o destino de alguém para revelar se é morador ou criatura.",
    delegado:     "Você prende alguém — ele perde o voto no próximo dia. A prisão deve ser justificada e o motivo será lido publicamente.",
    cangaceiro:   "Você consulta se a Geni já investigou seu alvo, preparando o Tiro Certo para o dia.",
    padre:        "Você catequiza alguém — ele fica imune à sedução da Iara e ao terror da Mula nessa noite.",
  };

  const roleActionOptions = useMemo(() => {
    const r = myRole ?? "";
    const me = players.find((p) => p.id === playerId);
    if (r === "lobisomem") {
      const opts = [{ value: "eliminate", label: "eliminar" }];
      if (!me?.wolfBiteUsed) opts.push({ value: "bite", label: "morder (uso único)" });
      return opts;
    }
    if (r === "iara") return [
      { value: "seduce", label: "seduzir" },
      { value: "eliminate_special", label: "Voz Encantadora (uso único)" },
    ];
    if (r === "mula") {
      const opts = [{ value: "terrorize", label: "aterrorizar" }];
      if (!me?.mulaExorcizeUsed) opts.push({ value: "exorcize", label: "Exorcismo da Vingança (uso único)" });
      return opts;
    }
    if (r === "geni") {
      const opts = [{ value: "converse", label: "conversar" }];
      if (!me?.geniCharmUsed) opts.push({ value: "charm", label: "Charme de Verdade (uso único)" });
      return opts;
    }
    const single: Record<string, { value: string; label: string }> = {
      saci:       { value: "steal",       label: "roubar habilidade" },
      boto:       { value: "enchant",     label: "enfeitiçar" },
      curupira:   { value: "protect",     label: "proteger" },
      doutor:     { value: "save",        label: "salvar" },
      mae_de_santo: { value: "invoke",    label: "invocar" },
      boitata:    { value: "investigate", label: "investigar" },
      cartomante: { value: "investigate", label: "investigar" },
      delegado:   { value: "jail",        label: "prender" },
      cangaceiro: { value: "query",       label: "consultar" },
      padre:      { value: "catechize",   label: "catequizar" },
    };
    if (single[r]) return [single[r]];
    return [];
  }, [myRole, players, playerId]);

  useEffect(() => {
    setNightAction(roleActionOptions[0]?.value ?? "eliminate");
    setNightTarget("");
    setNightSpecialAction(null);
    setNightActionSent(false);
    setDayActionSent(null);
  }, [myRole, room?.round, room?.status]);

  useEffect(() => {
    if (room?.round === 1 && room?.status === "night") setLoreOpen(true);
  }, [room?.round, room?.status]);

  // ── Shared UI fragments ──

  const glyphPicker = (
    <div className="glyph-grid" role="group" aria-label="Símbolo do jogador">
      {AVATAR_GLYPHS.map((g) => (
        <button
          key={g}
          type="button"
          className={g === glyph ? "glyph-pick glyph-pick-active" : "glyph-pick"}
          onClick={() => setGlyph(g)}
        >
          {g}
        </button>
      ))}
    </div>
  );

  const stepper = (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        onClick={() => setExpected(Math.max(5, expected - 1))}
      >
        −
      </button>
      <span className="stepper-val">{expected}</span>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => setExpected(Math.min(20, expected + 1))}
      >
        +
      </button>
    </div>
  );

  // ── Connecting screen ──

  if (!uid) {
    return (
      <div className="page connecting-page">
        <div className="connecting-content">
          <div className="connecting-glyph">◆</div>
          <p className="connecting-text">conectando…</p>
          {err && <p className="error">{err}</p>}
        </div>
      </div>
    );
  }

  // ── Entry flow ──

  if (!roomCode) {
    if (view === "intro") {
      return (
        <div className="page">
          <div className="brand-center">
            <div className="brand-title">Lobisomem do Sertão</div>
            <div className="brand-tagline">jogo de identidade social</div>
          </div>

          <div className="intro-body">
            <h2 className="h-display">
              Cada um no sertão,
              <br />
              todos na mesma noite.
            </h2>
            <p className="copy-muted">
              crie uma sala, divida o código com a turma e revele os segredos do
              folclore — em tempo real.
            </p>
          </div>

          <div className="spacer" />

          <div className="ctas">
            <button
              type="button"
              className="primary-btn"
              onClick={() => setView("create")}
            >
              <div className="btn-stack">
                <span className="btn-title">Criar uma sala</span>
                <span className="btn-sub">você vira o anfitrião da noite</span>
              </div>
              <span className="btn-arrow" aria-hidden>
                →
              </span>
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setJoinCodeArr(["", "", "", ""]);
                setView("join");
              }}
            >
              <div className="btn-stack">
                <span className="btn-title">Entrar com código</span>
                <span className="btn-sub">já recebeu o convite</span>
              </div>
              <span className="btn-arrow" aria-hidden>
                →
              </span>
            </button>
          </div>

          <div className="footer">
            <div className="deco-divider">
              <span className="deco-glyph">◆ ◆ ◆</span>
            </div>
          </div>
        </div>
      );
    }

    if (view === "create") {
      return (
        <div className="page">
          <div className="top-bar">
            <button type="button" className="back-link" onClick={goIntro}>
              ← voltar
            </button>
            <span className="session-label">nova sala</span>
            <span className="top-bar-spacer" />
          </div>

          <div className="form-layout">
            <div className="form-col-lead">
              <h2 className="h-display">
                Quem você é
                <br />
                nessa noite?
              </h2>
              <p className="copy-muted">
                você abre a porta — escolha como quer aparecer e chame a turma.
              </p>
            </div>
            <div className="form-col-fields">
              <label className="field-label" htmlFor="name-create">
                seu nome
              </label>
              <input
                id="name-create"
                className="field-input"
                placeholder="como quer ser chamado"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
              />
              <label className="field-label">símbolo</label>
              {glyphPicker}
              <label className="field-label">jogadores esperados</label>
              {stepper}
              {err && <p className="error">{err}</p>}
              <button
                type="button"
                className="primary-btn"
                disabled={loading || !name.trim()}
                onClick={createRoom}
              >
                <div className="btn-stack">
                  <span className="btn-title">
                    {loading ? "aguarda…" : "Abrir sala"}
                  </span>
                  <span className="btn-sub">geramos o código para você</span>
                </div>
                <span className="btn-arrow" aria-hidden>
                  →
                </span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (view === "join") {
      return (
        <div className="page">
          <div className="top-bar">
            <button type="button" className="back-link" onClick={goIntro}>
              ← voltar
            </button>
            <span className="session-label">entrar</span>
            <span className="top-bar-spacer" />
          </div>

          <div className="form-layout">
            <div className="form-col-lead">
              <h2 className="h-display">Qual o código?</h2>
              <p className="copy-muted">
                quatro letras ou números — como veio no convite.
              </p>
            </div>
            <div className="form-col-fields">
              <div className="code-input-row">
                {joinCodeArr.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      codeInputRefs.current[i] = el;
                    }}
                    className="code-cell"
                    value={digit}
                    onChange={(e) => updateJoinDigit(i, e.target.value)}
                    onKeyDown={(e) => onCodeKeyDown(i, e)}
                    maxLength={1}
                    inputMode="text"
                    autoCapitalize="characters"
                    aria-label={`Dígito ${i + 1} do código`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (view === "joinName") {
      return (
        <div className="page">
          <div className="top-bar">
            <button
              type="button"
              className="back-link"
              onClick={() => {
                setJoinCodeArr(["", "", "", ""]);
                setView("join");
              }}
            >
              ← voltar
            </button>
            <span className="session-label">quase lá</span>
            <span className="top-bar-spacer" />
          </div>

          <div className="form-layout">
            <div className="form-col-lead">
              <p className="code-preview">{joinCodeArr.join("")}</p>
              <p className="copy-muted">
                sala encontrada. agora é só dizer quem é você.
              </p>
            </div>
            <div className="form-col-fields">
              <label className="field-label" htmlFor="name-join">
                seu nome
              </label>
              <input
                id="name-join"
                className="field-input"
                placeholder="como quer ser chamado"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
              />
              <label className="field-label">símbolo</label>
              {glyphPicker}
              {err && <p className="error">{err}</p>}
              <button
                type="button"
                className="primary-btn"
                disabled={loading || !name.trim()}
                onClick={joinRoom}
              >
                <div className="btn-stack">
                  <span className="btn-title">
                    {loading ? "aguarda…" : "Entrar na sala"}
                  </span>
                  <span className="btn-sub">entrar na partida</span>
                </div>
                <span className="btn-arrow" aria-hidden>
                  →
                </span>
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // ── Room flow ──

  // Show lobby immediately when roomCode is set — don't wait for Firestore snapshot.
  // Same pattern as Sips: local state drives the screen, server data fills in reactively.
  const inLobby = !room || room.status === "lobby";

  // amHost is set locally the moment createRoom returns, before room doc arrives.
  const effectiveIsHost = isHost || (amHost && !room);

  const canStart = effectiveIsHost && players.length >= 5 && players.length >= expected;

  const hostCta = effectiveIsHost ? (
    <button
      type="button"
      className={canStart ? "primary-btn" : "primary-btn primary-btn-disabled"}
      disabled={loading || !canStart}
      onClick={startGame}
    >
      <div className="btn-stack">
        <span className="btn-title">
          {loading
            ? "iniciando…"
            : canStart
              ? "Começar a noite"
              : "Esperando jogadores"}
        </span>
        <span className="btn-sub">
          {canStart
            ? `${players.length} jogadores prontos`
            : players.length < 5
              ? `mínimo 5 · agora ${players.length}`
              : `${players.length} de ${room?.expectedPlayerCount ?? 5} — preencha as vagas`}
        </span>
      </div>
      <span className="btn-arrow" aria-hidden>
        →
      </span>
    </button>
  ) : (
    <div className="waiting-host">
      <span className="dot-pulse" />
      aguardando o anfitrião iniciar o jogo…
    </div>
  );

  return (
    <div className="page">
      <div className="top-bar">
        <button type="button" className="back-link" onClick={leave}>
          ← sair
        </button>
        <span className="session-label">
          {inLobby ? "lobby" : `rodada ${room?.round ?? 1}`}
        </span>
        <span className="online-pill">
          <span className="dot-online" />
          {players.length}
        </span>
      </div>

      {err && <p className="error">{err}</p>}

      {inLobby && (
        <>
          <div className="lobby-content">
            <div className="code-section">
              <div className="code-card">
                <div className="code-card-label">código da sala</div>
                <div className="code-card-value">
                  {roomCode.split("").map((c, i) => (
                    <span key={i} className="code-letter">
                      {c}
                    </span>
                  ))}
                </div>
                <div className="code-card-row">
                  <button type="button" className="chip-btn" onClick={copyCode}>
                    {copied ? "✓ copiado" : "copiar"}
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() =>
                      navigator
                        .share?.({
                          title: "Lobisomem do Sertão",
                          text: `entra na minha sala: ${roomCode}`,
                        })
                        .catch(() => {})
                    }
                  >
                    compartilhar
                  </button>
                </div>
                <div className="code-card-deco">◆ ◆ ◆</div>
              </div>
              <div className="cta-desktop">{hostCta}</div>
            </div>

            <div className="players-section">
              <div className="section-eyebrow">
                à volta da fogueira{" "}
                <span className="muted-label">
                  · {players.length} de {room?.expectedPlayerCount ?? "?"}
                </span>
              </div>

              {players.length === 0 && (
                <div className="waiting-host">
                  <span className="dot-pulse" />
                  carregando jogadores…
                </div>
              )}

              <div className="player-list">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className={
                      p.id === playerId
                        ? "player-row player-row-you"
                        : "player-row"
                    }
                  >
                    <div className="player-glyph">{displayGlyph(p)}</div>
                    <div className="player-text">
                      <div className="player-name">
                        {p.name}
                        {p.id === playerId && (
                          <span className="player-tag">você</span>
                        )}
                        {p.uid === room?.hostUid && (
                          <span className="player-tag player-tag-host">
                            anfitrião
                          </span>
                        )}
                      </div>
                      <div className="player-meta">
                        <span className="dot-online" />
                        conectado
                      </div>
                    </div>
                  </div>
                ))}
                {room && players.length < (room.expectedPlayerCount ?? 20) && (
                  <div className="player-row player-row-empty">
                    <div className="player-glyph player-glyph-empty">+</div>
                    <div className="player-text">
                      <div className="player-name player-name-muted">
                        vaga aberta
                      </div>
                      <div className="player-meta">
                        esperando alguém entrar…
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {effectiveIsHost && (
                <div className="host-expected">
                  <label className="field-label">vagas esperadas</label>
                  {stepper}
                  <button
                    type="button"
                    className="chip-btn"
                    disabled={loading || !room}
                    onClick={() =>
                      run("setExpectedPlayerCount", {
                        roomCode,
                        expectedPlayerCount: expected,
                      })
                    }
                  >
                    atualizar vagas
                  </button>
                  {players.length < Math.min(expected, 10) && (
                    <button
                      type="button"
                      className="chip-btn"
                      disabled={loading}
                      onClick={async () => {
                        if (Number(room?.expectedPlayerCount) !== expected) {
                          await run("setExpectedPlayerCount", { roomCode, expectedPlayerCount: expected });
                        }
                        await run("addBots", { roomCode, count: Math.max(1, Math.min(expected, 10) - players.length) });
                      }}
                    >
                      + preencher com bots ({Math.min(expected, 10) - players.length} vagas)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="cta-mobile">{hostCta}</div>
        </>
      )}

      {room && room.status !== "lobby" && room.status !== "ended" && (
        <div className="game-card">
          <p>
            <strong>
              {room.status === "day"
                ? `Dia ${room.round ?? 1}`
                : room.status === "night"
                  ? `Noite ${room.round ?? 1}`
                  : `Rodada ${room.round ?? 1}`}
            </strong>
          </p>
          {myRole && <p className="muted">Seu personagem: {ROLE_DISPLAY[myRole] ?? myRole}</p>}

          {myRole && ROLE_LORE[myRole] && (
            <div className="role-story-card">
              <button
                type="button"
                className="role-story-toggle"
                onClick={() => setLoreOpen((v) => !v)}
              >
                <span>História — {ROLE_DISPLAY[myRole] ?? myRole}</span>
                <span className="role-story-chevron">{loreOpen ? "▲" : "▼"}</span>
              </button>
              {loreOpen && (
                <div className="role-story-body">
                  <p className="role-story-location">Bucaré do Sertão, 1922.</p>
                  <RoleLoreContent lore={ROLE_LORE[myRole]} />
                </div>
              )}
            </div>
          )}

          {room.status === "night" && (() => {
            const myRoleIsPending = !!(myRole && room.nightPendingRoles?.includes(myRole));
            const needsAlignment = (myRole === "curupira" || myRole === "boitata") && room.round === 1;
            const targetPool = myRole === "mae_de_santo"
              ? players.filter((p) => p.eliminated && !p.expelled)
              : players.filter((p) => p.id !== playerId && p.alive !== false && !p.eliminated && !p.expelled);
            const needsJailReason = myRole === "delegado";
            const canSubmit = !loading && !!nightTarget && (!needsAlignment || !!nightSpecialAction) && (!needsJailReason || !!nightSpecialAction?.trim());

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {myRoleIsPending ? (
                  <>
                    {myRole && ROLE_NIGHT_DESCRIPTION[myRole] && (
                      <p className="muted" style={{ margin: 0 }}>
                        {ROLE_NIGHT_DESCRIPTION[myRole]}
                      </p>
                    )}
                    {roleActionOptions.length > 1 && (
                      <>
                        <label>Ação</label>
                        <select value={nightAction} onChange={(e) => setNightAction(e.target.value)}>
                          {roleActionOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </>
                    )}
                    {needsAlignment && (
                      <>
                        <label>Seu alinhamento (rodada 1)</label>
                        <select value={nightSpecialAction ?? ""} onChange={(e) => setNightSpecialAction(e.target.value)}>
                          <option value="">escolha um lado…</option>
                          <option value="moradores">moradores</option>
                          <option value="criaturas">criaturas</option>
                        </select>
                      </>
                    )}
                    {needsJailReason && (
                      <>
                        <label>Motivo da prisão (será lido publicamente)</label>
                        <input
                          type="text"
                          placeholder="ex: comportamento suspeito na última noite"
                          value={nightSpecialAction ?? ""}
                          onChange={(e) => setNightSpecialAction(e.target.value)}
                          maxLength={120}
                        />
                      </>
                    )}
                    <label>Alvo</label>
                    <select value={nightTarget} onChange={(e) => setNightTarget(e.target.value)}>
                      <option value="">—</option>
                      {targetPool.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!canSubmit || loading || nightActionSent}
                      className={nightActionSent ? "vote-sent" : undefined}
                      style={{ marginTop: "4px" }}
                      onClick={() =>
                        run("submitNightAction", {
                          roomCode,
                          action: nightAction,
                          targetId: nightTarget || null,
                          specialAction: nightSpecialAction,
                        }).then(() => setNightActionSent(true))
                      }
                    >
                      {loading ? "enviando…" : nightActionSent ? "✓ Ação registrada" : "Enviar ação"}
                    </button>
                  </>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    {myRole && !["coronel", "aldeao", "bras_cubas"].includes(myRole)
                      ? "Ação enviada. Aguardando os outros…"
                      : "Você não tem ação noturna. Aguarde o amanhecer."}
                  </p>
                )}
              </div>
            );
          })()}

          {room.status === "day" && (() => {
            const myPlayer = players.find((p) => p.id === playerId);
            const currentRound = room.round ?? 1;
            const nightTypes = ["death", "bite", "terror", "invocation", "dawn", "special"];
            const dawnEntries = publicLog.filter(
              (e) => e.round === currentRound && nightTypes.includes(e.type ?? ""),
            );
            const hasDeathOrElimination = dawnEntries.some((e) => e.type === "death");
            const outOfGame = players.filter((p) => p.alive === false || p.eliminated || p.expelled);
            const canVote =
              myPlayer?.alive !== false &&
              !myPlayer?.eliminated &&
              !myPlayer?.expelled &&
              !myPlayer?.seduced &&
              !myPlayer?.jailed;
            const hasVoted =
              Boolean(playerId) && Object.hasOwn(dayRoundVotes, playerId);
            const eligibleVoters = players.filter(
              (p) => p.alive !== false && !p.eliminated && !p.expelled && !p.seduced && !p.jailed,
            );
            const allVotesIn =
              eligibleVoters.length === 0 ||
              eligibleVoters.every((p) => Object.hasOwn(dayRoundVotes, p.id ?? ""));
            const voteSelectValue = hasVoted
              ? (dayRoundVotes[playerId] ?? "")
              : voteTarget;
            const resolvedVoteTarget =
              canVote && hasVoted ? (dayRoundVotes[playerId] ?? "") : voteTarget;

            return (
              <div className="stack stack--dense day-phase">
                <div className="game-card log-card day-section folhetim-card">
                  <strong className="folhetim-title">Folhetim de Bucaré</strong>
                  {dawnEntries.filter((e) => e.type !== "dawn").map((e) => (
                    <p key={e.id}>{e.message}</p>
                  ))}
                  {!hasDeathOrElimination && (
                    <p className="muted">Ninguém foi eliminado esta noite.</p>
                  )}
                  {publicLog
                    .filter((e) => e.type === "expulsion" && e.round === currentRound)
                    .map((e) => <p key={e.id}>{e.message}</p>)
                  }
                  {privateLog.filter((e) => e.round === currentRound).map((e) => (
                    <p key={e.id} className="private-log-entry">🔒 {e.message}</p>
                  ))}
                  {outOfGame.length > 0 && (
                    <p className="muted" style={{ marginTop: "0.5rem" }}>
                      Fora do jogo: {outOfGame.map((p) => p.name).join(", ")}
                    </p>
                  )}
                </div>
                <div className="game-card chat-card day-section">
                  <strong>Chat</strong>
                  {chat.map((m) => (
                    (m as { type?: string }).type === "vote" ? (
                      <p key={m.id} className="muted" style={{ fontSize: "0.8em" }}>
                        {m.text}
                      </p>
                    ) : (
                      <p key={m.id}>
                        <strong>{m.name}:</strong> {m.text}
                      </p>
                    )
                  ))}
                </div>
                {(() => {
                  const isDead =
                    myPlayer?.alive === false ||
                    myPlayer?.eliminated ||
                    myPlayer?.expelled;
                  if (isDead && !myPlayer?.invoked) {
                    return (
                      <p className="muted day-section">
                        Você não pode enviar mensagens.
                      </p>
                    );
                  }
                  if (myPlayer?.silenced) {
                    return (
                      <p className="muted day-section">
                        Você está em silêncio e não pode falar agora.
                      </p>
                    );
                  }
                  return (
                    <div className="row day-section">
                      <input
                        value={chatText}
                        onChange={(e) => setChatText(e.target.value)}
                        placeholder="Mensagem…"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          run("sendChatMessage", {
                            roomCode,
                            text: chatText,
                          }).then(() => setChatText(""))
                        }
                      >
                        Enviar
                      </button>
                    </div>
                  );
                })()}
                {!canVote ? (
                  <p className="muted day-section">Você não tem direito a voto nesta rodada.</p>
                ) : (
                  <div className="day-section vote-block">
                    <label>Seu voto - vote para expulsar um suspeito</label>
                    <select
                      value={voteSelectValue}
                      disabled={hasVoted || loading}
                      onChange={(e) => setVoteTarget(e.target.value)}
                    >
                      <option value="">Nulo</option>
                      {players
                        .filter(
                          (p) =>
                            p.id !== playerId &&
                            p.alive !== false &&
                            !p.eliminated &&
                            !p.expelled,
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className={hasVoted ? "vote-sent" : undefined}
                      disabled={hasVoted || loading}
                      onClick={() =>
                        run("submitVote", { roomCode, targetId: voteTarget || null })
                      }
                    >
                      {hasVoted ? "✓ Voto enviado" : "Votar"}
                    </button>
                  </div>
                )}
                {isHost && room.votingOpen && (
                  <div className="day-section vote-block">
                    <button
                      type="button"
                      className={allVotesIn ? "primary-btn" : undefined}
                      disabled={loading || !allVotesIn}
                      onClick={() => run("advanceDay", { roomCode })}
                    >
                      {allVotesIn
                        ? "Encerrar dia e contar votos"
                        : `Aguardando votos — ${eligibleVoters.filter((p) => Object.hasOwn(dayRoundVotes, p.id ?? "")).length} de ${eligibleVoters.length}`}
                    </button>
                  </div>
                )}
                {isHost && room.pendingNightStart && (
                  <div className="day-section vote-block">
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={loading}
                      onClick={() => run("startNight", { roomCode })}
                    >
                      Toque de recolher
                    </button>
                  </div>
                )}
                {canShowCoronelAccuse(myRole, room, myPlayer) && (
                  <div className="row day-actions-row day-section">
                    <button
                      type="button"
                      disabled={!resolvedVoteTarget || loading || dayActionSent === "coronel"}
                      className={dayActionSent === "coronel" ? "vote-sent" : undefined}
                      onClick={() =>
                        run("coronelStartAccusation", {
                          roomCode,
                          targetId: resolvedVoteTarget,
                        }).then(() => setDayActionSent("coronel"))
                      }
                    >
                      {loading ? "enviando…" : dayActionSent === "coronel" ? "✓ Acusação iniciada" : "Coronel: acusação formal"}
                    </button>
                  </div>
                )}
                {canShowCoronelAccusationVotes(room, myPlayer) && (
                  <div className="row day-actions-row day-section">
                    <span className="muted day-actions-label">Votação da acusação formal</span>
                    <button
                      type="button"
                      disabled={loading || dayActionSent === "coronel_vote"}
                      className={dayActionSent === "coronel_vote" ? "vote-sent" : undefined}
                      onClick={() =>
                        run("coronelAccusationVote", { roomCode, yes: true })
                          .then(() => setDayActionSent("coronel_vote"))
                      }
                    >
                      {dayActionSent === "coronel_vote" ? "✓ Votado" : "Voto sim"}
                    </button>
                    <button
                      type="button"
                      disabled={loading || dayActionSent === "coronel_vote"}
                      onClick={() =>
                        run("coronelAccusationVote", { roomCode, yes: false })
                          .then(() => setDayActionSent("coronel_vote"))
                      }
                    >
                      Voto não
                    </button>
                  </div>
                )}
                {canShowCangaceiroTiro(myRole, myPlayer) && (
                  <div className="row day-actions-row day-section">
                    <button
                      type="button"
                      disabled={!resolvedVoteTarget || loading || dayActionSent === "tiro"}
                      className={dayActionSent === "tiro" ? "vote-sent" : undefined}
                      onClick={() =>
                        run("cangaceiroTiroCerto", {
                          roomCode,
                          targetId: resolvedVoteTarget,
                        }).then(() => setDayActionSent("tiro"))
                      }
                    >
                      {loading ? "enviando…" : dayActionSent === "tiro" ? "✓ Tiro disparado" : "Tiro Certo"}
                    </button>
                  </div>
                )}
                {(canShowSaciGorroOffer(myRole, room, myPlayer) ||
                  canShowSaciGorroSwap(myRole, room, myPlayer, resolvedVoteTarget)) && (
                  <div className="row day-actions-row day-section">
                    {canShowSaciGorroOffer(myRole, room, myPlayer) && (
                      <button
                        type="button"
                        disabled={loading || dayActionSent === "gorro_offer"}
                        className={dayActionSent === "gorro_offer" ? "vote-sent" : undefined}
                        onClick={() =>
                          run("markSaciGorroOffer", { roomCode })
                            .then(() => setDayActionSent("gorro_offer"))
                        }
                      >
                        {dayActionSent === "gorro_offer" ? "✓ Oferta ativa" : "Gorro Vermelho (oferta)"}
                      </button>
                    )}
                    {canShowSaciGorroSwap(myRole, room, myPlayer, resolvedVoteTarget) && (
                      <button
                        type="button"
                        disabled={loading || dayActionSent === "gorro_swap"}
                        className={dayActionSent === "gorro_swap" ? "vote-sent" : undefined}
                        onClick={() =>
                          run("saciGorroSwap", {
                            roomCode,
                            swapWithPlayerId: resolvedVoteTarget,
                          }).then(() => setDayActionSent("gorro_swap"))
                        }
                      >
                        {dayActionSent === "gorro_swap" ? "✓ Troca realizada" : "Gorro: trocar de lugar"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {room?.pendingBrasChoice && myRole === "bras_cubas" && (
        <div className="game-card">
          <p style={{ fontFamily: "var(--type-display)", fontStyle: "italic", color: "var(--gold)", marginBottom: 12 }}>
            Brás Cubas foi expulso. Qual é a sua escolha?
          </p>
          <button
            type="button"
            onClick={() => run("brasContinueChoice", { roomCode, endGame: true })}
            style={{ marginBottom: 10 }}
          >
            Encerrar — vencer agora
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 13, color: "var(--ink-cream)" }}>
              Ou voltar como:
            </label>
            <select
              value={brasChosenRole}
              onChange={(e) => setBrasChosenRole(e.target.value)}
              className="vote-select"
            >
              {Object.entries(ROLE_DISPLAY).map(([roleId, label]) => (
                <option key={roleId} value={roleId}>{label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => run("brasContinueChoice", { roomCode, endGame: false, chosenRole: brasChosenRole })}
            >
              Continuar como {ROLE_DISPLAY[brasChosenRole] ?? brasChosenRole}
            </button>
          </div>
        </div>
      )}

      {room?.status === "ended" && (() => {
        const winnerLabel =
          room.winner === "moradores"
            ? "Os moradores controlaram as criaturas"
            : room.winner === "criaturas"
              ? "As criaturas dominaram a cidade dos humanos"
              : room.winner === "bots"
                ? "Apocalipse Robô"
                : (() => {
                    const wp = players.find((p) => p.id === room.winner);
                    return wp ? `${wp.name} venceu` : "Fim de jogo";
                  })();

        const revealed = room.revealedRoles ?? {};
        const SIDE_LABEL: Record<string, string> = {
          criatura: "criatura",
          morador: "morador",
          neutro: "neutro",
        };
        const SIDE_OF_ROLE: Record<string, string> = {
          lobisomem: "criatura", saci: "criatura", mula: "criatura",
          boto: "criatura", iara: "criatura",
          curupira: "morador", doutor: "morador", mae_de_santo: "morador",
          geni: "morador", boitata: "morador", cartomante: "morador",
          delegado: "morador", cangaceiro: "morador", padre: "morador",
          coronel: "morador", aldeao: "morador", bras_cubas: "neutro",
        };

        const totalRounds = Number(room.round ?? 1);
        const playerNameById: Record<string, string> = {};
        for (const p of players) {
          if (p.id) playerNameById[p.id] = p.name ?? p.id;
        }

        return (
          <div className="stack stack--dense">
            {myRole && ROLE_LORE[myRole] && (
              <div className="role-story-card">
                <button
                  type="button"
                  className="role-story-toggle"
                  onClick={() => setLoreOpen((v) => !v)}
                >
                  <span>História — {ROLE_DISPLAY[myRole] ?? myRole}</span>
                  <span className="role-story-chevron">{loreOpen ? "▲" : "▼"}</span>
                </button>
                {loreOpen && (
                  <div className="role-story-body">
                    <p className="role-story-location">Bucaré do Sertão, 1922.</p>
                    <RoleLoreContent lore={ROLE_LORE[myRole]} />
                  </div>
                )}
              </div>
            )}
            <div className="game-card ended-card">
              <p className="ended-label">Fim de jogo</p>
              <p className="ended-winner">{winnerLabel}</p>
              {isHost && (
                <button
                  type="button"
                  className="primary-btn"
                  disabled={loading}
                  style={{ marginTop: "1rem" }}
                  onClick={() => run("restartGame", { roomCode })}
                >
                  <div className="btn-stack">
                    <span className="btn-title">{loading ? "reiniciando…" : "Recomeçar"}</span>
                    <span className="btn-sub">volta ao lobby com os mesmos jogadores</span>
                  </div>
                  <span className="btn-arrow" aria-hidden>→</span>
                </button>
              )}
            </div>

            <div className="game-card log-card">
              <strong>Revelação final</strong>
              {players.map((p) => {
                const role = revealed[p.id ?? ""];
                const roleName = role ? (ROLE_DISPLAY[role] ?? role) : "?";
                const side = role ? SIDE_OF_ROLE[role] : null;
                return (
                  <p key={p.id}>
                    <strong>{p.name}</strong>
                    {" — "}
                    {roleName}
                    {side && (
                      <span className="muted"> ({SIDE_LABEL[side] ?? side})</span>
                    )}
                    {(p.alive === false || p.eliminated || p.expelled) && (
                      <span className="muted"> · eliminado</span>
                    )}
                  </p>
                );
              })}
            </div>

            <div className="game-card log-card chronicle-card">
              <strong className="chronicle-title">Crônica da partida</strong>
              {!historyLoaded ? (
                <p className="muted">Carregando histórico…</p>
              ) : (
                Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => {
                  const nightActions = allNightActions[r] ?? {};
                  const roundVotes = allRoundVotes[r] ?? {};
                  const nightPublicEntries = publicLog.filter(
                    (e) => e.round === r && ["death", "bite", "terror", "invocation", "special"].includes(e.type ?? ""),
                  );
                  const dayPublicEntries = publicLog.filter(
                    (e) => e.round === r && e.type === "expulsion",
                  );
                  const hasVotes = Object.keys(roundVotes).length > 0;
                  const actionLines = Object.entries(nightActions).flatMap(([pid, act]) => {
                    if (!act.targetId) return [];
                    const actorName = playerNameById[pid] ?? pid;
                    const targetName = playerNameById[act.targetId] ?? act.targetId;
                    const desc = describeNightAction(actorName, act.role ?? "", act.action ?? "", targetName, act.specialAction);
                    if (!desc) return [];
                    return [{ pid, role: act.role ?? "", desc }];
                  });

                  return (
                    <div key={r} className="chronicle-round">
                      <p className="chronicle-phase">Noite {r}</p>
                      {actionLines.length === 0 && nightPublicEntries.length === 0 && (
                        <p className="muted chronicle-line">Sem registros.</p>
                      )}
                      {actionLines.map(({ pid, role, desc }) => (
                        <p key={pid} className="chronicle-line">
                          <span className="chronicle-role">{ROLE_DISPLAY[role] ?? role}</span>
                          {" · "}
                          {desc}
                        </p>
                      ))}
                      {nightPublicEntries.map((e) => (
                        <p key={e.id} className="chronicle-outcome">{e.message}</p>
                      ))}
                      {hasVotes && (
                        <>
                          <p className="chronicle-phase">Dia {r}</p>
                          {Object.entries(roundVotes).map(([voterId, targetId]) => {
                            const voterName = playerNameById[voterId] ?? voterId;
                            const targetName = targetId ? (playerNameById[targetId] ?? targetId) : "voto nulo";
                            return (
                              <p key={voterId} className="chronicle-line">
                                {voterName} <span className="chronicle-arrow">→</span> {targetName}
                              </p>
                            );
                          })}
                          {dayPublicEntries.map((e) => (
                            <p key={e.id} className="chronicle-outcome">{e.message}</p>
                          ))}
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
}
