"use client"

import { ListTree, Plus, Tag, Trash2 } from "lucide-react"
import { useMemo } from "react"

import { CLOSED_TAXONOMY } from "@/components/atlas/jobsite-form-dialog"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { useAtlasDocCategories } from "@/hooks/use-atlas"

import type { AtlasDocCategory } from "@/services/atlas.service"

/**
 * A categoria de uma pasta, escolhida junto com a pasta.
 *
 * A pasta é a dona da categoria, e não o contrário. Não se cadastra categoria na
 * obra para depois pendurar a pasta nela: sobe a pasta com os planos e diz o que
 * ela é. Por isso as opções vêm da taxonomia do tipo de obra, e não das pastas
 * que a obra já tem.
 *
 * Cada linha são duas metades de um campo só: a categoria e, quando ela tem
 * andar ou unidade, o valor. A metade do valor fica apagada enquanto a
 * categoria não pede um. Um set que cobre o 3º e o 4º andar é uma pasta com duas
 * linhas.
 *
 * Cada vaga (categoria com subcategoria) tem um documento só na obra. A vaga que
 * já tem dono aparece apagada como "in use": para trocar o conteúdo, abre o
 * documento que a ocupa e sobe nova versão. Esconder a opção faria a pessoa
 * achar que a categoria sumiu.
 */

/** Uma linha do seletor. Categoria nula é a linha ainda vazia. */
export type LinhaCategoria = { categoryId: number | null; subcategory: string }

export const LINHA_VAZIA: LinhaCategoria = { categoryId: null, subcategory: "" }

/** As categorias que valem para a obra, pelo cliente e pelo tipo de obra. */
export function useCategoriasDaObra(client: string, kind: string): AtlasDocCategory[] {
  const { data: categorias = [] } = useAtlasDocCategories()
  return useMemo(() => {
    // Tipo fechado só enxerga o que é dele; os demais somam as categorias sem
    // tipo, que valem para qualquer obra.
    const fechado = CLOSED_TAXONOMY.has(kind.toLowerCase())
    return categorias
      .filter(c => !c.client || c.client.toLowerCase() === client.toLowerCase())
      .filter(c => fechado
        ? c.buildType.toLowerCase() === kind.toLowerCase()
        : !c.buildType || c.buildType.toLowerCase() === kind.toLowerCase())
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  }, [categorias, client, kind])
}

/** Os valores de eixo que a categoria admite. */
function valoresDe(c: AtlasDocCategory | undefined): string[] {
  if (!c || c.axis === "none") return []
  return c.axisValues?.length ? c.axisValues : (c.subcategories ?? [])
}

function rotuloDoValor(c: AtlasDocCategory | undefined, valor: string) {
  if (!valor) return ""
  return c?.axis === "unit" ? `${valor} Unit` : `${valor} Floor`
}

/**
 * As linhas completas viram etiquetas. Completa é a que tem categoria e, se a
 * categoria pede andar ou unidade, o valor escolhido.
 */
