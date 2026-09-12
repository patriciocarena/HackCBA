import { describe, expect, test } from 'bun:test'
import { EXTRACTION_REASONS, extractionSchema, INTRODUCTION, WRITING_SYSTEM } from '@/conversation/prompt'
import { businessCards } from '@/catalog/business-cards'

type Arm = { type: string; enum?: (string | number)[] }
type Nullable = { anyOf: [Arm, { type: 'null' }] }
type Schema = {
  properties: {
    family: Nullable
    attributes: { properties: Record<string, Nullable>; required: string[]; additionalProperties: false }
    addOns: { items: { enum: string[] } }
    factKey: Nullable
    reason: Nullable
  }
  additionalProperties: false
}

const schema = extractionSchema(businessCards) as unknown as Schema

/**
 * Every nullable property is read through its arms. Writing the type as `['string', 'null']`
 * is what made OpenRouter drop the constraint, so these tests reach the values the way the
 * honoured shape holds them. That the shape itself is honoured is pinned in
 * `structured-output.test.ts`; this file is about what the values are.
 */
function stated(property: Nullable): Arm {
  return property.anyOf[0]
}

function unanswerable(property: Nullable): boolean {
  return property.anyOf.some((option) => option.type === 'null')
}

describe('the extraction schema is built from the loaded catalog', () => {
  test('an attribute no family declares cannot be answered at all', () => {
    expect(Object.keys(schema.properties.attributes.properties)).toEqual(
      businessCards.attributes.map((attribute) => attribute.name),
    )
    expect(schema.properties.attributes.additionalProperties).toBe(false)
    expect(schema.additionalProperties).toBe(false)
  })

  test('an attribute carries exactly the values the loaded rows carry, and may be left unsaid', () => {
    const quantity = schema.properties.attributes.properties.quantity
    const paper = schema.properties.attributes.properties.paper

    expect(stated(quantity).type).toBe('number')
    expect(stated(quantity).enum).toEqual(
      businessCards.attributes.find((a) => a.name === 'quantity')!.values,
    )
    expect(unanswerable(quantity)).toBe(true)
    expect(stated(paper).type).toBe('string')
    expect(stated(paper).enum).toContain('illustration_350')
    expect(stated(paper).enum).not.toContain('papiro')
    expect(unanswerable(paper)).toBe(true)
  })

  test('no family but the one loaded can be named', () => {
    expect(stated(schema.properties.family).enum).toEqual([businessCards.slug])
    expect(unanswerable(schema.properties.family)).toBe(true)
  })

  test('an add-on is offered by its group, which is what a customer names', () => {
    expect(schema.properties.addOns.items.enum).toEqual(businessCards.addOns)
    expect(schema.properties.addOns.items.enum).toContain('lamination')
  })

  test('every field is required, so a silent omission is not an answer', () => {
    expect(schema.properties.attributes.required).toEqual(businessCards.attributes.map((a) => a.name))
  })
})

describe('the reasons the schema lets extraction raise', () => {
  const offered = stated(schema.properties.reason).enum

  test('are the four a reader of the message can see, and no reason at all is allowed', () => {
    expect(offered).toEqual([...EXTRACTION_REASONS])
    expect(unanswerable(schema.properties.reason)).toBe(true)
  })

  test('never include one the engine already produces for itself', () => {
    for (const engines of ['out_of_catalog', 'no_match', 'ambiguous', 'unsupported_quantity', 'unknown_fact']) {
      expect(offered).not.toContain(engines)
    }
  })
})

/**
 * The shop has a name and Dante says it. What he may never drop is the disclosure: README
 * rule 7 is that he introduces himself as automated and never pretends to be a person, and
 * "agente" on its own reads in Spanish as a salesperson.
 */
describe('Dante names the shop he works for', () => {
  test('the writing system names Multimpresos', () => {
    expect(WRITING_SYSTEM).toContain('Multimpresos')
    expect(INTRODUCTION).toContain('Multimpresos')
  })

  test('he is still automated in both, because "agente" alone reads as a person', () => {
    expect(WRITING_SYSTEM).toContain('automático')
    expect(INTRODUCTION).toContain('automático')
  })
})

/**
 * The same rule ADR 0005 draws for an attribute, drawn for a fact key. It was the one free
 * string in a schema where everything else is an enum, and a free string means extraction
 * guesses the word: "hours" one run, "horario" the next, and the lookup misses a fact that is
 * loaded. A key the shop did not load is now a key extraction cannot name.
 */
describe('the fact keys the schema lets extraction name', () => {
  test('offers exactly the keys the shop loaded', () => {
    const offered = extractionSchema(businessCards, ['hours', 'address']) as unknown as Schema

    expect(stated(offered.properties.factKey).enum).toEqual(['hours', 'address'])
  })

  test('stays answerable with null, because not every message asks about the shop', () => {
    const offered = extractionSchema(businessCards, ['hours']) as unknown as Schema

    expect(unanswerable(offered.properties.factKey)).toBe(true)
  })

  // An empty enum is not a schema OpenRouter can honour, and a shop with no facts loaded still
  // has to be able to extract a quote. It falls back to the open string, which escalates
  // anyway because no key can be found.
  test('offers an open string when nothing is loaded at all', () => {
    const offered = extractionSchema(businessCards, []) as unknown as Schema

    expect(stated(offered.properties.factKey).enum).toBeUndefined()
    expect(stated(offered.properties.factKey).type).toBe('string')
  })
})
