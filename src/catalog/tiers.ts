import { z } from 'zod'

export const ITEM_TIERS = ['sale', 'add_on', 'discount'] as const
export const itemTierSchema = z.enum(ITEM_TIERS)
export type ItemTier = z.infer<typeof itemTierSchema>
