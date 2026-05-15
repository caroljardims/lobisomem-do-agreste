import type { LoreRich } from "../types.js";

export const ROLE_DISPLAY: Record<string, string> = {
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


export const ROLE_LORE: Record<string, string | LoreRich> = {
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
          "Se a cidade votar pela sua expulsão, o Gorro intercepta: você escolhe em segredo quem vai no seu lugar (60 segundos). A cidade só vê a expulsão do substituto — ninguém sabe que você escapou.",
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
          "Toda noite, pode prender um suspeito com justificativa (ou passar). O motivo da prisão é lido em voz alta pelo porta-voz no amanhecer. O preso fica sem votar no dia seguinte, mas não é expulso. Não pode prender a mesma pessoa em duas noites seguidas. O Delegado não descobre se o alvo é criatura ou morador.",
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
        title: "Objetivo (pódio)",
        content:
          "Vencer com os moradores e estar vivo quando o cordel fechar — o pódio valoriza quem segurou a linha da cidade até o fim, sem exigir que você tenha acertado a expulsão de uma criatura.",
      },
    ],
  },
};

export const ROLE_NIGHT_DESCRIPTION: Record<string, string> = {
lobisomem:    "Você sai para caçar. Escolha um alvo para eliminar — ou use a mordida para converter (uso único).",
saci:         "Você rouba a habilidade de alguém esta noite, bloqueando sua ação na próxima.",
mula:         "Você aterroriza alguém para silenciá-lo no chat durante o dia — ou usa o Exorcismo da Vingança para eliminá-lo permanentemente (uso único).",
boto:         "Você enfeitiça alguém para que não possa votar contra as criaturas.",
iara:         "Você seduz alguém para roubar seu voto — ou usa a Voz Encantadora para eliminá-lo (uso único).",
curupira:     "Você protege alguém de qualquer ação noturna de criatura esta noite.",
doutor:       "Você pode salvar alguém de ser eliminado (não pode repetir o mesmo alvo da noite anterior) — ou passar.",
mae_de_santo: "Você pode invocar um jogador já eliminado (não expulso) — ou passar se não houver quem invocar.",
geni:         "Você conversa com alguém (morador ou criatura), usa o Charme de Verdade (uso único) ou passa a noite sem usar nenhum dos dois.",
boitata:      "Na 1ª noite escolha alinhamento e investigue alguém; depois pode investigar ou passar (não repete alvo de noites anteriores).",
cartomante:   "Você investiga alguém para revelar o lado — ou passa (a partir da 2ª noite), sem repetir alvo de noites anteriores.",
delegado:     "Você pode prender alguém — ele perde o voto no próximo dia (motivo lido em voz alta) — ou passar. Não pode prender a mesma pessoa em duas noites seguidas.",
cangaceiro:   "Você consulta se a Geni já investigou seu alvo, preparando o Tiro Certo para o dia.",
padre:        "Você catequiza alguém — ele fica imune à sedução da Iara e ao terror da Mula nessa noite.",
};

export function RoleLoreContent({ lore }: { lore: string | LoreRich }) {
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
