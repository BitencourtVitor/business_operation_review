import { api } from "@/lib/api"
import type { FuelFilters, SamsaraEvent, WexTransaction } from "@bor2/shared"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export const fuelService = {
  listSamsara: (filters?: Partial<FuelFilters>) => {
    const params = new URLSearchParams()
    if (filters?.driverName) params.set("driver", filters.driverName)
    return api.get<SamsaraEvent[]>(`/api/v1/fuel/samsara?${params}`, getToken())
  },

  listWex: (filters?: Partial<FuelFilters>) => {
    const params = new URLSearchParams()
    if (filters?.driverName) params.set("driver", filters.driverName)
    return api.get<WexTransaction[]>(`/api/v1/fuel/wex?${params}`, getToken())
  },
}
