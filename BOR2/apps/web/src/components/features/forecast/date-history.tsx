"use client"

import { useForecastDateHistory } from "@/hooks/use-forecast"
import { CalendarClock, Loader2, X } from "lucide-react"
import { fmtStamp } from "./obs-history"

/** Nome da coluna no banco → como a data se chama para quem olha a obra. */
const FIELD_LABEL: Record<string, string> = {
  previous_beams_date:   "Beams",
  previous_start_date:   "Start",
  previous_end_date:     "End",
  hvac_rough_date:       "Rough HVAC",
  hvac_air_handler_date: "Air Handler / Gas Furnace Set",
  hvac_condenser_date:   "Install Condenser and Thermostat",
  hvac_finish_date:      "HVAC Finish Set A/C",
}

/**
 * Origem da data. É o que decide se um valor pode ser sobrescrito pela próxima
 * rodada de atualização: data posta à mão não cede lugar para automação.
 */
const SOURCE_STYLE: Record<string, { label: string; className: string }> = {
  orders:   { label: "Orders",   className: "text-emerald-600 dark:text-emerald-400" },
  email:    { label: "E-mail",   className: "text-blue-600 dark:text-blue-400" },
  schedule: { label: "Schedule", className: "text-amber-600 dark:text-amber-400" },
  import:   { label: "Import",   className: "text-muted-foreground" },
  manual:   { label: "Manual",   className: "text-primary" },
}

function fmtDate(value?: string | null): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  })
}

/**
 * Trilha de datas da obra, da mais antiga para a mais nova.
 *
 * As datas andam a cada ciclo de atualização do portal do cliente; sem esta
 * trilha, só o valor atual existia e não dava para saber quantas vezes a obra
 * já foi remarcada nem de onde veio cada remarcação.
 */
export function DateHistoryPanel({
  projectId,
  open,
  onClose,
}: {
  projectId: string
  open: boolean
  onClose: () => void
}) {
  const { data: entries = [], isLoading } = useForecastDateHistory(projectId, open)

  return (
    <div className="flex max-h-[85vh] w-full shrink-0 flex-col border-t bg-muted/20 sm:w-[320px] sm:border-l sm:border-t-0">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Date History
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close date history"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            No date changes recorded yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map(e => {
              const source = SOURCE_STYLE[e.source] ?? SOURCE_STYLE.manual
              return (
                <div key={e.id} className="rounded-lg border bg-background px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-semibold">
                      {FIELD_LABEL[e.field] ?? e.field}
                    </span>
                    <span className={`shrink-0 text-[10px] font-medium ${source.className}`}>
                      {source.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {e.oldValue ? (
                      <>
                        <span className="line-through">{fmtDate(e.oldValue)}</span>
                        {" → "}
                      </>
                    ) : null}
                    <span className="font-medium text-foreground">{fmtDate(e.newValue)}</span>
                  </p>
                  <div className="mt-1 flex justify-end text-[10px] font-medium text-muted-foreground/80">
                    {[e.changedBy, fmtStamp(e.changedAt)].filter(Boolean).join(" · ")}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
