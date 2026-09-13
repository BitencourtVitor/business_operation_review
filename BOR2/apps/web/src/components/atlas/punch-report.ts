"use client"

import { atlasService, type AtlasPunchMedia, type AtlasPunchPoint } from "@/services/atlas.service"

/**
 * O relatório do punch list.
 *
 * É o artefato que sai do sistema e vai parar na mão de quem não estava lá: o
 * cliente, o empreiteiro, o gerente que cobra na reunião de terça. Tudo o que o
 * Atlas registra existe para caber aqui.
 *
 * ── Onde o modelo se decide ──
 *
 * Em `public/modelos/punch-report.html`, um arquivo solto que não busca nada e
 * se abre no navegador com pontos de mentira. É lá que o desenho se mexe e se
 * olha, sem depender de obra, de sessão ou de rede; aqui é onde ele encontra os
 * dados. As classes são as mesmas nos dois lados, de propósito: a passagem de
 * um para o outro é cópia, e não tradução.
 *
 * ── A forma do ponto é a do leitor de prancha ──
 *
 * Quem registra o ponto o vê na janelinha sobre o desenho: número e condição do
 * lado de fora, e dentro um container com o escrito à esquerda e as fotos à
 * direita, assinado no pé por quem fez e quando. Aqui é o mesmo desenho, com
 * uma diferença: no leitor o problema e a solução são dois containers soltos, e
 * no papel eles são um só, partido por uma linha. São duas metades da mesma
 * história, e duas molduras seguidas gastavam meia folha a cada ponto.
 *
 * ── Por que imprimir em vez de montar um PDF ──
 *
 * O diálogo do navegador já pagina, já respeita a margem do aparelho, e já
 * oferece "salvar como PDF" em todos eles, iPad incluído. Uma biblioteca de PDF
 * somaria centenas de kB ao pacote de campo para reimplementar pior o que o
 * sistema faz de graça.
 */

export interface OpcoesRelatorio {
  jobsiteId: string
  jobsiteName: string
  /** Vazio traz a obra inteira; preenchido traz um escopo. */
  scope?: string
  /** Vazio traz tudo, resolvido ou não. */
  status?: "open" | "resolved"
}

/** Quantas fotos de cada fase entram no papel. Ver o comentário no modelo. */
const TETO_FOTOS = 4

/**
 * Os ícones, desenhados no próprio documento.
 *
 * São os mesmos traços do lucide, escritos à mão aqui porque a janela de
 * impressão é um documento à parte: ela não tem o React, não tem o pacote de
 * ícones, e não pode buscar nada na rede sem arriscar imprimir com buraco no
 * lugar do desenho.
 */
const ICONE: Record<string, string> = {
  cliente: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  lugar: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>',
  obra: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M9 12h12"/>',
  endereco: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  folha: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  bandeira: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  visto: '<path d="M20 6 9 17l-5-5"/>',
}

/**
 * O crachá de quem fez, o mesmo da tela de usuários e do leitor de prancha.
 *
 * Numa obra com subcontratado dentro, saber de que lado a pessoa está vale mais
 * que o nome dela: o desenho diz isso antes de a linha ser lida.
 */
