import { create } from "zustand"
import { persist } from "zustand/middleware"

interface FinancialState {
  showFinancialData: boolean
  toggleFinancialData: () => void
  resetFinancial: () => void
}

export const useFinancialStore = create<FinancialState>()(
  persist(
    (set) => ({
      showFinancialData: true,
      toggleFinancialData: () =>
        set((state) => ({ showFinancialData: !state.showFinancialData })),
      resetFinancial: () => set({ showFinancialData: true }),
    }),
    {
      name: "bor2-financial",
    }
  )
)
