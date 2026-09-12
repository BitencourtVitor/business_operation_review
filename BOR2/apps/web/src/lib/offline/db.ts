import Dexie, { type Table } from "dexie"

/**
 * O banco do aparelho.
 *
 * O IndexedDB é o que o Atlas tem de mais parecido com um banco de verdade
 * dentro do navegador: transacional, assíncrono, gravado no disco, e sem o
 * limite de alguns megabytes do `localStorage`. Os 2.800 planos de uma obra como
 * metadado cabem aqui sem esforço.
 *
 * A API nativa é verbosa a ponto de estimular gambiarra, e por isso Dexie. O
 * ganho que importa não é a sintaxe: é o `useLiveQuery`, que faz a tela se
 * redesenhar sozinha quando o dado muda. Sem ele, cada escrita precisaria
 * lembrar de avisar cada componente que lê aquilo, e é assim que uma tela passa
 * a mostrar dado velho depois de um sync.
 *
 * **O que não mora aqui: o arquivo.** A prancha vai para o OPFS, e o registro
 * guarda só o caminho. Guardar um PDF de 2 MB como Blob no IndexedDB funciona e
 * é a escolha errada: leitura parcial fica impossível, e o navegador carrega o
 * objeto inteiro na memória para devolver um pedaço.
 */

/** Uma obra, como o aparelho a conhece. */
export interface ObraLocal {
  id: string
  name: string
  client: string
  community: string
  status: string
  /**
   * Se esta obra foi escolhida para uso offline. Obra não escolhida continua
   * listada e desabilitada quando falta rede: sumir da lista pareceria perda de
   * acesso, e a pessoa concluiria que foi removida do projeto.
   */
  selecionada: boolean
  /** Última vez que alguém abriu esta obra **neste aparelho**. */
  ultimoAcesso: number
  /**
   * Quando os bytes foram liberados por inatividade. A obra continua clicável e
   * abre normalmente; no lugar das pastas aparece o aviso. É estado distinto de
   * obra nunca baixada, e não compartilha componente com ele.
   */
  expiradaEm: number | null
}

/** Uma pasta, que é a unidade de escopo do offline. */
export interface PastaLocal {
  id: string
  obraId: string
  name: string
  category: string
  subcategory: string
  /**
   * Não existe botão de obra offline inteira. A pasta é a unidade porque
   * corresponde a um documento anexado e a uma categoria, que é como o pessoal
   * de campo raciocina: "a planta de painéis do primeiro andar", não "a obra".
   */
  estado: "ausente" | "baixando" | "disponivel" | "desatualizada"
  /** A revisão que este aparelho tem. Comparada contra a do servidor. */
  revisaoLocal: number
  revisaoServidor: number
  /** Tamanho estimado, para poder ser mostrado antes da confirmação. */
  bytes: number
  baixadoEm: number | null
}

/** Um plano. O metadado desce sempre; o arquivo, só se a pasta foi escolhida. */
export interface PlanoLocal {
  id: string
  pastaId: string
  obraId: string
  versaoId: string
  pageIndex: number
  sheetNumber: string
  title: string
  /**
   * O caminho no OPFS, quando o arquivo está no aparelho. Nulo é plano que
   * existe e cujo arquivo não desceu, que é o estado normal de quem não baixou
   * a pasta e é diferente de plano que não existe.
   */
  arquivo: string | null
  thumb: string | null
  widthPt: number
  heightPt: number
  /** Escala, para a trena funcionar sem rede. */
  scaleUnitsPerPt: number | null
  scaleLabel: string
  desatualizado: boolean
  /**
   * Se o arquivo guardado é o set inteiro e não o recorte da página. Acontece
   * com versão que nunca foi recortada: todas as folhas apontam para o mesmo
   * arquivo, e o leitor precisa pular para a página da folha.
   */
  inteiro?: boolean
  /**
   * O tamanho do arquivo da prancha no servidor. É com ele que o progresso de
   * download se mede antes de o arquivo existir no aparelho: o tamanho da pasta
   * é o do PDF original, e a soma dos recortes não bate com ele.
   */
  bytes?: number
}

/** Um ponto do punch list, como o aparelho o conhece. */
export interface PontoLocal {
  id: string
  obraId: string
  planoId: string
  numero: number | null
  titulo: string
  corpo: string
  status: "open" | "resolved"
  pageX: number
  pageY: number
  criadoEm: number
  criadoPor: string
  fotos: number
  comentarios: number
  /** Nasceu neste aparelho e ainda não subiu. */
  local: boolean
}

