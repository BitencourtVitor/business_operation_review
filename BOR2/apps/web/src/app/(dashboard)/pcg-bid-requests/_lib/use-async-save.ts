"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// Stand-in for the API round-trip. The store writes are local for now, so
// without this every save would settle in the same tick and the per-item
// state would never be visible. Delete this once the mutations hit the API —
// the rest of the hook works unchanged against a real promise.
const SIMULATED_LATENCY_MS = 500

export type SaveState = "idle" | "saving" | "saved"

/**
 * Per-item optimistic save. The value lands immediately and that item alone
 * shows a pending state while it settles — everything else stays interactive,
 * and a second save on the same item supersedes the first.
 */
export function useAsyncSave() {
  const [states, setStates] = useState<Record<string, SaveState>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const pending = timers.current
    return () => { Object.values(pending).forEach(clearTimeout) }
  }, [])

  const save = useCallback((key: string, apply: () => void) => {
    apply()
    setStates(s => ({ ...s, [key]: "saving" }))
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => {
      setStates(s => ({ ...s, [key]: "saved" }))
    }, SIMULATED_LATENCY_MS)
  }, [])

  const stateOf = useCallback((key: string): SaveState => states[key] ?? "idle", [states])
  const isSaving = useCallback((key: string) => (states[key] ?? "idle") === "saving", [states])

  return { save, stateOf, isSaving }
}
