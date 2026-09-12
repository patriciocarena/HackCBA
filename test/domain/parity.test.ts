import { describe, expect, test } from 'bun:test'
import { baseConfig, businessCards, catalogRows } from '../../src/catalog/business-cards'
import { totalOf } from '../../src/domain/breakdown'
import { priceFor, type PriceForConfig } from '../../src/domain/price-for'
import { quoteText } from '../../src/domain/quote-text'
import { quoteIntentSchema, type QuoteIntent, type Resolution } from '../../src/domain/types'
import { intent, OFFSET_1000 } from '../support/fixtures'

const quote = (overrides: Partial<QuoteIntent>, config: Partial<PriceForConfig> = {}): Resolution =>
  priceFor(intent({ attributes: OFFSET_1000, ...overrides }), catalogRows, { ...baseConfig, ...config })

const schema = quoteIntentSchema(businessCards)

function textOf(overrides: Partial<QuoteIntent>): string {
  const resolution = quote(overrides)
  if (resolution.kind !== 'price') throw new Error('expected a price')
  return quoteText(resolution.breakdown, resolution.validityDays)
}

// A quote comes back from one of two paths. Anything true of one must be true of the other,
// or a customer gets a different kind of answer depending on whether they named a size.
describe('the exact path and the module path answer the same way', () => {
  const bothPaths: [string, Partial<QuoteIntent>][] = [
    ['exact row', {}],
    ['module math', { size: { widthCm: 10, heightCm: 15 } }],
  ]

  for (const [name, request] of bothPaths) {
    test(`${name}: states the validity`, () => {
      expect(textOf(request)).toContain('15 días')
    })

    test(`${name}: the amount includes VAT`, () => {
      expect(textOf(request)).toContain('IVA incluido')
    })

    test(`${name}: names an add-on the customer is charged for`, () => {
      expect(textOf({ ...request, addOns: ['extra_cut'] })).toContain('Corte extra')
    })

    test(`${name}: charges every add-on the customer named, not one of them`, () => {
      const one = quote({ ...request, addOns: ['extra_cut'] })
      const two = quote({ ...request, addOns: ['extra_cut', 'design'] })

      if (one.kind !== 'price' || two.kind !== 'price') throw new Error('expected prices')
      expect(two.breakdown.addOns).toHaveLength(2)
      expect(totalOf(two.breakdown)).toBeGreaterThan(totalOf(one.breakdown))
    })

    test(`${name}: keeps the arithmetic out of the chat`, () => {
      for (const noise of ['cm²', 'neto', ' / ']) expect(textOf(request)).not.toContain(noise)
    })

    test(`${name}: never leaks an internal catalog label`, () => {
      expect(textOf(request)).not.toContain('escala de grises')
    })

    test(`${name}: every breakdown line names the row the owner typed`, () => {
      const resolution = quote({ ...request, addOns: ['extra_cut'] })

      if (resolution.kind !== 'price') throw new Error('expected a price')
      const slugs = [resolution.breakdown.base, ...resolution.breakdown.addOns].map((line) => line.slug)
      for (const slug of slugs) expect(catalogRows.some((row) => row.slug === slug)).toBe(true)
    })
  }

  test('a size of exactly one module gives the exact row amount', () => {
    const exact = quote({})
    const sized = quote({ size: { widthCm: 8.5, heightCm: 5 } })

    if (exact.kind !== 'price' || sized.kind !== 'price') throw new Error('expected prices')
    expect(totalOf(sized.breakdown)).toBe(totalOf(exact.breakdown))
  })
})

// The engine used to read customer words. Print shop vocabulary is full of words carrying the
// tokens it looked for, and a substring match turned a paper into a tax question. Extraction
// now parses against the catalog, so a word the list does not carry never becomes an attribute.
describe('everyday print shop words are not read as questions', () => {
  const vocabulary = ['autoadhesiva', 'lámina adhesiva', 'tinta positiva', 'cartulina', 'adhesiva', 'reactiva']

  for (const word of vocabulary) {
    test(`"${word}" is a material, not a question about VAT`, () => {
      const resolution = quote({ attributes: { ...OFFSET_1000, paper: word } })

      if (resolution.kind !== 'escalate') throw new Error('expected an escalation')
      expect(resolution.reason).not.toBe('vat_question')
    })

    test(`"${word}" never reaches the engine as a paper at all`, () => {
      expect(() =>
        schema.parse({ ...intent({ attributes: { ...OFFSET_1000, paper: word } }) }),
      ).toThrow()
    })
  }
})

// An optional field means the caller may omit it. Omitting it must degrade, never refuse.
describe('every optional config field degrades instead of refusing', () => {
  const moduleRequest = { size: { widthCm: 10, heightCm: 15 } }

  test('without the discount brackets, a module quote still prices', () => {
    expect(quote(moduleRequest, { moduleDiscounts: undefined }).kind).toBe('price')
  })

  test('without a module ceiling, a plausible piece still prices', () => {
    expect(quote(moduleRequest, { maxModules: undefined }).kind).toBe('price')
  })

  test('without a list discount policy, an exact quote still prices', () => {
    expect(quote({}, { listDiscountPolicy: undefined }).kind).toBe('price')
  })
})

// A key the family does not declare is refused where it arrives, not worked around in the
// engine. The engine used to read `modules` and `module_count` as a size request, so a stray
// one repriced an exact match eleven times over.
describe('a key the family does not declare never reaches a quote', () => {
  const strayKeys = ['width', 'height', 'size', 'modules', 'module_count', 'medida', 'tamaño']

  for (const key of strayKeys) {
    test(`an unexpected "${key}" fails to parse`, () => {
      expect(() =>
        schema.parse({ ...intent({ attributes: { ...OFFSET_1000, [key]: 15 } }) }),
      ).toThrow()
    })
  }

  test('the size the family does declare parses, and it is not an attribute', () => {
    const parsed = schema.parse(intent({ attributes: OFFSET_1000, size: { widthCm: 10, heightCm: 15 } }))

    expect(parsed.size).toEqual({ widthCm: 10, heightCm: 15 })
    expect(parsed.attributes).not.toHaveProperty('width_cm')
  })
})
