"use client"

import { use, useEffect, useState } from "react"
import { Building2, CheckCircle2, Loader2, Lock, MapPin, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { QuestionnaireForm } from "@/app/bor/pcg-bid-requests/_components/questionnaire-form"
import { isAnswered } from "@/app/bor/pcg-bid-requests/_lib/projects-store"
import { tradeIcon } from "@/app/bor/pcg-bid-requests/_lib/trade-icons"
import type { ProjectTrade } from "@/app/bor/pcg-bid-requests/_lib/types"
import { pcgFormsService, type PCGPublicForm } from "@/services/pcg-forms.service"

// O formulário aberto pelo link, sem login. É a mesma tela do questionário que
// o BOR mostra por dentro, com a mesma marcação de respondido, porque quem
// responde pelo celular e quem confere por dentro têm de estar olhando a mesma
// coisa.
//
// Uma coluna só: o link chega pelo WhatsApp e abre na aba de dentro do
// aplicativo, que é estreita e não tem barra de endereço.
export default function PCGPublicFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [form, setForm] = useState<PCGPublicForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<ProjectTrade["answers"]>({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    pcgFormsService.getPublic(id)
      .then(setForm)
      .catch(() => setForm(null))
      .finally(() => setLoading(false))
  }, [id])

  async function submit() {
    setSending(true)
    setError("")
    try {
      await pcgFormsService.submit(id, answers)
      setSent(true)
    } catch {
      // Enviado duas vezes, ou desligado enquanto estava aberto na tela. Em
      // qualquer dos casos o que foi digitado continua à vista, e não some.
      setError("This form is no longer open. Ask Premium Contractors Group for a new link.")
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Centered>
    )
  }

  if (sent) {
    return (
      <Centered>
        <Logo />
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <h1 className="text-lg font-semibold">Form sent</h1>
        <p className="text-sm text-muted-foreground">
          Your answers are with Premium Contractors Group. You can close this page.
        </p>
      </Centered>
    )
  }

  if (!form || form.state !== "open" || !form.snapshot) {
    return (
      <Centered>
        <Logo />
        <Lock className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">
          {form?.state === "answered" ? "This form was already answered" : "This form is not available"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Ask Premium Contractors Group for a new link.
        </p>
      </Centered>
    )
  }

  const { snapshot } = form
  const total = snapshot.questions.length
  const answered = snapshot.questions.filter(q => isAnswered(answers[q.id])).length
  // Formulário criado antes do ícone entrar no snapshot não tem a chave, e o
  // catálogo dele não é legível daqui: o martelo do fallback serve.
  const TradeIcon = tradeIcon(snapshot.icon ?? "general")

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="border-b px-4 py-5">
        <Logo />

        <div className="mt-4 flex items-center gap-2.5">
          <TradeIcon className="h-6 w-6 shrink-0 text-primary" />
          <h1 className="text-xl font-semibold leading-tight">{snapshot.tradeName}</h1>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          {snapshot.projectName}
        </p>
        {snapshot.projectAddress && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {snapshot.projectAddress}
          </p>
        )}
      </header>

      <main className="flex-1 px-4 py-4">
        <QuestionnaireForm
          questions={snapshot.questions}
          answers={answers}
          saveStateOf={() => "idle"}
          onChange={(questionId, value) => setAnswers(a => ({ ...a, [questionId]: value }))}
        />
      </main>

      {/* Colado embaixo: numa lista de quarenta perguntas o botão de enviar não
          pode estar a quarenta rolagens de distância. */}
      <footer className="sticky bottom-0 border-t bg-background/95 px-4 py-3 backdrop-blur">
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <span className={`text-sm tabular-nums ${answered === total ? "text-emerald-500" : "text-muted-foreground"}`}>
            {answered}/{total} answered
          </span>
          <Button className="ml-auto" onClick={submit} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </div>
      </footer>
    </div>
  )
}

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/images/sublogo_pcg.png" alt="Premium Contractors Group" className="w-40" />
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      {children}
    </div>
  )
}
