import { z } from 'zod'
import seed from '../../seed/facts.json'
import type { Fact } from '../domain/facts'

/**
 * A stated fact carries the date it was confirmed, and a pending one carries no date because
 * there is nothing to date. Parsing it that way is the point: a value with no source is how a
 * sentence that merely sounds right becomes something Dante asserts, and that is what the bot
 * before this one was made of.
 *
 * The rows belong in the `facts` table, and the seed is what puts them there the day something
 * reads them back. Until then this is the same shape from the same file, so moving it is a
 * change of reader and not of data.
 */
const factSchema = z.union([
  z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    value: z.string().min(1),
    confirmed_on: z.iso.date(),
  }),
  z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    value: z.null(),
  }),
])

const seedSchema = z.object({ facts: z.array(factSchema).min(1) })

export const shopFacts: Fact[] = seedSchema.parse(seed).facts.map((fact) =>
  fact.value === null
    ? { key: fact.key, label: fact.label, value: null }
    : { key: fact.key, label: fact.label, value: fact.value, confirmedOn: fact.confirmed_on },
)
