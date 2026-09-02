'use client'

import { sitTier } from '../lib'
import { SIT_STYLE } from '../types'

export function StatusBadge({ situacao }: { situacao: string }) {
  const t = sitTier(situacao)
  const s = SIT_STYLE[t]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {situacao}
    </span>
  )
}
