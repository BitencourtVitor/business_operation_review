import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"

// Roles that bypass permission checks entirely for viewing/navigation.
const FULL_ACCESS_ROLES = ["dev", "owner", "admin", "manager"]
// Roles that bypass the stricter "write" check (mirrors backend's requireAdminRole).
const ADMIN_ROLES = ["dev", "owner", "admin"]

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

  return { canView, canEdit, isLoading }
}
