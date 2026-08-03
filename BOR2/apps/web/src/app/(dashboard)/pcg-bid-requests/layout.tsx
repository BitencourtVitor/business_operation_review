"use client"

import { Loader2, ShieldAlert } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"

// Still under construction — the sidebar entry is disabled for everyone but
// dev, so this guard is what blocks a direct URL hit on any sub-route.
export default function PCGBidRequestsLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (user?.role !== "dev") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive/60" />
          <p className="font-medium">Access Denied</p>
          <p className="text-sm text-muted-foreground">PCG Bid Requests isn&apos;t available yet.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
