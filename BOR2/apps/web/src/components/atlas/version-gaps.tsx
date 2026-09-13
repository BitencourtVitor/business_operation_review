"use client"

import { RoleName } from "@/components/atlas/role-icon"
import { useAtlasThumbs } from "@/hooks/use-atlas"
import { atlasService, type AtlasVersion } from "@/services/atlas.service"
import { ImageWindow } from "@/components/atlas/image-window"
import { urlLocalDaMidia } from "@/lib/offline/dados-da-obra"
import { useQueries } from "@tanstack/react-query"
import { createPortal } from "react-dom"
import { BadgeCheck, ChevronDown, FileText, FileX2, Images, Layers, MessageSquareText, Replace } from "lucide-react"
import { useState } from "react"

/**
 * O que cada versão do set mudou, e por quê.
 *
 * A janela de versões nasceu para documentar a mudança, e mostrava só datas:
 * "09/11 23:17, 97 plans" e "09/11 23:15, 97 plans", duas cópias do mesmo
 * caderno sem nada dizendo o que separa uma da outra. Abrir o caderno antigo não
 * é o que se procura aqui. O que se procura é o gap: quais folhas mudaram, o
 * motivo e as fotos que o justificam.
 */
export function VersionGaps({ versions, expandida: inicial, onOpenSheet }: {
  versions: AtlasVersion[]
  /** A versão que já vem aberta: a de onde a pessoa saiu para ver uma folha. */
  expandida?: string
  /** Abrir uma folha que mudou, na versão em que ela mudou. */
  onOpenSheet: (versionId: string, sheetId: string) => void
}) {
  // Tocar numa versão abre os dados dela aqui mesmo. Trocar a grade de versão e
  // fechar a janela era o comportamento antigo, e tirava a pessoa justamente do
  // lugar onde ela estava comparando uma versão com a outra. Abre tudo fechado:
  // a lista é para escolher, e só volta aberta a versão de onde a pessoa saiu.
  const [expandida, setExpandida] = useState(inicial ?? "")
  return (
    <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
      {versions.map((v, i) => (
        <Versao
          key={v.id}
          v={v}
          atual={i === 0}
          aberta={v.id === expandida}
          onToggle={() => setExpandida(e => (e === v.id ? "" : v.id))}
          onOpenSheet={sheetId => onOpenSheet(v.id, sheetId)}
        />
      ))}
    </div>
  )
}

