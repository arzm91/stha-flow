import type { ComponentType } from 'react'
import { template as reportReady } from './report-ready'
import { template as orderConfirmation } from './order-confirmation'
import { template as alert } from './alert'
import { template as message } from './message'
import { template as rotinaEvento } from './rotina-evento'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'report-ready': reportReady,
  'order-confirmation': orderConfirmation,
  'alert': alert,
  'message': message,
  'rotina-evento': rotinaEvento,
}
