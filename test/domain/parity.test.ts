import { describe, expect, test } from 'bun:test'
import seed from '../../seed/business-cards.json'
import { priceFor, type PriceForCatalogRow, type PriceForConfig } from '../../src/domain/price-for'

const idFor = (slug: string) => {
  let hash = 0
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647
  return hash
}

const rows: PriceForCatalogRow[] = (seed as any).items.map((item: any) => ({
  id: idFor(item.id),
  slug: item.id,
  kind: item.kind,
  label: item.label,
  attributes: item.attributes,
  appliesTo: item.applies_to,
  appliesToFamily: item.applies_to_family,
  price: item.price,
}))

const family = (seed as any).family
const config: PriceForConfig = {
  family: {
    slug: family.slug,
    label: family.label,
    unit: family.unit,
    attributes: family.attributes,
    askOrder: family.ask_order,
    module: { widthCm: family.module.width_cm, heightCm: family.module.height_cm },
  },
  vatRate: (seed as any).vat_rate,
  quoteValidityDays: (seed as any).quote_validity_days,
  moduleDiscounts: (seed as any).module_discounts.map((d: any) => ({
    fromModules: d.from_modules,
    toModules: d.to_modules,
    rate: d.rate,
  })),
}

const quote = (attributes: Record<string, string | number>, overrides: Partial<PriceForConfig> = {}) =>
  priceFor({ family: 'business_cards', attributes, missing: [] }, rows, { ...config, ...overrides })

const exactRequest = { quantity: 1000, paper: 'illustration_350', sides: 'front_color_back_grayscale', finish: 'none' }
const moduleRequest = { ...exactRequest, width_cm: 10, height_cm: 15 }

// A quote comes back from one of two paths. Anything true of one must be true of the other,
// or a customer gets a different kind of answer depending on whether they named a size.
describe('the exact path and the module path answer the same way', () => {
  const bothPaths: [string, Record<string, string | number>][] = [
    ['exact row', exactRequest],
    ['module math', moduleRequest],
  ]

  for (const [name, request] of bothPaths) {
    test(`${name}: states the validity`, () => {
      const resolution = quote(request)
      if (resolution.kind !== 'price') throw new Error('expected a price')
      expect(resolution.explanation).toContain('15 días')
    })

    test(`${name}: the amount includes VAT`, () => {
      const resolution = quote(request)
      if (resolution.kind !== 'price') throw new Error('expected a price')
      expect(resolution.explanation).toContain('IVA incluido')
    })

    test(`${name}: names an add-on the customer is charged for`, () => {
      const resolution = quote({ ...request, add_on: 'corte extra' })
      if (resolution.kind !== 'price') throw new Error('expected a price')
      expect(resolution.explanation).toContain('Corte extra')
    })

    test(`${name}: keeps the arithmetic out of the chat`, () => {
      const resolution = quote(request)
      if (resolution.kind !== 'price') throw new Error('expected a price')
      for (const noise of ['cm²', 'neto', ' / ']) expect(resolution.explanation).not.toContain(noise)
    })

    test(`${name}: never leaks an internal catalog label`, () => {
      const resolution = quote(request)
      if (resolution.kind !== 'price') throw new Error('expected a price')
      expect(resolution.explanation).not.toContain('escala de grises')
    })
  }
})

// The engine reads customer words. Print shop vocabulary is full of words that contain the
// tokens the engine looks for, and a substring match turns a paper into a tax question.
describe('everyday print shop words are not read as questions', () => {
  const vocabulary = ['autoadhesiva', 'lámina adhesiva', 'tinta positiva', 'cartulina', 'adhesiva', 'reactiva']

  for (const word of vocabulary) {
    test(`"${word}" is a material, not a question about VAT`, () => {
      const resolution = quote({ quantity: 100, paper: word, sides: 'front', finish: 'none' })
      if (resolution.kind !== 'escalate') throw new Error('expected an escalation')
      expect(resolution.reason).not.toBe('vat_question')
    })
  }
})

// An optional field means the caller may omit it. Omitting it must degrade, never refuse.
describe('every optional config field degrades instead of refusing', () => {
  test('without the discount brackets, a module quote still prices', () => {
    const resolution = quote(moduleRequest, { moduleDiscounts: undefined })
    expect(resolution.kind).toBe('price')
  })

  test('without a module ceiling, a plausible piece still prices', () => {
    const resolution = quote(moduleRequest, { maxModules: undefined })
    expect(resolution.kind).toBe('price')
  })

  test('without a list discount policy, an exact quote still prices', () => {
    const resolution = quote(exactRequest, { listDiscountPolicy: undefined })
    expect(resolution.kind).toBe('price')
  })
})

// A size the extractor spells differently must never block a quote that already matched.
describe('a stray key never turns a match into a refusal', () => {
  const strayKeys = ['width', 'height', 'size', 'modules', 'module_count', 'medida', 'tamano']

  for (const key of strayKeys) {
    test(`an unexpected "${key}" does not refuse an exact row`, () => {
      const withStray = quote({ ...exactRequest, [key]: 15 })
      expect(withStray.kind).toBe('price')
    })
  }
})
