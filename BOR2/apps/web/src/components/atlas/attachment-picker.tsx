"use client"

import { FileText, ImagePlus, Music, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

/**
 * As imagens que acompanham uma justificativa.
 *
 * Antes era uma fileira de etiquetas com o nome do arquivo. Nome de arquivo não
 * diz o que a foto mostra, e quem anexa três prints da mesma obra fica com três
 * etiquetas parecidas e nenhuma pista de qual é qual. Aqui o que se vê é a
 * própria imagem, no tamanho de quem confere antes de mandar.
 *
 * A área de soltar fica no fim da grade, e não acima dela: é o próximo quadro
 * da sequência, e a fila cresce para dentro dela em vez de empurrá-la para
 * baixo a cada arquivo.
 */
export function AttachmentPicker({ files, onChange, disabled }: {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  // A prévia sai do arquivo que já está na memória do navegador, sem passar
  // pelo bucket: o anexo ainda nem subiu.
  const [previews, setPreviews] = useState<string[]>([])
  useEffect(() => {
    const urls = files.map(f => (f.type.startsWith("image/") ? URL.createObjectURL(f) : ""))
    setPreviews(urls)
    return () => urls.forEach(u => u && URL.revokeObjectURL(u))
  }, [files])

  function add(picked: FileList | null) {
    const list = Array.from(picked ?? [])
    if (list.length) onChange([...files, ...list])
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,audio/*,application/pdf"
        className="hidden"
        onChange={e => {
          // A lista sai do input agora, e não dentro do atualizador de estado:
          // até a renderização seguinte a linha que limpa o campo já rodou, e o
          // anexo chegava sempre vazio.
          const escolhidos = Array.from(e.target.files ?? [])
          e.target.value = ""
          if (escolhidos.length) onChange([...files, ...escolhidos])
        }}
      />

      {files.map((f, i) => (
        <div
          key={`${f.name}-${i}`}
          className="group/anexo relative h-20 w-20 overflow-hidden rounded-lg border border-border/60 bg-muted/30"
          title={f.name}
        >
          {previews[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previews[i]} alt={f.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-muted-foreground">
              {/* Áudio não tem prévia para mostrar, e o ícone do formato já diz
                  o que vai acontecer quando alguém abrir. */}
              {f.type.startsWith("audio/") ? <Music className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              <span className="w-full truncate text-center text-[10px] leading-tight">{f.name}</span>
            </div>
          )}
          {/* Some com o quadro, e não com um botão que fica por cima da foto o
              tempo todo: a foto é o conteúdo, o remover é o gesto. */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(files.filter((_, k) => k !== i))}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-neutral-900/70 text-white opacity-0 backdrop-blur transition-opacity hover:bg-neutral-900/90 group-hover/anexo:opacity-100 focus-visible:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); add(e.dataTransfer.files) }}
        className={`flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-1 text-center transition-colors disabled:pointer-events-none disabled:opacity-50 ${
          over
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
        }`}
      >
        <ImagePlus className="h-4 w-4" />
        <span className="text-[10px] leading-tight">Click or drop a file</span>
      </button>
    </div>
  )
}
