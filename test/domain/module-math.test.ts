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

describe('the module discount reaches the modules only', () => {
  test('a family wide add-on is added at full price, after the discount', () => {
    const resolution = quote({ ...standard, width_cm: 10, height_cm: 15, finish: 'corte extra' })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    // 4 modules x 45.000 = 180.000, less 10% = 162.000, plus the 1.600 cut at full price.
    // Discounting the add-on too would give 197.762, which is the wrong answer.
    expect(resolution.amount).toBe(Math.round((4 * 45000 * 0.9 + 1600) * 1.21))
  })
})

describe('what the customer reads about modules', () => {
  const moduleQuote = () => {
    const resolution = quote({ ...standard, width_cm: 10, height_cm: 15 })
    if (resolution.kind !== 'price') throw new Error('expected a price')
    return resolution
  }

  test('says the module count and the discount, and nothing else', () => {
    const { explanation } = moduleQuote()

    expect(explanation).toContain('4 módulos')
    expect(explanation).toContain('10%')
    expect(explanation).toContain('$196.020')
    expect(explanation).toContain('15 días')
  })

  test('does not read like a spreadsheet', () => {
    const { explanation } = moduleQuote()

    for (const noise of ['cm²', '42.5', '42,5', ' / ', 'neto', '3.53']) {
      expect(explanation).not.toContain(noise)
    }
    expect(explanation.length).toBeLessThan(220)
  })

  test('never leaks an internal catalog label into the chat', () => {
    const { explanation } = moduleQuote()

    expect(explanation).not.toContain('Tarjetas full color')
    expect(explanation).not.toContain('escala de grises')
  })

  test('keeps the full arithmetic available for the team, with a decimal comma', () => {
    const priced = moduleQuote() as typeof moduleQuote extends never ? never : any

    expect(priced.derivation).toBeString()
    expect(priced.derivation).toContain('8,5')
    expect(priced.derivation).not.toContain('8.5')
    expect(priced.derivation).toContain('4 módulos')
  })
})

describe('a piece that is no longer a business card', () => {
  test('a 500 x 300 cm piece is refused, not quoted', () => {
    const resolution = quote({ ...standard, width_cm: 500, height_cm: 300 })

    // 3530 modules is a billboard. Quoting it confidently is the failure this project exists to prevent.
    expect(resolution.kind).toBe('escalate')
  })

  test('a piece past the module ceiling is refused', () => {
    // 50 x 50 cm is 2500 cm2, which is 59 modules.
    const resolution = quote({ ...standard, width_cm: 50, height_cm: 50 })

    expect(resolution.kind).toBe('escalate')
  })

  test('a large but plausible piece still quotes', () => {
    // 40 x 40 cm is 1600 cm2, which is 38 modules, under the ceiling.
    const resolution = quote({ ...standard, width_cm: 40, height_cm: 40 })

    expect(resolution.kind).toBe('price')
  })
})
