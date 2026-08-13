import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export type TriggerParamType = "int" | "text" | "date" | "select" | "multiselect"

export interface TriggerParamOption {
  value: string
  label: string
  // Extra context rendered next to the label — for employees, the companies
  // the person is registered in, so one unified name still shows where it lives.
  tags?: string[]
}

export interface TriggerParamDef {
  key: string
  label: string
  help?: string
  type: TriggerParamType
  options?: TriggerParamOption[]
  min?: number
  max?: number
  // Renders on the same row as the previous field.
  inline?: boolean
  /** "timing" fields live in the schedule block; the rest in Parameters. */
  group?: string
}

export interface EmailBody {
  subject: string
  text: string
  html: string
}

export interface EmailTrigger {
  key: string
  label: string
  /** System the trigger belongs to; the modal maps it to an image or glyph. */
  icon: string
  module: string
  description: string
  when: string
  schedulable: boolean
  params: TriggerParamDef[]
  enabled: boolean
  run_hour_local: number | null
  // Current values keyed by TriggerParamDef.key. Separate from `params`,
  // which is the schema describing how to render each one.
  values: Record<string, unknown>
  to_user_ids: string[]
  cc_user_ids: string[]
  updated_by: string | null
  updated_at: string
  /** How many deliveries are on record, so the history block can say so
   *  without loading the list. */
  delivery_count: number
}

export interface EmailTriggerDelivery {
  trigger_key: string
  subject: string
  to: string[]
  cc: string[]
  context: string
  status: "sent" | "failed" | "test"
  error: string
  sent_at: string
}

export interface UpdateEmailTriggerBody {
  enabled: boolean
  run_hour_local: number | null
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

  preview: (key: string, body: UpdateEmailTriggerBody) =>
    api.post<EmailBody>(`/api/v1/email-triggers/${key}/preview`, body, getToken()),

  sendTest: (key: string, body: UpdateEmailTriggerBody) =>
    api.post<{ delivered_to: string }>(`/api/v1/email-triggers/${key}/test`, body, getToken()),
}