const CARGO: Record<string, { desenho: string; classe: string }> = {
  dev: { desenho: '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>', classe: "dev" },
  owner: { desenho: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>', classe: "owner" },
  manager: { desenho: '<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>', classe: "manager" },
  subcontractor: { desenho: '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/>', classe: "sub" },
  user: { desenho: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', classe: "" },
}

const svg = (desenho: string, classe = "ic") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" class="${classe}">${desenho}</svg>`

const esc = (s: string) =>
  (s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!))

/** "September 12, 2026 at 9:41 AM": documento que sai da casa escreve por extenso. */
function carimbo(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const dia = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  const hora = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return `${dia} at ${hora}`
}

const dataCurta = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? "" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

/**
 * O nome do arquivo que o navegador vai sugerir ao salvar.
 *
 * Quem recebe guarda numa pasta com outras dezenas, e "documento.pdf" some
 * ali dentro. O nome carrega o que identifica a emissão: o que é, de quem, de
 * que trecho da obra, o que foi filtrado e de quando. A data vem ao contrário
 * (ano, mês, dia) porque é assim que a pasta se ordena sozinha pela data.
 *
 * As barras e os dois-pontos saem: o Windows não aceita no nome de arquivo.
 */
function nomeDoArquivo(partes: string[]): string {
  return partes
    .filter(Boolean)
    .map(t => t.replace(/[\\/:*?"<>|]/g, "-").trim())
    .join(" - ")
}

/** O rótulo do tipo de obra, o mesmo do cadastro. */
const TIPO: Record<string, string> = { building: "Building", house: "Lot", panels: "Panels" }

/** As imagens do relatório viram data URI: janela nova não herda sessão. */
async function embutir(url: string): Promise<string | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise<string | null>(resolve => {
      const fr = new FileReader()
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * O corpo do ponto, respeitando os tópicos.
 *
 * Descrição escrita em linhas que começam com traço, impressa como texto
 * corrido, vira um parágrafo com hífens no meio. Sendo lista de verdade, cada
 * tópico é uma linha que se lê de relance, que é o formato em que ele nasceu.
 */
function corpoDoPonto(texto: string): string {
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean)
  const topicos = linhas.filter(l => /^[-•*]\s+/.test(l))
  if (topicos.length < 2 || topicos.length !== linhas.length) {
    return `<p class="corpo">${esc(texto)}</p>`
  }
  return `<ul class="topicos">${
    topicos.map(l => `<li>${esc(l.replace(/^[-•*]\s+/, ""))}</li>`).join("")
  }</ul>`
}

/** A coluna de imagens de uma metade do ponto. */
function coluna(fotos: string[]): string {
  if (!fotos.length) return ""
  const classe = fotos.length === 1 ? "grade uma" : fotos.length === 2 ? "grade duas" : "grade"
  return `<div class="pecas"><div class="${classe}">${
    fotos.map(src => `<figure><img src="${src}" alt=""></figure>`).join("")
  }</div></div>`
}

/** Quem fez e quando, com o crachá do cargo na frente. */
function assinatura(nome: string, cargo: string, quando: string): string {
  const marca = CARGO[cargo] ?? CARGO.user
  const carimbado = carimbo(quando)
  if (!nome && !carimbado) return ""
  return `<span class="assina">${
    nome ? `${svg(marca.desenho, `cargo ${marca.classe}`)} ${esc(nome)}` : ""
  }${nome && carimbado ? " · " : ""}${carimbado}</span>`
}

export async function montarRelatorio(op: OpcoesRelatorio): Promise<string> {
  const filtro = { scope: op.scope || undefined, status: op.status }
  const [pontos, midias, obra, logo] = await Promise.all([
    atlasService.punchList(op.jobsiteId, filtro),
    atlasService.punchMedia(op.jobsiteId, filtro).catch(() => [] as AtlasPunchMedia[]),
    atlasService.getJobsite(op.jobsiteId).catch(() => null),
    embutir(new URL("/images/logo_black.png", window.location.origin).href),
  ])
  if (!pontos.length) return ""

  // As peças de cada ponto, separadas pelo que elas provam. Só as quatro
  // primeiras de cada fase entram: ver o porquê no modelo.
  const porPonto = new Map<string, { antes: AtlasPunchMedia[]; depois: AtlasPunchMedia[] }>()
  for (const m of midias) {
    if (!m.url || !m.contentType.startsWith("image/")) continue
    const par = porPonto.get(m.eventId) ?? { antes: [], depois: [] }
    ;(m.phase === "after" ? par.depois : par.antes).push(m)
    porPonto.set(m.eventId, par)
  }

  // As fotos entram embutidas. A janela do relatório é outro documento, e a URL
  // assinada nela vence em trinta minutos: impressa depois disso, a folha sairia
  // com o quadro vazio no lugar da prova.
  const escolhidas: AtlasPunchMedia[] = []
  for (const par of porPonto.values()) {
    escolhidas.push(...par.antes.slice(0, TETO_FOTOS), ...par.depois.slice(0, TETO_FOTOS))
  }
  const embutidas = new Map<string, string>()
  await Promise.all(escolhidas.map(async m => {
    const dado = await embutir(m.url)
    if (dado) embutidas.set(m.id, dado)
  }))

  const dataUri = (lista: AtlasPunchMedia[]) =>
    lista.slice(0, TETO_FOTOS).map(m => embutidas.get(m.id)).filter(Boolean) as string[]

  const blocos = pontos.map((p: AtlasPunchPoint) => {
    const par = porPonto.get(p.id) ?? { antes: [], depois: [] }

    // A solução aparece quando existe prova dela ou quando alguém marcou o
    // ponto como resolvido. Ponto pendente não ganha metade vazia.
    const temSolucao = par.depois.length > 0 || p.status === "resolved"
    // O que foi feito, escrito peça por peça na hora de documentar a correção.
    const oQueFoiFeito = par.depois
      .map(m => [m.title, m.description].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("\n")

    // Emitido para a obra inteira, cada ponto precisa dizer de que escopo é;
    // dentro de um escopo, isso já está dito no alto e aqui seria repetição.
    const escopo = !op.scope && (p.scopeValue || p.document)

    const solucao = temSolucao ? `
    <div class="metade solucao">
      <div class="escrito">
        <span class="rotulo">${svg(ICONE.visto)} Solution</span>
        ${oQueFoiFeito
          ? corpoDoPonto(oQueFoiFeito)
          : `<p class="corpo">Marked as resolved.</p>`}
        ${assinatura("", "", p.resolvedAt)}
      </div>
      ${coluna(dataUri(par.depois))}
    </div>` : ""

    return `
  <section class="ponto">
    <div class="etiqueta">
      <span class="numero"><i>#</i>${p.number ?? "-"}</span>
      <span class="cond ${p.status === "resolved" ? "resolved" : "open"}">${
        p.status === "resolved" ? "Resolved" : "Pending"
      }</span>
      <span class="onde">
        <span>${svg(ICONE.folha)}<span class="folha">${
          esc(p.sheetNumber || `p. ${p.pageIndex + 1}`)
        }</span></span>
        ${escopo ? `<span>${svg(ICONE.obra)}${esc(escopo)}</span>` : ""}
      </span>
    </div>

    <div class="caixa">
      <div class="metade">
        <div class="escrito">
          <span class="rotulo">${svg(ICONE.bandeira)} Problem</span>
          <h2>${esc(p.title || p.body.slice(0, 80) || "Untitled")}</h2>
          ${p.body && p.title ? corpoDoPonto(p.body) : ""}
          ${assinatura(p.createdName, p.createdRole, p.createdAt)}
        </div>
        ${coluna(dataUri(par.antes))}
      </div>${solucao}
    </div>
  </section>`
  }).join("")

  const tipo = op.status === "open"
    ? { classe: "tipo aberto", rotulo: "Pending points" }
    : op.status === "resolved"
      ? { classe: "tipo feito", rotulo: "Resolved points" }
      : { classe: "tipo", rotulo: "All points" }

  const emitido = dataCurta(new Date().toISOString())
  const escopo = op.scope || "Whole job"
  const cliente = obra?.client || ""
  const lugar = obra?.community || ""
  const nomeDaObra = [TIPO[obra?.kind ?? ""] ?? "", obra?.unit || obra?.code || ""]
    .filter(Boolean).join(" ") || op.jobsiteName
  const endereco = obra?.address || ""

  // A data em ISO no nome do arquivo, e por extenso no documento.
  const nome = nomeDoArquivo([
    "Punch List Report",
    cliente || op.jobsiteName,
    op.scope || "",
    tipo.rotulo,
    new Date().toISOString().slice(0, 10),
  ])

  const fato = (icone: string, valor: string) =>
    valor ? `<span>${svg(ICONE[icone])}${esc(valor)}</span>` : ""

  const rodape = `
  <footer class="folha">
    ${logo ? `<span class="marca"><img src="${logo}" alt="Premium Group"></span>` : ""}
    <span class="dados">
      ${cliente ? `<span class="obra">${esc(cliente)}</span>` : ""}
      ${lugar ? `<span>${esc(lugar)}</span>` : ""}
      ${nomeDaObra ? `<span>${esc(nomeDaObra)}</span>` : ""}
      ${endereco ? `<span>${esc(endereco)}</span>` : ""}
    </span>
    <span class="doc">${emitido} · <b class="pag"></b></span>
  </footer>`

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(nome)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; color: #18181b;
    font: 11px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    background: #fff;
  }
  .ic { width: 11px; height: 11px; flex: none; }

  /* ── O rodapé, que se repete em toda folha ──────────────────────────── */

  /* Ele leva a obra inteira, e não só o nome dela: a folha viaja solta, sai do
     e-mail, é impressa, vai para a prancheta e chega na mão de quem não abriu o
     Atlas. Ali, o nome do cliente não diz qual das obras dele é, nem para onde
     ir. Cliente, cidade, obra e endereço juntos dizem, e é a mesma
     identificação que a sala da obra usa na tela. */
  footer.folha {
    position: static;
    /* Tudo alinhado pela base: a logo tem uma altura, o texto tem outra, e
       centradas as duas ficavam boiando cada uma no seu meio. */
    display: flex; align-items: flex-end; gap: 10px;
    padding-top: 5px; border-top: 1px solid #e4e4e7;
    color: #71717a; font-size: 8.5px; line-height: 1.45;
  }
  footer.folha .marca { display: flex; align-items: flex-end; flex: none; }
  footer.folha img { height: 12px; }
  footer.folha .dados { display: flex; flex-wrap: wrap; gap: 2px 10px; min-width: 0; }
  footer.folha .dados span { display: flex; align-items: flex-end; gap: 4px; }
  footer.folha .obra { font-weight: 600; color: #18181b; }
  footer.folha .doc { margin-left: auto; text-align: right; white-space: nowrap; }

  /* ── A capa da primeira folha ───────────────────────────────────────── */

  /* A empresa se apresenta uma vez, no alto da primeira folha, dentro de uma
     moldura como a dos pontos: no papel tudo o que é um assunto fechado mora
     dentro de um container, e quem manda o documento é um assunto. */
  .timbre {
    display: flex; align-items: center; justify-content: space-between;
    gap: 20px; border: 1px solid #d4d4d8; border-radius: 8px; padding: 12px 14px;
  }
  .timbre .logo { height: 30px; }
  .timbre .empresa { text-align: right; font-size: 9.5px; line-height: 1.55; color: #52525b; }
  .timbre .empresa b { display: block; font-size: 12px; color: #18181b; }

  .titulo {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 20px; margin: 12px 0 10px;
  }
  .titulo .nome { display: flex; flex-direction: column; gap: 1px; }
  .titulo h1 { margin: 0; font-size: 20px; letter-spacing: -.015em; line-height: 1.15; }
  .titulo .sub { font-size: 11.5px; color: #71717a; }
  .titulo .campos { display: flex; gap: 22px; }
  .titulo .campo { display: flex; flex-direction: column; gap: 1px; }
  .titulo .campo i {
    font-style: normal; font-size: 8px; text-transform: uppercase;
    letter-spacing: .09em; color: #a1a1aa;
  }
  .titulo .campo b { font-size: 10.5px; font-weight: 600; }

  /* A identidade da obra, igual à da sala da obra no sistema: cliente, obra e
     tipo de um lado, endereço do outro, com um fio entre eles. Repetir o
     desenho poupa a quem conhece um dos dois de aprender o outro. */
  .obra-ident {
    display: flex; align-items: stretch;
    border: 1px solid #e4e4e7; border-radius: 8px; overflow: hidden;
    color: #52525b; font-size: 10px; margin-bottom: 10px;
  }
  .obra-ident .fatos {
    flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 7px 10px;
  }
  .obra-ident .endereco {
    max-width: 50%; display: flex; align-items: center;
    padding: 7px 10px; border-left: 1px solid #e4e4e7; background: #fafafa;
  }
  .obra-ident span { display: flex; align-items: center; gap: 5px; }

  /* O tipo do relatório, dito antes do primeiro ponto. São três emissões
     possíveis e elas saem com a mesma cara: sem esta linha, quem recebe a lista
     dos pendentes acha que são todos os pontos da obra, e quem recebe a dos
     resolvidos acha que não sobrou nada. */
  .tipo {
    display: flex; align-items: center; gap: 8px;
    margin: 14px 0 10px; color: #52525b;
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em;
  }
  .tipo::after { content: ""; flex: 1; height: 1px; background: #d4d4d8; }
  .tipo.aberto { color: #b45309; }
  .tipo.aberto::after { background: #fcd34d; }
  .tipo.feito { color: #047857; }
  .tipo.feito::after { background: #6ee7b7; }

  /* ── O ponto ────────────────────────────────────────────────────────── */

  /* Um ponto nunca é cortado entre páginas: metade numa folha e metade na
     outra torna o documento inútil para conferir em obra. Não cabendo no que
     resta da folha, ele desce inteiro para a próxima, e o branco que fica é o
     preço de não partir o assunto no meio. */
  .ponto { break-inside: avoid; page-break-inside: avoid; margin-bottom: 18px; }
  .etiqueta { break-after: avoid; page-break-after: avoid; }
  .caixa, .metade { break-inside: avoid; page-break-inside: avoid; }

  /* Número, condição e folha: do lado de fora da moldura, como na janelinha do
     leitor. São a etiqueta do ponto, não conteúdo dele. */
  .etiqueta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .etiqueta .numero {
    font-size: 15px; font-weight: 700; line-height: 1; color: #18181b;
    font-variant-numeric: tabular-nums; letter-spacing: -.02em;
  }
  .etiqueta .numero i { font-style: normal; color: #a1a1aa; font-weight: 600; }
  .etiqueta .cond {
    font-size: 8px; text-transform: uppercase; letter-spacing: .07em; font-weight: 600;
    border: 1px solid; border-radius: 999px; padding: 2px 7px; white-space: nowrap;
  }
  .etiqueta .cond.open { color: #b45309; border-color: #fcd34d; background: #fffbeb; }
  .etiqueta .cond.resolved { color: #047857; border-color: #6ee7b7; background: #ecfdf5; }
  /* A folha é o que o empreiteiro procura primeiro, para saber em que prancha
     ele vai olhar: vem no tamanho do texto corrido e em negrito, com o ícone
     cinza para o olho cair na palavra e não no desenho. */
  .etiqueta .onde {
    margin-left: auto; display: flex; gap: 14px; color: #3f3f46; font-size: 10.5px;
  }
  .etiqueta .onde span { display: flex; align-items: center; gap: 5px; }
  .etiqueta .onde .folha { font-weight: 600; color: #18181b; }
  .etiqueta .onde .ic { width: 12px; height: 12px; color: #a1a1aa; }

  .caixa { border: 1px solid #d4d4d8; border-radius: 8px; overflow: hidden; }

  /* Problema e solução: as duas metades da mesma história, separadas por uma
     linha e não por duas molduras. */
  .metade { display: flex; gap: 10px; padding: 10px; min-height: 104px; }
  .metade + .metade { border-top: 1px solid #e4e4e7; background: #fafafa; }
  .metade .escrito { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }

  .rotulo {
    display: flex; align-items: center; gap: 5px;
    font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em;
    color: #a1a1aa;
  }
  .metade.solucao .rotulo { color: #047857; }

  .metade h2 { margin: 0; font-size: 12.5px; font-weight: 600; line-height: 1.35; }
  .corpo { margin: 0; white-space: pre-wrap; }
  .topicos { margin: 0; padding-left: 15px; }
  .topicos li { margin-bottom: 2px; }

  /* A assinatura fecha o bloco embaixo, encostada no pé, mesmo quando a coluna
     das fotos é mais alta que a do texto. */
  .assina {
    margin-top: auto; padding-top: 6px;
    display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
    color: #71717a; font-size: 9px;
  }
  /* O cargo é o ícone, e não uma etiqueta escrita: é o mesmo crachá da tela de
     usuários e do leitor de prancha. */
  .assina .cargo { width: 11px; height: 11px; flex: none; }
  .assina .cargo.dev { color: #ca8a04; }
  .assina .cargo.owner { color: #047857; }
  .assina .cargo.manager { color: #2563eb; }
  .assina .cargo.sub { color: #dc2626; }

  /* ── As imagens do ponto ────────────────────────────────────────────── */

  /* Quatro fotos, e não mais. Um ponto de obra tem duas ou três; quem tira
     vinte está documentando uma reforma inteira. O resto se vê no Atlas, e não
     há aviso do que ficou de fora: no papel não se abre foto nenhuma, e um selo
     de "+3" diria um número que quem lê não pode usar. */
  .pecas { width: 150px; flex: none; display: flex; flex-direction: column; gap: 4px; }
  .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .grade figure { margin: 0; }
  .grade img {
    display: block; width: 100%; height: 52px; object-fit: cover;
    border-radius: 4px; border: 1px solid #e4e4e7; background: #fafafa;
  }
  /* Uma ou duas fotos crescem para encher a coluna: em meia altura elas somem
     no meio do branco, e a metade fica com cara de vazia. */
  .grade.uma { grid-template-columns: 1fr; }
  .grade.uma img { height: 108px; }
  .grade.duas img { height: 108px; }

  /* ── A folha ────────────────────────────────────────────────────────── */

  /* Cada folha é uma página de papel, com o mesmo recheio que a impressão vai
     ter: a área útil é a folha menos as margens, e é por isso que o padding
     daqui e a margem do @page dizem o mesmo número. */
  .pagina {
    width: 210mm; height: 297mm; padding: 10mm;
    display: flex; flex-direction: column;
    background: #fff; margin: 0 auto 18px;
    box-shadow: 0 2px 14px rgba(0,0,0,.18);
  }
  .pagina .conteudo { flex: 1; min-height: 0; overflow: hidden; }
  .pagina footer.folha { margin-top: auto; }

  @media screen { body { background: #d4d4d8; padding: 18px 0; } }
  @media print {
    /* Na impressão a margem é do papel, e a folha deixa de ter a dela: o
       tamanho já vem do @page, e repetir o padding aqui daria margem dobrada. */
    @page { margin: 10mm; }
    /* A folha continua sendo uma folha: a altura é a da página menos as
       margens (297 menos dois de dez), e não "o que o conteúdo pedir". Com
       altura automática o rodapé colava no fim do último ponto e o resto do
       papel ficava em branco embaixo dele. */
    .pagina {
      width: auto; height: 277mm; min-height: 0; padding: 0; margin: 0;
      box-shadow: none; break-after: page; page-break-after: always;
    }
    .pagina:last-child { break-after: auto; page-break-after: auto; }
    .pagina .conteudo { overflow: visible; }
  }
</style></head><body>
<div id="doc">

<div class="timbre">
  ${logo ? `<img class="logo" src="${logo}" alt="Premium Group">` : "<span></span>"}
  <div class="empresa">
    <b>Premium Group</b>
    1B Landing Lane, Hopedale, MA 01747<br>
    (774) 804 3190 · info@premiumgrpinc.com<br>
    premiumgrpinc.com
  </div>
</div>

<div class="titulo">
  <span class="nome">
    <h1>Punch List Report</h1>
    <span class="sub">Findings and corrective actions</span>
  </span>
  <div class="campos">
    <span class="campo"><i>Scope</i><b>${esc(escopo)}</b></span>
    <span class="campo"><i>Issued</i><b>${emitido}</b></span>
  </div>
</div>

<div class="obra-ident">
  <div class="fatos">
    ${fato("cliente", cliente)}
    ${fato("lugar", lugar)}
    ${fato("obra", nomeDaObra)}
  </div>
  ${endereco ? `<div class="endereco">${fato("endereco", endereco)}</div>` : ""}
</div>

<div class="${tipo.classe}">${tipo.rotulo}</div>
${blocos}

</div>

<template id="rodape">${rodape}</template>

<script>
/**
 * A paginação.
 *
 * Deixado ao navegador, o corte em folhas acontece só na hora de imprimir, e
 * com ele não há como numerar a página nem repetir o rodapé no pé de cada uma:
 * elemento fixo não conta folha, e as caixas de margem do @page o Chrome ignora.
 *
 * Então o corte é feito antes, aqui: as peças entram numa folha de tamanho de
 * papel, uma por vez, e a folha fecha quando a próxima não cabe. Cada uma
 * termina com o rodapé e com uma quebra de página de verdade, então o que se vê
 * na tela é o que sai na impressora.
 */
;(function paginar() {
  var doc = document.getElementById("doc")
  var molde = document.getElementById("rodape")
  var pecas = Array.prototype.slice.call(doc.children)
  doc.innerHTML = ""

  var dentro = null
  function novaFolha() {
    var folha = document.createElement("div")
    folha.className = "pagina"
    dentro = document.createElement("div")
    dentro.className = "conteudo"
    folha.appendChild(dentro)
    folha.appendChild(molde.content.cloneNode(true))
    doc.appendChild(folha)
  }

  novaFolha()
  pecas.forEach(function (peca) {
    dentro.appendChild(peca)
    // Não coube: a peça desce inteira para a folha seguinte. Numa folha recém
    // aberta não há para onde descer, e ela fica mesmo estourando.
    if (dentro.scrollHeight > dentro.clientHeight + 1 && dentro.children.length > 1) {
      dentro.removeChild(peca)
      novaFolha()
      dentro.appendChild(peca)
    }
  })

  var folhas = doc.querySelectorAll(".pagina")
  Array.prototype.forEach.call(folhas, function (f, i) {
    f.querySelector(".pag").textContent = "Page " + (i + 1) + " of " + folhas.length
  })
})()
</script>
</body></html>`
}

/**
 * Emite o relatório: monta o documento e abre o diálogo de impressão.
 *
 * ── Por que não uma janela nova ──
 *
 * Era `window.open`, e bastava um bloqueador de pop-up para o relatório sumir
 * sem dizer nada: a janela vinha nula, a função voltava em silêncio, e quem
 * clicou ficava olhando para a tela achando que o botão estava quebrado. E o
 * bloqueio é o normal, não a exceção: navegador de empresa costuma vir assim.
 *
 * Agora o documento entra num quadro escondido da própria página e é ele que
 * manda imprimir. Nada de janela, nada de permissão, e de dentro do diálogo o
 * "salvar como PDF" continua sendo o caminho de sempre.
 *
 * O quadro precisa ter tamanho de folha de verdade, e não zero: o documento se
 * pagina medindo a si mesmo, e num quadro sem largura ele não teria onde caber.
 * Fica fora da tela, à esquerda, onde ninguém o vê.
 */
export async function gerarRelatorio(op: OpcoesRelatorio): Promise<void> {
  const html = await montarRelatorio(op)
  if (!html) return

  // O nome do arquivo sai do título do documento. Imprimindo de um quadro de
  // dentro, o Chrome ora usa o título do quadro, ora o da página que o hospeda,
  // então os dois recebem o mesmo nome e o de fora volta ao que era depois.
  const nome = (html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? "Punch List Report"
  const tituloDaPagina = document.title
  document.title = nome

  const endereco = URL.createObjectURL(new Blob([html], { type: "text/html" }))
  const quadro = document.createElement("iframe")
  quadro.setAttribute("aria-hidden", "true")
  quadro.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0"
  quadro.src = endereco

  quadro.onload = () => {
    // O `onload` espera as imagens entrarem. Chamar `print` antes deixaria o
    // documento sair com os quadros em branco, que é justamente a parte que ele
    // existe para mostrar.
    quadro.contentWindow?.focus()
    quadro.contentWindow?.print()
    // A limpeza espera o diálogo: tirar o quadro antes de a impressão sair
    // cancela o trabalho no meio.
    setTimeout(() => {
      document.title = tituloDaPagina
      quadro.remove()
      URL.revokeObjectURL(endereco)
    }, 60_000)
  }

  document.body.appendChild(quadro)
}