/**
 * Um item da fila de envio.
 *
 * Cada linha é um fato, não um estado: ponto criado, comentário escrito,
 * condição mudada, foto anexada. É o mesmo formato que o servidor recebe, e
 * carregar o formato final desde aqui evita uma tradução no momento do envio,
 * que é o momento em que menos se quer lógica.
 */
export interface EventoFila {
  id: string
  obraId: string
  kind: "point.created" | "point.commented" | "point.status_changed"
    | "point.photo_attached" | "point.deleted"
  targetId: string
  payload: Record<string, unknown>
  /** Posição na fila deste aparelho. Monotônica, e é ela que dá a ordem. */
  deviceSeq: number
  occurredAt: string
  occurredOffsetMinutes: number
  estado: "pendente" | "enviando" | "enviado" | "recusado" | "bloqueado"
  motivo: string
  bloqueadoPor: string | null
  tentativas: number
  /**
   * O arquivo da foto, guardado no OPFS até subir. Some depois do envio: o
   * bucket passa a ser o dono, e manter cópia local seria pagar duas vezes pelo
   * mesmo byte no aparelho com menos espaço.
   */
  arquivoLocal: string | null
}


/**
 * Uma marcação guardada no aparelho.
 *
 * Só existe por causa do vínculo: sem rede, a prancha abria e o link não, porque
 * a marcação vinha da API a cada abertura de folha. O traço e o marca-texto vêm
 * junto porque moram na mesma tabela do servidor, e separá-los custaria uma
 * segunda chamada para guardar metade.
 */
export interface MarcaLocal {
  id: string
  planoId: string
  obraId: string
  /** Qual pasta trouxe esta marcação, para poder sair junto com ela. */
  pastaId: string
  tool: string
  color: string
  width: number
  opacity: number
  shared: boolean
  geometry: Record<string, unknown>
  createdAt: string
  /** O destino, quando é vínculo. Fora daqui é string vazia. */
  destinoPlanoId: string
}

class AtlasLocal extends Dexie {
  obras!: Table<ObraLocal, string>
  pastas!: Table<PastaLocal, string>
  planos!: Table<PlanoLocal, string>
  pontos!: Table<PontoLocal, string>
  fila!: Table<EventoFila, string>
  marcas!: Table<MarcaLocal, string>

  constructor() {
    super("atlas")
    // Os índices são declarados por consulta que a tela faz, e não por campo que
    // existe. Índice a mais custa escrita em todo sync, e o sync de um set de
    // 2.800 planos é a operação mais cara que este banco vê.
    this.version(1).stores({
      obras:  "id, selecionada, ultimoAcesso",
      pastas: "id, obraId, estado, [obraId+estado]",
      planos: "id, pastaId, obraId, sheetNumber, [obraId+sheetNumber]",
      pontos: "id, obraId, planoId, status, [obraId+status], numero",
      fila:   "id, obraId, estado, deviceSeq, [obraId+estado]",
    })
    // A tabela das marcações entrou depois. Dexie aplica só o que falta, e as
    // outras tabelas seguem como estão: quem já tinha pasta baixada não perde
    // nada, apenas passa a ter onde guardar o vínculo.
    this.version(2).stores({
      marcas: "id, planoId, pastaId, obraId, destinoPlanoId",
    })
  }
}

export const local = new AtlasLocal()

/**
 * O identificador deste aparelho.
 *
 * Precisa sobreviver a recarga e a fechar o app, e não precisa ser secreto: ele
 * só serve para ordenar a fila deste aparelho e para o servidor distinguir dois
 * iPads da mesma pessoa. `localStorage` basta, e é o único lugar do offline em
 * que ele é usado.
 */
export function deviceId(): string {
  if (typeof window === "undefined") return ""
  try {
    let id = localStorage.getItem("atlas.device")
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem("atlas.device", id)
    }
    return id
  } catch {
    // Janela privada, ou armazenamento bloqueado. Um id de sessão ainda permite
    // trabalhar; o que se perde é a continuidade da fila entre recargas, e isso
    // é melhor que não deixar a pessoa anotar nada.
    return crypto.randomUUID()
  }
}

/**
 * A próxima posição da fila deste aparelho.
 *
 * Monotônica e nunca reaproveitada, mesmo depois de um item ser enviado ou
 * recusado. É o que garante que a ordem dos fatos sobreviva ao relógio do
 * tablet, que mente.
 */
export async function proximaSeq(): Promise<number> {
  const ultimo = await local.fila.orderBy("deviceSeq").last()
  return (ultimo?.deviceSeq ?? 0) + 1
}
