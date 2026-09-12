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

const quote = (attributes: Record<string, string | number>, withRows: PriceForCatalogRow[] = rows) =>
  priceFor({ family: 'business_cards', attributes, missing: [] }, withRows, config)

const standard = { quantity: 1000, paper: 'illustration_350', sides: 'front_color_back_grayscale', finish: 'none' }
const cloneOf = (slug: string, overrides: Partial<PriceForCatalogRow> = {}) => {
  const original = rows.find((row) => row.slug === slug)!
  return { ...original, id: original.id + 1000, slug: `${original.slug}_dup`, ...overrides }
}

describe('the engine never picks between two rows', () => {
  test('two sale rows matching the same request escalate as ambiguous', () => {
    const resolution = quote(standard, [...rows, cloneOf('bc_offset_1000_4_1', { price: 99_999 })])

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('ambiguous')
  })

  test('the module path refuses an ambiguous base row too', () => {
    const resolution = quote(
      { ...standard, width_cm: 10, height_cm: 15 },
      [...rows, cloneOf('bc_offset_1000_4_1', { price: 99_999 })],
    )

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('ambiguous')
  })

  test('two add-ons matching the same request escalate as ambiguous', () => {
    const base = { quantity: 100, paper: 'special', sides: 'front', finish: 'lamination' }
    const resolution = quote(base, [
      ...rows,
      cloneOf('bc_addon_lamination_special_100_front', { price: 99_999 }),
    ])

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('ambiguous')
  })

  test('an ambiguous answer never carries a price', () => {
    const resolution = quote(standard, [...rows, cloneOf('bc_offset_1000_4_1', { price: 1 })])

    expect(JSON.stringify(resolution)).not.toContain('amount')
  })
})
