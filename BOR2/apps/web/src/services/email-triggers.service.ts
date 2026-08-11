import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export type TriggerParamType = "int" | "text" | "date" | "select"

export interface TriggerParamOption {
  value: string
  label: string
}

export interface TriggerParamDef {
  key: string
  label: string
  help?: string
  type: TriggerParamType
  options?: TriggerParamOption[]
  min?: number
  max?: number
}

export interface EmailTrigger {
  key: string
  label: string
  module: string
  description: string
  when: string
  schedulable: boolean
  params: TriggerParamDef[]
  enabled: boolean
  run_hour_utc: number | null
  // Current values keyed by TriggerParamDef.key. Separate from `params`,
  // which is the schema describing how to render each one.
  values: Record<string, unknown>
  to_user_ids: string[]
  cc_user_ids: string[]
  updated_by: string | null
  updated_at: string
}

export interface EmailTriggerDelivery {
  trigger_key: string
  subject: string
  to: string[]
  cc: string[]
  context: string
  status: "sent" | "failed"
  error: string
  sent_at: string
}

export interface UpdateEmailTriggerBody {
  enabled: boolean
  run_hour_utc: number | null
  values: Record<string, unknown>
  to_user_ids: string[]
  cc_user_ids: string[]
}

export const emailTriggersService = {
  list: () => api.get<EmailTrigger[]>(`/api/v1/email-triggers`, getToken()),

  update: (key: string, body: UpdateEmailTriggerBody) =>
    api.put<EmailTrigger>(`/api/v1/email-triggers/${key}`, body, getToken()),

  history: (key: string) =>
    api.get<EmailTriggerDelivery[]>(`/api/v1/email-triggers/${key}/history`, getToken()),
}
