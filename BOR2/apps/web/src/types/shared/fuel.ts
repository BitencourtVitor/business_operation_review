export type FuelEventType = "trip" | "idle"

export interface SamsaraEvent {
  id: string
  eventKey: string
  eventDate: string
  driverName: string
  location: string
  distance: number
  units: string
  type: FuelEventType
  createdAt: string
}

export interface WexTransaction {
  id: string
  transactionKey: string
  transactionDate: string
  driverName: string
  units: number
  totalFuelCost: number
  merchantCity: string
  createdAt: string
}

export interface FuelSummary {
  totalDistance: number
  totalFuelCost: number
  totalIdleHours: number
  byDriver: Record<string, { distance: number; cost: number }>
}

export interface FuelFilters {
  driverName?: string
  startDate?: string
  endDate?: string
}
