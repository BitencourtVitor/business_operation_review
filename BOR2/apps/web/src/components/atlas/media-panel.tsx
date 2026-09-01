"use client"

import { Button } from "@/components/ui/button"
import { useAtlasMedia, useUploadAtlasMedia } from "@/hooks/use-atlas"
import { FileAudio, FileVideo, ImagePlus, Paperclip } from "lucide-react"
import { useRef, useState } from "react"

function sizeLabel(n: number) {
  if (!n) return ""
  const units = ["B", "KB", "MB", "GB"]
  let v = n, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * Galeria da obra: tudo que o campo mandou, de qualquer origem — evento na
 * planta ou dia do diário. O mesmo arquivo aparece no lugar de onde veio; aqui
 * ele aparece junto com os outros, que é como se procura uma foto de dois meses
 * atrás.
 */
export function MediaPanel({ jobsiteId, canWrite }: { jobsiteId: string; canWrite: boolean }) {
  const { data: media, isLoading } = useAtlasMedia(jobsiteId)
  const upload = useUploadAtlasMedia(jobsiteId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-4">
          <div>
            <p className="text-sm font-medium">Site media</p>
            <p className="text-xs text-muted-foreground">
              Photo, video or audio. Files go straight to storage — they never pass through the API.
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*,audio/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) upload.mutate({ file })
              e.target.value = ""
            }}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            <ImagePlus className="h-4 w-4" />
            {upload.isPending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      ) : !media?.length ? (
        <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
          <p className="text-sm font-medium">No media yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Photos attached to events and diary entries show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {media.map(m => (
            <button
              key={m.id}
              onClick={() => m.kind === "photo" ? setPreview(m.url) : window.open(m.url, "_blank", "noopener")}
              className="flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card text-left transition-colors hover:border-primary/40"
            >
              {m.kind === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.caption || m.fileName} className="h-28 w-full object-cover" />
              ) : (
                <span className="flex h-28 w-full items-center justify-center bg-muted/40 text-muted-foreground">
                  {m.kind === "video" ? <FileVideo className="h-6 w-6" />
                    : m.kind === "audio" ? <FileAudio className="h-6 w-6" />
                    : <Paperclip className="h-6 w-6" />}
                </span>
              )}
              <span className="flex flex-col gap-0.5 p-2">
                <span className="truncate text-xs font-medium">{m.caption || m.fileName}</span>
                <span className="text-[11px] text-muted-foreground">
                  {[new Date(m.uploadedAt).toLocaleDateString(), sizeLabel(m.byteSize)]
                    .filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {preview && (
        <button
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-8"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </div>
  )
}
