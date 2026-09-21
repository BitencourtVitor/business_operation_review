import type { Metadata } from "next"
import { ForceLight } from "./force-light"

// Fora de `/bor` de propósito: o login do BOR é aplicado pelo AuthGuard do
// layout de lá, e este formulário é aberto por quem não tem conta.
export const metadata: Metadata = {
  title: "PCG Bid Form",
  description: "Answer the questions for this trade and send it back.",
}

export default function PCGFormLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Antes da hidratação, para quem está no escuro não ver a tela piscar.
          O ForceLight é quem segura depois que o provedor de tema monta. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light"`,
        }}
      />
      <ForceLight />
      {children}
    </>
  )
}
