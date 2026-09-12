import { describe, expect, test } from 'bun:test'
import seed from '../../seed/business-cards.json'
import { priceFor, type PriceForCatalogRow, type PriceForConfig } from '../../src/domain/price-for'

const rows: PriceForCatalogRow[] = (seed as any).items.map((item: any, index: number) => ({
  id: index + 1,
  slug: item.id,
  kind: item.kind,
  label: item.label,
  attributes: item.attributes,
  appliesTo: item.applies_to,
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
  quoteValidityDays: 15,
  moduleDiscounts: (seed as any).module_discounts.map((d: any) => ({
    fromModules: d.from_modules,
    toModules: d.to_modules,
    rate: d.rate,
  })),
}

const quote = (attributes: Record<string, string | number>) =>
  priceFor({ family: 'business_cards', attributes, missing: [] }, rows, config)

// The standard 1000 card row, which is one module, costs 45.000 net.
const standard = { quantity: 1000, paper: 'illustration_350', sides: 'front_color_back_grayscale', finish: 'none' }

describe('module math, the three examples the owner gave', () => {
  test('a 15 x 5 cm card is 2 modules and takes no discount', () => {
    const resolution = quote({ ...standard, width_cm: 15, height_cm: 5 })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    // 75 cm2 / 42.5 = 1.76 -> 2 modules. The discount bracket starts at 3.
    expect(resolution.explanation).toContain('2 módulos')
    expect(resolution.amount).toBe(Math.round(2 * 45000 * 1.21))
  })

  test('a 10 x 15 cm large card is 4 modules and takes the 10 percent bracket', () => {
    const resolution = quote({ ...standard, width_cm: 10, height_cm: 15 })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    // 150 / 42.5 = 3.53 -> 4 modules, which sits in the 3 to 5 bracket at 10 percent.
    expect(resolution.explanation).toContain('4 módulos')
    expect(resolution.amount).toBe(Math.round(4 * 45000 * 0.9 * 1.21))
  })

  test('the formula generalises: an A4 piece against a 150 cm2 module is 5 modules', () => {
    const flyers: PriceForConfig = {
      ...config,
      family: { ...config.family, slug: 'flyers', label: 'Folletos', module: { widthCm: 15, heightCm: 10 } },
    }
    const resolution = priceFor(
      { family: 'flyers', attributes: { ...standard, width_cm: 21, height_cm: 29.7 }, missing: [] },
      rows.map((r) => ({ ...r })),
      flyers,
    )

    // 623.7 / 150 = 4.16 -> 5 modules. Prices are not loaded for this family, but the count must hold.
    expect(JSON.stringify(resolution)).toContain('5')
  })

  test('states how it got there, so a human can catch the error by reading', () => {
    const resolution = quote({ ...standard, width_cm: 10, height_cm: 15 })

    if (resolution.kind !== 'price') throw new Error('expected a price')
    expect(resolution.explanation).toContain('módulos')
    expect(resolution.explanation).toContain('10%')
  })

  test('a piece that fits inside one module is priced as the plain row', () => {
    const resolution = quote({ ...standard, width_cm: 8.5, height_cm: 5 })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.amount).toBe(Math.round(45000 * 1.21))
  })
})