export function paraEtiquetas(linhas: LinhaCategoria[], categorias: AtlasDocCategory[]) {
  const vistos = new Set<string>()
  const etiquetas: { categoryId: number; subcategory: string }[] = []
  let incompleta = false
  for (const l of linhas) {
    if (l.categoryId === null) continue
    const c = categorias.find(x => x.id === l.categoryId)
    if (valoresDe(c).length > 0 && !l.subcategory) { incompleta = true; continue }
    const chave = `${l.categoryId}:${l.subcategory}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    etiquetas.push({ categoryId: l.categoryId, subcategory: l.subcategory })
  }
  return { etiquetas, incompleta }
}

export function CategoryPicker({ categorias, linhas, onChange, ocupadas }: {
  categorias: AtlasDocCategory[]
  linhas: LinhaCategoria[]
  onChange: (linhas: LinhaCategoria[]) => void
  /** Vagas já tomadas por outro documento: "categoria:subcategoria" para o nome dele. */
  ocupadas?: Map<string, string>
}) {
  const trocar = (i: number, nova: LinhaCategoria) =>
    onChange(linhas.map((l, j) => (j === i ? nova : l)))

  const remover = (i: number) => {
    const resto = linhas.filter((_, j) => j !== i)
    onChange(resto.length ? resto : [LINHA_VAZIA])
  }

  if (categorias.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No category in the taxonomy for this project type yet. Add one in Definitions.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Os títulos das duas metades ficam sempre à mostra, mesmo quando a
          categoria escolhida não tem subcategoria: a pessoa lê de cara que o
          campo tem duas partes, e a metade apagada não parece um defeito. */}
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <div className="flex min-w-0 flex-1">
          {/* Três para dois: o nome da categoria é longo e é o que identifica a
              linha; a subcategoria é "2nd", "C" ou "N/A". */}
          <span className="min-w-0 flex-[3] px-0.5">Category</span>
          <span className="min-w-0 flex-[2] px-0.5">Subcategory</span>
        </div>
        <span className="w-9 shrink-0" aria-hidden="true" />
      </div>
      {linhas.map((l, i) => {
        const c = categorias.find(x => x.id === l.categoryId)
        const valores = valoresDe(c)
        const pedeValor = valores.length > 0
        // As vagas escolhidas nas outras linhas deste mesmo documento.
        const outras = new Set(
          linhas.filter((x, j) => j !== i && x.categoryId !== null).map(x => `${x.categoryId}:${x.subcategory}`),
        )
        const dono = (chave: string) => ocupadas?.get(chave)
        const tomada = (chave: string) => !!dono(chave) || outras.has(chave)
        return (
          <div key={i} className="flex items-center gap-1.5">
            <div className="flex min-w-0 flex-1">
              <Select
                value={l.categoryId === null ? "" : String(l.categoryId)}
                onValueChange={v => trocar(i, { categoryId: v ? Number(v) : null, subcategory: "" })}
              >
                <SelectTrigger className="h-9 min-w-0 flex-[3] rounded-r-none">
                  {/* O ícone mora dentro do campo, como prefixo. */}
                  <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className={`min-w-0 flex-1 truncate text-left text-sm ${c ? "" : "text-muted-foreground"}`}>
                    {c?.name ?? "Category"}
                  </span>
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  className="w-max min-w-(--anchor-width) max-w-[min(22rem,calc(100vw-2rem))]"
                >
                  {categorias.map(o => {
                    const vals = valoresDe(o)
                    const semVaga = vals.length === 0
                      ? tomada(`${o.id}:`)
                      : vals.every(v => tomada(`${o.id}:${v}`))
                    const bloqueada = semVaga && o.id !== l.categoryId
                    const motivo = vals.length > 0 ? " · all taken"
                      : dono(`${o.id}:`) ? " · in use"
                      : " · already picked"
                    return (
                      <SelectItem key={o.id} value={String(o.id)} disabled={bloqueada}>
                        {o.name}
                        {bloqueada && <span className="text-muted-foreground">{motivo}</span>}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>

              {/* A metade do valor. Apagada enquanto a categoria não pede andar
                  nem unidade; com a categoria certa, é o próximo toque. */}
              <Select
                value={l.subcategory}
                disabled={!pedeValor}
                onValueChange={v => trocar(i, { ...l, subcategory: v ?? "" })}
              >
                <SelectTrigger
                  className={`h-9 min-w-0 flex-[2] rounded-l-none border-l-0 ${
                    pedeValor && !l.subcategory ? "border-amber-500/60" : ""
                  }`}
                >
                  <ListTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className={`min-w-0 flex-1 truncate text-left text-sm ${l.subcategory ? "" : "text-muted-foreground"}`}>
                    {/* "N/A" e não "-": o traço parecia campo vazio esperando
                        escolha, e o que ele quer dizer é que esta categoria não
                        tem andar nem unidade. Por extenso não cabia na metade. */}
                    {!pedeValor ? "N/A"
                      : l.subcategory ? rotuloDoValor(c, l.subcategory)
                      : c?.axis === "unit" ? "Unit" : "Floor"}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} className="w-max min-w-(--anchor-width)">
                  {valores.map(v => {
                    const chave = `${l.categoryId}:${v}`
                    const bloqueada = tomada(chave) && v !== l.subcategory
                    return (
                      <SelectItem key={v} value={v} disabled={bloqueada}>
                        {rotuloDoValor(c, v)}
                        {bloqueada && (
                          <span className="text-muted-foreground">
                            {dono(chave) ? " · in use" : " · already picked"}
                          </span>
                        )}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* A lixeira sem moldura nem fundo: a linha já é um campo com
                moldura, e um segundo retângulo colado nela fazia a linha parecer
                dois controles. A cor só vira vermelho sob o ponteiro, porque
                apagar é o que ela faz, não o que ela é. */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove this category"
              title="Remove this category"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-transparent hover:text-destructive"
              disabled={linhas.length === 1 && l.categoryId === null}
              onClick={() => remover(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      })}

      <button
        type="button"
        onClick={() => onChange([...linhas, LINHA_VAZIA])}
        className="flex items-center gap-1.5 self-start rounded-md px-1 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
      >
        <Plus className="h-3.5 w-3.5" />
        Add another category
      </button>
    </div>
  )
}
