export const UNITS = ['unit', 'linear_meter', 'square_meter', 'set'] as const
export type Unit = (typeof UNITS)[number]

export const ORDER_STATES = [
  'quoted', 'deposit_pending', 'deposit_confirmed', 'files_ok', 'in_production',
] as const
export type OrderState = (typeof ORDER_STATES)[number]

export type Intent = {
  family: string | null
  attributes: Record<string, string | number>
  missing: string[]
}

export type Resolution =
  | { kind: 'price'; amount: number; itemId: number; explanation: string; derivation?: string }
  | { kind: 'escalate'; reason: EscalationReason; detail: string }

export const ESCALATION_REASONS = [
  'no_match', 'ambiguous', 'missing_attribute', 'out_of_catalog', 'vat_question', 'not_a_fact',
] as const
export type EscalationReason = (typeof ESCALATION_REASONS)[number]

export type PriceEdit = {
  itemId: number
  oldPrice: number
  newPrice: number
  source: 'audio' | 'photo' | 'text'
  mediaId: string
  proposedBy: string
}
