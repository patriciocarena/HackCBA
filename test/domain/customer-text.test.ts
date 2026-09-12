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

  test('names an add-on the customer asked for, without the arithmetic', () => {
    const resolution = quote({ quantity: 100, paper: 'special', sides: 'front', finish: 'lamination' })
    if (resolution.kind !== 'price') throw new Error('expected a price')

    expect(resolution.explanation).toContain('Incluye Laminado')
    expect(resolution.explanation).not.toContain('$5.100')
    expect(resolution.derivation).toContain('más $5.100 por Laminado')
  })

  test('names the missing attributes in Spanish, in the order the family declares', () => {
    const text = customerText(quote({ quantity: 1000 }))

    expect(text.indexOf('papel')).toBeLessThan(text.indexOf('caras'))
    expect(text.indexOf('caras')).toBeLessThan(text.indexOf('terminación'))
  })
})

describe('a plain quote reads like a person too', () => {
  const plain = () => {
    const resolution = quote({ quantity: 1000, paper: 'illustration_350', sides: 'front_color_back_grayscale', finish: 'none' })
    if (resolution.kind !== 'price') throw new Error('expected a price')
    return resolution
  }

  test('never shows the internal catalog label', () => {
    const { explanation } = plain()

    expect(explanation).not.toContain('Tarjetas full color')
    expect(explanation).not.toContain('escala de grises')
  })

  test('states the amount and the validity, and stays short', () => {
    const { explanation } = plain()

    expect(explanation).toContain('$54.450')
    expect(explanation).toContain('15 días')
    expect(explanation).not.toContain('redondeo al peso')
    expect(explanation.length).toBeLessThan(140)
  })

  test('keeps the arithmetic for the team', () => {
    expect(plain().derivation).toBeString()
  })
})
