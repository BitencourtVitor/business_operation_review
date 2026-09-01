"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  useAtlasDailyLogs, useAtlasMedia, useCreateAtlasDailyLog, useUploadAtlasMedia,
} from "@/hooks/use-atlas"
import { CalendarDays, CloudSun, ImagePlus, Paperclip, Users } from "lucide-react"
import { useRef, useState } from "react"

function MediaStrip({ jobsiteId, dailyLogId }: { jobsiteId: string; dailyLogId: string }) {
  const { data: media } = useAtlasMedia(jobsiteId, { dailyLogId })
  if (!media?.length) return null
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {media.map(m => (
        m.kind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={m.id}
            src={m.url}
            alt={m.caption || m.fileName}
            className="h-20 w-20 rounded-md border border-border/60 object-cover"
          />
        ) : (
          <a
            key={m.id}
            href={m.url}
            target="_blank"
            rel="noreferrer"
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-border/60 p-1 text-center text-[10px] text-muted-foreground hover:border-primary/40"
          >
            <Paperclip className="h-4 w-4" />
            <span className="line-clamp-2">{m.fileName}</span>
          </a>
        )
      ))}
    </div>
  )
}

/**
 * Diário de obra (AT-16): data, clima e o que foi executado, mais a mídia do
 * campo. É o que abre caminho para aposentar o Buildertrend depois do
 * Fieldwire.
 */
export function DailyLogPanel({ jobsiteId, canWrite }: { jobsiteId: string; canWrite: boolean }) {
  const { data: logs, isLoading } = useAtlasDailyLogs(jobsiteId)
  const create = useCreateAtlasDailyLog(jobsiteId)
  const upload = useUploadAtlasMedia(jobsiteId)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const [form, setForm] = useState({
    logDate: new Date().toISOString().slice(0, 10),
    weather: "",
    temperature: "",
    crewSize: "",
    summary: "",
  })

  function submit() {
    if (!form.logDate) return
    create.mutate({
      logDate: form.logDate,
      weather: form.weather,
      temperature: form.temperature ? Number(form.temperature) : null,
      crewSize: form.crewSize ? Number(form.crewSize) : null,
      summary: form.summary,
    }, { onSuccess: () => setForm({ ...form, weather: "", temperature: "", crewSize: "", summary: "" }) })
  }

  return (
    <div className="flex flex-col gap-5">
      {canWrite && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4">
          <p className="text-sm font-medium">Registro do dia</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="log-date">Data</Label>
              <Input id="log-date" type="date" value={form.logDate}
                onChange={e => setForm({ ...form, logDate: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="log-weather">Clima</Label>
              <Input id="log-weather" placeholder="Ensolarado, chuva…" value={form.weather}
                onChange={e => setForm({ ...form, weather: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="log-temp">Temperatura (°F)</Label>
              <Input id="log-temp" type="number" value={form.temperature}
                onChange={e => setForm({ ...form, temperature: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="log-crew">Equipe</Label>
              <Input id="log-crew" type="number" value={form.crewSize}
                onChange={e => setForm({ ...form, crewSize: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="log-summary">Executado</Label>
            <Textarea id="log-summary" rows={3} value={form.summary}
              placeholder="O que a equipe executou hoje"
              onChange={e => setForm({ ...form, summary: e.target.value })} />
          </div>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={create.isPending || !form.logDate}>
              {create.isPending ? "Salvando…" : "Registrar dia"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      ) : !logs?.length ? (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center">
          <p className="text-sm font-medium">Diário vazio</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada dia registrado vira uma linha do calendário da obra.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {logs.map(l => (
            <div key={l.id} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(`${l.logDate}T12:00:00`).toLocaleDateString()}
                </span>
                {l.weather && (
                  <span className="flex items-center gap-1.5">
                    <CloudSun className="h-3.5 w-3.5" />
                    {l.weather}{l.temperature != null ? ` · ${l.temperature}°F` : ""}
                  </span>
                )}
                {l.crewSize != null && (
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {l.crewSize}
                  </span>
                )}
                {canWrite && (
                  <>
                    <input
                      type="file"
                      accept="image/*,video/*,audio/*"
                      className="hidden"
                      ref={el => { fileInputs.current[l.id] = el }}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) upload.mutate({ file, dailyLogId: l.id })
                        e.target.value = ""
                      }}
                    />
                    <Button
                      variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 text-xs"
                      onClick={() => fileInputs.current[l.id]?.click()}
                      disabled={upload.isPending}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Anexar
                    </Button>
                  </>
                )}
              </div>
              {l.summary && <p className="whitespace-pre-wrap text-sm">{l.summary}</p>}
              <MediaStrip jobsiteId={jobsiteId} dailyLogId={l.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