function Versao({ v, atual, aberta, onToggle, onOpenSheet }: {
  v: AtlasVersion
  atual: boolean
  /** Expandida: mostra o porquê, as fotos e as folhas que mudaram. */
  aberta: boolean
  onToggle: () => void
  onOpenSheet: (sheetId: string) => void
}) {
  const gap = v.gap
  const mudaram = gap?.changed ?? []
  // Miniatura só quando o gap é um punhado: com o caderno inteiro trocado, 97
  // quadros não mostram diferença nenhuma, e a lista de nomes já basta.
  const comMiniatura = mudaram.length > 0 && mudaram.length <= 12

  // As fotos da justificativa abrem na mesma galeria do ponto do punch: a foto
  // grande, com a fita das outras no rodapé para andar entre elas.
  const urls = useQueries({
    queries: (v.attachments ?? []).map(a => ({
      queryKey: ["atlas", "media-url", a.id],
      // Sem rede, o anexo guardado no aparelho.
      networkMode: "always" as const,
      queryFn: async () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) return urlLocalDaMidia(a.id)
        return (await atlasService.mediaUrl(a.id)).url
      },
      staleTime: 20 * 60 * 1000,
      enabled: aberta,
    })),
  })
  const anexos = (v.attachments ?? []).map((a, i) => ({ ...a, url: urls[i]?.data ?? "" }))
  const fotos = anexos.filter(a => a.contentType.startsWith("image/") && a.url)
  const [galeria, setGaleria] = useState<number | null>(null)
  const { data: thumbs } = useAtlasThumbs(comMiniatura && aberta ? v.id : "")

  return (
    <div className={`flex flex-col rounded-lg border transition-colors ${
      aberta ? "border-primary/50 bg-primary/5" : "border-border/60 hover:border-primary/30"
    }`}>
      {/* Fechada, a versão diz quando, quem e o tamanho do gap: é o bastante
          para achar a que se procura sem abrir todas. */}
      <button type="button" onClick={onToggle} aria-expanded={aberta}
        className="flex flex-col gap-1.5 p-3 text-left">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{stamp(v.uploadedAt)}</span>
          {v.uploaderName && (
            <>
              <span aria-hidden="true">·</span>
              <RoleName name={v.uploaderName} role={v.uploaderRole} />
            </>
          )}
          <span className="ml-auto flex items-center gap-2">
            {atual && (
              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                <BadgeCheck className="h-3 w-3" />
                Current
              </span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${aberta ? "rotate-180" : ""}`} />
          </span>
        </span>
        {v.name && <span className="text-sm font-medium leading-snug">{v.name}</span>}
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {gap?.kind === "first" ? <Layers className="h-3.5 w-3.5" /> : <Replace className="h-3.5 w-3.5" />}
          {resumo(v)}
        </span>
      </button>

      {/* Abre e fecha deslizando: a altura anima pela linha da grade, que vai
          de 0fr a 1fr sem precisar medir o conteúdo. */}
      <div inert={!aberta} className={`grid transition-[grid-template-rows] duration-200 ease-out ${aberta ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
      <div className="min-h-0 overflow-hidden">
      <div className={`flex flex-col gap-2.5 border-t border-border/50 p-3 transition-opacity duration-200 ${aberta ? "opacity-100" : "opacity-0"}`}>
      {/* A justificativa com as quebras que quem escreveu deu: cortá-la numa
          linha faria a segunda frase sumir junto com o motivo. */}
      {v.notes ? (
        <Secao icone={MessageSquareText} rotulo="Why it changed">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{v.notes}</p>
        </Secao>
      ) : gap?.kind !== "first" ? (
        <p className="text-xs italic text-muted-foreground">No reason was written for this version.</p>
      ) : !v.attachments?.length ? (
        <p className="text-xs text-muted-foreground">The first plan set uploaded to this folder.</p>
      ) : null}

      {/* As fotos são da justificativa, e as folhas são o que mudou no set. Lado
          a lado as duas viravam uma fileira só de quadradinhos, e não se sabia
          o que era prova e o que era prancha. Cada uma no seu bloco, com nome. */}
      {!!v.attachments?.length && (
        <Secao icone={Images} rotulo="Photos">
          <div className="flex flex-wrap gap-2">
            {anexos.map(a => (
              <Anexo key={a.id} anexo={a} onAbrir={() => {
                const i = fotos.findIndex(f => f.id === a.id)
                if (i >= 0) setGaleria(i)
                else if (a.url) window.open(a.url, "_blank", "noopener")
              }} />
            ))}
          </div>
        </Secao>
      )}

      {(mudaram.length > 0 || !!gap?.removed?.length) && (
      <Secao icone={Replace} rotulo="Changed sheets" separada>
        {comMiniatura ? (
          <div className="flex flex-wrap gap-2">
            {mudaram.map(f => (
              <button
                key={f.sheetId}
                type="button"
                onClick={() => onOpenSheet(f.sheetId)}
                title="Open this sheet"
                className="flex w-24 flex-col gap-1 rounded-md border border-border/60 p-1 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
              >
                <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded bg-muted/40">
                  {thumbs?.get(f.sheetId) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs.get(f.sheetId)} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground/50" />
                  )}
                </span>
                <span className="truncate px-0.5 text-[11px] font-medium">
                  {f.sheetNumber || `Page ${f.pageIndex + 1}`}
                </span>
              </button>
            ))}
          </div>
        ) : mudaram.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {mudaram.map(f => (
              <button
                key={f.sheetId}
                type="button"
                onClick={() => onOpenSheet(f.sheetId)}
                className="rounded-md border border-border/60 px-1.5 py-0.5 text-[11px] transition-colors hover:border-primary/40 hover:bg-accent/30"
              >
                {f.sheetNumber || `Page ${f.pageIndex + 1}`}
              </button>
            ))}
          </div>
        )}

        {!!gap?.removed?.length && (
          <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            <FileX2 className="h-3.5 w-3.5" />
            Removed:
            {gap.removed.map(n => (
              <span key={n} className="rounded-md bg-muted px-1.5 py-0.5 line-through">{n}</span>
            ))}
          </p>
        )}
      </Secao>
      )}
      </div>
      </div>
      </div>
      {galeria !== null && fotos[galeria] && createPortal(
        <ImageWindow
          url={fotos[galeria].url}
          name={fotos[galeria].fileName}
          pecas={fotos.map(f => ({ url: f.url, name: f.fileName }))}
          inicial={galeria}
          onClose={() => setGaleria(null)}
        />,
        document.body,
      )}
    </div>
  )
}

/** Um bloco da versão aberta, com o nome do que ele guarda. */
function Secao({ icone: Icone, rotulo, separada, children }: {
  icone: React.ElementType
  rotulo: string
  /** Com linha em cima: separa o que mudou no set do que justifica a troca. */
  separada?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-2 ${separada ? "border-t border-border/50 pt-2.5" : ""}`}>
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icone className="h-3.5 w-3.5" />
        {rotulo}
      </span>
      {children}
    </div>
  )
}

/** A frase do gap, do jeito que se fala. */
function resumo(v: AtlasVersion): string {
  const total = `${v.sheets} ${v.sheets === 1 ? "plan" : "plans"}`
  const gap = v.gap
  if (!gap || gap.kind === "first") return `First upload · ${total}`
  const n = gap.changed.length
  if (gap.kind === "partial") {
    return `${n} of ${v.sheets} ${v.sheets === 1 ? "plan" : "plans"} replaced`
  }
  // Set inteiro: a comparação folha a folha diz o que de fato mudou.
  if (!gap.compared) return `Whole set replaced · ${total}`
  if (n === 0 && !gap.removed.length) return `Whole set uploaded again · no sheet changed`
  if (n === v.sheets) return `Whole set uploaded · all ${total} changed`
  return `Whole set uploaded · ${n} of ${total} changed`
}

/** A foto ou o arquivo que justifica a troca. */
function Anexo({ anexo, onAbrir }: {
  anexo: { id: string; fileName: string; contentType: string; url: string }
  onAbrir: () => void
}) {
  const imagem = anexo.contentType.startsWith("image/")
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={anexo.fileName}
      className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30 transition-colors hover:border-primary/40"
    >
      {imagem && anexo.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={anexo.url} alt={anexo.fileName} className="h-full w-full object-cover" />
      ) : (
        <span className="flex flex-col items-center gap-1 px-1 text-muted-foreground">
          <FileText className="h-5 w-5" />
          <span className="w-full truncate text-center text-[10px] leading-tight">{anexo.fileName}</span>
        </span>
      )}
    </button>
  )
}

/** "09/04/2026 14:32": o que identifica uma versão. */
function stamp(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
