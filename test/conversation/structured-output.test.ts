import { describe, expect, test } from 'bun:test'
import { arrayTypedPaths } from '@/conversation/structured-output'
import { extractionSchema } from '@/conversation/prompt'
import { PRICE_EDIT_SCHEMA } from '@/voice/price-edit-intent'
import { businessCards } from '@/catalog/business-cards'

describe('a schema OpenRouter will honour', () => {
  test('the customer schema writes no type as an array', () => {
    expect(arrayTypedPaths(extractionSchema(businessCards))).toEqual([])
  })

  test('the price edit schema writes no type as an array', () => {
    expect(arrayTypedPaths(PRICE_EDIT_SCHEMA)).toEqual([])
  })

  test('the walk names every offender by path, so a reintroduction says where', () => {
    const schema = {
      type: 'object',
      properties: {
        factKey: { type: ['string', 'null'] },
        attributes: { type: 'object', properties: { quantity: { type: ['number', 'null'] } } },
        addOns: { type: 'array', items: { type: ['string', 'null'] } },
      },
    }

    expect(arrayTypedPaths(schema)).toEqual([
      'properties.factKey.type',
      'properties.attributes.properties.quantity.type',
      'properties.addOns.items.type',
    ])
  })
})
