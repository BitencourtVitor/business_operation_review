import { CodeXml, Gauge, HardHat, UserRound, Users } from "lucide-react"

/**
 * O crachá de quem fez, o mesmo da tela de usuários.
 *
 * Numa obra com subcontratado dentro, saber que o set veio de fora vale mais
 * que o nome de quem o mandou: o ícone diz isso antes de a pessoa ler a linha.
 */
export const ROLE_ICON: Record<string, { icon: React.ElementType; className: string }> = {
  dev:           { icon: CodeXml,   className: "text-yellow-600 dark:text-yellow-400" },
  owner:         { icon: Gauge,     className: "text-emerald-600 dark:text-emerald-400" },
  manager:       { icon: Users,     className: "text-primary" },
  subcontractor: { icon: HardHat,   className: "text-brand-red" },
  user:          { icon: UserRound, className: "text-muted-foreground" },
}

/** O ícone do cargo seguido do primeiro nome. */
export function RoleName({ name, role, className = "" }: {
  name: string
  role?: string
  className?: string
}) {
  if (!name) return null
  const meta = ROLE_ICON[role ?? ""] ?? ROLE_ICON.user
  const Icon = meta.icon
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.className}`} />
      <span className="truncate">{name.split(" ")[0]}</span>
    </span>
  )
}
