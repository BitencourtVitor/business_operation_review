"use client"

/**
 * A gravação de campo virando um arquivo que todo mundo aceita.
 *
 * O navegador grava no formato que ele quiser: o Chrome entrega WebM com Opus, o
 * Safari do iPhone entrega MP4 com AAC, e nenhum dos dois é aceito pela
 * transcrição. Converter no servidor exigiria ffmpeg num serviço que hoje não
 * tem binário nenhum; converter aqui é uma conta que o próprio navegador já sabe
 * fazer, porque ele precisa decodificar o som de qualquer jeito para tocá-lo.
 *
 * O destino é sempre o mesmo: WAV PCM de 16 bits, 16 kHz, mono.
 *
 *   - **16 kHz** porque é a taxa que os modelos de fala usam internamente.
 *     Mandar 48 kHz é subir três vezes mais bytes pela rede de obra para o outro
 *     lado jogar dois terços fora.
 *   - **Mono** porque a fala de uma pessoa não tem estéreo, e o segundo canal é
 *     o mesmo dado de novo.
 *   - **PCM** porque é o formato que não precisa de codec: são as amostras, uma
 *     atrás da outra, com um cabeçalho de 44 bytes.
 *
 * Um minuto de fala sai com cerca de 1,9 MB, que é o que um aparelho de campo
 * consegue subir sem drama.
 */

const TAXA = 16000

/** Converte o que o navegador gravou em WAV de 16 kHz mono. */
export async function paraWav(gravado: Blob): Promise<Blob> {
  const bytes = await gravado.arrayBuffer()

  // O AudioContext de decodificação usa a taxa nativa do aparelho; a conversão
  // para 16 kHz é feita logo abaixo, pelo OfflineAudioContext, que é quem sabe
  // reamostrar sem serrilhar o som.
  const ctx = new AudioContext()
  let bruto: AudioBuffer
  try {
    bruto = await ctx.decodeAudioData(bytes)
  } finally {
    void ctx.close()
  }

  const quadros = Math.max(1, Math.round(bruto.duration * TAXA))
  const offline = new OfflineAudioContext(1, quadros, TAXA)
  const fonte = offline.createBufferSource()
  fonte.buffer = bruto
  fonte.connect(offline.destination)
  fonte.start()
  const pronto = await offline.startRendering()

  return codificar(pronto.getChannelData(0))
}

/** O cabeçalho de 44 bytes e as amostras, em PCM de 16 bits. */
function codificar(amostras: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + amostras.length * 2)
  const v = new DataView(buffer)

  const texto = (pos: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i))
  }

  texto(0, "RIFF")
  v.setUint32(4, 36 + amostras.length * 2, true)
  texto(8, "WAVE")
  texto(12, "fmt ")
  v.setUint32(16, 16, true)          // tamanho do bloco de formato
  v.setUint16(20, 1, true)           // 1 = PCM sem compressão
  v.setUint16(22, 1, true)           // canais
  v.setUint32(24, TAXA, true)
  v.setUint32(28, TAXA * 2, true)    // bytes por segundo
  v.setUint16(32, 2, true)           // bytes por quadro
  v.setUint16(34, 16, true)          // bits por amostra
  texto(36, "data")
  v.setUint32(40, amostras.length * 2, true)

  // O sinal chega entre -1 e 1 e sai como inteiro de 16 bits. O corte nas duas
  // pontas não é zelo: som gravado perto da boca estoura o limite, e sem o corte
  // a amostra dá a volta e vira um estalo alto no meio da palavra.
  let pos = 44
  for (let i = 0; i < amostras.length; i++, pos += 2) {
    const a = Math.max(-1, Math.min(1, amostras[i]))
    v.setInt16(pos, a < 0 ? a * 0x8000 : a * 0x7fff, true)
  }

  return new Blob([buffer], { type: "audio/wav" })
}

/** Se este navegador grava som. Aparelho antigo simplesmente não oferece. */
export function gravacaoDisponivel(): boolean {
  return typeof navigator !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== "undefined"
    && typeof AudioContext !== "undefined"
}
