"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAtlasAlbums, useAtlasMedia, useUploadAtlasMedia } from "@/hooks/use-atlas"
import type { AtlasMedia } from "@/services/atlas.service"
import { ArrowLeft, FileAudio, FileVideo, FolderOpen, ImagePlus, Paperclip } from "lucide-react"
import { useMemo, useRef, useState } from "react"

function sizeLabel(n: number) {
  if (!n) return ""
  const units = ["B", "KB", "MB", "GB"]
  let v = n, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function dayKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function Thumb({ item, onOpen }: { item: AtlasMedia; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card text-left transition-colors hover:border-primary/40"
    >
      {item.kind === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt={item.caption || item.fileName} className="h-28 w-full object-cover" />
      ) : (
        <span className="flex h-28 w-full items-center justify-center bg-muted/40 text-muted-foreground">
          {item.kind === "video" ? <FileVideo className="h-6 w-6" />
            : item.kind === "audio" ? <FileAudio className="h-6 w-6" />
            : <Paperclip className="h-6 w-6" />}
        </span>
      )}
      <span className="flex flex-col gap-0.5 p-2">
        <span className="truncate text-xs font-medium">{item.caption || item.fileName}</span>
        <span className="text-[11px] text-muted-foreground">
          {[new Date(item.takenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            sizeLabel(item.byteSize)].filter(Boolean).join(" · ")}
        </span>
      </span>
    </button>
  )
}

/**
 * Fotos e vídeos da obra, guardados por pasta e lidos por dia.
 *
 * Duas organizações ao mesmo tempo porque são duas perguntas diferentes: a
 * pasta responde "onde está o registro da fundação"; o dia responde "o que
 * aconteceu na terça". A pasta é escolha de quem sobe; o dia sai da hora da
 * captura, não da hora do upload — quem fotografa em obra manda tudo à noite.
 */
export function PhotosPanel({ jobsiteId, canWrite }: { jobsiteId: string; canWrite: boolean }) {
  const { data: albums, isLoading: loadingAlbums } = useAtlasAlbums(jobsiteId)
  const [album, setAlbum] = useState<string | null>(null)
  const [newAlbum, setNewAlbum] = useState("")
  const [preview, setPreview] = useState<AtlasMedia | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: media, isLoading } = useAtlasMedia(
    jobsiteId, album === null ? undefined : { album },
  )
  const upload = useUploadAtlasMedia(jobsiteId)

  // Dentro da pasta, um bloco por dia. Fora dela, a grade de pastas.
  const byDay = useMemo(() => {
    const map = new Map<string, AtlasMedia[]>()
    for (const m of media ?? []) {
      const key = dayKey(m.takenAt)
      map.set(key, [...(map.get(key) ?? []), m])
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [media])

  function pickFiles(target: string) {
    setNewAlbum(target)
    inputRef.current?.click()
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={e => {
          const files = [...(e.target.files ?? [])]
          for (const file of files) upload.mutate({ file, album: newAlbum })
          e.target.value = ""
        }}
      />

      {album === null ? (
        <>
          {canWrite && (
            <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-4 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="text-sm font-medium">New folder</span>
                <Input
                  value={newAlbum}
                  onChange={e => setNewAlbum(e.target.value)}
                  placeholder="Foundation, Framing, Punch list…"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => pickFiles(newAlbum.trim())}
                disabled={upload.isPending}
              >
                <ImagePlus className="h-4 w-4" />
                {upload.isPending ? "Uploading…" : "Add photos"}
              </Button>
            </div>
          )}

          {loadingAlbums ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            </div>
          ) : !albums?.length ? (
            <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
              <p className="text-sm font-medium">No photos yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Photos and videos live in folders, and each folder reads by day.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {albums.map(a => (
                <button
                  key={a.album || "__loose"}
                  onClick={() => setAlbum(a.album)}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
                    <FolderOpen className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {a.album || "Unsorted"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {new Date(a.last).toLocaleDateString()}
                      {a.first !== a.last && ` — ${new Date(a.first).toLocaleDateString()}`}
                    </span>
                  </span>
                  <Badge variant="outline">{a.count}</Badge>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={() => setAlbum(null)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {album || "Unsorted"}
            </button>
            {canWrite && (
              <Button variant="outline" onClick={() => pickFiles(album)} disabled={upload.isPending}>
                <ImagePlus className="h-4 w-4" />
                {upload.isPending ? "Uploading…" : "Add to this folder"}
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            </div>
          ) : byDay.length === 0 ? (
            <p className="text-sm text-muted-foreground">This folder is empty.</p>
          ) : byDay.map(([day, items]) => (
            <div key={day} className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "short", day: "2-digit", month: "short", year: "numeric",
                })}
                <span className="ml-2 normal-case tracking-normal">{items.length}</span>
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.map(m => <Thumb key={m.id} item={m} onOpen={() => setPreview(m)} />)}
              </div>
            </div>
          ))}
        </>
      )}

      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/95 p-8"
        >
          {preview.kind === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={preview.url} controls className="max-h-[80vh] max-w-full" />
          ) : preview.kind === "audio" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio src={preview.url} controls />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="" className="max-h-[80vh] max-w-full object-contain" />
          )}
          <p className="text-sm text-muted-foreground">
            {preview.caption || preview.fileName} · {new Date(preview.takenAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  )
}
