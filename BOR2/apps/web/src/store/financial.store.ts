import { create } from "zustand"
import { persist } from "zustand/middleware"

interface FinancialState {
  showFinancialData: boolean
  toggleFinancialData: () => void
}

export const useFinancialStore = create<FinancialState>()(
  persist(
    (set) => ({
      showFinancialData: true,
      toggleFinancialData: () =>
        set((state) => ({ showFinancialData: !state.showFinancialData })),
    }),
    {
      name: "bor2-financial",
    }
  )
)
