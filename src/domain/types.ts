import { z } from 'zod'
import type { Ars } from './money'

export const UNITS = ['unit', 'linear_meter', 'square_meter', 'set'] as const
export const unitSchema = z.enum(UNITS)
export type Unit = z.infer<typeof unitSchema>

export const ROLES = ['customer', 'admin'] as const
export const roleSchema = z.enum(ROLES)
export type Role = z.infer<typeof roleSchema>

export const ORDER_STATES = [
  'quoted',
  'deposit_pending',
  'deposit_confirmed',
  'files_ok',
  'in_production',
  'cancelled',
] as const
export const orderStateSchema = z.enum(ORDER_STATES)
export type OrderState = z.infer<typeof orderStateSchema>

export const ESCALATION_REASONS = [
  'no_match',
  'ambiguous',
  'missing_attribute',
  'unsupported_quantity',
  'unsupported_option',
  'out_of_catalog',
  'multiple_products',
  'vat_question',
  'commercial_discount',
  'unknown_fact',
  'needs_designer',
  'not_authorized',
  'human_requested',
] as const
export const escalationReasonSchema = z.enum(ESCALATION_REASONS)
export type EscalationReason = z.infer<typeof escalationReasonSchema>

export const INTENT_KINDS = ['quote', 'fact', 'admin_edit', 'accept', 'other'] as const
export const intentKindSchema = z.enum(INTENT_KINDS)
export type IntentKind = z.infer<typeof intentKindSchema>

export const PRICE_EDIT_SOURCES = ['audio', 'photo', 'text'] as const
export const priceEditSourceSchema = z.enum(PRICE_EDIT_SOURCES)
export type PriceEditSource = z.infer<typeof priceEditSourceSchema>

export const PRICE_EDIT_STATES = ['proposed', 'applied', 'rejected'] as const
export const priceEditStateSchema = z.enum(PRICE_EDIT_STATES)
export type PriceEditState = z.infer<typeof priceEditStateSchema>

declare const untrustedBrand: unique symbol

export type UntrustedText = string & { readonly [untrustedBrand]: true }

declare const conversationBrand: unique symbol

export type ConversationId = string & { readonly [conversationBrand]: true }

export function conversationId(channel: string, chatId: string, role: Role): ConversationId {
  return `${channel}:${chatId}:${role}` as ConversationId
}

export const ATTRIBUTE_KINDS = ['enum', 'number'] as const
export type AttributeKind = (typeof ATTRIBUTE_KINDS)[number]

export type AttributeContract =
  | { name: string; kind: 'enum'; values: string[] }
  | { name: string; kind: 'number'; values: number[] }

export type ModuleContract = {
  widthCm: number
  heightCm: number
}

export type FamilyContract = {
  slug: string
  label: string
  unit: Unit
  vatRate: number
  vatIncluded: boolean
  module: ModuleContract | null
  attributes: AttributeContract[]
  askOrder: string[]
  addOns: string[]
}

export type Size = {
  widthCm: number
  heightCm: number
}

export type QuoteIntent = {
  kind: 'quote'
  family: string | null
  attributes: Record<string, string | number>
  size: Size | null
  addOns: string[]
}

export type FactIntent = {
  kind: 'fact'
  key: string
}

export type PriceEditOperation =
  | { op: 'percent'; direction: 'raise' | 'lower'; rate: number }
  | { op: 'absolute'; amount: Ars }

export type AdminEditIntent = {
  kind: 'admin_edit'
  target: string
  operation: PriceEditOperation
}

/** No payload: the quote being accepted is the one the conversation was last shown. */
export type AcceptIntent = {
  kind: 'accept'
}

export type OtherIntent = {
  kind: 'other'
}

export type Intent = QuoteIntent | FactIntent | AdminEditIntent | AcceptIntent | OtherIntent

const sizeSchema = z.object({
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
})

function attributeValueSchema(attribute: AttributeContract): z.ZodType<string | number> {
  const values: (string | number)[] = attribute.values

  return z.union(values.map((value) => z.literal(value)))
}

export function quoteIntentSchema(family: FamilyContract): z.ZodType<QuoteIntent> {
  const attributes = Object.fromEntries(
    family.attributes.map((attribute) => [attribute.name, attributeValueSchema(attribute).optional()]),
  )

  return z.object({
    kind: z.literal('quote'),
    family: z.literal(family.slug).nullable(),
    attributes: z.object(attributes).strict(),
    size: sizeSchema.nullable(),
    addOns: z.array(z.union(family.addOns.map((slug) => z.literal(slug)))),
  }) as z.ZodType<QuoteIntent>
}

export type BreakdownLine = {
  slug: string
  label: string
  amount: Ars
}

export type PriceBreakdown = {
  base: BreakdownLine
  moduleFactor: number
  moduleDiscountRates: number[]
  addOns: BreakdownLine[]
  listDiscounts: BreakdownLine[]
  vatRate: number
  vatIncluded: boolean
}

export type Resolution =
  | { kind: 'price'; breakdown: PriceBreakdown; validityDays: number }
  | { kind: 'ask'; missing: string[] }
  | { kind: 'fact'; key: string; value: string }
  | { kind: 'accepted'; order: Order; alias: string }
  | { kind: 'escalate'; reason: EscalationReason; detail: string }

export type Quote = {
  id: string
  conversationId: ConversationId
  breakdown: PriceBreakdown
  quotedAt: string
  validUntil: string
}

export type Order = {
  id: string
  quoteId: string
  conversationId: ConversationId
  breakdown: PriceBreakdown
  /** Copied from the quote, like the breakdown, and for the same reason: it is what was agreed. */
  quotedAt: string
  state: OrderState
  depositAlias: string | null
  depositConfirmedBy: string | null
  depositConfirmedAt: string | null
}

export type PriceEditLine = {
  slug: string
  label: string
  oldPrice: Ars
  newPrice: Ars
}

export type PriceEditProposal = {
  id: string
  operation: PriceEditOperation
  lines: PriceEditLine[]
  state: PriceEditState
  source: PriceEditSource
  mediaId: string | null
  proposedBy: string
  proposedAt: string
  resolvedBy: string | null
  resolvedAt: string | null
}

export type TurnState = {
  conversationId: ConversationId
  asked: string[]
  escalated: boolean
  introduced: boolean
}
