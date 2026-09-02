import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"

// Roles that bypass permission checks entirely for viewing/navigation.
const FULL_ACCESS_ROLES = ["dev", "owner", "admin", "manager"]
// Roles that bypass the stricter "write" check. Mesma lista do `fullAccessRoles`
// do RequirePermission no backend: manager tem cargo análogo a admin e escreve
// no que é granular. Deixá-lo de fora aqui dava a pior combinação — a tela
// bloqueava o que a API já autorizava.
//
// Não é escalação: usuários e permissões têm guarda própria no backend
// (settings.go:requireAdminRole), que exige admin/dev/owner e não olha esta
// lista.
const ADMIN_ROLES = ["dev", "owner", "admin", "manager"]

export function usePermission() {
  const { user } = useAuth()
  const { data: myPerms, isLoading } = useMyPermissions()

  function canView(permKey: string): boolean {
    if (!user) return false
    if (FULL_ACCESS_ROLES.includes(user.role)) return true
    if (isLoading) return true // avoid flash while permissions load
    return !!myPerms?.permissions[permKey] // "read" or "write" both grant visibility
  }

  function canEdit(permKey: string): boolean {
    if (!user) return false
    if (ADMIN_ROLES.includes(user.role)) return true
    return myPerms?.permissions[permKey] === "write"
  }

  return { canView, canEdit, isDev: user?.role === "dev", isLoading }
}
