import { describe, expect, test } from 'bun:test'
import { EXTRACTION_REASONS, extractionSchema } from '@/conversation/prompt'
import { businessCards } from '@test/support/catalog'

type Property = { type: string[]; enum: (string | number | null)[] }
type Schema = {
  properties: {
    family: Property
    attributes: { properties: Record<string, Property>; required: string[]; additionalProperties: false }
    addOns: { items: { enum: string[] } }
  }
  additionalProperties: false
}

const schema = extractionSchema(businessCards) as unknown as Schema

describe('the extraction schema is built from the loaded catalog', () => {
  test('an attribute no family declares cannot be answered at all', () => {
    expect(Object.keys(schema.properties.attributes.properties)).toEqual(
      businessCards.attributes.map((attribute) => attribute.name),
    )
    expect(schema.properties.attributes.additionalProperties).toBe(false)
    expect(schema.additionalProperties).toBe(false)
  })

  test('an attribute carries exactly the values the loaded rows carry, and null', () => {
    const quantity = schema.properties.attributes.properties.quantity
    const paper = schema.properties.attributes.properties.paper

    expect(quantity.type).toEqual(['number', 'null'])
    expect(quantity.enum).toEqual([...businessCards.attributes.find((a) => a.name === 'quantity')!.values, null])
    expect(paper.type).toEqual(['string', 'null'])
    expect(paper.enum).toContain('illustration_350')
    expect(paper.enum).not.toContain('papiro')
  })

  test('no family but the one loaded can be named', () => {
    expect(schema.properties.family.enum).toEqual([businessCards.slug, null])
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
  const offered = (extractionSchema(businessCards) as unknown as { properties: { reason: { enum: (string | null)[] } } })
    .properties.reason.enum

  test('are the four a reader of the message can see, and null', () => {
    expect(offered).toEqual([...EXTRACTION_REASONS, null])
  })

  test('never include one the engine already produces for itself', () => {
    for (const engines of ['out_of_catalog', 'no_match', 'ambiguous', 'unsupported_quantity', 'unknown_fact']) {
      expect(offered).not.toContain(engines)
    }
  })
})
