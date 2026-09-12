import { describe, expect, test } from 'bun:test'
import seed from '../../seed/business-cards.json'
import { priceFor, type PriceForCatalogRow, type PriceForConfig } from '../../src/domain/price-for'

// Ids come from the seed slug, never from array position: inserting a row must not
// repoint a stored quote. Raised in review on the PR.
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
const moduleDiscounts = (seed as any).module_discounts.map((d: any) => ({
  fromModules: d.from_modules,
  toModules: d.to_modules,
  rate: d.rate,
}))

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
  moduleDiscounts,
}

const quote = (attributes: Record<string, string | number>, overrides: Partial<PriceForConfig> = {}) =>
  priceFor({ family: 'business_cards', attributes, missing: [] }, rows, { ...config, ...overrides })

const standard = { quantity: 1000, paper: 'illustration_350', sides: 'front_color_back_grayscale', finish: 'none' }
const special100 = { quantity: 100, paper: 'special', sides: 'front', finish: 'none' }

describe('1. a catalog word that contains iva is not a VAT question', () => {
  test('autoadhesiva is a paper, not a question about tax policy', () => {
    const resolution = quote({ ...special100, paper: 'autoadhesiva' })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).not.toBe('vat_question')
  })

  test('an actual question about VAT still escalates as one', () => {
    const resolution = quote({ question: 'el iva es obligatorio?' })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('vat_question')
  })
})

describe('2. a module quote names what the customer is paying for', () => {
  test('an add-on on a module job is named, not silently charged', () => {
    const resolution = quote({ ...standard, width_cm: 10, height_cm: 15, add_on: 'corte extra' })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.amount).toBe(Math.round((4 * 45000 * 0.9 + 1600) * 1.21))
    expect(resolution.explanation).toContain('Corte extra')
  })
})

describe('3. a stray size key does not block a quote that already matched', () => {
  test('width and height without the cm suffix do not refuse an exact row', () => {
    const withStray = quote({ ...special100, width: 15, height: 5 })
    const withoutStray = quote(special100)

    expect(withoutStray.kind).toBe('price')
    expect(withStray.kind).toBe('price')
    if (withStray.kind !== 'price' || withoutStray.kind !== 'price') return
    expect(withStray.amount).toBe(withoutStray.amount)
  })
})

describe('4. an absent discount table means no discount, not a refusal', () => {
  test('a module quote without brackets prices at zero discount', () => {
    const resolution = quote({ ...standard, width_cm: 10, height_cm: 15 }, { moduleDiscounts: undefined })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.amount).toBe(Math.round(4 * 45000 * 1.21))
  })
})

describe('5. the module path applies list discounts like the exact path does', () => {
  test('with the flag on, a module job gets the list discount too', () => {
    const on = { listDiscountPolicy: { applyProvisionalIllustrationPlainDiscounts: true } }
    const base = { quantity: 100, paper: 'illustration_300', sides: 'front', finish: 'none' }
    const resolution = quote({ ...base, width_cm: 12, height_cm: 5 }, on)

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    // 60 cm2 / 42.5 = 1.41 -> 2 modules, no bracket. 2 x 10.300 = 20.600, less the 1.800 list discount.
    expect(resolution.amount).toBe(Math.round((2 * 10300 - 1800) * 1.21))
  })
})

describe('6. the add-on fix the PR led with, finally asserted', () => {
  test('a family wide add-on resolves, and to the row matching the quantity', () => {
    const resolution = quote({ ...special100, add_on: 'puntas redondeadas' })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    // Puntas redondeadas, 100 costs 2.200, not the 200 or 1000 row.
    expect(resolution.amount).toBe(Math.round((12100 + 2200) * 1.21))
  })

  test('diseño applies to the whole family', () => {
    const resolution = quote({ ...special100, add_on: 'diseño' })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.amount).toBe(Math.round((12100 + 20000) * 1.21))
  })
})

describe('7. every module discount bracket is exercised, not just the first', () => {
  const modulesFor = (widthCm: number, heightCm: number) =>
    quote({ ...standard, width_cm: widthCm, height_cm: heightCm })

  test('6 to 8 modules take 15 percent', () => {
    // 17 x 15 = 255 cm2 / 42.5 = 6 modules exactly.
    const resolution = modulesFor(17, 15)
    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.amount).toBe(Math.round(6 * 45000 * 0.85 * 1.21))
  })

  test('9 to 12 modules take 20 percent', () => {
    // 25.5 x 15 = 382.5 / 42.5 = 9 modules exactly.
    const resolution = modulesFor(25.5, 15)
    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.amount).toBe(Math.round(9 * 45000 * 0.8 * 1.21))
  })

  test('13 modules or more take 25 percent', () => {
    // 34 x 17 = 578 / 42.5 = 13.6 -> 14 modules.
    const resolution = modulesFor(34, 17)
    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.amount).toBe(Math.round(14 * 45000 * 0.75 * 1.21))
  })
})
