import type { Metadata } from "next"
import { Geist } from "next/font/google"
import { Providers } from "@/lib/providers"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  // Título da plataforma. Cada produto sobrescreve no layout do seu route
  // group — o que sobra aqui é o que /login e /select mostram.
  title: "Data Intelligence Platform",
  description: "Premium Group — operational intelligence platform",
  icons: {
    icon: "/favicon.png",
  },
  // O nome que aparece embaixo do ícone quando alguém salva no iPhone ou iPad.
  // O Safari não lê o manifesto para isso: sem esta chave ele usaria o título
  // da página, que muda de tela para tela.
  appleWebApp: {
    capable: true,
    title: "Premium Group",
    statusBarStyle: "default",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <Providers>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  )
}
