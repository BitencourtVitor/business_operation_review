"use client"

import { ChevronRight, SlidersHorizontal, Users } from "lucide-react"
import Link from "next/link"

// Mesmo desenho do hub de Settings do BOR: linhas num contêiner só, com ícone,
// título, descrição e chevron. São produtos diferentes, mas quem administra um
// não deveria ter que reaprender o outro.
const OPTIONS = [
  {
    icon: Users,
    title: "Manage Users",
    description: "Who gets into the Atlas, and at what level. Access here never grants the BOR.",
    href: "/atlas/users",
  },
  {
    icon: SlidersHorizontal,
    title: "Jobsite Definitions",
    description: "What each build type is expected to carry, by client. Buildings and houses.",
    href: "/atlas/definitions",
  },
]

export default function AtlasSettingsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage who works in the Atlas and what each jobsite is expected to carry
        </p>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-border/30 bg-muted/40">
        {OPTIONS.map((opt, i) => {
          const Icon = opt.icon
          const isLast = i === OPTIONS.length - 1
          return (
            <Link
              key={opt.title}
              href={opt.href}
              className={`group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/70 ${
                isLast ? "" : "border-b border-border/30"
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-transparent text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{opt.title}</p>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
