import { usePermission } from "@/hooks/use-permission"

export const PCG_BID_REQUESTS_PERM = "pcg_bid_requests"

// Read grants the whole page: projects, trades, and the documents themselves —
// a sub's paperwork is worth looking at without being able to change it. Write
// is what gates every mutation: creating projects, answering questionnaires,
// logging events, and the trade catalog behind them.
export function useCanEditBidRequests() {
  const { canEdit } = usePermission()
  return canEdit(PCG_BID_REQUESTS_PERM)
}
