import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface ContractNumber {
  number: string
  seq: number
  trade_code: string
  issued_at: string
  issued_by: string
}

export const pcgContractNumbersService = {
  // Asking twice returns the number already issued: the server is idempotent by
  // project + trade, so a reprint never consumes another number.
  issue: (projectId: string, tradeId: string, tradeCode: string) =>
    api.post<ContractNumber>("/api/v1/pcg/contract-numbers", {
      project_id: projectId,
      trade_id: tradeId,
      trade_code: tradeCode,
    }, getToken()),

  // Every number already issued on a project, keyed by trade id. Reading only —
  // it never issues.
  listByProject: (projectId: string) =>
    api.get<Record<string, ContractNumber>>(
      `/api/v1/pcg/contract-numbers?project_id=${encodeURIComponent(projectId)}`,
      getToken(),
    ).then(r => r ?? {}),
}
