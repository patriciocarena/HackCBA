import { describe, expect, spyOn, test } from 'bun:test'
import { arrayTypedPaths, SchemaDropped, structuredJson } from '@/conversation/structured-output'
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

describe('a response that lost its schema', () => {
  const prose = '**Claro!** Entiendo que querés:\n\n- Subir un 20%\n- Las tarjetas personales\n\n```json\n{}\n```'

  test('throws rather than parsing, because prose is not a smaller answer', () => {
    expect(() => structuredJson(prose, { port: 'price edit extraction', model: 'anthropic/claude-sonnet-5' })).toThrow(
      SchemaDropped,
    )
  })

  test('names the port, the model and the cause, so the reason does not need a reader', () => {
    try {
      structuredJson(prose, { port: 'price edit extraction', model: 'anthropic/claude-sonnet-5' })
      throw new Error('it did not throw')
    } catch (error) {
      const message = (error as Error).message

      expect(message).toContain('price edit extraction')
      expect(message).toContain('anthropic/claude-sonnet-5')
      expect(message).toContain('lost its schema')
      expect(message).toContain('anyOf')
      expect(message).toContain('**Claro!**')
    }
  })

  test('carries the prose it was handed, clipped, so a log line stays a log line', () => {
    const long = 'x'.repeat(5000)

    expect(
      (() => {
        try {
          structuredJson(long, { port: 'extraction', model: 'm' })
        } catch (error) {
          return (error as Error).message.length
        }
      })(),
    ).toBeLessThan(700)
  })

  test('a 200 carrying real JSON is returned untouched', () => {
    expect(structuredJson('{"kind":"edit","value":20}', { port: 'extraction', model: 'm' })).toEqual({
      kind: 'edit',
      value: 20,
    })
  })
})

describe('the operator hears about it even when the caller does not', () => {
  test('it is logged where it is raised, because turn.ts catches every resolve failure', () => {
    const logged = spyOn(console, 'error').mockImplementation(() => {})

    try {
      expect(() => structuredJson('**hola**', { port: 'customer extraction', model: 'm' })).toThrow(SchemaDropped)
      expect(logged).toHaveBeenCalledTimes(1)
      expect(String(logged.mock.calls[0]?.[0])).toContain('customer extraction lost its schema')
    } finally {
      logged.mockRestore()
    }
  })
})
