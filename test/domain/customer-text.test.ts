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
}

const quote = (attributes: Record<string, string | number>) =>
  priceFor({ family: 'business_cards', attributes, missing: [] }, rows, config)

const customerText = (resolution: ReturnType<typeof priceFor>) =>
  resolution.kind === 'price' ? resolution.explanation : resolution.detail

describe('what the customer reads', () => {
  test('never exposes an English attribute name', () => {
    const resolution = quote({ quantity: 1000 })
    const text = customerText(resolution)

    for (const identifier of ['paper', 'sides', 'finish', 'quantity']) {
      expect(text).not.toContain(identifier)
    }
  })

  test('asks for the two sided attribute using the printing word, caras', () => {
    const text = customerText(quote({ quantity: 1000 }))

    expect(text).toContain('caras')
    expect(text).not.toContain('lados')
  })

  test('writes Spanish with its accents', () => {
    const text = customerText(quote({ quantity: 100, paper: 'special', sides: 'front', finish: 'none' }))

    expect(text).toContain('cotización')
    expect(text).toContain('válida')
    expect(text).toContain('días')
    expect(text).not.toContain('cotizacion')
    expect(text).not.toContain('valida')
    expect(text).not.toContain('dias')
  })

  test('adds an add-on with an accented más', () => {
    const text = customerText(quote({ quantity: 100, paper: 'special', sides: 'front', finish: 'lamination' }))

    expect(text).toContain('más')
    expect(text).not.toMatch(/\bmas\b/)
  })

  test('names the missing attributes in Spanish, in the order the family declares', () => {
    const text = customerText(quote({ quantity: 1000 }))

    expect(text.indexOf('papel')).toBeLessThan(text.indexOf('caras'))
    expect(text.indexOf('caras')).toBeLessThan(text.indexOf('terminación'))
  })
})
